import { AIRPORT_LEVELS, OBJECTIVES, PLANE_LEVELS } from './data.js';

export const GAME_VERSION = 1;
export const MAP_WIDTH = 1200;
export const MAP_HEIGHT = 620;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const roundMoney = (value) => Math.round(value / 100) * 100;

export function projectCity(city) {
  return {
    x: ((city.lon + 180) / 360) * MAP_WIDTH,
    y: ((90 - city.lat) / 180) * MAP_HEIGHT
  };
}

export function haversineKm(a, b) {
  const radius = 6371;
  const toRad = (degrees) => (degrees * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  return radius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function routeId(a, b) {
  return [a, b].sort().join('__');
}

export function airportOpenCost(city) {
  const populationFactor = Math.sqrt(city.population) * 55;
  return roundMoney(70000 + populationFactor);
}

export function routeBuildCost(cityA, cityB) {
  const distance = haversineKm(cityA, cityB);
  return roundMoney(45000 + distance * 92 + Math.pow(distance, 1.08) * 9);
}

export function getAirportCapacity(state, cityId) {
  const airport = state.airports[cityId];
  if (!airport) return 0;
  const base = AIRPORT_LEVELS[airport.level].capacity;
  return Math.round(base * (state.techs.includes('smart-dispatch') ? 1.04 : 1));
}

export function getPlaneCapacity(state, route) {
  const base = PLANE_LEVELS[route.planeLevel].capacity;
  return Math.round(base * (state.techs.includes('smart-dispatch') ? 1.12 : 1));
}

export function getPlaneSpeed(state, route) {
  const base = PLANE_LEVELS[route.planeLevel].speed;
  return base * (state.techs.includes('fast-turnaround') ? 1.15 : 1);
}

export function queueTotal(state, cityId) {
  return (state.queues[cityId] ?? []).reduce((sum, group) => sum + group.count, 0);
}

export function createInitialState(cities) {
  const cityMap = Object.fromEntries(cities.map((city) => [city.id, city]));
  const initialAirportIds = ['moscow', 'spb', 'kazan'];
  const airports = {};
  const queues = {};

  for (const id of initialAirportIds) {
    airports[id] = { level: id === 'moscow' ? 1 : 0, overloadMinutes: 0 };
    queues[id] = [];
  }

  const initialRoutes = [
    createRoute(cityMap.moscow, cityMap.spb, 1),
    createRoute(cityMap.moscow, cityMap.kazan, 0)
  ];

  return {
    version: GAME_VERSION,
    companyName: 'AeroSphere',
    clock: 8 * 60,
    money: 780000,
    reputation: 82,
    research: 35,
    researchProgress: 0,
    airports,
    queues,
    routes: initialRoutes,
    techs: [],
    effects: [],
    objectivesClaimed: [],
    nextEventAt: 8 * 60 + 540,
    lastDemandHour: 8,
    gameOver: false,
    gameOverReason: '',
    stats: {
      passengersTotal: 0,
      passengersToday: 0,
      revenueToday: 0,
      costsToday: 0,
      flightsTotal: 0,
      dayIndex: 0
    },
    log: [
      makeLog(8 * 60, 'Компания создана', 'Открыты первые направления Москва — Санкт-Петербург и Москва — Казань.', 'good')
    ]
  };
}

export function createRoute(cityA, cityB, planeLevel = 0) {
  const distance = haversineKm(cityA, cityB);
  return {
    id: routeId(cityA.id, cityB.id),
    a: cityA.id,
    b: cityB.id,
    distance,
    planeLevel,
    progress: 0.15,
    direction: 0,
    disabledUntil: 0,
    flights: 0,
    passengers: 0
  };
}

export function makeCityMap(cities) {
  return Object.fromEntries(cities.map((city) => [city.id, city]));
}

export function getRoute(state, a, b) {
  const id = routeId(a, b);
  return state.routes.find((route) => route.id === id) ?? null;
}

export function shortestPath(state, cityMap, startId, destinationId, includeTemporarilyDisabled = false) {
  if (startId === destinationId) return [startId];
  if (!state.airports[startId] || !state.airports[destinationId]) return null;

  const distances = new Map([[startId, 0]]);
  const previous = new Map();
  const unvisited = new Set(Object.keys(state.airports));

  while (unvisited.size) {
    let current = null;
    let best = Infinity;
    for (const id of unvisited) {
      const value = distances.get(id) ?? Infinity;
      if (value < best) {
        best = value;
        current = id;
      }
    }

    if (current === null || best === Infinity) break;
    if (current === destinationId) break;
    unvisited.delete(current);

    for (const route of state.routes) {
      if (!includeTemporarilyDisabled && route.disabledUntil > state.clock) continue;
      let neighbor = null;
      if (route.a === current) neighbor = route.b;
      if (route.b === current) neighbor = route.a;
      if (!neighbor || !unvisited.has(neighbor)) continue;

      const congestion = 1 + Math.max(0, queueTotal(state, neighbor) / Math.max(1, getAirportCapacity(state, neighbor))) * 0.18;
      const candidate = best + route.distance * congestion;
      if (candidate < (distances.get(neighbor) ?? Infinity)) {
        distances.set(neighbor, candidate);
        previous.set(neighbor, current);
      }
    }
  }

  if (!previous.has(destinationId)) return null;
  const path = [destinationId];
  let cursor = destinationId;
  while (cursor !== startId) {
    cursor = previous.get(cursor);
    if (!cursor) return null;
    path.unshift(cursor);
  }
  return path;
}

export function openAirport(state, city) {
  if (state.gameOver) return failure('Игра завершена. Начните новую компанию.');
  if (state.airports[city.id]) return failure('Аэропорт уже открыт.');
  const cost = airportOpenCost(city);
  if (state.money < cost) return failure('Недостаточно средств для открытия аэропорта.');

  state.money -= cost;
  state.airports[city.id] = { level: 0, overloadMinutes: 0 };
  state.queues[city.id] = [];
  state.log.unshift(makeLog(state.clock, `Открыт аэропорт: ${city.name}`, `Инвестиции: ${Math.round(cost).toLocaleString('ru-RU')} ₽. Теперь подключите город к сети.`, 'good'));
  trimLog(state);
  return success(`Аэропорт ${city.name} открыт.`);
}

export function addRoute(state, cityA, cityB) {
  if (cityA.id === cityB.id) return failure('Выберите два разных города.');
  if (!state.airports[cityA.id] || !state.airports[cityB.id]) return failure('Сначала откройте аэропорты в обоих городах.');
  if (getRoute(state, cityA.id, cityB.id)) return failure('Маршрут уже существует.');
  const cost = routeBuildCost(cityA, cityB);
  if (state.money < cost) return failure('Недостаточно средств для строительства маршрута.');

  state.money -= cost;
  state.routes.push(createRoute(cityA, cityB));
  state.log.unshift(makeLog(state.clock, `Новый маршрут`, `${cityA.name} — ${cityB.name}, ${Math.round(haversineKm(cityA, cityB)).toLocaleString('ru-RU')} км.`, 'good'));
  trimLog(state);
  return success('Маршрут открыт.');
}

export function upgradeAirport(state, cityId) {
  const airport = state.airports[cityId];
  if (!airport) return failure('Аэропорт не открыт.');
  if (airport.level >= AIRPORT_LEVELS.length - 1) return failure('Аэропорт уже максимального уровня.');
  const next = AIRPORT_LEVELS[airport.level + 1];
  if (state.money < next.upgradeCost) return failure('Недостаточно средств для модернизации.');

  state.money -= next.upgradeCost;
  airport.level += 1;
  state.reputation = clamp(state.reputation + 0.8, 0, 100);
  state.log.unshift(makeLog(state.clock, 'Аэропорт модернизирован', `${AIRPORT_LEVELS[airport.level].name}: вместимость ${getAirportCapacity(state, cityId)}.`, 'good'));
  trimLog(state);
  return success('Аэропорт модернизирован.');
}

export function upgradeRoute(state, id) {
  const route = state.routes.find((item) => item.id === id);
  if (!route) return failure('Маршрут не найден.');
  if (route.planeLevel >= PLANE_LEVELS.length - 1) return failure('Самолёт уже максимального класса.');
  const next = PLANE_LEVELS[route.planeLevel + 1];
  if (state.money < next.upgradeCost) return failure('Недостаточно средств для нового самолёта.');

  state.money -= next.upgradeCost;
  route.planeLevel += 1;
  state.log.unshift(makeLog(state.clock, 'Обновление флота', `${PLANE_LEVELS[route.planeLevel].name}: ${getPlaneCapacity(state, route)} мест.`, 'good'));
  trimLog(state);
  return success('Самолёт на маршруте обновлён.');
}

export function buyResearch(state, item) {
  if (state.techs.includes(item.id)) return failure('Технология уже внедрена.');
  if (state.research < item.cost) return failure('Недостаточно очков исследований.');
  state.research -= item.cost;
  state.techs.push(item.id);
  state.log.unshift(makeLog(state.clock, `Исследование завершено`, `${item.title}: ${item.effect}.`, 'good'));
  trimLog(state);
  return success(`Внедрено: ${item.title}.`);
}

export function simulateMinutes(state, cities, minutes, rng = Math.random) {
  if (state.gameOver || minutes <= 0) return state;
  const cityMap = makeCityMap(cities);
  let remaining = minutes;

  while (remaining > 0 && !state.gameOver) {
    const step = Math.min(5, remaining);
    const previousClock = state.clock;
    state.clock += step;
    remaining -= step;

    resetDailyStatsIfNeeded(state, previousClock);
    expireEffects(state);
    generateDemandIfNeeded(state, cityMap, rng);
    advanceWaitingTime(state, step);
    advanceRoutes(state, cityMap, step);
    evaluateAirports(state, cityMap, step);
    triggerEventIfNeeded(state, cityMap, rng);
    evaluateObjectives(state, cityMap);

    if (state.money < -650000) {
      state.gameOver = true;
      state.gameOverReason = 'Компания превысила кредитный лимит.';
    }
  }

  if (state.gameOver) {
    state.log.unshift(makeLog(state.clock, 'Компания остановила работу', state.gameOverReason, 'bad'));
    trimLog(state);
  }
  return state;
}

function generateDemandIfNeeded(state, cityMap, rng) {
  const currentHour = Math.floor(state.clock / 60);
  while (state.lastDemandHour < currentHour) {
    state.lastDemandHour += 1;
    spawnHourlyDemand(state, cityMap, rng);
  }
}

function spawnHourlyDemand(state, cityMap, rng) {
  const openIds = Object.keys(state.airports);
  if (openIds.length < 2) return;
  const demandMultiplier = getEffectMultiplier(state, 'demand');

  for (const originId of openIds) {
    const origin = cityMap[originId];
    if (!origin) continue;
    const destinations = openIds.filter((id) => id !== originId);
    const destinationId = weightedDestination(destinations, cityMap, rng);
    const populationScore = Math.max(1, Math.log10(origin.population) - 4.7);
    const reputationFactor = 0.72 + state.reputation / 170;
    const count = clamp(Math.round((populationScore * 4.6 + rng() * 8) * demandMultiplier * reputationFactor), 2, 36);

    addQueueGroup(state, originId, destinationId, count, 0);
  }
}

function weightedDestination(ids, cityMap, rng) {
  const weights = ids.map((id) => Math.sqrt(cityMap[id]?.population ?? 1));
  const total = weights.reduce((sum, value) => sum + value, 0);
  let cursor = rng() * total;
  for (let i = 0; i < ids.length; i += 1) {
    cursor -= weights[i];
    if (cursor <= 0) return ids[i];
  }
  return ids[ids.length - 1];
}

function addQueueGroup(state, cityId, destination, count, waitingMinutes) {
  const queue = state.queues[cityId] ?? (state.queues[cityId] = []);
  const existing = queue.find((group) => group.destination === destination && Math.abs(group.waitingMinutes - waitingMinutes) < 45);
  if (existing) {
    existing.count += count;
    existing.waitingMinutes = Math.max(existing.waitingMinutes, waitingMinutes);
  } else {
    queue.push({ destination, count, waitingMinutes });
  }
}

function advanceWaitingTime(state, minutes) {
  for (const queue of Object.values(state.queues)) {
    for (const group of queue) group.waitingMinutes += minutes;
  }
}

function advanceRoutes(state, cityMap, minutes) {
  for (const route of state.routes) {
    if (route.disabledUntil > state.clock) continue;
    const tripMinutes = Math.max(38, (route.distance / getPlaneSpeed(state, route)) * 60 + 16);
    route.progress += minutes / tripMinutes;

    while (route.progress >= 1) {
      route.progress -= 1;
      const from = route.direction === 0 ? route.a : route.b;
      const to = route.direction === 0 ? route.b : route.a;
      dispatchFlight(state, cityMap, route, from, to);
      route.direction = route.direction === 0 ? 1 : 0;
    }
  }
}

function dispatchFlight(state, cityMap, route, from, to) {
  const capacity = getPlaneCapacity(state, route);
  let remainingSeats = capacity;
  let boarded = 0;
  let delivered = 0;
  let revenue = 0;
  const queue = state.queues[from] ?? [];
  queue.sort((a, b) => b.waitingMinutes - a.waitingMinutes);

  for (const group of queue) {
    if (remainingSeats <= 0 || group.count <= 0) continue;
    const path = shortestPath(state, cityMap, from, group.destination);
    if (!path || path[1] !== to) continue;

    const take = Math.min(group.count, remainingSeats);
    group.count -= take;
    remainingSeats -= take;
    boarded += take;

    if (group.destination === to) {
      delivered += take;
      const baseFare = 23 + route.distance * 0.46;
      const pricing = state.techs.includes('dynamic-pricing') ? 1.16 : 1;
      revenue += take * baseFare * pricing;
    } else {
      addQueueGroup(state, to, group.destination, take, Math.max(0, group.waitingMinutes - 20));
    }
  }

  state.queues[from] = queue.filter((group) => group.count > 0);
  const plane = PLANE_LEVELS[route.planeLevel];
  const fuelEffect = state.techs.includes('green-fuel') ? 0.82 : 1;
  const fuelMultiplier = getEffectMultiplier(state, 'fuel');
  const operatingCost = (route.distance * 5.9 + capacity * 34) * plane.efficiency * fuelEffect * fuelMultiplier;

  state.money += revenue - operatingCost;
  state.stats.revenueToday += revenue;
  state.stats.costsToday += operatingCost;
  state.stats.passengersToday += delivered;
  state.stats.passengersTotal += delivered;
  state.stats.flightsTotal += 1;
  state.researchProgress += delivered / 85;
  if (state.researchProgress >= 1) {
    const earned = Math.floor(state.researchProgress);
    state.research += earned;
    state.researchProgress -= earned;
  }

  route.flights += 1;
  route.passengers += delivered;
  const loadFactor = boarded / Math.max(1, capacity);
  state.reputation = clamp(state.reputation + (loadFactor > 0.72 ? 0.025 : -0.018), 0, 100);
}

function evaluateAirports(state, cityMap, minutes) {
  for (const [cityId, airport] of Object.entries(state.airports)) {
    const count = queueTotal(state, cityId);
    const capacity = getAirportCapacity(state, cityId);
    const ratio = count / Math.max(1, capacity);

    if (ratio > 1) {
      airport.overloadMinutes += minutes;
      state.reputation = clamp(state.reputation - (ratio - 1) * 0.012 * minutes, 0, 100);
      if (airport.overloadMinutes >= 360 && ratio >= 1.35) {
        state.gameOver = true;
        state.gameOverReason = `Аэропорт «${cityMap[cityId]?.name ?? cityId}» не справился с перегрузкой.`;
        return;
      }
    } else {
      airport.overloadMinutes = Math.max(0, airport.overloadMinutes - minutes * 1.8);
      if (ratio < 0.65) state.reputation = clamp(state.reputation + 0.0018 * minutes, 0, 100);
    }
  }
}

function triggerEventIfNeeded(state, cityMap, rng) {
  if (state.clock < state.nextEventAt) return;
  state.nextEventAt = state.clock + 420 + Math.floor(rng() * 360);
  const roll = rng();

  if (roll < 0.18) {
    const amount = 120000 + Math.floor(rng() * 180000);
    state.money += amount;
    state.log.unshift(makeLog(state.clock, 'Инвестиционный раунд', `Партнёры вложили ${amount.toLocaleString('ru-RU')} ₽ в развитие сети.`, 'good'));
  } else if (roll < 0.36) {
    state.effects.push({ id: `fuel-${state.clock}`, type: 'fuel', multiplier: 1.38, expiresAt: state.clock + 720 });
    state.log.unshift(makeLog(state.clock, 'Рост цен на топливо', 'Операционные расходы увеличены на 38% на 12 игровых часов.', 'bad'));
  } else if (roll < 0.54) {
    state.effects.push({ id: `tourism-${state.clock}`, type: 'demand', multiplier: 1.55, expiresAt: state.clock + 720 });
    state.log.unshift(makeLog(state.clock, 'Туристический сезон', 'Пассажиропоток вырос на 55% на 12 игровых часов.', 'warn'));
  } else if (roll < 0.72 && state.routes.length) {
    const route = state.routes[Math.floor(rng() * state.routes.length)];
    route.disabledUntil = state.clock + 300;
    state.log.unshift(makeLog(state.clock, 'Грозовой фронт', `Маршрут ${cityMap[route.a].name} — ${cityMap[route.b].name} закрыт на 5 игровых часов.`, 'bad'));
  } else if (roll < 0.87) {
    const bonus = 22 + Math.floor(rng() * 30);
    state.research += bonus;
    state.log.unshift(makeLog(state.clock, 'Инженерный прорыв', `Команда получила ${bonus} очков исследований.`, 'good'));
  } else {
    const penalty = 65000 + Math.floor(rng() * 85000);
    state.money -= penalty;
    state.reputation = clamp(state.reputation - 2.5, 0, 100);
    state.log.unshift(makeLog(state.clock, 'Внеплановая проверка', `Штраф и обслуживание обошлись в ${penalty.toLocaleString('ru-RU')} ₽.`, 'bad'));
  }
  trimLog(state);
}

function getEffectMultiplier(state, type) {
  return state.effects
    .filter((effect) => effect.type === type && effect.expiresAt > state.clock)
    .reduce((product, effect) => product * effect.multiplier, 1);
}

function expireEffects(state) {
  state.effects = state.effects.filter((effect) => effect.expiresAt > state.clock);
}

function resetDailyStatsIfNeeded(state, previousClock) {
  const previousDay = Math.floor(previousClock / 1440);
  const currentDay = Math.floor(state.clock / 1440);
  if (currentDay === previousDay) return;
  state.stats.dayIndex = currentDay;
  state.stats.passengersToday = 0;
  state.stats.revenueToday = 0;
  state.stats.costsToday = 0;
  state.log.unshift(makeLog(state.clock, `День ${currentDay + 1}`, 'Операционная статистика за сутки обновлена.', 'neutral'));
  trimLog(state);
}

function evaluateObjectives(state, cityMap) {
  const openIds = Object.keys(state.airports);
  const continents = new Set(openIds.map((id) => cityMap[id]?.continent).filter(Boolean));
  const completed = {
    'cities-6': openIds.length >= 6,
    'routes-8': state.routes.length >= 8,
    'continents-3': continents.size >= 3,
    'passengers-5000': state.stats.passengersTotal >= 5000,
    'reputation-92': state.reputation >= 92
  };

  for (const objective of OBJECTIVES) {
    if (!completed[objective.id] || state.objectivesClaimed.includes(objective.id)) continue;
    state.objectivesClaimed.push(objective.id);
    state.money += objective.reward;
    state.log.unshift(makeLog(state.clock, `Цель выполнена: ${objective.title}`, `Награда ${objective.reward.toLocaleString('ru-RU')} ₽.`, 'good'));
    trimLog(state);
  }
}

export function objectiveProgress(state, cityMap, objectiveId) {
  const openIds = Object.keys(state.airports);
  const continents = new Set(openIds.map((id) => cityMap[id]?.continent).filter(Boolean));
  const values = {
    'cities-6': [openIds.length, 6],
    'routes-8': [state.routes.length, 8],
    'continents-3': [continents.size, 3],
    'passengers-5000': [state.stats.passengersTotal, 5000],
    'reputation-92': [Math.floor(state.reputation), 92]
  };
  return values[objectiveId] ?? [0, 1];
}

export function networkHealth(state) {
  const airportIds = Object.keys(state.airports);
  if (!airportIds.length) return 0;
  const ratios = airportIds.map((id) => queueTotal(state, id) / Math.max(1, getAirportCapacity(state, id)));
  const average = ratios.reduce((sum, value) => sum + value, 0) / ratios.length;
  const worst = Math.max(...ratios);
  return clamp(Math.round(100 - average * 42 - Math.max(0, worst - 1) * 55), 0, 100);
}

export function sanitizeLoadedState(raw, cities) {
  if (!raw || raw.version !== GAME_VERSION || typeof raw.money !== 'number') return createInitialState(cities);
  const cityIds = new Set(cities.map((city) => city.id));
  const validAirports = Object.fromEntries(Object.entries(raw.airports ?? {}).filter(([id]) => cityIds.has(id)));
  if (!Object.keys(validAirports).length) return createInitialState(cities);
  raw.airports = validAirports;
  raw.queues = Object.fromEntries(Object.keys(validAirports).map((id) => [id, Array.isArray(raw.queues?.[id]) ? raw.queues[id] : []]));
  raw.routes = (raw.routes ?? []).filter((route) => validAirports[route.a] && validAirports[route.b]);
  raw.effects = Array.isArray(raw.effects) ? raw.effects : [];
  raw.techs = Array.isArray(raw.techs) ? raw.techs : [];
  raw.objectivesClaimed = Array.isArray(raw.objectivesClaimed) ? raw.objectivesClaimed : [];
  raw.log = Array.isArray(raw.log) ? raw.log : [];
  raw.gameOver = Boolean(raw.gameOver);
  return raw;
}

function makeLog(clock, title, body, tone = 'neutral') {
  return { id: `${clock}-${Math.random().toString(36).slice(2, 8)}`, clock, title, body, tone };
}

function trimLog(state) {
  state.log = state.log.slice(0, 30);
}

function success(message) {
  return { ok: true, message };
}

function failure(message) {
  return { ok: false, message };
}
