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
  return { x: box.x + (box.width - 1200 * scale) / 2 + x * scale, y: box.y + (box.height - 720 * scale) / 2 + y * scale };
}

async function desktopScenario() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  await page.addInitScript(() => {
    window.__qaLongTasks = [];
    try { new PerformanceObserver((list) => window.__qaLongTasks.push(...list.getEntries().map((entry) => entry.duration))).observe({ entryTypes: ['longtask'] }); } catch {}
  });
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.NeonDominionQA?.getMeta);

  const initial = await page.evaluate(() => window.NeonDominionQA.resetMeta());
  assert.equal(initial.credits, 1500);
  assert.equal(initial.commander, 'vector');
  assert.equal(await page.locator('#playerProfileBtn').count(), 1);

  await page.evaluate(() => window.NeonDominionQA.openMeta('profile'));
  await page.locator('#profileNameInput').fill('Москва');
  await page.locator('[data-meta-action="save-name"]').click();
  await page.waitForFunction(() => window.NeonDominionQA.getMeta().name === 'Москва');

  await page.evaluate(() => window.NeonDominionQA.openMeta('shop'));
  assert.ok(await page.locator('.shop-card').count() >= 25);
  await page.evaluate(() => window.NeonDominionQA.buyMeta('base-obsidian'));
  await page.waitForFunction(() => window.NeonDominionQA.getMeta().equipped.base === 'base-obsidian');

  await page.evaluate(() => {
    const battle = { victory: true, stars: 3, totalStars: 9, order: 6, mapId: 'dominion', time: 70, stats: { captured: 12, sent: 800, intercepts: 4, upgrades: 5, abilities: 2, groupOrders: 2, chainedRoutes: 3 } };
    window.NeonDominionQA.completeMetaBattle(battle);
    window.NeonDominionQA.completeMetaBattle(battle);
    window.NeonDominionQA.chooseCommander('nexus');
  });
  await page.waitForFunction(() => window.NeonDominionQA.getMeta().commander === 'nexus');
  const metaBeforeBattle = await page.evaluate(() => window.NeonDominionQA.getMeta());
  assert.ok(metaBeforeBattle.level.level > 1);
  assert.ok(metaBeforeBattle.stats.wins >= 2);
  assert.ok(metaBeforeBattle.owned.includes('base-obsidian'));

  await page.evaluate(() => { window.NeonDominionQA.closeMeta(); window.NeonDominionQA.startLevel('crossfire'); });
  await page.waitForFunction(() => window.NeonDominionQA?.getTerritory()?.territory?.player > 0);
  await page.waitForFunction(() => window.NeonDominionQA.assetsReady());
  assert.equal(await page.locator('#territoryConsole').count(), 1);
  assert.equal(await page.locator('#miniMap').count(), 1);
  const commanderStart = await page.evaluate(() => ({ energy: window.NeonDominionQA.getState().energy, industry: window.NeonDominionQA.getState().nodes.find((node) => node.id === 'p0').upgrades.industry }));
  assert.ok(commanderStart.energy >= 62);
  assert.ok(commanderStart.industry >= 1);

  await page.evaluate(() => { window.NeonDominionQA.getEngine().energy = 100; });
  await page.locator('[data-upgrade="industry"]').click();
  await page.locator('[data-unit="rapid"]').click();
  const box = await page.locator('#battlefield').boundingBox();
  const source = mapPoint(box, 165, 360);
  const remoteEnemy = mapPoint(box, 1020, 190);
  await page.mouse.move(source.x, source.y);
  await page.mouse.down();
  await page.mouse.move(remoteEnemy.x, remoteEnemy.y, { steps: 30 });
  await page.mouse.up();
  await page.waitForFunction(() => window.NeonDominionQA.getState().convoys.some((convoy) => convoy.from === 'p0' && convoy.to === 'r0'));

  const state = await page.evaluate(() => window.NeonDominionQA.getState());
  const territory = await page.evaluate(() => window.NeonDominionQA.getTerritory());
  const performanceData = await page.evaluate(() => ({ longTasks: window.__qaLongTasks || [] }));
  assert.equal(state.convoys.find((convoy) => convoy.from === 'p0').unitType, 'rapid');
  assert.ok(Object.values(territory.territory).reduce((sum, value) => sum + value, 0) > 0.99);
  assert.equal(errors.length, 0);
  assert.ok(performanceData.longTasks.filter((duration) => duration > 180).length <= 1);
  report.desktop = {
    profile: { name: metaBeforeBattle.name, level: metaBeforeBattle.level.level, rank: metaBeforeBattle.rank.name, credits: metaBeforeBattle.credits, shards: metaBeforeBattle.shards },
    store: { catalogCards: await page.locator('.shop-card').count(), equippedBase: metaBeforeBattle.equipped.base, commander: metaBeforeBattle.commander },
    commanderStart,
    territory: territory.territory,
    unit: territory.unitType,
    longTasks: performanceData.longTasks,
    errors,
  };
  await page.screenshot({ path: `${output}/desktop-arsenal-battle.png`, fullPage: true });
  await page.evaluate(() => window.NeonDominionQA.openMeta('profile'));
  await page.screenshot({ path: `${output}/desktop-player-profile.png`, fullPage: true });
  await page.close();
}

async function mobileScenario() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.NeonDominionQA?.getMeta);
  await page.evaluate(() => { window.NeonDominionQA.resetMeta(); window.NeonDominionQA.openMeta('shop'); });
  const arsenalDimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth, shell: document.querySelector('.arsenal-shell').getBoundingClientRect().toJSON() }));
  assert.ok(arsenalDimensions.scroll <= arsenalDimensions.client + 1);
  assert.equal(await page.locator('.arsenal-nav [data-meta-tab]').count(), 7);
  await page.locator('[data-meta-tab="missions"]').click();
  assert.equal(await page.locator('.mission-card').count(), 6);
  await page.locator('[data-meta-tab="season"]').click();
  assert.equal(await page.locator('.season-node').count(), 20);
  await page.screenshot({ path: `${output}/mobile-arsenal-season.png`, fullPage: true });

  await page.evaluate(() => { window.NeonDominionQA.closeMeta(); window.NeonDominionQA.startLevel('crossfire'); window.NeonDominionQA.setUnit('heavy'); });
  await page.waitForFunction(() => window.NeonDominionQA.getState()?.nodes?.length >= 10);
  const box = await page.locator('#battlefield').boundingBox();
  const p0 = mapPoint(box, 165, 360);
  const p1 = mapPoint(box, 320, 170);
  const r0 = mapPoint(box, 1020, 190);
  const v0 = mapPoint(box, 1020, 530);
  const client = await context.newCDPSession(page);
  const point = (position) => ({ x: position.x, y: position.y, radiusX: 8, radiusY: 8, force: 1, id: 1 });
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(p0)] });
  for (const [from, to, steps] of [[p0, p1, 12], [p1, r0, 20], [r0, v0, 14]]) {
    for (let step = 1; step <= steps; step += 1) {
      const t = step / steps;
      await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t })] });
    }
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForFunction(() => window.NeonDominionQA.getState().convoys.filter((convoy) => convoy.owner === 'player').length >= 2);
  const state = await page.evaluate(() => window.NeonDominionQA.getState());
  const dimensions = await page.evaluate(() => { const rect = document.querySelector('#battlefield').getBoundingClientRect(); return { scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth, canvas: { width: rect.width, height: rect.height } }; });
  const routed = state.convoys.filter((convoy) => convoy.owner === 'player');
  assert.ok(routed.length >= 2);
  assert.ok(routed.every((convoy) => [convoy.to, ...convoy.route].includes('v0')));
  assert.ok(routed.every((convoy) => convoy.unitType === 'heavy'));
  assert.ok(state.nodes.find((node) => node.id === 'p0').troops < 3);
  assert.ok(state.nodes.find((node) => node.id === 'p1').troops < 3);
  assert.ok(dimensions.scroll <= dimensions.client + 1);
  assert.equal(errors.length, 0);
  report.mobile = {
    arsenal: { width: `${arsenalDimensions.scroll}/${arsenalDimensions.client}`, navItems: 7, missions: 6, seasonLevels: 20 },
    battle: { width: `${dimensions.scroll}/${dimensions.client}`, canvas: dimensions.canvas, routes: routed.map((convoy) => convoy.route), unit: routed[0].unitType },
    errors,
  };
  await page.screenshot({ path: `${output}/mobile-arsenal-battle.png`, fullPage: true });
  await context.close();
}

await desktopScenario();
await mobileScenario();
await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
await browser.close();
