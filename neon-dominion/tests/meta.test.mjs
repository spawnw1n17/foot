import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDefaultMeta,
  normalizeMeta,
  levelFromXp,
  rankForLevel,
  calculateBattleRewards,
  applyBattleProgress,
  purchase,
  purchaseCommander,
  CATALOG,
  COMMANDERS,
  SEASON_REWARDS,
} from '../src/meta.js';

test('новый локальный профиль содержит валюту, экипировку и задания', () => {
  const profile = createDefaultMeta(1_760_000_000_000);
  assert.equal(profile.credits, 1500);
  assert.equal(profile.shards, 12);
  assert.equal(profile.commander, 'vector');
  assert.ok(profile.owned.includes('base-default'));
  assert.equal(profile.daily.tasks.length, 3);
  assert.equal(profile.weekly.tasks.length, 3);
  assert.match(profile.localId, /^ND-/);
});

test('уровень и звание растут от общего опыта', () => {
  const level = levelFromXp(1200);
  assert.ok(level.level >= 5);
  assert.ok(rankForLevel(level.level).name !== 'Рекрут');
  assert.ok(level.current < level.next);
});

test('победа начисляет кредиты, опыт, сезонный опыт и статистику', () => {
  const profile = createDefaultMeta(1_760_000_000_000);
  const result = applyBattleProgress(profile, {
    victory: true,
    stars: 3,
    totalStars: 6,
    order: 4,
    mapId: 'citadel',
    time: 82,
    stats: { captured: 7, sent: 480, intercepts: 2, upgrades: 3, abilities: 1, groupOrders: 2, chainedRoutes: 1 },
  });
  assert.equal(result.state.stats.battles, 1);
  assert.equal(result.state.stats.wins, 1);
  assert.equal(result.state.stats.captured, 7);
  assert.ok(result.state.credits > profile.credits);
  assert.ok(result.state.totalXp > 0);
  assert.ok(result.state.season.xp > 0);
  assert.ok(result.reward.shards > 0);
});

test('магазин списывает валюту, выдаёт и экипирует предмет', () => {
  const profile = createDefaultMeta(1_760_000_000_000);
  const item = CATALOG.find((entry) => entry.id === 'base-obsidian');
  const result = purchase(profile, item.id);
  assert.equal(result.ok, true);
  assert.equal(result.state.credits, profile.credits - item.price);
  assert.ok(result.state.owned.includes(item.id));
  assert.equal(result.state.equipped.base, item.id);
  assert.equal(purchase(result.state, item.id).reason, 'owned');
});

test('магазин отклоняет покупку при нехватке валюты', () => {
  const profile = createDefaultMeta(1_760_000_000_000);
  profile.shards = 0;
  const result = purchase(profile, 'base-gold');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'funds');
});

test('командир приобретается и назначается', () => {
  const profile = createDefaultMeta(1_760_000_000_000);
  const commander = COMMANDERS.find((entry) => entry.id === 'nexus');
  const result = purchaseCommander(profile, commander.id);
  assert.equal(result.ok, true);
  assert.equal(result.state.commander, commander.id);
  assert.ok(result.state.ownedCommanders.includes(commander.id));
  assert.equal(result.state.credits, profile.credits - commander.price);
});

test('нормализация сохраняет старый профиль и добавляет новые поля', () => {
  const normalized = normalizeMeta({ name: 'Москва', credits: 777, stats: { wins: 5 }, owned: ['base-gold'] }, 1_760_000_000_000);
  assert.equal(normalized.name, 'Москва');
  assert.equal(normalized.credits, 777);
  assert.equal(normalized.stats.wins, 5);
  assert.ok(normalized.owned.includes('base-default'));
  assert.ok(normalized.owned.includes('base-gold'));
  assert.ok(normalized.season.id);
});

test('каталог и сезон содержат полноценный набор контента', () => {
  assert.ok(CATALOG.length >= 25);
  assert.equal(SEASON_REWARDS.length, 20);
  assert.equal(COMMANDERS.length, 4);
  assert.ok(new Set(CATALOG.map((item) => item.id)).size === CATALOG.length);
});

test('награда зависит от результата, сложности и скорости', () => {
  const win = calculateBattleRewards({ victory: true, stars: 3, order: 6, time: 70 });
  const loss = calculateBattleRewards({ victory: false, stars: 0, order: 6, time: 200 });
  assert.ok(win.credits > loss.credits);
  assert.ok(win.xp > loss.xp);
  assert.ok(win.shards > 0);
});
