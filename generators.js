/**
 * generators.js
 * Genera documentos Word (.docx) para los ANEXOS OTIN/INEI
 * usando la librería `docx` (v9.6.1), construyendo los documentos
 * desde cero (sin templates).
 *
 * Flujo: data (objeto JS) → estructura docx → buffer .docx
 *
 * Exporta: generateAnexo01, generateAnexo02, generateAnexo03, generateAnexo04
 */

const {
  Document, Packer, Paragraph, Table, TableRow, TableCell,
  TextRun, AlignmentType, BorderStyle, WidthType, PageBreak,
  ShadingType, HeightRule, VerticalAlign
} = require('docx');

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────────────────────────────────────
const BLUE       = '1F3864'; // azul institucional (headers)
const LIGHT_BLUE = 'BDD7EE'; // fondo celdas header
const A2_BLUE    = '1565C0'; // azul datos usuario ANEXO 02

const PAGE_MARGINS = { top: 720, bottom: 720, left: 900, right: 900 };

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS BÁSICOS
// ─────────────────────────────────────────────────────────────────────────────

/** Retorna `n` Paragraph vacíos (para separar bloques verticalmente). */
function spacer(n = 1) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(new Paragraph({ children: [new TextRun({ text: '' })] }));
  }
  return out;
}

/** Paragraph bold, color BLUE, size 22, en MAYÚSCULAS. */
function sectionTitle(text) {
  return new Paragraph({
    spacing: { before: 120, after: 80 },
    children: [
      new TextRun({
        text: String(text ?? '').toUpperCase(),
        bold: true,
        color: BLUE,
        size: 22,
      }),
    ],
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// BORDES COMPARTIDOS
// ─────────────────────────────────────────────────────────────────────────────
function blueBorders() {
  const b = { style: BorderStyle.SINGLE, size: 4, color: BLUE };
  return { top: b, bottom: b, left: b, right: b, insideH: b, insideV: b };
}

function blueSingleBorder() {
  return { style: BorderStyle.SINGLE, size: 4, color: BLUE };
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS PARA generateAnexo01 (layout "inventado" — labels gris, valores blancos)
// ─────────────────────────────────────────────────────────────────────────────

/** TableCell con fondo LIGHT_BLUE, texto bold color BLUE, width ~30%. */
function labelCell(text) {
  return new TableCell({
    width: { size: 30, type: WidthType.PERCENTAGE },
    shading: { type: ShadingType.CLEAR, fill: LIGHT_BLUE, color: 'auto' },
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 60, bottom: 60, left: 120, right: 120 },
    children: [
      new Paragraph({
        children: [new TextRun({ text: String(text ?? ''), bold: true, color: BLUE, size: 20 })],
      }),
    ],
  });
}

/** TableCell blanco, texto negro, width ~70%. */
function valueCell(value) {
  return new TableCell({
    width: { size: 70, type: WidthType.PERCENTAGE },
    shading: { type: ShadingType.CLEAR, fill: 'FFFFFF', color: 'auto' },
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 60, bottom: 60, left: 120, right: 120 },
    children: [
      new Paragraph({
        children: [new TextRun({ text: String(value ?? ''), color: '000000', size: 20 })],
      }),
    ],
  });
}

/** TableRow con labelCell + valueCell. */
function sectionRow(label, value) {
  return new TableRow({ children: [labelCell(label), valueCell(value)] });
}

/** Table con bordes BLUE, width 100%, recibe array de TableRow. */
function sectionTable(rows) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: blueBorders(),
    rows,
  });
}

/** TableRow con label + checkboxes ☐/☒ inline. */
function checkboxRow(label, options, selected) {
  const sel = Array.isArray(selected) ? selected : [selected];
  const isSel = (opt) => sel.some((s) => s != null && String(s).toLowerCase() === String(opt).toLowerCase());

  const runs = [];
  options.forEach((opt, idx) => {
    if (idx > 0) runs.push(new TextRun({ text: '    ', size: 20 }));
    runs.push(new TextRun({ text: isSel(opt) ? '☒ ' : '☐ ', size: 22, color: BLUE, bold: true }));
    runs.push(new TextRun({ text: String(opt), size: 20, color: '000000' }));
  });

  return new TableRow({
    children: [
      labelCell(label),
      new TableCell({
        width: { size: 70, type: WidthType.PERCENTAGE },
        verticalAlign: VerticalAlign.CENTER,
        margins: { top: 60, bottom: 60, left: 120, right: 120 },
        children: [new Paragraph({ children: runs })],
      }),
    ],
  });
}

/**
 * TableRow con N celdas pares [label|value] inline.
 * fields: array de { label, value }.
 */
function multiFieldRow(fields) {
  const children = [];
  const n = fields.length;
  fields.forEach((f) => {
    children.push(
      new TableCell({
        width: { size: Math.floor(30 / n), type: WidthType.PERCENTAGE },
        shading: { type: ShadingType.CLEAR, fill: LIGHT_BLUE, color: 'auto' },
        verticalAlign: VerticalAlign.CENTER,
        margins: { top: 60, bottom: 60, left: 120, right: 120 },
        children: [
          new Paragraph({
            children: [new TextRun({ text: String(f.label ?? ''), bold: true, color: BLUE, size: 20 })],
          }),
        ],
      })
    );
    children.push(
      new TableCell({
        width: { size: Math.floor(70 / n), type: WidthType.PERCENTAGE },
        verticalAlign: VerticalAlign.CENTER,
        margins: { top: 60, bottom: 60, left: 120, right: 120 },
        children: [
          new Paragraph({
            children: [new TextRun({ text: String(f.value ?? ''), color: '000000', size: 20 })],
          }),
        ],
      })
    );
  });
  return new TableRow({ children });
}

/** Bloque de texto largo tipo "textarea" — label arriba + caja alta para el cuerpo. */
function textareaTable(label, value, minHeight = 1000) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: blueBorders(),
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 100, type: WidthType.PERCENTAGE },
            shading: { type: ShadingType.CLEAR, fill: LIGHT_BLUE, color: 'auto' },
            margins: { top: 60, bottom: 60, left: 120, right: 120 },
            children: [
              new Paragraph({
                children: [new TextRun({ text: String(label ?? ''), bold: true, color: BLUE, size: 20 })],
              }),
            ],
          }),
        ],
      }),
      new TableRow({
        height: { value: minHeight, rule: HeightRule.ATLEAST },
        children: [
          new TableCell({
            width: { size: 100, type: WidthType.PERCENTAGE },
            verticalAlign: VerticalAlign.TOP,
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [
              new Paragraph({
                children: [new TextRun({ text: String(value ?? ''), color: '000000', size: 20 })],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

/** Table de firma: 1 celda alta, label adentro, sublabel cursiva abajo. */
function signatureBlock(label, sublabel) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: blueBorders(),
    rows: [
      new TableRow({
        height: { value: 1400, rule: HeightRule.ATLEAST },
        children: [
          new TableCell({
            width: { size: 100, type: WidthType.PERCENTAGE },
            verticalAlign: VerticalAlign.BOTTOM,
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 600 },
                children: [new TextRun({ text: String(label ?? ''), bold: true, color: BLUE, size: 20 })],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: String(sublabel ?? ''), italics: true, color: '595959', size: 16 })],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

/**
 * Header de 3 celdas: logo INEI | título | número de ANEXO.
 * Estilo institucional (bordes BLUE).
 */
function anexoHeader(titulo, numeroAnexo) {
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
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
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
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: String(titulo ?? ''), bold: true, color: BLUE, size: 22 })],
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
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: String(numeroAnexo ?? ''), bold: true, color: BLUE, size: 20 })],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS PARA generateAnexo02 (layout "réplica fiel" — texto inline impreso)
// ─────────────────────────────────────────────────────────────────────────────

/** TextRun con el dato que escribe el usuario (azul A2, bold). */
function userText(value, opts = {}) {
  return new TextRun({ text: String(value ?? ''), bold: true, color: A2_BLUE, size: opts.size || 19 });
}

/** TextRun con texto fijo del formulario (negro grisáceo). */
function formText(text, opts = {}) {
  return new TextRun({
    text: String(text ?? ''),
    bold: !!opts.bold,
    italics: !!opts.italics,
    color: opts.color || '1A2533',
    size: opts.size || 19,
  });
}

/** Checkbox inline ☐/☒ para el layout réplica. */
function cb(checked) {
  return new TextRun({ text: checked ? '☒ ' : '☐ ', size: 22, color: checked ? A2_BLUE : '1A2533', bold: !!checked });
}

/** Bordes negros finos (todos los lados). */
function thinBlackBorder() {
  const b = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
  return { top: b, bottom: b, left: b, right: b, insideH: b, insideV: b };
}

/** Table 1×8: un dígito del DNI por celda, bordes negros finos. */
function dniBoxes(dni) {
  const digits = String(dni ?? '').replace(/\D/g, '').slice(0, 8).padEnd(8, ' ').split('');
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: thinBlackBorder(),
    rows: [
      new TableRow({
        children: digits.map((dg) =>
          new TableCell({
            width: { size: 12, type: WidthType.PERCENTAGE },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 30, bottom: 30, left: 30, right: 30 },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [userText(dg.trim(), { size: 22 })],
              }),
            ],
          })
        ),
      }),
    ],
  });
}

/** Table 1×1: número de Orden de Servicio, borde solo inferior. */
function osBox(numeroOS) {
  const b = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
  const none = { style: BorderStyle.NONE, size: 0, color: 'auto' };
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: none, bottom: b, left: none, right: none, insideH: none, insideV: none },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 100, type: WidthType.PERCENTAGE },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 30, bottom: 30, left: 60, right: 60 },
            children: [
              new Paragraph({ alignment: AlignmentType.CENTER, children: [userText(numeroOS)] }),
            ],
          }),
        ],
      }),
    ],
  });
}

/**
 * Header oficial: 3 celdas — INEI (bold azul) | título INEI + subtítulo | ANEXO 02.
 * Bordes negros, width 100%.
 */
function officialHeader() {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: thinBlackBorder(),
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 20, type: WidthType.PERCENTAGE },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 80, bottom: 80, left: 100, right: 100 },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: 'INEI', bold: true, color: A2_BLUE, size: 30 })],
              }),
            ],
          }),
          new TableCell({
            width: { size: 60, type: WidthType.PERCENTAGE },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 80, bottom: 80, left: 100, right: 100 },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: 'Instituto Nacional de Estadística e Informática',
                    bold: true,
                    color: '1A2533',
                    size: 18,
                  }),
                ],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: 'Oficina Técnica de Informática (OTIN) — Mesa de Ayuda',
                    italics: true,
                    color: '595959',
                    size: 15,
                  }),
                ],
              }),
            ],
          }),
          new TableCell({
            width: { size: 20, type: WidthType.PERCENTAGE },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 80, bottom: 80, left: 100, right: 100 },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: 'ANEXO 02', bold: true, color: A2_BLUE, size: 20 })],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

/** Table 1×1: label + valor sobre una línea (borde inferior únicamente). */
function lineFieldTable(labelText, value) {
  const b = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
  const none = { style: BorderStyle.NONE, size: 0, color: 'auto' };
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: none, bottom: b, left: none, right: none, insideH: none, insideV: none },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 100, type: WidthType.PERCENTAGE },
            margins: { top: 50, bottom: 50, left: 40, right: 40 },
            children: [
              new Paragraph({
                children: [formText(labelText, { bold: true }), userText(value)],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

/**
 * Caja de firma del ANEXO 02.
 * Bordes negros, altura mínima 1800, nombre pre-llenado centrado + label bold.
 * Debajo: Paragraph con helperText cursiva pequeño.
 * Retorna ARRAY [Table, Paragraph].
 */
function signatureBoxA2(label, helperText, prefilledName, prefilledDate) {
  const innerChildren = [];

  if (prefilledName) {
    innerChildren.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 600 },
        children: [userText(prefilledName, { size: 20 })],
      })
    );
  } else {
    innerChildren.push(new Paragraph({ spacing: { before: 700 }, children: [new TextRun({ text: '' })] }));
  }

  innerChildren.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      border: { top: { style: BorderStyle.SINGLE, size: 4, color: '000000' } },
      spacing: { before: 80 },
      children: [formText(label, { bold: true })],
    })
  );

  if (prefilledDate) {
    innerChildren.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [formText('Fecha: ', { bold: true }), userText(prefilledDate)],
      })
    );
  }

  const table = new Table({
    width: { size: 70, type: WidthType.PERCENTAGE },
    alignment: AlignmentType.CENTER,
    borders: thinBlackBorder(),
    rows: [
      new TableRow({
        height: { value: 1800, rule: HeightRule.ATLEAST },
        children: [
          new TableCell({
            width: { size: 100, type: WidthType.PERCENTAGE },
            verticalAlign: VerticalAlign.BOTTOM,
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: innerChildren,
          }),
        ],
      }),
    ],
  });

  const helper = new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 40 },
    children: [formText(helperText, { italics: true, size: 15, color: '595959' })],
  });

  return [table, helper];
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS ESPECÍFICOS ANEXO 02 (servicios / excepciones)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tabla de servicios: 5 filas
 *   título + A cuentaRed + B internet/correo + C perfiles hint + D redesSociales/buzon.
 */
function serviciosTable(srv, pNum) {
  srv = srv || {};
  const fullCell = (children) =>
    new TableCell({
      width: { size: 100, type: WidthType.PERCENTAGE },
      margins: { top: 50, bottom: 50, left: 120, right: 120 },
      children,
    });

  const rows = [];

  // Título
  rows.push(
    new TableRow({
      children: [
        new TableCell({
          width: { size: 100, type: WidthType.PERCENTAGE },
          shading: { type: ShadingType.CLEAR, fill: 'EFEFEF', color: 'auto' },
          margins: { top: 50, bottom: 50, left: 120, right: 120 },
          children: [new Paragraph({ children: [formText('SERVICIOS SOLICITADOS:', { bold: true })] })],
        }),
      ],
    })
  );

  // A — Cuenta de Red
  rows.push(
    new TableRow({
      children: [
        fullCell([
          new Paragraph({
            children: [cb(!!srv.cuentaRed), formText('A) Cuenta de Red (acceso a la red institucional y equipo).')],
          }),
        ]),
      ],
    })
  );

  // B — Internet / Correo
  rows.push(
    new TableRow({
      children: [
        fullCell([
          new Paragraph({
            children: [
              cb(!!srv.internet),
              formText('B) Acceso a Internet      '),
              cb(!!srv.correo),
              formText('Correo electrónico institucional'),
            ],
          }),
        ]),
      ],
    })
  );

  // C — Perfiles (hint)
  rows.push(
    new TableRow({
      children: [
        fullCell([
          new Paragraph({
            children: [
              formText('C) Perfil de Internet asignado: ', { bold: true }),
              userText(srv.internet ? pNum : ''),
              formText('   (ver detalle de perfiles en la página 2)', { italics: true, size: 16, color: '595959' }),
            ],
          }),
        ]),
      ],
    })
  );

  // D — Redes sociales / buzón
  rows.push(
    new TableRow({
      children: [
        fullCell([
          new Paragraph({
            children: [
              cb(srv.redesSociales === true),
              formText('D) Acceso a redes sociales      '),
              formText('Aumento de capacidad de buzón: '),
              userText(srv.aumentoBuzon || ''),
            ],
          }),
        ]),
      ],
    })
  );

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: thinBlackBorder(),
    rows,
  });
}

/** Caja de excepciones / justificación: 2 filas (título + cuerpo de altura mínima). */
function excepcionesBox(justificacion) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: thinBlackBorder(),
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 100, type: WidthType.PERCENTAGE },
            shading: { type: ShadingType.CLEAR, fill: 'EFEFEF', color: 'auto' },
            margins: { top: 50, bottom: 50, left: 120, right: 120 },
            children: [
              new Paragraph({ children: [formText('EXCEPCIONES / JUSTIFICACIÓN:', { bold: true })] }),
            ],
          }),
        ],
      }),
      new TableRow({
        height: { value: 900, rule: HeightRule.ATLEAST },
        children: [
          new TableCell({
            width: { size: 100, type: WidthType.PERCENTAGE },
            verticalAlign: VerticalAlign.TOP,
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [new Paragraph({ children: [userText(justificacion || '')] })],
          }),
        ],
      }),
    ],
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// ANEXO 01 — Acceso Remoto y Desbloqueo de Puertos USB
// ═════════════════════════════════════════════════════════════════════════════
async function generateAnexo01(d) {
  d = d || {};
  const accesos = Array.isArray(d.tipoAcceso) ? d.tipoAcceso : [d.tipoAcceso || 'remoto'];
  const accNorm = accesos.map((a) => String(a).toLowerCase());
  const wantsRemoto = accNorm.includes('remoto') || accNorm.includes('ambos');
  const wantsUSB = accNorm.includes('usb') || accNorm.includes('ambos');

  const correo = d.correoInstitucional || d.correo || '';
  const oficina = d.direccion || d.oficina || '';
  const hoy = d.fechaSolicitud || new Date().toLocaleDateString('es-PE');

  const children = [];

  children.push(anexoHeader('Acceso Remoto y Desbloqueo de Puertos USB', 'ANEXO 01'));
  children.push(...spacer(1));

  // DATOS DEL TRABAJADOR
  children.push(sectionTitle('Datos del Trabajador'));
  children.push(
    sectionTable([
      sectionRow('Nombres y Apellidos', d.nombres || ''),
      sectionRow('DNI', d.dni || ''),
      sectionRow('Cargo / Función', d.cargo || ''),
      multiFieldRow([
        { label: 'Dirección / Oficina', value: oficina },
        { label: 'Correo', value: correo },
      ]),
      multiFieldRow([
        { label: 'Sede', value: d.sede || '' },
        { label: 'Teléfono', value: d.telefono || '' },
      ]),
    ])
  );
  children.push(...spacer(1));

  // TIPO DE CONTRATO
  children.push(sectionTitle('Tipo de Contrato'));
  children.push(
    sectionTable([
      checkboxRow('Modalidad', ['NOMBRADO', 'CAS', 'LOCADOR-OS', 'OTROS'], d.tipoContrato),
      multiFieldRow([
        { label: 'Fecha Inicio', value: d.fechaInicioContrato || d.fechaInicio || '' },
        { label: 'Fecha Término', value: d.fechaTerminoContrato || d.fechaTermino || '' },
      ]),
    ])
  );
  children.push(...spacer(1));

  // TIPO DE ACCESO
  children.push(sectionTitle('Tipo de Acceso'));
  const accSel = [];
  if (wantsRemoto) accSel.push('Acceso Remoto');
  if (wantsUSB) accSel.push('Desbloqueo USB');
  children.push(
    sectionTable([
      checkboxRow('Acceso solicitado', ['Acceso Remoto', 'Desbloqueo USB'], accSel),
      sectionRow('Número OS', d.numeroOS || ''),
      multiFieldRow([
        { label: 'Fecha Inicio Acceso', value: d.fechaInicioAcceso || '' },
        { label: 'Fecha Término Acceso', value: d.fechaTerminoAcceso || '' },
      ]),
    ])
  );
  children.push(...spacer(1));

  // JUSTIFICACIONES
  children.push(textareaTable('Justificación — Acceso Remoto', d.justificacionRemoto || '', 1000));
  children.push(...spacer(1));
  children.push(textareaTable('Justificación — Desbloqueo USB', d.justificacionUSB || '', 1000));
  children.push(...spacer(2));

  // FIRMAS
  children.push(signatureBlock(`Firma del Director/a${d.nombreDirector ? ' — ' + d.nombreDirector : ''}`, 'Director/a de Área'));
  children.push(...spacer(1));
  children.push(
    signatureBlock(`Firma del Solicitante${d.nombresSolicitante ? ' — ' + d.nombresSolicitante : (d.nombres ? ' — ' + d.nombres : '')}`, `Solicitante — ${hoy}`)
  );

  const doc = new Document({
    styles: { default: { document: { run: { font: 'Calibri', size: 20 } } } },
    sections: [
      {
        properties: { page: { margin: PAGE_MARGINS } },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}

// ═════════════════════════════════════════════════════════════════════════════
// ANEXO 02 — Acceso a Servicios Informáticos (réplica fiel del formulario INEI)
// ═════════════════════════════════════════════════════════════════════════════
async function generateAnexo02(d) {
  if (d === null || d === undefined) throw new TypeError("generateAnexo02: argumento 'd' es requerido");

  const srv = d.servicios ?? d.srv ?? {};
  const pNum = String(d.perfilInternet || srv.perfilInternet || '');
  const hoy = d.fechaSolicitud || new Date().toLocaleDateString('es-PE');

  const correo = d.correoInstitucional || d.correo || '';
  const oficina = d.direccion || d.oficina || '';
  const sede = d.sede || '';

  const children = [];

  // ── PÁGINA 1 ──────────────────────────────────────────────────────────────
  children.push(officialHeader());
  children.push(...spacer(1));

  // Banda de instrucciones
  children.push(
    new Paragraph({
      children: [
        formText(
          'Para solicitar la creación, actualización, baja o desactivación de servicios informáticos, el Director Técnico/Nacional o Funcionario Autorizado debe completar el presente formulario y enviarlo a la OTIN.',
          { italics: true }
        ),
      ],
    })
  );
  children.push(...spacer(1));

  // Título de sección
  children.push(
    new Paragraph({
      children: [
        formText('DATOS DEL USUARIO A QUIEN SE LE BRINDARÁ ACCESO A LOS SERVICIOS INFORMÁTICOS:', { bold: true }),
      ],
    })
  );

  // Table 1×2: contrato | fechas
  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: thinBlackBorder(),
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 65, type: WidthType.PERCENTAGE },
              margins: { top: 50, bottom: 50, left: 120, right: 120 },
              children: [
                new Paragraph({
                  children: [
                    formText('Condición laboral:  '),
                    cb(d.tipoContrato === 'NOMBRADO'),
                    formText('NOMBRADO  '),
                    cb(d.tipoContrato === 'CAS'),
                    formText('CAS  '),
                    cb(d.tipoContrato === 'LOCADOR-OS'),
                    formText('LOCADOR-OS  '),
                    cb(d.tipoContrato === 'OTROS'),
                    formText('OTROS'),
                  ],
                }),
              ],
            }),
            new TableCell({
              width: { size: 35, type: WidthType.PERCENTAGE },
              margins: { top: 50, bottom: 50, left: 120, right: 120 },
              children: [
                new Paragraph({ children: [formText('Fecha Inicio: ', { bold: true }), userText(d.fechaInicio || '')] }),
                new Paragraph({ children: [formText('Fecha Término: ', { bold: true }), userText(d.fechaTermino || '')] }),
              ],
            }),
          ],
        }),
      ],
    })
  );

  // Párrafo cursiva
  children.push(
    new Paragraph({
      children: [formText('(Considerar que el personal debe tener contrato activo vigente)', { italics: true, size: 16, color: '595959' })],
    })
  );
  children.push(...spacer(1));

  // Nombres y Apellidos
  children.push(lineFieldTable('Nombres y Apellidos: ', d.nombres || ''));

  // Dirección/Oficina + Correo
  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: (() => {
        const b = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
        const none = { style: BorderStyle.NONE, size: 0, color: 'auto' };
        return { top: none, bottom: b, left: none, right: none, insideH: none, insideV: none };
      })(),
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 100, type: WidthType.PERCENTAGE },
              margins: { top: 50, bottom: 50, left: 40, right: 40 },
              children: [
                new Paragraph({
                  children: [
                    formText('Dirección/ Oficina: ', { bold: true }),
                    userText(oficina),
                    formText('   Correo electrónico institucional: ', { bold: true }),
                    userText(correo),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    })
  );

  // Cargo/Función + Teléfono + Sede
  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: (() => {
        const b = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
        const none = { style: BorderStyle.NONE, size: 0, color: 'auto' };
        return { top: none, bottom: b, left: none, right: none, insideH: none, insideV: none };
      })(),
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 100, type: WidthType.PERCENTAGE },
              margins: { top: 50, bottom: 50, left: 40, right: 40 },
              children: [
                new Paragraph({
                  children: [
                    formText('Cargo / Función: ', { bold: true }),
                    userText(d.cargo || ''),
                    formText('   Teléfono/Anexo: ', { bold: true }),
                    userText(d.telefono || ''),
                    formText('   Sede: ', { bold: true }),
                    userText(sede),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    })
  );
  children.push(...spacer(1));

  // Table 1×4: DNI + OS
  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: (() => {
        const none = { style: BorderStyle.NONE, size: 0, color: 'auto' };
        return { top: none, bottom: none, left: none, right: none, insideH: none, insideV: none };
      })(),
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 22, type: WidthType.PERCENTAGE },
              verticalAlign: VerticalAlign.CENTER,
              margins: { top: 50, bottom: 50, left: 40, right: 40 },
              children: [new Paragraph({ children: [formText('Documento de Identidad:', { bold: true })] })],
            }),
            new TableCell({
              width: { size: 28, type: WidthType.PERCENTAGE },
              verticalAlign: VerticalAlign.CENTER,
              margins: { top: 50, bottom: 50, left: 40, right: 40 },
              children: [dniBoxes(d.dni)],
            }),
            new TableCell({
              width: { size: 28, type: WidthType.PERCENTAGE },
              verticalAlign: VerticalAlign.CENTER,
              margins: { top: 50, bottom: 50, left: 40, right: 40 },
              children: [new Paragraph({ children: [formText('Número Orden de Servicio:', { bold: true })] })],
            }),
            new TableCell({
              width: { size: 22, type: WidthType.PERCENTAGE },
              verticalAlign: VerticalAlign.CENTER,
              margins: { top: 50, bottom: 50, left: 40, right: 40 },
              children: [osBox(d.numeroOS)],
            }),
          ],
        }),
      ],
    })
  );
  children.push(...spacer(1));

  // Table 1×3: Tipo Solicitud | ¿Punto de Red? | IP asignada
  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: thinBlackBorder(),
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              margins: { top: 50, bottom: 50, left: 120, right: 120 },
              children: [
                new Paragraph({ children: [formText('Tipo de Solicitud:', { bold: true })] }),
                new Paragraph({
                  children: [
                    cb(d.tipoSolicitud === 'Creación'),
                    formText('Creación  '),
                    cb(d.tipoSolicitud === 'Actualización'),
                    formText('Actualización'),
                  ],
                }),
                new Paragraph({
                  children: [
                    cb(d.tipoSolicitud === 'Baja'),
                    formText('Baja  '),
                    cb(d.tipoSolicitud === 'Desactivación'),
                    formText('Desactivación'),
                  ],
                }),
              ],
            }),
            new TableCell({
              width: { size: 25, type: WidthType.PERCENTAGE },
              verticalAlign: VerticalAlign.CENTER,
              margins: { top: 50, bottom: 50, left: 120, right: 120 },
              children: [
                new Paragraph({
                  children: [
                    formText('¿Punto de Red?  ', { bold: true }),
                    cb(!!d.puntoDered),
                    formText('SI  '),
                    cb(!d.puntoDered),
                    formText('NO'),
                  ],
                }),
              ],
            }),
            new TableCell({
              width: { size: 25, type: WidthType.PERCENTAGE },
              verticalAlign: VerticalAlign.CENTER,
              margins: { top: 50, bottom: 50, left: 120, right: 120 },
              children: [
                new Paragraph({
                  children: [formText('IP asignada: ', { bold: true }), userText(d.ipAsignada || '')],
                }),
              ],
            }),
          ],
        }),
      ],
    })
  );
  children.push(...spacer(1));

  // Tabla de servicios
  children.push(serviciosTable(srv, pNum));
  children.push(...spacer(1));

  // Excepciones / justificación
  children.push(excepcionesBox(d.justificacion || ''));
  children.push(...spacer(1));

  // Firma del Director/a (página 1)
  const firmaDir = signatureBoxA2(
    'Firma y Sello del Director/a o Funcionario Autorizado',
    '(Nombres Completos del Director/a o Funcionario Autorizado)',
    d.nombreDirector || '',
    ''
  );
  children.push(...firmaDir);

  // ── PÁGINA 2 ──────────────────────────────────────────────────────────────
  children.push(new Paragraph({ children: [new PageBreak()] }));
  children.push(officialHeader());
  children.push(...spacer(1));

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [formText('COMPROMISO DEL USUARIO', { bold: true, size: 22, color: A2_BLUE })],
    })
  );
  children.push(...spacer(1));

  const compromisos = [
    'El usuario se compromete a utilizar los servicios informáticos del INEI únicamente para fines institucionales.',
    'El usuario es responsable de mantener la confidencialidad de su contraseña y cuenta de red.',
    'El incumplimiento de las políticas de uso aceptable puede resultar en la suspensión inmediata de los servicios.',
  ];
  compromisos.forEach((txt) => {
    children.push(
      new Paragraph({
        spacing: { after: 80 },
        alignment: AlignmentType.JUSTIFIED,
        children: [formText(txt)],
      })
    );
  });
  children.push(...spacer(1));

  children.push(
    new Paragraph({ children: [formText('PERFILES DE INTERNET:', { bold: true })] })
  );
  const perfiles = [
    'Perfil 1 (Acceso a Internet Avanzado): Acceso a internet, redes sociales y streaming.',
    'Perfil 2 (Acceso a Internet Intermedio): Acceso a internet y correo web, sin redes sociales ni streaming.',
    'Perfil 3 (Acceso a Internet Básico): Solo sitios de gobierno, educación, noticias y búsqueda.',
  ];
  perfiles.forEach((txt) => {
    children.push(
      new Paragraph({
        bullet: { level: 0 },
        spacing: { after: 60 },
        children: [formText(txt)],
      })
    );
  });
  children.push(...spacer(1));

  // Firma del solicitante (página 2)
  const firmaSol = signatureBoxA2(
    'Firma Digital y/o Firma y Sello del solicitante',
    '(Nombres Completos del Solicitante)',
    d.nombres || '',
    hoy
  );
  children.push(...firmaSol);
  children.push(...spacer(1));

  // Footer
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [formText('ANEXO 02 — Mesa de Ayuda OTIN — INEI', { italics: true, size: 12, color: '9CA3AF' })],
    })
  );

  const doc = new Document({
    styles: { default: { document: { run: { font: 'Calibri', size: 20 } } } },
    sections: [
      {
        properties: { page: { margin: PAGE_MARGINS } },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}

// ═════════════════════════════════════════════════════════════════════════════
// ANEXO 03 — Solicitud de Servicio FTP
// ═════════════════════════════════════════════════════════════════════════════
async function generateAnexo03(d) {
  d = d || {};
  const hoy = d.fechaSolicitud || new Date().toLocaleDateString('es-PE');

  const children = [];

  children.push(anexoHeader('Solicitud de Servicio FTP', 'ANEXO 03'));
  children.push(...spacer(1));

  children.push(sectionTitle('Datos de la Solicitud'));
  children.push(
    sectionTable([
      multiFieldRow([
        { label: 'Fecha de Solicitud', value: hoy },
        { label: 'Fecha de Término', value: d.fechaTermino || '' },
      ]),
      sectionRow('Área Solicitante', d.area || ''),
      sectionRow('Jefe de Área', d.jefeArea || ''),
      sectionRow('Usuario Solicitante', d.usuarioSolicitante || d.nombres || ''),
    ])
  );
  children.push(...spacer(1));

  children.push(textareaTable('Propósito de la Solicitud', d.proposito || '', 1200));
  children.push(...spacer(1));

  children.push(
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      children: [
        new TextRun({
          text: 'Nota: El Jefe de Área es responsable del uso adecuado del servicio FTP solicitado, así como de la información transferida a través del mismo.',
          italics: true,
          color: '595959',
          size: 18,
        }),
      ],
    })
  );
  children.push(...spacer(2));

  children.push(signatureBlock(`Firma del Jefe de Área${d.jefeArea ? ' — ' + d.jefeArea : ''}`, 'Jefe de Área'));
  children.push(...spacer(1));
  children.push(
    signatureBlock(
      `Firma del Solicitante${d.usuarioSolicitante ? ' — ' + d.usuarioSolicitante : d.nombres ? ' — ' + d.nombres : ''}`,
      `Solicitante — ${hoy}`
    )
  );

  const doc = new Document({
    styles: { default: { document: { run: { font: 'Calibri', size: 20 } } } },
    sections: [
      {
        properties: { page: { margin: PAGE_MARGINS } },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}

// ═════════════════════════════════════════════════════════════════════════════
// ANEXO 04 — Acceso a Recursos Compartidos
// ═════════════════════════════════════════════════════════════════════════════
async function generateAnexo04(d) {
  d = d || {};
  const correo = d.correoInstitucional || d.correo || '';
  const hoy = d.fechaSolicitud || new Date().toLocaleDateString('es-PE');

  const children = [];

  children.push(anexoHeader('Acceso a Recursos Compartidos', 'ANEXO 04'));
  children.push(...spacer(1));

  children.push(sectionTitle('Tipo de Solicitud'));
  children.push(
    sectionTable([
      checkboxRow('Solicitud', ['Acceso'], d.tipoSolicitud || 'Acceso'),
    ])
  );
  children.push(...spacer(1));

  children.push(sectionTitle('Datos del Solicitante'));
  children.push(
    sectionTable([
      sectionRow('Nombres y Apellidos', d.nombres || ''),
      sectionRow('Correo Institucional', correo),
      sectionRow('Cargo', d.cargo || ''),
      multiFieldRow([
        { label: 'Fecha Inicio', value: d.fechaInicio || '' },
        { label: 'Fecha Término', value: d.fechaTermino || '' },
      ]),
      sectionRow('Recurso (ruta del servidor)', d.recurso || ''),
    ])
  );
  children.push(...spacer(1));

  children.push(textareaTable('Justificación', d.justificacion || '', 1200));
  children.push(...spacer(2));

  children.push(signatureBlock('Firma del Director OTIN', 'Director/a OTIN'));
  children.push(...spacer(1));
  children.push(signatureBlock(`Firma del Solicitante${d.nombres ? ' — ' + d.nombres : ''}`, `Solicitante — ${hoy}`));

  const doc = new Document({
    styles: { default: { document: { run: { font: 'Calibri', size: 20 } } } },
    sections: [
      {
        properties: { page: { margin: PAGE_MARGINS } },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}

module.exports = { generateAnexo01, generateAnexo02, generateAnexo03, generateAnexo04 };
