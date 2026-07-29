import test from 'node:test';
import assert from 'node:assert/strict';

import { CITY_CATALOG } from '../src/data.js';
import {
  addRoute,
  createInitialState,
  haversineKm,
  makeCityMap,
  openAirport,
  routeId,
  shortestPath,
  simulateMinutes
} from '../src/engine.js';

const cities = makeCityMap(CITY_CATALOG);

test('haversine distance is realistic for Moscow to Saint Petersburg', () => {
  const distance = haversineKm(cities.moscow, cities.spb);
  assert.ok(distance > 600 && distance < 700);
});

test('route id is stable regardless of direction', () => {
  assert.equal(routeId('moscow', 'spb'), routeId('spb', 'moscow'));
});

test('initial network supports a transfer between Saint Petersburg and Kazan', () => {
  const state = createInitialState(CITY_CATALOG);
  assert.deepEqual(shortestPath(state, cities, 'spb', 'kazan'), ['spb', 'moscow', 'kazan']);
});

test('airport opening and route construction mutate the network safely', () => {
  const state = createInitialState(CITY_CATALOG);
  state.money = 10_000_000;
  assert.equal(openAirport(state, cities.minsk).ok, true);
  assert.equal(addRoute(state, cities.moscow, cities.minsk).ok, true);
  assert.ok(state.airports.minsk);
  assert.ok(shortestPath(state, cities, 'spb', 'minsk'));
});

test('simulation advances time and generates passenger demand', () => {
  const state = createInitialState(CITY_CATALOG);
  const deterministic = () => 0.25;
  simulateMinutes(state, CITY_CATALOG, 180, deterministic);
  const queued = Object.values(state.queues).flat().reduce((sum, group) => sum + group.count, 0);
  assert.ok(state.clock >= 660);
  assert.ok(queued > 0 || state.stats.passengersTotal > 0);
});
