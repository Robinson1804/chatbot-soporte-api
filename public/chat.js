/* ============================================================
   CHATBOT OTIN — Frontend logic con SSE streaming + generación de documentos
   ============================================================ */

let history = [];
let isStreaming = false;

const messagesEl = document.getElementById('messages');
const userInput  = document.getElementById('userInput');
const sendBtn    = document.getElementById('sendBtn');
const resetBtn   = document.getElementById('resetBtn');

const WELCOME_TEXT =
  'Buenos días. Soy el asistente virtual de la Mesa de Ayuda de la OTIN.\n\n' +
  'Estoy aquí para orientarle en el registro de solicitudes de soporte técnico en el SSI.\n\n' +
  '¿En qué puedo ayudarle hoy?';

const WELCOME_CHIPS = [
  'Crear cuenta de correo',
  'Acceso remoto (VPN)',
  'No funciona internet',
  'Acceso a carpeta del servidor',
  'Instalar software',
];

/* ============================================================
   INICIALIZACIÓN
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  loadHistory();
  showWelcome();
  userInput.focus();
});

function showWelcome() {
  appendBotMessage(WELCOME_TEXT, WELCOME_CHIPS);
}

/* ============================================================
   ENVÍO DE MENSAJES
   ============================================================ */
sendBtn.addEventListener('click', handleSend);

userInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
});

function handleSend() {
  const text = userInput.value.trim();
  if (!text || isStreaming) return;
  userInput.value = '';
  sendMessage(text);
}

async function sendMessage(text) {
  if (isStreaming) return;

  appendUserMessage(text);
  history.push({ role: 'user', content: text });
  saveHistory();

  removeChips();
  setStreaming(true);

  const typingRow = appendTypingIndicator();

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    typingRow.remove();

    const { bubbleEl, rowEl } = appendBotBubbleEmpty();
    let fullText = '';

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();

        if (payload === '[DONE]') break;

        try {
          const parsed = JSON.parse(payload);

          if (parsed.ping) {
            continue; // heartbeat del servidor — ignorar
          }

          if (parsed.error) {
            bubbleEl.textContent = parsed.error;
            bubbleEl.classList.add('error-bubble');
            break;
          }

          if (parsed.delta) {
            fullText += parsed.delta;
            renderBubbleContent(bubbleEl, fullText);
            scrollToBottom();
          }

          if (parsed.action) {
            handleActionEvent(parsed.action, parsed.payload, rowEl, bubbleEl);
          }
        } catch {
          /* línea SSE malformada — ignorar */
        }
      }
    }

    renderBubbleContent(bubbleEl, fullText);
    history.push({ role: 'assistant', content: fullText });
    saveHistory();

  } catch (err) {
    typingRow.remove();
    appendBotMessage(
      'Lo siento, ocurrió un error de conexión. Por favor intente nuevamente.',
      [],
      true
    );
    console.error('Chat error:', err);
  } finally {
    setStreaming(false);
    scrollToBottom();
    userInput.focus();
  }
}

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
    case 'show_form':
      if (payload.ok && payload.titulo && payload.campos?.length) {
        renderForm(payload, rowEl);
      }
      break;
  }
}

/* ============================================================
   RENDERIZADO DE BURBUJAS
   ============================================================ */
function appendUserMessage(text) {
  const row = document.createElement('div');
  row.className = 'message-row user';

  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar';
  avatar.textContent = 'TÚ';

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.textContent = text;

  row.appendChild(bubble);
  row.appendChild(avatar);
  messagesEl.appendChild(row);
  scrollToBottom();
}

function appendBotMessage(text, chips = [], isError = false) {
  const row = document.createElement('div');
  row.className = 'message-row bot';

  const avatar = makeBotAvatar();

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble' + (isError ? ' error-bubble' : '');
  renderBubbleContent(bubble, text);

  row.appendChild(avatar);
  row.appendChild(bubble);
  messagesEl.appendChild(row);

  if (chips.length > 0) {
    renderChips(chips, row);
  }

  scrollToBottom();
}

function appendBotBubbleEmpty() {
  const row = document.createElement('div');
  row.className = 'message-row bot';

  const avatar = makeBotAvatar();

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.textContent = '';

  row.appendChild(avatar);
  row.appendChild(bubble);
  messagesEl.appendChild(row);

  return { bubbleEl: bubble, rowEl: row };
}

function appendTypingIndicator() {
  const row = document.createElement('div');
  row.className = 'message-row bot';

  const avatar = makeBotAvatar();

  const indicator = document.createElement('div');
  indicator.className = 'typing-indicator';
  for (let i = 0; i < 3; i++) {
    const dot = document.createElement('span');
    dot.className = 'typing-dot';
    indicator.appendChild(dot);
  }

  row.appendChild(avatar);
  row.appendChild(indicator);
  messagesEl.appendChild(row);
  scrollToBottom();

  return row;
}

function makeBotAvatar() {
  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar';
  avatar.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
    <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7H3a7 7 0 0 1 7-7h1V5.73A2 2 0 0 1 10 4a2 2 0 0 1 2-2zM7.5 13a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm9 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM3 21v-1a5 5 0 0 1 5-5h8a5 5 0 0 1 5 5v1H3z"/>
  </svg>`;
  return avatar;
}

/* ============================================================
   RENDERIZADO DE TEXTO (markdown mínimo)
   ============================================================ */
function renderBubbleContent(el, text) {
  el.innerHTML = simpleMarkdown(text);
}

function simpleMarkdown(text) {
  if (!text) return '';

  /* Escapar HTML básico */
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  /* Negrita: **texto** */
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  /* Cursiva: *texto* */
  html = html.replace(/\*([^*]+?)\*/g, '<em>$1</em>');

  /* Código inline: `texto` */
  html = html.replace(/`([^`]+?)`/g, '<code>$1</code>');

  /* Headers: ### ## # */
  html = html.replace(/^### (.+)$/gm, '<strong>$1</strong>');
  html = html.replace(/^## (.+)$/gm, '<strong>$1</strong>');
  html = html.replace(/^# (.+)$/gm, '<strong>$1</strong>');

  /* Listas: marcamos el tipo antes de envolver para no confundir los regex */
  html = html.replace(/^[-*] (.+)$/gm, '<li data-ul>$1</li>');
  html = html.replace(/^\d+\. (.+)$/gm, '<li data-ol>$1</li>');

  /* Colapsar líneas en blanco entre items del mismo tipo */
  html = html.replace(/(<\/li>)\n\n(<li)/g, '$1\n$2');

  /* Envolver bloques contiguos de <li data-ul> en <ul> */
  html = html.replace(/(<li data-ul>.*<\/li>(\n|$))+/g, (match) => `<ul>${match}</ul>`);

  /* Envolver bloques contiguos de <li data-ol> en <ol> */
  html = html.replace(/(<li data-ol>.*<\/li>(\n|$))+/g, (match) => `<ol>${match}</ol>`);

  /* Eliminar los atributos temporales data-ul / data-ol */
  html = html.replace(/<li data-ul>/g, '<li>').replace(/<li data-ol>/g, '<li>');

  /* Líneas en blanco → párrafos */
  const paragraphs = html.split(/\n{2,}/);
  html = paragraphs
    .map((p) => {
      const trimmed = p.trim();
      if (!trimmed) return '';
      if (trimmed.startsWith('<ul>') || trimmed.startsWith('<ol>') || trimmed.startsWith('<li>') || trimmed.startsWith('<strong>')) {
        return trimmed;
      }
      /* Saltos de línea dentro del párrafo */
      return '<p>' + trimmed.replace(/\n/g, '<br>') + '</p>';
    })
    .filter(Boolean)
    .join('');

  return html;
}

/* ============================================================
   CHIPS
   ============================================================ */
/* ============================================================
   GENERACIÓN DE DOCUMENTOS
   ============================================================ */
async function generateDocument(tipo, datos, triggerRow) {
  // Mostrar botón de descarga junto al mensaje del bot
  const btnRow = document.createElement('div');
  btnRow.className = 'doc-download-row';

  const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>`;
  const tipoLabel = { ANEXO01: 'ANEXO 01', ANEXO02: 'ANEXO 02', ANEXO03: 'ANEXO 03', ANEXO04: 'ANEXO 04' }[tipo] || tipo;

  const btn = document.createElement('button');
  btn.className = 'doc-download-btn';
  btn.innerHTML = `${iconSvg} Descargar ${tipoLabel} pre-completado (.docx)`;
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.innerHTML = `<span class="doc-spinner"></span> Generando Word...`;
    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo, datos }),
      });
      if (!response.ok) throw new Error('Error del servidor');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${tipo}_${(datos.nombres || 'documento').replace(/\s+/g, '_').substring(0, 30)}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      btn.innerHTML = `${iconSvg} Descargado ✓`;
      btn.classList.add('doc-download-btn--done');
    } catch (err) {
      btn.disabled = false;
      btn.innerHTML = `${iconSvg} Reintentar descarga`;
      console.error('Error generando documento:', err);
    }
  });

  const note = document.createElement('p');
  note.className = 'doc-note';
  note.textContent = 'El documento viene con sus datos pre-completados. Solo necesita las firmas requeridas antes de enviarlo a la OTIN.';

  btnRow.appendChild(btn);
  btnRow.appendChild(note);

  if (triggerRow && triggerRow.parentNode === messagesEl) {
    triggerRow.insertAdjacentElement('afterend', btnRow);
  } else {
    messagesEl.appendChild(btnRow);
  }

  scrollToBottom();
}

function renderChips(chips, afterRow) {
  const chipsRow = document.createElement('div');
  chipsRow.className = 'chips-row';

  chips.forEach((chip) => {
    const btn = document.createElement('button');
    btn.className = 'chip-btn';
    btn.textContent = chip;
    btn.addEventListener('click', () => {
      if (isStreaming) return;
      removeChips();
      sendMessage(chip);
    });
    chipsRow.appendChild(btn);
  });

  if (afterRow && afterRow.parentNode === messagesEl) {
    afterRow.insertAdjacentElement('afterend', chipsRow);
  } else {
    messagesEl.appendChild(chipsRow);
  }

  scrollToBottom();
}

function removeChips() {
  messagesEl.querySelectorAll('.chips-row').forEach((el) => el.remove());
}

/* ============================================================
   RESET
   ============================================================ */
resetBtn.addEventListener('click', resetConversation);

async function resetConversation() {
  history = [];
  sessionStorage.removeItem('otin-history');
  messagesEl.innerHTML = '';
  await fetch('/api/reset', { method: 'POST' }).catch(() => {});
  showWelcome();
  userInput.focus();
}

/* ============================================================
   UTILIDADES
   ============================================================ */
function setStreaming(value) {
  isStreaming = value;
  userInput.disabled = value;
  sendBtn.disabled = value;
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  });
}

/* ============================================================
   BADGE DE URGENCIA
   ============================================================ */
const URGENCIA_CONFIG = {
  P1: { label: 'CRÍTICO — P1', cls: 'urgency-p1' },
  P2: { label: 'URGENTE — P2', cls: 'urgency-p2' },
  P3: { label: 'NORMAL — P3',  cls: 'urgency-p3' },
  P4: { label: 'BAJO — P4',    cls: 'urgency-p4' },
};

function prependUrgencyBadge(bubbleEl, nivel) {
  const cfg = URGENCIA_CONFIG[nivel];
  if (!cfg) return;
  const badge = document.createElement('div');
  badge.className = `urgency-badge ${cfg.cls}`;
  badge.textContent = cfg.label;
  bubbleEl.prepend(badge);
}

/* ============================================================
   DESCARGA DE PLANTILLA EN BLANCO
   ============================================================ */
function downloadTemplate(tipo, triggerRow) {
  const btnRow = document.createElement('div');
  btnRow.className = 'doc-download-row';

  const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>`;
  const tipoLabel = { ANEXO01: 'ANEXO 01', ANEXO02: 'ANEXO 02', ANEXO03: 'ANEXO 03', ANEXO04: 'ANEXO 04' }[tipo] || tipo;

  const btn = document.createElement('a');
  btn.className = 'doc-download-btn doc-download-btn--blank';
  btn.href = `/api/template/${tipo}`;
  btn.download = `${tipo}_plantilla_INEI.docx`;
  btn.innerHTML = `${iconSvg} Descargar plantilla en blanco — ${tipoLabel} (.docx)`;

  const note = document.createElement('p');
  note.className = 'doc-note';
  note.textContent = 'Plantilla oficial en blanco. Completá los datos manualmente y adjuntala firmada al SSI.';

  btnRow.appendChild(btn);
  btnRow.appendChild(note);

  if (triggerRow && triggerRow.parentNode === messagesEl) {
    triggerRow.insertAdjacentElement('afterend', btnRow);
  } else {
    messagesEl.appendChild(btnRow);
  }

  scrollToBottom();
}

/* ============================================================
   CREACIÓN DE TICKET SSI AUTOMÁTICO
   ============================================================ */
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

/* ============================================================
   PERSISTENCIA DE SESIÓN (sessionStorage)
   ============================================================ */
function saveHistory() {
  try {
    sessionStorage.setItem('otin-history', JSON.stringify(history));
  } catch {}
}

function loadHistory() {
  try {
    const saved = sessionStorage.getItem('otin-history');
    if (saved) history = JSON.parse(saved);
  } catch {}
}

/* ============================================================
   FORMULARIO INLINE EN EL CHAT
   ============================================================ */
function renderForm({ titulo, campos }, triggerRow) {
  const formId = 'form-' + Date.now();

  const fieldsHtml = campos.map((campo) => {
    if (campo.tipo === 'select' && campo.opciones?.length) {
      const opts = campo.opciones
        .map((o) => `<option value="${o}">${o}</option>`)
        .join('');
      return `
        <div class="form-field">
          <label for="${formId}-${campo.id}">${campo.label}${campo.requerido ? ' <span class="required">*</span>' : ''}</label>
          <select id="${formId}-${campo.id}" name="${campo.id}" ${campo.requerido ? 'required' : ''}>
            <option value="">Seleccionar...</option>
            ${opts}
          </select>
        </div>`;
    }
    return `
      <div class="form-field">
        <label for="${formId}-${campo.id}">${campo.label}${campo.requerido ? ' <span class="required">*</span>' : ''}</label>
        <input
          type="${campo.tipo === 'date' ? 'date' : campo.tipo === 'number' ? 'number' : 'text'}"
          id="${formId}-${campo.id}"
          name="${campo.id}"
          placeholder="${campo.placeholder || ''}"
          ${campo.requerido ? 'required' : ''}
        >
      </div>`;
  }).join('');

  const formHtml = `
    <div class="chat-form-card" id="${formId}">
      <div class="chat-form-title">${titulo}</div>
      <div class="chat-form-fields">${fieldsHtml}</div>
      <button class="chat-form-submit" onclick="submitChatForm('${formId}')">
        Registrar
      </button>
    </div>`;

  const msgDiv = document.createElement('div');
  msgDiv.className = 'message-row bot form-message';
  msgDiv.innerHTML = formHtml;

  if (triggerRow && triggerRow.parentNode === messagesEl) {
    triggerRow.insertAdjacentElement('afterend', msgDiv);
  } else {
    messagesEl.appendChild(msgDiv);
  }

  scrollToBottom();
}

function submitChatForm(formId) {
  const card = document.getElementById(formId);
  if (!card) return;

  const fields = card.querySelectorAll('input, select');
  const data = {};
  let valid = true;

  fields.forEach((f) => {
    if (f.required && !f.value.trim()) {
      f.classList.add('field-error');
      valid = false;
    } else {
      f.classList.remove('field-error');
      data[f.name] = f.value.trim();
    }
  });

  if (!valid) return;

  // Formatear los datos como mensaje legible
  const mensaje = Object.entries(data)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');

  // Deshabilitar el formulario para que no se pueda reenviar
  card.querySelectorAll('input, select, button').forEach((el) => el.disabled = true);
  card.querySelector('.chat-form-submit').textContent = 'Enviado';

  sendMessage(mensaje);
}

// Exponer para uso desde atributos onclick en el HTML del formulario
window.submitChatForm = submitChatForm;
