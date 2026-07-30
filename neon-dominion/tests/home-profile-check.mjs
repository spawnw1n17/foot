import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const url = process.env.NEON_DOMINION_URL || 'http://127.0.0.1:8080/neon-dominion/';
const output = process.env.QA_OUTPUT_DIR || 'artifacts/neon-dominion';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const report = { desktop: {}, mobile: {} };

async function desktop() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('#homeProfileDock .home-profile-main');
  await page.waitForFunction(() => window.NeonDominionQA?.getMeta?.()?.name);

  const homeVisible = await page.locator('#homeOverlay').evaluate((node) => node.classList.contains('visible'));
  assert.equal(homeVisible, true);
  assert.equal(await page.locator('#homeProfileDock').count(), 1);
  assert.equal(await page.locator('#homeProfileDock [data-home-tab="shop"]').count() >= 1, true);
  assert.equal(await page.locator('#homeProfileDock [data-home-tab="collection"]').count() >= 1, true);
  assert.equal(await page.locator('#homeProfileDock [data-home-tab="missions"]').count() >= 1, true);
  assert.equal(await page.locator('#homeProfileDock [data-home-tab="season"]').count() >= 1, true);

  const meta = await page.evaluate(() => window.NeonDominionQA.getMeta());
  const name = (await page.locator('.home-profile-copy > strong').textContent()).trim();
  assert.equal(name, meta.name);
  await page.locator('#homeProfileDock [data-home-tab="shop"]').first().click();
  await page.waitForFunction(() => document.querySelector('#arsenalOverlay')?.classList.contains('visible'));
  assert.equal(await page.locator('#arsenalNav [data-meta-tab="shop"].active').count(), 1);
  await page.locator('#arsenalClose').click();
  await page.waitForFunction(() => !document.querySelector('#arsenalOverlay')?.classList.contains('visible'));

  const dockBox = await page.locator('#homeProfileDock').boundingBox();
  const cardBox = await page.locator('#homeOverlay .home-card').boundingBox();
  assert.ok(dockBox.width <= cardBox.width + 1);
  assert.equal(errors.length, 0);
  report.desktop = { name, level: meta.level.level, rank: meta.rank.name, dock: dockBox, card: cardBox, errors };
  await page.screenshot({ path: `${output}/desktop-home-profile.png`, fullPage: true });
  await page.close();
}

async function mobile() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('#homeProfileDock .home-profile-main');
  const dimensions = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
    dock: (() => { const rect = document.querySelector('#homeProfileDock').getBoundingClientRect(); return { width: rect.width, height: rect.height }; })(),
    actions: document.querySelectorAll('#homeProfileDock .home-arsenal-actions button').length,
  }));
  assert.ok(dimensions.scroll <= dimensions.client + 1);
  assert.ok(dimensions.actions >= 5);
  assert.ok(dimensions.dock.width <= 390);

  await page.locator('#homeProfileDock [data-home-tab="profile"]').first().tap();
  await page.waitForFunction(() => document.querySelector('#arsenalOverlay')?.classList.contains('visible'));
  assert.equal(await page.locator('#arsenalNav [data-meta-tab="profile"].active').count(), 1);
  await page.locator('#arsenalClose').tap();
  assert.equal(errors.length, 0);
  report.mobile = { width: `${dimensions.scroll}/${dimensions.client}`, dock: dimensions.dock, actions: dimensions.actions, errors };
  await page.screenshot({ path: `${output}/mobile-home-profile.png` });
  await context.close();
}

await desktop();
await mobile();
await writeFile(`${output}/home-profile-report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
await browser.close();
