/**
 * generators.js
 * Genera documentos Word (.docx) para los ANEXOS OTIN/INEI
 * usando docxtemplater sobre los templates oficiales en /templates/.
 *
 * Flujo: data (objeto JS) → placeholders → template → buffer .docx
 */

const fs           = require('fs');
const path         = require('path');
const PizZip       = require('pizzip');
const Docxtemplater = require('docxtemplater');

const TEMPLATES_DIR = path.join(__dirname, 'templates');

// ─── helper: 'X' si checked, '' si no ───────────────────────────────────────
function ck(cond) { return cond ? 'X' : ''; }

// ─── helper: render un template con docxtemplater ───────────────────────────
function renderTemplate(templateFile, data) {
  const tplPath = path.join(TEMPLATES_DIR, templateFile);
  const content = fs.readFileSync(tplPath);
  const zip = new PizZip(content);
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
  doc.render(data);
  return doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

// ─────────────────────────────────────────────────────────────────────────────
// ANEXO 01 — Acceso Remoto y Desbloqueo de Puertos USB
// ─────────────────────────────────────────────────────────────────────────────
async function generateAnexo01(d) {
  const accesos = Array.isArray(d.tipoAcceso) ? d.tipoAcceso : [d.tipoAcceso || 'remoto'];

  return renderTemplate('ANEXO01_template.docx', {
    nombres:              d.nombres            || '',
    cargo:                d.cargo              || '',
    correo:               d.correoInstitucional || d.correo || '',
    oficina:              d.direccion          || d.oficina || '',
    sede:                 d.sede               || '',
    telefono:             d.telefono           || '',
    dni:                  d.dni                || '',
    fechaSolicitud:       d.fechaSolicitud     || new Date().toLocaleDateString('es-PE'),
    fechaInicioContrato:  d.fechaInicioContrato || d.fechaInicio || '',
    fechaTerminoContrato: d.fechaTerminoContrato || d.fechaTermino || '',
    fechaInicioAcceso:    d.fechaInicioAcceso  || '',
    fechaTerminoAcceso:   d.fechaTerminoAcceso || '',
    ckNombrado:           ck(d.tipoContrato === 'NOMBRADO'),
    ckCAS:                ck(d.tipoContrato === 'CAS'),
    ckLocador:            ck(d.tipoContrato === 'LOCADOR-OS'),
    ckOtros:              ck(d.tipoContrato === 'OTROS'),
    ckAccesoRemoto:       ck(accesos.includes('remoto')),
    justificacionRemoto:  d.justificacionRemoto || '',
    justificacionUSB:     d.justificacionUSB    || '',
    nombreDirector:       d.nombreDirector      || '',
    nombresSolicitante:   d.nombresSolicitante  || '',
    numeroOS:             d.numeroOS            || '',
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// ANEXO 02 — Acceso a Servicios Informáticos
// ─────────────────────────────────────────────────────────────────────────────
async function generateAnexo02(d) {
  const srv  = d.servicios ?? d.srv ?? {};
  const pNum = String(d.perfilInternet || srv.perfilInternet || '');

  return renderTemplate('ANEXO02_template.docx', {
    nombres:        d.nombres             || '',
    cargo:          d.cargo               || '',
    correo:         d.correoInstitucional || d.correo || '',
    oficina:        d.direccion           || d.oficina || '',
    sede:           d.sede                || '',
    telefono:       d.telefono            || '',
    dni:            d.dni                 || '',
    fechaInicio:    d.fechaInicio         || '',
    fechaTermino:   d.fechaTermino        || '',
    numeroOS:       d.numeroOS            || '',
    nombreDirector: d.nombreDirector      || '',
    nombreGenerico: srv.usuarioGenerico   || '',
    capacidadBuzon: srv.aumentoBuzon      || '',
    perfilInternet: srv.internet ? pNum   : '',
    ipAsignada:     d.ipAsignada          || '',
    justificacion:  d.justificacion       || '',

    // Tipo de contrato
    ckNombrado:     ck(d.tipoContrato === 'NOMBRADO'),
    ckCAS:          ck(d.tipoContrato === 'CAS'),
    ckLocador:      ck(d.tipoContrato === 'LOCADOR-OS'),
    ckOtros:        ck(d.tipoContrato === 'OTROS'),

    // Tipo de solicitud
    ckCreacion:     ck(d.tipoSolicitud === 'Creación'),
    ckActualizacion:ck(d.tipoSolicitud === 'Actualización'),
    ckBaja:         ck(d.tipoSolicitud === 'Baja'),
    ckDesactivacion:ck(d.tipoSolicitud === 'Desactivación'),

    // Punto de red
    ckSi:           ck(!!d.puntoDered),
    ckNo:           ck(!d.puntoDered),

    // Servicios
    ckCuentaRed:    ck(!!srv.cuentaRed),
    ckInternet:     ck(!!srv.internet),
    ckCorreoInst:   ck(!!srv.correo),
    ckConRedes:     ck(pNum === '1' && srv.redesSociales === true),
    ckSinRedes:     ck(pNum === '1' && srv.redesSociales === false),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// ANEXO 03 — Solicitud de Servicio FTP
// ─────────────────────────────────────────────────────────────────────────────
async function generateAnexo03(d) {
  return renderTemplate('ANEXO03_template.docx', {
    fechaSolicitud:    d.fechaSolicitud   || new Date().toLocaleDateString('es-PE'),
    fechaTermino:      d.fechaTermino     || '',
    area:              d.area             || '',
    jefeArea:          d.jefeArea         || '',
    usuarioSolicitante:d.usuarioSolicitante || d.nombres || '',
    proposito:         d.proposito        || '',
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// ANEXO 04 — Acceso a Recursos Compartidos
// ─────────────────────────────────────────────────────────────────────────────
async function generateAnexo04(d) {
  return renderTemplate('ANEXO04_template.docx', {
    nombres:      d.nombres             || '',
    correo:       d.correoInstitucional || d.correo || '',
    cargo:        d.cargo               || '',
    fechaInicio:  d.fechaInicio         || '',
    fechaTermino: d.fechaTermino        || '',
    recurso:      d.recurso             || '',
    justificacion:d.justificacion       || '',
    ckAcceso:     ck(d.tipoSolicitud === 'Acceso' || !d.tipoSolicitud),
  });
}

module.exports = { generateAnexo01, generateAnexo02, generateAnexo03, generateAnexo04 };
