import { FACTIONS, NODE_TYPES, cloneMap } from './maps.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export class DominionEngine {
  constructor(map, options = {}) {
    this.map = cloneMap(map);
    this.nodes = Object.fromEntries(this.map.nodes.map((node) => [node.id, node]));
    this.links = this.map.links;
    this.convoys = [];
    this.effects = [];
    this.time = 0;
    this.speed = 1;
    this.result = null;
    this.energy = 25;
    this.reputation = 100;
    this.stats = { sent: 0, captured: 0, lost: 0, abilities: 0, groupOrders: 0 };
    this.boostUntil = 0;
    this.aiClock = { red: 1.1, violet: 1.7 };
    this.difficulty = options.difficulty || 1;
    this.rng = mulberry32(options.seed || hash(map.id));
    this.events = [];
    this.abilityHistory = new Set();
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

  send(fromId, toId, ratio = 0.5, owner = 'player') {
    const from = this.nodes[fromId];
    const to = this.nodes[toId];
    if (this.result || !from || !to || from.id === to.id || from.owner !== owner) return false;

    const amount = Math.floor(from.troops * clamp(ratio, 0.15, 0.9));
    if (amount < 2) return false;

    from.troops -= amount;
    const length = Math.max(1, distance(from, to));
    const curve = (this.rng() - 0.5) * Math.min(150, length * 0.24);
    this.convoys.push({
      id: `c${this.time.toFixed(3)}-${this.rng()}`,
      from: fromId,
      to: toId,
      owner,
      amount,
      progress: 0,
      speed: owner === 'player' ? 158 : 139 + this.difficulty * 9,
      length,
      curve,
    });
    if (owner === 'player') this.stats.sent += amount;
    return true;
  }

  sendMany(fromIds, toId, ratio = 0.5, owner = 'player') {
    const unique = [...new Set(fromIds)].filter((id) => id !== toId);
    let sent = 0;
    for (const fromId of unique) {
      if (this.send(fromId, toId, ratio, owner)) sent += 1;
    }
    if (owner === 'player' && sent > 1) this.stats.groupOrders += 1;
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

  capacity(node) {
    return NODE_TYPES[node.type].capacity + (node.level - 1) * 18;
  }

  update(dt) {
    if (this.result || this.speed === 0) return;
    dt = Math.min(0.05, dt) * this.speed;
    this.time += dt;
    this.energy = clamp(this.energy + dt * 1.6, 0, 100);

    for (const node of Object.values(this.nodes)) {
      if (node.owner === 'neutral') continue;
      const config = NODE_TYPES[node.type];
      let growth = config.growth * (1 + (node.level - 1) * 0.18);
      if (node.owner === 'player' && this.time < this.boostUntil) growth *= 1.85;
      node.troops = Math.min(this.capacity(node), node.troops + growth * dt);
    }

    const arrived = [];
    for (const convoy of this.convoys) {
      convoy.progress += convoy.speed * dt / convoy.length;
      if (convoy.progress >= 1) arrived.push(convoy);
    }
    for (const convoy of arrived) {
      this.resolveArrival(convoy);
      this.convoys.splice(this.convoys.indexOf(convoy), 1);
    }

    this.effects.forEach((effect) => { effect.life -= dt; });
    this.effects = this.effects.filter((effect) => effect.life > 0);
    this.updateAI('red', dt);
    this.updateAI('violet', dt);
    this.checkResult();
  }

  resolveArrival(convoy) {
    const target = this.nodes[convoy.to];
    if (!target) return;
    if (target.owner === convoy.owner) {
      target.troops = Math.min(this.capacity(target), target.troops + convoy.amount);
      return;
    }

    const config = NODE_TYPES[target.type];
    const shield = target.shieldUntil > this.time ? 1.65 : 1;
    const effective = convoy.amount / (config.defense * shield);
    if (effective >= target.troops) {
      const previous = target.owner;
      const remaining = Math.max(2, Math.round(convoy.amount - target.troops * config.defense * shield));
      target.owner = convoy.owner;
      target.troops = remaining;
      target.shieldUntil = 0;
      if (convoy.owner === 'player') {
        this.stats.captured += 1;
        this.events.push({ type: 'good', text: `База ${target.id} захвачена` });
      }
      if (previous === 'player') {
        this.stats.lost += 1;
        this.reputation = clamp(this.reputation - 8, 0, 100);
        this.events.push({ type: 'bad', text: `База ${target.id} потеряна` });
      }
    } else {
      target.troops = Math.max(0, target.troops - effective);
    }
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
    this.send(source.id, target.id, source.troops > 70 ? 0.66 : 0.48, owner);
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
      nodes: Object.values(this.nodes).map((node) => ({ ...node })),
      convoys: this.convoys.map((convoy) => ({ ...convoy })),
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
