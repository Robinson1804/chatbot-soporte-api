require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const {
  generateAnexo01,
  generateAnexo02,
  generateAnexo03,
  generateAnexo04,
  generateAnexo07,
} = require('./generators');

const { crearTicketSSI } = require('./ssi-automation');
const { chatLimiter, generateLimiter, ticketLimiter } = require('./middleware/rateLimiter');
const internalOnly = require('./middleware/internalOnly');
const cookieParser = require('cookie-parser');
const sessionMiddleware = require('./middleware/session');

const {
  getSessionMessages,
  saveMessage,
  saveEvent,
  cleanupOldSessions,
  deleteSessionMessages,
} = require('./db/queries');

const { initCache, getCachedContent } = require('./cache/geminiCache');
const toolDeclarations = require('./tools/definitions');
const toolHandlers = require('./tools/handlers');
const { getAllMetrics } = require('./db/metrics-queries');
const horarioLaboral = require('./middleware/horarioLaboral');

const app = express();
const PORT = process.env.PORT || 3000;

// Railway / reverse proxy: necesario para rate limiting correcto.
app.set('trust proxy', 1);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const SYSTEM_PROMPT = fs.readFileSync(
  path.join(__dirname, 'prompts', 'system-prompt.md'),
  'utf8'
);

app.use(cors({ origin: process.env.ALLOWED_ORIGIN || true }));
app.use(cookieParser());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ─────────────────────────────────────────────────────────────────────────────
// Helpers generales
// ─────────────────────────────────────────────────────────────────────────────

function clean(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function normalizeKey(value) {
  return clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function safeFilenamePart(value, fallback = 'usuario') {
  return (clean(value) || fallback)
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_\-]/g, '')
    .substring(0, 50);
}

function hasValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  return clean(value) !== '';
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (hasValue(value)) return value;
  }
  return '';
}

function getModalidad(datos = {}, fallback = 'individual') {
  const raw = firstNonEmpty(
    datos.modalidad,
    datos.tipoFormato,
    datos.formato,
    datos.version,
    datos.tipoDocumento,
    fallback
  );

  const value = normalizeKey(raw);

  if (
    value.includes('grupal') ||
    value.includes('grupo') ||
    value.includes('varios') ||
    value.includes('varias')
  ) {
    return 'grupal';
  }

  if (value.includes('vpn')) {
    return 'vpn';
  }

  return 'individual';
}

function normalizeDocumentRequest(tipoRaw, datosRaw = {}) {
  const datos = datosRaw || {};
  const tipo = clean(tipoRaw).toUpperCase();

  if (tipo === 'ANEXO01_INDIVIDUAL') {
    return { tipo: 'ANEXO01', datos: { ...datos, modalidad: 'individual' } };
  }

  if (tipo === 'ANEXO01_GRUPAL') {
    return { tipo: 'ANEXO01', datos: { ...datos, modalidad: 'grupal' } };
  }

  if (tipo === 'ANEXO01_VPN') {
    return { tipo: 'ANEXO01', datos: { ...datos, modalidad: 'vpn' } };
  }

  if (tipo === 'ANEXO02_INDIVIDUAL') {
    return { tipo: 'ANEXO02', datos: { ...datos, modalidad: 'individual' } };
  }

  if (tipo === 'ANEXO02_GRUPAL') {
    return { tipo: 'ANEXO02', datos: { ...datos, modalidad: 'grupal' } };
  }

  return { tipo, datos };
}

function validateRequired(datos, fields) {
  return fields.filter((field) => {
    const aliases = Array.isArray(field) ? field : [field];
    return !aliases.some((name) => hasValue(datos[name]));
  });
}

function validateGeneratePayload(tipo, datos) {
  if (tipo === 'ANEXO01') {
    const modalidad = getModalidad(datos);

    if (modalidad === 'vpn') {
      return validateRequired(datos, [
        ['nombres', 'nombreCompleto'],
        ['usuarioRed', 'userRed', 'usuarioRedINEI'],
        ['correoPersonal', 'emailPersonal', 'correoVPN'],
        ['hostEquipo', 'host', 'nombreEquipo'],
        ['telefono', 'celular', 'telefonoContacto'],
      ]);
    }

    if (modalidad === 'grupal') {
      return validateRequired(datos, [
        ['oficina', 'direccion', 'area'],
        'sede',
        'usuarios',
      ]);
    }

    return validateRequired(datos, [
      ['nombres', 'nombreCompleto'],
      ['cargo', 'funcion'],
      ['oficina', 'direccion', 'area'],
      'sede',
      ['tipoAcceso', 'acceso', 'permiso'],
    ]);
  }

  if (tipo === 'ANEXO02') {
    const modalidad = getModalidad(datos);

    if (modalidad === 'grupal') {
      return validateRequired(datos, [
        ['oficina', 'direccion', 'area'],
        'sede',
        'usuarios',
      ]);
    }

    return validateRequired(datos, [
      ['nombres', 'nombreCompleto'],
      ['cargo', 'funcion'],
      ['oficina', 'direccion', 'area'],
      'sede',
      ['tipoSolicitud', 'solicitud'],
    ]);
  }

  if (tipo === 'ANEXO03') {
    return validateRequired(datos, [
      'area',
      'jefeArea',
      ['usuarioSolicitante', 'solicitante'],
      ['proposito', 'justificacion'],
    ]);
  }

  if (tipo === 'ANEXO04') {
    return validateRequired(datos, [
      ['nombres', 'nombreCompleto'],
      ['cargo', 'funcion'],
      ['recurso', 'carpeta', 'carpetaCompartida'],
      'justificacion',
    ]);
  }

  if (tipo === 'ANEXO07') {
    return validateRequired(datos, [
      'areaOrigen',
      'areaDestino',
      ['descripcion', 'justificacion'],
    ]);
  }

  return [];
}

function getSafeName(datos = {}) {
  return safeFilenamePart(
    firstNonEmpty(
      datos.nombres,
      datos.nombreCompleto,
      datos.usuarioSolicitante,
      datos.area,
      datos.oficina,
      datos.direccion,
      'usuario'
    ),
    'usuario'
  );
}

function getDownloadFilename(tipo, datos = {}) {
  const safeName = getSafeName(datos);

  if (tipo === 'ANEXO01') {
    const modalidad = getModalidad(datos);

    if (modalidad === 'vpn') return `ANEXO01_VPN_${safeName}.docx`;
    if (modalidad === 'grupal') return `ANEXO01_GRUPAL_${safeName}.docx`;

    return `ANEXO01_INDIVIDUAL_${safeName}.docx`;
  }

  if (tipo === 'ANEXO02') {
    const modalidad = getModalidad(datos);

    if (modalidad === 'grupal') return `ANEXO02_GRUPAL_${safeName}.docx`;

    return `ANEXO02_INDIVIDUAL_${safeName}.docx`;
  }

  return `${tipo}_${safeName}.docx`;
}

function getTemplateInfo(tipoRaw) {
  const tipo = clean(tipoRaw).toUpperCase();

  const templates = {
    ANEXO01: {
      file: 'ANEXO01_individual_template.docx',
      filename: 'ANEXO01_individual_plantilla_INEI.docx',
      emptyData: {},
    },
    ANEXO01_INDIVIDUAL: {
      file: 'ANEXO01_individual_template.docx',
      filename: 'ANEXO01_individual_plantilla_INEI.docx',
      emptyData: {},
    },
    ANEXO01_GRUPAL: {
      file: 'ANEXO01_grupal_template.docx',
      filename: 'ANEXO01_grupal_plantilla_INEI.docx',
      emptyData: { usuarios: [] },
    },
    ANEXO01_VPN: {
      file: 'ANEXO01_vpn_template.docx',
      filename: 'ANEXO01_vpn_plantilla_INEI.docx',
      emptyData: {},
    },

    ANEXO02: {
      file: 'ANEXO02_individual_template.docx',
      filename: 'ANEXO02_individual_plantilla_INEI.docx',
      emptyData: {},
    },
    ANEXO02_INDIVIDUAL: {
      file: 'ANEXO02_individual_template.docx',
      filename: 'ANEXO02_individual_plantilla_INEI.docx',
      emptyData: {},
    },
    ANEXO02_GRUPAL: {
      file: 'ANEXO02_grupal_template.docx',
      filename: 'ANEXO02_grupal_plantilla_INEI.docx',
      emptyData: { usuarios: [] },
    },

    ANEXO03: {
      file: 'ANEXO03_template.docx',
      filename: 'ANEXO03_plantilla_INEI.docx',
      emptyData: { usuarios: [] },
    },

    ANEXO04: {
      file: 'ANEXO04_template.docx',
      filename: 'ANEXO04_plantilla_INEI.docx',
      emptyData: {},
    },
  };

  return templates[tipo] || null;
}

function renderCleanTemplate(filePath, emptyData = {}) {
  const PizZip = require('pizzip');
  const Docxtemplater = require('docxtemplater');

  const content = fs.readFileSync(filePath, 'binary');
  const zip = new PizZip(content);

  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => '',
  });

  doc.render(emptyData || {});

  return doc.getZip().generate({
    type: 'nodebuffer',
    compression: 'DEFLATE',
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Rutas principales
// ─────────────────────────────────────────────────────────────────────────────

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

  // Desactivar socket timeout para este endpoint SSE.
  req.socket?.setTimeout(0);

  try {
    const dbHistory = await getSessionMessages(req.sessionId);
    const geminiHistory = dbHistory.map(({ role, content }) => ({
      role: role === 'assistant' ? 'model' : 'user',
      parts: [{ text: content }],
    }));

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
        generationConfig: { thinkingConfig: { thinkingBudget: 8192 } },
      });
    }

    await saveMessage(req.sessionId, 'user', message);

    const chat = model.startChat({
      history: geminiHistory,
      generationConfig: { thinkingConfig: { thinkingBudget: 8192 } },
    });

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

    const hasSsiCall = pendingToolCalls.some((t) => t.name === 'create_ssi_ticket');

    if (!fullText && hasSsiCall) {
      const feedbackText = 'Procesando su solicitud...';
      res.write(`data: ${JSON.stringify({ delta: feedbackText })}\n\n`);
      fullText = feedbackText;
    }

    if (fullText && fullText !== 'Procesando su solicitud...') {
      await saveMessage(req.sessionId, 'assistant', fullText);
    }

    const esEscalamiento =
      /escalar|soporte.{1,20}presencial|conectar.{1,20}técnico|llamar INMEDIATAMENTE/i.test(fullText);

    if (esEscalamiento) {
      await saveEvent(req.sessionId, 'escalamiento', { trigger: 'auto_detect' }).catch(() => {});
    }

    const latencyMs = Date.now() - reqStart;
    console.log(`[chat] latencia=${latencyMs}ms session=${req.sessionId?.substring(0, 8)}`);
    await saveEvent(req.sessionId, 'chat_latencia', { ms: latencyMs }).catch(() => {});

    const functionResponses = [];

    for (const toolCall of pendingToolCalls) {
      const { name, args } = toolCall;

      console.log(`[tool] ${name}`, JSON.stringify(args).substring(0, 120));

      const handler = toolHandlers[name];
      if (!handler) continue;

      let heartbeatInterval = null;

      if (name === 'create_ssi_ticket') {
        heartbeatInterval = setInterval(() => {
          if (!res.writableEnded) {
            res.write('data: {"ping":true}\n\n');
          }
        }, 10000);
      }

      let payload;

      try {
        payload = name === 'create_ssi_ticket'
          ? await handler(args, req.sessionId)
          : await handler(args);
      } finally {
        if (heartbeatInterval) clearInterval(heartbeatInterval);
      }

      if (name === 'generate_document' && payload.ok) {
        await saveEvent(req.sessionId, 'documento_generado', {
          tipo: args.tipo,
          modalidad: args.datos?.modalidad || args.modalidad || null,
        }).catch(() => {});
      }

      if (name === 'set_urgency') {
        await saveEvent(req.sessionId, 'urgencia_asignada', { nivel: args.nivel }).catch(() => {});
      }

      res.write(`data: ${JSON.stringify({ action: name, payload })}\n\n`);
      functionResponses.push({ functionResponse: { name, response: { result: 'ok' } } });
    }

    const UI_TOOLS = new Set([
      'show_chips',
      'show_form',
      'create_ssi_ticket',
      'download_template',
      'generate_document',
    ]);

    const hasVisibleOutput = fullText || pendingToolCalls.some((t) => UI_TOOLS.has(t.name));

    if (!hasVisibleOutput && functionResponses.length > 0) {
      const followUp = await chat.sendMessageStream(functionResponses);
      let followText = '';

      for await (const chunk of followUp.stream) {
        const parts = chunk.candidates?.[0]?.content?.parts || [];

        for (const part of parts) {
          if (part.text) {
            followText += part.text;
            res.write(`data: ${JSON.stringify({ delta: part.text })}\n\n`);
          }
        }
      }

      if (followText) {
        await saveMessage(req.sessionId, 'assistant', followText);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    console.error('Error Gemini API:', err.message);

    if (!res.writableEnded) {
      res.write(
        `data: ${JSON.stringify({
          error: 'Ocurrió un error al procesar su solicitud. Por favor intente nuevamente.',
        })}\n\n`
      );
      res.write('data: [DONE]\n\n');
      res.end();
    }
  }
});

app.post('/api/reset', sessionMiddleware, async (req, res) => {
  if (req.sessionId) {
    await deleteSessionMessages(req.sessionId).catch(() => {});
  }

  res.clearCookie('otin_session');
  res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// Generación de documentos
// ─────────────────────────────────────────────────────────────────────────────

app.post('/api/generate', generateLimiter, async (req, res) => {
  const normalized = normalizeDocumentRequest(req.body?.tipo, req.body?.datos);
  const { tipo, datos } = normalized;

  if (!tipo || !datos) {
    return res.status(400).json({ error: 'Se requiere tipo y datos.' });
  }

  const supported = new Set(['ANEXO01', 'ANEXO02', 'ANEXO03', 'ANEXO04', 'ANEXO07']);

  if (!supported.has(tipo)) {
    return res.status(400).json({ error: `Tipo de documento no soportado: ${tipo}` });
  }

  const missing = validateGeneratePayload(tipo, datos);

  if (missing.length) {
    return res.status(400).json({
      error: `Campos requeridos faltantes para ${tipo}: ${missing.join(', ')}`,
    });
  }

  try {
    let docBuffer;

    if (tipo === 'ANEXO01') {
      docBuffer = await generateAnexo01(datos);
    } else if (tipo === 'ANEXO02') {
      docBuffer = await generateAnexo02(datos);
    } else if (tipo === 'ANEXO03') {
      docBuffer = await generateAnexo03(datos);
    } else if (tipo === 'ANEXO04') {
      docBuffer = await generateAnexo04(datos);
    } else if (tipo === 'ANEXO07') {
      docBuffer = await generateAnexo07(datos);
    }

    const filename = getDownloadFilename(tipo, datos);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', docBuffer.length);
    res.send(docBuffer);
  } catch (err) {
    console.error('Error generando documento:', err.message);

    res.status(500).json({
      error: 'No se pudo generar el documento. Por favor intente nuevamente.',
      detail: process.env.NODE_ENV === 'production' ? undefined : err.message,
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Descarga de plantillas
// ─────────────────────────────────────────────────────────────────────────────

app.get('/api/template/:tipo', async (req, res) => {
  const { tipo } = req.params;
  const tipoUpper = clean(tipo).toUpperCase();

  if (tipoUpper === 'PROD02') {
    const filePath = path.join(__dirname, 'Anexos', 'PROD02_INEI_FORMATO_SOLICITUD_PERMISOS.docx');

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Formato PROD-02 no disponible.' });
    }

    res.setHeader('Content-Disposition', 'attachment; filename="PROD02_Solicitud_Permisos_BD_INEI.docx"');
    return res.sendFile(filePath);
  }

  if (tipoUpper === 'F01') {
    const filePath = path.join(__dirname, 'Anexos', 'Formato de Altas y Bajas propuesto V2.xlsx');

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Formato F-01 no disponible.' });
    }

    res.setHeader('Content-Disposition', 'attachment; filename="Formato_F01_Altas_Bajas_INEI.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return res.sendFile(filePath);
  }

  if (tipoUpper === 'ANEXO07') {
    try {
      const buffer = await generateAnexo07({});

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );
      res.setHeader('Content-Disposition', 'attachment; filename="ANEXO07_Transferencia_Info_INEI.docx"');
      res.setHeader('Content-Length', buffer.length);

      return res.send(buffer);
    } catch (err) {
      console.error('[template ANEXO07]', err.message);
      return res.status(500).json({ error: 'No se pudo generar la plantilla ANEXO07.' });
    }
  }

  const info = getTemplateInfo(tipoUpper);

  if (!info) {
    return res.status(404).json({ error: 'Tipo no válido.' });
  }

  const filePath = path.join(__dirname, 'templates', info.file);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({
      error: `Plantilla ${info.file} no disponible.`,
    });
  }

  try {
    const buffer = renderCleanTemplate(filePath, info.emptyData);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${info.filename}"`);
    res.setHeader('Content-Length', buffer.length);

    return res.send(buffer);
  } catch (err) {
    console.error('[template] docxtemplater fallback:', err.message);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${info.filename}"`);

    return res.sendFile(filePath);
  }
});

// Descarga directa de PROD-02
app.get('/api/formatos/prod02', (req, res) => {
  const filePath = path.join(__dirname, 'Anexos', 'PROD02_INEI_FORMATO_SOLICITUD_PERMISOS.docx');

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Formato PROD-02 no disponible.' });
  }

  res.setHeader('Content-Disposition', 'attachment; filename="PROD02_Solicitud_Permisos_BD_INEI.docx"');
  res.sendFile(filePath);
});

// Descarga directa de Formato F-01
app.get('/api/formatos/f01', (req, res) => {
  const filePath = path.join(__dirname, 'Anexos', 'Formato de Altas y Bajas propuesto V2.xlsx');

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Formato F-01 no disponible.' });
  }

  res.setHeader('Content-Disposition', 'attachment; filename="Formato_F01_Altas_Bajas_INEI.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.sendFile(filePath);
});

// ─────────────────────────────────────────────────────────────────────────────
// SSI
// ─────────────────────────────────────────────────────────────────────────────

app.post('/api/ticket-ssi', internalOnly, ticketLimiter, async (req, res) => {
  const { titulo, descripcion, categoria, sede, categoriaId, sedeId } = req.body;

  if (!titulo || !descripcion) {
    return res.status(400).json({ error: 'Se requieren titulo y descripcion.' });
  }

  try {
    const resultado = await crearTicketSSI({
      titulo,
      descripcion,
      categoria,
      categoriaId,
      sede,
      sedeId,
    });

    res.json(resultado);
  } catch (err) {
    console.error('Error SSI automation:', err.message);
    res.status(500).json({ error: err.message || 'No se pudo crear el ticket en el SSI.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Admin / widget / métricas
// ─────────────────────────────────────────────────────────────────────────────

app.get('/admin', internalOnly, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/widget', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'widget.html'));
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

// ─────────────────────────────────────────────────────────────────────────────
// Arranque
// ─────────────────────────────────────────────────────────────────────────────

async function startServer() {
  try {
    const { runMigrations } = require('./db/migrate');
    await runMigrations();
  } catch (err) {
    console.warn('[migrate] No se pudo ejecutar migración:', err.message);
  }

  if (process.env.ENABLE_GEMINI_CACHE === 'true') {
    try {
      await initCache(process.env.GEMINI_API_KEY, SYSTEM_PROMPT, toolDeclarations);
    } catch (err) {
      console.warn('Context Cache no disponible, usando systemInstruction directo:', err.message);
    }
  } else {
    console.log('[cache] Context Cache desactivado. Usando systemInstruction directo.');
  }

  app.listen(PORT, () => {
    console.log(`Servidor OTIN Chatbot corriendo en http://localhost:${PORT}`);
  });

  const runCleanup = async () => {
    try {
      const deleted = await cleanupOldSessions(90);
      if (deleted > 0) console.log(`[cleanup] ${deleted} sesiones antiguas eliminadas`);
    } catch (e) {
      console.warn('[cleanup] error:', e.message);
    }
  };

  runCleanup();
  setInterval(runCleanup, 24 * 60 * 60 * 1000);
}

// Evitar que errores no manejados de Playwright u otros módulos async crasheen el servidor.
process.on('unhandledRejection', (reason) => {
  console.error('[server] unhandledRejection (no-crash):', reason?.message || reason);
});

process.on('uncaughtException', (err) => {
  console.error('[server] uncaughtException (no-crash):', err?.message || err);
});

startServer();