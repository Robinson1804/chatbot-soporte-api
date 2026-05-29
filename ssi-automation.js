'use strict';
require('dotenv').config();
const { chromium } = require('playwright');
const path = require('path');
const fs   = require('fs');

const SESSION_FILE = path.join(__dirname, '.ssi-session.json');

// ─── Mapeo de categorías (keywords → texto exacto del autocomplete SSI) ────
const CATEGORIAS = {
  // Laptop / equipo
  'laptop': 'Configuración De Laptop',
  'configuración de laptop': 'Configuración De Laptop',
  'configuracion de laptop': 'Configuración De Laptop',
  'configuración de equipo': 'Configuración del Equipo de Computo  (Especificar)',
  'configuracion de equipo': 'Configuración del Equipo de Computo  (Especificar)',
  'conexión de equipo': 'Conexión del Equipo de Computo  (Especificar)',
  'mantenimiento preventivo': 'Mantenimiento Preventivo de Equipo de Computo',
  'cambio de equipo': 'Cambio de Equipo Informático',
  // Red / internet
  'problema internet': 'Problemas con internet',
  'sin internet': 'Problemas con internet',
  'problemas con internet': 'Problemas con internet',
  'wifi': 'Problemas con internet',
  'red': 'Problemas de red',
  'problemas de red': 'Problemas de red',
  'incidentes de red': 'Incidentes de red solucionados',
  'punto de red': 'Problemas con Punto de Red',
  'verificación punto de red': 'Verificación de punto de red',
  'switch': 'Problemas Switch',
  'ip': 'Problemas con IP',
  'asignación ip': 'Servicio de asignación de IP',
  // VPN / acceso remoto
  'vpn': 'Problema de conexión VPN o escritorio remoto',
  'problema vpn': 'Problema de conexión VPN o escritorio remoto',
  'escritorio remoto': 'Problema de conexión VPN o escritorio remoto',
  'apoyo vpn': 'Apoyo en la configuración de VPN y escritorio remoto',
  'configuración vpn': 'Apoyo en la configuración de VPN y escritorio remoto',
  'acceso remoto': 'Acceso Remoto',
  'apoyo remoto': 'Apoyo Remoto',
  // Contraseñas / cuentas
  'reseteo de contraseña': 'Reseteo de Contraseña',
  'contraseña': 'Reseteo de Contraseña',
  'password': 'Reseteo de Contraseña',
  'desbloqueo cuenta red': 'Desbloqueo de cuenta de red',
  'desbloqueo de cuenta de red': 'Desbloqueo de cuenta de red',
  'desbloqueo cuenta correo': 'Desbloqueo de cuenta de correo',
  'desbloqueo de cuenta de correo': 'Desbloqueo de cuenta de correo',
  'desbloqueo cuenta intranet': 'Desbloqueo de cuenta de intranet',
  'activacion cuenta correo': 'Activación de cuenta de usuario de correo',
  'activación cuenta correo': 'Activación de cuenta de usuario de correo',
  'activacion cuenta red': 'Activación de cuenta de usuario de red',
  'activación cuenta red': 'Activación de cuenta de usuario de red',
  'activacion cuenta intranet': 'Activación de cuenta de usuario de intranet',
  'creación cuenta correo': 'Creación de cuenta de usuario de correo',
  'creacion cuenta correo': 'Creación de cuenta de usuario de correo',
  'creación cuenta red': 'Creación de Cuenta de usuario de red',
  'creacion cuenta red': 'Creación de Cuenta de usuario de red',
  'creación cuenta intranet': 'Creación de cuenta de usuario Intranet',
  // Correo
  'problema correo': 'Problema de correo',
  'problemas con el correo': 'Problemas con el Correo',
  'correo': 'Problema de correo',
  'configuración correo': 'Configuración de cuenta de correo',
  'configuracion correo': 'Configuración de cuenta de correo',
  // Impresora
  'configuración de impresora': 'Configuración de Impresora',
  'configuracion de impresora': 'Configuración de Impresora',
  'configuración impresora escáner': 'Configuración de impresora y escáner',
  'instalación impresora': 'Instalación de Impresora',
  'instalacion impresora': 'Instalación de Impresora',
  'problema impresora': 'Problemas de impresión',
  'problemas de impresión': 'Problemas de impresión',
  'impresiones manchadas': 'Impresiones y copias manchadas.',
  'impresora atascada': 'Impresiones atascadas.',
  'impresora error': 'Impresora sale error.',
  'toner': 'impresora necesita cambio de tóner.',
  // Software
  'instalación de software': 'Instalación de Software',
  'instalacion de software': 'Instalación de Software',
  'software': 'Instalación de Software',
  'microsoft office': 'Instalación de Microsoft Office',
  'office': 'Instalación de Microsoft Office',
  'antivirus': 'Instalación de antivirus institucional PC',
  'sistema operativo': 'Instalación de sistema operativo',
  'spss': 'Instalación de SPSS',
  'stata': 'Instalación de STATA',
  'arcgis': 'Instalación de ArcGIS',
  'firma digital': 'Instalación de Firma Digital',
  'siaf': 'Instalación de SIAF',
  'siga': 'Instalación de SIGA',
  // SGD / SSI
  'problema con el sgd': 'Problemas con el SGD',
  'sgd': 'Problemas con el SGD',
  'reseteo contraseña sgd': 'Reseteo de contraseña del SGD',
  'reseteo contraseña ssi': 'Reseteo de contraseña del SSI',
  // Videoconferencia
  'videoconferencia zoom': 'Videoconferencia con Zoom',
  'zoom': 'Videoconferencia con Zoom',
  'webex': 'Videoconferencia con Webex',
  'skype': 'Videoconferencia con Skype',
  // Windows / sistema
  'problemas con windows': 'Problemas con Windows',
  'windows': 'Problemas con Windows',
  'problemas con aplicaciones': 'Problemas con aplicaciones',
  'virus': 'Ataque de Virus',
  // Otros
  'otros': 'Otros',
};

// ─── Mapeo de sedes (texto usuario → ID numérico del SELECT SSI) ────────────
const SEDES = {
  'sede central': 1, 'central': 1,
  'ribeyro': 2, 'sede ribeyro': 2,
  'marquez': 3, 'sede marquez': 3, 'márquez': 3,
  'salesiano': 4, 'sede salesiano': 4,
  'cervantes': 5, 'sede cervantes': 5,
  'marina': 6, 'sede marina': 6,
  'enei': 7,
  'odei': 8,
  'maria plaza': 9, 'sede maria plaza': 9, 'maría plaza': 9,
  'pedro ruiz gallo': 10, 'sede pedro ruiz gallo': 10,
  'polysistemas': 11,
  'cajamarca': 12,
  'huanuco': 14, 'huánuco': 14,
  'la libertad': 15,
  'piura': 16,
  'madre de dios': 17,
  'huaraz': 18,
  'brasil': 20,
  'amazonas': 21,
  'apurimac': 22, 'apurímac': 22,
  'arequipa': 23,
  'ayacucho': 24,
  'chimbote': 25,
  'cusco': 26, 'cuzco': 26,
  'huacho': 27,
  'huancavelica': 28,
  'ica': 29,
  'junin': 30, 'junín': 30,
  'lambayeque': 31,
  'loreto': 32,
  'moquegua': 33,
  'moyobamba': 34,
  'pasco': 35,
  'puno': 36,
  'tacna': 37,
  'tarapoto': 38,
  'tumbes': 39,
  'ucayali': 40,
  'iquique': 41, 'sede iquique': 41,
  'dncn': 42, 'sede dncn': 42,
  'arica': 43, 'sede arica': 43,
  'recuay': 44, 'sede recuay': 44,
  'rep chile': 45, 'chile': 45, 'sede rep chile': 45,
  'miraflores': 46, 'sede miraflores': 46, 'lima miraflores': 46,
};

function resolveCategoria(nombre) {
  const key = (nombre || '').toLowerCase().trim();
  // Coincidencia exacta con los valores del mapa (el bot puede enviar texto SSI exacto)
  for (const v of Object.values(CATEGORIAS)) {
    if (v.toLowerCase() === key) return v;
  }
  // Coincidencia exacta de clave
  if (CATEGORIAS[key]) return CATEGORIAS[key];
  // Búsqueda parcial
  for (const [k, v] of Object.entries(CATEGORIAS)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  return 'Otros'; // fallback
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
    slowMo: 300,     // necesario para que jQuery UI procese los eventos del dropdown
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

    // Resolver categoría (texto) y sede (ID numérico)
    const categoriaTexto = resolveCategoria(categoria);
    const sId            = sedeId || resolveSede(sede);

    // Esperar que jQuery UI combobox esté inicializado antes de interactuar
    await page.waitForSelector('input.custom-combobox-input', { state: 'visible', timeout: 15000 });
    await page.waitForTimeout(2000);

    // ── Sede: SELECT oculto por Select2 — funciona con evaluate ──────────
    await page.evaluate((sId) => {
      const sel = document.getElementById('sedes');
      if (sel) {
        sel.value = String(sId);
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        if (window.jQuery) window.jQuery(sel).trigger('change');
      }
    }, sId);

    // ── Esperar que #categorias tenga opciones (carga async tras seleccionar sede) ─
    await page.waitForFunction(() => {
      const sel = document.getElementById('categorias');
      return sel && sel.options.length > 5;
    }, null, { timeout: 10000 });

    // ── Categoría via toggle + clic en ítem del dropdown ─────────────────
    // page.selectOption() y evaluate NO actualizan el estado interno de jQuery UI.
    // El SSI valida desde ese estado interno — si no coincide, el submit falla con HTTP 500.
    // toggle+click es el único approach confirmado funcional (ticket #112628 creado con test-ssi-solo.js).
    await page.bringToFront();
    const toggleBtn = page.locator('.custom-combobox-toggle').first();
    await toggleBtn.click();
    await page.waitForTimeout(1500);

    const items = page.locator('.ui-autocomplete li.ui-menu-item');
    const allItems = await items.all();
    console.log('[SSI] Items en dropdown:', allItems.length, '| Buscando:', categoriaTexto);
    let categoriaClickeada = false;
    const catLower = categoriaTexto.toLowerCase();
    // Palabras significativas (>= 5 chars) para matching multi-palabra
    const sigWords = catLower.split(' ').filter(w => w.length >= 5);
    for (const item of allItems) {
      const txt = (await item.innerText()).trim();
      const txtLower = txt.toLowerCase();
      // Match 1: txt contiene la categoría completa
      const exactMatch = txtLower === catLower || txtLower.includes(catLower);
      // Match 2: todas las palabras significativas están en txt (evita falsos positivos de prefijo)
      const wordsMatch = sigWords.length >= 2
        ? sigWords.every(w => txtLower.includes(w))
        : sigWords.length === 1 && txtLower.includes(catLower.substring(0, Math.min(catLower.length, 12)));
      if (exactMatch || wordsMatch) {
        console.log('[SSI] Categoría seleccionada:', txt);
        await item.click();
        categoriaClickeada = true;
        break;
      }
    }
    if (!categoriaClickeada && allItems.length > 0) {
      const fallbackTxt = await allItems[1].innerText().catch(() => '?');
      console.log('[SSI] Fallback — primer ítem:', fallbackTxt);
      await allItems[1].click();
    }
    await page.waitForTimeout(2000); // crítico: jQuery UI necesita este tiempo para fijar estado interno

    // ── Título y descripción DESPUÉS de la categoría ─────────────────────
    // Si se llenan antes, el blur del #titulo dispara el handler de jQuery UI que resetea el combobox.
    await page.fill('#titulo', titulo.substring(0, 150));
    await page.fill('#descripcion_incidencia', descripcion);
    await page.waitForTimeout(300);

    await page.screenshot({ path: path.join(__dirname, '.ssi-before-submit.png') });

    // ── Enviar ─────────────────────────────────────────────────────────
    await page.click('#btn_guardar_inc');
    // Esperar a que aparezca modal de confirmación (el SSI abre un popup antes de enviar)
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(__dirname, '.ssi-modal.png') });

    // Intentar hacer clic en el botón de confirmación del modal (varios selectores posibles)
    const confirmSelectors = [
      'button.swal2-confirm',
      '.swal2-confirm',
      '.modal.show .btn-primary',
      '.modal.show button[type="submit"]',
      '.ui-dialog-buttonpane .ui-button',
      'button:text("Confirmar")',
      'button:text("Aceptar")',
      'button:text("Sí")',
      'button:text("Enviar")',
      'button:text("Enviar solicitud")',
      'button:text("Guardar")',
      '.modal-footer .btn-primary',
      '.modal-footer button',
    ];
    let modalClicked = false;
    for (const sel of confirmSelectors) {
      try {
        const btn = page.locator(sel).first();
        const visible = await btn.isVisible({ timeout: 800 }).catch(() => false);
        if (visible) {
          await btn.click();
          modalClicked = true;
          console.log(`[SSI] Clic en botón de confirmación: ${sel}`);
          break;
        }
      } catch { /* selector no encontrado */ }
    }
    if (!modalClicked) {
      console.log('[SSI] No se encontró modal de confirmación, continuando...');
    }

    // Dar tiempo al SSI para procesar y redirigir
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(4000);

    // ── Capturar resultado ─────────────────────────────────────────────
    const resultado = await page.evaluate(() => {
      const body  = document.body.innerText || '';
      const title = document.title || '';
      // Primary: indicadores explícitos de número de ticket
      const primaryMatch = body.match(/[Nn][°º]\.?\s*(\d{4,8})|[Nn][uú]mero\s*[:#]?\s*(\d{4,8})|incidencia\s*[:#]?\s*(\d{4,8})|ticket\s*[:#]?\s*(\d{4,8})/i);
      let num = primaryMatch ? (primaryMatch[1] || primaryMatch[2] || primaryMatch[3] || primaryMatch[4]) : null;
      // Fallback: número en tabla de incidencias (SSI redirige a lista tras envío exitoso)
      if (!num) {
        const listMatch = body.match(/(\d{5,7})[\s\S]{0,20}SOPORTE/i)
          || body.match(/(\d{5,7})[\s\S]{0,20}NUEVO/i);
        if (listMatch) num = listMatch[1];
      }
      const errEl = document.querySelector('.alert-danger, .alert-error, .error-msg');
      const error = errEl ? errEl.textContent.trim() : null;
      const isErrorPage = title.toLowerCase().includes('error') || body.includes('HTTP ERROR') || body.includes('Esta página no funciona');
      return { num, error, isErrorPage, url: window.location.href, bodySnippet: body.substring(0, 300) };
    });

    await page.screenshot({ path: path.join(__dirname, '.ssi-after-submit.png') });

    if (resultado.isErrorPage) {
      throw new Error('El SSI respondió con error de servidor al enviar el formulario. El campo "Tipo de Solicitud" puede no haberse completado.');
    }
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

module.exports = { crearTicketSSI, resolveCategoria, resolveSede, CATEGORIAS, SEDES };
