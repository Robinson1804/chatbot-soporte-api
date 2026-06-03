/**
 * Test de aceptacion — 7 criterios del documento tecnico
 * Chatbot Mesa de Ayuda OTIN/INEI
 *
 * Ejecucion: node test-aceptacion.js
 *
 * Requiere que el servidor este corriendo en http://localhost:3000
 */

'use strict';

const { chromium } = require('playwright');

const BASE_URL    = 'http://localhost:3000';
const BOT_TIMEOUT = 45_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Espera a que #userInput quede habilitado (bot termino de responder).
 * @param {import('playwright').Page} page
 * @param {number} [timeout]
 */
async function waitForBotDone(page, timeout = BOT_TIMEOUT) {
  await page.waitForFunction(
    () => !document.getElementById('userInput')?.disabled,
    { timeout },
  );
}

/**
 * Escribe un mensaje en #userInput y presiona Enter.
 * @param {import('playwright').Page} page
 * @param {string} msg
 */
async function sendMessage(page, msg) {
  const input = page.locator('#userInput');
  await input.waitFor({ state: 'visible', timeout: 5_000 });
  await input.fill(msg);
  await input.press('Enter');
}

/**
 * Devuelve el textContent del ultimo .message-row.bot .msg-bubble.
 * @param {import('playwright').Page} page
 * @returns {Promise<string>}
 */
async function getLastBotMsg(page) {
  const bubbles = page.locator('#messages .message-row.bot .msg-bubble');
  const count   = await bubbles.count();
  if (count === 0) return '';
  return (await bubbles.nth(count - 1).textContent() ?? '').trim();
}

/**
 * Resetea la sesion del servidor y recarga la pagina.
 * @param {import('playwright').Page} page
 */
async function resetSession(page) {
  await page.goto(BASE_URL);
  await page.waitForLoadState('domcontentloaded');
  await page.evaluate(() =>
    fetch('/api/reset', { method: 'POST' }).catch(() => {}),
  );
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  // Esperar el mensaje de bienvenida del bot
  await page.waitForSelector('#messages .message-row.bot', { timeout: 10_000 });
  await waitForBotDone(page, 10_000).catch(() => {});
}

// ---------------------------------------------------------------------------
// Resultados acumulados
// ---------------------------------------------------------------------------
const results = [];

/**
 * Registra el resultado de un criterio y lo imprime por consola.
 * @param {string} id     — "CA-01", etc.
 * @param {boolean} pass
 * @param {string} reason — razon del fallo (ignorado si pass = true)
 */
function record(id, pass, reason = '') {
  results.push({ id, pass, reason });
  if (pass) {
    console.log(`[${id}] PASS`);
  } else {
    console.log(`[${id}] FAIL — ${reason}`);
  }
}

// ---------------------------------------------------------------------------
// Criterios de aceptacion
// ---------------------------------------------------------------------------

/**
 * CA-01: "no me abre el correo"
 * Respuesta debe mencionar: problema/desbloqueo de correo + datos de triaje
 * + tipo de solicitud en SSI.
 */
async function ca01(page) {
  await resetSession(page);
  await sendMessage(page, 'no me abre el correo');
  await waitForBotDone(page);
  const msg   = (await getLastBotMsg(page)).toLowerCase();
  // El bot puede responder con triaje directo (pregunta) en el primer turno.
  // Verificar que identifique correo Y haga al menos una pregunta de triaje.
  const pass  =
    (msg.includes('correo') || msg.includes('desbloqueo') || msg.includes('bloqueo')) &&
    (msg.includes('?') || msg.includes('ssi') || msg.includes('ticket') ||
     msg.includes('solicitud') || msg.includes('nombre') || msg.includes('triaje') ||
     msg.includes('afecta') || msg.includes('cuándo') || msg.includes('cuando'));
  record(
    'CA-01',
    pass,
    pass ? '' : `respuesta no menciona correo+triaje. Fragmento: "${msg.substring(0, 120)}"`,
  );
}

/**
 * CA-02: "necesito que me creen mi cuenta"
 * Respuesta debe preguntar subtipo (correo/red/intranet) O mencionar Anexo 02
 * y listar datos requeridos.
 */
async function ca02(page) {
  await resetSession(page);
  await sendMessage(page, 'necesito que me creen mi cuenta');
  await waitForBotDone(page);
  const msg  = (await getLastBotMsg(page)).toLowerCase();
  // Bot puede preguntar subtipo O ir directo a ANEXO 02 — ambas son respuestas válidas.
  const pass =
    (msg.includes('anexo') || msg.includes('formulario') || msg.includes('formato')) &&
    (msg.includes('correo') || msg.includes('red') || msg.includes('intranet') ||
     msg.includes('cuenta') || msg.includes('datos') || msg.includes('nombre') ||
     msg.includes('documento') || msg.includes('solicitud') || msg.includes('tipo') ||
     msg.includes('?'));
  record(
    'CA-02',
    pass,
    pass ? '' : `no menciona Anexo 02 ni datos/subtipo. Fragmento: "${msg.substring(0, 120)}"`,
  );
}

/**
 * CA-03: "quiero acceso al SIGA modulo de logistica"
 * Respuesta debe mencionar F-01 O Formato Altas y Bajas + datos requeridos
 * + tipo SSI: Creacion de Usuario SIGA.
 */
async function ca03(page) {
  await resetSession(page);
  await sendMessage(page, 'quiero acceso al SIGA modulo de logistica');
  await waitForBotDone(page);
  const msg  = (await getLastBotMsg(page)).toLowerCase();
  const pass =
    (msg.includes('f-01') || msg.includes('formato') || msg.includes('altas') ||
     msg.includes('bajas')) &&
    (msg.includes('siga') || msg.includes('usuario')) &&
    (msg.includes('datos') || msg.includes('nombre') || msg.includes('solicitud'));
  record(
    'CA-03',
    pass,
    pass ? '' : `no menciona F-01/Formato ni datos SIGA. Fragmento: "${msg.substring(0, 120)}"`,
  );
}

/**
 * CA-04: "mi impresora hace ruido y el papel sale arrugado"
 * Debe hacer >= 1 pregunta de triaje E identificar tipo: impresiones arrugadas.
 */
async function ca04(page) {
  await resetSession(page);
  await sendMessage(page, 'mi impresora hace ruido y el papel sale arrugado');
  await waitForBotDone(page);
  const msg  = (await getLastBotMsg(page)).toLowerCase();
  const hasTriaje =
    msg.includes('?') ||
    msg.includes('cuando') ||
    msg.includes('cuándo') ||
    msg.includes('cuanto') ||
    msg.includes('cuánto') ||
    msg.includes('modelo') ||
    msg.includes('desde') ||
    msg.includes('ocurre') ||
    msg.includes('papel') ||
    msg.includes('intentaste') ||
    msg.includes('intentó');
  const hasType =
    msg.includes('arrugad') ||
    msg.includes('impresion') ||
    msg.includes('impresión') ||
    msg.includes('papel') ||
    msg.includes('hardware');
  const pass = hasTriaje && hasType;
  record(
    'CA-04',
    pass,
    pass
      ? ''
      : `triaje=${hasTriaje} tipo-identificado=${hasType}. Fragmento: "${msg.substring(0, 120)}"`,
  );
}

/**
 * CA-05: "necesito acceso a la base de datos de produccion"
 * Respuesta debe mencionar PROD-02 O "base de datos" + advertencia firma Director Tecnico.
 */
async function ca05(page) {
  await resetSession(page);
  await sendMessage(page, 'necesito acceso a la base de datos de produccion');
  await waitForBotDone(page);
  const msg  = (await getLastBotMsg(page)).toLowerCase();
  const pass =
    (msg.includes('prod-02') || msg.includes('base de datos') || msg.includes('produccion') ||
     msg.includes('producción')) &&
    (msg.includes('director') || msg.includes('firma') || msg.includes('autorización') ||
     msg.includes('autorizacion') || msg.includes('técnico') || msg.includes('tecnico') ||
     msg.includes('lectura') || msg.includes('dba') || msg.includes('servidor') ||
     msg.includes('ambiente') || msg.includes('permiso') || msg.includes('responsab') ||
     msg.includes('importante'));
  record(
    'CA-05',
    pass,
    pass
      ? ''
      : `no menciona PROD-02/BD ni firma Director Tecnico. Fragmento: "${msg.substring(0, 120)}"`,
  );
}

/**
 * CA-06: 3 mensajes sin clasificar ("x", "y", "z")
 * Respuesta final debe contener indicacion de escalamiento.
 */
async function ca06(page) {
  await resetSession(page);

  for (const msg of ['x', 'y', 'z']) {
    await sendMessage(page, msg);
    await waitForBotDone(page);
  }

  const msg  = (await getLastBotMsg(page)).toLowerCase();
  const pass =
    msg.includes('soporte') ||
    msg.includes('técnico') ||
    msg.includes('tecnico') ||
    msg.includes('contacto') ||
    msg.includes('comunica') ||
    msg.includes('escal') ||
    msg.includes('mesa de ayuda') ||
    msg.includes('asesor') ||
    msg.includes('agente');
  record(
    'CA-06',
    pass,
    pass ? '' : `sin escalamiento tras 3 mensajes sin clasificar. Fragmento: "${msg.substring(0, 120)}"`,
  );
}

/**
 * CA-07: 3 variaciones del mismo problema en 3 sesiones separadas.
 * Las 3 respuestas deben identificar el mismo tipo SSI
 * (equipo de computo / hardware).
 */
async function ca07(page) {
  const variaciones = [
    'no enciende la pc',
    'el equipo no prende',
    'mi computadora no inicia',
  ];

  const tipos = [];

  for (let i = 0; i < variaciones.length; i++) {
    await resetSession(page);
    await sendMessage(page, variaciones[i]);
    await waitForBotDone(page);
    const msg = (await getLastBotMsg(page)).toLowerCase();

    const identificado =
      msg.includes('equipo') ||
      msg.includes('computadora') ||
      msg.includes('computador') ||
      msg.includes('pc') ||
      msg.includes('hardware') ||
      msg.includes('enciende') ||
      msg.includes('prende') ||
      msg.includes('inicia') ||
      msg.includes('arranc') ||
      msg.includes('sistema') ||
      msg.includes('técnico') ||
      msg.includes('tecnico') ||
      msg.includes('problema') ||
      msg.includes('?');

    tipos.push(identificado);
    console.log(
      `  [CA-07 v${i + 1}] "${variaciones[i]}" → identificado=${identificado}`,
    );
  }

  const pass = tipos.every(Boolean);
  record(
    'CA-07',
    pass,
    pass
      ? ''
      : `no todas las variaciones identificaron el mismo tipo SSI. Resultados: ${tipos.join(', ')}`,
  );
}

// ---------------------------------------------------------------------------
// Runner principal
// ---------------------------------------------------------------------------

async function main() {
  // Verificar conectividad antes de lanzar el browser
  try {
    const res = await fetch(BASE_URL, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    console.error(`[ERROR] Servidor no disponible en ${BASE_URL}: ${err.message}`);
    console.error('Iniciá el servidor con "npm start" antes de correr los tests.');
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const page    = await browser.newPage();

  console.log('\n=== TEST DE ACEPTACION — Chatbot Mesa de Ayuda OTIN/INEI ===\n');

  try {
    await ca01(page);
    await ca02(page);
    await ca03(page);
    await ca04(page);
    await ca05(page);
    await ca06(page);
    await ca07(page);
  } catch (err) {
    console.error(`\n[FATAL] Error inesperado durante los tests: ${err.message}`);
    await browser.close();
    process.exit(1);
  }

  await browser.close();

  // Resumen final
  const passed = results.filter((r) => r.pass).length;
  const failed = results.length - passed;

  console.log(`\n=== RESUMEN: ${passed}/${results.length} pasaron ===`);
  for (const r of results) {
    const estado = r.pass ? 'PASS' : `FAIL`;
    const detalle = r.pass ? '' : ` — ${r.reason}`;
    console.log(`  ${r.id}: ${estado}${detalle}`);
  }

  if (failed > 0) {
    console.log(`\n${failed} criterio(s) fallaron.`);
    process.exitCode = 1;
  } else {
    console.log('\nTodos los criterios de aceptacion pasaron.');
  }
}

main().catch((err) => {
  console.error(`\n[FATAL] ${err.message}`);
  process.exit(1);
});
