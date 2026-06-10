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

// Normaliza para comparación: minúsculas + espacios colapsados
function normalizeText(s) {
  return (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function resolveCategoria(nombre) {
  const key = normalizeText(nombre);
  if (!key) return 'Otros';

  // 1. Coincidencia exacta con los valores del mapa (maneja dobles espacios)
  for (const v of Object.values(CATEGORIAS)) {
    if (normalizeText(v) === key) return v;
  }
  // 2. Coincidencia exacta de clave normalizada
  for (const [k, v] of Object.entries(CATEGORIAS)) {
    if (normalizeText(k) === key) return v;
  }
  // 3. Parcial: solo si el input CONTIENE la clave (no al revés — evita falsos positivos)
  for (const [k, v] of Object.entries(CATEGORIAS)) {
    const kNorm = normalizeText(k);
    if (key.includes(kNorm)) return v;
  }
  return 'Otros';
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
    headless: process.env.PLAYWRIGHT_HEADLESS !== 'false', // headless por defecto; PLAYWRIGHT_HEADLESS=false para debug local
    slowMo: 150,     // reducido: la búsqueda filtra antes de iterar, menos espera necesaria
    args: ['--disable-blink-features=AutomationControlled'],
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
    browser.on('disconnected', () => console.error('[SSI] ⚠️  browser desconectado inesperadamente'));
    page.on('close', () => console.error('[SSI] ⚠️  page cerrada inesperadamente'));

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
    await page.waitForTimeout(2000).catch(() => {});

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
    }, null, { timeout: 10000 }).catch(() => {});

    // ── Categoría via tipo en input del combobox + clic en ítem filtrado ────
    // page.selectOption() y evaluate NO actualizan el estado interno de jQuery UI.
    // El SSI valida desde ese estado interno — si no coincide, el submit falla con HTTP 500.
    // Estrategia: tipear las primeras palabras en el input para filtrar el dropdown
    // de 215 → pocos ítems, luego hacer clic. Esto evita iterar todos los ítems (lento).
    await page.bringToFront();
    const catInput = page.locator('input.custom-combobox-input').first();
    const catNorm = normalizeText(categoriaTexto);
    // Usar las primeras 2 palabras significativas como filtro de búsqueda
    const searchWords = catNorm.split(' ').filter(w => w.length >= 3);
    const searchTerm = searchWords.slice(0, 2).join(' ');
    console.log('[SSI] Buscando categoría:', categoriaTexto, '| término de búsqueda:', searchTerm);

    await catInput.click({ clickCount: 3 });
    await catInput.type(searchTerm, { delay: 80 });
    // Esperar que el dropdown filtre y muestre resultados
    await page.waitForTimeout(1200).catch(() => {});

    let categoriaClickeada = false;
    const items = page.locator('.ui-autocomplete li.ui-menu-item');
    // Palabras significativas (>= 5 chars) para matching multi-palabra
    const sigWords = catNorm.split(' ').filter(w => w.length >= 5);

    // Intentar hasta 2 veces: primero con búsqueda filtrada, luego con toggle si no aparece
    for (let attempt = 0; attempt < 2 && !categoriaClickeada; attempt++) {
      const allItems = await items.all();
      console.log(`[SSI] Items visibles: ${allItems.length} (intento ${attempt + 1})`);
      for (const item of allItems) {
        const txt = (await item.innerText()).trim();
        const txtNorm = normalizeText(txt);
        const exactMatch = txtNorm === catNorm || txtNorm.includes(catNorm) || catNorm.includes(txtNorm);
        const wordsMatch = sigWords.length >= 2
          ? sigWords.every(w => txtNorm.includes(w))
          : sigWords.length === 1 && txtNorm.includes(catNorm.substring(0, Math.min(catNorm.length, 12)));
        if (exactMatch || wordsMatch) {
          console.log('[SSI] Categoría seleccionada:', txt);
          await item.click();
          categoriaClickeada = true;
          break;
        }
      }
      if (!categoriaClickeada && attempt === 0) {
        // Fallback: abrir todo el dropdown y buscar sin filtro
        console.log('[SSI] Categoría no encontrada con búsqueda — abriendo dropdown completo');
        await catInput.click({ clickCount: 3 });
        await catInput.fill('');
        const toggleBtn = page.locator('.custom-combobox-toggle').first();
        await toggleBtn.click();
        await page.waitForTimeout(1500).catch(() => {});
      }
    }

    if (!categoriaClickeada) {
      // Fallback seguro: buscar "Otros" explícitamente — nunca un ítem aleatorio
      const allItems = await items.all();
      let otrosItem = null;
      for (const item of allItems) {
        const txt = normalizeText(await item.innerText().catch(() => ''));
        if (txt === 'otros' || txt.startsWith('otros')) { otrosItem = item; break; }
      }
      if (otrosItem) {
        console.warn(`[SSI] Categoría "${categoriaTexto}" no encontrada — usando Otros`);
        await otrosItem.click();
      } else {
        console.warn(`[SSI] Categoría "${categoriaTexto}" no encontrada y "Otros" tampoco disponible en dropdown`);
      }
    }
    await page.waitForTimeout(1500).catch(() => {}); // jQuery UI necesita tiempo para fijar estado interno

    // ── Título y descripción DESPUÉS de la categoría ─────────────────────
    // Si se llenan antes, el blur del #titulo dispara el handler de jQuery UI que resetea el combobox.
    await page.fill('#titulo', titulo.substring(0, 150)).catch(() => {});
    await page.fill('#descripcion_incidencia', descripcion).catch(() => {});
    await page.waitForTimeout(300).catch(() => {});

    await page.screenshot({ path: path.join(__dirname, '.ssi-before-submit.png') }).catch(() => {});

    // ── Enviar ─────────────────────────────────────────────────────────
    await page.click('#btn_guardar_inc').catch(() => {});
    // Esperar a que aparezca modal de confirmación (el SSI abre un popup antes de enviar)
    await page.waitForTimeout(2000).catch(() => {});
    await page.screenshot({ path: path.join(__dirname, '.ssi-modal.png') }).catch(() => {});

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
        const visible = await btn.isVisible({ timeout: 300 }).catch(() => false);
        if (visible) {
          await btn.click().catch(() => {});
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
    const pageClosedPromise = new Promise(r => page.once('close', () => r('closed')));
    const loadStatePromise = page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => 'timeout');
    const loadResult = await Promise.race([loadStatePromise, pageClosedPromise]);
    if (loadResult !== 'closed') {
      await page.waitForTimeout(2000).catch(() => {});
    }

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
    }).catch(evalErr => {
      // La página puede haberse cerrado durante la redirección — intentar leer URL actual
      console.warn('[SSI] page.evaluate falló (posible redirect):', evalErr.message);
      return { num: null, error: null, isErrorPage: false, url: '', bodySnippet: '' };
    });

    await page.screenshot({ path: path.join(__dirname, '.ssi-after-submit.png') }).catch(() => {});

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
    await Promise.race([
      browser.close(),
      new Promise(r => setTimeout(r, 8000)),
    ]).catch(() => {});
  }
}

module.exports = { crearTicketSSI, resolveCategoria, resolveSede, CATEGORIAS, SEDES };
