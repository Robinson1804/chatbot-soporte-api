# Chatbot OTIN v2 — Diseño de Mejoras

**Fecha:** 2026-06-01  
**Proyecto:** chatbot-soporte-api  
**Estado:** Aprobado

---

## Contexto

El chatbot Mesa de Ayuda OTIN/INEI está en producción con funcionalidad base: orientación de soporte, generación de documentos ANEXO 01-04 y creación automática de tickets SSI vía Playwright. Esta versión v2 resuelve 5 problemas identificados:

1. SYSTEM_PROMPT de ~500 líneas embebido en código — difícil de mantener
2. Endpoints sin protección — `/api/ticket-ssi` con credenciales SSI expuesto
3. Sin persistencia de conversaciones — historial se pierde al cerrar pestaña
4. Sin métricas — no hay visibilidad de uso real
5. Sistema de tags ocultos frágil — propenso a errores de parseo
6. Costo de tokens elevado — SYSTEM_PROMPT se envía en cada request

---

## Estrategia: 4 Fases Incrementales

Cada fase es deployable de forma independiente. Se mergea a `main` antes de iniciar la siguiente.

```
Fase 1  Quick Wins         → sin riesgo, valor inmediato
Fase 2  PostgreSQL         → persistencia + métricas
Fase 3  Function Calling   → refactor del protocolo de acción
Fase 4  Context Caching    → optimización de costo
```

---

## Fase 1 — Quick Wins

### Objetivo
Eliminar la deuda de mantenibilidad del SYSTEM_PROMPT y proteger los endpoints críticos.

### 1.1 Externalizar SYSTEM_PROMPT

**Problema:** `server.js` contiene ~500 líneas de prompt hardcodeado. Cualquier actualización de directorio, categorías o procedimientos requiere modificar código.

**Solución:** Mover el contenido a `prompts/system-prompt.md`. `server.js` lo carga al arrancar:

```js
const SYSTEM_PROMPT = fs.readFileSync(
  path.join(__dirname, 'prompts', 'system-prompt.md'),
  'utf8'
);
```

**Resultado:** El prompt es editable por cualquier miembro del equipo sin tocar código (requiere reinicio del servidor para que tome efecto). Se puede versionar y auditar por separado en git.

### 1.2 Rate Limiting

**Implementación:** `express-rate-limit` con límites por endpoint:

| Endpoint | Límite | Ventana |
|---|---|---|
| `/api/chat` | 30 requests | 1 minuto |
| `/api/generate` | 10 requests | 1 minuto |
| `/api/ticket-ssi` | 5 requests | 1 minuto |

Encapsulado en `middleware/rateLimiter.js`.

### 1.3 Validación de Red Interna para `/api/ticket-ssi`

`/api/ticket-ssi` ejecuta Playwright con las credenciales SSI del servidor. Solo debe aceptar requests desde la red interna del INEI.

**Implementación:** Middleware `middleware/internalOnly.js` que valida IP contra rango configurable en `.env`:

```
INTERNAL_IP_RANGE=10.0.0.0/8
```

Si la IP no coincide → `403 Forbidden`.

### Archivos — Fase 1

| Archivo | Acción |
|---|---|
| `prompts/system-prompt.md` | NUEVO — contenido del SYSTEM_PROMPT actual |
| `middleware/rateLimiter.js` | NUEVO — límites por endpoint |
| `middleware/internalOnly.js` | NUEVO — validación IP red interna |
| `server.js` | MODIFICAR — cargar prompt desde archivo, aplicar middlewares |

---

## Fase 2 — PostgreSQL: Persistencia + Métricas

### Objetivo
Persistir conversaciones entre sesiones y habilitar reportes de uso.

### 2.1 Schema de Base de Datos

```sql
-- Sesiones anónimas identificadas por UUID
CREATE TABLE sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata    JSONB DEFAULT '{}'
);

-- Mensajes de cada sesión
CREATE TABLE messages (
  id          BIGSERIAL PRIMARY KEY,
  session_id  UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role        VARCHAR(10) NOT NULL CHECK (role IN ('user', 'assistant')),
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_messages_session ON messages(session_id, created_at);

-- Eventos de acción para métricas
CREATE TABLE events (
  id          BIGSERIAL PRIMARY KEY,
  session_id  UUID REFERENCES sessions(id) ON DELETE SET NULL,
  tipo        VARCHAR(50) NOT NULL,
  payload     JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_events_tipo_created ON events(tipo, created_at);
```

**Tipos de evento registrados:**

| tipo | Cuándo se registra |
|---|---|
| `categoria_detectada` | Gemini clasifica el problema del usuario |
| `documento_generado` | POST /api/generate exitoso |
| `ticket_creado` | POST /api/ticket-ssi exitoso |
| `urgencia_asignada` | LLM emite nivel de urgencia P1-P4 |
| `error_ssi` | Playwright falla al crear ticket |

### 2.2 Gestión de Sesión

- Al primer mensaje, el servidor crea una sesión en PostgreSQL y devuelve un `sessionId` (UUID) en cookie `httpOnly; SameSite=Strict`
- Requests subsiguientes leen el `sessionId` de la cookie
- El historial que se envía a Gemini se lee de la DB (últimos 50 mensajes) en lugar de viajar en cada request desde el cliente

**Beneficio secundario:** el historial ya no viaja en el body de cada request — reduce el tamaño del payload.

### 2.3 Queries de Métricas (ejemplos)

```sql
-- Categorías más consultadas (últimos 30 días)
SELECT payload->>'categoria' AS categoria, COUNT(*) AS total
FROM events
WHERE tipo = 'categoria_detectada'
  AND created_at > NOW() - INTERVAL '30 days'
GROUP BY 1 ORDER BY 2 DESC;

-- Documentos generados por tipo
SELECT payload->>'tipo' AS tipo, COUNT(*) AS total
FROM events WHERE tipo = 'documento_generado'
GROUP BY 1 ORDER BY 2 DESC;

-- Tickets SSI creados vs errores (tasa de éxito)
SELECT tipo, COUNT(*) FROM events
WHERE tipo IN ('ticket_creado', 'error_ssi')
GROUP BY 1;

-- Conversaciones por día
SELECT DATE(created_at) AS dia, COUNT(*) AS sesiones
FROM sessions
GROUP BY 1 ORDER BY 1 DESC LIMIT 30;
```

### 2.4 Connection Pool

`db/pool.js` exporta un pool de conexiones con `pg` (node-postgres):

```js
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
module.exports = pool;
```

Variable de entorno: `DATABASE_URL=postgresql://user:pass@host:5432/chatbot_otin`

> **Nota desarrollo local:** Usar Docker `docker run -e POSTGRES_PASSWORD=dev -p 5432:5432 postgres:16` o una instancia local.

### Archivos — Fase 2

| Archivo | Acción |
|---|---|
| `db/pool.js` | NUEVO — pool de conexiones PostgreSQL |
| `db/migrations/001_init.sql` | NUEVO — schema completo |
| `db/queries.js` | NUEVO — funciones de acceso a datos |
| `middleware/session.js` | NUEVO — gestión de sessionId en cookie |
| `server.js` | MODIFICAR — integrar sesión, persistir mensajes, registrar eventos |
| `.env.example` | MODIFICAR — agregar DATABASE_URL |

---

## Fase 3 — Gemini Function Calling

### Objetivo
Reemplazar el sistema artesanal de tags ocultos por tool use nativo de Gemini, eliminando el parser de regex en el frontend.

### 3.1 Problema Actual

El LLM emite tags como:
```
[GENERAR_DOCUMENTO:{"tipo":"ANEXO02","datos":{...}}]
[CREAR_TICKET_SSI:{"titulo":"...","descripcion":"..."}]
```

`chat.js` los detecta con regex y los procesa. Si el LLM mete un salto de línea en el JSON, se rompe. El usuario puede inyectar texto que parezca un tag.

### 3.2 Tools Declaradas

```js
// tools/definitions.js
const tools = [
  {
    name: 'generate_document',
    description: 'Genera un documento Word (ANEXO 01-04) pre-completado con los datos del usuario',
    parameters: {
      type: 'object',
      properties: {
        tipo: { type: 'string', enum: ['ANEXO01', 'ANEXO02', 'ANEXO03', 'ANEXO04'] },
        datos: { type: 'object' }
      },
      required: ['tipo', 'datos']
    }
  },
  {
    name: 'create_ssi_ticket',
    description: 'Crea un ticket en el SSI directamente',
    parameters: {
      type: 'object',
      properties: {
        titulo:      { type: 'string' },
        descripcion: { type: 'string' },
        categoria:   { type: 'string' },
        sede:        { type: 'string' }
      },
      required: ['titulo', 'descripcion', 'categoria', 'sede']
    }
  },
  {
    name: 'download_template',
    description: 'Ofrece al usuario la descarga de una plantilla en blanco',
    parameters: {
      type: 'object',
      properties: {
        tipo: { type: 'string', enum: ['ANEXO01', 'ANEXO02', 'ANEXO03', 'ANEXO04'] }
      },
      required: ['tipo']
    }
  },
  {
    name: 'set_urgency',
    description: 'Establece el nivel de urgencia del problema reportado',
    parameters: {
      type: 'object',
      properties: {
        nivel: { type: 'string', enum: ['P1', 'P2', 'P3', 'P4'] }
      },
      required: ['nivel']
    }
  },
  {
    name: 'show_chips',
    description: 'Muestra botones de respuesta rápida al usuario',
    parameters: {
      type: 'object',
      properties: {
        opciones: { type: 'array', items: { type: 'string' } }
      },
      required: ['opciones']
    }
  }
];
```

### 3.3 Flujo en `/api/chat`

```
1. Gemini responde con tool_call (generate_document, create_ssi_ticket, etc.)
2. server.js ejecuta el handler correspondiente en tools/handlers.js
3. El resultado se devuelve al modelo como tool_result
4. El modelo genera la respuesta final de texto al usuario
5. El SSE al cliente entrega: texto limpio + eventos de acción estructurados
```

### 3.4 Cambios en el Frontend

`chat.js` elimina el parser de regex completo (~80 líneas). Recibe dos tipos de eventos SSE:

```js
// Texto del asistente
{ delta: "..." }

// Acción ejecutada por una tool
{ action: "document_ready", payload: { tipo: "ANEXO02", url: "/descargar/..." } }
{ action: "ticket_created", payload: { ticketNum: "INC-2025-001234" } }
{ action: "urgency", payload: { nivel: "P2" } }
{ action: "chips", payload: { opciones: ["Crear ticket", "Ver más"] } }
```

### Archivos — Fase 3

| Archivo | Acción |
|---|---|
| `tools/definitions.js` | NUEVO — declaración de tools para Gemini |
| `tools/handlers.js` | NUEVO — implementación de cada tool |
| `server.js` | MODIFICAR — integrar tool use en /api/chat |
| `public/chat.js` | MODIFICAR — eliminar parser de tags, manejar action events |

---

## Fase 4 — Gemini Context Caching

### Objetivo
Reducir el costo de tokens enviando el SYSTEM_PROMPT una sola vez por hora en lugar de en cada request.

### 4.1 Implementación

Al iniciar el servidor, se crea un cache del SYSTEM_PROMPT con la API de Gemini:

```js
// cache/geminiCache.js
async function initCache(genAI, promptContent) {
  const cache = await genAI.createCachedContent({
    model: 'models/gemini-2.5-flash',
    contents: [{ role: 'user', parts: [{ text: promptContent }] }],
    ttl: '3600s'
  });
  return cache.name; // referencia al cache
}
```

Cada request a `/api/chat` usa `cachedContent: cacheRef` en lugar de `systemInstruction`.

El cache se renueva automáticamente 5 minutos antes de expirar (job interno con `setInterval`).

### 4.2 Impacto estimado

| Escenario | Tokens input/request hoy | Con cache |
|---|---|---|
| Primer mensaje | ~2100 (prompt + msg) | ~100 (solo msg) |
| Mid-conversación (10 turns) | ~2100 + ~500 historial | ~500 (solo historial) |
| Ahorro estimado | — | ~70% tokens input |

### Archivos — Fase 4

| Archivo | Acción |
|---|---|
| `cache/geminiCache.js` | NUEVO — gestión del cache del SYSTEM_PROMPT |
| `server.js` | MODIFICAR — usar cacheRef en lugar de systemInstruction |

---

## Variables de Entorno Finales

```env
# Existentes
GEMINI_API_KEY=
SSI_USER=
SSI_PASS=
PORT=3000

# Fase 2
DATABASE_URL=postgresql://user:pass@host:5432/chatbot_otin

# Fase 1
INTERNAL_IP_RANGE=10.0.0.0/8
SKIP_IP_VALIDATION=false   # poner true solo en desarrollo local
```

---

## Estructura de Carpetas al Finalizar v2

```
Chatbot-Soporte/
├── cache/
│   └── geminiCache.js          # Fase 4
├── db/
│   ├── migrations/
│   │   └── 001_init.sql        # Fase 2
│   ├── pool.js                 # Fase 2
│   └── queries.js              # Fase 2
├── middleware/
│   ├── internalOnly.js         # Fase 1
│   ├── rateLimiter.js          # Fase 1
│   └── session.js              # Fase 2
├── prompts/
│   └── system-prompt.md        # Fase 1
├── public/
│   ├── chat.js                 # Fase 3 (refactor)
│   ├── index.html
│   └── style.css
├── tools/
│   ├── definitions.js          # Fase 3
│   └── handlers.js             # Fase 3
├── generators.js
├── server.js                   # Modificado en todas las fases
├── ssi-automation.js
└── .env
```

---

## Criterios de Éxito por Fase

| Fase | Criterio |
|---|---|
| 1 | `prompts/system-prompt.md` editable sin modificar código (reinicio de servidor aplica cambios). Endpoint `/api/ticket-ssi` rechaza requests fuera de red interna con 403. |
| 2 | Historial persiste al cerrar y reabrir el browser. Query de métricas devuelve datos reales. |
| 3 | Cero tags ocultos en las respuestas del LLM. `chat.js` sin regex de parseo. |
| 4 | Logs confirman que el cache se reutiliza. Costo de tokens input reducido ≥50%. |
