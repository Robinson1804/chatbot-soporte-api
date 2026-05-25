# Chatbot Mesa de Ayuda — OTIN / INEI

Asistente virtual para orientar a los trabajadores del INEI en el registro de solicitudes de soporte técnico en el Sistema de Servicios Informáticos (SSI).

## Requisitos

- **Node.js 18+**
- **API Key de Anthropic** — obtener en [console.anthropic.com](https://console.anthropic.com)

## Instalación

```bash
npm install
```

## Configuración

```bash
# Copiar el archivo de ejemplo
cp .env.example .env

# Editar .env y colocar tu API key real
ANTHROPIC_API_KEY=sk-ant-XXXXXXXXXXXXXX
```

## Ejecución

```bash
npm start
```

Abrir en el navegador: **http://localhost:3000**

## Estructura del proyecto

```
chatbot-otin/
├── server.js          # Servidor Express + proxy SSE a Anthropic API
├── package.json
├── .env.example       # Plantilla de variables de entorno
├── public/
│   ├── index.html     # Interfaz del chat
│   ├── style.css      # Estilos (paleta institucional INEI)
│   └── chat.js        # Lógica frontend con streaming SSE
└── README.md
```

## Cómo funciona

1. El frontend envía cada mensaje del usuario a `POST /api/chat` junto con el historial completo de la conversación.
2. El servidor llama a la API de Anthropic con streaming (`messages.stream()`).
3. Cada fragmento de texto se reenvía al navegador como Server-Sent Events (SSE).
4. El frontend los muestra token a token en tiempo real.
5. Al final del mensaje, se parsean los `[CHIPS: ...]` y se renderizan como botones de respuesta rápida.

## Personalización del system prompt

El system prompt está definido en `server.js` en la constante `SYSTEM_PROMPT` (línea ~5).  
Allí se definen las 7 categorías del SSI, los anexos requeridos, el flujo de triaje y el comportamiento del asistente.

Para modificar la personalidad, el tono o agregar nuevas categorías, editar esa constante directamente.

## Despliegue en producción

**Nunca incluir la API key en el código fuente.** Configurar como variable de entorno en la plataforma de despliegue:

- **Railway / Render / Fly.io**: agregar `ANTHROPIC_API_KEY` en el panel de variables de entorno.
- **Docker**: usar `--env` o un archivo `.env` montado como secreto.
- **VPS con PM2**: `pm2 start server.js --env production` con el `.env` en la raíz.

```bash
# Ejemplo PM2
pm2 start server.js --name chatbot-otin
pm2 save
```

## Notas de seguridad

- El historial de conversación vive solo en el browser (variable `history` en `chat.js`). No se persiste en el servidor.
- El endpoint `/api/chat` no tiene autenticación. En producción, agregar middleware de autenticación o restringir el acceso por red institucional.
