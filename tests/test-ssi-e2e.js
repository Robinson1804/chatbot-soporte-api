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

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const GEMINI_TIMEOUT   = 45_000;   // tiempo máximo para que Gemini responda
const SSI_AUTO_TIMEOUT = 540_000;  // Gemini 2.5 Flash (thinking ~30s) + SSI automation (~120s) + handler timeout (240s) + buffer

// Espera a que #userInput quede habilitado (bot terminó de responder)
// También detecta si ya hay resultado SSI para terminar antes
async function waitForBotDone(page, timeout = GEMINI_TIMEOUT) {
  return page.waitForFunction(
    () => !document.getElementById('userInput')?.disabled,
    null,          // arg (no se necesita pasar nada a la función)
    { timeout },   // opciones — aquí sí aplica el timeout personalizado
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
  let pushCount = 0;   // limita los pushes consecutivos para evitar doble SSI
  let confirmationSent = false; // se activa tras enviar confirmación — evita pushes post-SSI

  while (turn < MAX_TURNS) {
    turn++;
    console.log(`\n[turno ${turn}] Esperando respuesta del bot...`);

    // Esperar CUALQUIERA de las dos señales: bot terminó O ticket apareció
    // Esto evita el caso donde el SSI automation corre (input disabled) pero
    // .doc-download-row aparece antes de que setStreaming(false) sea llamado.
    try {
      await Promise.race([
        waitForBotDone(page, SSI_AUTO_TIMEOUT),
        page.waitForSelector('.doc-download-row', { timeout: SSI_AUTO_TIMEOUT }),
      ]);
    } catch {
      console.log('  [timeout] El bot tardó demasiado');
      break;
    }

    // ¿Ya tenemos resultado? Dar 2s para que el DOM procese el action event del SSE
    await page.waitForSelector('.doc-download-row', { timeout: 2000 }).catch(() => {});
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
        confirmationSent = true;
        await Promise.race([
          waitForBotDone(page, SSI_AUTO_TIMEOUT),
          page.waitForSelector('.doc-download-row', { timeout: SSI_AUTO_TIMEOUT }),
        ]).catch(() => {});
        if (await ticketResultVisible(page)) break;
        continue;
      }
    }
    if (await ticketResultVisible(page)) break;

    // 2. Aceptar creación automática
    if (await clickChip(page, 'Crear ticket automáticamente', 1_500)) {
      prevBotMsg = '';
      pushCount = 0;
      continue;
    }

    // 3. Chips de triaje
    for (const c of ['Solo mi equipo', 'No hubo cambios', 'No, ningún cambio', 'El problema persiste']) {
      if (await clickChip(page, c, 1_000)) {
        prevBotMsg = '';
        pushCount = 0;
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
      pushCount = 0;
      continue;
    }
    if (lower.includes('área') || lower.includes('dependencia')) {
      await inputEl.fill('Dirección de Informática');
      await inputEl.press('Enter');
      console.log('  [resp] área → "Dirección de Informática"');
      await page.waitForTimeout(400);
      prevBotMsg = '';
      pushCount = 0;
      continue;
    }
    if (lower.includes('sede') && !lower.includes('sede central')) {
      await inputEl.fill('Sede Central');
      await inputEl.press('Enter');
      console.log('  [resp] sede → "Sede Central"');
      await page.waitForTimeout(400);
      prevBotMsg = '';
      pushCount = 0;
      continue;
    }
    if (lower.includes('confirma') || lower.includes('datos correctos') || lower.includes('¿es correcto')) {
      await inputEl.fill('Sí, los datos son correctos. Crear el ticket.');
      await inputEl.press('Enter');
      console.log('  [resp] confirmación textual enviada');
      await page.waitForTimeout(400);
      prevBotMsg = '';
      pushCount = 0;
      confirmationSent = true; // la SSI debería dispararse en el próximo turno
      continue;
    }

    // 5. Fallback: si el bot no avanzó — verificar si SSI ya está en curso antes de pushear
    if (lastMsg === prevBotMsg) {
      const inputEnabled = await page.evaluate(() => !document.getElementById('userInput')?.disabled);

      if (!inputEnabled) {
        // Input disabled = SSI corriendo (bot respondió vacío mientras ejecuta tool call)
        console.log('  [espera] SSI en curso (input disabled) — esperando .doc-download-row...');
        await page.waitForSelector('.doc-download-row', { timeout: SSI_AUTO_TIMEOUT }).catch(() => {});
        if (await ticketResultVisible(page)) break;
        // Esperar también que el input se habilite (bot terminó)
        await waitForBotDone(page, SSI_AUTO_TIMEOUT).catch(() => {});
        if (await ticketResultVisible(page)) break;
        break;
      }

      // Si ya enviamos confirmación y el bot respondió vacío con input enabled:
      // La SSI se ejecutó y el resultado debería estar en el DOM — esperar un poco más
      if (confirmationSent && lastMsg === '') {
        console.log('  [espera] post-confirmación: SSI debería haber corrido — esperando resultado...');
        await page.waitForSelector('.doc-download-row', { timeout: SSI_AUTO_TIMEOUT }).catch(() => {});
        if (await ticketResultVisible(page)) break;
        await waitForBotDone(page, 30_000).catch(() => {});
        if (await ticketResultVisible(page)) break;
        // Si aún no hay resultado, la SSI falló silenciosamente — esperar el próximo bot message
        confirmationSent = false; // resetear para no quedar en loop
        prevBotMsg = lastMsg;
        pushCount = 0;
        continue;
      }

      if (pushCount === 0) {
        await inputEl.fill('Sí, por favor creen el ticket en el SSI automáticamente.');
        await inputEl.press('Enter');
        console.log('  [resp] push → crear ticket SSI (bot sin avanzar)');
        await page.waitForTimeout(400);
        prevBotMsg = '';
        pushCount++;
        continue;
      }

      // pushCount > 0 y input habilitado — Gemini respondió vacío sin tool call
      if (pushCount < 3) {
        // Reintentar con datos explícitos
        console.log('  [retry] respuesta vacía — reintentando con datos explícitos');
        await inputEl.fill('Por favor registre el ticket en el SSI. Datos: usuario Juan Pérez, área Dirección de Informática, sede Sede Central, problema: computadora no enciende desde esta mañana.');
        await inputEl.press('Enter');
        console.log('  [resp] retry con datos explícitos');
        await page.waitForTimeout(400);
        prevBotMsg = '';
        pushCount++;
        confirmationSent = true; // cada retry es efectivamente una confirmación
        continue;
      } else {
        console.log('  [abort] máx reintentos — esperando .doc-download-row último intento...');
        await page.waitForSelector('.doc-download-row', { timeout: SSI_AUTO_TIMEOUT }).catch(() => {});
      }

      if (await ticketResultVisible(page)) break;
      break;
    }

    // Bot envió mensaje nuevo pero sin chips/preguntas reconocidas
    // Detectar si clasificó el incidente (P1/P2/P3/P4) sin presentar resumen de ticket
    const isClassif = /\bp[1-4]\b/i.test(lastMsg) || lower.includes('prioridad') || lower.includes('clasifica') || lower.includes('incidencia');
    const hasTicketAction = lower.includes('confirmar') || lower.includes('registrar') || lower.includes('crear el ticket') || lower.includes('ticket ssi') || lower.includes('¿desea');

    if (isClassif && !hasTicketAction) {
      // Bot solo clasificó sin avanzar al resumen — empujar con datos completos
      await inputEl.fill('Sí, de acuerdo con la clasificación. Por favor registre el ticket en el SSI con estos datos: Juan Pérez, Dirección de Informática, Sede Central, computadora no enciende desde esta mañana.');
      await inputEl.press('Enter');
      console.log('  [resp] clasificación detectada → empujar con datos al registro');
      await page.waitForTimeout(400);
      prevBotMsg = '';
      pushCount = 0;
    } else {
      // Bot avanzó con contenido no reconocido — esperar siguiente turno
      console.log('  [wait] bot avanzó, esperando próxima respuesta...');
      prevBotMsg = lastMsg;
      pushCount = 0;
    }
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
