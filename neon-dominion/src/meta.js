import { SHOP_BUNDLES } from './war-room-core.js';
const STORAGE_KEY = 'neon-dominion-arsenal-v1';
const DAY = 86_400_000;

export const RANKS = [
  { level: 1, name: 'Рекрут', icon: 'Ⅰ' },
  { level: 3, name: 'Оператор', icon: 'Ⅱ' },
  { level: 6, name: 'Тактик', icon: 'Ⅲ' },
  { level: 10, name: 'Стратег', icon: 'Ⅳ' },
  { level: 15, name: 'Маршал', icon: 'Ⅴ' },
  { level: 22, name: 'Архонт', icon: 'Ⅵ' },
  { level: 30, name: 'Доминатор', icon: 'Ⅶ' },
];

export const AVATARS = [
  { id: 'specter', name: 'Спектр', glyph: '◆' },
  { id: 'vanguard', name: 'Авангард', glyph: '▲' },
  { id: 'nexus', name: 'Нексус', glyph: '⬡' },
  { id: 'mirage', name: 'Мираж', glyph: '◈' },
  { id: 'oracle', name: 'Оракул', glyph: '◎' },
  { id: 'warden', name: 'Страж', glyph: '⬢' },
  { id: 'nova', name: 'Нова', glyph: '✦' },
  { id: 'zero', name: 'Зеро', glyph: 'Ø' },
];

export const COMMANDERS = [
  { id: 'vector', name: 'Маршал Вектор', role: 'Логистика', glyph: '➤', price: 0, currency: 'credits', description: 'Все стартовые базы получают +1 уровень логистики.' },
  { id: 'nexus', name: 'Архитектор Нексус', role: 'Производство', glyph: '⬡', price: 1200, currency: 'credits', description: '+20 энергии и +1 уровень производства на стартовых базах.' },
  { id: 'carmine', name: 'Штурмовик Кармин', role: 'Первый удар', glyph: '◆', price: 28, currency: 'shards', description: '+10 сил каждой стартовой базе, но −5 репутации.' },
  { id: 'mirage', name: 'Оператор Мираж', role: 'Разведка', glyph: '◈', price: 40, currency: 'shards', description: '+1 уровень разведки и +10 стартовой энергии.' },
];

export const CATALOG = [
  { id: 'base-default', type: 'base', name: 'Протокол Спектр', rarity: 'БАЗОВЫЙ', price: 0, currency: 'credits', preview: '#54f5ff', description: 'Штатный бирюзовый корпус.' },
  { id: 'base-obsidian', type: 'base', name: 'Чёрный обсидиан', rarity: 'РЕДКИЙ', price: 850, currency: 'credits', preview: '#10131d', accent: '#9caeff', description: 'Глубокий чёрный металл и холодное сияние.' },
  { id: 'base-gold', type: 'base', name: 'Золотой протокол', rarity: 'ЛЕГЕНДАРНЫЙ', price: 46, currency: 'shards', preview: '#f8c85b', accent: '#fff0a1', description: 'Золотые кольца и премиальный импульс.' },
  { id: 'base-arctic', type: 'base', name: 'Арктический корпус', rarity: 'ЭПИЧЕСКИЙ', price: 24, currency: 'shards', preview: '#d8f6ff', accent: '#6bd8ff', description: 'Ледяное покрытие и белые контуры.' },
  { id: 'base-carmine', type: 'base', name: 'Карминовый бастион', rarity: 'РЕДКИЙ', price: 980, currency: 'credits', preview: '#ff5578', accent: '#ffb2c0', description: 'Агрессивная красная броня.' },
  { id: 'base-violet', type: 'base', name: 'Векторный кристалл', rarity: 'РЕДКИЙ', price: 980, currency: 'credits', preview: '#b46cff', accent: '#e4c4ff', description: 'Фиолетовые кристаллические ребра.' },
  { id: 'base-military', type: 'base', name: 'Тактический бункер', rarity: 'ЭПИЧЕСКИЙ', price: 1700, currency: 'credits', preview: '#6f8f75', accent: '#b8d59d', description: 'Матовая броня военного терминала.' },
  { id: 'base-bio', type: 'base', name: 'Биомеханика', rarity: 'ЛЕГЕНДАРНЫЙ', price: 55, currency: 'shards', preview: '#5ef09b', accent: '#d0ffe2', description: 'Живой энергетический контур.' },

  { id: 'trail-cyan', type: 'trail', name: 'Чистый импульс', rarity: 'БАЗОВЫЙ', price: 0, currency: 'credits', preview: '#54f5ff', description: 'Стандартный неоновый след.' },
  { id: 'trail-plasma', type: 'trail', name: 'Плазменный тоннель', rarity: 'РЕДКИЙ', price: 700, currency: 'credits', preview: '#7cf6ff', accent: '#ffffff', description: 'Двойной световой канал.' },
  { id: 'trail-fire', type: 'trail', name: 'Огненный фронт', rarity: 'ЭПИЧЕСКИЙ', price: 20, currency: 'shards', preview: '#ff784f', accent: '#ffd06b', description: 'Горячий шлейф штурмовых колонн.' },
  { id: 'trail-ice', type: 'trail', name: 'Крио-след', rarity: 'РЕДКИЙ', price: 820, currency: 'credits', preview: '#b9efff', accent: '#ffffff', description: 'Холодные кристаллы на маршруте.' },
  { id: 'trail-gold', type: 'trail', name: 'Золотая линия', rarity: 'ЛЕГЕНДАРНЫЙ', price: 38, currency: 'shards', preview: '#ffd76a', accent: '#fff4bd', description: 'Премиальный след командования.' },
  { id: 'trail-glitch', type: 'trail', name: 'Цифровой разлом', rarity: 'ЭПИЧЕСКИЙ', price: 1450, currency: 'credits', preview: '#d85cff', accent: '#54f5ff', description: 'Разорванный глитч-эффект.' },

  { id: 'theme-neon', type: 'theme', name: 'Глубокий неон', rarity: 'БАЗОВЫЙ', price: 0, currency: 'credits', preview: '#07101f', accent: '#54f5ff', description: 'Оригинальная тема Dominion.' },
  { id: 'theme-royal', type: 'theme', name: 'Чёрное золото', rarity: 'ЛЕГЕНДАРНЫЙ', price: 44, currency: 'shards', preview: '#090805', accent: '#f6c95f', description: 'Чёрно-золотой премиальный интерфейс.' },
  { id: 'theme-terminal', type: 'theme', name: 'Военный терминал', rarity: 'РЕДКИЙ', price: 950, currency: 'credits', preview: '#061009', accent: '#76f28d', description: 'Тактическая зелёная консоль.' },
  { id: 'theme-arctic', type: 'theme', name: 'Арктика', rarity: 'ЭПИЧЕСКИЙ', price: 1550, currency: 'credits', preview: '#07131c', accent: '#b9efff', description: 'Холодный бело-синий интерфейс.' },
  { id: 'theme-retro', type: 'theme', name: 'Ретровейв', rarity: 'ЭПИЧЕСКИЙ', price: 25, currency: 'shards', preview: '#16091e', accent: '#ff5bd6', description: 'Фиолетово-розовый синтвейв.' },
  { id: 'theme-oled', type: 'theme', name: 'OLED Zero', rarity: 'РЕДКИЙ', price: 1100, currency: 'credits', preview: '#000000', accent: '#e8f2ff', description: 'Абсолютно чёрный минимализм.' },

  { id: 'frame-cyan', type: 'frame', name: 'Контур Спектра', rarity: 'БАЗОВЫЙ', price: 0, currency: 'credits', preview: '#54f5ff', description: 'Стартовая рамка профиля.' },
  { id: 'frame-red', type: 'frame', name: 'Карминовый ранг', rarity: 'РЕДКИЙ', price: 620, currency: 'credits', preview: '#ff5578', description: 'Рамка ударной фракции.' },
  { id: 'frame-violet', type: 'frame', name: 'Векторный ранг', rarity: 'РЕДКИЙ', price: 620, currency: 'credits', preview: '#b46cff', description: 'Рамка аналитической сети.' },
  { id: 'frame-gold', type: 'frame', name: 'Маршальский знак', rarity: 'ЛЕГЕНДАРНЫЙ', price: 32, currency: 'shards', preview: '#f6c95f', description: 'Золотой ранг командования.' },
  { id: 'frame-void', type: 'frame', name: 'Граница пустоты', rarity: 'ЭПИЧЕСКИЙ', price: 1300, currency: 'credits', preview: '#7d8dff', description: 'Многослойный тёмный контур.' },

  { id: 'avatar-nova', type: 'avatar', name: 'Аватар Нова', rarity: 'РЕДКИЙ', price: 500, currency: 'credits', preview: '#f9efff', avatar: 'nova', description: 'Знак сверхновой.' },
  { id: 'avatar-warden', type: 'avatar', name: 'Аватар Страж', rarity: 'РЕДКИЙ', price: 500, currency: 'credits', preview: '#b8d59d', avatar: 'warden', description: 'Знак крепости.' },
  { id: 'avatar-oracle', type: 'avatar', name: 'Аватар Оракул', rarity: 'ЭПИЧЕСКИЙ', price: 18, currency: 'shards', preview: '#b9efff', avatar: 'oracle', description: 'Знак разведывательной сети.' },
  { id: 'avatar-zero', type: 'avatar', name: 'Аватар Зеро', rarity: 'ЛЕГЕНДАРНЫЙ', price: 35, currency: 'shards', preview: '#ffffff', avatar: 'zero', description: 'Скрытый оператор нулевого уровня.' },
];

export const ACHIEVEMENTS = [
  { id: 'first-win', name: 'Первое доминирование', description: 'Одержать первую победу', metric: 'wins', target: 1, reward: { credits: 300 } },
  { id: 'veteran', name: 'Ветеран сети', description: 'Завершить 25 операций', metric: 'battles', target: 25, reward: { shards: 12 } },
  { id: 'conqueror', name: 'Захватчик', description: 'Захватить 100 баз', metric: 'captured', target: 100, reward: { credits: 900 } },
  { id: 'architect', name: 'Архитектор', description: 'Выполнить 30 модернизаций', metric: 'upgrades', target: 30, reward: { credits: 750 } },
  { id: 'interceptor', name: 'Перехватчик', description: 'Уничтожить 30 колонн в пути', metric: 'intercepts', target: 30, reward: { shards: 18 } },
  { id: 'chain-master', name: 'Мастер цепей', description: 'Отдать 20 цепных приказов', metric: 'chainedRoutes', target: 20, reward: { shards: 20 } },
  { id: 'general', name: 'Командующий', description: 'Отправить 10 000 сил', metric: 'sent', target: 10_000, reward: { credits: 1500 } },
  { id: 'perfect', name: 'Безупречная операция', description: 'Получить 18 звёзд кампании', metric: 'stars', target: 18, reward: { shards: 30 } },
];

const DAILY_POOL = [
  { id: 'd-win', name: 'Победный протокол', description: 'Одержите победу', metric: 'wins', target: 1, reward: { credits: 220, xp: 60 } },
  { id: 'd-capture', name: 'Расширение сети', description: 'Захватите 8 баз', metric: 'captured', target: 8, reward: { credits: 180, xp: 55 } },
  { id: 'd-send', name: 'Мобилизация', description: 'Отправьте 350 сил', metric: 'sent', target: 350, reward: { credits: 170, xp: 50 } },
  { id: 'd-upgrade', name: 'Модернизация', description: 'Улучшите базы 3 раза', metric: 'upgrades', target: 3, reward: { credits: 190, xp: 55 } },
  { id: 'd-chain', name: 'Цепная реакция', description: 'Создайте 2 цепных маршрута', metric: 'chainedRoutes', target: 2, reward: { shards: 3, xp: 70 } },
  { id: 'd-intercept', name: 'Встречный бой', description: 'Выполните 3 перехвата', metric: 'intercepts', target: 3, reward: { shards: 3, xp: 70 } },
];

const WEEKLY_POOL = [
  { id: 'w-wins', name: 'Серия доминирования', description: 'Одержите 7 побед', metric: 'wins', target: 7, reward: { credits: 900, shards: 8, xp: 260 } },
  { id: 'w-capture', name: 'Контроль карты', description: 'Захватите 60 баз', metric: 'captured', target: 60, reward: { credits: 1000, xp: 280 } },
  { id: 'w-chain', name: 'Стратегическая сеть', description: 'Создайте 12 цепных маршрутов', metric: 'chainedRoutes', target: 12, reward: { shards: 12, xp: 320 } },
  { id: 'w-upgrade', name: 'Промышленный рывок', description: 'Выполните 25 модернизаций', metric: 'upgrades', target: 25, reward: { credits: 850, shards: 6, xp: 270 } },
];

export const SEASON_REWARDS = Array.from({ length: 20 }, (_, index) => {
  const level = index + 1;
  if (level === 5) return { level, type: 'item', item: 'frame-red', label: 'Карминовая рамка' };
  if (level === 10) return { level, type: 'item', item: 'trail-ice', label: 'Крио-след' };
  if (level === 15) return { level, type: 'item', item: 'base-violet', label: 'Векторный кристалл' };
  if (level === 20) return { level, type: 'item', item: 'theme-royal', label: 'Чёрное золото' };
  return level % 4 === 0
    ? { level, type: 'shards', amount: 5 + Math.floor(level / 4), label: `${5 + Math.floor(level / 4)} осколков` }
    : { level, type: 'credits', amount: 180 + level * 25, label: `${180 + level * 25} кредитов` };
});

const clone = (value) => JSON.parse(JSON.stringify(value));
const dateKey = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);
const weekKey = (now = Date.now()) => {
  const date = new Date(now);
  const first = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date - first) / DAY) + first.getUTCDay() + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
};

export function xpForLevel(level) {
  return 140 + Math.max(0, level - 1) * 55;
}

export function levelFromXp(totalXp) {
  let level = 1;
  let remaining = Math.max(0, totalXp || 0);
  while (remaining >= xpForLevel(level) && level < 60) {
    remaining -= xpForLevel(level);
    level += 1;
  }
  return { level, current: remaining, next: xpForLevel(level) };
}

export function rankForLevel(level) {
  return [...RANKS].reverse().find((rank) => level >= rank.level) || RANKS[0];
}

function taskSet(pool, seed, count) {
  const start = Math.abs(seed) % pool.length;
  return Array.from({ length: count }, (_, index) => ({ ...clone(pool[(start + index * 2) % pool.length]), progress: 0, claimed: false }));
}

export function createDefaultMeta(now = Date.now()) {
  const daySeed = Math.floor(now / DAY);
  return {
    version: 1,
    createdAt: now,
    localId: `ND-${now.toString(36).toUpperCase().slice(-6)}-${Math.floor(Math.random() * 9999).toString().padStart(4, '0')}`,
    name: 'Оператор Спектра',
    totalXp: 0,
    credits: 1500,
    shards: 12,
    neon: 0,
    commander: 'vector',
    ownedCommanders: ['vector'],
    owned: ['base-default', 'trail-cyan', 'theme-neon', 'frame-cyan'],
    equipped: { base: 'base-default', trail: 'trail-cyan', theme: 'theme-neon', frame: 'frame-cyan', avatar: 'specter' },
    stats: { battles: 0, wins: 0, losses: 0, captured: 0, sent: 0, intercepts: 0, upgrades: 0, abilities: 0, groupOrders: 0, chainedRoutes: 0, totalTime: 0, bestTime: 0, stars: 0, longestChain: 0 },
    daily: { key: dateKey(now), tasks: taskSet(DAILY_POOL, daySeed, 3) },
    weekly: { key: weekKey(now), tasks: taskSet(WEEKLY_POOL, daySeed + 11, 3) },
    achievements: {},
    season: { id: 'S1-ARSENAL', xp: 0, claimed: [] },
    history: [],
  };
}

export function normalizeMeta(raw, now = Date.now()) {
  const base = createDefaultMeta(now);
  const state = raw && typeof raw === 'object' ? raw : {};
  const merged = {
    ...base,
    ...state,
    equipped: { ...base.equipped, ...(state.equipped || {}) },
    stats: { ...base.stats, ...(state.stats || {}) },
    season: { ...base.season, ...(state.season || {}) },
  };
  merged.owned = [...new Set([...base.owned, ...(state.owned || [])])];
  merged.ownedCommanders = [...new Set([...base.ownedCommanders, ...(state.ownedCommanders || [])])];
  if (merged.daily?.key !== dateKey(now)) merged.daily = base.daily;
  if (merged.weekly?.key !== weekKey(now)) merged.weekly = base.weekly;
  return merged;
}

export function calculateBattleRewards({ victory, stars = 0, order = 1, time = 0 }) {
  const credits = victory ? 150 + order * 35 + stars * 45 : 55 + order * 10;
  const xp = victory ? 105 + order * 18 + stars * 35 : 45 + order * 8;
  const shards = victory && stars >= 3 ? 3 + Math.floor(order / 2) : victory && order >= 5 ? 1 : 0;
  const speedBonus = victory && time > 0 && time < 90 ? 45 : 0;
  return { credits: credits + speedBonus, xp, shards, seasonXp: Math.round(xp * 0.72) };
}

function addReward(state, reward = {}) {
  state.credits += reward.credits || 0;
  state.shards += reward.shards || 0;
  state.totalXp += reward.xp || 0;
  state.season.xp += reward.seasonXp || reward.xp || 0;
}

function updateTasks(tasks, delta) {
  tasks.forEach((task) => {
    if (!task.claimed) task.progress = Math.min(task.target, task.progress + (delta[task.metric] || 0));
  });
}

export function applyBattleProgress(state, battle) {
  const next = normalizeMeta(clone(state));
  const stats = battle.stats || {};
  const delta = {
    battles: 1,
    wins: battle.victory ? 1 : 0,
    losses: battle.victory ? 0 : 1,
    captured: stats.captured || 0,
    sent: stats.sent || 0,
    intercepts: stats.intercepts || 0,
    upgrades: stats.upgrades || 0,
    abilities: stats.abilities || 0,
    groupOrders: stats.groupOrders || 0,
    chainedRoutes: stats.chainedRoutes || 0,
  };
  Object.entries(delta).forEach(([key, value]) => { next.stats[key] = (next.stats[key] || 0) + value; });
  next.stats.totalTime += battle.time || 0;
  if (battle.victory && (!next.stats.bestTime || battle.time < next.stats.bestTime)) next.stats.bestTime = battle.time;
  next.stats.stars = Math.max(next.stats.stars, battle.totalStars || 0);
  next.stats.longestChain = Math.max(next.stats.longestChain, battle.longestChain || 0);
  const reward = calculateBattleRewards(battle);
  addReward(next, reward);
  updateTasks(next.daily.tasks, delta);
  updateTasks(next.weekly.tasks, delta);
  next.history.unshift({ at: Date.now(), map: battle.mapId, victory: battle.victory, stars: battle.stars || 0, time: battle.time, reward });
  next.history = next.history.slice(0, 20);
  return { state: next, reward };
}

export function purchase(state, id) {
  const next = normalizeMeta(clone(state));
  if (next.owned.includes(id)) return { ok: false, reason: 'owned', state: next };
  const item = CATALOG.find((entry) => entry.id === id);
  if (!item) return { ok: false, reason: 'missing', state: next };
  if ((next[item.currency] || 0) < item.price) return { ok: false, reason: 'funds', state: next };
  next[item.currency] -= item.price;
  next.owned.push(id);
  if (item.type === 'avatar' && item.avatar) next.equipped.avatar = item.avatar;
  else next.equipped[item.type] = item.id;
  return { ok: true, item, state: next };
}

export function purchaseCommander(state, id) {
  const next = normalizeMeta(clone(state));
  const commander = COMMANDERS.find((entry) => entry.id === id);
  if (!commander) return { ok: false, reason: 'missing', state: next };
  if (next.ownedCommanders.includes(id)) {
    next.commander = id;
    return { ok: true, commander, state: next };
  }
  if ((next[commander.currency] || 0) < commander.price) return { ok: false, reason: 'funds', state: next };
  next[commander.currency] -= commander.price;
  next.ownedCommanders.push(id);
  next.commander = id;
  return { ok: true, commander, state: next };
}

function rewardLabel(reward = {}) {
  return [reward.credits && `${reward.credits} кр.`, reward.shards && `${reward.shards} оск.`, reward.xp && `${reward.xp} XP`].filter(Boolean).join(' · ');
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

export class MetaController {
  constructor(options = {}) {
    this.options = options;
    this.state = this.load();
    this.activeTab = 'profile';
    this.shopFilter = 'all';
    this.previewEquipped = null;
    this.previewUntil = 0;
    this.buildUI();
    this.applyTheme();
    this.refresh();
  }

  load() {
    try {
      return normalizeMeta(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'));
    } catch {
      return createDefaultMeta();
    }
  }

  save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    this.applyTheme();
    this.refreshChip();
    this.options.onChange?.(this.state);
  }

  buildUI() {
    const topbar = document.querySelector('.topbar');
    const actions = document.querySelector('.top-actions');
    const chip = document.createElement('button');
    chip.id = 'playerProfileBtn';
    chip.className = 'player-profile-chip';
    chip.type = 'button';
    chip.setAttribute('aria-label', 'Открыть профиль игрока');
    topbar?.insertBefore(chip, actions || null);
    chip.addEventListener('click', () => this.open('profile'));
    this.chip = chip;

    const overlay = document.createElement('div');
    overlay.id = 'arsenalOverlay';
    overlay.className = 'arsenal-overlay';
    overlay.innerHTML = `<div class="arsenal-shell glass">
      <header class="arsenal-header">
        <div><span class="eyebrow">NEON DOMINION</span><h2>ARSENAL</h2></div>
        <div class="arsenal-wallet" id="arsenalWallet"></div>
        <button class="arsenal-close" id="arsenalClose" aria-label="Закрыть">×</button>
      </header>
      <nav class="arsenal-nav" id="arsenalNav">
        <button data-meta-tab="profile">ПРОФИЛЬ</button>
        <button data-meta-tab="shop">МАГАЗИН</button>
        <button data-meta-tab="missions">ЗАДАНИЯ</button>
        <button data-meta-tab="collection">КОЛЛЕКЦИЯ</button>
        <button data-meta-tab="commanders">КОМАНДИРЫ</button>
        <button data-meta-tab="season">СЕЗОН</button>
        <button data-meta-tab="achievements">ДОСТИЖЕНИЯ</button>
      </nav>
      <section class="arsenal-content" id="arsenalContent"></section>
    </div>`;
    document.body.append(overlay);
    this.overlay = overlay;
    this.content = overlay.querySelector('#arsenalContent');
    this.wallet = overlay.querySelector('#arsenalWallet');
    overlay.querySelector('#arsenalClose').addEventListener('click', () => this.close());
    overlay.addEventListener('pointerdown', (event) => { if (event.target === overlay) this.close(); });
    overlay.querySelector('#arsenalNav').addEventListener('click', (event) => {
      const button = event.target.closest('[data-meta-tab]');
      if (!button) return;
      this.activeTab = button.dataset.metaTab;
      this.render();
    });
    this.content.addEventListener('click', (event) => this.handleAction(event));
    this.content.addEventListener('change', (event) => this.handleChange(event));
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.overlay.classList.contains('visible')) this.close();
    });
  }

  open(tab = 'profile') {
    this.activeTab = tab;
    this.overlay.classList.add('visible');
    this.render();
  }

  close() {
    this.overlay.classList.remove('visible');
  }

  refresh() {
    this.ensureCycles();
    this.refreshChip();
    if (this.overlay?.classList.contains('visible')) this.render();
  }

  ensureCycles() {
    const normalized = normalizeMeta(this.state);
    if (normalized.daily.key !== this.state.daily?.key || normalized.weekly.key !== this.state.weekly?.key) {
      this.state = normalized;
      this.save();
    }
  }

  profileInfo() {
    const level = levelFromXp(this.state.totalXp);
    const rank = rankForLevel(level.level);
    const avatar = AVATARS.find((item) => item.id === this.state.equipped.avatar) || AVATARS[0];
    const frame = CATALOG.find((item) => item.id === this.state.equipped.frame) || CATALOG.find((item) => item.id === 'frame-cyan');
    return { level, rank, avatar, frame };
  }

  refreshChip() {
    if (!this.chip) return;
    const { level, rank, avatar, frame } = this.profileInfo();
    this.chip.style.setProperty('--profile-color', frame?.preview || '#54f5ff');
    this.chip.innerHTML = `<i>${avatar.glyph}</i><span><b>${escapeHtml(this.state.name)}</b><small>УР. ${level.level} · ${rank.name}</small></span><em>${this.state.credits}</em>`;
  }

  effectiveEquipped(type) {
    if (this.previewEquipped && Date.now() < this.previewUntil && this.previewEquipped.type === type) return this.previewEquipped.id;
    if (this.previewEquipped && Date.now() >= this.previewUntil) this.previewEquipped = null;
    return this.state.equipped[type];
  }

  applyTheme() {
    const theme = (this.effectiveEquipped('theme') || 'theme-neon').replace('theme-', '');
    document.body.dataset.arsenalTheme = theme;
  }

  render() {
    const { level, rank } = this.profileInfo();
    this.wallet.innerHTML = `<span>◈ <b>${this.state.credits}</b> КРЕДИТОВ</span><span>✦ <b>${this.state.shards}</b> ОСКОЛКОВ</span><span>УР. <b>${level.level}</b> · ${rank.name}</span>`;
    this.overlay.querySelectorAll('[data-meta-tab]').forEach((button) => button.classList.toggle('active', button.dataset.metaTab === this.activeTab));
    const renderers = {
      profile: () => this.renderProfile(),
      shop: () => this.renderShop(),
      missions: () => this.renderMissions(),
      collection: () => this.renderCollection(),
      commanders: () => this.renderCommanders(),
      season: () => this.renderSeason(),
      achievements: () => this.renderAchievements(),
    };
    this.content.innerHTML = (renderers[this.activeTab] || renderers.profile)();
  }

  renderProfile() {
    const { level, rank, avatar, frame } = this.profileInfo();
    const stats = this.state.stats;
    const winrate = stats.battles ? Math.round(stats.wins / stats.battles * 100) : 0;
    const progress = level.current / level.next * 100;
    const recent = this.state.history.slice(0, 5).map((item) => `<div class="history-row"><i class="${item.victory ? 'win' : 'loss'}"></i><span>${escapeHtml(item.map)}</span><b>${item.victory ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ'}</b><em>${Math.floor(item.time / 60)}:${String(Math.floor(item.time % 60)).padStart(2, '0')}</em></div>`).join('') || '<p class="empty-copy">История операций появится после первого боя.</p>';
    return `<div class="profile-hero" style="--frame:${frame?.preview || '#54f5ff'}">
      <div class="profile-avatar"><span>${avatar.glyph}</span><small>${rank.icon}</small></div>
      <div class="profile-identity"><span class="eyebrow">ЛОКАЛЬНЫЙ ПРОФИЛЬ · ${escapeHtml(this.state.localId)}</span><input id="profileNameInput" maxlength="24" value="${escapeHtml(this.state.name)}"><p>${rank.name} · уровень ${level.level}</p><div class="xp-track"><i style="width:${progress}%"></i></div><small>${Math.floor(level.current)} / ${level.next} XP</small></div>
      <button data-meta-action="save-name" class="arsenal-primary">СОХРАНИТЬ ИМЯ</button>
    </div>
    <div class="profile-stat-grid">
      <article><span>ОПЕРАЦИИ</span><b>${stats.battles}</b><small>${stats.wins} побед</small></article>
      <article><span>ПОБЕДЫ</span><b>${winrate}%</b><small>${stats.losses} поражений</small></article>
      <article><span>ЗАХВАЧЕНО</span><b>${stats.captured}</b><small>баз</small></article>
      <article><span>ОТПРАВЛЕНО</span><b>${Math.floor(stats.sent)}</b><small>сил</small></article>
      <article><span>ПЕРЕХВАТЫ</span><b>${stats.intercepts}</b><small>колонн</small></article>
      <article><span>ЦЕПОЧКИ</span><b>${stats.chainedRoutes}</b><small>приказов</small></article>
      <article><span>МОДЕРНИЗАЦИИ</span><b>${stats.upgrades}</b><small>улучшений</small></article>
      <article><span>ЛУЧШЕЕ ВРЕМЯ</span><b>${stats.bestTime ? `${Math.floor(stats.bestTime / 60)}:${String(Math.floor(stats.bestTime % 60)).padStart(2, '0')}` : '—'}</b><small>операция</small></article>
    </div>
    <div class="arsenal-section-head"><div><span class="eyebrow">ПОСЛЕДНИЕ БОИ</span><h3>История операций</h3></div><button data-meta-action="export-profile">ЭКСПОРТ ПРОФИЛЯ</button></div>
    <div class="history-list">${recent}</div>`;
  }

  renderShop() {
    const types = [['all', 'ВСЁ'], ['base', 'БАЗЫ'], ['trail', 'СЛЕДЫ'], ['theme', 'ТЕМЫ'], ['frame', 'РАМКИ'], ['avatar', 'АВАТАРЫ']];
    const cards = CATALOG.filter((item) => this.shopFilter === 'all' || item.type === this.shopFilter).map((item) => {
      const owned = this.state.owned.includes(item.id);
      const equipped = item.type === 'avatar' ? (AVATARS.find((avatar) => avatar.id === this.state.equipped.avatar)?.id === item.avatar) : this.state.equipped[item.type] === item.id;
      return `<article class="shop-card ${owned ? 'owned' : ''}" style="--item:${item.preview};--accent:${item.accent || item.preview}">
        <div class="shop-preview"><span>${item.type === 'avatar' ? (AVATARS.find((avatar) => avatar.id === item.avatar)?.glyph || '◆') : item.type === 'trail' ? '➤' : item.type === 'theme' ? '▣' : item.type === 'frame' ? '◇' : '⬡'}</span></div>
        <div class="shop-copy"><small>${item.rarity}</small><h3>${item.name}</h3><p>${item.description}</p></div>
        <button data-meta-action="${owned ? 'equip' : 'buy'}" data-item="${item.id}" ${equipped ? 'disabled' : ''}>${equipped ? 'ВЫБРАНО' : owned ? 'ВЫБРАТЬ' : `${item.currency === 'shards' ? '✦' : '◈'} ${item.price}`}</button>
      </article>`;
    }).join('');
    return `<div class="arsenal-section-head"><div><span class="eyebrow">БЕЗ PAY-TO-WIN</span><h3>Магазин Arsenal</h3><p>Все предметы приобретаются за валюту, заработанную в игре.</p></div></div>
      <div class="shop-filters">${types.map(([id, label]) => `<button data-meta-action="filter" data-filter="${id}" class="${this.shopFilter === id ? 'active' : ''}">${label}</button>`).join('')}</div>
      <div class="shop-grid">${cards}</div>`;
  }

  renderMissions() {
    const taskCards = (tasks, kind) => tasks.map((task) => {
      const done = task.progress >= task.target;
      return `<article class="mission-card ${done ? 'done' : ''}"><div><small>${kind}</small><h3>${task.name}</h3><p>${task.description}</p></div><div class="mission-progress"><span><i style="width:${task.progress / task.target * 100}%"></i></span><b>${Math.floor(task.progress)} / ${task.target}</b></div><button data-meta-action="claim-task" data-kind="${kind === 'ЕЖЕДНЕВНО' ? 'daily' : 'weekly'}" data-task="${task.id}" ${!done || task.claimed ? 'disabled' : ''}>${task.claimed ? 'ПОЛУЧЕНО' : rewardLabel(task.reward)}</button></article>`;
    }).join('');
    return `<div class="arsenal-section-head"><div><span class="eyebrow">ОБНОВЛЯЮТСЯ АВТОМАТИЧЕСКИ</span><h3>Задания</h3></div></div>
      <h4 class="mission-group-title">ЕЖЕДНЕВНЫЕ · ДО ${this.state.daily.key}</h4><div class="mission-grid">${taskCards(this.state.daily.tasks, 'ЕЖЕДНЕВНО')}</div>
      <h4 class="mission-group-title">НЕДЕЛЬНЫЕ · ${this.state.weekly.key}</h4><div class="mission-grid">${taskCards(this.state.weekly.tasks, 'НЕДЕЛЬНО')}</div>`;
  }

  renderCollection() {
    const owned = CATALOG.filter((item) => this.state.owned.includes(item.id));
    const groups = ['base', 'trail', 'theme', 'frame', 'avatar'].map((type) => {
      const items = owned.filter((item) => item.type === type);
      if (!items.length) return '';
      return `<section class="collection-group"><h3>${({ base: 'СКИНЫ БАЗ', trail: 'СЛЕДЫ КОЛОНН', theme: 'ТЕМЫ ИНТЕРФЕЙСА', frame: 'РАМКИ ПРОФИЛЯ', avatar: 'АВАТАРЫ' })[type]}</h3><div>${items.map((item) => {
        const equipped = type === 'avatar' ? this.state.equipped.avatar === item.avatar : this.state.equipped[type] === item.id;
        return `<button data-meta-action="equip" data-item="${item.id}" class="collection-item ${equipped ? 'equipped' : ''}" style="--item:${item.preview}"><i>${type === 'avatar' ? AVATARS.find((avatar) => avatar.id === item.avatar)?.glyph : type === 'trail' ? '➤' : type === 'base' ? '⬡' : '◇'}</i><span>${item.name}</span><small>${equipped ? 'АКТИВНО' : 'ВЫБРАТЬ'}</small></button>`;
      }).join('')}</div></section>`;
    }).join('');
    return `<div class="arsenal-section-head"><div><span class="eyebrow">${owned.length} / ${CATALOG.length}</span><h3>Коллекция</h3><p>Выбранные предметы применяются сразу.</p></div></div>${groups}`;
  }

  renderCommanders() {
    return `<div class="arsenal-section-head"><div><span class="eyebrow">ДОКТРИНА ПЕРЕД БОЕМ</span><h3>Командиры</h3><p>Командир меняет стартовые условия операции, но не продаётся за реальные деньги.</p></div></div><div class="commander-grid">${COMMANDERS.map((commander) => {
      const owned = this.state.ownedCommanders.includes(commander.id);
      const active = this.state.commander === commander.id;
      return `<article class="commander-card ${active ? 'active' : ''}"><i>${commander.glyph}</i><small>${commander.role}</small><h3>${commander.name}</h3><p>${commander.description}</p><button data-meta-action="commander" data-commander="${commander.id}" ${active ? 'disabled' : ''}>${active ? 'ВЫБРАН' : owned ? 'НАЗНАЧИТЬ' : `${commander.currency === 'shards' ? '✦' : '◈'} ${commander.price}`}</button></article>`;
    }).join('')}</div>`;
  }

  renderSeason() {
    const seasonLevel = Math.min(20, Math.floor(this.state.season.xp / 120) + 1);
    const progress = this.state.season.xp % 120 / 120 * 100;
    return `<div class="season-hero"><div><span class="eyebrow">СЕЗОН 01</span><h3>Протокол ARSENAL</h3><p>Бесплатная линия наград. Получайте сезонный опыт за операции и задания.</p></div><strong>УР. ${seasonLevel}</strong><div class="season-xp"><span><i style="width:${progress}%"></i></span><b>${this.state.season.xp % 120} / 120</b></div></div>
      <div class="season-track">${SEASON_REWARDS.map((reward) => {
        const unlocked = seasonLevel >= reward.level;
        const claimed = this.state.season.claimed.includes(reward.level);
        return `<article class="season-node ${unlocked ? 'unlocked' : ''} ${claimed ? 'claimed' : ''}"><small>УР. ${reward.level}</small><i>${reward.type === 'item' ? '⬡' : reward.type === 'shards' ? '✦' : '◈'}</i><b>${reward.label}</b><button data-meta-action="claim-season" data-level="${reward.level}" ${!unlocked || claimed ? 'disabled' : ''}>${claimed ? 'ПОЛУЧЕНО' : unlocked ? 'ЗАБРАТЬ' : 'ЗАКРЫТО'}</button></article>`;
      }).join('')}</div>`;
  }

  renderAchievements() {
    return `<div class="arsenal-section-head"><div><span class="eyebrow">ПОСТОЯННЫЕ ЦЕЛИ</span><h3>Достижения</h3></div></div><div class="achievement-grid">${ACHIEVEMENTS.map((achievement) => {
      const progress = Math.min(achievement.target, this.state.stats[achievement.metric] || 0);
      const done = progress >= achievement.target;
      const claimed = this.state.achievements[achievement.id] === 'claimed';
      return `<article class="achievement-card ${done ? 'done' : ''}"><i>${done ? '◆' : '◇'}</i><div><h3>${achievement.name}</h3><p>${achievement.description}</p><span><em style="width:${progress / achievement.target * 100}%"></em></span><small>${Math.floor(progress)} / ${achievement.target}</small></div><button data-meta-action="claim-achievement" data-achievement="${achievement.id}" ${!done || claimed ? 'disabled' : ''}>${claimed ? 'ПОЛУЧЕНО' : rewardLabel(achievement.reward)}</button></article>`;
    }).join('')}</div>`;
  }

  handleAction(event) {
    const button = event.target.closest('[data-meta-action]');
    if (!button) return;
    const action = button.dataset.metaAction;
    if (action === 'filter') {
      this.shopFilter = button.dataset.filter;
      this.render();
      return;
    }
    if (action === 'save-name') {
      const input = this.content.querySelector('#profileNameInput');
      const name = input?.value.trim().slice(0, 24);
      if (name) {
        this.state.name = name;
        this.save();
        this.toast('Имя профиля сохранено');
        this.render();
      }
      return;
    }
    if (action === 'buy') this.buy(button.dataset.item);
    if (action === 'equip') this.equip(button.dataset.item);
    if (action === 'commander') this.chooseCommander(button.dataset.commander);
    if (action === 'claim-task') this.claimTask(button.dataset.kind, button.dataset.task);
    if (action === 'claim-achievement') this.claimAchievement(button.dataset.achievement);
    if (action === 'claim-season') this.claimSeason(Number(button.dataset.level));
    if (action === 'export-profile') this.exportProfile();
  }

  handleChange(event) {
    if (event.target.matches('[data-avatar-select]')) {
      this.state.equipped.avatar = event.target.value;
      this.save();
      this.render();
    }
  }

  buy(id) {
    const result = purchase(this.state, id);
    if (!result.ok) {
      this.toast(result.reason === 'funds' ? 'Недостаточно валюты' : 'Предмет уже принадлежит вам', 'bad');
      return;
    }
    this.state = result.state;
    this.save();
    this.toast(`${result.item.name} приобретён`, 'good');
    this.render();
  }

  equip(id) {
    const item = CATALOG.find((entry) => entry.id === id);
    if (!item || !this.state.owned.includes(id)) return false;
    if (item.type === 'avatar') this.state.equipped.avatar = item.avatar;
    else this.state.equipped[item.type] = item.id;
    this.save();
    this.toast(`${item.name}: выбрано`, 'good');
    this.render();
    return true;
  }

  chooseCommander(id) {
    const result = purchaseCommander(this.state, id);
    if (!result.ok) {
      this.toast('Недостаточно валюты для командира', 'bad');
      return;
    }
    this.state = result.state;
    this.save();
    this.toast(`${result.commander.name} назначен`, 'good');
    this.render();
  }

  purchaseBundle(id) {
    const bundle = SHOP_BUNDLES.find((entry) => entry.id === id);
    if (!bundle) return { ok: false, reason: 'missing' };
    const items = bundle.items.map((itemId) => CATALOG.find((item) => item.id === itemId)).filter(Boolean);
    const missing = items.filter((item) => !this.state.owned.includes(item.id));
    if (!missing.length) return { ok: false, reason: 'owned' };
    const totals = missing.reduce((sum, item) => {
      sum[item.currency] += item.price;
      return sum;
    }, { credits: 0, shards: 0 });
    totals.credits = Math.ceil(totals.credits * (1 - bundle.discount / 100));
    totals.shards = Math.ceil(totals.shards * (1 - bundle.discount / 100));
    if (this.state.credits < totals.credits || this.state.shards < totals.shards) return { ok: false, reason: 'funds', totals };
    this.state.credits -= totals.credits;
    this.state.shards -= totals.shards;
    missing.forEach((item) => this.state.owned.push(item.id));
    this.save();
    this.toast(`${bundle.name}: комплект приобретён`, 'good');
    this.render();
    return { ok: true, bundle, totals, items: missing };
  }

  previewItem(id, duration = 30_000) {
    const item = CATALOG.find((entry) => entry.id === id);
    if (!item || !['base', 'trail', 'theme'].includes(item.type)) return false;
    this.previewEquipped = item;
    this.previewUntil = Date.now() + Math.max(1000, duration);
    this.applyTheme();
    this.toast(`${item.name}: предпросмотр активирован`, 'good');
    return true;
  }

  clearPreview() {
    this.previewEquipped = null;
    this.previewUntil = 0;
    this.applyTheme();
  }

  claimTask(kind, id) {
    const bucket = this.state[kind];
    const task = bucket?.tasks.find((entry) => entry.id === id);
    if (!task || task.claimed || task.progress < task.target) return false;
    task.claimed = true;
    addReward(this.state, { ...task.reward, seasonXp: task.reward.xp || 0 });
    this.save();
    this.toast(`Награда: ${rewardLabel(task.reward)}`, 'good');
    this.render();
    return true;
  }

  claimAchievement(id) {
    const achievement = ACHIEVEMENTS.find((entry) => entry.id === id);
    if (!achievement || this.state.achievements[id] === 'claimed' || (this.state.stats[achievement.metric] || 0) < achievement.target) return false;
    this.state.achievements[id] = 'claimed';
    addReward(this.state, achievement.reward);
    this.save();
    this.toast(`Достижение: ${achievement.name}`, 'good');
    this.render();
    return true;
  }

  claimSeason(level) {
    const reward = SEASON_REWARDS.find((entry) => entry.level === level);
    const seasonLevel = Math.min(20, Math.floor(this.state.season.xp / 120) + 1);
    if (!reward || seasonLevel < level || this.state.season.claimed.includes(level)) return false;
    this.state.season.claimed.push(level);
    if (reward.type === 'credits') this.state.credits += reward.amount;
    if (reward.type === 'shards') this.state.shards += reward.amount;
    if (reward.type === 'item' && !this.state.owned.includes(reward.item)) this.state.owned.push(reward.item);
    this.save();
    this.toast(`Сезонная награда: ${reward.label}`, 'good');
    this.render();
    return true;
  }

  exportProfile() {
    const blob = new Blob([JSON.stringify(this.state, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `neon-dominion-profile-${this.state.localId}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  toast(text, type = '') {
    this.options.notice?.(text, type);
  }

  beginBattle(engine) {
    const commander = COMMANDERS.find((entry) => entry.id === this.state.commander) || COMMANDERS[0];
    const nodes = engine.factionNodes('player');
    if (commander.id === 'vector') nodes.forEach((node) => { node.upgrades.logistics = Math.min(3, node.upgrades.logistics + 1); });
    if (commander.id === 'nexus') {
      engine.energy = Math.min(100, engine.energy + 20);
      nodes.forEach((node) => { node.upgrades.industry = Math.min(3, node.upgrades.industry + 1); });
    }
    if (commander.id === 'carmine') {
      engine.reputation = Math.max(0, engine.reputation - 5);
      nodes.forEach((node) => { node.troops = Math.min(engine.capacity(node), node.troops + 10); });
    }
    if (commander.id === 'mirage') {
      engine.energy = Math.min(100, engine.energy + 10);
      nodes.forEach((node) => { node.upgrades.recon = Math.min(3, node.upgrades.recon + 1); });
    }
    engine.recalculateTerritory?.();
    return commander;
  }

  completeBattle(battle) {
    const result = applyBattleProgress(this.state, battle);
    this.state = result.state;
    this.save();
    this.refresh();
    return result.reward;
  }

  decorateBase(ctx, node, config, faction, now) {
    if (node.owner !== 'player') return;
    const skin = CATALOG.find((item) => item.id === this.effectiveEquipped('base')) || CATALOG[0];
    const accent = skin.accent || skin.preview || faction.color;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = accent;
    ctx.lineWidth = skin.id === 'base-gold' ? 3.2 : 2;
    if (skin.id === 'base-glitch') ctx.setLineDash([4, 3]);
    ctx.rotate(Math.sin(now * 0.0004 + node.x) * 0.08);
    ctx.beginPath();
    ctx.arc(0, 0, config.radius * 0.72, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = skin.preview;
    ctx.beginPath();
    ctx.arc(0, 0, config.radius * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  decorateConvoy(ctx, convoy, geometry) {
    if (convoy.owner !== 'player') return;
    const trail = CATALOG.find((item) => item.id === this.effectiveEquipped('trail')) || CATALOG.find((item) => item.id === 'trail-cyan');
    const color = trail.preview || '#54f5ff';
    ctx.save();
    ctx.strokeStyle = color;
    ctx.globalAlpha = trail.id === 'trail-glitch' ? 0.58 : 0.36;
    ctx.lineWidth = trail.id === 'trail-plasma' ? 4.5 : trail.id === 'trail-gold' ? 3.2 : 2.6;
    if (trail.id === 'trail-glitch') ctx.setLineDash([8, 5, 2, 5]);
    if (trail.id === 'trail-ice') ctx.setLineDash([2, 7]);
    ctx.shadowColor = trail.accent || color;
    ctx.shadowBlur = trail.id === 'trail-fire' ? 18 : 12;
    ctx.beginPath();
    ctx.moveTo(geometry.start.x, geometry.start.y);
    ctx.quadraticCurveTo(geometry.control.x, geometry.control.y, geometry.x, geometry.y);
    ctx.stroke();
    ctx.restore();
  }

  snapshot() {
    const { level, rank } = this.profileInfo();
    return { ...clone(this.state), level, rank, activeTab: this.activeTab, preview: this.previewEquipped ? { ...this.previewEquipped, until: this.previewUntil } : null };
  }

  resetForQA() {
    this.state = createDefaultMeta(1_760_000_000_000);
    this.save();
    this.refresh();
    return this.snapshot();
  }
}
