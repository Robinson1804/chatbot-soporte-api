/**
 * generators.js
 * Genera documentos Word (.docx) para los ANEXOS OTIN/INEI.
 * ANEXO 01 usa plantilla oficial con docxtemplater.
 * Los demás anexos conservan la lógica existente del proyecto.
 *
 * Flujo: data (objeto JS) → estructura docx → buffer .docx
 *
 * Exporta: generateAnexo01, generateAnexo02, generateAnexo03, generateAnexo04
 */

const {
  Document, Packer, Paragraph, Table, TableRow, TableCell,
  TextRun, AlignmentType, BorderStyle, WidthType, PageBreak,
  ShadingType, HeightRule, VerticalAlign, ImageRun, TableLayoutType
} = require('docx');
const fs   = require('fs');
const path = require('path');

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────────────────────────────────────
const BLUE       = '1F3864'; // azul institucional (headers)
const LIGHT_BLUE = 'BDD7EE'; // fondo celdas header
const A2_BLUE    = '1565C0'; // azul datos usuario ANEXO 02

const PAGE_MARGINS    = { top: 720, bottom: 720, left: 900, right: 900 };
const A2_PAGE_MARGINS = { top: 426, bottom: 284, left: 1701, right: 1701 };

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
 * Header oficial ANEXO 02: logo INEI | título institucional | ANEXO 02.
 * Bordes negros, width 100%. logoBuffer puede ser null (fallback texto).
 */
function officialHeaderA2(logoBuffer) {
  const logoChildren = logoBuffer
    ? [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new ImageRun({ data: logoBuffer, transformation: { width: 68, height: 47 }, type: 'png' })],
      })]
    : [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: 'INEI', bold: true, color: A2_BLUE, size: 26 })],
      })];

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: thinBlackBorder(),
    rows: [
      new TableRow({
        height: { value: 700, rule: HeightRule.ATLEAST },
        children: [
          new TableCell({
            width: { size: 18, type: WidthType.PERCENTAGE },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 40, bottom: 40, left: 60, right: 60 },
            children: logoChildren,
          }),
          new TableCell({
            width: { size: 64, type: WidthType.PERCENTAGE },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 40, bottom: 40, left: 60, right: 60 },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: 'INSTITUTO NACIONAL DE ESTADÍSTICA E INFORMÁTICA', bold: true, color: '1A2533', size: 18 })],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: 'Formulario de solicitud de acceso a Servicios Informáticos', italics: true, color: '595959', size: 15 })],
              }),
            ],
          }),
          new TableCell({
            width: { size: 18, type: WidthType.PERCENTAGE },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 40, bottom: 40, left: 60, right: 60 },
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
function signatureBoxA2(label, helperText, prefilledName, prefilledDate, boxHeight = 1800) {
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
        height: { value: boxHeight, rule: HeightRule.ATLEAST },
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
/**
 * Tabla SERVICIOS — Una sola tabla con 11 columnas base y gridSpan,
 * replicando la estructura exacta del template ANEXO02_template.docx (T6).
 *
 * Ancho útil A4 (márgenes 1701+1701): W = 8495 twips
 * Grid 11 cols: [222, 834, 545, 708, 1261, 1559, 253, 368, 1815, 647, 283]
 *
 * Retorna una sola Table. Uso: children.push(serviciosTable(srv, pNum))
 */
function serviciosTable(srv, pNum) {
  srv = srv || {};
  const S = 16;
  const W = 8495;
  const G = [222, 834, 545, 708, 1261, 1559, 253, 368, 1815, 647, 283];

  const bl = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
  const borders = { top: bl, bottom: bl, left: bl, right: bl, insideH: bl, insideV: bl };

  const conRedes = srv.redesSociales === true || pNum === '1';
  const sinRedes = !!srv.internet && !conRedes;

  const cell = (children, width, span) => new TableCell({
    width: { size: width, type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 28, bottom: 28, left: 60, right: 60 },
    ...(span > 1 ? { columnSpan: span } : {}),
    children,
  });

  const empty = (width, span) => cell([new Paragraph({ children: [] })], width, span || 1);
  const p = (...runs) => new Paragraph({ children: runs });

  return new Table({
    width: { size: W, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths: G,
    borders,
    rows: [
      // ROW 1: Cuenta Red (span4) | ck (1) | Para usuario (span2) | valor (span4)
      new TableRow({ children: [
        cell([p(formText('Cuenta de usuario de red', { size: S }))],         G[0]+G[1]+G[2]+G[3], 4),
        cell([p(cb(!!srv.cuentaRed))],                                        G[4],                1),
        cell([p(formText('Para usuario genérico: ', { bold: true, size: S }))], G[5]+G[6],         2),
        cell([p(userText(srv.usuarioGenerico || '', { size: S }))],           G[7]+G[8]+G[9]+G[10],4),
      ]}),
      // ROW 2: (indent) | Internet | ck | Perfil | Indicar+valor (span4) | Correo | ck | spacer
      new TableRow({ children: [
        empty(G[0]),
        cell([p(formText('Internet', { size: S }))],                          G[1],  1),
        cell([p(cb(!!srv.internet))],                                          G[2],  1),
        cell([p(formText('Perfil', { bold: true, size: S }))],                G[3],  1),
        cell([
          p(formText('Indicar 1, 2 o 3', { italics: true, size: 13, color: '595959' })),
          p(userText(srv.internet ? pNum : '', { size: S })),
        ],                                                                     G[4]+G[5]+G[6]+G[7], 4),
        cell([p(formText('Cuenta de Correo institucional', { size: S }))],    G[8],  1),
        cell([p(cb(!!srv.correo))],                                            G[9],  1),
        empty(G[10]),
      ]}),
      // ROW 3: (indent) | Para Perfil 1 (span7) | Aumento buzón | valor | spacer
      new TableRow({ children: [
        empty(G[0]),
        cell([
          p(formText('Para el Perfil 1 (Acceso a Internet Avanzado), especificar:', { size: S })),
          p(userText(srv.perfil1Spec || '', { size: S })),
        ],                                                                     G[1]+G[2]+G[3]+G[4]+G[5]+G[6]+G[7], 7),
        cell([p(formText('Aumento de capacidad de buzón:', { size: S }))],    G[8],  1),
        cell([p(userText(srv.aumentoBuzon || '', { size: S }))],              G[9],  1),
        empty(G[10]),
      ]}),
      // ROW 4: (indent) | Con redes (span3) | ck | Sin redes | ck (span2) | nueva cap (span2) | spacer
      new TableRow({ children: [
        empty(G[0]),
        cell([p(formText('Con redes sociales', { size: S }))],                G[1]+G[2]+G[3], 3),
        cell([p(cb(conRedes))],                                                G[4],  1),
        cell([p(formText('Sin redes sociales', { size: S }))],                G[5],  1),
        cell([p(cb(sinRedes))],                                                G[6]+G[7], 2),
        cell([p(
          formText('Indicar nueva capacidad solicitada: ', { italics: true, size: 13, color: '595959' }),
          userText(srv.nuevaCapacidad || '', { size: S }),
        )],                                                                    G[8]+G[9], 2),
        empty(G[10]),
      ]}),
    ],
  });
}

/** Caja de excepciones / justificación: 2 filas (título + cuerpo de altura mínima). */
function excepcionesBox(justificacion, minHeight = 900) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: thinBlackBorder(),
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 100, type: WidthType.PERCENTAGE },
            shading: { type: ShadingType.CLEAR, fill: 'EFEFEF', color: 'auto' },
            margins: { top: 40, bottom: 40, left: 80, right: 80 },
            children: [
              new Paragraph({ children: [formText('EXCEPCIONES: JUSTIFICACION DE EL/LA DIRECTOR/A O FUNCIONARIO AUTORIZADO QUE SOLICITA PERMISOS ESPECIALES', { bold: true })] }),
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

  const PizZip = require('pizzip');
  const Docxtemplater = require('docxtemplater');

  // El ANEXO 01 debe respetar el formato oficial. Por eso se rellena la
  // plantilla .docx con docxtemplater, en lugar de reconstruir el documento
  // desde cero con la librería docx.
  const templateCandidates = [
    path.join(__dirname, 'templates', 'ANEXO01_template.docx'),
    path.join(__dirname, 'templates', 'ANEXO01_template_corregido.docx'),
    path.join(__dirname, 'ANEXO01_template.docx'),
    path.join(__dirname, 'ANEXO01_template_corregido.docx'),
  ];

  const templatePath = templateCandidates.find((candidate) => fs.existsSync(candidate));
  if (!templatePath) {
    throw new Error('No se encontró la plantilla ANEXO01_template.docx en /templates.');
  }

  const content = fs.readFileSync(templatePath, 'binary');
  const zip = new PizZip(content);

  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: '{', end: '}' },
    nullGetter: () => '',
  });

  const clean = (value) => String(value ?? '').trim();
  const lower = (value) => clean(value).toLowerCase();
  const upper = (value) => clean(value).toUpperCase();
  const isNoAplica = (value) => /^(no\s*aplica|n\/a|na|no)$/i.test(clean(value));

  const firstNonEmpty = (...values) => {
    for (const value of values) {
      const text = clean(value);
      if (text) return text;
    }
    return '';
  };

  const normalizeDate = (value) => {
    const text = clean(value);
    if (!text) return '';

    // YYYY-MM-DD → DD/MM/YYYY
    const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;

    // DD-MM-YYYY → DD/MM/YYYY
    const dashed = text.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (dashed) {
      return `${dashed[1].padStart(2, '0')}/${dashed[2].padStart(2, '0')}/${dashed[3]}`;
    }

    return text;
  };

  const tipoContrato = upper(firstNonEmpty(d.tipoContrato, d.contrato, d.modalidadContrato));

  const accesosRaw = Array.isArray(d.tipoAcceso)
    ? d.tipoAcceso
    : [firstNonEmpty(d.tipoAcceso, d.accesoSolicitado, d.servicioSolicitado, 'remoto')];
  const accesos = accesosRaw.map((item) => lower(item));
  const joinedAccesos = accesos.join(' ');

  const wantsRemoto =
    joinedAccesos.includes('remoto') ||
    joinedAccesos.includes('vpn') ||
    joinedAccesos.includes('forticlient') ||
    joinedAccesos.includes('ambos');

  const wantsUSB =
    joinedAccesos.includes('usb') ||
    joinedAccesos.includes('puerto') ||
    joinedAccesos.includes('medio removible') ||
    joinedAccesos.includes('ambos');

  const fechaSolicitud = normalizeDate(
    firstNonEmpty(d.fechaSolicitud, new Date().toLocaleDateString('es-PE'))
  );

  const fechaInicioContrato = normalizeDate(
    firstNonEmpty(d.fechaInicioContrato, d.fechaInicio, d.inicioContrato)
  );
  const fechaTerminoContrato = normalizeDate(
    firstNonEmpty(d.fechaTerminoContrato, d.fechaTermino, d.finContrato, d.terminoContrato)
  );

  const fechaInicioAcceso = normalizeDate(
    firstNonEmpty(d.fechaInicioAcceso, d.fechaInicioPermiso, d.fechaInicioVPN, fechaInicioContrato)
  );
  const fechaTerminoAcceso = normalizeDate(
    firstNonEmpty(d.fechaTerminoAcceso, d.fechaFinAcceso, d.fechaTerminoPermiso, d.fechaTerminoVPN, fechaTerminoContrato)
  );

  const numeroOS = firstNonEmpty(d.numeroOS, d.ordenServicio, d.numeroOrdenServicio);

  // ANEXO 01 principal: el campo "Correo electrónico" corresponde al correo
  // institucional si el usuario lo proporciona. Para VPN, el correo personal se
  // usa en el cuadro "VPN con doble autenticación".
  const correoInstitucional = firstNonEmpty(
    d.correoInstitucional,
    d.emailInstitucional,
    d.correoINEI,
    d.correoInEi
  );

  const correoPersonal = firstNonEmpty(
    d.correoPersonal,
    d.emailPersonal,
    d.correoDobleAutenticacion,
    d.correoVPN,
    // Compatibilidad: si el modelo envía d.correo con un correo no institucional,
    // usarlo solo para el formato VPN, no para el campo institucional del Anexo 01.
    /@inei\.gob\.pe$/i.test(clean(d.correo)) ? '' : d.correo
  );

  const usuarioRed = firstNonEmpty(
    d.usuarioRed,
    d.userRed,
    d.usuarioRedINEI,
    d.usuarioINEI,
    d.usuario,
    d.cuentaRed
  );

  const hostEquipo = firstNonEmpty(
    d.hostEquipo,
    d.host,
    d.nombreEquipo,
    d.nombreHost,
    d.equipoHost
  );

  const data = {
    // Datos del usuario / trabajador
    nombres: firstNonEmpty(d.nombres, d.nombreCompleto, d.nombresApellidos),
    dni: firstNonEmpty(d.dni, d.documentoIdentidad, d.documento),
    cargo: firstNonEmpty(d.cargo, d.funcion, d.cargoFuncion),
    oficina: firstNonEmpty(d.oficina, d.direccion, d.direccionOficina, d.area, d.dependencia),
    correo: correoInstitucional,
    telefono: firstNonEmpty(d.telefono, d.anexo, d.celular, d.telefonoContacto),
    sede: firstNonEmpty(d.sede, d.local),

    // Fechas y OS
    fechaSolicitud,
    fechaInicioContrato,
    fechaTerminoContrato,
    fechaInicioAcceso,
    fechaTerminoAcceso,
    numeroOS: isNoAplica(numeroOS) ? '' : numeroOS,

    // Checkboxes de contrato
    ckNombrado: tipoContrato.includes('NOMBRADO') ? 'X' : '',
    ckCAS: tipoContrato.includes('CAS') ? 'X' : '',
    ckLocador:
      tipoContrato.includes('LOCADOR') ||
      tipoContrato.includes('LOCACION') ||
      tipoContrato.includes('LOCACIÓN') ||
      tipoContrato.includes('O.S') ||
      tipoContrato.includes('OS')
        ? 'X'
        : '',
    ckOtros: tipoContrato.includes('OTRO') ? 'X' : '',

    // Checkboxes de acceso
    ckAccesoRemoto: wantsRemoto ? 'X' : '',
    ckUSB: wantsUSB ? 'X' : '',

    // Justificaciones y firmantes
    justificacionRemoto: firstNonEmpty(d.justificacionRemoto, d.justificacionAccesoRemoto, wantsRemoto ? d.justificacion : ''),
    justificacionUSB: firstNonEmpty(d.justificacionUSB, d.justificacionDesbloqueoUSB, wantsUSB ? d.justificacion : ''),
    nombresSolicitante: firstNonEmpty(d.nombresSolicitante, d.solicitante, d.nombres, d.nombreCompleto),
    nombreDirector: firstNonEmpty(d.nombreDirector, d.director, d.funcionarioAutorizado, d.jefeArea),

    // Formato VPN adicional incluido en la plantilla oficial
    usuarioRed,
    ipOpcional: firstNonEmpty(d.ipOpcional, d.ip, d.ipEquipo),
    correoPersonal,
    hostEquipo,
  };

  try {
    doc.render(data);
  } catch (err) {
    const detail = err.properties?.errors
      ?.map((e) => e.properties?.explanation || e.message)
      .join(' | ');
    throw new Error(`Error al renderizar ANEXO 01: ${detail || err.message}`);
  }

  return doc.getZip().generate({
    type: 'nodebuffer',
    compression: 'DEFLATE',
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// ANEXO 02 — Acceso a Servicios Informáticos (réplica fiel del formulario INEI)
// ═════════════════════════════════════════════════════════════════════════════
async function generateAnexo02(d) {
  if (d === null || d === undefined) throw new TypeError("generateAnexo02: argumento 'd' es requerido");

  const PizZip        = require('pizzip');
  const Docxtemplater = require('docxtemplater');

  const srv  = d.servicios ?? d.srv ?? {};
  const pNum = String(d.perfilInternet || srv.perfilInternet || '');

  const templatePath = path.join(__dirname, 'templates', 'ANEXO02_template.docx');
  const content      = fs.readFileSync(templatePath, 'binary');
  const zip          = new PizZip(content);

  // ── Pre-procesar el XML para fusionar runs fragmentados ──────────────────
  // Word divide los placeholders {xxx} en múltiples <w:r> al editar.
  // Patrones presentes en este template:
  //
  // Patrón C  – 3 runs: '{' | 'nombre' | '}'  (proofErr opcionales entre runs)
  // Patrón D  – 4 runs: '{' | 'p1' | 'p2' | '}'  (p1+p2 sin proofErr entre ellos)
  //             Ocurre cuando Word fragmenta el nombre en 2 runs (ej. 'fechaI'+'Hoy').
  //             Se normaliza a '{fechaHoy}' renombrando 'fechaIHoy' → 'fechaHoy'.
  // Patrón BE – texto+'{' en un run, nombre en el siguiente, '}' en el tercero
  //             Ej: <w:t>Fecha Inicio: {</w:t>…<w:t>fechaInicio</w:t>…<w:t>}</w:t>
  // Patrón B  – texto+'{' en un run, 'nombre}' en el siguiente (2 runs)
  //             Ej: <w:t> {</w:t>…<w:t>telefono}</w:t>
  //
  // CRÍTICO — RPR_SC: la <w:rPr> en OOXML solo contiene self-closing tags
  // (<w:rFonts/>, <w:b/>, <w:sz/>, etc.). Usar [\s\S]*? aquí cruza párrafos y
  // produce matches de cientos de KB que destruyen el documento. RPR_SC matchea
  // solo los self-closing tags dentro de rPr, sin cruzar ningún límite XML.
  let docXml = zip.file('word/document.xml').asText();

  const RPR_SC = '(?:<w:rPr>(?:<[^<>]+/>\\s*)*<\\/w:rPr>)?';

  // Paso 0 – Patrón D: { | 'fechaI' | 'Hoy' | }
  // Word fragmentó {fechaHoy} en 4 runs al editar el template: { + fechaI + Hoy + }
  // (entre fechaI y Hoy NO hay proofErr — diferente rsid en cada run).
  docXml = docXml.replace(
    new RegExp(
      '<w:t(\\s[^>]*)?>\\{<\\/w:t><\\/w:r>(?:<w:proofErr[^/]*\\/>\\s*)?' +
      '<w:r(?:\\s[^>]*)?>'+RPR_SC+'<w:t(\\s[^>]*)?>fechaI<\\/w:t><\\/w:r>' +
      '<w:r(?:\\s[^>]*)?>'+RPR_SC+'<w:t(\\s[^>]*)?>Hoy<\\/w:t><\\/w:r>' +
      '(?:<w:proofErr[^/]*\\/>\\s*)?' +
      '<w:r(?:\\s[^>]*)?>'+RPR_SC+'<w:t(\\s[^>]*)?>\\\}<\\/w:t>',
      'g'
    ),
    (_, a1) => `<w:t${a1 || ''}>{fechaHoy}</w:t>`
  );

  // Paso 1 – Patrón C: {</w:t></w:r> ... <w:t>nombre</w:t></w:r> ... <w:t>}
  // La '{' está sola en un <w:t>, el nombre en el siguiente y '}' en el tercero.
  // Entre runs puede haber <w:proofErr .../> (spell/gramCheck markers).
  docXml = docXml.replace(
    new RegExp(
      '<w:t(\\s[^>]*)?>\\{<\\/w:t><\\/w:r>(?:<w:proofErr[^/]*\\/>)*' +
      '<w:r(?:\\s[^>]*)?>'+RPR_SC+'<w:t(\\s[^>]*)?>([a-zA-Z][a-zA-Z0-9_]*)<\\/w:t><\\/w:r>' +
      '(?:<w:proofErr[^/]*\\/>)*' +
      '<w:r(?:\\s[^>]*)?>'+RPR_SC+'<w:t(\\s[^>]*)?>\\\}<\\/w:t>',
      'g'
    ),
    (_, a1, _a2, name) => `<w:t${a1 || ''}>{${name}}</w:t>`
  );

  // Paso 2 – Patrón BE: texto+{</w:t></w:r> ... <w:t>nombre</w:t></w:r> ... <w:t>}
  // La '{' está al FINAL de texto en el primer run; nombre en el segundo; '}' en el tercero.
  // Ej: "Fecha Inicio: {" | "fechaInicio" | "}"
  docXml = docXml.replace(
    new RegExp(
      '(<w:t[^>]*>[^<]*)\\{<\\/w:t><\\/w:r>(?:<w:proofErr[^/]*\\/>\\s*)*' +
      '<w:r(?:\\s[^>]*)?>'+RPR_SC+'<w:t(\\s[^>]*)?>([a-zA-Z][a-zA-Z0-9_]*)<\\/w:t><\\/w:r>' +
      '(?:<w:proofErr[^/]*\\/>\\s*)*' +
      '<w:r(?:\\s[^>]*)?>'+RPR_SC+'<w:t(\\s[^>]*)?>\\\}<\\/w:t>',
      'g'
    ),
    (_, openTag, a2, name) => `${openTag}</w:t></w:r><w:r><w:t${a2 || ''}>{${name}}</w:t>`
  );

  // Paso 3 – Patrón B: texto+{</w:t></w:r> ... <w:t>nombre}  (2 runs)
  // La '{' está al final del texto del run anterior; 'nombre}' en el siguiente run.
  docXml = docXml.replace(
    new RegExp(
      '([^<]*\\{)<\\/w:t><\\/w:r>(?:<w:proofErr[^/]*\\/>\\s*)*' +
      '<w:r(?:\\s[^>]*)?>'+RPR_SC+'<w:t(\\s[^>]*)?>([a-zA-Z][a-zA-Z0-9_]*\\})',
      'g'
    ),
    (_, textWithBrace, a2, nameClose) => {
      const prefix = textWithBrace.slice(0, -1); // quitar la '{'
      return `${prefix}</w:t></w:r><w:r><w:t${a2 || ''}>{${nameClose}`;
    }
  );

  // ── Paso 3: hacer dinámicos los checkboxes estáticos del template ──────────
  // Condición laboral: ☐ NOMBRADO ☒ CAS ☐ LOCADOR/O.S. ☐ OTROS
  docXml = docXml.replace(
    '<w:t xml:space="preserve">☐ </w:t></w:r><w:proofErr w:type="gramStart"/><w:r><w:rPr><w:color w:val="1A2533"/><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr><w:t xml:space="preserve">NOMBRADO  </w:t></w:r><w:r><w:rPr><w:b/><w:bCs/><w:color w:val="1565C0"/></w:rPr><w:t>☒</w:t></w:r><w:proofErr w:type="gramEnd"/><w:r><w:rPr><w:b/><w:bCs/><w:color w:val="1565C0"/></w:rPr><w:t xml:space="preserve"> </w:t></w:r><w:r><w:rPr><w:color w:val="1A2533"/><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr><w:t xml:space="preserve">CAS  </w:t></w:r><w:r><w:rPr><w:color w:val="1A2533"/></w:rPr><w:t xml:space="preserve">☐ </w:t></w:r><w:r><w:rPr><w:color w:val="1A2533"/><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr><w:t xml:space="preserve">LOCADOR / O.S.  </w:t></w:r><w:r><w:rPr><w:color w:val="1A2533"/></w:rPr><w:t xml:space="preserve">☐ </w:t></w:r><w:r><w:rPr><w:color w:val="1A2533"/><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr><w:t>OTROS</w:t></w:r>',
    '<w:t xml:space="preserve">{ckNombrado} </w:t></w:r><w:proofErr w:type="gramStart"/><w:r><w:rPr><w:color w:val="1A2533"/><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr><w:t xml:space="preserve">NOMBRADO  </w:t></w:r><w:r><w:rPr><w:b/><w:bCs/><w:color w:val="1565C0"/></w:rPr><w:t>{ckCas}</w:t></w:r><w:proofErr w:type="gramEnd"/><w:r><w:rPr><w:b/><w:bCs/><w:color w:val="1565C0"/></w:rPr><w:t xml:space="preserve"> </w:t></w:r><w:r><w:rPr><w:color w:val="1A2533"/><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr><w:t xml:space="preserve">CAS  </w:t></w:r><w:r><w:rPr><w:color w:val="1A2533"/></w:rPr><w:t xml:space="preserve">{ckLocador} </w:t></w:r><w:r><w:rPr><w:color w:val="1A2533"/><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr><w:t xml:space="preserve">LOCADOR / O.S.  </w:t></w:r><w:r><w:rPr><w:color w:val="1A2533"/></w:rPr><w:t xml:space="preserve">{ckOtros} </w:t></w:r><w:r><w:rPr><w:color w:val="1A2533"/><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr><w:t>OTROS</w:t></w:r>'
  );

  // Tipo de solicitud: ☒ Creación ☐ Actualización ☐ Baja ☐ Desactivación
  docXml = docXml.replace(
    '<w:r><w:rPr><w:b/><w:bCs/><w:color w:val="1565C0"/></w:rPr><w:t xml:space="preserve">☒ </w:t></w:r><w:proofErr w:type="gramStart"/><w:r><w:rPr><w:color w:val="1A2533"/><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr><w:t xml:space="preserve">Creación  </w:t></w:r><w:r><w:rPr><w:color w:val="1A2533"/></w:rPr><w:t>☐</w:t></w:r><w:proofErr w:type="gramEnd"/><w:r><w:rPr><w:color w:val="1A2533"/></w:rPr><w:t xml:space="preserve"> </w:t></w:r><w:r><w:rPr><w:color w:val="1A2533"/><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr><w:t xml:space="preserve">Actualización  </w:t></w:r><w:r><w:rPr><w:color w:val="1A2533"/></w:rPr><w:t xml:space="preserve">☐ </w:t></w:r><w:r><w:rPr><w:color w:val="1A2533"/><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr><w:t xml:space="preserve">Baja  </w:t></w:r><w:r><w:rPr><w:color w:val="1A2533"/></w:rPr><w:t xml:space="preserve">☐ </w:t></w:r><w:r><w:rPr><w:color w:val="1A2533"/><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr><w:t>Desactivación</w:t></w:r>',
    '<w:r><w:rPr><w:b/><w:bCs/><w:color w:val="1565C0"/></w:rPr><w:t xml:space="preserve">{ckCreacion} </w:t></w:r><w:proofErr w:type="gramStart"/><w:r><w:rPr><w:color w:val="1A2533"/><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr><w:t xml:space="preserve">Creación  </w:t></w:r><w:r><w:rPr><w:color w:val="1A2533"/></w:rPr><w:t>{ckActualizacion}</w:t></w:r><w:proofErr w:type="gramEnd"/><w:r><w:rPr><w:color w:val="1A2533"/></w:rPr><w:t xml:space="preserve"> </w:t></w:r><w:r><w:rPr><w:color w:val="1A2533"/><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr><w:t xml:space="preserve">Actualización  </w:t></w:r><w:r><w:rPr><w:color w:val="1A2533"/></w:rPr><w:t xml:space="preserve">{ckBaja} </w:t></w:r><w:r><w:rPr><w:color w:val="1A2533"/><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr><w:t xml:space="preserve">Baja  </w:t></w:r><w:r><w:rPr><w:color w:val="1A2533"/></w:rPr><w:t xml:space="preserve">{ckDesactivacion} </w:t></w:r><w:r><w:rPr><w:color w:val="1A2533"/><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr><w:t>Desactivación</w:t></w:r>'
  );

  // SÍ/NO (¿Existe punto de red?): ☐ SI ☒ NO
  docXml = docXml.replace(
    '<w:t xml:space="preserve">☐ </w:t></w:r><w:proofErr w:type="gramStart"/><w:r><w:rPr><w:color w:val="1A2533"/><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr><w:t xml:space="preserve">SI  </w:t></w:r><w:r><w:rPr><w:b/><w:bCs/><w:color w:val="1565C0"/></w:rPr><w:t>☒</w:t></w:r>',
    '<w:t xml:space="preserve">{ckSi} </w:t></w:r><w:proofErr w:type="gramStart"/><w:r><w:rPr><w:color w:val="1A2533"/><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr><w:t xml:space="preserve">SI  </w:t></w:r><w:r><w:rPr><w:b/><w:bCs/><w:color w:val="1565C0"/></w:rPr><w:t>{ckNo}</w:t></w:r>'
  );

  zip.file('word/document.xml', docXml);

  // ── Renderizar con docxtemplater ─────────────────────────────────────────
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => '',
  });

  const ck  = (v) => v ? '☒' : '☐';
  const tc  = (d.tipoContrato || '').toUpperCase().replace(/[^A-Z\-]/g, '');
  const ts  = d.tipoSolicitud || '';
  const fechaHoy = new Date().toLocaleDateString('es-PE', {
    day: '2-digit', month: 'long', year: 'numeric',
  });

  doc.render({
    nombres:          d.nombres             || '',
    cargo:            d.cargo               || '',
    oficina:          d.direccion || d.oficina || '',
    correo:           d.correoInstitucional || d.correo || '',
    sede:             d.sede                || '',
    telefono:         d.telefono            || '',
    dni:              d.dni                 || '',
    numeroOS:         d.numeroOS            || '',
    fechaInicio:      d.fechaInicio         || '',
    fechaTermino:     d.fechaTermino        || '',
    ipAsignada:       d.ipAsignada          || '',
    perfilInternet:   pNum,
    capacidadBuzon:   srv.aumentoBuzon      || '',
    justificacion:    d.justificacion       || '',
    nombreDirector:   d.nombreDirector      || '',
    nombreGenerico:   srv.usuarioGenerico   || '',
    fechaHoy,
    fechaIHoy:        fechaHoy,
    // Condición laboral
    ckNombrado:       ck(tc === 'NOMBRADO'),
    ckCAS:            ck(tc === 'CAS'),
    ckLocador:        ck(tc === 'LOCADOROS' || tc === 'LOCADOR-OS'),
    ckOtros:          ck(tc === 'OTROS'),
    // Tipo de solicitud
    ckCreacion:       ck(ts === 'Creación'),
    ckActualizacion:  ck(ts === 'Actualización'),
    ckBaja:           ck(ts === 'Baja'),
    ckDesactivacion:  ck(ts === 'Desactivación'),
    // SÍ/NO punto de red (default: NO)
    ckSi:             '☐',
    ckNo:             '☒',
    // Servicios
    ckCuentaRed:      ck(srv.cuentaRed),
    ckInternet:       ck(srv.internet),
    ckCorreoInst:     ck(srv.correo),
    ckConRedes:       ck(pNum === '1' || srv.redesSociales),
    ckSinRedes:       ck(srv.internet && pNum !== '1' && !srv.redesSociales),
  });

  // ── Post-procesamiento: normalizar tamaños de fuente ────────────────────
  // docxtemplater inyecta el valor del placeholder en el run original del
  // template, preservando su <w:rPr>. Sin embargo dos casos producen fuentes
  // incorrectas en el documento final:
  //
  //   1. Checkboxes (☒ / ☐): el template los tiene a sz=16 (8pt). Deben
  //      ser sz=22 (11pt) para coincidir con el formulario oficial.
  //
  //   2. fechaInicio / fechaTermino: el placeholder estaba en un run cuya
  //      '{' pertenecía a otro run (Patrón B). docxtemplater crea un run
  //      nuevo SIN <w:rPr>, por lo que hereda el estilo predeterminado del
  //      documento en lugar del Arial 8pt del resto del formulario.
  //      Se les inyecta sz=16 (Arial 8pt) para uniformidad.
  //
  const zip2 = doc.getZip();
  let docXml2 = zip2.file('word/document.xml').asText();

  // 1. Checkboxes ☒/☐ con sz=16 → sz=22 (8pt → 11pt)
  //    Los runs tienen la forma:
  //    <w:r ...><w:rPr>...<w:sz w:val="16"/>...<w:szCs w:val="16"/>...</w:rPr><w:t ...>☒</w:t></w:r>
  docXml2 = docXml2.replace(
    /(<w:r(?:[^>]*)?>(?:<w:rPr>(?:<[^<>]+\/>[\s]*)*)<\/w:rPr>)?(<w:t[^>]*>[☒☐]<\/w:t><\/w:r>)/g,
    (match) => {
      // Subir sz de 16 a 22 solo dentro de este run
      return match
        .replace(/<w:sz w:val="16"\/>/g, '<w:sz w:val="22"/>')
        .replace(/<w:szCs w:val="16"\/>/g, '<w:szCs w:val="22"/>');
    }
  );

  // 2. Runs SIN <w:rPr> que contienen fechas (fechaInicio / fechaTermino):
  //    <w:r><w:t ...>DD/MM/YYYY</w:t></w:r>  → inyectar rPr Arial 8pt
  //    Patrón: <w:r> inmediatamente seguido de <w:t> (sin rPr intermedio)
  //    y el texto tiene forma de fecha DD/MM/YYYY.
  //    Usamos un selector más amplio: cualquier run sin rPr cuyo texto
  //    coincide con el formato de fecha usado en el formulario.
  docXml2 = docXml2.replace(
    /<w:r><w:t([^>]*)>(\d{1,2}\/\d{1,2}\/\d{4})<\/w:t><\/w:r>/g,
    '<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr><w:t$1>$2</w:t></w:r>'
  );

  zip2.file('word/document.xml', docXml2);
  return zip2.generate({ type: 'nodebuffer', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
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

// ═════════════════════════════════════════════════════════════════════════════
// ANEXO 07 — Transferencia de Información entre Áreas
// ═════════════════════════════════════════════════════════════════════════════
async function generateAnexo07(d) {
  d = d || {};
  const hoy = d.fechaSolicitud || new Date().toLocaleDateString('es-PE');

  const children = [];

  children.push(anexoHeader('Transferencia de Información entre Áreas', 'ANEXO 07'));
  children.push(...spacer(1));

  children.push(sectionTitle('Área Origen'));
  children.push(
    sectionTable([
      sectionRow('Área / Dirección', d.areaOrigen || ''),
      sectionRow('Jefe de Área Origen', d.jefeOrigen || ''),
      sectionRow('Responsable Origen', d.responsableOrigen || ''),
    ])
  );
  children.push(...spacer(1));

  children.push(sectionTitle('Área Destino'));
  children.push(
    sectionTable([
      sectionRow('Área / Dirección', d.areaDestino || ''),
      sectionRow('Jefe de Área Destino', d.jefeDestino || ''),
      sectionRow('Responsable Destino', d.responsableDestino || ''),
    ])
  );
  children.push(...spacer(1));

  children.push(sectionTitle('Detalle de la Transferencia'));
  children.push(
    sectionTable([
      sectionRow('Descripción de la información', d.descripcion || ''),
      sectionRow('Justificación', d.justificacion || ''),
      multiFieldRow([
        { label: 'Período — Inicio', value: d.periodoInicio || '' },
        { label: 'Período — Fin', value: d.periodoFin || '' },
      ]),
      sectionRow('Fecha de solicitud', hoy),
    ])
  );
  children.push(...spacer(2));

  children.push(signatureBlock(
    `Firma del Jefe de Área Origen${d.jefeOrigen ? ' — ' + d.jefeOrigen : ''}`,
    'Jefe de Área Origen'
  ));
  children.push(...spacer(1));
  children.push(signatureBlock(
    `Firma del Jefe de Área Destino${d.jefeDestino ? ' — ' + d.jefeDestino : ''}`,
    'Jefe de Área Destino'
  ));

  const doc = new Document({
    styles: { default: { document: { run: { font: 'Calibri', size: 20 } } } },
    sections: [{ properties: { page: { margin: PAGE_MARGINS } }, children }],
  });

  return Packer.toBuffer(doc);
}

module.exports = { generateAnexo01, generateAnexo02, generateAnexo03, generateAnexo04, generateAnexo07 };
