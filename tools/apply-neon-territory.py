from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content.strip() + "\n", encoding="utf-8")


def replace_once(path: str, old: str, new: str) -> None:
    target = ROOT / path
    text = target.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"Marker not found in {path}: {old[:100]!r}")
    target.write_text(text.replace(old, new, 1), encoding="utf-8")


write("neon-dominion/src/engine.js", r'''
import { FACTIONS, NODE_TYPES, cloneMap } from './maps.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export const UNIT_TYPES = {
  assault: { id: 'assault', name: 'Штурм', speed: 1, attack: 1.18, defense: 1, vision: 1, icon: '◆' },
  rapid: { id: 'rapid', name: 'Рывок', speed: 1.42, attack: 0.84, defense: 0.78, vision: 1.12, icon: '➤' },
  heavy: { id: 'heavy', name: 'Таран', speed: 0.72, attack: 1.46, defense: 1.32, vision: 0.88, icon: '⬢' },
  scout: { id: 'scout', name: 'Разведка', speed: 1.62, attack: 0.56, defense: 0.62, vision: 1.8, icon: '◈' },
};

export const UPGRADE_PATHS = {
  industry: { id: 'industry', name: 'Производство', icon: '⚙', description: 'Прирост и вместимость' },
  fortification: { id: 'fortification', name: 'Оборона', icon: '⬡', description: 'Стойкость гарнизона' },
  logistics: { id: 'logistics', name: 'Логистика', icon: '↗', description: 'Скорость колонн' },
  recon: { id: 'recon', name: 'Разведка', icon: '◎', description: 'Радиус обзора' },
};

const upgradeCost = (level) => [0, 26, 44, 68][level + 1] || Infinity;
const defaultUpgrades = () => ({ industry: 0, fortification: 0, logistics: 0, recon: 0 });

export class DominionEngine {
  constructor(map, options = {}) {
    this.map = cloneMap(map);
    this.nodes = Object.fromEntries(this.map.nodes.map((node) => [node.id, {
      ...node,
      upgrades: { ...defaultUpgrades(), ...(node.upgrades || {}) },
    }]));
    this.links = this.map.links;
    this.convoys = [];
    this.effects = [];
    this.time = 0;
    this.speed = 1;
    this.result = null;
    this.energy = 42;
    this.reputation = 100;
    this.stats = {
      sent: 0,
      captured: 0,
      lost: 0,
      abilities: 0,
      groupOrders: 0,
      chainedRoutes: 0,
      upgrades: 0,
      intercepts: 0,
    };
    this.boostUntil = 0;
    this.aiClock = { red: 1.1, violet: 1.7 };
    this.difficulty = options.difficulty || 1;
    this.rng = mulberry32(options.seed || hash(map.id));
    this.events = [];
    this.abilityHistory = new Set();
    this.encounters = new Set();
    this.territory = { player: 0, red: 0, violet: 0, neutral: 0 };
    this.territoryClock = 0;
    this.recalculateTerritory();
  }

  neighbors(id) {
    const source = this.nodes[id];
    if (!source) return [];
    return Object.values(this.nodes)
      .filter((node) => node.id !== id)
      .sort((a, b) => distance(source, a) - distance(source, b));
  }

  connected(a, b) {
    return Boolean(this.nodes[a] && this.nodes[b] && a !== b);
  }

  factionNodes(owner) {
    return Object.values(this.nodes).filter((node) => node.owner === owner);
  }

  factionPower(owner) {
    return this.factionNodes(owner).reduce((sum, node) => sum + node.troops, 0)
      + this.convoys.filter((convoy) => convoy.owner === owner).reduce((sum, convoy) => sum + convoy.amount, 0);
  }

  capacity(node) {
    return NODE_TYPES[node.type].capacity
      + (node.level - 1) * 18
      + node.upgrades.industry * 16;
  }

  growth(node) {
    const config = NODE_TYPES[node.type];
    const territoryBonus = 1 + (this.territory[node.owner] || 0) * 0.22;
    const industryBonus = 1 + node.upgrades.industry * 0.24;
    const boost = node.owner === 'player' && this.time < this.boostUntil ? 1.85 : 1;
    return config.growth * (1 + (node.level - 1) * 0.18) * territoryBonus * industryBonus * boost;
  }

  defense(node) {
    return NODE_TYPES[node.type].defense * (1 + node.upgrades.fortification * 0.24);
  }

  visionRadius(node) {
    return 132 + node.upgrades.recon * 54 + (node.type === 'relay' ? 38 : 0);
  }

  upgradeCost(node, path) {
    if (!node || !UPGRADE_PATHS[path]) return Infinity;
    return upgradeCost(node.upgrades[path]);
  }

  upgradeNode(id, path, owner = 'player') {
    const node = this.nodes[id];
    if (this.result || !node || node.owner !== owner || !UPGRADE_PATHS[path]) return false;
    const level = node.upgrades[path];
    if (level >= 3) return false;
    const cost = this.upgradeCost(node, path);
    if (this.energy < cost) return false;
    this.energy -= cost;
    node.upgrades[path] += 1;
    this.stats.upgrades += 1;
    this.effects.push({ type: 'upgrade', x: node.x, y: node.y, life: 1, path });
    this.events.push({ type: 'good', text: `${UPGRADE_PATHS[path].name}: ${node.id.toUpperCase()} ур. ${node.upgrades[path]}` });
    this.recalculateTerritory();
    return true;
  }

  send(fromId, toId, ratio = 0.5, owner = 'player', options = {}) {
    const from = this.nodes[fromId];
    const to = this.nodes[toId];
    if (this.result || !from || !to || from.id === to.id || from.owner !== owner) return false;

    const normalizedRatio = clamp(ratio, 0.15, 1);
    const sendAll = normalizedRatio >= 0.999;
    const amount = sendAll ? from.troops : Math.floor(from.troops * normalizedRatio);
    if (amount < (sendAll ? 0.5 : 2)) return false;

    const unitType = UNIT_TYPES[options.unitType] ? options.unitType : 'assault';
    const unit = UNIT_TYPES[unitType];
    from.troops = sendAll ? 0 : Math.max(0, from.troops - amount);
    const length = Math.max(1, distance(from, to));
    const curve = (this.rng() - 0.5) * Math.min(150, length * 0.24);
    const territorySpeed = (this.territory[owner] || 0) > 0.4 ? 1.08 : 1;
    this.convoys.push({
      id: `c${this.time.toFixed(3)}-${this.rng()}`,
      from: fromId,
      to: toId,
      owner,
      amount,
      progress: 0,
      speed: (owner === 'player' ? 158 : 139 + this.difficulty * 9)
        * unit.speed
        * (1 + from.upgrades.logistics * 0.14)
        * territorySpeed,
      length,
      curve,
      unitType,
      attack: unit.attack,
      defense: unit.defense,
      vision: unit.vision,
      route: [...(options.route || [])],
    });
    if (owner === 'player') this.stats.sent += amount;
    return true;
  }

  sendMany(fromIds, toId, ratio = 1, owner = 'player', options = {}) {
    const unique = [...new Set(fromIds)].filter((id) => id !== toId);
    const groupRatio = owner === 'player' ? 1 : ratio;
    let sent = 0;
    for (const fromId of unique) {
      if (this.send(fromId, toId, groupRatio, owner, options)) sent += 1;
    }
    if (owner === 'player' && sent > 1) this.stats.groupOrders += 1;
    return sent;
  }

  sendRoute(fromIds, targetIds, unitType = 'assault', owner = 'player') {
    const targets = [...new Set(targetIds)].filter((id) => this.nodes[id]);
    if (!targets.length) return 0;
    const sent = this.sendMany(fromIds, targets[0], owner === 'player' ? 1 : 0.55, owner, {
      unitType,
      route: targets.slice(1),
    });
    if (owner === 'player' && sent && targets.length > 1) this.stats.chainedRoutes += 1;
    return sent;
  }

  useAbility(type, targetId) {
    if (this.result) return false;
    const costs = { shield: 35, overdrive: 60, strike: 50, surge: 75 };
    const cost = costs[type];
    if (!cost || this.energy < cost) return false;

    if (type === 'shield') {
      const node = this.nodes[targetId];
      if (!node || node.owner !== 'player') return false;
      node.shieldUntil = this.time + 16;
      this.events.push({ type: 'good', text: `Купол активирован: ${targetId}` });
    }
    if (type === 'overdrive') {
      this.boostUntil = this.time + 18;
      this.events.push({ type: 'good', text: 'Форсаж сети активирован' });
    }
    if (type === 'strike') {
      const node = this.nodes[targetId];
      if (!node || node.owner === 'player' || node.owner === 'neutral') return false;
      const damage = Math.max(12, Math.round(node.troops * 0.38));
      node.troops = Math.max(1, node.troops - damage);
      this.effects.push({ type: 'strike', x: node.x, y: node.y, life: 1 });
      this.events.push({ type: 'good', text: `Импульс: −${damage} сил` });
    }
    if (type === 'surge') {
      this.factionNodes('player').forEach((node) => {
        node.troops = Math.min(this.capacity(node), node.troops + 12);
      });
      this.events.push({ type: 'good', text: 'Проведена общая мобилизация' });
    }

    this.energy -= cost;
    this.stats.abilities += 1;
    this.abilityHistory.add(type);
    return true;
  }

  update(dt) {
    if (this.result || this.speed === 0) return;
    dt = Math.min(0.05, dt) * this.speed;
    this.time += dt;
    const reactorBonus = this.factionNodes('player').filter((node) => node.type === 'reactor').length * 0.08;
    this.energy = clamp(this.energy + dt * (1.32 + reactorBonus + this.territory.player * 0.45), 0, 100);

    for (const node of Object.values(this.nodes)) {
      if (node.owner === 'neutral') continue;
      node.troops = Math.min(this.capacity(node), node.troops + this.growth(node) * dt);
    }

    for (const convoy of this.convoys) convoy.progress += convoy.speed * dt / convoy.length;
    this.resolveInterceptions();

    const arrived = this.convoys.filter((convoy) => convoy.progress >= 1);
    for (const convoy of arrived) {
      if (!this.convoys.includes(convoy)) continue;
      const continued = this.resolveArrival(convoy);
      if (!continued) this.convoys.splice(this.convoys.indexOf(convoy), 1);
    }

    this.effects.forEach((effect) => { effect.life -= dt; });
    this.effects = this.effects.filter((effect) => effect.life > 0);
    this.updateAI('red', dt);
    this.updateAI('violet', dt);
    this.territoryClock -= dt;
    if (this.territoryClock <= 0) {
      this.territoryClock = 0.75;
      this.recalculateTerritory();
    }
    this.checkResult();
  }

  convoyPoint(convoy) {
    const start = this.nodes[convoy.from];
    const end = this.nodes[convoy.to];
    if (!start || !end) return { x: 0, y: 0 };
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    const control = {
      x: (start.x + end.x) / 2 - dy / length * convoy.curve,
      y: (start.y + end.y) / 2 + dx / length * convoy.curve,
    };
    const t = clamp(convoy.progress, 0, 1);
    const one = 1 - t;
    return {
      x: one * one * start.x + 2 * one * t * control.x + t * t * end.x,
      y: one * one * start.y + 2 * one * t * control.y + t * t * end.y,
    };
  }

  resolveInterceptions() {
    for (let first = 0; first < this.convoys.length; first += 1) {
      const a = this.convoys[first];
      for (let second = first + 1; second < this.convoys.length; second += 1) {
        const b = this.convoys[second];
        if (a.owner === b.owner) continue;
        const key = [a.id, b.id].sort().join('|');
        if (this.encounters.has(key)) continue;
        const pointA = this.convoyPoint(a);
        const pointB = this.convoyPoint(b);
        if (distance(pointA, pointB) > 22) continue;
        this.encounters.add(key);
        const beforeA = a.amount;
        const beforeB = b.amount;
        const damageA = Math.min(a.amount, beforeB * b.attack * 0.52 / Math.max(0.4, a.defense));
        const damageB = Math.min(b.amount, beforeA * a.attack * 0.52 / Math.max(0.4, b.defense));
        a.amount = Math.max(0, a.amount - damageA);
        b.amount = Math.max(0, b.amount - damageB);
        const x = (pointA.x + pointB.x) / 2;
        const y = (pointA.y + pointB.y) / 2;
        this.effects.push({ type: 'intercept', x, y, life: 1 });
        if (a.owner === 'player' || b.owner === 'player') this.stats.intercepts += 1;
        this.events.push({ type: a.owner === 'player' || b.owner === 'player' ? 'bad' : '', text: 'Перехват колонн в открытом поле' });
      }
    }
    this.convoys = this.convoys.filter((convoy) => convoy.amount >= 0.5);
    if (this.encounters.size > 4000) this.encounters.clear();
  }

  resolveArrival(convoy) {
    const target = this.nodes[convoy.to];
    if (!target) return false;

    if (target.owner === convoy.owner) {
      if (convoy.route.length) return this.continueConvoy(convoy, convoy.route.shift(), convoy.amount);
      target.troops = Math.min(this.capacity(target), target.troops + convoy.amount);
      return false;
    }

    const shield = target.shieldUntil > this.time ? 1.65 : 1;
    const effective = convoy.amount * convoy.attack / (this.defense(target) * shield);
    if (effective >= target.troops) {
      const previous = target.owner;
      const spent = target.troops * this.defense(target) * shield / convoy.attack;
      const survivors = Math.max(0.5, convoy.amount - spent);
      target.owner = convoy.owner;
      target.shieldUntil = 0;
      this.effects.push({ type: 'capture', x: target.x, y: target.y, life: 1, owner: convoy.owner, previous });
      if (convoy.owner === 'player') {
        this.stats.captured += 1;
        this.events.push({ type: 'good', text: `Территория ${target.id.toUpperCase()} захвачена` });
      }
      if (previous === 'player') {
        this.stats.lost += 1;
        this.reputation = clamp(this.reputation - 8, 0, 100);
        this.events.push({ type: 'bad', text: `База ${target.id} потеряна` });
      }
      if (convoy.route.length && survivors > 2.5) {
        const garrison = Math.min(4, Math.max(1, survivors * 0.22));
        target.troops = garrison;
        return this.continueConvoy(convoy, convoy.route.shift(), survivors - garrison);
      }
      target.troops = survivors;
      return false;
    }

    target.troops = Math.max(0, target.troops - effective);
    return false;
  }

  continueConvoy(convoy, nextId, amount) {
    const from = this.nodes[convoy.to];
    const to = this.nodes[nextId];
    if (!from || !to || from.id === to.id || amount < 0.5) return false;
    convoy.from = from.id;
    convoy.to = to.id;
    convoy.amount = amount;
    convoy.progress = 0;
    convoy.length = Math.max(1, distance(from, to));
    convoy.curve = (this.rng() - 0.5) * Math.min(150, convoy.length * 0.24);
    return true;
  }

  territoryOwnerAt(x, y) {
    let winner = 'neutral';
    let best = 0;
    for (const node of Object.values(this.nodes)) {
      if (node.owner === 'neutral') continue;
      const influence = (48 + Math.sqrt(Math.max(0, node.troops)) * 9 + node.level * 10
        + node.upgrades.fortification * 12 + node.upgrades.recon * 5)
        / (Math.hypot(x - node.x, y - node.y) + 48);
      if (influence > best) {
        best = influence;
        winner = node.owner;
      }
    }
    return best < 0.14 ? 'neutral' : winner;
  }

  recalculateTerritory() {
    const counts = { player: 0, red: 0, violet: 0, neutral: 0 };
    let total = 0;
    for (let y = 30; y < 720; y += 60) {
      for (let x = 30; x < 1200; x += 60) {
        counts[this.territoryOwnerAt(x, y)] += 1;
        total += 1;
      }
    }
    for (const owner of Object.keys(counts)) this.territory[owner] = counts[owner] / total;
  }

  territorySnapshot() {
    return { ...this.territory };
  }

  isVisible(nodeId, viewer = 'player') {
    const target = this.nodes[nodeId];
    if (!target) return false;
    if (target.owner === viewer || target.owner === 'neutral') return true;
    for (const node of this.factionNodes(viewer)) {
      if (distance(node, target) <= this.visionRadius(node)) return true;
    }
    for (const convoy of this.convoys.filter((item) => item.owner === viewer)) {
      const point = this.convoyPoint(convoy);
      if (distance(point, target) <= 105 * convoy.vision) return true;
    }
    return false;
  }

  updateAI(owner, dt) {
    const owned = this.factionNodes(owner);
    if (!owned.length) return;
    this.aiClock[owner] -= dt;
    if (this.aiClock[owner] > 0) return;

    this.aiClock[owner] = clamp(2.8 - this.difficulty * 0.42 + this.rng() * 1.3, 1.05, 3.3);
    const sources = owned.filter((node) => node.troops > 22).sort((a, b) => b.troops - a.troops);
    if (!sources.length) return;

    const source = sources[Math.floor(this.rng() * Math.min(3, sources.length))];
    const candidates = Object.values(this.nodes).filter((node) => node.id !== source.id);
    const scored = candidates.map((target) => {
      let score = 0;
      if (target.owner !== owner) score += 42;
      if (target.owner === 'player') score += 18 * this.difficulty;
      if (target.owner === 'neutral') score += 11;
      if (target.type === 'factory' || target.type === 'reactor') score += 14;
      if (target.type === 'fortress') score -= 14;
      score += source.troops - target.troops;
      score -= distance(source, target) * 0.045;
      score += this.rng() * 18;
      return { target, score };
    }).sort((a, b) => b.score - a.score);

    const target = scored[0]?.target;
    if (!target || (target.owner === owner && target.troops > source.troops * 0.8)) return;
    const unitType = target.type === 'fortress' ? 'heavy' : distance(source, target) > 500 ? 'rapid' : this.rng() > 0.82 ? 'scout' : 'assault';
    this.send(source.id, target.id, source.troops > 70 ? 0.66 : 0.48, owner, { unitType });
  }

  checkResult() {
    const enemiesRemain = ['red', 'violet'].some((faction) => this.factionNodes(faction).length > 0);
    const playerRemains = this.factionNodes('player').length > 0;
    if (!playerRemains) this.result = 'defeat';
    else if (!enemiesRemain) this.result = 'victory';
  }

  snapshot() {
    return {
      time: this.time,
      energy: this.energy,
      reputation: this.reputation,
      result: this.result,
      nodes: Object.values(this.nodes).map((node) => ({ ...node, upgrades: { ...node.upgrades } })),
      convoys: this.convoys.map((convoy) => ({ ...convoy, route: [...convoy.route] })),
      effects: this.effects.map((effect) => ({ ...effect })),
      territory: this.territorySnapshot(),
      stats: { ...this.stats },
    };
  }
}

function hash(value) {
  let result = 2166136261;
  for (const character of value) result = Math.imul(result ^ character.charCodeAt(0), 16777619);
  return result >>> 0;
}

function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = seed + 0x6D2B79F5 | 0;
    let value = Math.imul(seed ^ seed >>> 15, 1 | seed);
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

export { FACTIONS, NODE_TYPES };
''')

write("neon-dominion/src/territory.js", r'''
import { FACTIONS, NODE_TYPES } from './maps.js';
import { UNIT_TYPES, UPGRADE_PATHS } from './engine.js';

const hexToRgba = (hex, alpha) => {
  const value = hex.replace('#', '');
  const number = Number.parseInt(value, 16);
  return `rgba(${number >> 16},${number >> 8 & 255},${number & 255},${alpha})`;
};

export class TerritoryController {
  constructor(options) {
    Object.assign(this, options);
    this.engine = null;
    this.unitType = 'assault';
    this.active = null;
    this.cacheAt = 0;
    this.territoryCanvas = document.createElement('canvas');
    this.territoryCanvas.width = 300;
    this.territoryCanvas.height = 180;
    this.fogCanvas = document.createElement('canvas');
    this.fogCanvas.width = 600;
    this.fogCanvas.height = 360;
    this.lastSync = 0;
    this.buildUI();
  }

  buildUI() {
    const panel = document.querySelector('#rightPanel');
    const anchor = panel?.querySelector('.intel-card');
    if (!panel || document.querySelector('#territoryConsole')) return;
    const section = document.createElement('section');
    section.id = 'territoryConsole';
    section.className = 'territory-console';
    section.innerHTML = `
      <div class="territory-title"><div><span class="eyebrow">TERRITORY</span><h3>Доктрина фронта</h3></div><strong id="territoryPercent">0%</strong></div>
      <div class="unit-grid" aria-label="Тип отправляемых войск">
        ${Object.values(UNIT_TYPES).map((unit) => `<button data-unit="${unit.id}" title="${unit.name}"><i>${unit.icon}</i><span>${unit.name}</span><small>×${unit.speed.toFixed(2)}</small></button>`).join('')}
      </div>
      <div class="upgrade-head"><span>МОДЕРНИЗАЦИЯ БАЗЫ</span><b id="upgradeNodeLabel">НЕТ ЦЕЛИ</b></div>
      <div class="upgrade-grid">
        ${Object.values(UPGRADE_PATHS).map((path) => `<button data-upgrade="${path.id}"><i>${path.icon}</i><span><b>${path.name}</b><small>${path.description}</small></span><em>—</em></button>`).join('')}
      </div>
      <div class="territory-meter"><span><i id="playerTerritory"></i></span><small id="territoryLegend">Влияние СПЕКТРА</small></div>
      <div class="minimap-shell"><canvas id="miniMap" width="240" height="144" aria-label="Мини-карта территории"></canvas><span>МИНИ-КАРТА · ТУМАН ВОЙНЫ</span></div>
      <p class="territory-help" id="territoryHelp">Проведите через свои базы, затем через одну или несколько целей. Выжившие силы продолжат маршрут автоматически.</p>`;
    panel.insertBefore(section, anchor || panel.firstChild);
    this.root = section;
    this.miniMap = section.querySelector('#miniMap');
    this.miniCtx = this.miniMap.getContext('2d');
    this.percent = section.querySelector('#territoryPercent');
    this.playerBar = section.querySelector('#playerTerritory');
    this.legend = section.querySelector('#territoryLegend');
    this.nodeLabel = section.querySelector('#upgradeNodeLabel');
    this.help = section.querySelector('#territoryHelp');
    section.querySelectorAll('[data-unit]').forEach((button) => button.addEventListener('click', () => this.setUnit(button.dataset.unit)));
    section.querySelectorAll('[data-upgrade]').forEach((button) => button.addEventListener('click', () => this.upgrade(button.dataset.upgrade)));
    this.setUnit(this.unitType);
  }

  start(engine) {
    this.engine = engine;
    this.active = null;
    this.cacheAt = 0;
    this.help && (this.help.textContent = 'Цепочка: свои базы → первая цель → следующие цели. После захвата колонна продолжит маршрут.');
    this.sync(true);
  }

  stop() {
    this.engine = null;
    this.active = null;
    this.sync(true);
  }

  setUnit(type) {
    if (!UNIT_TYPES[type]) return false;
    this.unitType = type;
    this.root?.querySelectorAll('[data-unit]').forEach((button) => button.classList.toggle('active', button.dataset.unit === type));
    this.help && (this.help.textContent = `${UNIT_TYPES[type].name}: скорость ×${UNIT_TYPES[type].speed.toFixed(2)}, удар ×${UNIT_TYPES[type].attack.toFixed(2)}, обзор ×${UNIT_TYPES[type].vision.toFixed(2)}.`);
    return true;
  }

  upgrade(path) {
    const selected = this.getSelected();
    const id = selected.at(-1);
    if (!id || !this.engine?.upgradeNode(id, path, 'player')) {
      this.announce('Недостаточно энергии, база не выбрана или достигнут предел', 'bad');
      return false;
    }
    this.cacheAt = 0;
    this.announce(`${UPGRADE_PATHS[path].name} улучшена`, 'good');
    this.sync(true);
    return true;
  }

  pointerDown(event, hit) {
    if (!this.engine || !this.allowChain() || event.shiftKey || !hit || hit.owner !== 'player') return false;
    this.active = {
      pointerId: event.pointerId,
      sources: [hit.id],
      targets: [],
      moved: false,
      startX: event.clientX,
      startY: event.clientY,
      world: { x: hit.x, y: hit.y },
    };
    this.setSelected([hit.id], hit.id);
    this.showDrag(`${UNIT_TYPES[this.unitType].name.toUpperCase()} · ВЕДИТЕ ЧЕРЕЗ БАЗЫ`, event);
    return true;
  }

  pointerMove(event, world) {
    const active = this.active;
    if (!active || active.pointerId !== event.pointerId) return false;
    active.world = world;
    const movement = Math.hypot(event.clientX - active.startX, event.clientY - active.startY);
    if (movement > 7) active.moved = true;
    const hit = this.hitNode(world);
    if (active.moved && hit) {
      const targetsStarted = active.targets.length > 0;
      if (!targetsStarted && hit.owner === 'player' && !active.sources.includes(hit.id)) {
        active.sources.push(hit.id);
        this.setSelected(active.sources, hit.id);
        navigator.vibrate?.(16);
      } else if (!active.sources.includes(hit.id) && !active.targets.includes(hit.id)
        && (hit.owner !== 'player' || targetsStarted)) {
        active.targets.push(hit.id);
        navigator.vibrate?.(24);
      }
    }
    const routeText = active.targets.length
      ? `${active.sources.length} БАЗ · ЦЕЛЕЙ ${active.targets.length} · ОТПУСТИТЕ`
      : `${active.sources.length} БАЗ В ЦЕПОЧКЕ · ДОБАВЬТЕ ЦЕЛЬ`;
    this.showDrag(routeText, event);
    return true;
  }

  pointerUp(event, target) {
    const active = this.active;
    if (!active || active.pointerId !== event.pointerId) return false;
    if (active.moved && target && !active.sources.includes(target.id) && !active.targets.includes(target.id)) active.targets.push(target.id);
    if (active.moved && active.targets.length) {
      const sent = this.engine.sendRoute(active.sources, active.targets, this.unitType, 'player');
      if (sent) {
        this.announce(`${sent} баз отправили гарнизоны по маршруту из ${active.targets.length} целей`, 'good');
        navigator.vibrate?.([28, 24, 42]);
      } else {
        this.announce('Недостаточно сил для приказа', 'bad');
      }
    } else if (!active.moved) {
      this.setSelected(active.sources, active.sources[0]);
    }
    this.active = null;
    this.hideDrag();
    return true;
  }

  isNodeVisible(node) {
    return !this.engine || this.engine.isVisible(node.id, 'player');
  }

  isConvoyVisible(convoy) {
    if (!this.engine || convoy.owner === 'player') return true;
    const point = this.engine.convoyPoint(convoy);
    return this.engine.factionNodes('player').some((node) => Math.hypot(node.x - point.x, node.y - point.y) <= this.engine.visionRadius(node));
  }

  drawTerritory(ctx, now) {
    if (!this.engine) return;
    if (now - this.cacheAt > 520) {
      this.cacheAt = now;
      const tctx = this.territoryCanvas.getContext('2d');
      tctx.clearRect(0, 0, 300, 180);
      const cell = 10;
      for (let y = 0; y < 180; y += cell) {
        for (let x = 0; x < 300; x += cell) {
          const owner = this.engine.territoryOwnerAt((x + cell / 2) * 4, (y + cell / 2) * 4);
          tctx.fillStyle = hexToRgba(FACTIONS[owner].color, owner === 'neutral' ? 0.03 : 0.22);
          tctx.fillRect(x, y, cell + 1, cell + 1);
        }
      }
    }
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.filter = 'blur(12px) saturate(1.2)';
    ctx.drawImage(this.territoryCanvas, 0, 0, 1200, 720);
    ctx.filter = 'none';
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  drawFog(ctx) {
    if (!this.engine) return;
    const fctx = this.fogCanvas.getContext('2d');
    fctx.setTransform(1, 0, 0, 1, 0, 0);
    fctx.clearRect(0, 0, 600, 360);
    fctx.fillStyle = 'rgba(1,3,9,.66)';
    fctx.fillRect(0, 0, 600, 360);
    fctx.globalCompositeOperation = 'destination-out';
    for (const node of this.engine.factionNodes('player')) {
      const radius = this.engine.visionRadius(node) * 0.5;
      const gradient = fctx.createRadialGradient(node.x * 0.5, node.y * 0.5, radius * 0.24, node.x * 0.5, node.y * 0.5, radius);
      gradient.addColorStop(0, 'rgba(0,0,0,1)');
      gradient.addColorStop(0.68, 'rgba(0,0,0,.9)');
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      fctx.fillStyle = gradient;
      fctx.beginPath();
      fctx.arc(node.x * 0.5, node.y * 0.5, radius, 0, Math.PI * 2);
      fctx.fill();
    }
    for (const convoy of this.engine.convoys.filter((item) => item.owner === 'player')) {
      const point = this.engine.convoyPoint(convoy);
      const radius = 60 * convoy.vision;
      const gradient = fctx.createRadialGradient(point.x * 0.5, point.y * 0.5, 4, point.x * 0.5, point.y * 0.5, radius);
      gradient.addColorStop(0, 'rgba(0,0,0,.95)');
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      fctx.fillStyle = gradient;
      fctx.beginPath();
      fctx.arc(point.x * 0.5, point.y * 0.5, radius, 0, Math.PI * 2);
      fctx.fill();
    }
    fctx.globalCompositeOperation = 'source-over';
    ctx.save();
    ctx.drawImage(this.fogCanvas, 0, 0, 1200, 720);
    ctx.restore();
  }

  drawOverlay(ctx, now) {
    if (!this.engine) return;
    this.drawActiveRoute(ctx, now);
    for (const effect of this.engine.effects) {
      const progress = 1 - effect.life;
      ctx.save();
      ctx.translate(effect.x, effect.y);
      if (effect.type === 'capture') {
        ctx.strokeStyle = FACTIONS[effect.owner]?.color || '#fff';
        ctx.lineWidth = 5 * effect.life;
        ctx.globalAlpha = effect.life;
        for (let ring = 0; ring < 3; ring += 1) {
          ctx.beginPath();
          ctx.arc(0, 0, 22 + progress * 86 + ring * 13, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else if (effect.type === 'intercept') {
        ctx.rotate(now * 0.006);
        ctx.strokeStyle = '#ffffff';
        ctx.globalAlpha = effect.life;
        ctx.lineWidth = 3;
        for (let arm = 0; arm < 6; arm += 1) {
          ctx.rotate(Math.PI / 3);
          ctx.beginPath();
          ctx.moveTo(8, 0);
          ctx.lineTo(18 + progress * 38, 0);
          ctx.stroke();
        }
      } else if (effect.type === 'upgrade') {
        ctx.strokeStyle = '#54f5ff';
        ctx.globalAlpha = effect.life;
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 5]);
        ctx.beginPath();
        ctx.arc(0, 0, 35 + progress * 45, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
    this.drawMiniMap();
  }

  drawActiveRoute(ctx, now) {
    const active = this.active;
    if (!active?.moved || !this.engine) return;
    const ids = [...active.sources, ...active.targets];
    const points = ids.map((id) => this.engine.nodes[id]).filter(Boolean);
    points.push(active.world);
    ctx.save();
    ctx.strokeStyle = '#54f5ff';
    ctx.shadowColor = '#54f5ff';
    ctx.shadowBlur = 18;
    ctx.lineWidth = 4;
    ctx.setLineDash([14, 8]);
    ctx.lineDashOffset = -now * 0.025;
    ctx.beginPath();
    points.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
    ctx.stroke();
    ctx.setLineDash([]);
    points.slice(0, -1).forEach((point, index) => {
      ctx.fillStyle = index < active.sources.length ? '#54f5ff' : '#ffcf67';
      ctx.beginPath();
      ctx.arc(point.x, point.y, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#061019';
      ctx.font = '900 11px Inter';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(index + 1, point.x, point.y + 0.5);
    });
    ctx.restore();
  }

  drawMiniMap() {
    if (!this.engine || !this.miniCtx) return;
    const ctx = this.miniCtx;
    ctx.clearRect(0, 0, 240, 144);
    ctx.fillStyle = '#030712';
    ctx.fillRect(0, 0, 240, 144);
    ctx.globalAlpha = 0.42;
    ctx.drawImage(this.territoryCanvas, 0, 0, 240, 144);
    ctx.globalAlpha = 1;
    for (const node of Object.values(this.engine.nodes)) {
      if (!this.isNodeVisible(node)) continue;
      ctx.fillStyle = FACTIONS[node.owner].color;
      ctx.beginPath();
      ctx.arc(node.x / 5, node.y / 5, node.type === 'core' ? 4 : 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const convoy of this.engine.convoys) {
      if (!this.isConvoyVisible(convoy)) continue;
      const point = this.engine.convoyPoint(convoy);
      ctx.fillStyle = FACTIONS[convoy.owner].color;
      ctx.fillRect(point.x / 5 - 1, point.y / 5 - 1, 2, 2);
    }
    ctx.strokeStyle = 'rgba(84,245,255,.22)';
    ctx.strokeRect(0.5, 0.5, 239, 143);
  }

  sync(force = false) {
    const now = performance.now();
    if (!force && now - this.lastSync < 180) return;
    this.lastSync = now;
    if (!this.engine || !this.root) {
      this.percent && (this.percent.textContent = '0%');
      return;
    }
    const territory = this.engine.territorySnapshot();
    const value = Math.round(territory.player * 100);
    this.percent.textContent = `${value}%`;
    this.playerBar.style.width = `${value}%`;
    this.legend.textContent = `СПЕКТР ${value}% · КАРМИН ${Math.round(territory.red * 100)}% · ВЕКТОР ${Math.round(territory.violet * 100)}%`;
    const selectedId = this.getSelected().at(-1);
    const node = this.engine.nodes[selectedId];
    this.nodeLabel.textContent = node?.owner === 'player' ? selectedId.toUpperCase() : 'НЕТ ЦЕЛИ';
    this.root.querySelectorAll('[data-upgrade]').forEach((button) => {
      const path = button.dataset.upgrade;
      const level = node?.owner === 'player' ? node.upgrades[path] : 0;
      const cost = node?.owner === 'player' ? this.engine.upgradeCost(node, path) : Infinity;
      button.disabled = !node || node.owner !== 'player' || level >= 3 || this.engine.energy < cost;
      button.querySelector('em').textContent = level >= 3 ? 'MAX' : Number.isFinite(cost) ? `УР.${level} · ${cost}` : '—';
    });
    this.drawMiniMap();
  }

  state() {
    return {
      unitType: this.unitType,
      active: this.active ? { sources: [...this.active.sources], targets: [...this.active.targets] } : null,
      territory: this.engine?.territorySnapshot() || null,
    };
  }

  showDrag(text, event) {
    if (!this.dragLabel) return;
    this.dragLabel.style.display = 'block';
    this.dragLabel.style.left = `${event.offsetX + 12}px`;
    this.dragLabel.style.top = `${event.offsetY + 12}px`;
    this.dragLabel.textContent = text;
  }

  hideDrag() {
    if (this.dragLabel) this.dragLabel.style.display = 'none';
  }

  announce(text, type = '') {
    const notices = document.querySelector('#notificationStack');
    const log = document.querySelector('#combatLog');
    if (notices) {
      const element = document.createElement('div');
      element.className = `notice ${type}`;
      element.textContent = text;
      notices.append(element);
      setTimeout(() => element.remove(), 2600);
    }
    if (log) {
      const element = document.createElement('div');
      element.className = 'log-item';
      element.textContent = `${String(Math.floor((this.engine?.time || 0) / 60)).padStart(2, '0')}:${String(Math.floor((this.engine?.time || 0) % 60)).padStart(2, '0')} · ${text}`;
      log.prepend(element);
    }
  }
}
''')

write("neon-dominion/styles-v4.css", r'''
.territory-console{display:grid;gap:10px;padding:12px;border:1px solid rgba(84,245,255,.11);border-radius:18px;background:linear-gradient(145deg,rgba(12,20,38,.86),rgba(4,8,18,.76));box-shadow:inset 0 1px rgba(255,255,255,.035),0 16px 40px rgba(0,0,0,.2)}
.territory-title,.upgrade-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.territory-title h3{margin:2px 0 0;font-size:15px}.territory-title strong{font-size:22px;color:#54f5ff;text-shadow:0 0 20px rgba(84,245,255,.42)}
.unit-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:5px}.unit-grid button{min-width:0;padding:8px 3px;border:1px solid rgba(255,255,255,.07);border-radius:11px;color:#8e9ab7;background:rgba(255,255,255,.025);cursor:pointer;transition:.18s}.unit-grid button i{display:block;margin-bottom:3px;color:#54f5ff;font-size:15px;font-style:normal}.unit-grid button span{display:block;font-size:8px;font-weight:900;letter-spacing:.04em}.unit-grid button small{font-size:7px;opacity:.62}.unit-grid button:hover,.unit-grid button.active{color:#fff;border-color:rgba(84,245,255,.44);background:linear-gradient(145deg,rgba(84,245,255,.17),rgba(79,102,255,.1));box-shadow:0 0 18px rgba(84,245,255,.1)}
.upgrade-head{font-size:8px;letter-spacing:.12em;color:#75809a}.upgrade-head b{color:#d9e3ff}.upgrade-grid{display:grid;gap:5px}.upgrade-grid button{display:grid;grid-template-columns:30px 1fr auto;align-items:center;gap:7px;min-height:43px;padding:5px 8px;border:1px solid rgba(255,255,255,.065);border-radius:11px;color:#c8d2ec;background:rgba(255,255,255,.025);text-align:left;cursor:pointer}.upgrade-grid button:hover:not(:disabled){border-color:rgba(84,245,255,.34);background:rgba(84,245,255,.08)}.upgrade-grid button:disabled{opacity:.38;cursor:not-allowed}.upgrade-grid button i{display:grid;place-items:center;width:28px;height:28px;border-radius:9px;color:#54f5ff;background:rgba(84,245,255,.08);font-style:normal}.upgrade-grid button b,.upgrade-grid button small{display:block}.upgrade-grid button b{font-size:9px}.upgrade-grid button small{margin-top:2px;color:#75809a;font-size:7px}.upgrade-grid button em{font-size:8px;font-style:normal;font-weight:900;color:#ffd66b;white-space:nowrap}
.territory-meter span{display:block;height:5px;overflow:hidden;border-radius:99px;background:rgba(255,255,255,.055)}.territory-meter i{display:block;width:0;height:100%;border-radius:inherit;background:linear-gradient(90deg,#54f5ff,#697dff);box-shadow:0 0 14px rgba(84,245,255,.36);transition:width .35s}.territory-meter small{display:block;margin-top:5px;color:#75809a;font-size:7px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.minimap-shell{position:relative;overflow:hidden;border:1px solid rgba(84,245,255,.1);border-radius:13px;background:#030712}.minimap-shell canvas{display:block;width:100%;height:auto;aspect-ratio:5/3}.minimap-shell span{position:absolute;left:7px;bottom:5px;padding:3px 5px;border-radius:6px;color:#aab6d0;background:rgba(2,5,12,.72);font-size:6px;font-weight:900;letter-spacing:.1em;backdrop-filter:blur(8px)}.territory-help{margin:0;color:#7f8aa4;font-size:8px;line-height:1.45}
@media(max-width:1100px){.unit-grid{grid-template-columns:repeat(2,1fr)}.territory-console{padding:10px}}
@media(max-width:900px){.territory-console{margin-bottom:70px}.unit-grid{grid-template-columns:repeat(4,1fr)}.upgrade-grid{grid-template-columns:repeat(2,1fr)}.upgrade-grid button{grid-template-columns:26px 1fr}.upgrade-grid button em{grid-column:1/-1;text-align:right}.minimap-shell{max-width:340px;margin:auto}}
@media(max-width:520px){.territory-console{gap:8px;padding:9px}.territory-title h3{font-size:13px}.territory-title strong{font-size:18px}.upgrade-grid{grid-template-columns:1fr 1fr}.upgrade-grid button{min-height:52px;padding:5px}.upgrade-grid button small{display:none}.unit-grid button{padding:7px 2px}.territory-help{font-size:7px}}
''')

write("neon-dominion/tests/territory.test.mjs", r'''
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
''')

write("neon-dominion/tests/browser-check.mjs", r'''
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const url = process.env.NEON_DOMINION_URL || 'http://127.0.0.1:8080/neon-dominion/';
const output = process.env.QA_OUTPUT_DIR || 'artifacts/neon-dominion';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const report = { desktop: {}, mobile: {} };

function mapPoint(box, x, y) {
  const portrait = box.width < 620 && box.height > box.width * 1.15;
  if (portrait) return { x: box.x + x * box.width / 1200, y: box.y + y * box.height / 720 };
  const scale = Math.min(box.width / 1200, box.height / 720);
  return { x: box.x + (box.width - 1200 * scale) / 2 + x * scale, y: box.y + (box.height - 720 * scale) / 2 + y * scale };
}

async function desktopScenario() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  await page.addInitScript(() => {
    window.__qaLongTasks = [];
    try { new PerformanceObserver((list) => window.__qaLongTasks.push(...list.getEntries().map((entry) => entry.duration))).observe({ entryTypes: ['longtask'] }); } catch {}
  });
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(() => window.NeonDominionQA.startLevel('crossfire'));
  await page.waitForFunction(() => window.NeonDominionQA?.getTerritory()?.territory?.player > 0);
  await page.waitForFunction(() => window.NeonDominionQA.assetsReady());
  assert.equal(await page.locator('#territoryConsole').count(), 1);
  assert.equal(await page.locator('#miniMap').count(), 1);

  await page.evaluate(() => { window.NeonDominionQA.getEngine().energy = 100; });
  await page.locator('[data-upgrade="industry"]').click();
  await page.waitForFunction(() => window.NeonDominionQA.getState().nodes.find((node) => node.id === 'p0').upgrades.industry === 1);
  await page.locator('[data-unit="rapid"]').click();

  const box = await page.locator('#battlefield').boundingBox();
  const source = mapPoint(box, 165, 360);
  const remoteEnemy = mapPoint(box, 1020, 190);
  await page.mouse.move(source.x, source.y);
  await page.mouse.down();
  await page.mouse.move(remoteEnemy.x, remoteEnemy.y, { steps: 30 });
  await page.mouse.up();
  await page.waitForFunction(() => window.NeonDominionQA.getState().convoys.some((convoy) => convoy.from === 'p0' && convoy.to === 'r0'));

  const state = await page.evaluate(() => window.NeonDominionQA.getState());
  const territory = await page.evaluate(() => window.NeonDominionQA.getTerritory());
  const performanceData = await page.evaluate(() => ({ longTasks: window.__qaLongTasks || [] }));
  assert.equal(state.nodes.find((node) => node.id === 'p0').upgrades.industry, 1);
  assert.equal(state.convoys.find((convoy) => convoy.from === 'p0').unitType, 'rapid');
  assert.ok(Object.values(territory.territory).reduce((sum, value) => sum + value, 0) > 0.99);
  assert.equal(errors.length, 0);
  assert.ok(performanceData.longTasks.filter((duration) => duration > 180).length <= 1);
  report.desktop = { territory: territory.territory, unit: territory.unitType, upgraded: true, foggedEnemy: await page.evaluate(() => !window.NeonDominionQA.isVisible('v0')), longTasks: performanceData.longTasks, errors };
  await page.screenshot({ path: `${output}/desktop-territory.png`, fullPage: true });
  await page.close();
}

async function mobileScenario() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(() => { window.NeonDominionQA.startLevel('crossfire'); window.NeonDominionQA.setUnit('heavy'); });
  await page.waitForFunction(() => window.NeonDominionQA.getState()?.nodes?.length >= 10);
  const box = await page.locator('#battlefield').boundingBox();
  const p0 = mapPoint(box, 165, 360);
  const p1 = mapPoint(box, 320, 170);
  const r0 = mapPoint(box, 1020, 190);
  const v0 = mapPoint(box, 1020, 530);
  const client = await context.newCDPSession(page);
  const point = (position) => ({ x: position.x, y: position.y, radiusX: 8, radiusY: 8, force: 1, id: 1 });
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(p0)] });
  for (const [from, to, steps] of [[p0, p1, 12], [p1, r0, 20], [r0, v0, 14]]) {
    for (let step = 1; step <= steps; step += 1) {
      const t = step / steps;
      await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t })] });
    }
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForFunction(() => window.NeonDominionQA.getState().convoys.filter((convoy) => convoy.to === 'r0').length >= 2);
  const state = await page.evaluate(() => window.NeonDominionQA.getState());
  const dimensions = await page.evaluate(() => { const rect = document.querySelector('#battlefield').getBoundingClientRect(); return { scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth, canvas: { width: rect.width, height: rect.height } }; });
  const routed = state.convoys.filter((convoy) => convoy.to === 'r0');
  assert.equal(routed.length, 2);
  assert.ok(routed.every((convoy) => convoy.route[0] === 'v0'));
  assert.ok(routed.every((convoy) => convoy.unitType === 'heavy'));
  assert.ok(state.nodes.find((node) => node.id === 'p0').troops < 3);
  assert.ok(state.nodes.find((node) => node.id === 'p1').troops < 3);
  assert.equal(state.stats.chainedRoutes, 1);
  assert.ok(dimensions.scroll <= dimensions.client + 1);
  assert.equal(errors.length, 0);
  report.mobile = { width: `${dimensions.scroll}/${dimensions.client}`, canvas: dimensions.canvas, sources: ['p0', 'p1'], targets: ['r0', 'v0'], routes: routed.map((convoy) => convoy.route), unit: routed[0].unitType, territory: state.territory, errors };
  await page.screenshot({ path: `${output}/mobile-territory-route.png`, fullPage: true });
  await context.close();
}

await desktopScenario();
await mobileScenario();
await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
await browser.close();
''')

# Patch game client with Territory integration.
game = ROOT / "neon-dominion/src/game.js"
text = game.read_text(encoding="utf-8")
replacements = [
("import { DominionEngine } from './engine.js';", "import { DominionEngine } from './engine.js';\nimport { TerritoryController } from './territory.js';"),
("const profile = loadProfile();\nconst particles", "const profile = loadProfile();\nconst territory = new TerritoryController({\n  canvas,\n  ctx,\n  dragLabel: dom.dragLabel,\n  getEngine: () => engine,\n  screenToWorld,\n  hitNode,\n  allowChain: () => !selectionMode && !groupTargetMode && !armedAbility,\n  getSelected: () => [...selectedIds],\n  setSelected: (ids, primary) => {\n    selectedIds = new Set(ids.filter((id) => engine?.nodes[id]?.owner === 'player'));\n    primarySelectedId = primary || [...selectedIds][0] || null;\n    selectedSignature = '';\n    syncSelected(true);\n    syncGroupControls();\n  },\n});\nconst particles"),
("  selectedIds = new Set(engine.factionNodes('player').slice(0, 1).map((node) => node.id));", "  selectedIds = new Set(engine.factionNodes('player').slice(0, 1).map((node) => node.id));\n  territory.start(engine);"),
("  currentMap = null;\n  selectedIds.clear();", "  currentMap = null;\n  territory.stop();\n  selectedIds.clear();"),
("  const hit = hitNode(world);\n\n  if (pointers.size === 2)", "  const hit = hitNode(world);\n\n  if (territory.pointerDown(event, hit)) return;\n\n  if (pointers.size === 2)"),
("  pointerWorld = screenToWorld(event.clientX, event.clientY);\n  if (selectionBox)", "  pointerWorld = screenToWorld(event.clientX, event.clientY);\n  if (territory.pointerMove(event, pointerWorld)) return;\n  if (selectionBox)"),
("  const target = hitNode(world);\n\n  if (selectionBox)", "  const target = hitNode(world);\n\n  if (territory.pointerUp(event, target)) {\n    dragOrder = null;\n    pan = null;\n    pinch = null;\n    pointers.delete(event.pointerId);\n    dom.dragLabel.style.display = 'none';\n    return;\n  }\n\n  if (selectionBox)"),
("    drawInfluenceField(now);\n    drawConvoys(now);\n    drawNodes(now);\n    drawEffects();", "    territory.drawTerritory(ctx, now);\n    drawInfluenceField(now);\n    territory.drawFog(ctx, now);\n    drawConvoys(now);\n    drawNodes(now);\n    drawEffects();\n    territory.drawOverlay(ctx, now);"),
("  for (const node of Object.values(engine.nodes)) {\n    const config", "  for (const node of Object.values(engine.nodes)) {\n    if (!territory.isNodeVisible(node)) continue;\n    const config"),
("  for (const convoy of engine.convoys) {\n    const geometry", "  for (const convoy of engine.convoys) {\n    if (!territory.isConvoyVisible(convoy)) continue;\n    const geometry"),
("  syncGroupControls();\n  const enemyPower", "  syncGroupControls();\n  territory.sync(force);\n  const enemyPower"),
("  sendMany: (fromIds, to, ratio = 0.5) => engine?.sendMany(fromIds, to, ratio, 'player'),", "  sendMany: (fromIds, to, ratio = 0.5) => engine?.sendMany(fromIds, to, ratio, 'player'),\n  sendRoute: (fromIds, targets, unit = 'assault') => engine?.sendRoute(fromIds, targets, unit, 'player'),\n  getEngine: () => engine,\n  setUnit: (type) => territory.setUnit(type),\n  upgrade: (id, path) => engine?.upgradeNode(id, path, 'player'),\n  getTerritory: () => territory.state(),\n  isVisible: (id) => engine?.isVisible(id, 'player') ?? false,"),
]
for old, new in replacements:
    if old not in text:
        raise SystemExit(f"game.js marker not found: {old[:90]!r}")
    text = text.replace(old, new, 1)
game.write_text(text, encoding="utf-8")

# Update HTML copy and load the new visual layer.
replace_once("neon-dominion/index.html", '<link rel="stylesheet" href="styles-v2.css">', '<link rel="stylesheet" href="styles-v2.css">\n  <link rel="stylesheet" href="styles-v4.css">')
replace_once("neon-dominion/index.html", '<title>NEON DOMINION — Свободный фронт</title>', '<title>NEON DOMINION — Territory</title>')
replace_once("neon-dominion/index.html", 'content="NEON DOMINION — премиальная браузерная стратегия свободного захвата баз."', 'content="NEON DOMINION: Territory — браузерная RTS с территориями, туманом войны, модернизацией и классами войск."')
replace_once("neon-dominion/index.html", '<span>СВОБОДНОЕ УПРАВЛЕНИЕ</span>', '<span>ЦЕПНОЙ МАРШРУТ</span>')
replace_once("neon-dominion/index.html", 'Зажмите первую свою базу и, не отпуская, проведите через вторую, третью и остальные базы. Отпустите палец на цели — все выбранные базы отправят весь гарнизон и начнут новый набор с нуля.', 'Зажмите свою базу, проведите через другие источники, затем через одну или несколько целей. Выжившие силы продолжат маршрут; базы отправят весь гарнизон и начнут новый набор.')
replace_once("neon-dominion/index.html", '<div class="hero-badge">FREE FRONT UPDATE</div>', '<div class="hero-badge">TERRITORY UPDATE</div>')
replace_once("neon-dominion/index.html", 'Свободное направление армий, групповые приказы, новые премиальные базы и глубокое тактическое управление.', 'Зоны влияния, туман войны, четыре класса войск, модернизация баз, перехваты и цепные маршруты через несколько целей.')

# Extend syntax checks.
replace_once("neon-dominion/package.json", 'node --check src/game.js && node --check sw.js', 'node --check src/game.js && node --check src/territory.js && node --check sw.js')

# PWA cache v4.
write("neon-dominion/sw.js", r'''
const CACHE = 'neon-dominion-v4';
const FILES = [
  './', './index.html', './styles.css', './styles-v2.css', './styles-v4.css', './manifest.webmanifest',
  './assets/icon.svg', './assets/arena-background.svg', './assets/base-core.svg', './assets/base-factory.svg',
  './assets/base-fortress.svg', './assets/base-relay.svg', './assets/base-reactor.svg',
  './src/maps.js', './src/engine.js', './src/territory.js', './src/game.js',
];
self.addEventListener('install', (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', (event) => event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(caches.match(event.request).then((hit) => hit || fetch(event.request).then((response) => {
    const copy = response.clone();
    caches.open(CACHE).then((cache) => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match('./index.html'))));
});
''')

# Strengthen Pages verification for the Territory release.
pages = ROOT / ".github/workflows/pages.yml"
pages_text = pages.read_text(encoding="utf-8")
pages_text = pages_text.replace('Verify published endpoints and Free Front assets', 'Verify published endpoints and Territory assets')
pages_text = pages_text.replace('styles.css styles-v2.css src/maps.js src/engine.js src/game.js', 'styles.css styles-v2.css styles-v4.css src/maps.js src/engine.js src/territory.js src/game.js')
pages_text = pages_text.replace('curl --fail --location "$NEON/src/engine.js" | grep -q "sendMany"', 'curl --fail --location "$NEON/src/engine.js" | grep -q "sendRoute"\n          curl --fail --location "$NEON/src/territory.js" | grep -q "TerritoryController"')
pages_text = pages_text.replace('echo "Verified Free Front: $NEON/"', 'echo "Verified Territory: $NEON/"')
pages.write_text(pages_text, encoding="utf-8")

print('NEON DOMINION Territory patch applied')
