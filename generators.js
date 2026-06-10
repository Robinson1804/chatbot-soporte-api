/**
 * generators.js
 * Generación de documentos Word para el chatbot OTIN/INEI usando plantillas .docx.
 *
 * Requiere en /templates:
 * - ANEXO01_individual_template.docx
 * - ANEXO01_grupal_template.docx
 * - ANEXO01_vpn_template.docx
 * - ANEXO02_individual_template.docx
 * - ANEXO02_grupal_template.docx
 * - ANEXO03_template.docx
 * - ANEXO04_template.docx
 *
 * Exporta:
 * - generateAnexo01
 * - generateAnexo02
 * - generateAnexo03
 * - generateAnexo04
 * - generateAnexo07
 */

'use strict';

const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const {
  Document,
  Packer,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  TextRun,
  AlignmentType,
  BorderStyle,
  WidthType,
  ShadingType,
  VerticalAlign,
  HeightRule,
} = require('docx');

// ─────────────────────────────────────────────────────────────────────────────
// Helpers generales
// ─────────────────────────────────────────────────────────────────────────────

const TEMPLATE_DIR = path.join(__dirname, 'templates');

function str(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function upper(value) {
  return str(value).toUpperCase();
}

function lower(value) {
  return str(value).toLowerCase();
}

function todayPE() {
  return new Date().toLocaleDateString('es-PE');
}

function x(condition) {
  return condition ? 'X' : '';
}

function normalizeSpaces(value) {
  return str(value).replace(/\s+/g, ' ').trim();
}

function normalizeKey(value) {
  return normalizeSpaces(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const s = str(value);
    if (s) return s;
  }
  return '';
}

function boolLike(value) {
  const v = normalizeKey(value);
  return value === true || ['si', 'sí', 'true', '1', 'x', 'marcado', 'yes'].includes(v);
}

function splitDni(dni) {
  const digits = str(dni).replace(/\D/g, '').slice(0, 8).padEnd(8, ' ');
  return Object.fromEntries([...digits].map((digit, idx) => [`d${idx + 1}`, digit.trim()]));
}

function normalizeDate(value) {
  const s = str(value);
  if (!s) return '';

  // YYYY-MM-DD → DD/MM/YYYY
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;

  // DD-MM-YYYY → DD/MM/YYYY
  const dash = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dash) return `${dash[1].padStart(2, '0')}/${dash[2].padStart(2, '0')}/${dash[3]}`;

  return s;
}

function safeFilenamePart(value, fallback = 'documento') {
  return (str(value) || fallback)
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_\-]/g, '')
    .substring(0, 60);
}

function templatePath(...candidateNames) {
  for (const name of candidateNames.filter(Boolean)) {
    const p = path.join(TEMPLATE_DIR, name);
    if (fs.existsSync(p)) return p;
  }
  throw new Error(`No se encontró ninguna plantilla: ${candidateNames.filter(Boolean).join(', ')}`);
}

function renderTemplate(candidateNames, data) {
  const names = Array.isArray(candidateNames) ? candidateNames : [candidateNames];
  const filePath = templatePath(...names);
  const content = fs.readFileSync(filePath, 'binary');
  const zip = new PizZip(content);

  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: '{', end: '}' },
    nullGetter() {
      return '';
    },
  });

  try {
    doc.render(data || {});
  } catch (err) {
    const details = err.properties?.errors
      ?.map((e) => e.properties?.explanation || e.message)
      .filter(Boolean)
      .join(' | ');

    throw new Error(`Error renderizando plantilla ${path.basename(filePath)}: ${details || err.message}`);
  }

  return doc.getZip().generate({
    type: 'nodebuffer',
    compression: 'DEFLATE',
  });
}

function normalizeUsers(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.usuarios)) return value.usuarios;
  return [];
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de checks / clasificaciones
// ─────────────────────────────────────────────────────────────────────────────

function contractFlags(tipoContrato) {
  const t = normalizeKey(tipoContrato);

  return {
    isNombrado: t.includes('nombrado'),
    isCAS: t === 'cas' || t.includes('cas'),
    isLocador: t.includes('locador') || t.includes('orden') || t.includes('servicio') || t.includes('o.s') || t.includes('os'),
    isOtros: t.includes('otro'),
  };
}

function requestFlags(tipoSolicitud) {
  const t = normalizeKey(tipoSolicitud);

  return {
    isCreacion: t.includes('creacion') || t.includes('crear') || t.includes('alta'),
    isActualizacion: t.includes('actualizacion') || t.includes('modificacion') || t.includes('modificar') || t.includes('actualizar'),
    isBaja: t.includes('baja'),
    isDesactivacion: t.includes('desactivacion') || t.includes('desactivar'),
  };
}

function accessTypeFlags(tipoAcceso) {
  const raw = Array.isArray(tipoAcceso) ? tipoAcceso.join(' ') : str(tipoAcceso || 'remoto');
  const t = normalizeKey(raw);

  return {
    wantsRemoto: t.includes('remoto') || t.includes('vpn') || t.includes('ambos'),
    wantsUSB: t.includes('usb') || t.includes('puerto') || t.includes('ambos'),
  };
}

function permissionFlags(permiso) {
  const p = normalizeKey(permiso || 'lectura');

  return {
    isLectura: p.includes('lectura') || p === 'leer',
    isEscritura: p.includes('escritura') || p.includes('editar') || p.includes('modificar'),
    isControlTotal: p.includes('control'),
  };
}

function anexo01Modalidad(d) {
  const m = normalizeKey(firstNonEmpty(d.modalidad, d.tipoFormato, d.formato, d.version, d.tipoSolicitud, 'individual'));

  if (m.includes('grupal') || m.includes('grupo') || m.includes('varias') || m.includes('varios')) return 'grupal';
  if (m.includes('vpn')) return 'vpn';

  return 'individual';
}

function anexo02Modalidad(d) {
  const m = normalizeKey(firstNonEmpty(d.modalidad, d.tipoFormato, d.formato, d.version, d.tipoSolicitud, 'individual'));

  if (m.includes('grupal') || m.includes('grupo') || m.includes('varias') || m.includes('varios')) return 'grupal';

  return 'individual';
}

// ─────────────────────────────────────────────────────────────────────────────
// ANEXO 01 — Acceso Remoto / USB / VPN
// ─────────────────────────────────────────────────────────────────────────────

function mapAnexo01Individual(d = {}) {
  const contrato = contractFlags(d.tipoContrato || d.contrato || d.modalidadContrato);
  const acceso = accessTypeFlags(d.tipoAcceso || d.acceso || d.permiso);

  const fechaInicioContrato = normalizeDate(firstNonEmpty(d.fechaInicioContrato, d.fechaInicio, d.inicioContrato));
  const fechaTerminoContrato = normalizeDate(firstNonEmpty(d.fechaTerminoContrato, d.fechaTermino, d.finContrato));

  return {
    fechaInicioContrato,
    fechaTerminoContrato,

    ckNombrado: x(contrato.isNombrado),
    ckCAS: x(contrato.isCAS),
    ckLocador: x(contrato.isLocador),
    ckOtros: x(contrato.isOtros),

    nombres: firstNonEmpty(d.nombres, d.nombreCompleto, d.usuarioSolicitante),
    oficina: firstNonEmpty(d.oficina, d.direccion, d.area),
    correo: firstNonEmpty(d.correoInstitucional, d.correo),
    cargo: d.cargo || '',
    telefono: firstNonEmpty(d.telefono, d.anexoTelefono, d.anexo),
    sede: d.sede || '',
    dni: d.dni || '',

    fechaSolicitud: normalizeDate(d.fechaSolicitud) || todayPE(),
    numeroOS: /no aplica/i.test(str(d.numeroOS)) ? '' : str(d.numeroOS),

    ckAccesoRemoto: x(acceso.wantsRemoto),
    ckUSB: x(acceso.wantsUSB),

    fechaInicioAcceso: normalizeDate(firstNonEmpty(d.fechaInicioAcceso, d.fechaInicioPermiso, d.fechaInicio)),
    fechaTerminoAcceso: normalizeDate(firstNonEmpty(d.fechaTerminoAcceso, d.fechaFinAcceso, d.fechaTerminoPermiso, d.fechaTermino)),

    justificacionRemoto: firstNonEmpty(d.justificacionRemoto, d.justificacion),
    justificacionUSB: d.justificacionUSB || '',

    nombresSolicitante: firstNonEmpty(d.nombresSolicitante, d.solicitante, d.nombres),
    nombreDirector: firstNonEmpty(d.nombreDirector, d.director),

    // Datos del formato VPN si la plantilla individual los tuviera.
    usuarioRed: firstNonEmpty(d.usuarioRed, d.userRed, d.usuarioRedINEI),
    ipOpcional: firstNonEmpty(d.ipOpcional, d.ip),
    correoPersonal: d.correoPersonal || '',
    hostEquipo: firstNonEmpty(d.hostEquipo, d.host, d.nombreEquipo),
  };
}

function mapAnexo01VPN(d = {}) {
  return {
    nombres: firstNonEmpty(d.nombres, d.nombreCompleto, d.usuarioSolicitante),
    usuarioRed: firstNonEmpty(d.usuarioRed, d.userRed, d.usuarioRedINEI),
    ipOpcional: firstNonEmpty(d.ipOpcional, d.ip),
    correoPersonal: d.correoPersonal || '',
    hostEquipo: firstNonEmpty(d.hostEquipo, d.host, d.nombreEquipo),
    telefono: firstNonEmpty(d.telefono, d.anexoTelefono, d.anexo),
  };
}

function mapAnexo01Grupal(d = {}) {
  const usuarios = normalizeUsers(d).map((u, idx) => {
    const acceso = accessTypeFlags(u.tipoAcceso || u.acceso || d.tipoAcceso);
    const contrato = firstNonEmpty(u.contrato, u.tipoContrato, d.tipoContrato);

    const tipoAcceso = acceso.wantsRemoto && acceso.wantsUSB
      ? 'Acceso remoto / USB'
      : acceso.wantsUSB
        ? 'Desbloqueo USB'
        : 'Acceso remoto';

    return {
      i: firstNonEmpty(u.i, u.nro, u.numero, String(idx + 1)),
      nombres: firstNonEmpty(u.nombres, u.nombreCompleto),
      dni: u.dni || '',
      cargo: u.cargo || '',
      usuarioRed: firstNonEmpty(u.usuarioRed, u.userRed, u.correoInstitucional, u.correo),
      contrato,
      inicio: normalizeDate(firstNonEmpty(u.inicio, u.fechaInicio, u.fechaInicioAcceso, d.fechaInicioAcceso, d.fechaInicio)),
      fin: normalizeDate(firstNonEmpty(u.fin, u.fechaTermino, u.fechaTerminoAcceso, d.fechaTerminoAcceso, d.fechaTermino)),
      acceso: firstNonEmpty(u.accesoLabel, u.tipoAccesoTexto, tipoAcceso),
      firma: u.firma || '',
    };
  });

  return {
    fechaSolicitud: normalizeDate(d.fechaSolicitud) || todayPE(),
    oficina: firstNonEmpty(d.oficina, d.direccion, d.area),
    sede: d.sede || '',
    usuarios,
    justificacionRemoto: firstNonEmpty(d.justificacionRemoto, d.justificacion),
    justificacionUSB: d.justificacionUSB || '',
    solicitante: firstNonEmpty(d.solicitante, d.nombresSolicitante, d.usuarioSolicitante),
    director: firstNonEmpty(d.director, d.nombreDirector),
  };
}

async function generateAnexo01(d = {}) {
  const modalidad = anexo01Modalidad(d);

  if (modalidad === 'grupal') {
    return renderTemplate([
      'ANEXO01_grupal_template.docx',
      'ANEXO01_grupal_template_corregido.docx',
    ], mapAnexo01Grupal(d));
  }

  if (modalidad === 'vpn') {
    return renderTemplate([
      'ANEXO01_vpn_template.docx',
      'ANEXO01_vpn_template_corregido.docx',
    ], mapAnexo01VPN(d));
  }

  return renderTemplate([
    'ANEXO01_individual_template.docx',
    'ANEXO01_template.docx',
    'ANEXO01_template_corregido.docx',
  ], mapAnexo01Individual(d));
}

// ─────────────────────────────────────────────────────────────────────────────
// ANEXO 02 — Acceso a Servicios Informáticos
// ─────────────────────────────────────────────────────────────────────────────

function internetProfileFlags(d = {}) {
  const perfil = str(d.perfilInternet || d.perfil || '');
  const p = normalizeKey(perfil);

  const isPerfil1 = p === '1' || p.includes('perfil 1') || p.includes('avanzado');

  const conRedes = d.conRedes !== undefined ? boolLike(d.conRedes) : isPerfil1;
  const sinRedes = d.sinRedes !== undefined ? boolLike(d.sinRedes) : (!!perfil && !conRedes);

  return { perfil: perfil || '', conRedes, sinRedes };
}

function mapAnexo02Individual(d = {}) {
  const contrato = contractFlags(d.tipoContrato || d.contrato || d.modalidadContrato);
  const solicitud = requestFlags(d.tipoSolicitud || d.solicitud || 'creacion');
  const perfil = internetProfileFlags(d);
  const servicios = d.servicios || {};

  const cuentaRed = d.cuentaRed !== undefined
    ? boolLike(d.cuentaRed)
    : boolLike(servicios.cuentaRed);

  const internet = d.internet !== undefined
    ? boolLike(d.internet)
    : boolLike(servicios.internet || d.perfilInternet);

  const correoInst = d.correoInstitucionalSolicitado !== undefined
    ? boolLike(d.correoInstitucionalSolicitado)
    : boolLike(d.correoInst || d.correoInstitucional || servicios.correo || servicios.correoInst);

  return {
    fechaInicio: normalizeDate(firstNonEmpty(d.fechaInicio, d.fechaInicioContrato)),
    fechaTermino: normalizeDate(firstNonEmpty(d.fechaTermino, d.fechaTerminoContrato)),

    ckNombrado: x(contrato.isNombrado),
    ckCAS: x(contrato.isCAS),
    ckLocador: x(contrato.isLocador),
    ckOtros: x(contrato.isOtros),

    nombres: firstNonEmpty(d.nombres, d.nombreCompleto),
    oficina: firstNonEmpty(d.oficina, d.direccion, d.area),
    correo: firstNonEmpty(d.correoInstitucional, d.correo),
    cargo: d.cargo || '',
    telefono: firstNonEmpty(d.telefono, d.anexoTelefono, d.anexo),
    sede: d.sede || '',
    dni: d.dni || '',
    numeroOS: /no aplica/i.test(str(d.numeroOS)) ? '' : str(d.numeroOS),

    ckCreacion: x(solicitud.isCreacion),
    ckActualizacion: x(solicitud.isActualizacion),
    ckBaja: x(solicitud.isBaja),
    ckDesactivacion: x(solicitud.isDesactivacion),

    ckPuntoRedSi: x(boolLike(d.puntoRedIdentificado) || normalizeKey(d.puntoRed) === 'si'),
    ckPuntoRedNo: x(d.puntoRedIdentificado === false || normalizeKey(d.puntoRed) === 'no'),
    ipAsignada: firstNonEmpty(d.ipAsignada, d.ip),

    ckCuentaRed: x(cuentaRed),
    nombreGenerico: firstNonEmpty(d.nombreGenerico, d.usuarioGenerico),

    ckInternet: x(internet),
    perfilInternet: perfil.perfil,

    ckCorreoInst: x(correoInst),

    ckConRedes: x(perfil.conRedes),
    ckSinRedes: x(perfil.sinRedes),

    capacidadBuzon: firstNonEmpty(d.capacidadBuzon, d.aumentoBuzon, d.nuevaCapacidad),

    justificacion: d.justificacion || '',

    nombreDirector: firstNonEmpty(d.nombreDirector, d.director),
    nombresSolicitante: firstNonEmpty(d.nombresSolicitante, d.solicitante, d.nombres),

    fechaHoy: normalizeDate(firstNonEmpty(d.fechaHoy, d.fechaSolicitud)) || todayPE(),
    fechaIHoy: normalizeDate(firstNonEmpty(d.fechaIHoy, d.fechaHoy, d.fechaSolicitud)) || todayPE(),
  };
}

function mapAnexo02Grupal(d = {}) {
  const usuarios = normalizeUsers(d).map((u, idx) => {
    const perfil = internetProfileFlags(u);

    return {
      i: firstNonEmpty(u.i, u.nro, u.numero, String(idx + 1)),
      nombres: firstNonEmpty(u.nombres, u.nombreCompleto),
      dni: u.dni || '',
      cargo: u.cargo || '',
      contrato: firstNonEmpty(u.contrato, u.tipoContrato, d.tipoContrato),
      numeroOS: /no aplica/i.test(str(u.numeroOS || d.numeroOS)) ? '' : firstNonEmpty(u.numeroOS, d.numeroOS),

      inicio: normalizeDate(firstNonEmpty(u.inicio, u.fechaInicio, u.fechaInicioPermiso, d.fechaInicio)),
      fin: normalizeDate(firstNonEmpty(u.fin, u.fechaTermino, u.fechaTerminoPermiso, d.fechaTermino)),

      tipoSolicitud: firstNonEmpty(u.tipoSolicitud, d.tipoSolicitud, 'Creación'),

      perfilInternet: perfil.perfil,
      perfil1Si: x(perfil.conRedes),
      perfil1No: x(perfil.sinRedes),

      correoSi: x(
        u.correoInstitucionalSolicitado !== undefined
          ? boolLike(u.correoInstitucionalSolicitado)
          : boolLike(u.correoSi || u.correoInstitucional)
      ),
      correoNo: x(u.correoNo !== undefined ? boolLike(u.correoNo) : false),

      ipAsignada: firstNonEmpty(u.ipAsignada, u.ip),
    };
  });

  return {
    fechaSolicitud: normalizeDate(d.fechaSolicitud) || todayPE(),
    oficina: firstNonEmpty(d.oficina, d.direccion, d.area),
    sede: d.sede || '',
    usuarios,
    justificacion: d.justificacion || '',
    solicitante: firstNonEmpty(d.solicitante, d.nombresSolicitante, d.usuarioSolicitante),
    director: firstNonEmpty(d.director, d.nombreDirector),
  };
}

async function generateAnexo02(d = {}) {
  const modalidad = anexo02Modalidad(d);

  if (modalidad === 'grupal') {
    return renderTemplate([
      'ANEXO02_grupal_template.docx',
      'ANEXO02_grupal_template_corregido.docx',
    ], mapAnexo02Grupal(d));
  }

  return renderTemplate([
    'ANEXO02_individual_template.docx',
    'ANEXO02_individual_template_corregido.docx',
  ], mapAnexo02Individual(d));
}

// ─────────────────────────────────────────────────────────────────────────────
// ANEXO 03 — Solicitud de Servicio FTP
// ─────────────────────────────────────────────────────────────────────────────

function mapAnexo03(d = {}) {
  const usuarios = normalizeUsers(d).map((u) => ({
    area: firstNonEmpty(u.area, d.area),
    proyecto: u.proyecto || '',
    dni: u.dni || '',
    nombre: firstNonEmpty(u.nombre, u.nombres),
    apellidos: u.apellidos || '',
    lectura: x(u.lectura !== undefined ? boolLike(u.lectura) : normalizeKey(u.permiso).includes('lectura')),
    escritura: x(u.escritura !== undefined ? boolLike(u.escritura) : normalizeKey(u.permiso).includes('escritura')),
  }));

  return {
    fechaSolicitud: normalizeDate(d.fechaSolicitud) || todayPE(),
    fechaTermino: normalizeDate(firstNonEmpty(d.fechaTermino, d.fechaFin)),
    area: d.area || '',
    jefeArea: d.jefeArea || '',
    usuarioSolicitante: firstNonEmpty(d.usuarioSolicitante, d.solicitante),
    proposito: firstNonEmpty(d.proposito, d.propósito, d.justificacion),
    usuarios,
  };
}

async function generateAnexo03(d = {}) {
  return renderTemplate([
    'ANEXO03_template.docx',
    'ANEXO03_template_corregido.docx',
  ], mapAnexo03(d));
}

// ─────────────────────────────────────────────────────────────────────────────
// ANEXO 04 — Acceso a Recursos Compartidos
// ─────────────────────────────────────────────────────────────────────────────

function mapAnexo04(d = {}) {
  const contrato = contractFlags(d.tipoContrato || d.contrato || d.modalidadContrato);
  const solicitud = normalizeKey(firstNonEmpty(d.tipoSolicitud, d.solicitud, 'acceso'));
  const permiso = permissionFlags(d.permiso || d.tipoPermiso || d.acceso || 'lectura');

  return {
    ckN: x(contrato.isNombrado),
    ckC: x(contrato.isCAS),
    ckL: x(contrato.isLocador),
    ckO: x(contrato.isOtros),

    nombres: firstNonEmpty(d.nombres, d.nombreCompleto),

    fechaInicio: normalizeDate(firstNonEmpty(d.fechaInicio, d.fechaInicioAcceso)),
    fechaTermino: normalizeDate(firstNonEmpty(d.fechaTermino, d.fechaTerminoAcceso)),

    oficina: firstNonEmpty(d.oficina, d.direccion, d.area),
    correo: firstNonEmpty(d.correoInstitucional, d.correo),
    cargo: d.cargo || '',
    telefono: firstNonEmpty(d.telefono, d.anexoTelefono, d.anexo),
    sede: d.sede || '',

    ...splitDni(d.dni),

    ckA: x(solicitud.includes('acceso') || solicitud.includes('creacion')),
    ckM: x(solicitud.includes('modificacion') || solicitud.includes('actualizacion')),
    ckQ: x(solicitud.includes('quitar') || solicitud.includes('baja') || solicitud.includes('desactivacion')),

    servidor: firstNonEmpty(d.servidor, '\\\\SAN 01'),
    recurso: firstNonEmpty(d.recurso, d.carpetaCompartida, d.carpeta),

    ckLect: x(permiso.isLectura && !permiso.isEscritura && !permiso.isControlTotal),
    ckEsc: x(permiso.isEscritura),
    ckCtrl: x(permiso.isControlTotal),

    justificacion: d.justificacion || '',
    nombreDirector: firstNonEmpty(d.nombreDirector, d.director),
    fechaSolicitud: normalizeDate(d.fechaSolicitud) || todayPE(),
  };
}

async function generateAnexo04(d = {}) {
  return renderTemplate([
    'ANEXO04_template.docx',
    'ANEXO04_template_corregido.docx',
  ], mapAnexo04(d));
}

// ─────────────────────────────────────────────────────────────────────────────
// ANEXO 07 — Transferencia de información entre áreas
// No hay plantilla corregida en el flujo actual. Se mantiene generación simple.
// ─────────────────────────────────────────────────────────────────────────────

const BLUE = '1F3864';
const LIGHT_BLUE = 'BDD7EE';
const PAGE_MARGINS = { top: 720, bottom: 720, left: 900, right: 900 };

function blueBorders() {
  const b = { style: BorderStyle.SINGLE, size: 4, color: BLUE };
  return { top: b, bottom: b, left: b, right: b, insideH: b, insideV: b };
}

function sectionTitle(text) {
  return new Paragraph({
    spacing: { before: 120, after: 80 },
    children: [new TextRun({ text: upper(text), bold: true, color: BLUE, size: 22 })],
  });
}

function labelCell(text) {
  return new TableCell({
    width: { size: 30, type: WidthType.PERCENTAGE },
    shading: { type: ShadingType.CLEAR, fill: LIGHT_BLUE, color: 'auto' },
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 60, bottom: 60, left: 120, right: 120 },
    children: [
      new Paragraph({
        children: [new TextRun({ text: str(text), bold: true, color: BLUE, size: 20 })],
      }),
    ],
  });
}

function valueCell(value) {
  return new TableCell({
    width: { size: 70, type: WidthType.PERCENTAGE },
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 60, bottom: 60, left: 120, right: 120 },
    children: [
      new Paragraph({
        children: [new TextRun({ text: str(value), color: '000000', size: 20 })],
      }),
    ],
  });
}

function sectionRow(label, value) {
  return new TableRow({ children: [labelCell(label), valueCell(value)] });
}

function sectionTable(rows) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: blueBorders(),
    rows,
  });
}

function simpleHeader(titulo, numeroAnexo) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: blueBorders(),
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 20, type: WidthType.PERCENTAGE },
            shading: { type: ShadingType.CLEAR, fill: LIGHT_BLUE, color: 'auto' },
            verticalAlign: VerticalAlign.CENTER,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: 'INEI', bold: true, color: BLUE, size: 28 })],
              }),
            ],
          }),
          new TableCell({
            width: { size: 60, type: WidthType.PERCENTAGE },
            verticalAlign: VerticalAlign.CENTER,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: str(titulo), bold: true, color: BLUE, size: 22 })],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: 'Oficina Técnica de Informática (OTIN)',
                    italics: true,
                    color: '595959',
                    size: 16,
                  }),
                ],
              }),
            ],
          }),
          new TableCell({
            width: { size: 20, type: WidthType.PERCENTAGE },
            shading: { type: ShadingType.CLEAR, fill: LIGHT_BLUE, color: 'auto' },
            verticalAlign: VerticalAlign.CENTER,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: str(numeroAnexo), bold: true, color: BLUE, size: 20 })],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

function signatureBlock(label, sublabel) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: blueBorders(),
    rows: [
      new TableRow({
        height: { value: 1200, rule: HeightRule.ATLEAST },
        children: [
          new TableCell({
            width: { size: 100, type: WidthType.PERCENTAGE },
            verticalAlign: VerticalAlign.BOTTOM,
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 500 },
                children: [new TextRun({ text: str(label), bold: true, color: BLUE, size: 20 })],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: str(sublabel), italics: true, color: '595959', size: 16 })],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

async function generateAnexo07(d = {}) {
  // Si luego agregas una plantilla real, puedes reemplazar este bloque por renderTemplate().
  const children = [
    simpleHeader('Transferencia de Información entre Áreas', 'ANEXO 07'),
    new Paragraph({ text: '' }),

    sectionTitle('Área Origen'),
    sectionTable([
      sectionRow('Área / Dirección', d.areaOrigen || ''),
      sectionRow('Jefe de Área Origen', d.jefeOrigen || ''),
      sectionRow('Responsable Origen', d.responsableOrigen || ''),
    ]),

    new Paragraph({ text: '' }),

    sectionTitle('Área Destino'),
    sectionTable([
      sectionRow('Área / Dirección', d.areaDestino || ''),
      sectionRow('Jefe de Área Destino', d.jefeDestino || ''),
      sectionRow('Responsable Destino', d.responsableDestino || ''),
    ]),

    new Paragraph({ text: '' }),

    sectionTitle('Detalle de la Transferencia'),
    sectionTable([
      sectionRow('Descripción de la información', d.descripcion || ''),
      sectionRow('Justificación', d.justificacion || ''),
      sectionRow('Período', `${firstNonEmpty(d.periodoInicio, d.fechaInicio)} - ${firstNonEmpty(d.periodoFin, d.fechaTermino)}`),
      sectionRow('Fecha de solicitud', normalizeDate(d.fechaSolicitud) || todayPE()),
    ]),

    new Paragraph({ text: '' }),

    signatureBlock(`Firma del Jefe de Área Origen${d.jefeOrigen ? ' — ' + d.jefeOrigen : ''}`, 'Jefe de Área Origen'),

    new Paragraph({ text: '' }),

    signatureBlock(`Firma del Jefe de Área Destino${d.jefeDestino ? ' — ' + d.jefeDestino : ''}`, 'Jefe de Área Destino'),
  ];

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: 'Calibri',
            size: 20,
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: PAGE_MARGINS,
          },
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}

module.exports = {
  generateAnexo01,
  generateAnexo02,
  generateAnexo03,
  generateAnexo04,
  generateAnexo07,

  // Expuestos para tests rápidos si los necesitas.
  _helpers: {
    mapAnexo01Individual,
    mapAnexo01Grupal,
    mapAnexo01VPN,
    mapAnexo02Individual,
    mapAnexo02Grupal,
    mapAnexo03,
    mapAnexo04,
    safeFilenamePart,
  },
};