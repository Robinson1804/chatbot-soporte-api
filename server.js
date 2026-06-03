require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { generateAnexo01, generateAnexo02, generateAnexo03, generateAnexo04, generateAnexo07 } = require('./generators');
const { crearTicketSSI } = require('./ssi-automation');
const { chatLimiter, generateLimiter, ticketLimiter } = require('./middleware/rateLimiter');
const internalOnly = require('./middleware/internalOnly');
const cookieParser = require('cookie-parser');
const sessionMiddleware = require('./middleware/session');
const { getSessionMessages, saveMessage, saveEvent, cleanupOldSessions } = require('./db/queries');
const { initCache, getCachedContent } = require('./cache/geminiCache');
const toolDeclarations = require('./tools/definitions');
const toolHandlers     = require('./tools/handlers');
const { getAllMetrics } = require('./db/metrics-queries');
const horarioLaboral = require('./middleware/horarioLaboral');

const app = express();
const PORT = process.env.PORT || 3000;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const SYSTEM_PROMPT = fs.readFileSync(
  path.join(__dirname, 'prompts', 'system-prompt.md'),
  'utf8'
);

app.use(cors({ origin: process.env.ALLOWED_ORIGIN || true }));
app.use(cookieParser());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/api/chat', chatLimiter, horarioLaboral, sessionMiddleware, async (req, res) => {
  const { message } = req.body;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'El campo "message" es requerido.' });
  }

  if (message.length > 4000) {
    return res.status(400).json({ error: 'El mensaje no puede superar los 4000 caracteres.' });
  }

  const reqStart = Date.now();

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const dbHistory = await getSessionMessages(req.sessionId);
  const geminiHistory = dbHistory.map(({ role, content }) => ({
    role: role === 'assistant' ? 'model' : 'user',
    parts: [{ text: content }],
  }));

  try {
    const activeCachedContent = getCachedContent();
    let model;

    if (activeCachedContent) {
      model = genAI.getGenerativeModelFromCachedContent(activeCachedContent);
    } else {
      model = genAI.getGenerativeModel({
        model: 'models/gemini-2.5-flash',
        systemInstruction: SYSTEM_PROMPT,
        tools: [{ functionDeclarations: toolDeclarations }],
        toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
      });
    }

    await saveMessage(req.sessionId, 'user', message);

    const chat = model.startChat({ history: geminiHistory });
    const result = await chat.sendMessageStream(message);

    let fullText = '';
    const pendingToolCalls = [];

    for await (const chunk of result.stream) {
      const parts = chunk.candidates?.[0]?.content?.parts || [];
      for (const part of parts) {
        if (part.text) {
          fullText += part.text;
          res.write(`data: ${JSON.stringify({ delta: part.text })}\n\n`);
        }
        if (part.functionCall) {
          pendingToolCalls.push(part.functionCall);
        }
      }
    }

    if (fullText) {
      await saveMessage(req.sessionId, 'assistant', fullText);
    }

    const esEscalamiento = /escalar|soporte.{1,20}presencial|conectar.{1,20}técnico|llamar INMEDIATAMENTE/i.test(fullText);
    if (esEscalamiento) {
      await saveEvent(req.sessionId, 'escalamiento', { trigger: 'auto_detect' }).catch(() => {});
    }

    const latencyMs = Date.now() - reqStart;
    console.log(`[chat] latencia=${latencyMs}ms session=${req.sessionId?.substring(0, 8)}`);
    await saveEvent(req.sessionId, 'chat_latencia', { ms: latencyMs }).catch(() => {});

    // Ejecutar tool calls y emitir action events al cliente
    for (const toolCall of pendingToolCalls) {
      const { name, args } = toolCall;
      const handler = toolHandlers[name];
      if (!handler) continue;

      const payload = name === 'create_ssi_ticket'
        ? await handler(args, req.sessionId)
        : await handler(args);

      if (name === 'generate_document' && payload.ok) {
        await saveEvent(req.sessionId, 'documento_generado', { tipo: args.tipo });
      }
      if (name === 'set_urgency') {
        await saveEvent(req.sessionId, 'urgencia_asignada', { nivel: args.nivel });
      }

      res.write(`data: ${JSON.stringify({ action: name, payload })}\n\n`);
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    console.error('Error Gemini API:', err.message);
    res.write(`data: ${JSON.stringify({ error: 'Ocurrió un error al procesar su solicitud. Por favor intente nuevamente.' })}\n\n`);
    res.end();
  }
});

app.post('/api/reset', (req, res) => {
  res.clearCookie('otin_session');
  res.json({ ok: true });
});

app.post('/api/generate', generateLimiter, async (req, res) => {
  const { tipo, datos } = req.body;

  if (!tipo || !datos) {
    return res.status(400).json({ error: 'Se requiere tipo y datos.' });
  }

  const REQUIRED = {
    ANEXO01: ['nombres', 'cargo', 'direccion', 'sede', 'tipoAcceso'],
    ANEXO02: ['nombres', 'cargo', 'direccion', 'sede', 'tipoSolicitud'],
    ANEXO03: ['area', 'jefeArea', 'usuarioSolicitante', 'proposito'],
    ANEXO04: ['nombres', 'cargo', 'recurso', 'justificacion'],
    ANEXO07: ['areaOrigen', 'areaDestino', 'descripcion'],
  };

  const missing = (REQUIRED[tipo] || []).filter(f => !datos[f]);
  if (missing.length) {
    return res.status(400).json({ error: `Campos requeridos faltantes para ${tipo}: ${missing.join(', ')}` });
  }

  try {
    const safeName = (datos.nombres || datos.area || 'usuario').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '').substring(0, 30);
    let docBuffer;
    let filename;

    if (tipo === 'ANEXO01') {
      docBuffer = await generateAnexo01(datos);
      filename = `ANEXO01_${safeName}.docx`;
    } else if (tipo === 'ANEXO02') {
      docBuffer = await generateAnexo02(datos);
      filename = `ANEXO02_${safeName}.docx`;
    } else if (tipo === 'ANEXO03') {
      docBuffer = await generateAnexo03(datos);
      filename = `ANEXO03_${safeName}.docx`;
    } else if (tipo === 'ANEXO04') {
      docBuffer = await generateAnexo04(datos);
      filename = `ANEXO04_${safeName}.docx`;
    } else if (tipo === 'ANEXO07') {
      docBuffer = await generateAnexo07(datos);
      filename = `ANEXO07_${safeName}.docx`;
    } else {
      return res.status(400).json({ error: `Tipo de documento no soportado: ${tipo}` });
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', docBuffer.length);
    res.send(docBuffer);
  } catch (err) {
    console.error('Error generando documento:', err.message);
    res.status(500).json({ error: 'No se pudo generar el documento. Por favor intente nuevamente.' });
  }
});

app.get('/api/template/:tipo', async (req, res) => {
  const { tipo } = req.params;

  // PROD02 y F01 se sirven directo desde Anexos/
  if (tipo === 'PROD02') {
    const filePath = path.join(__dirname, 'Anexos', 'PROD02_INEI_FORMATO_SOLICITUD_PERMISOS.docx');
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Formato PROD-02 no disponible.' });
    res.setHeader('Content-Disposition', 'attachment; filename="PROD02_Solicitud_Permisos_BD_INEI.docx"');
    return res.sendFile(filePath);
  }
  if (tipo === 'F01') {
    const filePath = path.join(__dirname, 'Anexos', 'Formato de Altas y Bajas propuesto V2.xlsx');
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Formato F-01 no disponible.' });
    res.setHeader('Content-Disposition', 'attachment; filename="Formato_F01_Altas_Bajas_INEI.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return res.sendFile(filePath);
  }

  // ANEXO07 no tiene template estático — se genera desde el constructor
  if (tipo === 'ANEXO07') {
    try {
      const buffer = await generateAnexo07({});
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', 'attachment; filename="ANEXO07_Transferencia_Info_INEI.docx"');
      res.setHeader('Content-Length', buffer.length);
      return res.send(buffer);
    } catch (err) {
      return res.status(500).json({ error: 'No se pudo generar la plantilla ANEXO07.' });
    }
  }

  const allowed = ['ANEXO01', 'ANEXO02', 'ANEXO03', 'ANEXO04'];
  if (!allowed.includes(tipo)) {
    return res.status(404).json({ error: 'Tipo no válido.' });
  }
  const templatePath = path.join(__dirname, 'templates', `${tipo}_template.docx`);
  if (!fs.existsSync(templatePath)) {
    return res.status(404).json({ error: `Plantilla ${tipo} no disponible.` });
  }

  // Entregar plantilla limpia: reemplazar todos los {placeholders} con vacÃ­o
  // para que el usuario vea el formulario sin texto de variables
  try {
    const PizZip = require('pizzip');
    const Docxtemplater = require('docxtemplater');
    const content = fs.readFileSync(templatePath, 'binary');
    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      nullGetter: () => '',
    });
    doc.render({});
    const buffer = doc.getZip().generate({ type: 'nodebuffer' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${tipo}_plantilla_INEI.docx"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (err) {
    console.error('[template] docxtemplater fallback:', err.message);
    // Fallback: servir el archivo crudo si docxtemplater falla
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${tipo}_plantilla_INEI.docx"`);
    res.sendFile(templatePath);
  }
});

// Descarga directa de PROD-02 (Solicitud permisos base de datos)
app.get('/api/formatos/prod02', (req, res) => {
  const filePath = path.join(__dirname, 'Anexos', 'PROD02_INEI_FORMATO_SOLICITUD_PERMISOS.docx');
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Formato PROD-02 no disponible.' });
  res.setHeader('Content-Disposition', 'attachment; filename="PROD02_Solicitud_Permisos_BD_INEI.docx"');
  res.sendFile(filePath);
});

// Descarga directa de Formato F-01 (Altas y Bajas)
app.get('/api/formatos/f01', (req, res) => {
  const filePath = path.join(__dirname, 'Anexos', 'Formato de Altas y Bajas propuesto V2.xlsx');
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Formato F-01 no disponible.' });
  res.setHeader('Content-Disposition', 'attachment; filename="Formato_F01_Altas_Bajas_INEI.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.sendFile(filePath);
});

app.post('/api/ticket-ssi', internalOnly, ticketLimiter, async (req, res) => {
  const { titulo, descripcion, categoria, sede, categoriaId, sedeId } = req.body;

  if (!titulo || !descripcion) {
    return res.status(400).json({ error: 'Se requieren titulo y descripcion.' });
  }

  try {
    const resultado = await crearTicketSSI({ titulo, descripcion, categoria, categoriaId, sede, sedeId });
    res.json(resultado);
  } catch (err) {
    console.error('Error SSI automation:', err.message);
    res.status(500).json({ error: err.message || 'No se pudo crear el ticket en el SSI.' });
  }
});

app.get('/admin', internalOnly, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/api/metrics', internalOnly, async (req, res) => {
  try {
    const data = await getAllMetrics();
    res.setHeader('Cache-Control', 'no-store');
    res.json(data);
  } catch (err) {
    console.error('Error /api/metrics:', err.message);
    res.status(500).json({ error: 'metrics_unavailable' });
  }
});

async function startServer() {
  try {
    await initCache(process.env.GEMINI_API_KEY, SYSTEM_PROMPT, toolDeclarations);
  } catch (err) {
    console.warn('Context Cache no disponible, usando systemInstruction directo:', err.message);
  }
  app.listen(PORT, () => {
    console.log(`Servidor OTIN Chatbot corriendo en http://localhost:${PORT}`);
  });

  const runCleanup = async () => {
    try {
      const deleted = await cleanupOldSessions(90);
      if (deleted > 0) console.log(`[cleanup] ${deleted} sesiones antiguas eliminadas`);
    } catch (e) { console.warn('[cleanup] error:', e.message); }
  };
  runCleanup();
  setInterval(runCleanup, 24 * 60 * 60 * 1000);
}

startServer();
