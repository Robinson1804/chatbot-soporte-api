require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { generateAnexo01, generateAnexo02, generateAnexo03, generateAnexo04 } = require('./generators');
const { crearTicketSSI } = require('./ssi-automation');

const app = express();
const PORT = process.env.PORT || 3000;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const SYSTEM_PROMPT = fs.readFileSync(
  path.join(__dirname, 'prompts', 'system-prompt.md'),
  'utf8'
);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/api/chat', async (req, res) => {
  const { message, history = [] } = req.body;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'El campo "message" es requerido.' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  // Convertir historial al formato de Gemini (role: 'user' | 'model')
  const geminiHistory = history.map(({ role, content }) => ({
    role: role === 'assistant' ? 'model' : 'user',
    parts: [{ text: content }],
  }));

  try {
    const model = genAI.getGenerativeModel({
      model: 'models/gemini-2.5-flash',
      systemInstruction: SYSTEM_PROMPT,
    });

    const chat = model.startChat({ history: geminiHistory });
    const result = await chat.sendMessageStream(message);

    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) {
        const payload = JSON.stringify({ delta: text });
        res.write(`data: ${payload}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    console.error('Error Gemini API:', err.message);
    const errorPayload = JSON.stringify({ error: 'OcurriÃ³ un error al procesar su solicitud. Por favor intente nuevamente.' });
    res.write(`data: ${errorPayload}\n\n`);
    res.end();
  }
});

app.post('/api/reset', (req, res) => {
  res.json({ ok: true });
});

app.post('/api/generate', async (req, res) => {
  const { tipo, datos } = req.body;

  if (!tipo || !datos) {
    return res.status(400).json({ error: 'Se requiere tipo y datos.' });
  }

  const REQUIRED = {
    ANEXO01: ['nombres', 'cargo', 'direccion', 'sede', 'tipoAcceso'],
    ANEXO02: ['nombres', 'cargo', 'direccion', 'sede', 'tipoSolicitud'],
    ANEXO03: ['area', 'jefeArea', 'usuarioSolicitante', 'proposito'],
    ANEXO04: ['nombres', 'cargo', 'recurso', 'justificacion'],
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

app.get('/api/template/:tipo', (req, res) => {
  const { tipo } = req.params;
  const allowed = ['ANEXO01', 'ANEXO02', 'ANEXO03', 'ANEXO04'];
  if (!allowed.includes(tipo)) {
    return res.status(404).json({ error: 'Tipo no vÃ¡lido.' });
  }
  const templatePath = path.join(__dirname, 'templates', `${tipo}_template.docx`);
  const fs = require('fs');
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
  } catch {
    // Fallback: servir el archivo crudo si docxtemplater falla
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${tipo}_plantilla_INEI.docx"`);
    res.sendFile(templatePath);
  }
});

app.post('/api/ticket-ssi', async (req, res) => {
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

app.listen(PORT, () => {
  console.log(`Servidor OTIN Chatbot corriendo en http://localhost:${PORT}`);
});
