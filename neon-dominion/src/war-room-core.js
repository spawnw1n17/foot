const DAY = 86_400_000;
const STORAGE_VERSION = 7;

export const MISSION_MODES = {
  conquest: { id: 'conquest', name: 'ЗАХВАТ', icon: '◆', description: 'Уничтожить все вражеские сети.' },
  hold: { id: 'hold', name: 'УДЕРЖАНИЕ', icon: '⬡', description: 'Удерживать ключевой сектор до окончания таймера.' },
  escort: { id: 'escort', name: 'СОПРОВОЖДЕНИЕ', icon: '➤', description: 'Провести мобильное ядро через последовательность узлов.' },
  defense: { id: 'defense', name: 'ОБОРОНА', icon: '◇', description: 'Пережить волны и сохранить командное ядро.' },
  boss: { id: 'boss', name: 'БОСС', icon: '⬢', description: 'Разрушить многофазный командный объект.' },
  energy: { id: 'energy', name: 'ЭНЕРГИЯ', icon: '⚡', description: 'Накопить требуемый резерв энергии и удержать реактор.' },
  survival: { id: 'survival', name: 'ВЫЖИВАНИЕ', icon: '∞', description: 'Отражать бесконечные волны и улучшать сеть.' },
  sandbox: { id: 'sandbox', name: 'ПЕСОЧНИЦА', icon: '▦', description: 'Настроить карту, противников и правила.' },
  daily: { id: 'daily', name: 'ИСПЫТАНИЕ ДНЯ', icon: '◎', description: 'Одинаковая для всех карта, построенная из даты.' },
  editor: { id: 'editor', name: 'РЕДАКТОР', icon: '✦', description: 'Создать и запустить собственную операцию.' },
};

export const WORLD_REGIONS = [
  { id: 'origin', name: 'Контур Истока', x: 10, y: 52, map: 'awakening', mode: 'conquest', reward: '300 кредитов', links: ['crossroads'] },
  { id: 'crossroads', name: 'Узел Перекрёстка', x: 23, y: 32, map: 'crossfire', mode: 'hold', reward: '12 осколков', links: ['trident', 'bastion'] },
  { id: 'trident', name: 'Трезубец Сети', x: 39, y: 18, map: 'trident', mode: 'escort', reward: 'Медаль «Проводник»', links: ['citadel'] },
  { id: 'bastion', name: 'Карминовый бастион', x: 39, y: 48, map: 'citadel', mode: 'defense', reward: 'Рамка бастиона', links: ['citadel', 'fracture'] },
  { id: 'citadel', name: 'Цитадель Колосса', x: 57, y: 25, map: 'citadel', mode: 'boss', boss: 'coloss', reward: '24 осколка', links: ['fracture', 'mirage'] },
  { id: 'fracture', name: 'Нестабильный разлом', x: 58, y: 58, map: 'fracture', mode: 'energy', reward: 'Титул «Стабилизатор»', links: ['mirage', 'swarm'] },
  { id: 'mirage', name: 'Туман Миража', x: 73, y: 18, map: 'dominion', mode: 'boss', boss: 'phantom', reward: 'Аватар Фантома', links: ['oracle'] },
  { id: 'swarm', name: 'Роевой сектор', x: 75, y: 52, map: 'crossfire', mode: 'boss', boss: 'swarm', reward: 'След «Рой»', links: ['oracle', 'dominion'] },
  { id: 'oracle', name: 'Протокол Оракула', x: 88, y: 28, map: 'trident', mode: 'boss', boss: 'oracle', reward: 'Тема Оракула', links: ['dominion'] },
  { id: 'dominion', name: 'Сердце Доминиона', x: 91, y: 62, map: 'dominion', mode: 'conquest', reward: 'Титул «Доминатор»', links: [] },
];

export const BOSSES = {
  coloss: { id: 'coloss', name: 'КОЛОСС', icon: '⬢', phases: 3, color: '#ff6f86', description: 'Подвижная цитадель меняет опорную точку после каждой фазы.', trait: 'relocate' },
  phantom: { id: 'phantom', name: 'ФАНТОМ', icon: '◈', phases: 3, color: '#a978ff', description: 'Исчезает из разведки и создаёт ложные сигнатуры.', trait: 'cloak' },
  swarm: { id: 'swarm', name: 'РОЙ', icon: '✣', phases: 4, color: '#ffb657', description: 'Порождает малые узлы и быстрые колонны.', trait: 'spawn' },
  oracle: { id: 'oracle', name: 'ОРАКУЛ', icon: '◎', phases: 3, color: '#72e7ff', description: 'Предугадывает маршруты и перестраивает приоритеты ИИ.', trait: 'predict' },
  parasite: { id: 'parasite', name: 'ПАРАЗИТ', icon: '⌁', phases: 3, color: '#61f0a2', description: 'Временно заражает захваченные базы и блокирует производство.', trait: 'infect' },
};

export const BUILDINGS = {
  outpost: { id: 'outpost', name: 'Аванпост', icon: '◆', cost: 28, troops: 12, description: 'Дешёвая передовая база с небольшим приростом.' },
  radar: { id: 'radar', name: 'Радар', icon: '◎', cost: 34, troops: 8, description: 'Открывает большую область тумана войны.' },
  turret: { id: 'turret', name: 'Турель', icon: '◇', cost: 42, troops: 10, description: 'Автоматически поражает вражеские колонны рядом.' },
  portal: { id: 'portal', name: 'Портал', icon: '◉', cost: 58, troops: 8, description: 'Ускоряет отправленные через него колонны.' },
  medbay: { id: 'medbay', name: 'Медицинский узел', icon: '+', cost: 46, troops: 10, description: 'Восстанавливает часть прибывающих союзных сил.' },
  command: { id: 'command', name: 'Командный центр', icon: '★', cost: 72, troops: 18, description: 'Усиливает производство соседних баз.' },
  shieldgen: { id: 'shieldgen', name: 'Генератор щита', icon: '⬡', cost: 64, troops: 14, description: 'Периодически создаёт защитный купол вокруг ближайших баз.' },
};

export const FORMATIONS = {
  wedge: { id: 'wedge', name: 'Клин', icon: '▲', attack: 1.18, defense: 0.9, speed: 1, description: 'Усиленный первый удар.' },
  line: { id: 'line', name: 'Линия', icon: '━', attack: 0.94, defense: 1.2, speed: 0.92, description: 'Защита от перехвата.' },
  column: { id: 'column', name: 'Колонна', icon: '║', attack: 0.92, defense: 0.88, speed: 1.24, description: 'Максимальная скорость.' },
  scatter: { id: 'scatter', name: 'Рассеивание', icon: '✣', attack: 0.86, defense: 1.08, speed: 1.04, description: 'Снижает урон импульсов и турелей.' },
  stealth: { id: 'stealth', name: 'Скрытность', icon: '◈', attack: 0.9, defense: 0.82, speed: 1.08, vision: 0.6, description: 'Колонну сложнее обнаружить.' },
};

export const AI_PERSONALITIES = {
  aggressive: { id: 'aggressive', name: 'АГРЕССОР', attackBias: 1.35, defenseBias: 0.75, interval: 0.82, color: '#ff5578' },
  defensive: { id: 'defensive', name: 'СТРАЖ', attackBias: 0.72, defenseBias: 1.45, interval: 1.14, color: '#ffb657' },
  economic: { id: 'economic', name: 'АРХИТЕКТОР', attackBias: 0.82, defenseBias: 1.05, interval: 1.18, color: '#58f2a5' },
  stealth: { id: 'stealth', name: 'МИРАЖ', attackBias: 1.05, defenseBias: 0.92, interval: 0.94, color: '#b46cff' },
  swarm: { id: 'swarm', name: 'РОЙ', attackBias: 1.12, defenseBias: 0.82, interval: 0.68, color: '#ff9e5c' },
  tactical: { id: 'tactical', name: 'ТАКТИК', attackBias: 1, defenseBias: 1, interval: 1, color: '#54f5ff' },
};

export const RANDOM_EVENTS = [
  { id: 'storm', name: 'Энергетическая буря', icon: '⚡', duration: 16, description: 'Скорость колонн снижена, энергия поступает быстрее.' },
  { id: 'blackout', name: 'Потеря связи', icon: '◌', duration: 13, description: 'Радиус разведки временно уменьшен.' },
  { id: 'overclock', name: 'Перегрузка фабрик', icon: '⚙', duration: 15, description: 'Производство всех баз ускорено.' },
  { id: 'uprising', name: 'Нейтральное восстание', icon: '◇', duration: 1, description: 'Один нейтральный сектор получает усиленный гарнизон.' },
  { id: 'satellite', name: 'Падение спутника', icon: '✦', duration: 1, description: 'Случайная вражеская база получает урон.' },
  { id: 'portal', name: 'Временный портал', icon: '◉', duration: 20, description: 'Колонны игрока ускоряются.' },
  { id: 'virus', name: 'Вирусное заражение', icon: '⌁', duration: 14, description: 'Одна база временно прекращает производство.' },
  { id: 'reinforcement', name: 'Подкрепление', icon: '➤', duration: 1, description: 'Слабейшая база игрока получает гарнизон.' },
  { id: 'reveal', name: 'Орбитальная разведка', icon: '◎', duration: 12, description: 'Туман войны полностью снят.' },
  { id: 'mutiny', name: 'Сбой протокола', icon: '×', duration: 1, description: 'Сильнейшая вражеская база теряет часть сил.' },
];

export const TITLES = [
  { id: 'recruit', name: 'Рекрут сети', metric: 'battles', target: 0 },
  { id: 'frontier', name: 'Хозяин территории', metric: 'captured', target: 40 },
  { id: 'chain', name: 'Мастер окружения', metric: 'chainedRoutes', target: 25 },
  { id: 'iron', name: 'Стальной фронт', metric: 'wins', target: 20 },
  { id: 'survivor', name: 'Последний рубеж', metric: 'survivalWave', target: 10 },
  { id: 'speed', name: 'Молниеносный удар', metric: 'speedWins', target: 5 },
  { id: 'dominator', name: 'Доминатор', metric: 'worldRegions', target: WORLD_REGIONS.length },
];

export const MEDALS = [
  { id: 'first-blood', name: 'Первый контур', icon: 'Ⅰ', description: 'Победить в первой операции.', metric: 'wins', target: 1 },
  { id: 'flawless', name: 'Без единой потери', icon: '◇', description: 'Победить, не потеряв баз.', metric: 'flawlessWins', target: 1 },
  { id: 'territory', name: 'Повелитель сети', icon: '◆', description: 'Захватить 250 баз.', metric: 'captured', target: 250 },
  { id: 'interceptor', name: 'Небесный заслон', icon: '✣', description: 'Перехватить 100 колонн.', metric: 'intercepts', target: 100 },
  { id: 'architect', name: 'Архитектор войны', icon: '⬡', description: 'Построить 50 объектов.', metric: 'built', target: 50 },
  { id: 'boss-hunter', name: 'Охотник на ядра', icon: '⬢', description: 'Победить трёх боссов.', metric: 'bossesDefeated', target: 3 },
  { id: 'cartographer', name: 'Картограф', icon: '▦', description: 'Создать пять карт.', metric: 'mapsCreated', target: 5 },
  { id: 'eternal', name: 'Вечный рубеж', icon: '∞', description: 'Достичь 20-й волны выживания.', metric: 'survivalWave', target: 20 },
];

export const SHOP_BUNDLES = [
  { id: 'black-gold', name: 'ЧЁРНОЕ ЗОЛОТО', items: ['theme-royal', 'base-gold', 'trail-gold', 'frame-gold'], discount: 18, accent: '#f6c95f' },
  { id: 'arctic', name: 'АРКТИЧЕСКИЙ КОРПУС', items: ['theme-arctic', 'base-arctic', 'trail-ice', 'avatar-oracle'], discount: 15, accent: '#b9efff' },
  { id: 'carmine', name: 'КАРМИНОВЫЙ ФРОНТ', items: ['base-carmine', 'trail-fire', 'frame-red'], discount: 12, accent: '#ff5578' },
  { id: 'void', name: 'ПРОТОКОЛ ПУСТОТЫ', items: ['theme-oled', 'trail-glitch', 'frame-void', 'avatar-zero'], discount: 20, accent: '#a78dff' },
];

const clone = (value) => JSON.parse(JSON.stringify(value));
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function hashSeed(value) {
  let result = 2166136261;
  for (const character of String(value)) result = Math.imul(result ^ character.charCodeAt(0), 16777619);
  return result >>> 0;
}

export function seededRandom(seed) {
  let current = seed >>> 0;
  return () => {
    current |= 0;
    current = current + 0x6D2B79F5 | 0;
    let value = Math.imul(current ^ current >>> 15, 1 | current);
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

export function dateKey(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

export function createWarRoomState(now = Date.now()) {
  return {
    version: STORAGE_VERSION,
    createdAt: now,
    faction: 'specter',
    emblem: '◆',
    motto: 'Сеть подчиняется воле командира',
    profileBackground: 'grid',
    title: 'recruit',
    showcase: [],
    world: { completed: [], unlocked: ['origin'], selected: 'origin' },
    records: { maps: {}, survivalWave: 0, survivalScore: 0, daily: {}, speedWins: 0, flawlessWins: 0, bossesDefeated: 0, built: 0, redirected: 0, recalled: 0, mapsCreated: 0, worldRegions: 0 },
    medals: {},
    seasonHistory: [],
    createdMaps: [],
    battle: { formation: 'wedge', composition: { assault: 50, rapid: 20, heavy: 20, scout: 10 }, randomEvents: true, adaptiveAi: true },
    sandbox: { enemies: 2, nodes: 13, difficulty: 1, production: 1, fog: true, events: true, mode: 'conquest' },
    audio: { music: true, voice: false, intensity: 0.45 },
    daily: { key: dateKey(now), played: false, best: null },
  };
}

export function normalizeWarRoomState(input, now = Date.now()) {
  const base = createWarRoomState(now);
  if (!input || typeof input !== 'object') return base;
  const state = {
    ...base,
    ...clone(input),
    world: { ...base.world, ...(input.world || {}) },
    records: { ...base.records, ...(input.records || {}) },
    battle: { ...base.battle, ...(input.battle || {}), composition: { ...base.battle.composition, ...(input.battle?.composition || {}) } },
    sandbox: { ...base.sandbox, ...(input.sandbox || {}) },
    audio: { ...base.audio, ...(input.audio || {}) },
    daily: { ...base.daily, ...(input.daily || {}) },
  };
  state.version = STORAGE_VERSION;
  state.world.completed = [...new Set(state.world.completed || [])].filter((id) => WORLD_REGIONS.some((region) => region.id === id));
  state.world.unlocked = [...new Set(['origin', ...(state.world.unlocked || [])])].filter((id) => WORLD_REGIONS.some((region) => region.id === id));
  state.showcase = [...new Set(state.showcase || [])].slice(0, 3);
  state.createdMaps = Array.isArray(state.createdMaps) ? state.createdMaps.slice(0, 30) : [];
  if (state.daily.key !== dateKey(now)) state.daily = { key: dateKey(now), played: false, best: null };
  state.sandbox.enemies = clamp(Number(state.sandbox.enemies) || 2, 1, 2);
  state.sandbox.nodes = clamp(Number(state.sandbox.nodes) || 13, 7, 20);
  state.sandbox.difficulty = clamp(Number(state.sandbox.difficulty) || 1, 0.55, 2.2);
  state.sandbox.production = clamp(Number(state.sandbox.production) || 1, 0.5, 2.5);
  return state;
}

export function generateDailyChallenge(now = Date.now()) {
  const key = dateKey(now);
  const random = seededRandom(hashSeed(key));
  const modes = ['conquest', 'hold', 'escort', 'defense', 'energy'];
  const mode = modes[Math.floor(random() * modes.length)];
  const nodeCount = 9 + Math.floor(random() * 7);
  const nodes = [];
  nodes.push({ id: 'p0', x: 110 + random() * 90, y: 280 + random() * 160, type: 'core', owner: 'player', troops: 52, level: 1 });
  for (let index = 1; index < nodeCount - 2; index += 1) {
    const ownerRoll = random();
    nodes.push({
      id: `d${index}`,
      x: 210 + random() * 760,
      y: 80 + random() * 560,
      type: ['relay', 'factory', 'fortress', 'reactor'][Math.floor(random() * 4)],
      owner: ownerRoll > 0.75 ? 'red' : ownerRoll > 0.6 ? 'violet' : 'neutral',
      troops: 15 + Math.floor(random() * 42),
      level: 1,
    });
  }
  nodes.push({ id: 'r0', x: 1050, y: 170 + random() * 170, type: 'core', owner: 'red', troops: 58 + Math.floor(random() * 24), level: 1 });
  nodes.push({ id: 'v0', x: 1040, y: 430 + random() * 150, type: 'core', owner: 'violet', troops: 58 + Math.floor(random() * 24), level: 1 });
  return {
    id: `daily-${key}`,
    order: 7,
    title: `Испытание ${key.slice(5).replace('-', '.')}`,
    subtitle: MISSION_MODES[mode].name,
    difficulty: 'ЕЖЕДНЕВНО',
    description: `Процедурная операция дня. Режим: ${MISSION_MODES[mode].name}.`,
    parTime: 150 + Math.floor(random() * 80),
    objectives: [MISSION_MODES[mode].description, 'Установить лучший результат дня', 'Получить дополнительную награду за 3 звезды'],
    nodes,
    links: [],
    warMode: mode,
    dailyKey: key,
    seed: hashSeed(key),
  };
}

export function generateSandboxMap(config = {}, seed = Date.now()) {
  const settings = { ...createWarRoomState().sandbox, ...config };
  const random = seededRandom(hashSeed(seed));
  const nodes = [{ id: 'p0', x: 110, y: 360, type: 'core', owner: 'player', troops: 68, level: 1 }];
  const types = ['relay', 'factory', 'fortress', 'reactor'];
  const count = clamp(Number(settings.nodes) || 13, 7, 20);
  for (let index = 1; index < count - settings.enemies; index += 1) {
    nodes.push({
      id: `s${index}`,
      x: 180 + random() * 760,
      y: 70 + random() * 580,
      type: types[Math.floor(random() * types.length)],
      owner: random() > 0.82 ? 'player' : 'neutral',
      troops: 12 + Math.floor(random() * 42),
      level: 1,
    });
  }
  nodes.push({ id: 'r0', x: 1060, y: settings.enemies === 1 ? 360 : 210, type: 'core', owner: 'red', troops: 62, level: 1 });
  if (settings.enemies > 1) nodes.push({ id: 'v0', x: 1060, y: 520, type: 'core', owner: 'violet', troops: 62, level: 1 });
  return {
    id: `sandbox-${hashSeed(seed)}`,
    order: 7,
    title: 'Песочница',
    subtitle: MISSION_MODES[settings.mode]?.name || 'СВОБОДНАЯ ИГРА',
    difficulty: `×${Number(settings.difficulty).toFixed(1)}`,
    description: 'Пользовательская операция с настраиваемыми правилами.',
    parTime: 9999,
    objectives: [MISSION_MODES[settings.mode]?.description || 'Свободная игра', `${count} объектов`, `Производство ×${Number(settings.production).toFixed(1)}`],
    nodes,
    links: [],
    warMode: settings.mode,
    sandbox: settings,
    seed: hashSeed(seed),
  };
}

export function generateSurvivalMap(seed = Date.now()) {
  const map = generateSandboxMap({ enemies: 2, nodes: 11, difficulty: 1.1, mode: 'survival' }, seed);
  map.id = `survival-${hashSeed(seed)}`;
  map.title = 'Бесконечный рубеж';
  map.subtitle = 'ВЫЖИВАНИЕ';
  map.description = 'Удерживайте ядро. Каждая волна усиливает врага и открывает выбор улучшения.';
  map.objectives = ['Пережить как можно больше волн', 'Боссы появляются каждые 5 волн', 'Рекорд сохраняется локально'];
  map.warMode = 'survival';
  return map;
}

export function survivalWave(wave) {
  const number = Math.max(1, Number(wave) || 1);
  return {
    wave: number,
    troops: Math.round(14 + number * 4.7 + Math.pow(number, 1.18)),
    interval: Math.max(2.1, 6.2 - number * 0.12),
    boss: number % 5 === 0,
    reward: { credits: 45 + number * 12, shards: number % 5 === 0 ? 4 + Math.floor(number / 5) : 0 },
  };
}

export function chooseRandomEvent(seed, excluded = []) {
  const pool = RANDOM_EVENTS.filter((event) => !excluded.includes(event.id));
  if (!pool.length) return null;
  const random = seededRandom(hashSeed(seed));
  return clone(pool[Math.floor(random() * pool.length)]);
}

export function adaptiveDifficulty(meta = {}, recent = []) {
  const wins = Number(meta.wins || 0);
  const battles = Math.max(1, Number(meta.battles || 0));
  const winrate = wins / battles;
  const recentWins = recent.slice(0, 5).filter((item) => item.victory).length / Math.max(1, Math.min(5, recent.length));
  const speed = recent.filter((item) => item.victory && item.time && item.time < 100).length;
  return clamp(0.72 + winrate * 0.52 + recentWins * 0.34 + speed * 0.035, 0.65, 1.75);
}

export function mapRecordKey(mapId, mode = 'conquest') {
  return `${mode}:${mapId}`;
}

export function updateRecords(records, result) {
  const next = { ...records, maps: { ...(records.maps || {}) } };
  const key = mapRecordKey(result.mapId, result.mode);
  const current = next.maps[key] || {};
  next.maps[key] = {
    plays: (current.plays || 0) + 1,
    wins: (current.wins || 0) + (result.victory ? 1 : 0),
    bestTime: result.victory && result.time > 0 ? (!current.bestTime || result.time < current.bestTime ? result.time : current.bestTime) : current.bestTime || null,
    maxTerritory: Math.max(current.maxTerritory || 0, result.territory || 0),
    minLosses: result.victory ? Math.min(current.minLosses ?? Infinity, result.losses ?? Infinity) : current.minLosses ?? null,
    maxChain: Math.max(current.maxChain || 0, result.longestChain || 0),
  };
  if (result.victory && result.time > 0 && result.time < 90) next.speedWins = (next.speedWins || 0) + 1;
  if (result.victory && (result.losses || 0) === 0) next.flawlessWins = (next.flawlessWins || 0) + 1;
  next.built = (next.built || 0) + (result.built || 0);
  next.redirected = (next.redirected || 0) + (result.redirected || 0);
  next.recalled = (next.recalled || 0) + (result.recalled || 0);
  next.bossesDefeated = (next.bossesDefeated || 0) + (result.bossDefeated ? 1 : 0);
  next.survivalWave = Math.max(next.survivalWave || 0, result.survivalWave || 0);
  next.survivalScore = Math.max(next.survivalScore || 0, result.survivalScore || 0);
  return next;
}

export function unlockWorldRegion(world, regionId) {
  const next = { ...world, completed: [...new Set([...(world.completed || []), regionId])], unlocked: [...new Set(world.unlocked || [])] };
  const region = WORLD_REGIONS.find((item) => item.id === regionId);
  for (const id of region?.links || []) if (!next.unlocked.includes(id)) next.unlocked.push(id);
  next.selected = region?.links?.find((id) => next.unlocked.includes(id) && !next.completed.includes(id)) || regionId;
  return next;
}

export function calculateUnlockedMedals(records = {}, metaStats = {}) {
  const metrics = { ...metaStats, ...records };
  return Object.fromEntries(MEDALS.map((medal) => [medal.id, (metrics[medal.metric] || 0) >= medal.target]));
}

export function availableTitles(records = {}, metaStats = {}) {
  const metrics = { ...metaStats, ...records };
  return TITLES.filter((title) => (metrics[title.metric] || 0) >= title.target);
}

export function shopRotation(now = Date.now(), catalog = []) {
  if (!catalog.length) return [];
  const key = Math.floor(now / DAY);
  const random = seededRandom(hashSeed(`shop-${key}`));
  const pool = [...catalog];
  const output = [];
  while (pool.length && output.length < 8) output.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
  return output;
}

export function normalizeComposition(input = {}) {
  const values = ['assault', 'rapid', 'heavy', 'scout'].map((key) => Math.max(0, Number(input[key]) || 0));
  const total = values.reduce((sum, value) => sum + value, 0) || 1;
  const normalized = {};
  ['assault', 'rapid', 'heavy', 'scout'].forEach((key, index) => { normalized[key] = Math.round(values[index] / total * 100); });
  const difference = 100 - Object.values(normalized).reduce((sum, value) => sum + value, 0);
  normalized.assault += difference;
  return normalized;
}

export function validateCustomMap(input) {
  const errors = [];
  if (!input || typeof input !== 'object') return { ok: false, errors: ['Файл карты не является объектом'] };
  if (!Array.isArray(input.nodes) || input.nodes.length < 3) errors.push('Нужно минимум три объекта');
  const ids = new Set();
  let player = 0;
  let enemies = 0;
  for (const node of input.nodes || []) {
    if (!node.id || ids.has(node.id)) errors.push('ID объектов должны быть уникальными');
    ids.add(node.id);
    if (!Number.isFinite(Number(node.x)) || !Number.isFinite(Number(node.y))) errors.push(`Координаты ${node.id || '?'} некорректны`);
    if (node.owner === 'player') player += 1;
    if (node.owner === 'red' || node.owner === 'violet') enemies += 1;
  }
  if (!player) errors.push('Нужна хотя бы одна база игрока');
  if (!enemies) errors.push('Нужна хотя бы одна вражеская база');
  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}

export function normalizeCustomMap(input) {
  const validation = validateCustomMap(input);
  if (!validation.ok) return { validation, map: null };
  const map = {
    id: input.id || `custom-${hashSeed(JSON.stringify(input.nodes))}`,
    order: 7,
    title: String(input.title || 'Пользовательская операция').slice(0, 48),
    subtitle: String(input.subtitle || 'РЕДАКТОР').slice(0, 32),
    difficulty: String(input.difficulty || 'АВТОРСКАЯ').slice(0, 20),
    description: String(input.description || 'Карта создана в редакторе WAR ROOM.').slice(0, 240),
    parTime: clamp(Number(input.parTime) || 180, 30, 9999),
    objectives: Array.isArray(input.objectives) && input.objectives.length ? input.objectives.slice(0, 4).map(String) : ['Выполнить условие операции'],
    nodes: input.nodes.map((node, index) => ({
      id: String(node.id || `u${index}`).slice(0, 20),
      x: clamp(Number(node.x), 40, 1160),
      y: clamp(Number(node.y), 40, 680),
      type: String(node.type || 'relay'),
      owner: String(node.owner || 'neutral'),
      troops: clamp(Number(node.troops) || 18, 0, 300),
      level: clamp(Number(node.level) || 1, 1, 3),
    })),
    links: Array.isArray(input.links) ? input.links.filter((link) => Array.isArray(link) && idsExist(link, input.nodes)) : [],
    warMode: MISSION_MODES[input.warMode] ? input.warMode : 'conquest',
    custom: true,
  };
  return { validation, map };
}

function idsExist(link, nodes) {
  const ids = new Set(nodes.map((node) => node.id));
  return link.length >= 2 && ids.has(link[0]) && ids.has(link[1]);
}

export function exportWarRoomState(state) {
  return JSON.stringify({ product: 'NEON DOMINION WAR ROOM', exportedAt: new Date().toISOString(), state: normalizeWarRoomState(state) }, null, 2);
}

export function importWarRoomState(text) {
  try {
    const parsed = JSON.parse(text);
    return { ok: true, state: normalizeWarRoomState(parsed.state || parsed) };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}
