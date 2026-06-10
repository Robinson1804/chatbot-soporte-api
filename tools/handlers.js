const { crearTicketSSI } = require('../ssi-automation');
const { saveEvent } = require('../db/queries');

function normalizeTipo(tipo) {
  return String(tipo || '').trim().toUpperCase();
}

function normalizeGenerateTipo(tipo, datos = {}) {
  const normalized = normalizeTipo(tipo);

  if (normalized === 'ANEXO01_INDIVIDUAL') {
    return { tipo: 'ANEXO01', datos: { ...datos, modalidad: 'individual' } };
  }

  if (normalized === 'ANEXO01_GRUPAL') {
    return { tipo: 'ANEXO01', datos: { ...datos, modalidad: 'grupal' } };
  }

  if (normalized === 'ANEXO01_VPN') {
    return { tipo: 'ANEXO01', datos: { ...datos, modalidad: 'vpn' } };
  }

  if (normalized === 'ANEXO02_INDIVIDUAL') {
    return { tipo: 'ANEXO02', datos: { ...datos, modalidad: 'individual' } };
  }

  if (normalized === 'ANEXO02_GRUPAL') {
    return { tipo: 'ANEXO02', datos: { ...datos, modalidad: 'grupal' } };
  }

  return { tipo: normalized, datos };
}

async function handleGenerateDocument({ tipo, datos }) {
  const normalized = normalizeGenerateTipo(tipo, datos || {});
  const allowed = ['ANEXO01', 'ANEXO02', 'ANEXO03', 'ANEXO04', 'ANEXO07'];

  if (!allowed.includes(normalized.tipo)) {
    return { ok: false, error: `Tipo no válido: ${tipo}` };
  }

  return {
    ok: true,
    tipo: normalized.tipo,
    datos: normalized.datos,
  };
}

const SSI_TIMEOUT_MS = 240_000;

async function handleCreateSSITicket({ titulo, descripcion, categoria, categoriaId, sede, sedeId }, sessionId) {
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(
      () => reject(new Error('Tiempo de espera agotado. El sistema SSI no respondió en 4 minutos.')),
      SSI_TIMEOUT_MS
    )
  );

  try {
    const resultado = await Promise.race([
      crearTicketSSI({ titulo, descripcion, categoria, categoriaId, sede, sedeId }),
      timeoutPromise,
    ]);

    if (sessionId) {
      saveEvent(sessionId, 'ticket_creado', {
        titulo,
        categoria,
        sede,
        ticketNum: resultado.ticketNum,
      }).catch(() => {});
    }

    return {
      ok: true,
      ticketNum: resultado.ticketNum,
      mensaje: resultado.mensaje,
    };
  } catch (err) {
    console.error('[SSI] handleCreateSSITicket error:', err.message);

    if (sessionId) {
      saveEvent(sessionId, 'error_ssi', {
        titulo,
        error: err.message,
      }).catch(() => {});
    }

    return {
      ok: false,
      error: err.message,
    };
  }
}

function handleDownloadTemplate({ tipo }) {
  const normalized = normalizeTipo(tipo);

  const allowed = [
    'ANEXO01',
    'ANEXO01_INDIVIDUAL',
    'ANEXO01_GRUPAL',
    'ANEXO01_VPN',
    'ANEXO02',
    'ANEXO02_INDIVIDUAL',
    'ANEXO02_GRUPAL',
    'ANEXO03',
    'ANEXO04',
    'ANEXO07',
    'PROD02',
    'F01',
  ];

  if (!allowed.includes(normalized)) {
    return { ok: false, error: `Tipo no válido: ${tipo}` };
  }

  return {
    ok: true,
    tipo: normalized,
  };
}

function handleSetUrgency({ nivel }) {
  return { ok: true, nivel };
}

function handleShowChips({ opciones }) {
  return { ok: true, opciones };
}

function handleShowForm({ titulo, campos }) {
  return { ok: true, titulo, campos };
}

module.exports = {
  generate_document: handleGenerateDocument,
  create_ssi_ticket: handleCreateSSITicket,
  download_template: handleDownloadTemplate,
  set_urgency: handleSetUrgency,
  show_chips: handleShowChips,
  show_form: handleShowForm,
};