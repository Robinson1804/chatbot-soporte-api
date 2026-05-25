/**
 * inject-placeholders.js
 * Inyecta {placeholders} en el XML interno de cada ANEXO y guarda
 * los templates resultantes en /templates/.
 *
 * node scripts/inject-placeholders.js
 */

const fs      = require('fs');
const path    = require('path');
const PizZip  = require('pizzip');

const ANEXOS_DIR    = path.join(__dirname, '..', 'anexos');
const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');
if (!fs.existsSync(TEMPLATES_DIR)) fs.mkdirSync(TEMPLATES_DIR);

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Reemplaza texto exacto dentro del XML (sin regex). */
function tx(xml, from, to) {
  const idx = xml.indexOf(from);
  if (idx === -1) return xml;          // no crashea si no encuentra
  return xml.split(from).join(to);
}

// Los campos de relleno en estos .docx usan U+2026 (ELLIPSIS …), no ASCII (.)
// También pueden usar U+002E (.) para fechas tipo ..../..../.......
const FILL_CHARS = '[…./·• ]';  // ellipsis, punto, middle dot, bullet, espacio
const FILL_RE    = new RegExp(`${FILL_CHARS}{3,}`, 'g');

/**
 * Reemplaza la secuencia de fill (ellipsis/dots) en el run que sigue
 * inmediatamente al label dado.
 *
 * Estructura XML esperada:
 *   LABEL</w:t></w:r>...<w:t ...>[fill chars]{3+}</w:t>
 */
function replaceDots(xml, labelText, placeholder) {
  const esc = labelText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Salta desde el cierre del label hasta el siguiente <w:t> con fill chars
  const re = new RegExp(
    `(${esc}</w:t>(?:(?!<w:t)[\\s\\S])*?<w:t[^>]*>)${FILL_CHARS}{3,}(</w:t>)`,
    'g'
  );
  return xml.replace(re, `$1${placeholder}$2`);
}

/**
 * Reemplaza fill chars inline dentro del MISMO run del label.
 * Ej: "FECHA DE SOLICITUD:…………………" → "FECHA DE SOLICITUD:{ph}"
 */
function replaceDotInline(xml, labelPart, placeholder) {
  const esc = labelPart.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(${esc})${FILL_CHARS}{3,}`, 'g');
  return xml.replace(re, `$1${placeholder}`);
}

/**
 * Inyecta un placeholder en la celda-checkbox (celda bordada vacía)
 * que aparece DESPUÉS del label.
 *
 * Estructura: ...LABEL</w:t></w:r></w:p></w:tc><w:tc>...(4 bordes)...run-vacío...
 */
function injectCheckbox(xml, labelText, placeholder) {
  const esc = labelText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `(${esc}</w:t></w:r></w:p></w:tc><w:tc>[\\s\\S]*?<w:rPr><w:rtl w:val="0"/></w:rPr>)(</w:r>)`,
    'g'
  );
  return xml.replace(re, `$1<w:t xml:space="preserve">${placeholder}</w:t>$2`);
}

function processAnexo(srcName, dstName, patchFn) {
  const srcPath = path.join(ANEXOS_DIR, srcName);
  const dstPath = path.join(TEMPLATES_DIR, dstName);

  const buf = fs.readFileSync(srcPath);
  const zip = new PizZip(buf);

  let xml = zip.file('word/document.xml').asText();
  const before = (xml.match(/\{[a-zA-Z0-9_]+\}/g) || []).length;

  xml = patchFn(xml);

  const after = (xml.match(/\{[a-zA-Z0-9_]+\}/g) || []).length;
  const found = [...new Set((xml.match(/\{[a-zA-Z0-9_]+\}/g) || []))].sort();

  zip.file('word/document.xml', xml);
  const out = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
  fs.writeFileSync(dstPath, out);

  console.log(`✅  ${dstName}  (+${after - before} placeholders)`);
  console.log(`    ${found.join(', ')}`);
}

// ─── ANEXO 01 ─────────────────────────────────────────────────────────────────
function patchAnexo01(xml) {
  // Checkboxes tipo contrato
  xml = injectCheckbox(xml, 'NOMBRADO',      '{ckNombrado}');
  xml = injectCheckbox(xml, 'CAS',           '{ckCAS}');
  xml = injectCheckbox(xml, 'O.S / LOCADOR', '{ckLocador}');
  xml = injectCheckbox(xml, 'OTROS',         '{ckOtros}');

  // Fechas del contrato — label + valor en el mismo run (inline)
  xml = tx(xml, 'Fecha Inicio:</w:t>', 'Fecha Inicio: {fechaInicioContrato}</w:t>');
  xml = tx(xml, 'Fecha Término:</w:t>', 'Fecha Término: {fechaTerminoContrato}</w:t>');

  // Nombres y Apellidos — dots en run siguiente
  xml = replaceDots(xml, 'Nombres y Apellidos: ', '{nombres}');

  // Dirección / Oficina — dots en run siguiente (antes del label de correo)
  xml = replaceDots(xml, 'Dirección / Oficina:', '{oficina}');

  // Correo electrónico — dots en run siguiente
  xml = replaceDots(xml, 'Correo electrónico: ', '{correo}');

  // Cargo / Función — dots en run siguiente
  xml = replaceDots(xml, 'Cargo / Función:', '{cargo}');

  // Teléfono — dots en run siguiente
  xml = replaceDots(xml, 'Teléfono:', '{telefono}');

  // Sede — dots en run siguiente
  xml = replaceDots(xml, 'Sede:', '{sede}');

  // DNI y Fecha Solicitud — mismo run con ellipsis + slashes inline
  xml = xml.replace(
    /Documento de Identidad: […….\/\. ]{5,}Fecha de Solicitud: […….\/\. ]{5,}/g,
    'Documento de Identidad: {dni}     Fecha de Solicitud: {fechaSolicitud}'
  );

  // Tipo de acceso (checkboxes grandes — son paragraphs, no table cells)
  // injectCheckbox no aplica; los inyectamos tras el header usando tx
  xml = injectCheckbox(xml, 'SERVICIOS DE ACCESO REMOTO A EQUIPOS', '{ckAccesoRemoto}');

  // Fechas del acceso — mismo run con ellipsis + slashes
  xml = xml.replace(/Fecha de inicio: […….\/\. ]{5,}\s*/g,   'Fecha de inicio: {fechaInicioAcceso}  ');
  xml = xml.replace(/Fecha de término: […….\/\. ]{5,}\s*/g,  'Fecha de término: {fechaTerminoAcceso}  ');

  // Nombres del solicitante (entre paréntesis)
  xml = tx(xml,
    '(Nombres Completos del Solicitante, de ser el mismo usuario, dejar en blanco)',
    '{nombresSolicitante}'
  );

  // Justificaciones — se inyectan tras el label (párrafos vacíos los rodean)
  xml = tx(xml,
    'Justificación para Acceso Remoto:</w:t>',
    'Justificación para Acceso Remoto: {justificacionRemoto}</w:t>'
  );
  xml = tx(xml,
    'Justificación para Desbloqueo de puertos USB y otros medios removibles:</w:t>',
    'Justificación para Desbloqueo de puertos USB y otros medios removibles: {justificacionUSB}</w:t>'
  );

  // Nombre del Director
  xml = tx(xml,
    '(Nombres Completos de el(la) Director(a) Técnico(a) / Nacional o Funcionario Autorizado)',
    '{nombreDirector}'
  );

  // Número de O.S. (inline en mismo run)
  xml = tx(xml, 'Número de O.S:</w:t>', 'Número de O.S: {numeroOS}</w:t>');

  return xml;
}

// ─── ANEXO 02 ─────────────────────────────────────────────────────────────────
function patchAnexo02(xml) {
  // Checkboxes tipo contrato — texto tabulado en un párrafo, NO celdas ni shapes
  xml = tx(xml, 'NOMBRADO    </w:t>',         'NOMBRADO {ckNombrado}   </w:t>');
  xml = tx(xml, '     CAS</w:t>',             '     CAS {ckCAS}</w:t>');
  xml = tx(xml, '     LOCADOR</w:t>',         '     LOCADOR {ckLocador}</w:t>');
  xml = tx(xml, '          OTROS    </w:t>',  '          OTROS {ckOtros}   </w:t>');

  // Fechas del permiso
  xml = tx(xml, 'Fecha Inicio:</w:t>',   'Fecha Inicio: {fechaInicio}</w:t>');
  xml = tx(xml, 'Fecha Término:</w:t>',  'Fecha Término: {fechaTermino}</w:t>');

  // Nombres y Apellidos — label en run1, ": " en run2, fill en run3+4
  xml = xml.replace(
    /(Nombres y Apellidos<\/w:t>[\s\S]{1,200}?<w:t xml:space="preserve">: <\/w:t><\/w:r>)(?:<w:r[^>]*>[\s\S]{1,200}?<w:t[^>]*>[…\.·\/• ]{3,}<\/w:t><\/w:r>)+/,
    '$1<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr><w:t>{nombres}</w:t></w:r>'
  );

  // Dirección/Oficina + Correo — ambos inline en UN solo run
  xml = xml.replace(
    /(Dirección\/ Oficina: )[…\.·\/• ]{3,}(  Correo electrónico)[…\.·\/• ]{3,}(<\/w:t>)/,
    '$1{oficina}$2{correo}$3'
  );

  // Cargo / Función — fill inline en el mismo run del label
  xml = replaceDotInline(xml, 'Cargo / Función', '{cargo}');

  // Teléfono + Sede — en el run siguiente al label, combinados
  xml = xml.replace(
    /(Teléfono<\/w:t><\/w:r>[\s\S]{1,200}?<w:t[^>]*>: )[…\.·\/• ]{3,}(Sede:)[…\.·\/• ]{3,}(<\/w:t>)/,
    '$1{telefono}$2{sede}$3'
  );

  // DNI — label en su propia celda; el placeholder va junto al label
  xml = tx(xml, 'Documento de Identidad</w:t>', 'Documento de Identidad {dni}</w:t>');

  // Número O.S. — el run tiene espacio antes del cierre de tag
  xml = tx(xml, 'Número Orden de Servicio: </w:t>', 'Número Orden de Servicio: {numeroOS}</w:t>');

  // Tipo solicitud — checkboxes flotantes WPS+VML, inject junto al texto label
  xml = tx(xml, '     Creación</w:t>',      '     Creación {ckCreacion}</w:t>');
  xml = tx(xml, ' Actualización    </w:t>', ' Actualización {ckActualizacion}    </w:t>');
  xml = tx(xml, 'Baja                   Desactivación</w:t>',
    '{ckBaja}Baja                   {ckDesactivacion}Desactivación</w:t>');

  // Punto de red — celdas de tabla sin patrón rtl → tx() junto al label
  xml = tx(xml, 'SI</w:t></w:r></w:p></w:tc>', '{ckSi}SI</w:t></w:r></w:p></w:tc>');
  xml = tx(xml, 'NO</w:t></w:r></w:p></w:tc>', '{ckNo}NO</w:t></w:r></w:p></w:tc>');

  // IP asignada
  xml = tx(xml, 'Llenado por OTIN</w:t>', 'Llenado por OTIN: {ipAsignada}</w:t>');

  // Servicios — checkboxes en tabla sin rtl, inject junto al label
  xml = tx(xml, 'Cuenta de usuario de red</w:t></w:r></w:p></w:tc>',
    '{ckCuentaRed}Cuenta de usuario de red</w:t></w:r></w:p></w:tc>');
  xml = tx(xml, 'Internet</w:t></w:r></w:p></w:tc>',
    '{ckInternet}Internet</w:t></w:r></w:p></w:tc>');
  xml = tx(xml, 'Cuenta de Correo institucional</w:t></w:r></w:p></w:tc>',
    '{ckCorreoInst}Cuenta de Correo institucional</w:t></w:r></w:p></w:tc>');
  xml = tx(xml, 'Con redes sociales</w:t></w:r></w:p></w:tc>',
    '{ckConRedes}Con redes sociales</w:t></w:r></w:p></w:tc>');
  xml = tx(xml, 'Sin redes sociales</w:t></w:r></w:p></w:tc>',
    '{ckSinRedes}Sin redes sociales</w:t></w:r></w:p></w:tc>');

  // Perfil de internet y genérico
  xml = tx(xml, 'Indicar 1, 2 o 3</w:t>', 'Indicar: {perfilInternet}</w:t>');
  // usuario genérico — el run empieza con espacio (no "Para")
  xml = tx(xml, ' usuario genérico, indicar el nombre:</w:t>',
    ' usuario genérico: {nombreGenerico}</w:t>');
  xml = tx(xml, 'Indicar nueva capacidad solicitada</w:t>',
    'Nueva capacidad: {capacidadBuzon}</w:t>');

  // Justificación — "EXCEPCIONES: " tiene espacio antes del cierre de tag
  xml = tx(xml, 'CEPCIONES: </w:t>', 'CEPCIONES: {justificacion}</w:t>');

  // Director — parentética en 3 runs: "(la) Director..." + "o Funcionario Autorizado" + ")"
  xml = xml.replace(
    /\(la\) Director\(a\) Técnico\(a\) \/ Nacional (<\/w:t><\/w:r>)<w:r[^>]*><w:rPr>[\s\S]*?<\/w:rPr><w:t[^>]*>o Funcionario Autorizado<\/w:t><\/w:r><w:r[^>]*><w:rPr>[\s\S]*?<\/w:rPr><w:t>\)<\/w:t><\/w:r>/g,
    '{nombreDirector}$1'
  );

  return xml;
}

// ─── ANEXO 03 ─────────────────────────────────────────────────────────────────
function patchAnexo03(xml) {
  // FECHA DE SOLICITUD — fill inline en el mismo run del label, más un run "." extra
  xml = replaceDotInline(xml, 'FECHA DE SOLICITUD:', '{fechaSolicitud}');
  xml = xml.replace(
    /(\{fechaSolicitud\}<\/w:t><\/w:r>)<w:r[^>]*><w:rPr>[\s\S]*?<\/w:rPr><w:t[^>]*>\.<\/w:t><\/w:r>/,
    '$1'
  );

  // FECHA DE TERMINO — "FECHA DE " en run1, "TERMINO" en run2, ":fill" en run3, "…" en run4
  // Reemplaza run3 y run4 por un único run con el placeholder
  xml = xml.replace(
    /TERMINO(<\/w:t><\/w:r>)<w:r[^>]*><w:rPr>[\s\S]*?<\/w:rPr><w:t>:[…\.·\/• ]{3,}<\/w:t><\/w:r><w:r><w:rPr>[\s\S]*?<\/w:rPr><w:t>[…\.·\/• ]+<\/w:t><\/w:r>/,
    'TERMINO$1<w:r><w:rPr><w:b/><w:sz w:val="20"/></w:rPr><w:t>:{fechaTermino}</w:t></w:r>'
  );

  // Campos con fill en run separado
  xml = replaceDots(xml, '1.- AREA:', '{area}');
  xml = replaceDots(xml, '2. JEFE DE AREA:', '{jefeArea}');
  xml = replaceDots(xml, '3. USUARIO SOLICITANTE:', '{usuarioSolicitante}');

  // Fallback inline por si el fill está en el mismo run del label
  xml = replaceDotInline(xml, '1.- AREA:', '{area}');
  xml = replaceDotInline(xml, '2. JEFE DE AREA:', '{jefeArea}');
  xml = replaceDotInline(xml, '3. USUARIO SOLICITANTE:', '{usuarioSolicitante}');

  // Propósito — "PROP O S ITO" fragmentado letra por letra; el último run termina en "ITO:"
  xml = tx(xml, 'ITO:</w:t>', 'ITO: {proposito}</w:t>');

  return xml;
}

// ─── ANEXO 04 ─────────────────────────────────────────────────────────────────
function patchAnexo04(xml) {
  // Este doc usa datos de ejemplo en vez de fill chars.
  // Estrategia: reemplazar los valores de ejemplo concretos con tx().
  // Los labels son texto fragmentado entre letras — NO usamos replaceDots.

  // Datos personales del ejemplo
  xml = tx(xml, 'Julia De la flor Tito</w:t>',      '{nombres}</w:t>');
  xml = tx(xml, 'julia.delaflor@inei.gob.pe</w:t>', '{correo}</w:t>');

  // Cargo — dos runs: "Tecnico " + "InformaticoVII"
  xml = tx(xml, 'Tecnico </w:t>',     '{cargo}</w:t>');
  xml = tx(xml, 'InformaticoVII',     '');

  // Período de acceso
  xml = tx(xml, '13/2/24</w:t>',  '{fechaInicio}</w:t>');
  xml = tx(xml, '11/7/24</w:t>',  '{fechaTermino}</w:t>');

  // Marca de checkbox seleccionado (único "X" en el documento)
  xml = tx(xml, '>X</w:t>', '>{ckAcceso}</w:t>');

  // Recurso compartido (única ruta de red de ejemplo)
  xml = tx(xml, '\\\\SAN 01\\FICHAS</w:t>', '{recurso}</w:t>');

  // Justificación — la example justification text
  xml = tx(xml, 'ACCESO SOLO LECTURA.</w:t>', '{justificacion}</w:t>');

  // Justificación campo label (por si hay otro tx previo que lo modifica)
  xml = tx(xml, 'Justificación de la Solicitud:</w:t>',
    'Justificación de la Solicitud: {justificacion}</w:t>');

  return xml;
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
const anexo02File = fs.readdirSync(ANEXOS_DIR).find(f => f.startsWith('ANEXO 02'));

const files = [
  { src: 'ANEXO 01 - Acceso Remoto y Desbloqueo de Puertos USB.docx', dst: 'ANEXO01_template.docx', patch: patchAnexo01 },
  { src: anexo02File,  dst: 'ANEXO02_template.docx', patch: patchAnexo02 },
  { src: 'ANEXO 03 - Solicitud de Servicio FTP.docx', dst: 'ANEXO03_template.docx', patch: patchAnexo03 },
  { src: 'ANEXO 04 - Acceso a recursos compartidos.docx', dst: 'ANEXO04_template.docx', patch: patchAnexo04 },
];

let ok = 0;
files.forEach(({ src, dst, patch }) => {
  if (!src) { console.warn(`⚠️  No encontrado: ${dst}`); return; }
  try {
    processAnexo(src, dst, patch);
    ok++;
  } catch (e) {
    console.error(`❌  ${dst}: ${e.message}`);
  }
});

console.log(`\n${ok}/4 templates generados en /templates/`);
