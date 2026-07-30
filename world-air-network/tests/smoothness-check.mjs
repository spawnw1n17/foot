import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseUrl = process.env.AEROSPHERE_URL || 'http://127.0.0.1:8080/world-air-network/';
const outputDir = process.env.QA_OUTPUT_DIR || 'artifacts/aerosphere-qa';
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const report = { startedAt: new Date().toISOString(), desktop: null, mobile: null };

try {
  report.desktop = await runDesktop();
  report.mobile = await runMobile();
  report.ok = true;
} catch (error) {
  report.ok = false;
  report.failure = error?.stack || String(error);
  throw error;
} finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(`${outputDir}/smoothness-report.json`, JSON.stringify(report, null, 2));
  await browser.close();
}

async function runDesktop() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => localStorage.clear());
  await page.goto(`${baseUrl}?qa=smooth-desktop`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForFunction(() => document.querySelectorAll('#cityLayer [data-city-id]').length === 40);
  await page.locator('[data-zoom="in"]').click();
  await page.locator('[data-zoom="in"]').click();
  await page.waitForTimeout(200);

  const map = page.locator('#worldMap');
  const box = await map.boundingBox();
  assert.ok(box, 'Карта должна иметь экранные координаты');
  const before = await map.getAttribute('viewBox');

  await startFrameSampler(page);
  const startX = box.x + box.width * 0.46;
  const startY = box.y + box.height * 0.62;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  for (let index = 1; index <= 54; index += 1) {
    const progress = index / 54;
    await page.mouse.move(startX + 210 * progress, startY - 92 * progress);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
  await page.waitForTimeout(650);
  const samples = await stopFrameSampler(page);
  const after = await map.getAttribute('viewBox');
  assert.notEqual(after, before, 'Карта должна переместиться');

  const stats = summarize(samples);
  assert.ok(stats.count >= 45, `Недостаточно кадров для оценки: ${stats.count}`);
  assert.ok(stats.p95 < 42, `95-й процентиль кадра слишком высокий: ${stats.p95} мс`);
  assert.ok(stats.longFrames <= 8, `Слишком много кадров дольше 40 мс: ${stats.longFrames}`);
  assert.deepEqual(errors, []);
  await page.screenshot({ path: `${outputDir}/smooth-desktop.png`, fullPage: true });
  await context.close();
  return { ...stats, before, after, errors };
}

async function runMobile() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => localStorage.clear());
  await page.goto(`${baseUrl}?qa=smooth-mobile`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForFunction(() => document.querySelectorAll('#cityLayer [data-city-id]').length === 40);
  await page.locator('[data-zoom="in"]').click();
  await page.locator('[data-zoom="in"]').click();
  await page.waitForTimeout(200);

  const map = page.locator('#worldMap');
  const box = await map.boundingBox();
  assert.ok(box, 'Мобильная карта должна иметь координаты');
  const before = await map.getAttribute('viewBox');
  const session = await context.newCDPSession(page);
  const startX = Math.round(box.x + box.width * 0.58);
  const startY = Math.round(box.y + box.height * 0.64);

  await startFrameSampler(page);
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: startX, y: startY, radiusX: 5, radiusY: 5, force: 1, id: 1 }] });
  for (let index = 1; index <= 42; index += 1) {
    const progress = index / 42;
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: Math.round(startX - 118 * progress), y: Math.round(startY + 54 * progress), radiusX: 5, radiusY: 5, force: 1, id: 1 }]
    });
    await page.waitForTimeout(17);
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(550);
  const samples = await stopFrameSampler(page);
  const after = await map.getAttribute('viewBox');
  assert.notEqual(after, before, 'Карта должна плавно двигаться пальцем');

  const stats = summarize(samples);
  assert.ok(stats.count >= 35, `Недостаточно мобильных кадров: ${stats.count}`);
  assert.ok(stats.p95 < 48, `Мобильный 95-й процентиль слишком высокий: ${stats.p95} мс`);
  assert.ok(stats.longFrames <= 10, `Слишком много мобильных кадров дольше 45 мс: ${stats.longFrames}`);
  assert.deepEqual(errors, []);
  await page.screenshot({ path: `${outputDir}/smooth-mobile.png`, fullPage: true });
  await context.close();
  return { ...stats, before, after, errors };
}

async function startFrameSampler(page) {
  await page.evaluate(() => {
    const sampler = { samples: [], running: true, previous: performance.now() };
    window.__AERO_FRAME_SAMPLER__ = sampler;
    const tick = (now) => {
      if (!sampler.running) return;
      sampler.samples.push(now - sampler.previous);
      sampler.previous = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

async function stopFrameSampler(page) {
  return page.evaluate(() => {
    const sampler = window.__AERO_FRAME_SAMPLER__;
    sampler.running = false;
    return sampler.samples.slice(2);
  });
}

function summarize(samples) {
  const sorted = samples.filter(Number.isFinite).sort((a, b) => a - b);
  const percentile = (ratio) => Number((sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))] || 0).toFixed(2));
  return {
    count: sorted.length,
    average: Number((sorted.reduce((sum, value) => sum + value, 0) / Math.max(1, sorted.length)).toFixed(2)),
    p50: percentile(0.5),
    p95: percentile(0.95),
    max: Number((sorted.at(-1) || 0).toFixed(2)),
    longFrames: sorted.filter((value) => value > 40).length
  };
}
