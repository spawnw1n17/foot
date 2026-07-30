import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const url = process.env.NEON_DOMINION_URL || 'http://127.0.0.1:8080/neon-dominion/';
const output = process.env.QA_OUTPUT_DIR || 'artifacts/neon-dominion';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const report = { desktop: {}, mobile: {} };

async function collectErrors(page) {
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

async function desktop() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = await collectErrors(page);
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.NeonDominionQA?.openWarRoom && document.querySelector('#warRoomHomeBtn'));
  await page.evaluate(() => window.NeonDominionQA.resetWarRoom());
  await page.locator('#warRoomHomeBtn').click();
  await page.waitForFunction(() => document.querySelector('#warRoomOverlay')?.classList.contains('visible'));

  assert.equal(await page.locator('#warRoomNav [data-war-tab]').count(), 9);
  assert.equal(await page.locator('.world-region').count(), 10);
  assert.equal(await page.locator('.world-region.unlocked').count() >= 1, true);
  await page.screenshot({ path: `${output}/desktop-war-room-world.png`, fullPage: true });

  for (const tab of ['modes', 'survival', 'sandbox', 'editor', 'records', 'identity', 'arsenal', 'audio']) {
    await page.locator(`#warRoomNav [data-war-tab="${tab}"]`).click();
    await page.waitForFunction((value) => document.querySelector(`#warRoomNav [data-war-tab="${value}"]`)?.classList.contains('active'), tab);
  }
  await page.locator('#warRoomNav [data-war-tab="editor"]').click();
  assert.equal(await page.locator('#editorCanvas').count(), 1);
  await page.locator('#warRoomClose').click();

  await page.evaluate(() => window.NeonDominionQA.startWarLevel('awakening', { mode: 'conquest' }));
  await page.waitForSelector('#warBattlePanel:not([hidden])');
  const mechanics = await page.evaluate(() => {
    const qa = window.NeonDominionQA;
    const engine = qa.getEngine();
    engine.energy = 100;
    const built = qa.buildNode('outpost', 590, 100);
    engine.nodes.p0.troops = 70;
    const sent = qa.sendWaypointRoute(['p0'], [{ x: 420, y: 110 }, { x: 690, y: 610 }], 'r0', { unitType: 'rapid', formation: 'column' });
    const convoy = engine.convoys[0];
    const initialProgress = convoy.progress;
    const held = qa.holdConvoy(convoy.id, true);
    engine.update(.5);
    const stopped = convoy.progress === initialProgress;
    qa.holdConvoy(convoy.id, false);
    const retargeted = qa.retargetConvoy(convoy.id, 'p1');
    const split = qa.splitConvoy(convoy.id, 'p2', .5);
    return {
      built: built?.type,
      builtCount: engine.stats.built,
      sent,
      routeLength: convoy.route.length,
      formation: convoy.formation,
      held,
      stopped,
      retargeted,
      split: Boolean(split),
      convoys: engine.convoys.length,
    };
  });
  assert.equal(mechanics.built, 'outpost');
  assert.equal(mechanics.builtCount, 1);
  assert.equal(mechanics.sent, 1);
  assert.equal(mechanics.formation, 'column');
  assert.equal(mechanics.held, true);
  assert.equal(mechanics.stopped, true);
  assert.equal(mechanics.retargeted, true);
  assert.equal(mechanics.split, true);
  assert.equal(mechanics.convoys, 2);
  await page.screenshot({ path: `${output}/desktop-war-room-battle.png`, fullPage: true });

  await page.evaluate(() => window.NeonDominionQA.startWarLevel('citadel', { mode: 'boss', boss: 'coloss' }));
  await page.waitForFunction(() => window.NeonDominionQA.getEngine()?.modeState?.boss === 'coloss');
  const boss = await page.evaluate(() => {
    const engine = window.NeonDominionQA.getEngine();
    const node = Object.values(engine.nodes).find((item) => item.boss);
    return { id: node?.id, phase: node?.bossPhase, max: node?.bossMaxTroops, mode: engine.mode };
  });
  assert.ok(boss.id);
  assert.equal(boss.phase, 3);
  assert.equal(boss.mode, 'boss');
  assert.equal(errors.length, 0);
  report.desktop = { tabs: 9, regions: 10, mechanics, boss, errors };
  await page.close();
}

async function mobile() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = await collectErrors(page);
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.NeonDominionQA?.openWarRoom && document.querySelector('#warRoomHomeBtn'));
  await page.locator('#warRoomHomeBtn').tap();
  await page.waitForFunction(() => document.querySelector('#warRoomOverlay')?.classList.contains('visible'));
  const dimensions = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
    shell: (() => { const rect = document.querySelector('.war-room-shell').getBoundingClientRect(); return { width: rect.width, height: rect.height }; })(),
    tabs: document.querySelectorAll('#warRoomNav [data-war-tab]').length,
    regions: document.querySelectorAll('.world-region').length,
  }));
  assert.ok(dimensions.scroll <= dimensions.client + 1);
  assert.equal(dimensions.tabs, 9);
  assert.equal(dimensions.regions, 10);
  assert.ok(dimensions.shell.width <= 390);
  await page.locator('#warRoomNav [data-war-tab="modes"]').tap();
  assert.equal(await page.locator('.mode-card').count(), 8);
  await page.locator('#warRoomNav [data-war-tab="editor"]').tap();
  await page.waitForSelector('#editorCanvas');
  const editor = page.locator('#editorCanvas');
  const box = await editor.boundingBox();
  await page.touchscreen.tap(box.x + box.width * .2, box.y + box.height * .5);
  assert.equal(await page.locator('.editor-node').count(), 1);
  await page.screenshot({ path: `${output}/mobile-war-room-editor.png` });
  assert.equal(errors.length, 0);
  report.mobile = { width: `${dimensions.scroll}/${dimensions.client}`, shell: dimensions.shell, tabs: dimensions.tabs, regions: dimensions.regions, editorNodes: 1, errors };
  await context.close();
}

await desktop();
await mobile();
await writeFile(`${output}/war-room-report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
await browser.close();
