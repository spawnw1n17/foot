import test from 'node:test';
import assert from 'node:assert/strict';
import { MAPS } from '../src/maps.js';
import { DominionEngine } from '../src/engine.js';

test('кампания содержит шесть уникальных операций', () => {
  assert.equal(MAPS.length, 6);
  assert.equal(new Set(MAPS.map((map) => map.id)).size, 6);
  for (const map of MAPS) assert.ok(map.nodes.length >= 7);
});

test('армия отправляется между любыми двумя базами без секторных связей', () => {
  const engine = new DominionEngine(MAPS[0], { seed: 1 });
  const before = engine.nodes.p0.troops;
  assert.equal(engine.connected('p0', 'r0'), true);
  assert.equal(engine.send('p0', 'r0', 0.5), true);
  assert.ok(engine.nodes.p0.troops < before);
  assert.equal(engine.convoys[0].to, 'r0');
  assert.ok(Number.isFinite(engine.convoys[0].curve));
});

test('групповой приказ полностью опустошает базы и после отправки начинается новый набор', () => {
  const engine = new DominionEngine(MAPS[1], { seed: 7 });
  const p0 = engine.nodes.p0.troops;
  const p1 = engine.nodes.p1.troops;
  const sent = engine.sendMany(['p0', 'p1'], 'r0', 0.5, 'player');
  assert.equal(sent, 2);
  assert.equal(engine.convoys.length, 2);
  assert.equal(engine.nodes.p0.troops, 0);
  assert.equal(engine.nodes.p1.troops, 0);
  assert.equal(engine.convoys.find((convoy) => convoy.from === 'p0').amount, p0);
  assert.equal(engine.convoys.find((convoy) => convoy.from === 'p1').amount, p1);
  assert.equal(engine.stats.groupOrders, 1);
  engine.update(0.05);
  assert.ok(engine.nodes.p0.troops > 0);
  assert.ok(engine.nodes.p1.troops > 0);
});

test('нейтральную базу можно захватить свободным маршрутом', () => {
  const engine = new DominionEngine(MAPS[0], { seed: 2 });
  engine.nodes.p0.troops = 100;
  engine.nodes.c0.troops = 1;
  assert.ok(engine.send('p0', 'c0', 0.8));
  for (let index = 0; index < 500; index += 1) engine.update(0.02);
  assert.equal(engine.nodes.c0.owner, 'player');
});

test('способности списывают энергию и меняют состояние', () => {
  const engine = new DominionEngine(MAPS[0], { seed: 3 });
  engine.energy = 100;
  assert.ok(engine.useAbility('shield', 'p0'));
  assert.equal(Math.round(engine.energy), 65);
  assert.ok(engine.nodes.p0.shieldUntil > 0);
  engine.energy = 100;
  assert.ok(engine.useAbility('overdrive'));
  assert.ok(engine.boostUntil > 0);
});

test('длительная свободная симуляция остаётся численно стабильной', () => {
  for (const map of MAPS) {
    const engine = new DominionEngine(map, { seed: 11, difficulty: 1 });
    for (let index = 0; index < 20000 && !engine.result; index += 1) engine.update(0.016);
    for (const node of Object.values(engine.nodes)) {
      assert.ok(Number.isFinite(node.troops));
      assert.ok(node.troops >= 0);
    }
    for (const convoy of engine.convoys) {
      assert.ok(Number.isFinite(convoy.progress));
      assert.ok(Number.isFinite(convoy.curve));
    }
    assert.ok(Number.isFinite(engine.energy));
  }
});
