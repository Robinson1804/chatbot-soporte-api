const { crearTicketSSI } = require('../ssi-automation');
const { saveEvent } = require('../db/queries');

async function handleGenerateDocument({ tipo, datos }) {
  const allowed = ['ANEXO01', 'ANEXO02', 'ANEXO03', 'ANEXO04'];
  if (!allowed.includes(tipo)) {
    return { ok: false, error: `Tipo no válido: ${tipo}` };
  }
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
