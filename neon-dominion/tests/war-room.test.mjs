import test from 'node:test';
import assert from 'node:assert/strict';
import { DominionEngine } from '../src/engine.js';
import { getMap } from '../src/maps.js';
import {
  BUILDINGS,
  FORMATIONS,
  WORLD_REGIONS,
  adaptiveDifficulty,
  createWarRoomState,
  generateDailyChallenge,
  generateSandboxMap,
  normalizeComposition,
  normalizeCustomMap,
  survivalWave,
  unlockWorldRegion,
  updateRecords,
  validateCustomMap,
} from '../src/war-room-core.js';

test('глобальная карта содержит связанную кампанию и открывает соседние регионы', () => {
  const initial = createWarRoomState(1_760_000_000_000).world;
  assert.deepEqual(initial.unlocked, ['origin']);
  const next = unlockWorldRegion(initial, 'origin');
  assert.ok(next.completed.includes('origin'));
  assert.ok(next.unlocked.includes('crossroads'));
  assert.equal(WORLD_REGIONS.length >= 10, true);
});

test('испытание дня детерминировано датой', () => {
  const now = Date.UTC(2026, 6, 30, 12);
  const first = generateDailyChallenge(now);
  const second = generateDailyChallenge(now + 10_000);
  assert.equal(first.id, second.id);
  assert.deepEqual(first.nodes, second.nodes);
  assert.ok(first.nodes.some((node) => node.owner === 'player'));
  assert.ok(first.nodes.some((node) => node.owner === 'red'));
});

test('песочница соблюдает количество объектов и противников', () => {
  const map = generateSandboxMap({ nodes: 17, enemies: 2, mode: 'hold' }, 42);
  assert.equal(map.nodes.length, 17);
  assert.equal(map.warMode, 'hold');
  assert.equal(map.nodes.filter((node) => ['red', 'violet'].includes(node.owner)).length, 2);
});

test('редактор валидирует карту и нормализует координаты', () => {
  const bad = validateCustomMap({ nodes: [{ id: 'x', owner: 'player', x: 1, y: 1 }] });
  assert.equal(bad.ok, false);
  const input = {
    title: 'Тест',
    nodes: [
      { id: 'p0', owner: 'player', type: 'core', x: -100, y: 900, troops: 50 },
      { id: 'n0', owner: 'neutral', type: 'relay', x: 600, y: 360, troops: 20 },
      { id: 'r0', owner: 'red', type: 'core', x: 1400, y: -30, troops: 70 },
    ],
  };
  const normalized = normalizeCustomMap(input);
  assert.equal(normalized.validation.ok, true);
  assert.equal(normalized.map.nodes[0].x, 40);
  assert.equal(normalized.map.nodes[0].y, 680);
  assert.equal(normalized.map.nodes[2].x, 1160);
  assert.equal(normalized.map.nodes[2].y, 40);
});

test('состав смешанной группы всегда нормализуется до 100 процентов', () => {
  const composition = normalizeComposition({ assault: 5, rapid: 3, heavy: 1, scout: 1 });
  assert.equal(Object.values(composition).reduce((sum, value) => sum + value, 0), 100);
  assert.ok(composition.assault > composition.heavy);
});

test('волны выживания усиливаются и каждая пятая является боссом', () => {
  const first = survivalWave(1);
  const fifth = survivalWave(5);
  const tenth = survivalWave(10);
  assert.ok(fifth.troops > first.troops);
  assert.equal(fifth.boss, true);
  assert.equal(tenth.boss, true);
  assert.ok(tenth.reward.shards > fifth.reward.shards);
});

test('адаптивная сложность реагирует на серию побед', () => {
  const low = adaptiveDifficulty({ wins: 1, battles: 10 }, [{ victory: false }]);
  const high = adaptiveDifficulty({ wins: 9, battles: 10 }, Array.from({ length: 5 }, () => ({ victory: true, time: 70 })));
  assert.ok(high > low);
  assert.ok(high <= 1.75);
});

test('локальные рекорды сохраняют лучшее время, территорию и достижения боя', () => {
  let records = updateRecords(createWarRoomState().records, { mapId: 'awakening', mode: 'hold', victory: true, time: 110, territory: .62, losses: 2, longestChain: 3, built: 2 });
  records = updateRecords(records, { mapId: 'awakening', mode: 'hold', victory: true, time: 85, territory: .71, losses: 0, longestChain: 5, built: 1, bossDefeated: true });
  const row = records.maps['hold:awakening'];
  assert.equal(row.bestTime, 85);
  assert.equal(row.maxTerritory, .71);
  assert.equal(row.minLosses, 0);
  assert.equal(records.flawlessWins, 1);
  assert.equal(records.bossesDefeated, 1);
  assert.equal(records.built, 3);
});

test('строительство создаёт новый объект и списывает энергию', () => {
  const engine = new DominionEngine(getMap('awakening'));
  engine.energy = 100;
  const before = Object.keys(engine.nodes).length;
  const node = engine.buildNode('outpost', 570, 100);
  assert.ok(node);
  assert.equal(Object.keys(engine.nodes).length, before + 1);
  assert.equal(node.type, 'outpost');
  assert.equal(engine.energy, 100 - BUILDINGS.outpost.cost);
  assert.equal(engine.stats.built, 1);
});

test('точки маршрута проводят колонну через свободную местность', () => {
  const engine = new DominionEngine(getMap('awakening'));
  const source = engine.nodes.p0;
  const sent = engine.sendWaypointRoute(['p0'], [{ x: 420, y: 100 }, { x: 700, y: 620 }], 'r0', { unitType: 'rapid', formation: 'column' });
  assert.equal(sent, 1);
  assert.equal(source.troops, 0);
  assert.equal(engine.convoys[0].route.length, 2);
  assert.equal(engine.convoys[0].formation, 'column');
  assert.ok(engine.convoys[0].speed > 150 * FORMATIONS.line.speed);
});

test('колонну можно перенаправить, вернуть и разделить', () => {
  const engine = new DominionEngine(getMap('awakening'));
  engine.send('p0', 'r0', 1, 'player');
  const convoy = engine.convoys[0];
  engine.update(.5);
  assert.equal(engine.retargetConvoy(convoy.id, 'p1'), true);
  assert.equal(convoy.to, 'p1');
  const split = engine.splitConvoy(convoy.id, 'p2', .5);
  assert.ok(split);
  assert.equal(engine.convoys.length, 2);
  assert.equal(engine.recallConvoy(convoy.id), true);
  assert.equal(convoy.to, 'p0');
  assert.equal(engine.stats.redirected >= 2, true);
  assert.equal(engine.stats.recalled, 1);
});

test('босс переходит между фазами вместо мгновенного захвата', () => {
  const engine = new DominionEngine(getMap('awakening'), { mode: 'boss' });
  const boss = engine.nodes.r0;
  boss.boss = 'coloss';
  boss.bossName = 'КОЛОСС';
  boss.bossPhase = 3;
  boss.bossMaxTroops = 80;
  boss.bossPhaseTroops = 60;
  boss.troops = 5;
  engine.nodes.p0.troops = 100;
  engine.send('p0', 'r0', 1, 'player', { unitType: 'heavy' });
  const convoy = engine.convoys[0];
  convoy.progress = 1;
  engine.update(.01);
  assert.equal(boss.owner, 'red');
  assert.equal(boss.bossPhase, 2);
  assert.equal(engine.result, null);
});

test('колонну можно остановить, запустить по патрулю и объединить с соседней', () => {
  const engine = new DominionEngine(getMap('awakening'));
  engine.nodes.p1.owner = 'player';
  engine.nodes.p1.troops = 35;
  engine.nodes.p1.x = 205;
  engine.nodes.p1.y = 370;
  engine.nodes.p2.owner = 'player';
  engine.send('p0', 'r0', .5, 'player');
  const first = engine.convoys[0];
  assert.equal(engine.toggleConvoyHold(first.id, true), true);
  const progress = first.progress;
  engine.update(.5);
  assert.equal(first.progress, progress);
  assert.equal(engine.toggleConvoyHold(first.id, false), false);

  engine.send('p1', 'r0', .5, 'player');
  const second = engine.convoys[1];
  assert.equal(engine.mergeConvoys([first.id, second.id]), true);
  assert.equal(engine.convoys.length, 1);

  assert.equal(engine.patrolConvoy(first.id, ['p1', 'p2']), true);
  engine.retargetConvoy(first.id, 'p1');
  first.progress = 1;
  engine.update(.01);
  assert.equal(first.to, 'p2');
  assert.equal(first.progress, 0);
});
