/**
 * Test E2E — flujo completo de creación de ticket SSI
 * Usa el frontend real en public/chat.js (SSE, #messages)
 *
 * Estrategia: enviar UN mensaje inicial completo (con nombre, área, sede y
 * detalles de triaje), luego ESPERAR pacientemente y solo actuar cuando el
 * bot haya terminado de responder. No enviar mensajes extra innecesarios.
 *
 * Ejecución: node test-ssi-e2e.js
 */

const { chromium } = require('playwright');

const BASE_URL = 'http://localhost:3000';
const GEMINI_TIMEOUT   = 45_000;   // tiempo máximo para que Gemini responda
const SSI_AUTO_TIMEOUT = 150_000;  // automation SSI (~72s) + buffer

// Espera a que #userInput quede habilitado (bot terminó de responder)
// También detecta si ya hay resultado SSI para terminar antes
async function waitForBotDone(page, timeout = GEMINI_TIMEOUT) {
  return page.waitForFunction(
    () => !document.getElementById('userInput')?.disabled,
    { timeout },
  );
}

// Clic en un chip que contenga el texto dado
async function clickChip(page, text, timeout = 3_000) {
  try {
    const chip = page.locator('.chip-btn').filter({ hasText: text }).first();
    await chip.waitFor({ state: 'visible', timeout });
    await chip.click();
    console.log(`  [chip] "${text}"`);
    return true;
  } catch {
    return false;
  }
}

// ¿Ya apareció el resultado del ticket en la UI?
async function ticketResultVisible(page) {
  return (await page.locator('.doc-download-row').count()) > 0;
}

async function main() {
  const browser = await chromium.launch({ headless: false, slowMo: 400 });
  const page    = await browser.newPage();

  console.log('\n=== TEST E2E — Creación de ticket SSI ===\n');

  // ─────────────────────────────────────────────────────────
  // PASO 1: cargar con sesión limpia
  // ─────────────────────────────────────────────────────────
  await page.goto(BASE_URL);
  await page.waitForLoadState('domcontentloaded');
  await page.evaluate(() => fetch('/api/reset', { method: 'POST' }).catch(() => {}));
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('#messages .message-row.bot', { timeout: 10_000 });
  console.log('[1] Bienvenida OK');

  // ─────────────────────────────────────────────────────────
  // PASO 2: UN único mensaje inicial con toda la información
  //   - nombre completo + área (para el título del ticket)
  //   - sede (Sede Central)
  //   - problema + respuestas de triaje (solo mi equipo, sin cambios, sin error)
  //   - intención explícita de crear ticket automáticamente
  // ─────────────────────────────────────────────────────────
  await waitForBotDone(page, 10_000).catch(() => {});

  const inputEl = page.locator('#userInput');
  const msgInicial =
    'Buenos días. Soy Juan Pérez, Técnico de la Dirección de Informática. ' +
    'Mi computadora no enciende desde esta mañana. El problema afecta solo a mi equipo, ' +
    'no a mis compañeros. No hubo reinstalaciones ni cambios previos. ' +
    'No aparece ningún mensaje de error. ' +
    'Trabajo en la Sede Central. ' +
    'Por favor, creen el ticket en el SSI automáticamente.';

  await inputEl.fill(msgInicial);
  await inputEl.press('Enter');
  console.log('[2] Mensaje inicial enviado (nombre, área, triaje, sede, intención)');
  await page.waitForTimeout(500);

  // ─────────────────────────────────────────────────────────
  // PASO 3: loop de conversación — esperar y actuar
  // ─────────────────────────────────────────────────────────
  const MAX_TURNS = 10;
  let turn = 0;
  let prevBotMsg = ''; // rastrea el último mensaje del bot para detectar cuando no avanza

  while (turn < MAX_TURNS) {
    turn++;
    console.log(`\n[turno ${turn}] Esperando respuesta del bot...`);

    // Usar siempre SSI_AUTO_TIMEOUT: el bot puede llamar la automation en cualquier turno
    try {
      await waitForBotDone(page, SSI_AUTO_TIMEOUT);
    } catch {
      console.log('  [timeout] El bot tardó demasiado');
      break;
    }

    // ¿Ya tenemos resultado?
    if (await ticketResultVisible(page)) {
      console.log('  [resultado] .doc-download-row detectado');
      break;
    }

    // Screenshot de diagnóstico en cada turno
    await page.screenshot({ path: `test-ssi-turn-${turn}.png` });

    // Leer el último mensaje del bot
    const botBubbles = page.locator('#messages .message-row.bot .msg-bubble');
    const bubbleCount = await botBubbles.count();
    const lastMsg = bubbleCount > 0
      ? (await botBubbles.nth(bubbleCount - 1).textContent() || '').trim()
      : '';
    console.log(`  [bot] "${lastMsg.substring(0, 100)}${lastMsg.length > 100 ? '…' : ''}"`);

    // ── Chips por prioridad ──────────────────────────────────
    // 1. Confirmación final → dispara SSI automation (timeout largo)
    for (const c of ['Sí, crear el ticket', 'Confirmar y crear', 'Confirmar']) {
      if (await clickChip(page, c, 1_500)) {
        console.log(`  [espera] SSI automation en curso (hasta ${SSI_AUTO_TIMEOUT / 1000}s)...`);
        await waitForBotDone(page, SSI_AUTO_TIMEOUT).catch(() => {});
        if (await ticketResultVisible(page)) break;
        continue;
      }
    }
    if (await ticketResultVisible(page)) break;

    // 2. Aceptar creación automática
    if (await clickChip(page, 'Crear ticket automáticamente', 1_500)) {
      prevBotMsg = '';
      continue;
    }

    // 3. Chips de triaje
    for (const c of ['Solo mi equipo', 'No hubo cambios', 'No, ningún cambio', 'El problema persiste']) {
      if (await clickChip(page, c, 1_000)) {
        prevBotMsg = '';
        break;
      }
    }
    if (await ticketResultVisible(page)) break;

    // 4. Si el bot pregunta algo en texto (no chips) — responder puntualmente
    const lower = lastMsg.toLowerCase();

    if (lower.includes('nombre') && lower.includes('completo')) {
      await inputEl.fill('Juan Pérez');
      await inputEl.press('Enter');
      console.log('  [resp] nombre → "Juan Pérez"');
      await page.waitForTimeout(400);
      prevBotMsg = '';
      continue;
    }
    if (lower.includes('área') || lower.includes('dependencia')) {
      await inputEl.fill('Dirección de Informática');
      await inputEl.press('Enter');
      console.log('  [resp] área → "Dirección de Informática"');
      await page.waitForTimeout(400);
      prevBotMsg = '';
      continue;
    }
    if (lower.includes('sede') && !lower.includes('sede central')) {
      await inputEl.fill('Sede Central');
      await inputEl.press('Enter');
      console.log('  [resp] sede → "Sede Central"');
      await page.waitForTimeout(400);
      prevBotMsg = '';
      continue;
    }
    if (lower.includes('confirma') || lower.includes('datos correctos') || lower.includes('¿es correcto')) {
      await inputEl.fill('Sí, los datos son correctos. Crear el ticket.');
      await inputEl.press('Enter');
      console.log('  [resp] confirmación textual enviada');
      await page.waitForTimeout(400);
      prevBotMsg = '';
      continue;
    }

    // 5. Fallback: si el bot no avanzó (mismo mensaje que el turno anterior) → empujar
    if (lastMsg === prevBotMsg) {
      await inputEl.fill('Sí, por favor creen el ticket en el SSI automáticamente.');
      await inputEl.press('Enter');
      console.log('  [resp] push → crear ticket SSI (bot sin avanzar)');
      await page.waitForTimeout(400);
      prevBotMsg = '';
      continue;
    }

    // Bot envió mensaje nuevo pero sin chips/preguntas reconocidas — esperar siguiente turno
    console.log('  [wait] bot avanzó, esperando próxima respuesta...');
    prevBotMsg = lastMsg;
  }

  // ─────────────────────────────────────────────────────────
  // RESULTADO FINAL
  // ─────────────────────────────────────────────────────────
  await page.screenshot({ path: 'test-ssi-result.png', fullPage: false });

  if (!(await ticketResultVisible(page))) {
    console.log('\n❌ No apareció resultado SSI');
    await browser.close();
    process.exitCode = 1;
    return;
  }

  const resultText = (await page.locator('.doc-download-row').last().textContent() || '').trim();
  console.log('\n--- RESULTADO ---');
  console.log(resultText);
  console.log('---\n');

  if (resultText.includes('registrado exitosamente')) {
    console.log('✅ TEST PASSED — ticket creado exitosamente');
  } else if (resultText.includes('No se pudo crear')) {
    console.log('❌ TEST FAILED — error al crear el ticket');
    process.exitCode = 1;
  } else {
    console.log('⚠️  Resultado inesperado — revisar test-ssi-result.png');
    process.exitCode = 1;
  }

  await browser.close();
}

main().catch((err) => {
  console.error('\n💥 Error:', err.message);
  process.exit(1);
});
