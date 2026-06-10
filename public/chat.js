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
  'Buenos días. Soy el asistente virtual de la Mesa de Ayuda de la OTIN.\n' +
  '¿Me podría decir su nombre para poder atenderle mejor?';

/* ============================================================
   INICIALIZACIÓN
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  loadHistory();
  showWelcome();
  userInput.focus();
});

function showWelcome() {
  appendBotMessage(WELCOME_TEXT);
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
    let streamDone = false;

    while (!streamDone) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;

        const payload = line.slice(6).trim();

        if (payload === '[DONE]') {
          streamDone = true;
          break;
        }

        try {
          const parsed = JSON.parse(payload);

          if (parsed.ping) {
            continue;
          }

          if (parsed.error) {
            bubbleEl.textContent = parsed.error;
            bubbleEl.classList.add('error-bubble');
            streamDone = true;
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

    if (fullText.trim()) {
      history.push({ role: 'assistant', content: fullText });
      saveHistory();
    }
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

/* ============================================================
   LABELS / NOMBRES DE DOCUMENTOS
   ============================================================ */

function getTipoLabel(tipo, datos = {}) {
  const modalidad = String(datos?.modalidad || '').toLowerCase();

  const labels = {
    ANEXO01_INDIVIDUAL: 'ANEXO 01 Individual',
    ANEXO01_GRUPAL: 'ANEXO 01 Grupal',
    ANEXO01_VPN: 'ANEXO 01 VPN',
    ANEXO02_INDIVIDUAL: 'ANEXO 02 Individual',
    ANEXO02_GRUPAL: 'ANEXO 02 Grupal',
    ANEXO03: 'ANEXO 03',
    ANEXO04: 'ANEXO 04',
    ANEXO07: 'ANEXO 07',
    PROD02: 'PROD-02',
    F01: 'F-01',
  };

  if (labels[tipo]) return labels[tipo];

  if (tipo === 'ANEXO01') {
    if (modalidad === 'vpn') return 'ANEXO 01 VPN';
    if (modalidad === 'grupal') return 'ANEXO 01 Grupal';
    return 'ANEXO 01 Individual';
  }

  if (tipo === 'ANEXO02') {
    if (modalidad === 'grupal') return 'ANEXO 02 Grupal';
    return 'ANEXO 02 Individual';
  }

  return tipo;
}

function getDocFilename(tipo, datos = {}) {
  const label = getTipoLabel(tipo, datos)
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '');

  const name = (
    datos.nombres ||
    datos.usuarioSolicitante ||
    datos.area ||
    datos.oficina ||
    datos.direccion ||
    'documento'
  )
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '')
    .substring(0, 30);

  return `${label}_${name}.docx`;
}

function getTemplateFilename(tipo) {
  return `${getTipoLabel(tipo).replace(/\s+/g, '_')}_plantilla_INEI.docx`;
}

/* ============================================================
   ACTION EVENTS DESDE EL BACKEND
   ============================================================ */

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
        const tipoLabel = getTipoLabel(payload.tipo);

        if (
          !bubbleEl.textContent.trim() ||
          bubbleEl.textContent.trim() === 'Procesando su solicitud...'
        ) {
          renderBubbleContent(
            bubbleEl,
            `Aquí tiene la plantilla en blanco del ${tipoLabel}. Complétela con sus datos y adjúntela firmada al SSI.`
          );
        }

        const link = document.createElement('a');
        link.href = `/api/template/${payload.tipo}`;
        link.download = getTemplateFilename(payload.tipo);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
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
  avatar.innerHTML = `<img src="Bot-icon.png" alt="Bot" class="bot-msg-avatar-img" />`;
  return avatar;
}

/* ============================================================
   RENDERIZADO DE TEXTO — MARKDOWN MÍNIMO
   ============================================================ */

function renderBubbleContent(el, text) {
  el.innerHTML = simpleMarkdown(text);
}

function simpleMarkdown(text) {
  if (!text) return '';

  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+?)\*/g, '<em>$1</em>');
  html = html.replace(/`([^`]+?)`/g, '<code>$1</code>');

  html = html.replace(/^### (.+)$/gm, '<strong>$1</strong>');
  html = html.replace(/^## (.+)$/gm, '<strong>$1</strong>');
  html = html.replace(/^# (.+)$/gm, '<strong>$1</strong>');

  html = html.replace(/^[-*] (.+)$/gm, '<li data-ul>$1</li>');
  html = html.replace(/^\d+\. (.+)$/gm, '<li data-ol>$1</li>');

  html = html.replace(/(<\/li>)\n\n(<li)/g, '$1\n$2');

  html = html.replace(/(<li data-ul>.*<\/li>(\n|$))+/g, (match) => `<ul>${match}</ul>`);
  html = html.replace(/(<li data-ol>.*<\/li>(\n|$))+/g, (match) => `<ol>${match}</ol>`);

  html = html.replace(/<li data-ul>/g, '<li>').replace(/<li data-ol>/g, '<li>');

  const paragraphs = html.split(/\n{2,}/);

  html = paragraphs
    .map((p) => {
      const trimmed = p.trim();
      if (!trimmed) return '';

      if (
        trimmed.startsWith('<ul>') ||
        trimmed.startsWith('<ol>') ||
        trimmed.startsWith('<li>') ||
        trimmed.startsWith('<strong>')
      ) {
        return trimmed;
      }

      return '<p>' + trimmed.replace(/\n/g, '<br>') + '</p>';
    })
    .filter(Boolean)
    .join('');

  return html;
}

/* ============================================================
   GENERACIÓN DE DOCUMENTOS
   ============================================================ */

async function generateDocument(tipo, datos, triggerRow) {
  const btnRow = document.createElement('div');
  btnRow.className = 'doc-download-row';

  const iconSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
      fill="currentColor" width="16" height="16">
      <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
    </svg>
  `;

  const tipoLabel = getTipoLabel(tipo, datos);

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

      if (!response.ok) {
        let detail = 'Error del servidor';

        try {
          const errorBody = await response.json();
          detail = errorBody.error || errorBody.detail || detail;
        } catch {}

        throw new Error(detail);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = getDocFilename(tipo, datos);
      a.click();

      URL.revokeObjectURL(url);

      btn.innerHTML = `${iconSvg} Descargado ✓`;
      btn.classList.add('doc-download-btn--done');
    } catch (err) {
      btn.disabled = false;
      btn.innerHTML = `${iconSvg} Reintentar descarga`;
      console.error('Error generando documento:', err);

      const noteError = document.createElement('p');
      noteError.className = 'doc-note';
      noteError.textContent = `No se pudo generar el documento: ${err.message}`;
      btnRow.appendChild(noteError);
    }
  });

  const note = document.createElement('p');
  note.className = 'doc-note';
  note.textContent =
    'El documento viene con sus datos pre-completados. Solo necesita las firmas requeridas antes de enviarlo a la OTIN.';

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
   CHIPS
   ============================================================ */

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
    const iconSvg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
        fill="currentColor" width="16" height="16">
        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
      </svg>
    `;

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
   PERSISTENCIA DE SESIÓN
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

const FULL_WIDTH_IDS = [
  'nombres',
  'nombreCompleto',
  'direccion',
  'oficina',
  'area',
  'justificacion',
  'justificacionRemoto',
  'justificacionUSB',
  'proposito',
  'descripcion',
  'recurso',
  'carpeta',
  'carpetaCompartida',
  'servidor',
  'numeroOS',
  'correo',
  'correoInstitucional',
  'correoPersonal',
  'telefono',
  'tipoSolicitud',
  'tipoAcceso',
  'hostEquipo',
  'nombreDirector',
  'nombresSolicitante',
  'solicitante',
  'director',
  'jefeArea',
  'usuarioSolicitante',
];

const VALIDACIONES = {
  dni: {
    pattern: /^\d{8}$/,
    mensaje: 'El DNI debe tener exactamente 8 dígitos numéricos.',
  },
  telefono: {
    pattern: /^[\d\s\-\+\(\)]{7,15}$/,
    mensaje: 'Ingrese un número de teléfono válido (7 a 15 dígitos).',
  },
  correo: {
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    mensaje: 'Ingrese un correo electrónico válido.',
  },
  correoInstitucional: {
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    mensaje: 'Ingrese un correo institucional válido. Puede dejarse en blanco si es nueva creación.',
  },
  correoPersonal: {
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    mensaje: 'Ingrese un correo personal válido.',
  },
  nombres: {
    minLength: 3,
    mensaje: 'Ingrese el nombre completo, mínimo 3 caracteres.',
  },
  fechaInicio: {
    isDate: true,
    mensaje: 'Ingrese una fecha válida.',
  },
  fechaTermino: {
    isDate: true,
    afterField: 'fechaInicio',
    mensaje: 'La fecha de término debe ser posterior a la fecha de inicio.',
  },
  fechaInicioContrato: {
    isDate: true,
    mensaje: 'Ingrese una fecha válida.',
  },
  fechaTerminoContrato: {
    isDate: true,
    afterField: 'fechaInicioContrato',
    mensaje: 'La fecha de término del contrato debe ser posterior a la fecha de inicio.',
  },
  fechaInicioAcceso: {
    isDate: true,
    mensaje: 'Ingrese una fecha válida.',
  },
  fechaTerminoAcceso: {
    isDate: true,
    afterField: 'fechaInicioAcceso',
    mensaje: 'La fecha de término del acceso debe ser posterior a la fecha de inicio.',
  },
  numeroOS: {
    pattern: /^[a-zA-Z0-9\-\/\s]*$/,
    mensaje: 'El número de OS solo puede contener letras, números, guiones, espacios o barras.',
  },
};

function validateField(field) {
  const id = field.name;
  const value = field.value.trim();
  const rules = VALIDACIONES[id];

  if (field.required && !value) {
    return 'Este campo es obligatorio.';
  }

  if (!value) return null;
  if (!rules) return null;

  if (rules.pattern && !rules.pattern.test(value)) return rules.mensaje;
  if (rules.minLength && value.length < rules.minLength) return rules.mensaje;

  if (rules.isDate) {
    const ddmmyyyy = /^\d{2}\/\d{2}\/\d{4}$/.test(value);
    const yyyymmdd = /^\d{4}-\d{2}-\d{2}$/.test(value);

    if (!ddmmyyyy && !yyyymmdd) return rules.mensaje;
  }

  return null;
}

function showFieldError(field, mensaje) {
  field.classList.add('field-error');

  const prev = field.parentElement.querySelector('.field-error-msg');
  if (prev) prev.remove();

  const span = document.createElement('span');
  span.className = 'field-error-msg';
  span.textContent = mensaje;

  field.parentElement.appendChild(span);
}

function clearFieldError(field) {
  field.classList.remove('field-error');

  const prev = field.parentElement.querySelector('.field-error-msg');
  if (prev) prev.remove();
}

function escapeHtmlAttr(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderForm({ titulo, campos }, triggerRow) {
  const formId = 'form-' + Date.now();

  const fieldsHtml = campos.map((campo) => {
    const isFullWidth = FULL_WIDTH_IDS.includes(campo.id) || campo.tipo === 'select' || campo.tipo === 'textarea';
    const fieldClass = `form-field${isFullWidth ? ' full-width' : ''}`;
    const requiredMark = campo.requerido ? ' <span class="required">*</span>' : '';
    const requiredAttr = campo.requerido ? 'required' : '';
    const placeholder = escapeHtmlAttr(campo.placeholder || '');

    if (campo.tipo === 'select' && campo.opciones?.length) {
      const opts = campo.opciones
        .map((o) => `<option value="${escapeHtmlAttr(o)}">${escapeHtmlAttr(o)}</option>`)
        .join('');

      return `
        <div class="${fieldClass}">
          <label for="${formId}-${campo.id}">${campo.label}${requiredMark}</label>
          <select id="${formId}-${campo.id}" name="${campo.id}" ${requiredAttr}>
            <option value="">Seleccionar...</option>
            ${opts}
          </select>
        </div>`;
    }

    if (campo.tipo === 'textarea') {
      return `
        <div class="${fieldClass}">
          <label for="${formId}-${campo.id}">${campo.label}${requiredMark}</label>
          <textarea
            id="${formId}-${campo.id}"
            name="${campo.id}"
            placeholder="${placeholder}"
            ${requiredAttr}
            oninput="this.classList.remove('field-error'); const m = this.parentElement.querySelector('.field-error-msg'); if(m) m.remove();"
          ></textarea>
        </div>`;
    }

    return `
      <div class="${fieldClass}">
        <label for="${formId}-${campo.id}">${campo.label}${requiredMark}</label>
        <input
          type="${campo.tipo === 'date' ? 'date' : campo.tipo === 'number' ? 'number' : 'text'}"
          id="${formId}-${campo.id}"
          name="${campo.id}"
          placeholder="${placeholder}"
          ${requiredAttr}
          oninput="this.classList.remove('field-error'); const m = this.parentElement.querySelector('.field-error-msg'); if(m) m.remove();"
        >
      </div>`;
  }).join('');

  const formHtml = `
    <div class="chat-form-card" id="${formId}">
      <div class="chat-form-title">${escapeHtmlAttr(titulo)}</div>
      <div class="chat-form-fields">${fieldsHtml}</div>
      <button class="chat-form-submit" onclick="submitChatForm('${formId}')">
        ✓ Registrar
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

function parseDateInput(value) {
  if (!value) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00`);
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
    const [d, m, y] = value.split('/');
    return new Date(`${y}-${m}-${d}T00:00:00`);
  }

  return null;
}

function validateDateOrder(card, startName, endName, message) {
  const start = card.querySelector(`[name="${startName}"]`);
  const end = card.querySelector(`[name="${endName}"]`);

  if (!start || !end || !start.value || !end.value) return true;

  const startDate = parseDateInput(start.value);
  const endDate = parseDateInput(end.value);

  if (!startDate || !endDate) return true;

  if (endDate <= startDate) {
    showFieldError(end, message);
    return false;
  }

  return true;
}

function submitChatForm(formId) {
  const card = document.getElementById(formId);
  if (!card) return;

  const fields = card.querySelectorAll('input, select, textarea');
  const data = {};
  let valid = true;

  fields.forEach((f) => {
    clearFieldError(f);

    const error = validateField(f);

    if (error) {
      showFieldError(f, error);
      valid = false;
    } else {
      data[f.name] = f.value.trim();
    }
  });

  if (!validateDateOrder(card, 'fechaInicio', 'fechaTermino', 'La fecha de término debe ser posterior a la fecha de inicio.')) {
    valid = false;
  }

  if (!validateDateOrder(card, 'fechaInicioContrato', 'fechaTerminoContrato', 'La fecha de término del contrato debe ser posterior a la fecha de inicio.')) {
    valid = false;
  }

  if (!validateDateOrder(card, 'fechaInicioAcceso', 'fechaTerminoAcceso', 'La fecha de término del acceso debe ser posterior a la fecha de inicio.')) {
    valid = false;
  }

  if (!valid) return;

  const mensaje = Object.entries(data)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');

  card.querySelectorAll('input, select, textarea, button').forEach((el) => {
    el.disabled = true;
  });

  card.querySelector('.chat-form-submit').textContent = '✓ Enviado';

  sendMessage(mensaje);
}

window.submitChatForm = submitChatForm;