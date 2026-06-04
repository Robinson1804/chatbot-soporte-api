const { crearTicketSSI } = require('../ssi-automation');
const { saveEvent } = require('../db/queries');

async function handleGenerateDocument({ tipo, datos }) {
  const allowed = ['ANEXO01', 'ANEXO02', 'ANEXO03', 'ANEXO04', 'ANEXO07'];
  if (!allowed.includes(tipo)) {
    return { ok: false, error: `Tipo no válido: ${tipo}` };
  }
  return { ok: true, tipo, datos };
}

const SSI_TIMEOUT_MS = 240_000; // 4 min — Playwright + navegación SSI (login + modal check)

async function handleCreateSSITicket({ titulo, descripcion, categoria, categoriaId, sede, sedeId }, sessionId) {
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(
      () => reject(new Error('Tiempo de espera agotado. El sistema SSI no respondió en 2 minutos.')),
      SSI_TIMEOUT_MS,
    ),
  );
  try {
    const resultado = await Promise.race([
      crearTicketSSI({ titulo, descripcion, categoria, categoriaId, sede, sedeId }),
      timeoutPromise,
    ]);
    if (sessionId) {
      saveEvent(sessionId, 'ticket_creado', {
        titulo, categoria, sede, ticketNum: resultado.ticketNum,
      }).catch(() => {});
    }
    return { ok: true, ticketNum: resultado.ticketNum, mensaje: resultado.mensaje };
  } catch (err) {
    console.error('[SSI] handleCreateSSITicket error:', err.message);
    if (sessionId) {
      saveEvent(sessionId, 'error_ssi', { titulo, error: err.message }).catch(() => {});
    }
    return { ok: false, error: err.message };
  }
}

function handleDownloadTemplate({ tipo }) {
  const allowed = ['ANEXO01', 'ANEXO02', 'ANEXO03', 'ANEXO04', 'PROD02', 'F01', 'ANEXO07'];
  if (!allowed.includes(tipo)) {
    return { ok: false, error: `Tipo no válido: ${tipo}` };
  }
  return { ok: true, tipo };
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
  generate_document:  handleGenerateDocument,
  create_ssi_ticket:  handleCreateSSITicket,
  download_template:  handleDownloadTemplate,
  set_urgency:        handleSetUrgency,
  show_chips:         handleShowChips,
  show_form:          handleShowForm,
};
