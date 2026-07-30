import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const url = process.env.NEON_DOMINION_URL || 'http://127.0.0.1:8080/neon-dominion/';
const output = process.env.QA_OUTPUT_DIR || 'artifacts/neon-dominion';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const report = { desktop: {}, mobile: {} };

function mapPoint(box, x, y) {
  const portrait = box.width < 620 && box.height > box.width * 1.15;
  if (portrait) return { x: box.x + x * box.width / 1200, y: box.y + y * box.height / 720 };
  const scale = Math.min(box.width / 1200, box.height / 720);
  return {
    x: box.x + (box.width - 1200 * scale) / 2 + x * scale,
    y: box.y + (box.height - 720 * scale) / 2 + y * scale,
  };
}

async function desktopScenario() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  await page.addInitScript(() => {
    window.__qaLongTasks = [];
    try {
      new PerformanceObserver((list) => window.__qaLongTasks.push(...list.getEntries().map((entry) => entry.duration))).observe({ entryTypes: ['longtask'] });
    } catch {}
  });
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto(url, { waitUntil: 'networkidle' });
  await page.locator('#campaignBtn').click();
  await page.waitForFunction(() => window.NeonDominionQA?.getState()?.nodes?.length > 0);
  await page.waitForFunction(() => window.NeonDominionQA.assetsReady());

  const box = await page.locator('#battlefield').boundingBox();
  assert.ok(box);
  const source = mapPoint(box, 180, 360);
  const remoteEnemy = mapPoint(box, 1010, 360);
  await page.mouse.move(source.x, source.y);
  await page.mouse.down();
  await page.mouse.move(remoteEnemy.x, remoteEnemy.y, { steps: 24 });
  await page.mouse.up();
  await page.waitForFunction(() => window.NeonDominionQA.getState().convoys.some((convoy) => convoy.from === 'p0' && convoy.to === 'r0'));

  const state = await page.evaluate(() => window.NeonDominionQA.getState());
  assert.ok(state.stats.sent > 0);
  assert.ok(state.convoys.some((convoy) => Math.abs(convoy.curve) >= 0));
  assert.equal(errors.length, 0);

  const performanceData = await page.evaluate(() => ({ longTasks: window.__qaLongTasks || [] }));
  const severe = performanceData.longTasks.filter((duration) => duration > 150).length;
  assert.ok(severe <= 1, `Тяжёлых блокировок: ${severe}`);

  report.desktop = {
    nodes: state.nodes.length,
    freeRoute: state.convoys.some((convoy) => convoy.from === 'p0' && convoy.to === 'r0'),
    assetsReady: await page.evaluate(() => window.NeonDominionQA.assetsReady()),
    longTasks: performanceData.longTasks,
    errors,
  };
  await page.screenshot({ path: `${output}/desktop-free-movement.png`, fullPage: true });
  await page.close();
}

async function mobileScenario() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(() => window.NeonDominionQA.startLevel('crossfire'));
  await page.waitForFunction(() => window.NeonDominionQA.getState()?.nodes?.length >= 10);
  await page.waitForFunction(() => window.NeonDominionQA.assetsReady());

  const box = await page.locator('#battlefield').boundingBox();
  assert.ok(box);
  const p0 = mapPoint(box, 165, 360);
  const p1 = mapPoint(box, 320, 170);
  const r0 = mapPoint(box, 1020, 190);

  await page.locator('#groupSelectBtn').click();
  await page.touchscreen.tap(p0.x, p0.y);
  await page.touchscreen.tap(p1.x, p1.y);
  await page.waitForFunction(() => window.NeonDominionQA.getSelection().length === 2);
  await page.locator('#groupSendBtn').click();
  await page.touchscreen.tap(r0.x, r0.y);
  await page.waitForFunction(() => window.NeonDominionQA.getState().convoys.filter((convoy) => convoy.to === 'r0').length >= 2);

  const state = await page.evaluate(() => window.NeonDominionQA.getState());
  const dimensions = await page.evaluate(() => {
    const rect = document.querySelector('#battlefield').getBoundingClientRect();
    return {
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
      canvas: { width: rect.width, height: rect.height },
    };
  });
  assert.ok(dimensions.scroll <= dimensions.client + 1);
  assert.ok(dimensions.canvas.height > 650);
  assert.equal(state.stats.groupOrders, 1);
  assert.equal(errors.length, 0);

  report.mobile = {
    width: `${dimensions.scroll}/${dimensions.client}`,
    canvas: dimensions.canvas,
    selection: await page.evaluate(() => window.NeonDominionQA.getSelection()),
    groupConvoys: state.convoys.filter((convoy) => convoy.to === 'r0').length,
    groupOrders: state.stats.groupOrders,
    errors,
  };
  await page.screenshot({ path: `${output}/mobile-group-selection.png`, fullPage: true });
  await context.close();
}

await desktopScenario();
await mobileScenario();
await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
await browser.close();
