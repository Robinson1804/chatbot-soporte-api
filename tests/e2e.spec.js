// @ts-check
const { test, expect } = require('@playwright/test');
const fs = require('fs');

const BASE_URL = 'http://localhost:3000';

/** Espera a que el último mensaje del bot deje de cambiar (streaming terminado). */
async function waitForBotIdle(page, { timeout = 50_000 } = {}) {
  await page.locator('.typing-indicator').waitFor({ state: 'detached', timeout }).catch(() => {});

  const lastBubble = page.locator('.message-row.bot .msg-bubble').last();
  await lastBubble.waitFor({ state: 'visible', timeout });

  let prev = '';
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    await page.waitForTimeout(900);
    const current = await lastBubble.textContent().catch(() => '');
    if (current === prev && current && current.trim().length > 10) break;
    prev = current ?? '';
  }
}

async function send(page, text) {
  await page.locator('#userInput').fill(text);
  await page.locator('#sendBtn').click();
  await waitForBotIdle(page);
}

// ─────────────────────────────────────────────────────────────────────────────

test('E2E — flujo completo VPN → ANEXO 01 → descarga .docx', async ({ page }) => {

  // ── 1. Abrir chatbot ────────────────────────────────────────────────────
  await page.goto(BASE_URL);
  await expect(page.locator('.msg-bubble').first()).toContainText('Buenos días', { timeout: 10_000 });

  // ── 2. Clic en chip "Acceso remoto (VPN)" ───────────────────────────────
  const vpnChip = page.locator('.chip-btn', { hasText: 'Acceso remoto (VPN)' });
  await expect(vpnChip).toBeVisible({ timeout: 5_000 });
  await vpnChip.click();
  await waitForBotIdle(page);

  // ── 3. Enviar TODOS los datos posibles de una vez ───────────────────────
  await send(page,
    'Quiero generar el ANEXO 01, aquí están todos mis datos:\n' +
    'Nombres completos: Juan Alberto Pérez García\n' +
    'DNI: 12345678\n' +
    'Cargo: Analista de Sistemas\n' +
    'Área / Oficina: OTIN - Oficina Técnica de Informática\n' +
    'Sede: Lima, Sede Central\n' +
    'Tipo de contrato: CAS\n' +
    'Fecha inicio de contrato: 01/01/2025\n' +
    'Fecha fin de contrato: 31/12/2025\n' +
    'Usuario de red INEI: jperezg\n' +
    'Correo institucional INEI: jperezg@inei.gob.pe\n' +
    'Correo personal: juan.perez@gmail.com\n' +
    'Equipo HOST personal: LAPTOP-JPEREZ\n' +
    'Teléfono de contacto: 987654321\n' +
    'Jefe inmediato: Roberto López Quispe\n' +
    'Motivo del acceso VPN: Comisión de servicio — trabajo remoto aprobado por jefatura'
  );

  // ── 4. Manejar preguntas de seguimiento (hasta 6 vueltas) ────────────────
  for (let i = 0; i < 6; i++) {
    // Si ya apareció el botón de descarga, terminamos
    if (await page.locator('.doc-download-btn').isVisible().catch(() => false)) break;

    const lastText = (
      await page.locator('.message-row.bot .msg-bubble').last().textContent().catch(() => '')
    ).toLowerCase();

    // Responder primero a preguntas textuales específicas (antes de mirar chips)
    if (/fecha.*inicio|fecha.*contrato|fecha.*inicio.*término/i.test(lastText)) {
      await send(page, 'Fecha inicio: 01/01/2025 — Fecha fin: 31/12/2025');
      continue;
    }
    if (/tipo.*contrato|modalidad.*contrato/i.test(lastText)) {
      await send(page, 'CAS');
      continue;
    }
    if (/sede/i.test(lastText) && !/lima/i.test(lastText)) {
      await send(page, 'Lima, Sede Central');
      continue;
    }
    if (/usuario.*red|nombre.*usuario/i.test(lastText)) {
      await send(page, 'jperezg');
      continue;
    }
    if (/correo.*personal/i.test(lastText)) {
      await send(page, 'juan.perez@gmail.com');
      continue;
    }
    if (/host|equipo.*personal/i.test(lastText)) {
      await send(page, 'LAPTOP-JPEREZ');
      continue;
    }
    if (/teléfono|telefono/i.test(lastText)) {
      await send(page, '987654321');
      continue;
    }
    if (/confirma|correcto|procedo|genero/i.test(lastText)) {
      await send(page, 'Sí, confirmo. Por favor genera el documento.');
      continue;
    }

    // Si hay chips disponibles, preferir los más útiles (evitar chips ambiguos)
    const chips = page.locator('.chip-btn');
    const chipCount = await chips.count().catch(() => 0);
    if (chipCount > 0) {
      const preferred = ['sí, confirmo', 'sí', 'si', 'cas', 'lima, sede central', 'lima', 'correcto'];
      let clicked = false;
      for (const pref of preferred) {
        const match = chips.filter({ hasText: new RegExp(`^${pref}$`, 'i') }).first();
        if (await match.isVisible().catch(() => false)) {
          await match.click();
          await waitForBotIdle(page);
          clicked = true;
          break;
        }
      }
      if (!clicked) {
        // Fallback: click primer chip visible
        await chips.first().click();
        await waitForBotIdle(page);
      }
      continue;
    }

    // Fallback genérico
    await send(page, 'Sí. Mis datos son completos. Por favor genera el ANEXO 01 ahora.');
  }

  // ── 5. Verificar botón de descarga ──────────────────────────────────────
  const downloadBtn = page.locator('.doc-download-btn').first();
  await expect(downloadBtn).toBeVisible({ timeout: 25_000 });
  await expect(downloadBtn).toContainText('ANEXO 01');

  // ── 6. Clic y capturar la descarga ───────────────────────────────────────
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 30_000 }),
    downloadBtn.click(),
  ]);

  // ── 7. Verificar archivo ─────────────────────────────────────────────────
  const filename = download.suggestedFilename();
  expect(filename).toMatch(/ANEXO01.*\.docx$/i);

  const tmpPath = await download.path();
  const buf = fs.readFileSync(tmpPath);

  // .docx = ZIP → magic bytes PK
  expect(buf[0]).toBe(0x50);
  expect(buf[1]).toBe(0x4b);
  expect(buf.length).toBeGreaterThan(5_000);

  console.log(`\n✅  Descargado: ${filename}  (${(buf.length / 1024).toFixed(1)} KB)\n`);
});
