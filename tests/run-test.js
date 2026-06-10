'use strict';
const { chromium } = require('playwright');

(async () => {
  const br  = await chromium.launch({ headless: false, args: ['--start-maximized'] });
  const ctx = await br.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();

  // ── helpers ────────────────────────────────────────────────────────
  async function send(msg) {
    await page.fill('#userInput', msg);
    await page.click('#sendBtn');
    await page.waitForFunction(
      () => !document.querySelector('.typing-indicator'),
      null, { timeout: 50000 }
    );
    await new Promise(r => setTimeout(r, 1500));
  }

  async function lastBotText() {
    const rows = await page.locator('.message-row.bot .msg-bubble').all();
    if (!rows.length) return '';
    return (await rows[rows.length - 1].innerText()).substring(0, 500);
  }

  async function getChips() {
    return page.locator('.chip-btn').allInnerTexts();
  }

  async function clickChipContaining(label) {
    const chips = await page.locator('.chip-btn').all();
    for (const c of chips) {
      const t = (await c.innerText()).toLowerCase();
      if (t.includes(label.toLowerCase())) { await c.click(); return true; }
    }
    return false;
  }

  async function waitForTyping(ms = 50000) {
    await page.waitForFunction(
      () => !document.querySelector('.typing-indicator'),
      null, { timeout: ms }
    );
    await new Promise(r => setTimeout(r, 1500));
  }

  async function ticketYaAparece() {
    return page.evaluate(() => {
      const notes = Array.from(document.querySelectorAll('.doc-note'));
      const btns  = Array.from(document.querySelectorAll('.doc-download-btn'));
      return notes.some(n => n.textContent.includes('webapp.inei'))
          || btns.some(b => b.textContent.toLowerCase().includes('ticket') || b.textContent.includes('SSI'));
    });
  }

  async function waitForTicketConfirm(ms = 90000) {
    await page.waitForFunction(
      () => {
        const notes = Array.from(document.querySelectorAll('.doc-note'));
        const btns  = Array.from(document.querySelectorAll('.doc-download-btn'));
        return notes.some(n => n.textContent.includes('webapp.inei'))
            || btns.some(b => b.textContent.toLowerCase().includes('ticket') || b.textContent.includes('SSI'));
      },
      null, { timeout: ms }
    );
  }

  // ── 1. Abrir chatbot ───────────────────────────────────────────────
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.screenshot({ path: 'run-01-inicio.png' });
  console.log('✅ 01 — Chatbot cargado');

  // ── 2. Consulta inicial ────────────────────────────────────────────
  await send('necesito configurar mi laptop, no reconoce la red wifi');
  await page.screenshot({ path: 'run-02-msg1.png' });
  console.log('✅ 02 — BOT:', await lastBotText());
  console.log('   CHIPS:', await getChips());

  // ── 3. Triaje: solo mi equipo ──────────────────────────────────────
  const clickedSolo = await clickChipContaining('solo');
  if (!clickedSolo) await send('solo mi equipo');
  else await waitForTyping();
  await page.screenshot({ path: 'run-03-triaje.png' });
  console.log('✅ 03 — BOT:', await lastBotText());
  console.log('   CHIPS:', await getChips());

  // ── 4. Más detalles del problema ───────────────────────────────────
  await send('empezó esta mañana, no hay mensaje de error, no hubo cambios antes');
  await page.screenshot({ path: 'run-04-detalles.png' });
  console.log('✅ 04 — BOT:', await lastBotText());
  console.log('   CHIPS:', await getChips());

  // ── 5. Click "Crear ticket automáticamente" ────────────────────────
  // 'automático' NO es substring de 'automáticamente' — usar 'automátic'
  const clickedAuto = await clickChipContaining('automátic');
  if (!clickedAuto) {
    console.log('   (chip automático no encontrado, enviando texto)');
    await send('sí, crea el ticket automáticamente por favor');
  } else {
    console.log('   Clic en chip "Crear ticket automáticamente"');
    await waitForTyping();
  }
  await page.screenshot({ path: 'run-05-crear.png' });
  console.log('✅ 05 — BOT:', await lastBotText());
  console.log('   CHIPS:', await getChips());

  // ── 6. Loop adaptativo: el bot puede pedir sede, nombre, o confirmar ─
  // Hasta 6 rondas de preguntas antes de que el ticket aparezca
  let step = 6;
  for (let i = 0; i < 6; i++) {
    if (await ticketYaAparece()) {
      console.log('   Ticket ya aparece, saliendo del loop');
      break;
    }

    const botTxt = await lastBotText();
    const chips  = await getChips();

    // Sede: solo chips cortos y reales (no chips template como "Mi área y sede son...")
    const sedeChipReal = chips.find(c => {
      const lower = c.toLowerCase();
      return lower.includes('sede') && c.length < 30
        && !lower.includes('mi área')
        && !lower.includes('no sé')
        && !lower.includes('cancelar');
    });
    if (sedeChipReal) {
      console.log(`✅ 0${step} — Clic en chip de sede real: "${sedeChipReal}"`);
      const clicked = await clickChipContaining('sede central');
      if (!clicked) await clickChipContaining(sedeChipReal.substring(0, 10));
      await waitForTyping();
      await page.screenshot({ path: `run-0${step}-sede.png` });
      step++;
      continue;
    }

    // Confirmar
    if (chips.some(c => c.toLowerCase().includes('confirmar'))) {
      console.log(`✅ 0${step} — Clic en chip "Confirmar y crear ticket"`);
      await clickChipContaining('confirmar');
      await waitForTyping();
      await page.screenshot({ path: `run-0${step}-confirmar.png` });
      step++;
      continue;
    }

    // Chip de confirmación con datos prellenados (ej: "Mi sede es Sede Central, mi nombre es...")
    const sedeDataChip = chips.find(c => c.toLowerCase().includes('sede central'));
    if (sedeDataChip) {
      console.log(`✅ 0${step} — Clic en chip con datos: "${sedeDataChip.substring(0, 40)}..."`);
      await clickChipContaining('sede central');
      await waitForTyping();
      await page.screenshot({ path: `run-0${step}-chip-datos.png` });
      step++;
      continue;
    }

    // Nombre / área / sede como template (bot pide datos personales — enviar como texto)
    const botPideDatos = botTxt.toLowerCase().includes('nombre')
      || botTxt.toLowerCase().includes('área')
      || botTxt.toLowerCase().includes('sede')
      || chips.some(c => c.toLowerCase().includes('mi área'));
    if (botPideDatos) {
      console.log(`✅ 0${step} — Bot pide datos personales, enviando texto`);
      await send('Mi nombre es Juan Pérez, área de Estadística e Informática, Sede Central');
      await page.screenshot({ path: `run-0${step}-datos.png` });
      step++;
      continue;
    }

    // Otro chip disponible — tomar el primero que no sea "no"/"otro"
    if (chips.length > 0) {
      console.log(`✅ 0${step} — Respondiendo con primer chip disponible: "${chips[0]}"`);
      await clickChipContaining(chips[0].substring(0, 10));
      await waitForTyping();
      await page.screenshot({ path: `run-0${step}-chip.png` });
      step++;
      continue;
    }

    // Sin chips — forzar confirmación genérica
    console.log(`✅ 0${step} — Sin chips disponibles, enviando confirmación`);
    await send('sí, todo correcto, proceder con la creación del ticket en Sede Central');
    await page.screenshot({ path: `run-0${step}-confirm-text.png` });
    step++;
  }

  // ── 7. Esperar creación del ticket SSI (backend Playwright, hasta 90s) ─
  console.log(`⏳ 0${step} — Esperando confirmación SSI (hasta 90s)…`);
  await waitForTicketConfirm(90000);
  await page.screenshot({ path: `run-0${step}-ticket-ok.png` });

  const noteTxt = await page.locator('.doc-note').last().innerText().catch(() => '?');
  const btnTxt  = await page.locator('.doc-download-btn').last().innerText().catch(() => '?');
  console.log(`✅ 0${step} — Nota: ${noteTxt}`);
  console.log(`         Btn:  ${btnTxt}`);
  console.log('\n🎉 FLUJO COMPLETO OK');

  await new Promise(r => setTimeout(r, 3000));
  await br.close();
})().catch(async e => {
  console.error('\n❌ ERROR:', e.message);
  process.exit(1);
});
