'use strict';
require('dotenv').config();
const { chromium } = require('playwright');
const path = require('path');
const fs   = require('fs');

const SESSION_FILE = path.join(__dirname, '.ssi-session.json');

// ─── Mapeo de categorías ────────────────────────────────────────────────────
const CATEGORIAS = {
  'configuración de laptop': 271,
  'configuracion de laptop': 271,
  'configuración de equipo': 99,
  'configuracion de equipo': 99,
  'acceso remoto': 269,
  'vpn': 302,
  'problema internet': 152,
  'sin internet': 152,
  'problemas con internet': 152,
  'problema correo': 148,
  'problemas con el correo': 148,
  'instalación de software': 121,
  'instalacion de software': 121,
  'desbloqueo cuenta red': 110,
  'desbloqueo de cuenta de red': 110,
  'desbloqueo cuenta correo': 108,
  'desbloqueo de cuenta de correo': 108,
  'desbloqueo cuenta intranet': 109,
  'reseteo de contraseña': 266,
  'problema impresora': 163,
  'problemas de impresión': 163,
  'configuración de impresora': 96,
  'configuracion de impresora': 96,
  'problema con el sgd': 283,
  'videoconferencia zoom': 256,
  'apoyo remoto': 270,
  'otros': 142,
};

// ─── Mapeo de sedes ─────────────────────────────────────────────────────────
const SEDES = {
  'sede central': 1, 'central': 1,
  'ribeyro': 2,
  'marquez': 3,
  'salesiano': 4,
  'cervantes': 5,
  'marina': 6,
  'enei': 7,
  'odei': 8,
  'maria plaza': 9,
  'pedro ruiz gallo': 10,
};

function resolveCategoria(nombre) {
  const key = (nombre || '').toLowerCase().trim();
  if (CATEGORIAS[key]) return CATEGORIAS[key];
  // Búsqueda parcial
  for (const [k, v] of Object.entries(CATEGORIAS)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  return 142; // fallback: Otros
}

function resolveSede(nombre) {
  const key = (nombre || '').toLowerCase().trim();
  for (const [k, v] of Object.entries(SEDES)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  return 1; // fallback: Sede Central
}

// ─── Login con captcha matemático ──────────────────────────────────────────
async function login(page, ctx) {
  await page.goto('https://webapp.inei.gob.pe/ssi/Login', {
    waitUntil: 'domcontentloaded', timeout: 30000,
  });

  const captchaQ = await page.inputValue('#a');
  const safe     = captchaQ.replace(/[^0-9+\-*\/\s()]/g, '').trim();
  // eslint-disable-next-line no-eval
  const answer   = safe ? String(eval(safe)) : '0';

  await page.fill('#username', process.env.SSI_USER || '');
  await page.fill('#clave',    process.env.SSI_PASS || '');
  await page.fill('#b', answer);
  await page.click('#btn_ingresar');
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});

  if (page.url().includes('Login')) {
    throw new Error('Credenciales SSI incorrectas o CAPTCHA fallido.');
  }

  // Guardar sesión para reutilizar
  const state = await ctx.storageState();
  fs.writeFileSync(SESSION_FILE, JSON.stringify(state));
}

// ─── Función principal ─────────────────────────────────────────────────────
async function crearTicketSSI({ categoria, categoriaId, sede, sedeId, titulo, descripcion }) {
  const browser = await chromium.launch({
    headless: false, // headful para evitar detección de proxy INEI
    args: ['--disable-blink-features=AutomationControlled', '--start-maximized'],
  });

  try {
    // Intentar reutilizar sesión guardada
    let storageState;
    if (fs.existsSync(SESSION_FILE)) {
      try { storageState = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8')); }
      catch { /* sesión corrupta — ignorar */ }
    }

    const ctx = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
      ...(storageState ? { storageState } : {}),
    });
    const page = await ctx.newPage();

    // Navegar a Nueva Atención — si redirige al login, hacer login
    await page.goto('https://webapp.inei.gob.pe/ssi/Admin/Atencion_tecnico', {
      waitUntil: 'domcontentloaded', timeout: 20000,
    });

    if (page.url().includes('Login')) {
      await login(page, ctx);
      await page.goto('https://webapp.inei.gob.pe/ssi/Admin/Atencion_tecnico', {
        waitUntil: 'domcontentloaded', timeout: 20000,
      });
    }

    // Resolver IDs
    const catId  = categoriaId  || resolveCategoria(categoria);
    const sId    = sedeId       || resolveSede(sede);

    // Rellenar formulario mediante evaluación directa (el select está oculto por jQuery UI)
    await page.evaluate(({ catId, sId }) => {
      const sel = document.getElementById('categorias');
      if (sel) { sel.value = String(catId); sel.dispatchEvent(new Event('change', { bubbles: true })); }
      const selSede = document.getElementById('sedes');
      if (selSede) { selSede.value = String(sId); selSede.dispatchEvent(new Event('change', { bubbles: true })); }
    }, { catId, sId });

    await page.fill('#titulo', titulo.substring(0, 150));
    await page.fill('#descripcion_incidencia', descripcion);

    // Screenshot antes de enviar (para debug)
    await page.screenshot({ path: path.join(__dirname, '.ssi-before-submit.png') });

    // Enviar
    await page.click('#btn_guardar_inc');
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});

    // Capturar número de ticket del resultado
    const resultado = await page.evaluate(() => {
      const body = document.body.innerText || '';
      const numMatch = body.match(/[Nn][°º]\.?\s*(\d{4,8})|[Nn][uú]mero\s*[:#]?\s*(\d{4,8})|incidencia\s*[:#]?\s*(\d{4,8})|ticket\s*[:#]?\s*(\d{4,8})/i);
      const num = numMatch ? (numMatch[1] || numMatch[2] || numMatch[3] || numMatch[4]) : null;

      // Detectar error en pantalla
      const errEl = document.querySelector('.alert-danger, .alert-error, .error-msg');
      const error = errEl ? errEl.textContent.trim() : null;

      return { num, error, url: window.location.href, bodySnippet: body.substring(0, 300) };
    });

    await page.screenshot({ path: path.join(__dirname, '.ssi-after-submit.png') });

    if (resultado.error) {
      throw new Error(`SSI respondió con error: ${resultado.error}`);
    }

    return {
      ok: true,
      ticketNum: resultado.num,
      url: resultado.url,
      mensaje: resultado.num
        ? `Ticket N° ${resultado.num} registrado exitosamente en el SSI.`
        : 'Solicitud enviada al SSI. Revisá tus tickets en webapp.inei.gob.pe/ssi para confirmar el número.',
    };

  } finally {
    await browser.close();
  }
}

module.exports = { crearTicketSSI, resolveCategoria, resolveSede, CATEGORIAS };
