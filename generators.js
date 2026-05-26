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

  const PizZip        = require('pizzip');
  const Docxtemplater = require('docxtemplater');

  const srv  = d.servicios ?? d.srv ?? {};
  const pNum = String(d.perfilInternet || srv.perfilInternet || '');

  const templatePath = path.join(__dirname, 'templates', 'ANEXO02_template.docx');
  const content      = fs.readFileSync(templatePath, 'binary');
  const zip          = new PizZip(content);

  // ── Pre-procesar el XML para fusionar runs fragmentados ──────────────────
  // Word divide los placeholders {xxx} en múltiples <w:r> al editar.
  // Hay 3 patrones de fragmentación en este template:
  //
  // Patrón B – '{' pegado al texto anterior en un run, nombre+'}' en el siguiente
  //   Ejemplo: <w:t>Cargo / Función{</w:t></w:r><proofErr?><w:r><w:t>cargo}</w:t>
  //   Fix: quitar el '{' del texto y pegar '{nombre}' al inicio del siguiente run
  //
  // Patrón C – tres runs separados: '{', 'nombre', '}'
  //   Ejemplo: <w:t>{</w:t></w:r><proofErr?><w:r><w:t>nombre</w:t></w:r><proofErr?><w:r><w:t>}
  //   Fix: colapsar los tres runs en '{nombre}' dentro del primer run
  //
  // Patrón A/D – placeholder ya completo en un único run, sin cambios
  let docXml = zip.file('word/document.xml').asText();

  // Paso 1 – Patrón C: {</w:t></w:r> ... <w:t>nombre</w:t></w:r> ... <w:t>}
  // La '{' está sola en un <w:t>, el nombre en el siguiente y '}' en el tercero.
  // Entre runs puede haber <w:proofErr .../> (spell/gramCheck markers).
  docXml = docXml.replace(
    /<w:t(\s[^>]*)?>(\{)<\/w:t><\/w:r>(?:<w:proofErr[^/]*\/>)*<w:r(?:\s[^>]*)?>(?:<w:rPr>[\s\S]*?<\/w:rPr>)?<w:t(\s[^>]*)?>([a-zA-Z][a-zA-Z0-9_]*)<\/w:t><\/w:r>(?:<w:proofErr[^/]*\/>)*<w:r(?:\s[^>]*)?>(?:<w:rPr>[\s\S]*?<\/w:rPr>)?<w:t(\s[^>]*)?>\}<\/w:t>/g,
    (_, a1, _brace, _a3, name, _a5) => `<w:t${a1 || ''}>{${name}}</w:t>`
  );

  // Paso 2 – Patrón B: texto{</w:t></w:r> ... <w:t>nombre}
  // La '{' está al final del texto del run anterior; 'nombre}' en el siguiente run.
  docXml = docXml.replace(
    /(\{)<\/w:t><\/w:r>(?:<w:proofErr[^/]*\/>)*<w:r(?:\s[^>]*)?>(?:<w:rPr>[\s\S]*?<\/w:rPr>)?<w:t(\s[^>]*)?>([a-zA-Z][a-zA-Z0-9_]*\})/g,
    (_, _brace, a2, nameClose) => `</w:t></w:r><w:r><w:t${a2 || ''}>{${nameClose}`
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
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

  const ck  = (v) => v ? '☒' : '☐';
  const tc  = (d.tipoContrato || '').toUpperCase().replace(/[^A-Z\-]/g, '');
  const ts  = d.tipoSolicitud || '';

  doc.render({
    nombres:          d.nombres             || '',
    cargo:            d.cargo               || '',
    oficina:          d.direccion || d.oficina || '',
    correo:           d.correoInstitucional || d.correo || '',
    sede:             d.sede                || '',
    telefono:         d.telefono            || '',
    ipAsignada:       d.ipAsignada          || '',
    perfilInternet:   pNum,
    capacidadBuzon:   srv.aumentoBuzon      || '',
    justificacion:    d.justificacion       || '',
    nombreDirector:   d.nombreDirector      || '',
    nombreGenerico:   srv.usuarioGenerico   || '',
    // Condición laboral
    ckNombrado:       ck(tc === 'NOMBRADO'),
    ckCas:            ck(tc === 'CAS'),
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

  return doc.getZip().generate({ type: 'nodebuffer' });
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
