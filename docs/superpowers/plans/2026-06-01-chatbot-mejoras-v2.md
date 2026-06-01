# Chatbot OTIN v2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mejorar el chatbot OTIN en 4 fases incrementales: quick wins de mantenibilidad y seguridad, persistencia PostgreSQL con métricas, Gemini Function Calling nativo, y Context Caching para reducción de costo de tokens.

**Architecture:** Express/Node.js con middlewares modulares por fase. PostgreSQL via `pg` pool para sesiones anónimas, historial de mensajes y eventos de métricas. Gemini Function Calling reemplaza el parser de tags artesanal. Context Cache del SYSTEM_PROMPT reduce tokens de input en cada request.

**Tech Stack:** Node.js >=18, Express ^4.21.2, PostgreSQL 14+, `pg`, `express-rate-limit`, `cookie-parser`, `ip-range-check`, `@google/generative-ai` ^0.21.0

**Spec:** `docs/superpowers/specs/2026-06-01-chatbot-mejoras-v2-design.md`

---

## File Map

| Archivo | Fase | Acción |
|---|---|---|
| `prompts/system-prompt.md` | 1 | CREAR — contenido del SYSTEM_PROMPT actual |
| `middleware/rateLimiter.js` | 1 | CREAR — límites por endpoint |
| `middleware/internalOnly.js` | 1 | CREAR — validación IP red interna |
| `db/pool.js` | 2 | CREAR — pool PostgreSQL |
| `db/migrations/001_init.sql` | 2 | CREAR — schema sessions/messages/events |
| `db/migrate.js` | 2 | CREAR — script de migración |
| `db/queries.js` | 2 | CREAR — funciones de acceso a datos |
| `middleware/session.js` | 2 | CREAR — gestión sessionId en cookie httpOnly |
| `tools/definitions.js` | 3 | CREAR — declaración de 5 tools para Gemini |
| `tools/handlers.js` | 3 | CREAR — implementación de cada tool |
| `cache/geminiCache.js` | 4 | CREAR — gestión Context Cache |
| `server.js` | 1,2,3,4 | MODIFICAR — integración incremental por fase |
| `public/chat.js` | 3 | MODIFICAR — eliminar parser de tags, manejar action events |
| `package.json` | 1 | MODIFICAR — nuevas dependencias |

---

## FASE 1 — Quick Wins

### Task 1: Instalar dependencias

**Files:**
- Modify: `package.json`

- [ ] **Instalar paquetes**

```bash
cd "D:/DATA ROBINSON/OTIN-2026/Sistemas Internos/Chatbot-Soporte"
npm install express-rate-limit cookie-parser pg ip-range-check
```

Expected: `added N packages` sin errores.

- [ ] **Verificar instalación**

```bash
node -e "require('express-rate-limit'); require('cookie-parser'); require('pg'); require('ip-range-check'); console.log('OK')"
```

Expected: `OK`

- [ ] **Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: agregar dependencias fase 1-2 (rate-limit, cookie-parser, pg, ip-range-check)"
```

---

### Task 2: Extraer SYSTEM_PROMPT a archivo externo

**Files:**
- Create: `prompts/system-prompt.md`
- Modify: `server.js`

- [ ] **Crear directorio `prompts/`**

```bash
mkdir -p "D:/DATA ROBINSON/OTIN-2026/Sistemas Internos/Chatbot-Soporte/prompts"
```

- [ ] **Crear `prompts/system-prompt.md`**

Copiar el contenido completo del string `SYSTEM_PROMPT` de `server.js` (líneas 14–504, sin las comillas del template literal) al archivo `prompts/system-prompt.md`. El contenido ya es markdown — pegarlo tal cual.

- [ ] **Reemplazar SYSTEM_PROMPT en server.js**

En `server.js`, reemplazar las líneas 14–504 (el bloque `const SYSTEM_PROMPT = \`...\``) por:

```js
const fs = require('fs');
const SYSTEM_PROMPT = fs.readFileSync(
  path.join(__dirname, 'prompts', 'system-prompt.md'),
  'utf8'
);
```

Nota: `path` ya está importado en la línea 3 de `server.js`.

- [ ] **Verificar que el servidor arranca**

```bash
node server.js
```

Expected: `Servidor OTIN Chatbot corriendo en http://localhost:3000`

Si aparece error `ENOENT: no such file or directory` verificar que el archivo existe en `prompts/system-prompt.md`.

- [ ] **Detener servidor (Ctrl+C) y commit**

```bash
git add prompts/system-prompt.md server.js
git commit -m "refactor: externalizar SYSTEM_PROMPT a prompts/system-prompt.md"
```

---

### Task 3: Rate limiting middleware

**Files:**
- Create: `middleware/rateLimiter.js`

- [ ] **Crear directorio `middleware/`**

```bash
mkdir -p "D:/DATA ROBINSON/OTIN-2026/Sistemas Internos/Chatbot-Soporte/middleware"
```

- [ ] **Crear `middleware/rateLimiter.js`**

```js
const rateLimit = require('express-rate-limit');

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes. Por favor espere un momento.' },
});

const generateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Límite de generación de documentos alcanzado. Espere un momento.' },
});

const ticketLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Límite de creación de tickets alcanzado. Espere un momento.' },
});

module.exports = { chatLimiter, generateLimiter, ticketLimiter };
```

---

### Task 4: Validación de red interna

**Files:**
- Create: `middleware/internalOnly.js`

- [ ] **Crear `middleware/internalOnly.js`**

```js
const ipRangeCheck = require('ip-range-check');

function internalOnly(req, res, next) {
  if (process.env.SKIP_IP_VALIDATION === 'true') return next();

  const range = process.env.INTERNAL_IP_RANGE || '10.0.0.0/8';
  const ip = req.ip || req.connection.remoteAddress || '';
  const cleanIp = ip.replace(/^::ffff:/, '');

  if (cleanIp === '127.0.0.1' || cleanIp === '::1') return next();

  if (!ipRangeCheck(cleanIp, range)) {
    return res.status(403).json({ error: 'Acceso restringido a la red interna INEI.' });
  }

  next();
}

module.exports = internalOnly;
```

- [ ] **Agregar variables al archivo `.env`**

Abrir `.env` y agregar al final:

```
INTERNAL_IP_RANGE=10.0.0.0/8
SKIP_IP_VALIDATION=true
```

> En producción cambiar `SKIP_IP_VALIDATION=false` y verificar el rango IP de la red INEI.

---

### Task 5: Aplicar middlewares en server.js

**Files:**
- Modify: `server.js`

- [ ] **Agregar imports** (después de los imports existentes, antes de `const app = express()`)

```js
const { chatLimiter, generateLimiter, ticketLimiter } = require('./middleware/rateLimiter');
const internalOnly = require('./middleware/internalOnly');
```

- [ ] **Aplicar limiter en /api/chat**

```js
// Cambiar:
app.post('/api/chat', async (req, res) => {
// Por:
app.post('/api/chat', chatLimiter, async (req, res) => {
```

- [ ] **Aplicar limiter en /api/generate**

```js
// Cambiar:
app.post('/api/generate', async (req, res) => {
// Por:
app.post('/api/generate', generateLimiter, async (req, res) => {
```

- [ ] **Aplicar internalOnly + limiter en /api/ticket-ssi**

```js
// Cambiar:
app.post('/api/ticket-ssi', async (req, res) => {
// Por:
app.post('/api/ticket-ssi', internalOnly, ticketLimiter, async (req, res) => {
```

- [ ] **Verificar funcionamiento**

```bash
node server.js
```

En otra terminal (PowerShell):
```powershell
Invoke-WebRequest -Method POST http://localhost:3000/api/chat `
  -ContentType "application/json" `
  -Body '{"message":"hola","history":[]}'
```

Expected: respuesta SSE sin errores 429 ni 500.

- [ ] **Detener servidor y commit**

```bash
git add middleware/rateLimiter.js middleware/internalOnly.js server.js .env
git commit -m "feat: rate limiting por endpoint y validacion de red interna para /api/ticket-ssi"
```

---

## FASE 2 — PostgreSQL: Persistencia + Métricas

> **Prerrequisito:** Tener PostgreSQL 14+ instalado y corriendo. Crear la base de datos antes de correr migraciones.

### Task 6: Pool de conexiones PostgreSQL

**Files:**
- Create: `db/pool.js`

- [ ] **Crear directorio `db/`**

```bash
mkdir -p "D:/DATA ROBINSON/OTIN-2026/Sistemas Internos/Chatbot-Soporte/db/migrations"
```

- [ ] **Crear `db/pool.js`**

```js
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('PostgreSQL pool error:', err.message);
});

module.exports = pool;
```

- [ ] **Agregar DATABASE_URL al `.env`**

```
DATABASE_URL=postgresql://postgres:TU_PASSWORD@localhost:5432/chatbot_otin
```

Reemplazar `TU_PASSWORD` con la contraseña real de PostgreSQL.

- [ ] **Crear la base de datos**

En PowerShell (con PostgreSQL en PATH) o pgAdmin:
```bash
createdb -U postgres chatbot_otin
```

O en psql:
```sql
CREATE DATABASE chatbot_otin;
```

- [ ] **Verificar conexión**

```bash
node -e "require('dotenv').config(); const p = require('./db/pool'); p.query('SELECT 1').then(() => { console.log('DB OK'); p.end(); }).catch(e => { console.error(e.message); p.end(); })"
```

Expected: `DB OK`

---

### Task 7: Migraciones de base de datos

**Files:**
- Create: `db/migrations/001_init.sql`
- Create: `db/migrate.js`

- [ ] **Crear `db/migrations/001_init.sql`**

```sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata    JSONB DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS messages (
  id          BIGSERIAL PRIMARY KEY,
  session_id  UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role        VARCHAR(10) NOT NULL CHECK (role IN ('user', 'assistant')),
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_session
  ON messages(session_id, created_at);

CREATE TABLE IF NOT EXISTS events (
  id          BIGSERIAL PRIMARY KEY,
  session_id  UUID REFERENCES sessions(id) ON DELETE SET NULL,
  tipo        VARCHAR(50) NOT NULL,
  payload     JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_tipo_created
  ON events(tipo, created_at);
```

- [ ] **Crear `db/migrate.js`**

```js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('./pool');

async function migrate() {
  const sqlPath = path.join(__dirname, 'migrations', '001_init.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  try {
    await pool.query(sql);
    console.log('Migración completada exitosamente.');
  } catch (err) {
    console.error('Error en migración:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
```

- [ ] **Correr la migración**

```bash
node db/migrate.js
```

Expected: `Migración completada exitosamente.`

- [ ] **Verificar tablas creadas**

```bash
node -e "require('dotenv').config(); const p = require('./db/pool'); p.query(\"SELECT tablename FROM pg_tables WHERE schemaname='public'\").then(r => { console.log(r.rows); p.end(); })"
```

Expected: `[ { tablename: 'sessions' }, { tablename: 'messages' }, { tablename: 'events' } ]`

---

### Task 8: Funciones de acceso a datos

**Files:**
- Create: `db/queries.js`

- [ ] **Crear `db/queries.js`**

```js
const pool = require('./pool');

async function createSession() {
  const res = await pool.query(
    'INSERT INTO sessions DEFAULT VALUES RETURNING id'
  );
  return res.rows[0].id;
}

async function sessionExists(sessionId) {
  const res = await pool.query(
    'SELECT id FROM sessions WHERE id = $1',
    [sessionId]
  );
  return res.rows.length > 0;
}

async function getSessionMessages(sessionId) {
  const res = await pool.query(
    `SELECT role, content FROM messages
     WHERE session_id = $1
     ORDER BY created_at ASC
     LIMIT 50`,
    [sessionId]
  );
  return res.rows;
}

async function saveMessage(sessionId, role, content) {
  await pool.query(
    'INSERT INTO messages (session_id, role, content) VALUES ($1, $2, $3)',
    [sessionId, role, content]
  );
  await pool.query(
    'UPDATE sessions SET updated_at = NOW() WHERE id = $1',
    [sessionId]
  );
}

async function saveEvent(sessionId, tipo, payload = {}) {
  await pool.query(
    'INSERT INTO events (session_id, tipo, payload) VALUES ($1, $2, $3)',
    [sessionId, tipo, JSON.stringify(payload)]
  );
}

module.exports = { createSession, sessionExists, getSessionMessages, saveMessage, saveEvent };
```

---

### Task 9: Middleware de sesión

**Files:**
- Create: `middleware/session.js`

- [ ] **Crear `middleware/session.js`**

```js
const { createSession, sessionExists } = require('../db/queries');

const COOKIE_NAME = 'otin_session';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 días en ms

async function sessionMiddleware(req, res, next) {
  let sessionId = req.cookies?.[COOKIE_NAME];

  if (sessionId) {
    const exists = await sessionExists(sessionId);
    if (!exists) sessionId = null;
  }

  if (!sessionId) {
    sessionId = await createSession();
    res.cookie(COOKIE_NAME, sessionId, {
      httpOnly: true,
      sameSite: 'strict',
      maxAge: COOKIE_MAX_AGE,
    });
  }

  req.sessionId = sessionId;
  next();
}

module.exports = sessionMiddleware;
```

---

### Task 10: Integrar PostgreSQL en server.js

**Files:**
- Modify: `server.js`

- [ ] **Agregar imports** (después de los imports existentes de la Fase 1)

```js
const cookieParser = require('cookie-parser');
const sessionMiddleware = require('./middleware/session');
const { getSessionMessages, saveMessage, saveEvent } = require('./db/queries');
```

- [ ] **Agregar cookie-parser al middleware global**

Después de `app.use(cors())`, agregar:

```js
app.use(cookieParser());
```

- [ ] **Aplicar sessionMiddleware en /api/chat**

```js
// Cambiar:
app.post('/api/chat', chatLimiter, async (req, res) => {
// Por:
app.post('/api/chat', chatLimiter, sessionMiddleware, async (req, res) => {
```

- [ ] **Reemplazar lectura de historial en el handler de /api/chat**

Dentro del handler, reemplazar:

```js
// ANTES:
const { message, history = [] } = req.body;

if (!message || typeof message !== 'string') {
  return res.status(400).json({ error: 'El campo "message" es requerido.' });
}

// ...
const geminiHistory = history.map(({ role, content }) => ({
  role: role === 'assistant' ? 'model' : 'user',
  parts: [{ text: content }],
}));
```

Por:

```js
const { message } = req.body;

if (!message || typeof message !== 'string') {
  return res.status(400).json({ error: 'El campo "message" es requerido.' });
}

const dbHistory = await getSessionMessages(req.sessionId);
const geminiHistory = dbHistory.map(({ role, content }) => ({
  role: role === 'assistant' ? 'model' : 'user',
  parts: [{ text: content }],
}));
```

- [ ] **Persistir mensajes — reemplazar el loop del stream**

Dentro del try block, reemplazar el loop `for await` existente por:

```js
const chat = model.startChat({ history: geminiHistory });
const result = await chat.sendMessageStream(message);

let fullText = '';
for await (const chunk of result.stream) {
  const text = chunk.text();
  if (text) {
    fullText += text;
    res.write(`data: ${JSON.stringify({ delta: text })}\n\n`);
  }
}

// Persistir en DB
await saveMessage(req.sessionId, 'user', message);
await saveMessage(req.sessionId, 'assistant', fullText);

res.write('data: [DONE]\n\n');
res.end();
```

- [ ] **Actualizar /api/reset para limpiar la cookie de sesión**

Reemplazar:

```js
app.post('/api/reset', (req, res) => {
  res.json({ ok: true });
});
```

Por:

```js
app.post('/api/reset', (req, res) => {
  res.clearCookie('otin_session');
  res.json({ ok: true });
});
```

- [ ] **Verificar que el servidor persiste mensajes**

```bash
node server.js
```

Abrir http://localhost:3000, enviar un mensaje. Luego verificar en psql:

```sql
SELECT * FROM sessions;
SELECT role, LEFT(content, 60) AS content FROM messages ORDER BY created_at DESC LIMIT 5;
```

Expected: una fila en `sessions`, dos filas en `messages` (user + assistant).

- [ ] **Commit**

```bash
git add db/ middleware/session.js server.js
git commit -m "feat: persistencia de conversaciones en PostgreSQL con sesiones anonimas"
```

---

### Task 11: Actualizar chat.js — historial server-side

**Files:**
- Modify: `public/chat.js`

- [ ] **Eliminar el historial del body del fetch** en la función `sendMessage`

```js
// ANTES:
body: JSON.stringify({ message: text, history: history.slice(0, -1) }),

// POR:
body: JSON.stringify({ message: text }),
```

- [ ] **Verificar que la UI sigue funcionando**

Abrir http://localhost:3000, enviar 3 mensajes verificando que el asistente recuerda el contexto de mensajes anteriores (la memoria ahora viene de la DB, no del cliente).

- [ ] **Commit**

```bash
git add public/chat.js
git commit -m "feat: historial de chat migrado a server-side via PostgreSQL"
```

---

## FASE 3 — Gemini Function Calling

### Task 12: Declarar tools para Gemini

**Files:**
- Create: `tools/definitions.js`

- [ ] **Crear directorio `tools/`**

```bash
mkdir -p "D:/DATA ROBINSON/OTIN-2026/Sistemas Internos/Chatbot-Soporte/tools"
```

- [ ] **Crear `tools/definitions.js`**

```js
const toolDeclarations = [
  {
    name: 'generate_document',
    description: 'Genera un documento Word ANEXO 01-04 pre-completado. Llamar SOLO después de confirmar todos los datos con el usuario.',
    parameters: {
      type: 'OBJECT',
      properties: {
        tipo: {
          type: 'STRING',
          enum: ['ANEXO01', 'ANEXO02', 'ANEXO03', 'ANEXO04'],
          description: 'Tipo de documento a generar',
        },
        datos: {
          type: 'OBJECT',
          description: 'Objeto con los datos del usuario para pre-completar el documento',
        },
      },
      required: ['tipo', 'datos'],
    },
  },
  {
    name: 'create_ssi_ticket',
    description: 'Crea un ticket en el SSI. Llamar SOLO cuando el usuario aceptó explícitamente la creación automática.',
    parameters: {
      type: 'OBJECT',
      properties: {
        titulo:      { type: 'STRING', description: 'Título descriptivo (máx 100 caracteres)' },
        descripcion: { type: 'STRING', description: 'Descripción completa del problema' },
        categoria:   { type: 'STRING', description: 'Categoría SSI exacta del listado oficial' },
        sede:        { type: 'STRING', description: 'Sede del usuario, exactamente como figura en el listado SSI' },
      },
      required: ['titulo', 'descripcion', 'categoria', 'sede'],
    },
  },
  {
    name: 'download_template',
    description: 'Ofrece la descarga de una plantilla en blanco para completar manualmente.',
    parameters: {
      type: 'OBJECT',
      properties: {
        tipo: {
          type: 'STRING',
          enum: ['ANEXO01', 'ANEXO02', 'ANEXO03', 'ANEXO04'],
        },
      },
      required: ['tipo'],
    },
  },
  {
    name: 'set_urgency',
    description: 'Establece nivel de urgencia del problema. P1=Crítico masivo, P2=Usuario bloqueado, P3=Normal planificado, P4=Consulta informativa.',
    parameters: {
      type: 'OBJECT',
      properties: {
        nivel: { type: 'STRING', enum: ['P1', 'P2', 'P3', 'P4'] },
      },
      required: ['nivel'],
    },
  },
  {
    name: 'show_chips',
    description: 'Muestra botones de respuesta rápida para guiar la conversación.',
    parameters: {
      type: 'OBJECT',
      properties: {
        opciones: {
          type: 'ARRAY',
          items: { type: 'STRING' },
          description: 'Lista de opciones a mostrar como botones',
        },
      },
      required: ['opciones'],
    },
  },
];

module.exports = toolDeclarations;
```

---

### Task 13: Implementar handlers de tools

**Files:**
- Create: `tools/handlers.js`

- [ ] **Crear `tools/handlers.js`**

```js
const { crearTicketSSI } = require('../ssi-automation');
const { saveEvent } = require('../db/queries');

async function handleGenerateDocument({ tipo, datos }) {
  const allowed = ['ANEXO01', 'ANEXO02', 'ANEXO03', 'ANEXO04'];
  if (!allowed.includes(tipo)) {
    return { ok: false, error: `Tipo no válido: ${tipo}` };
  }
  // El frontend llama /api/generate con estos datos para descargar el .docx
  return { ok: true, tipo, datos };
}

async function handleCreateSSITicket({ titulo, descripcion, categoria, sede }, sessionId) {
  try {
    const resultado = await crearTicketSSI({ titulo, descripcion, categoria, sede });
    if (sessionId) {
      await saveEvent(sessionId, 'ticket_creado', {
        titulo, categoria, sede, ticketNum: resultado.ticketNum,
      });
    }
    return { ok: true, ticketNum: resultado.ticketNum, mensaje: resultado.mensaje };
  } catch (err) {
    if (sessionId) {
      await saveEvent(sessionId, 'error_ssi', { titulo, error: err.message });
    }
    return { ok: false, error: err.message };
  }
}

function handleDownloadTemplate({ tipo }) {
  return { ok: true, tipo };
}

function handleSetUrgency({ nivel }) {
  return { ok: true, nivel };
}

function handleShowChips({ opciones }) {
  return { ok: true, opciones };
}

module.exports = {
  generate_document:  handleGenerateDocument,
  create_ssi_ticket:  handleCreateSSITicket,
  download_template:  handleDownloadTemplate,
  set_urgency:        handleSetUrgency,
  show_chips:         handleShowChips,
};
```

---

### Task 14: Refactorizar /api/chat con Function Calling

**Files:**
- Modify: `server.js`

- [ ] **Agregar imports** (después de los imports de Fase 2)

```js
const toolDeclarations = require('./tools/definitions');
const toolHandlers     = require('./tools/handlers');
```

- [ ] **Reemplazar el handler completo de /api/chat**

Reemplazar todo el bloque `app.post('/api/chat', ...)` por:

```js
app.post('/api/chat', chatLimiter, sessionMiddleware, async (req, res) => {
  const { message } = req.body;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'El campo "message" es requerido.' });
  }

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
    const model = genAI.getGenerativeModel({
      model: 'models/gemini-2.5-flash',
      systemInstruction: SYSTEM_PROMPT,
      tools: [{ functionDeclarations: toolDeclarations }],
      toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
    });

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

    // Persistir en DB
    await saveMessage(req.sessionId, 'user', message);
    if (fullText) {
      await saveMessage(req.sessionId, 'assistant', fullText);
    }

    // Ejecutar tool calls y emitir action events al cliente
    for (const toolCall of pendingToolCalls) {
      const { name, args } = toolCall;
      const handler = toolHandlers[name];
      if (!handler) continue;

      const payload = name === 'create_ssi_ticket'
        ? await handler(args, req.sessionId)
        : await handler(args);

      // Registrar eventos de métricas (excepto los puramente UI)
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
```

- [ ] **Verificar que el servidor arranca sin errores**

```bash
node server.js
```

Expected: `Servidor OTIN Chatbot corriendo en http://localhost:3000`. Si hay error `toolConfig is not valid`, verificar que `@google/generative-ai` es >= 0.21.0 con `npm list @google/generative-ai`.

---

### Task 15: Actualizar chat.js — eliminar parser de tags

**Files:**
- Modify: `public/chat.js`

- [ ] **Eliminar la función `extractChips` completa** (líneas 313–365 en el archivo actual)

- [ ] **Agregar función `handleActionEvent`** (agregar después de la función `sendMessage`)

```js
function handleActionEvent(action, payload, rowEl, bubbleEl) {
  switch (action) {
    case 'generate_document':
      if (payload.ok && payload.tipo && payload.datos) {
        generateDocument(payload.tipo, payload.datos, rowEl);
      }
      break;
    case 'create_ssi_ticket':
      showTicketResult(payload, rowEl);
      break;
    case 'download_template':
      if (payload.ok && payload.tipo) {
        downloadTemplate(payload.tipo, rowEl);
      }
      break;
    case 'set_urgency':
      if (payload.ok && payload.nivel) {
        prependUrgencyBadge(bubbleEl, payload.nivel);
      }
      break;
    case 'show_chips':
      if (payload.ok && payload.opciones?.length) {
        renderChips(payload.opciones, rowEl);
      }
      break;
  }
}
```

- [ ] **Reemplazar el procesamiento post-stream en `sendMessage`**

En el loop del reader, dentro del bloque que maneja `parsed.delta`, agregar el manejo de `parsed.action`:

```js
if (parsed.delta) {
  fullText += parsed.delta;
  renderBubbleContent(bubbleEl, fullText);
  scrollToBottom();
}

if (parsed.action) {
  handleActionEvent(parsed.action, parsed.payload, rowEl, bubbleEl);
}
```

- [ ] **Reemplazar el bloque post-stream** (después del while loop del reader)

```js
// ANTES:
const { cleanText, chips, docGenPayload, urgencia, templatePayload, ticketSSIPayload } = extractChips(fullText);
renderBubbleContent(bubbleEl, cleanText);
if (urgencia) prependUrgencyBadge(bubbleEl, urgencia);
history.push({ role: 'assistant', content: fullText });
saveHistory();
if (chips.length > 0) renderChips(chips, rowEl);
if (docGenPayload && docGenPayload.tipo && docGenPayload.datos) generateDocument(docGenPayload.tipo, docGenPayload.datos, rowEl);
if (templatePayload) downloadTemplate(templatePayload, rowEl);
if (ticketSSIPayload) crearTicketSSIDesdeChat(ticketSSIPayload, rowEl);

// POR:
renderBubbleContent(bubbleEl, fullText);
history.push({ role: 'assistant', content: fullText });
saveHistory();
```

- [ ] **Reemplazar la función `crearTicketSSIDesdeChat`** por `showTicketResult`

Eliminar `crearTicketSSIDesdeChat` (líneas 534–583) y reemplazar por:

```js
function showTicketResult(payload, triggerRow) {
  const btnRow = document.createElement('div');
  btnRow.className = 'doc-download-row';

  if (!payload.ok) {
    const err = document.createElement('p');
    err.className = 'doc-note';
    err.textContent = `❌ No se pudo crear el ticket: ${payload.error || 'Error desconocido'}`;
    btnRow.appendChild(err);
  } else {
    const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>`;
    const tag = document.createElement('span');
    tag.className = 'doc-download-btn';
    tag.style.cursor = 'default';
    tag.innerHTML = `${iconSvg} ${payload.mensaje}`;
    btnRow.appendChild(tag);
    const note = document.createElement('p');
    note.className = 'doc-note';
    note.textContent = 'Podés hacer seguimiento en webapp.inei.gob.pe/ssi';
    btnRow.appendChild(note);
  }

  if (triggerRow && triggerRow.parentNode === messagesEl) {
    triggerRow.insertAdjacentElement('afterend', btnRow);
  } else {
    messagesEl.appendChild(btnRow);
  }
  scrollToBottom();
}
```

- [ ] **Verificar en browser**

Abrir http://localhost:3000 y probar:
1. Mensaje normal → respuesta fluye como texto limpio (sin tags `[GENERAR_DOCUMENTO:...]` visibles)
2. Pedir un ANEXO y completar los datos → botón de descarga aparece
3. Pedir chips ("¿necesito un anexo?") → botones de chips aparecen
4. Reportar problema técnico → badge de urgencia aparece

- [ ] **Commit**

```bash
git add tools/ server.js public/chat.js
git commit -m "feat: migrar a Gemini Function Calling — eliminar sistema de tags ocultos"
```

---

## FASE 4 — Gemini Context Caching

> **Prerrequisito:** Verificar que el plan de API de Google AI Studio tiene Context Caching habilitado para `gemini-2.5-flash`. Si el init falla, el servidor usa `systemInstruction` directo como fallback — no es bloqueante.

### Task 16: Módulo de Context Cache

**Files:**
- Create: `cache/geminiCache.js`

- [ ] **Crear directorio `cache/`**

```bash
mkdir -p "D:/DATA ROBINSON/OTIN-2026/Sistemas Internos/Chatbot-Soporte/cache"
```

- [ ] **Crear `cache/geminiCache.js`**

```js
const { GoogleAICacheManager } = require('@google/generative-ai/server');

let cacheRef = null;
let cacheExpiresAt = null;
let renewTimer = null;

async function initCache(apiKey, systemPrompt) {
  const cacheManager = new GoogleAICacheManager(apiKey);
  const ttlSeconds = 3600;

  const cache = await cacheManager.create({
    model: 'models/gemini-2.5-flash',
    displayName: 'chatbot-otin-system-prompt',
    systemInstruction: { parts: [{ text: systemPrompt }] },
    ttlSeconds,
  });

  cacheRef = cache.name;
  cacheExpiresAt = Date.now() + (ttlSeconds - 60) * 1000;

  if (renewTimer) clearTimeout(renewTimer);
  renewTimer = setTimeout(() => {
    initCache(apiKey, systemPrompt).catch((err) => {
      console.error('Error renovando Gemini Context Cache:', err.message);
      cacheRef = null;
    });
  }, (ttlSeconds - 300) * 1000);

  console.log(`Gemini Context Cache activo: ${cacheRef}`);
  return cacheRef;
}

function getCacheRef() {
  if (cacheRef && cacheExpiresAt && Date.now() < cacheExpiresAt) return cacheRef;
  return null;
}

module.exports = { initCache, getCacheRef };
```

---

### Task 17: Integrar Context Cache en server.js

**Files:**
- Modify: `server.js`

- [ ] **Agregar import al inicio de server.js**

```js
const { initCache, getCacheRef } = require('./cache/geminiCache');
```

- [ ] **Reemplazar `app.listen` por `startServer`**

Al final de `server.js`, reemplazar:

```js
app.listen(PORT, () => {
  console.log(`Servidor OTIN Chatbot corriendo en http://localhost:${PORT}`);
});
```

Por:

```js
async function startServer() {
  try {
    await initCache(process.env.GEMINI_API_KEY, SYSTEM_PROMPT);
  } catch (err) {
    console.warn('Context Cache no disponible, usando systemInstruction directo:', err.message);
  }
  app.listen(PORT, () => {
    console.log(`Servidor OTIN Chatbot corriendo en http://localhost:${PORT}`);
  });
}

startServer();
```

- [ ] **Usar cacheRef en /api/chat**

Dentro del handler de `/api/chat`, reemplazar la creación del modelo:

```js
// ANTES:
const model = genAI.getGenerativeModel({
  model: 'models/gemini-2.5-flash',
  systemInstruction: SYSTEM_PROMPT,
  tools: [{ functionDeclarations: toolDeclarations }],
  toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
});

// POR:
const activeCacheRef = getCacheRef();
let model;

if (activeCacheRef) {
  model = genAI.getGenerativeModelFromCachedContent(
    { name: activeCacheRef },
    {
      tools: [{ functionDeclarations: toolDeclarations }],
      toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
    }
  );
} else {
  model = genAI.getGenerativeModel({
    model: 'models/gemini-2.5-flash',
    systemInstruction: SYSTEM_PROMPT,
    tools: [{ functionDeclarations: toolDeclarations }],
    toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
  });
}
```

- [ ] **Verificar que el servidor arranca con cache activo**

```bash
node server.js
```

Expected en consola:
```
Gemini Context Cache activo: cachedContents/xxxxxxxxxxxx
Servidor OTIN Chatbot corriendo en http://localhost:3000
```

Si aparece el warning `Context Cache no disponible`, el servidor sigue funcionando con `systemInstruction` directo — no es un error bloqueante.

- [ ] **Commit**

```bash
git add cache/geminiCache.js server.js
git commit -m "feat: Gemini Context Caching para SYSTEM_PROMPT — reduccion de tokens de input"
```

---

## Verificación Final

- [ ] **Test E2E completo**

```bash
node server.js
```

Abrir http://localhost:3000 y ejecutar los siguientes flujos:

1. **Flujo ANEXO 02:** Escribir "Necesito crear una cuenta de correo". Completar todos los datos que pide el asistente. Verificar que aparece botón de descarga `.docx`.

2. **Flujo urgencia:** Escribir "El servidor de toda el área no funciona". Verificar badge `CRÍTICO — P1`.

3. **Flujo chips:** Verificar que aparecen botones de respuesta rápida en las preguntas de triaje.

4. **Verificar métricas en PostgreSQL:**

```sql
SELECT tipo, payload, created_at
FROM events
ORDER BY created_at DESC
LIMIT 10;
```

5. **Verificar persistencia de sesión:** Cerrar pestaña, volver a http://localhost:3000, enviar un nuevo mensaje. El asistente debe tener contexto de la conversación anterior (viene de la DB vía cookie).

- [ ] **Agregar `docs/superpowers/plans/` al .gitignore si no querés commitear planes futuros**

```bash
# No hacer si querés versionar los planes
```

- [ ] **Commit final**

```bash
git add -A
git commit -m "chore: chatbot OTIN v2 — verificacion final completa"
```
