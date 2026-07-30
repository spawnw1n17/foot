import test from 'node:test';
import assert from 'node:assert/strict';
import { MAPS } from '../src/maps.js';
import { DominionEngine, UNIT_TYPES } from '../src/engine.js';

test('территория распределяется между фракциями', () => {
  const engine = new DominionEngine(MAPS[1], { seed: 10 });
  const territory = engine.territorySnapshot();
  const total = Object.values(territory).reduce((sum, value) => sum + value, 0);
  assert.ok(Math.abs(total - 1) < 0.0001);
  assert.ok(territory.player > 0);
  assert.ok(territory.red > 0);
  assert.ok(territory.violet > 0);
});

test('модернизация базы расходует энергию и меняет параметры', () => {
  const engine = new DominionEngine(MAPS[1], { seed: 11 });
  engine.energy = 100;
  const beforeCapacity = engine.capacity(engine.nodes.p0);
  assert.equal(engine.upgradeNode('p0', 'industry'), true);
  assert.equal(engine.nodes.p0.upgrades.industry, 1);
  assert.ok(engine.capacity(engine.nodes.p0) > beforeCapacity);
  assert.ok(engine.energy < 100);
});

test('разные классы войск имеют разные скорости и силу', () => {
  const engine = new DominionEngine(MAPS[1], { seed: 12 });
  engine.nodes.p0.troops = 60;
  engine.nodes.p1.troops = 60;
  assert.ok(engine.send('p0', 'r0', 1, 'player', { unitType: 'rapid' }));
  assert.ok(engine.send('p1', 'r0', 1, 'player', { unitType: 'heavy' }));
  const rapid = engine.convoys.find((item) => item.unitType === 'rapid');
  const heavy = engine.convoys.find((item) => item.unitType === 'heavy');
  assert.ok(rapid.speed > heavy.speed);
  assert.ok(heavy.attack > rapid.attack);
  assert.deepEqual(Object.keys(UNIT_TYPES), ['assault', 'rapid', 'heavy', 'scout']);
});

test('цепной маршрут сохраняется в колонне и отправляет весь гарнизон', () => {
  const engine = new DominionEngine(MAPS[1], { seed: 13 });
  const before = engine.nodes.p0.troops;
  const sent = engine.sendRoute(['p0', 'p1'], ['r0', 'v0'], 'heavy');
  assert.equal(sent, 2);
  assert.equal(engine.nodes.p0.troops, 0);
  assert.equal(engine.nodes.p1.troops, 0);
  assert.equal(engine.convoys[0].to, 'r0');
  assert.deepEqual(engine.convoys[0].route, ['v0']);
  assert.equal(engine.convoys[0].unitType, 'heavy');
  assert.equal(engine.convoys.find((item) => item.from === 'p0').amount, before);
  assert.equal(engine.stats.chainedRoutes, 1);
});

test('дальний противник скрыт туманом войны', () => {
  const engine = new DominionEngine(MAPS[1], { seed: 14 });
  assert.equal(engine.isVisible('r0'), false);
  assert.equal(engine.isVisible('m0'), true);
  engine.nodes.p0.upgrades.recon = 3;
  assert.ok(engine.visionRadius(engine.nodes.p0) > 250);
});

test('встречные колонны перехватывают друг друга', () => {
  const engine = new DominionEngine(MAPS[0], { seed: 15 });
  engine.nodes.p0.troops = 90;
  engine.nodes.r0.troops = 90;
  assert.ok(engine.send('p0', 'r0', 1, 'player', { unitType: 'rapid' }));
  assert.ok(engine.send('r0', 'p0', 1, 'red', { unitType: 'heavy' }));
  for (let index = 0; index < 700 && engine.stats.intercepts === 0; index += 1) engine.update(0.016);
  assert.ok(engine.stats.intercepts > 0);
  assert.ok(engine.effects.some((effect) => effect.type === 'intercept') || engine.events.some((event) => event.text.includes('Перехват')));
});
