const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');

const TEMPLATE_PATH = path.join(__dirname, '..', 'templates', 'ANEXO01_template.docx');
const OUTPUT_PATH = path.join(__dirname, '..', 'templates', 'ANEXO01_rendered_test.docx');

const EXPECTED_PLACEHOLDERS = [
  'cargo', 'ckAccesoRemoto', 'ckCAS', 'ckLocador', 'ckNombrado', 'ckOtros',
  'correo', 'dni', 'fechaInicioAcceso', 'fechaInicioContrato', 'fechaSolicitud',
  'fechaTerminoAcceso', 'fechaTerminoContrato', 'justificacionRemoto',
  'justificacionUSB', 'nombreDirector', 'nombresSolicitante', 'nombres',
  'oficina', 'sede', 'telefono'
];

const TEST_DATA = {
  nombres: "Juan Alberto Pérez García",
  dni: "12345678",
  cargo: "Analista de Sistemas",
  oficina: "OTIN - Oficina Técnica de Informática",
  correo: "jperezg@inei.gob.pe",
  telefono: "987654321",
  sede: "Lima, Sede Central",
  fechaInicioContrato: "01/01/2025",
  fechaTerminoContrato: "31/12/2025",
  fechaSolicitud: "25/05/2026",
  ckNombrado: "",
  ckCAS: "X",
  ckLocador: "",
  ckOtros: "",
  ckAccesoRemoto: "X",
  fechaInicioAcceso: "01/06/2026",
  fechaTerminoAcceso: "31/12/2026",
  justificacionRemoto: "Trabajo remoto por comisión de servicio aprobada por jefatura.",
  justificacionUSB: "",
  nombreDirector: "Roberto López Quispe",
  nombresSolicitante: ""
};

let allPass = true;

function pass(msg) { console.log(`  PASS  ${msg}`); }
function fail(msg) { console.log(`  FAIL  ${msg}`); allPass = false; }

// ── 1. Leer el template ───────────────────────────────────────────────────────
console.log('\n=== TEST: ANEXO01_template.docx ===\n');

let templateBuffer;
try {
  templateBuffer = fs.readFileSync(TEMPLATE_PATH);
  pass(`Template leído (${templateBuffer.length} bytes)`);
} catch (e) {
  fail(`No se pudo leer el template: ${e.message}`);
  process.exit(1);
}

// ── 2. Verificar placeholders en el XML interno ───────────────────────────────
console.log('\n[1] Verificación de placeholders en XML interno');

let zip;
try {
  zip = new PizZip(templateBuffer);
} catch (e) {
  fail(`PizZip no pudo abrir el .docx: ${e.message}`);
  process.exit(1);
}

// Concatenar todo el XML relevante del docx
const xmlFiles = ['word/document.xml', 'word/header1.xml', 'word/header2.xml',
                  'word/footer1.xml', 'word/footer2.xml'];
let fullXml = '';
for (const f of xmlFiles) {
  const entry = zip.files[f];
  if (entry) fullXml += entry.asText();
}

// Extraer todos los {placeholder} encontrados
const foundSet = new Set();
const regex = /\{([a-zA-Z][a-zA-Z0-9_]*)\}/g;
let m;
while ((m = regex.exec(fullXml)) !== null) {
  foundSet.add(m[1]);
}

const foundList = Array.from(foundSet).sort();
console.log(`  Placeholders encontrados (${foundList.length}): ${foundList.join(', ')}`);

const expectedSet = new Set(EXPECTED_PLACEHOLDERS);
const missing = EXPECTED_PLACEHOLDERS.filter(p => !foundSet.has(p));
const extra   = foundList.filter(p => !expectedSet.has(p));

if (missing.length === 0) {
  pass(`Todos los ${EXPECTED_PLACEHOLDERS.length} placeholders esperados están presentes`);
} else {
  fail(`Faltan placeholders: ${missing.join(', ')}`);
}

if (extra.length === 0) {
  pass('No hay placeholders inesperados');
} else {
  console.log(`  WARN  Placeholders extra (no esperados): ${extra.join(', ')}`);
}

// ── 3. Render con docxtemplater ───────────────────────────────────────────────
console.log('\n[2] Render con docxtemplater');

let renderedBuffer;
try {
  const zip2 = new PizZip(templateBuffer);
  const doc = new Docxtemplater(zip2, {
    paragraphLoop: true,
    linebreaks: true,
  });

  try {
    doc.render(TEST_DATA);
  } catch (renderErr) {
    // docxtemplater wraps errors — extraer detalle
    if (renderErr.properties && renderErr.properties.errors) {
      const details = renderErr.properties.errors.map(e =>
        `  · Campo: "${e.properties && e.properties.id ? e.properties.id : '?'}" — ${e.message || e.properties.explanation || JSON.stringify(e.properties)}`
      ).join('\n');
      fail(`docxtemplater render error:\n${details}`);
    } else {
      fail(`docxtemplater render error: ${renderErr.message}`);
    }
    process.exit(1);
  }

  renderedBuffer = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
  pass('doc.render() completado sin errores');

} catch (e) {
  fail(`Error inesperado durante el render: ${e.message}`);
  process.exit(1);
}

// ── 4. Guardar output ─────────────────────────────────────────────────────────
console.log('\n[3] Guardar output');
try {
  fs.writeFileSync(OUTPUT_PATH, renderedBuffer);
  pass(`Archivo guardado: ${OUTPUT_PATH}`);
} catch (e) {
  fail(`No se pudo guardar el output: ${e.message}`);
}

// ── 5. Validar output ─────────────────────────────────────────────────────────
console.log('\n[4] Validación del output');

if (renderedBuffer.length > 5000) {
  pass(`Tamaño del output: ${renderedBuffer.length} bytes (> 5000)`);
} else {
  fail(`Output demasiado pequeño: ${renderedBuffer.length} bytes`);
}

// PK magic bytes: 0x50 0x4B
if (renderedBuffer[0] === 0x50 && renderedBuffer[1] === 0x4B) {
  pass('Magic bytes PK (0x50 0x4B) correctos — formato ZIP/DOCX válido');
} else {
  fail(`Magic bytes incorrectos: 0x${renderedBuffer[0].toString(16).toUpperCase()} 0x${renderedBuffer[1].toString(16).toUpperCase()}`);
}

// ── Resultado final ───────────────────────────────────────────────────────────
console.log('\n' + '='.repeat(40));
if (allPass) {
  console.log('RESULTADO FINAL: PASS — todas las verificaciones OK');
} else {
  console.log('RESULTADO FINAL: FAIL — revisar detalles arriba');
}
console.log('='.repeat(40) + '\n');
