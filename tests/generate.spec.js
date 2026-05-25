// @ts-check
const { test, expect, request } = require('@playwright/test');

const BASE_URL = 'http://localhost:3000';

// ─── UI ────────────────────────────────────────────────────────────────────

test('chatbot page loads with welcome message', async ({ page }) => {
  await page.goto(BASE_URL);

  await expect(page).toHaveTitle(/OTIN/i);
  await expect(page.locator('.msg-bubble').first()).toContainText('Buenos días');
});

test('welcome chips are shown', async ({ page }) => {
  await page.goto(BASE_URL);

  const chips = page.locator('.chip-btn');
  await expect(chips.first()).toBeVisible();
  await expect(chips).toHaveCount(5);
});

test('user can send a message and bot responds', async ({ page }) => {
  await page.goto(BASE_URL);

  const input = page.locator('#userInput');
  await input.fill('Hola, necesito ayuda');
  await input.press('Enter');

  await expect(page.locator('.message-row.user .msg-bubble')).toContainText('Hola, necesito ayuda');
  await expect(page.locator('.message-row.bot .msg-bubble').nth(1)).not.toBeEmpty({ timeout: 30000 });
});

// ─── API: generate endpoint ────────────────────────────────────────────────

test('POST /api/generate ANEXO01 returns valid .docx', async ({ request: req }) => {
  const response = await req.post(`${BASE_URL}/api/generate`, {
    data: {
      tipo: 'ANEXO01',
      datos: {
        nombres: 'Juan Pérez García',
        dni: '12345678',
        cargo: 'Analista de Sistemas',
        oficina: 'OTIN',
        jefe: 'Roberto López',
        motivoVPN: 'Trabajo remoto por comisión de servicio',
      },
    },
  });

  expect(response.ok()).toBeTruthy();
  expect(response.headers()['content-type']).toContain('wordprocessingml.document');

  const body = await response.body();
  // .docx files are ZIP archives — must start with PK magic bytes
  expect(body[0]).toBe(0x50); // 'P'
  expect(body[1]).toBe(0x4b); // 'K'
  expect(body.length).toBeGreaterThan(5000);
});

test('POST /api/generate ANEXO02 returns valid .docx', async ({ request: req }) => {
  const response = await req.post(`${BASE_URL}/api/generate`, {
    data: {
      tipo: 'ANEXO02',
      datos: {
        nombres: 'María Rodríguez',
        dni: '87654321',
        cargo: 'Especialista Estadístico',
        oficina: 'OTIE',
        jefe: 'Carmen Flores',
        sistema: 'SIRTOD, REDATAM',
      },
    },
  });

  expect(response.ok()).toBeTruthy();
  expect(response.headers()['content-type']).toContain('wordprocessingml.document');

  const body = await response.body();
  expect(body[0]).toBe(0x50);
  expect(body[1]).toBe(0x4b);
  expect(body.length).toBeGreaterThan(5000);
});

test('POST /api/generate with unknown tipo returns 400', async ({ request: req }) => {
  const response = await req.post(`${BASE_URL}/api/generate`, {
    data: {
      tipo: 'ANEXO99',
      datos: { nombres: 'Test' },
    },
  });

  expect(response.status()).toBe(400);
  const body = await response.json();
  expect(body.error).toBeTruthy();
});

test('POST /api/generate without body returns 400', async ({ request: req }) => {
  const response = await req.post(`${BASE_URL}/api/generate`, {
    data: {},
  });

  expect(response.status()).toBe(400);
});
