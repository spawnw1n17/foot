import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const url = process.env.NEON_DOMINION_URL || 'http://127.0.0.1:8080/neon-dominion/';
const output = process.env.QA_OUTPUT_DIR || 'artifacts/neon-dominion';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const report = { desktop: {}, mobile: {}, landscape: {}, offline: {} };

function monitor(page) {
  const data = { errors: [], failed: [], badResponses: [] };
  page.on('console', (message) => { if (message.type() === 'error') data.errors.push(message.text()); });
  page.on('pageerror', (error) => data.errors.push(error.message));
  page.on('requestfailed', (request) => data.failed.push(`${request.method()} ${request.url()} :: ${request.failure()?.errorText || 'failed'}`));
  page.on('response', (response) => {
    if (response.status() >= 400 && !response.url().includes('favicon')) data.badResponses.push(`${response.status()} ${response.url()}`);
  });
  return data;
}

async function waitReady(page) {
  await page.waitForFunction(() => window.NeonDominionQA?.getMeta && window.NeonDominionQA?.openWarRoom && document.querySelector('#homeProfileDock'));
}

async function dimensions(page, selector = 'html') {
  return page.locator(selector).evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return {
      x: rect.x, y: rect.y, width: rect.width, height: rect.height,
      scrollWidth: node.scrollWidth, scrollHeight: node.scrollHeight,
      clientWidth: node.clientWidth, clientHeight: node.clientHeight,
    };
  });
}

async function assertNoDocumentOverflow(page, tolerance = 2) {
  const value = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  assert.ok(value.scrollWidth <= value.clientWidth + tolerance, `horizontal overflow ${value.scrollWidth}/${value.clientWidth}`);
  return value;
}

async function assertUniqueIds(page) {
  const duplicates = await page.evaluate(() => {
    const counts = new Map();
    document.querySelectorAll('[id]').forEach((node) => counts.set(node.id, (counts.get(node.id) || 0) + 1));
    return [...counts.entries()].filter(([, count]) => count > 1);
  });
  assert.deepEqual(duplicates, []);
}

async function assertButtonsNamed(page, root = 'body') {
  const unnamed = await page.locator(root).evaluate((node) => [...node.querySelectorAll('button')]
    .filter((button) => !button.disabled && button.offsetParent !== null)
    .filter((button) => !(button.textContent || '').trim() && !button.getAttribute('aria-label') && !button.getAttribute('title'))
    .map((button) => button.outerHTML.slice(0, 180)));
  assert.deepEqual(unnamed, []);
}

async function openWarTab(page, tab) {
  await page.locator(`#warRoomNav [data-war-tab="${tab}"]`).click();
  await page.waitForFunction((value) => document.querySelector(`#warRoomNav [data-war-tab="${value}"]`)?.classList.contains('active'), tab);
  await assertNoDocumentOverflow(page);
  await assertUniqueIds(page);
  await assertButtonsNamed(page, '#warRoomOverlay');
}

async function desktopAudit() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const diagnostics = monitor(page);
  await page.goto(url, { waitUntil: 'networkidle' });
  await waitReady(page);
  await page.evaluate(() => { window.NeonDominionQA.resetMeta(); window.NeonDominionQA.resetWarRoom(); });

  assert.match(await page.title(), /NEON DOMINION/i);
  assert.equal(await page.locator('html').getAttribute('lang'), 'ru');
  await assertNoDocumentOverflow(page);
  await assertUniqueIds(page);
  await assertButtonsNamed(page);
  assert.equal(await page.locator('#homeProfileDock').count(), 1);
  assert.equal(await page.locator('#warRoomHomeBtn').count(), 1);
  assert.ok(await page.locator('#homeProfileDock .home-arsenal-actions button').count() >= 6);

  for (const tab of ['profile', 'shop', 'collection', 'commanders', 'missions', 'season', 'achievements']) {
    await page.evaluate((value) => window.NeonDominionQA.openMeta(value), tab);
    await page.waitForFunction((value) => document.querySelector(`#arsenalNav [data-meta-tab="${value}"]`)?.classList.contains('active'), tab);
    await assertNoDocumentOverflow(page);
    await assertUniqueIds(page);
    await assertButtonsNamed(page, '#arsenalOverlay');
  }
  await page.evaluate(() => window.NeonDominionQA.openMeta('profile'));
  await page.waitForSelector('#profileNameInput');
  await page.locator('#profileNameInput').fill('Аудитор');
  await page.locator('[data-meta-action="save-name"]').click();
  await page.waitForFunction(() => window.NeonDominionQA.getMeta().name === 'Аудитор');
  await page.evaluate(() => window.NeonDominionQA.closeMeta());

  await page.locator('#warRoomHomeBtn').click();
  await page.waitForFunction(() => document.querySelector('#warRoomOverlay')?.classList.contains('visible'));
  assert.equal(await page.locator('#warRoomNav [data-war-tab]').count(), 9);
  assert.equal(await page.evaluate(() => document.body.classList.contains('war-room-open')), true);
  const lockedOpacity = Number(await page.locator('.world-region.locked').first().evaluate((node) => getComputedStyle(node).opacity));
  assert.ok(lockedOpacity >= .45, `locked regions are too dim: ${lockedOpacity}`);
  for (const tab of ['world', 'modes', 'survival', 'sandbox', 'editor', 'records', 'identity', 'arsenal', 'audio']) await openWarTab(page, tab);

  await openWarTab(page, 'sandbox');
  const enemyInput = page.locator('[data-sandbox="enemies"]');
  if (await enemyInput.count()) {
    await enemyInput.fill('2');
    await enemyInput.dispatchEvent('change');
  }
  const sandboxState = await page.evaluate(() => window.NeonDominionQA.getWarRoom().sandbox);
  assert.equal(Number(sandboxState.enemies), 2);

  await openWarTab(page, 'editor');
  const canvas = page.locator('#editorCanvas');
  const box = await canvas.boundingBox();
  assert.ok(box);
  const place = async (fx, fy) => page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
  await place(.18, .25);
  await place(.32, .45);
  await place(.46, .65);
  let editor = await page.evaluate(() => window.NeonDominionQA.getWarRoom().editor);
  assert.equal(editor.nodes.length, 3);
  const middle = editor.nodes[1].id;
  await page.locator(`[data-war-action="editor-delete"][data-node="${middle}"]`).click();
  await place(.62, .5);
  editor = await page.evaluate(() => window.NeonDominionQA.getWarRoom().editor);
  assert.equal(new Set(editor.nodes.map((node) => node.id)).size, editor.nodes.length, `duplicate editor IDs: ${editor.nodes.map((node) => node.id).join(',')}`);

  await openWarTab(page, 'identity');
  const motto = page.locator('[data-identity="motto"]');
  if (await motto.count()) await motto.fill('Проверено в Chromium');
  await page.locator('[data-war-action="save-identity"]').click();
  await page.locator('#warRoomClose').click();
  await page.evaluate(() => window.NeonDominionQA.openWarRoom('identity'));
  await page.waitForFunction(() => document.querySelector('#warRoomNav [data-war-tab="identity"]')?.classList.contains('active'));
  if (await motto.count()) assert.equal(await page.locator('[data-identity="motto"]').inputValue(), 'Проверено в Chromium');

  await openWarTab(page, 'arsenal');
  const preview = page.locator('[data-war-action="preview-item"]:not([disabled])').first();
  if (await preview.count()) await preview.click();
  await openWarTab(page, 'audio');
  await page.locator('[data-war-action="audio-test"]').click();
  await page.locator('#warRoomClose').click();

  await page.evaluate(() => window.NeonDominionQA.startWarLevel('awakening', { mode: 'conquest' }));
  await page.waitForSelector('#warBattlePanel:not([hidden])');
  await page.waitForFunction(() => window.NeonDominionQA.getEngine()?.nodes?.p0);
  const mechanics = await page.evaluate(() => {
    const qa = window.NeonDominionQA;
    const engine = qa.getEngine();
    const positions = [[510, 90], [610, 90], [710, 90], [810, 90], [910, 90], [1010, 90], [1110, 90]];
    const types = ['outpost', 'radar', 'turret', 'portal', 'medbay', 'command', 'shieldgen'];
    const built = [];
    types.forEach((type, index) => { engine.energy = 100; const node = qa.buildNode(type, ...positions[index]); if (node) built.push(node.type); });
    engine.nodes.p0.troops = 90;
    const sent = qa.sendWaypointRoute(['p0'], [{ x: 420, y: 130 }, { x: 650, y: 610 }], 'r0', { unitType: 'rapid', formation: 'column' });
    const convoy = engine.convoys[0];
    const held = qa.holdConvoy(convoy.id, true);
    const stoppedAt = convoy.progress;
    engine.update(.5);
    const stopped = convoy.progress === stoppedAt;
    qa.holdConvoy(convoy.id, false);
    const retargeted = qa.retargetConvoy(convoy.id, 'p1');
    const split = qa.splitConvoy(convoy.id, 'p2', .5);
    const recalled = qa.recallConvoy(convoy.id);
    const finite = Object.values(engine.nodes).every((node) => Number.isFinite(node.troops) && Number.isFinite(node.x) && Number.isFinite(node.y))
      && engine.convoys.every((item) => Number.isFinite(item.amount) && Number.isFinite(item.progress));
    return { built, sent, held, stopped, retargeted, split: Boolean(split), recalled, finite, nodeIds: Object.keys(engine.nodes) };
  });
  assert.deepEqual(mechanics.built.sort(), ['command', 'medbay', 'outpost', 'portal', 'radar', 'shieldgen', 'turret'].sort());
  assert.equal(mechanics.sent, 1);
  assert.equal(mechanics.held, true);
  assert.equal(mechanics.stopped, true);
  assert.equal(mechanics.retargeted, true);
  assert.equal(mechanics.split, true);
  assert.equal(mechanics.recalled, true);
  assert.equal(mechanics.finite, true);
  assert.equal(new Set(mechanics.nodeIds).size, mechanics.nodeIds.length);

  await page.locator('[data-battle-action="planner"]').click();
  await page.waitForFunction(() => !document.querySelector('#tacticalPlanner')?.hidden);
  assert.ok(await page.locator('#tacticalPlanner button').count() >= 1);
  await page.keyboard.press('Escape');

  const bosses = {};
  for (const boss of ['coloss', 'phantom', 'swarm', 'oracle', 'parasite']) {
    bosses[boss] = await page.evaluate(({ boss }) => {
      window.NeonDominionQA.startWarLevel('citadel', { mode: 'boss', boss });
      const engine = window.NeonDominionQA.getEngine();
      const node = Object.values(engine.nodes).find((item) => item.boss);
      return { mode: engine.mode, boss: engine.modeState?.boss, node: node?.id, phase: node?.bossPhase, troops: node?.troops };
    }, { boss });
    assert.equal(bosses[boss].mode, 'boss');
    assert.equal(bosses[boss].boss, boss);
    assert.ok(bosses[boss].node);
    assert.ok(Number.isFinite(bosses[boss].troops));
  }
  for (const mode of ['hold', 'defense', 'escort', 'energy', 'survival']) {
    const state = await page.evaluate(({ mode }) => {
      window.NeonDominionQA.startWarLevel('crossfire', { mode });
      const engine = window.NeonDominionQA.getEngine();
      return { mode: engine.mode, state: engine.modeState, nodes: Object.keys(engine.nodes).length };
    }, { mode });
    assert.equal(state.mode, mode);
    assert.ok(state.nodes > 0);
  }

  await page.screenshot({ path: `${output}/full-audit-desktop-battle.png`, fullPage: true });
  await page.evaluate(() => window.NeonDominionQA.openWarRoom('world'));
  await page.screenshot({ path: `${output}/full-audit-desktop-world.png`, fullPage: true });

  assert.equal(diagnostics.errors.length, 0, `page errors: ${JSON.stringify(diagnostics.errors)}`);
  assert.equal(diagnostics.failed.length, 0, `request failures: ${JSON.stringify(diagnostics.failed)}`);
  assert.equal(diagnostics.badResponses.length, 0, `bad responses: ${JSON.stringify(diagnostics.badResponses)}`);
  report.desktop = { mechanics, bosses, diagnostics };
  await page.close();
}

async function mobileAudit() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const diagnostics = monitor(page);
  await page.goto(url, { waitUntil: 'networkidle' });
  await waitReady(page);
  const home = await assertNoDocumentOverflow(page);
  await page.locator('#warRoomHomeBtn').tap();
  await page.waitForFunction(() => document.querySelector('#warRoomOverlay')?.classList.contains('visible'));
  const shell = await dimensions(page, '.war-room-shell');
  assert.ok(shell.width <= 390);
  assert.equal(await page.locator('#warRoomNav [data-war-tab]').count(), 9);
  assert.equal(await page.evaluate(() => document.body.classList.contains('war-room-open')), true);
  const lockedOpacity = Number(await page.locator('.world-region.locked').first().evaluate((node) => getComputedStyle(node).opacity));
  assert.ok(lockedOpacity >= .45, `locked regions are too dim: ${lockedOpacity}`);
  for (const tab of ['world', 'modes', 'survival', 'sandbox', 'editor', 'records', 'identity', 'arsenal', 'audio']) await openWarTab(page, tab);

  await openWarTab(page, 'editor');
  const editor = page.locator('#editorCanvas');
  const box = await editor.boundingBox();
  await page.touchscreen.tap(box.x + box.width * .2, box.y + box.height * .25);
  await page.touchscreen.tap(box.x + box.width * .65, box.y + box.height * .65);
  assert.equal(await page.locator('.editor-node').count(), 2);
  await assertNoDocumentOverflow(page);
  await page.screenshot({ path: `${output}/full-audit-mobile-editor.png`, fullPage: true });

  await page.locator('#warRoomClose').tap();
  await page.evaluate(() => window.NeonDominionQA.startWarLevel('crossfire', { mode: 'conquest' }));
  await page.waitForSelector('#warBattlePanel:not([hidden])');
  const hud = await dimensions(page, '#warBattlePanel');
  assert.ok(hud.width <= 390);
  assert.equal(await page.locator('#warBattlePanel').evaluate((node) => node.classList.contains('collapsed')), true);
  assert.ok(hud.height < 90, `mobile HUD should start collapsed, got ${hud.height}px`);
  await page.locator('[data-battle-action="toggle-hud"]').tap();
  assert.equal(await page.locator('#warBattlePanel').evaluate((node) => node.classList.contains('collapsed')), false);
  await page.locator('[data-battle-action="toggle-hud"]').tap();
  await assertNoDocumentOverflow(page);
  await page.screenshot({ path: `${output}/full-audit-mobile-battle.png`, fullPage: true });

  assert.equal(diagnostics.errors.length, 0, `mobile errors: ${JSON.stringify(diagnostics.errors)}`);
  assert.equal(diagnostics.failed.length, 0, `mobile request failures: ${JSON.stringify(diagnostics.failed)}`);
  assert.equal(diagnostics.badResponses.length, 0, `mobile bad responses: ${JSON.stringify(diagnostics.badResponses)}`);
  report.mobile = { home, shell, hud, diagnostics };
  await context.close();
}

async function landscapeAudit() {
  const page = await browser.newPage({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  const diagnostics = monitor(page);
  await page.goto(url, { waitUntil: 'networkidle' });
  await waitReady(page);
  await assertNoDocumentOverflow(page);
  await page.evaluate(() => window.NeonDominionQA.startWarLevel('awakening', { mode: 'conquest' }));
  await page.waitForSelector('#warBattlePanel:not([hidden])');
  const canvas = await dimensions(page, '#battlefield');
  assert.ok(canvas.width > 400 && canvas.height > 200);
  const viewportFit = await page.evaluate(() => ({ scroll: document.documentElement.scrollHeight, client: document.documentElement.clientHeight }));
  assert.ok(viewportFit.scroll <= viewportFit.client + 2, `landscape vertical overflow ${viewportFit.scroll}/${viewportFit.client}`);
  assert.equal(await page.locator('#warBattlePanel').evaluate((node) => node.classList.contains('collapsed')), true);
  await assertNoDocumentOverflow(page);
  await page.screenshot({ path: `${output}/full-audit-landscape-battle.png`, fullPage: true });
  assert.equal(diagnostics.errors.length, 0);
  assert.equal(diagnostics.badResponses.length, 0);
  report.landscape = { canvas, viewportFit, diagnostics };
  await page.close();
}

async function offlineAudit() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const diagnostics = monitor(page);
  await page.goto(url, { waitUntil: 'networkidle' });
  await waitReady(page);
  const controlled = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return false;
    await navigator.serviceWorker.ready;
    return Boolean(navigator.serviceWorker.controller);
  });
  if (!controlled) {
    await page.reload({ waitUntil: 'networkidle' });
    await waitReady(page);
  }
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#battlefield');
  assert.match(await page.title(), /NEON DOMINION/i);
  report.offline = { loaded: true, controlled: await page.evaluate(() => Boolean(navigator.serviceWorker?.controller)) };
  await context.setOffline(false);
  assert.equal(diagnostics.errors.length, 0);
  await context.close();
}

await desktopAudit();
await mobileAudit();
await landscapeAudit();
await offlineAudit();
await writeFile(`${output}/full-audit-report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
await browser.close();
