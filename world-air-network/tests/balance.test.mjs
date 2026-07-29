import test from 'node:test';
import assert from 'node:assert/strict';

import { CITY_CATALOG } from '../src/data.js';
import {
  addRoute,
  createInitialState,
  makeCityMap,
  openAirport,
  queueTotal,
  simulateMinutes
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

for (const seed of [7, 42, 314159, 20260730]) {
  test(`базовая сеть остаётся жизнеспособной 14 дней — seed ${seed}`, () => {
    const state = createInitialState(CITY_CATALOG);
    disableRandomEvents(state);

    simulateMinutes(state, CITY_CATALOG, 14 * 24 * 60, seededRandom(seed));

    assert.equal(state.gameOver, false, state.gameOverReason);
    assert.ok(state.money > -250_000, `Слишком глубокий дефицит: ${Math.round(state.money)} ₽`);
    assert.ok(state.reputation >= 45, `Репутация обрушилась до ${state.reputation.toFixed(1)}`);
    assert.ok(state.stats.passengersTotal >= 1_000, `Перевезено слишком мало: ${state.stats.passengersTotal}`);
    assert.ok(totalQueued(state) < 500, `Очередь вышла из-под контроля: ${totalQueued(state)}`);
  });
}

for (const seed of [11, 99, 2026]) {
  test(`первое расширение Москва — Минск выдерживает 7 дней — seed ${seed}`, () => {
    const state = createInitialState(CITY_CATALOG);
    disableRandomEvents(state);

    assert.equal(openAirport(state, cities.minsk).ok, true);
    assert.equal(addRoute(state, cities.moscow, cities.minsk).ok, true);

    simulateMinutes(state, CITY_CATALOG, 7 * 24 * 60, seededRandom(seed));

    assert.equal(state.gameOver, false, state.gameOverReason);
    assert.ok(state.money > -350_000, `Расширение создаёт чрезмерный дефицит: ${Math.round(state.money)} ₽`);
    assert.ok(state.stats.passengersTotal >= 500, `Расширенная сеть почти не перевозит пассажиров: ${state.stats.passengersTotal}`);
    assert.ok(state.routes.find((route) => route.id === 'minsk__moscow')?.flights > 20, 'Новый маршрут должен регулярно выполнять рейсы');
    assert.ok(totalQueued(state) < 700, `Очередь расширенной сети вышла из-под контроля: ${totalQueued(state)}`);
  });
}

test('случайные события не делают семидневный старт гарантированно проигрышным', () => {
  let survivals = 0;
  const outcomes = [];

  for (let seed = 1; seed <= 20; seed += 1) {
    const state = createInitialState(CITY_CATALOG);
    simulateMinutes(state, CITY_CATALOG, 7 * 24 * 60, seededRandom(seed));
    if (!state.gameOver) survivals += 1;
    outcomes.push(Math.round(state.money));
  }

  assert.ok(survivals >= 16, `Выжило только ${survivals} из 20 стартов; капиталы: ${outcomes.join(', ')}`);
});
