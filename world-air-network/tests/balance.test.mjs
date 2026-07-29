import test from 'node:test';
import assert from 'node:assert/strict';

import { CITY_CATALOG } from '../src/data.js';
import {
  addRoute,
  createInitialState,
  getAirportCapacity,
  makeCityMap,
  openAirport,
  queueTotal,
  simulateMinutes,
  upgradeAirport,
  upgradeRoute
} from '../src/engine.js';

const cities = makeCityMap(CITY_CATALOG);

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 0x1_0000_0000;
  };
}

function disableRandomEvents(state) {
  state.nextEventAt = Number.POSITIVE_INFINITY;
}

function totalQueued(state) {
  return Object.keys(state.airports).reduce((sum, cityId) => sum + queueTotal(state, cityId), 0);
}

function playWithBasicManager(state, hours, rng) {
  for (let hour = 0; hour < hours && !state.gameOver; hour += 1) {
    simulateMinutes(state, CITY_CATALOG, 60, rng);
    if (state.gameOver) break;

    const risks = Object.keys(state.airports)
      .map((cityId) => ({
        cityId,
        ratio: queueTotal(state, cityId) / Math.max(1, getAirportCapacity(state, cityId))
      }))
      .sort((a, b) => b.ratio - a.ratio);

    const highest = risks[0];
    if (!highest || highest.ratio < 0.55) continue;

    upgradeAirport(state, highest.cityId);

    const incidentRoutes = state.routes
      .filter((route) => route.a === highest.cityId || route.b === highest.cityId)
      .sort((a, b) => a.planeLevel - b.planeLevel);
    if (incidentRoutes[0]) upgradeRoute(state, incidentRoutes[0].id);
  }
  return state;
}

test('полностью неуправляемая сеть требует вмешательства до конца первой недели', () => {
  const state = createInitialState(CITY_CATALOG);
  disableRandomEvents(state);
  simulateMinutes(state, CITY_CATALOG, 7 * 24 * 60, seededRandom(42));

  assert.equal(state.gameOver, true);
  assert.match(state.gameOverReason, /перегрузк/iu);
  assert.ok(state.money > 0, 'Поражение должно быть связано с управлением очередью, а не скрытым банкротством');
});

for (const seed of [7, 42, 314159, 20260730]) {
  test(`игрок, реагирующий на предупреждения, удерживает базовую сеть 14 дней — seed ${seed}`, () => {
    const state = createInitialState(CITY_CATALOG);
    disableRandomEvents(state);

    playWithBasicManager(state, 14 * 24, seededRandom(seed));

    assert.equal(state.gameOver, false, state.gameOverReason);
    assert.ok(state.money > -250_000, `Слишком глубокий дефицит: ${Math.round(state.money)} ₽`);
    assert.ok(state.reputation >= 45, `Репутация обрушилась до ${state.reputation.toFixed(1)}`);
    assert.ok(state.stats.passengersTotal >= 1_000, `Перевезено слишком мало: ${state.stats.passengersTotal}`);
    assert.ok(totalQueued(state) < 700, `Очередь вышла из-под контроля: ${totalQueued(state)}`);
  });
}

for (const seed of [11, 99, 2026]) {
  test(`подготовленное расширение Москва — Минск выдерживает 10 дней — seed ${seed}`, () => {
    const state = createInitialState(CITY_CATALOG);
    disableRandomEvents(state);

    assert.equal(upgradeAirport(state, 'kazan').ok, true);
    assert.equal(upgradeRoute(state, 'kazan__moscow').ok, true);
    assert.equal(openAirport(state, cities.minsk).ok, true);
    assert.equal(addRoute(state, cities.moscow, cities.minsk).ok, true);

    playWithBasicManager(state, 10 * 24, seededRandom(seed));

    assert.equal(state.gameOver, false, state.gameOverReason);
    assert.ok(state.money > -350_000, `Расширение создаёт чрезмерный дефицит: ${Math.round(state.money)} ₽`);
    assert.ok(state.stats.passengersTotal >= 700, `Расширенная сеть почти не перевозит пассажиров: ${state.stats.passengersTotal}`);
    assert.ok(state.routes.find((route) => route.id === 'minsk__moscow')?.flights > 30, 'Новый маршрут должен регулярно выполнять рейсы');
    assert.ok(totalQueued(state) < 900, `Очередь расширенной сети вышла из-под контроля: ${totalQueued(state)}`);
  });
}

test('случайные события оставляют управляемую семидневную кампанию проходимой', () => {
  let survivals = 0;
  const outcomes = [];

  for (let seed = 1; seed <= 20; seed += 1) {
    const state = createInitialState(CITY_CATALOG);
    playWithBasicManager(state, 7 * 24, seededRandom(seed));
    if (!state.gameOver) survivals += 1;
    outcomes.push(Math.round(state.money));
  }

  assert.ok(survivals >= 18, `Выжило только ${survivals} из 20 управляемых стартов; капиталы: ${outcomes.join(', ')}`);
});
