import { FACTIONS, NODE_TYPES, cloneMap } from './maps.js';
import { BUILDINGS, FORMATIONS, AI_PERSONALITIES, normalizeComposition } from './war-room-core.js';

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

export const BUILDABLE_TYPES = BUILDINGS;
export const FORMATION_TYPES = FORMATIONS;

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
      built: 0,
      redirected: 0,
      recalled: 0,
      split: 0,
      merged: 0,
      waypoints: 0,
      eventsSurvived: 0,
      bossesDefeated: 0,
    };
    this.boostUntil = 0;
    this.aiClock = { red: 1.1, violet: 1.7 };
    this.aiPersonalities = { red: options.aiPersonalities?.red || 'aggressive', violet: options.aiPersonalities?.violet || 'tactical' };
    this.buildCounter = 0;
    this.waypointCounter = 0;
    this.mode = options.mode || map.warMode || 'conquest';
    this.modeState = { hold: 0, wave: 0, score: 0, boss: null, bossPhase: 0, bossMax: 0 };
    this.eventModifiers = { speed: 1, growth: 1, energy: 1, vision: 1, reveal: false, turret: 1 };
    this.defaultSendOptions = { unitType: 'assault', formation: 'wedge', composition: { assault: 100 } };
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
    const config = NODE_TYPES[node.type] || NODE_TYPES.relay;
    const territoryBonus = 1 + (this.territory[node.owner] || 0) * 0.22;
    const industryBonus = 1 + node.upgrades.industry * 0.24;
    const boost = node.owner === 'player' && this.time < this.boostUntil ? 1.85 : 1;
    const commandBoost = Object.values(this.nodes).some((other) => other.owner === node.owner && other.type === 'command' && distance(other, node) <= 210) ? 1.16 : 1;
    const infected = node.infectedUntil > this.time ? 0 : 1;
    return config.growth * (1 + (node.level - 1) * 0.18) * territoryBonus * industryBonus * boost * commandBoost * this.eventModifiers.growth * infected;
  }

  defense(node) {
    return NODE_TYPES[node.type].defense * (1 + node.upgrades.fortification * 0.24);
  }

  visionRadius(node) {
    return (132 + node.upgrades.recon * 54 + (node.type === 'relay' ? 38 : 0) + (node.type === 'radar' ? 260 : 0)) * this.eventModifiers.vision;
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
    const explicitOptions = options;
    options = { ...(owner === 'player' ? this.defaultSendOptions || {} : {}), ...options };
    if (!explicitOptions.composition && explicitOptions.unitType) options.composition = { [explicitOptions.unitType]: 100 };
    const from = this.nodes[fromId];
    const to = this.nodes[toId];
    if (this.result || !from || !to || from.id === to.id || from.owner !== owner) return false;

    const normalizedRatio = clamp(ratio, 0.15, 1);
    const sendAll = normalizedRatio >= 0.999;
    const amount = sendAll ? from.troops : Math.floor(from.troops * normalizedRatio);
    if (amount < (sendAll ? 0.5 : 2)) return false;

    const unitType = UNIT_TYPES[options.unitType] ? options.unitType : 'assault';
    const unit = UNIT_TYPES[unitType];
    const formationId = FORMATIONS[options.formation] ? options.formation : 'wedge';
    const formation = FORMATIONS[formationId];
    const composition = normalizeComposition(options.composition || { [unitType]: 100 });
    const mixed = Object.entries(composition).reduce((acc, [id, percent]) => {
      const profile = UNIT_TYPES[id] || UNIT_TYPES.assault;
      const weight = percent / 100;
      acc.speed += profile.speed * weight;
      acc.attack += profile.attack * weight;
      acc.defense += profile.defense * weight;
      acc.vision += profile.vision * weight;
      return acc;
    }, { speed: 0, attack: 0, defense: 0, vision: 0 });
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
        * (mixed.speed || unit.speed)
        * formation.speed
        * (1 + from.upgrades.logistics * 0.14)
        * territorySpeed
        * (from.type === 'portal' ? 1.55 : 1)
        * (Number(options.speedBonus) || 1)
        * this.eventModifiers.speed,
      length,
      curve,
      unitType,
      formation: formationId,
      composition,
      attack: (mixed.attack || unit.attack) * formation.attack,
      defense: (mixed.defense || unit.defense) * formation.defense,
      vision: (mixed.vision || unit.vision) * (formation.vision || 1),
      origin: options.origin || fromId,
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

  sendRoute(fromIds, targetIds, unitType = 'assault', owner = 'player', options = {}) {
    const targets = [...new Set(targetIds)].filter((id) => this.nodes[id]);
    if (!targets.length) return 0;
    const sent = this.sendMany(fromIds, targets[0], owner === 'player' ? 1 : 0.55, owner, {
      ...options,
      unitType,
      route: targets.slice(1),
    });
    if (owner === 'player' && sent && targets.length > 1) this.stats.chainedRoutes += 1;
    return sent;
  }

  buildNode(type, x, y, owner = 'player') {
    const blueprint = BUILDINGS[type];
    if (this.result || !blueprint || owner !== 'player' || this.energy < blueprint.cost) return null;
    const point = { x: clamp(Number(x), 40, 1160), y: clamp(Number(y), 40, 680) };
    const tooClose = Object.values(this.nodes).some((node) => !node.virtual && distance(node, point) < 82);
    if (tooClose) return null;
    const id = `b${++this.buildCounter}-${type}`;
    const node = {
      id, ...point, type, owner, troops: blueprint.troops, level: 1,
      upgrades: { ...defaultUpgrades() }, shieldUntil: 0, constructed: true,
    };
    this.nodes[id] = node;
    this.energy -= blueprint.cost;
    this.stats.built += 1;
    this.effects.push({ type: 'upgrade', x: node.x, y: node.y, life: 1, path: type });
    this.events.push({ type: 'good', text: `${blueprint.name} построен` });
    this.recalculateTerritory();
    return node;
  }

  addWaypoint(x, y) {
    const id = `wp${++this.waypointCounter}`;
    this.nodes[id] = {
      id, x: clamp(Number(x), 20, 1180), y: clamp(Number(y), 20, 700),
      type: 'waypoint', owner: 'neutral', troops: 0, level: 1, virtual: true,
      upgrades: { ...defaultUpgrades() }, shieldUntil: 0,
    };
    this.stats.waypoints += 1;
    return id;
  }

  clearWaypoints() {
    const used = new Set(this.convoys.flatMap((convoy) => [convoy.from, convoy.to, ...(convoy.route || [])]));
    for (const node of Object.values(this.nodes)) if (node.virtual && !used.has(node.id)) delete this.nodes[node.id];
  }

  sendWaypointRoute(fromIds, points = [], targetId, options = {}) {
    if (!this.nodes[targetId]) return 0;
    const waypoints = points.slice(0, 8).map((point) => this.addWaypoint(point.x, point.y));
    return this.sendRoute(fromIds, [...waypoints, targetId], options.unitType || 'assault', options.owner || 'player', options);
  }

  retargetConvoy(convoyId, targetId, route = []) {
    const convoy = this.convoys.find((item) => item.id === convoyId);
    const target = this.nodes[targetId];
    if (!convoy || !target || convoy.owner !== 'player') return false;
    const point = this.convoyPoint(convoy);
    const waypoint = this.addWaypoint(point.x, point.y);
    convoy.from = waypoint;
    convoy.to = targetId;
    convoy.progress = 0;
    convoy.length = Math.max(1, distance(this.nodes[waypoint], target));
    convoy.curve = (this.rng() - 0.5) * Math.min(110, convoy.length * 0.18);
    convoy.route = [...route].filter((id) => this.nodes[id]);
    this.stats.redirected += 1;
    this.events.push({ type: 'good', text: `Колонна перенаправлена к ${targetId.toUpperCase()}` });
    return true;
  }

  recallConvoy(convoyId) {
    const convoy = this.convoys.find((item) => item.id === convoyId);
    if (!convoy || convoy.owner !== 'player' || !this.nodes[convoy.origin]) return false;
    const ok = this.retargetConvoy(convoyId, convoy.origin, []);
    if (ok) {
      this.stats.recalled += 1;
      this.events.push({ type: 'good', text: 'Колонна возвращается на исходную базу' });
    }
    return ok;
  }

  splitConvoy(convoyId, targetId, ratio = 0.5) {
    const convoy = this.convoys.find((item) => item.id === convoyId);
    const target = this.nodes[targetId];
    if (!convoy || !target || convoy.owner !== 'player' || convoy.amount < 4) return null;
    const part = convoy.amount * clamp(ratio, 0.25, 0.75);
    convoy.amount -= part;
    const point = this.convoyPoint(convoy);
    const waypoint = this.addWaypoint(point.x, point.y);
    const clone = {
      ...convoy,
      id: `split-${this.time.toFixed(3)}-${this.rng()}`,
      from: waypoint,
      to: targetId,
      amount: part,
      progress: 0,
      length: Math.max(1, distance(this.nodes[waypoint], target)),
      curve: (this.rng() - 0.5) * 90,
      route: [],
    };
    this.convoys.push(clone);
    this.stats.split += 1;
    return clone;
  }

  mergeConvoys(ids = []) {
    const chosen = this.convoys.filter((convoy) => ids.includes(convoy.id) && convoy.owner === 'player');
    if (chosen.length < 2) return false;
    const points = chosen.map((convoy) => this.convoyPoint(convoy));
    const near = points.every((point) => Math.hypot(point.x - points[0].x, point.y - points[0].y) < 90);
    if (!near) return false;
    const lead = chosen[0];
    lead.amount = chosen.reduce((sum, convoy) => sum + convoy.amount, 0);
    this.convoys = this.convoys.filter((convoy) => convoy === lead || !ids.includes(convoy.id));
    this.stats.merged += 1;
    this.events.push({ type: 'good', text: `Объединено колонн: ${chosen.length}` });
    return true;
  }


  toggleConvoyHold(convoyId, held = null) {
    const convoy = this.convoys.find((item) => item.id === convoyId);
    if (!convoy || convoy.owner !== 'player') return false;
    convoy.held = held == null ? !convoy.held : Boolean(held);
    this.events.push({ type: 'good', text: convoy.held ? 'Колонна остановлена' : 'Колонна продолжает движение' });
    return convoy.held;
  }

  patrolConvoy(convoyId, targetIds = []) {
    const convoy = this.convoys.find((item) => item.id === convoyId);
    const route = [...new Set(targetIds)].filter((id) => this.nodes[id] && !this.nodes[id].virtual);
    if (!convoy || convoy.owner !== 'player' || route.length < 2) return false;
    convoy.patrolRoute = route;
    const currentIndex = route.indexOf(convoy.to);
    convoy.patrolIndex = currentIndex >= 0 ? currentIndex : 0;
    convoy.route = [];
    this.events.push({ type: 'good', text: `Патрульный маршрут: ${route.map((id) => id.toUpperCase()).join(' ↔ ')}` });
    return true;
  }

  nextPatrol(convoy, amount) {
    if (!Array.isArray(convoy.patrolRoute) || convoy.patrolRoute.length < 2 || amount < 0.5) return false;
    convoy.patrolIndex = ((convoy.patrolIndex ?? 0) + 1) % convoy.patrolRoute.length;
    let nextId = convoy.patrolRoute[convoy.patrolIndex];
    if (nextId === convoy.to) {
      convoy.patrolIndex = (convoy.patrolIndex + 1) % convoy.patrolRoute.length;
      nextId = convoy.patrolRoute[convoy.patrolIndex];
    }
    return this.continueConvoy(convoy, nextId, amount);
  }

  setDefaultTactics(options = {}) {
    this.defaultSendOptions = {
      ...this.defaultSendOptions,
      ...options,
      composition: normalizeComposition(options.composition || this.defaultSendOptions.composition),
    };
    return { ...this.defaultSendOptions, composition: { ...this.defaultSendOptions.composition } };
  }

  setAIProfile(owner, personality) {
    if (!AI_PERSONALITIES[personality] || !['red', 'violet'].includes(owner)) return false;
    this.aiPersonalities[owner] = personality;
    return true;
  }

  setEventModifiers(modifiers = {}) {
    this.eventModifiers = { ...this.eventModifiers, ...modifiers };
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
    this.energy = clamp(this.energy + dt * (1.32 + reactorBonus + this.territory.player * 0.45) * this.eventModifiers.energy, 0, 100);

    for (const node of Object.values(this.nodes)) {
      if (node.owner === 'neutral') continue;
      node.troops = Math.min(this.capacity(node), node.troops + this.growth(node) * dt);
    }

    this.updateBuildings(dt);
    for (const convoy of this.convoys) {
      if (!convoy.held) convoy.progress += convoy.speed * dt / convoy.length;
    }
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
    this.clearWaypoints();
    this.checkResult();
  }

  updateBuildings(dt) {
    for (const node of Object.values(this.nodes)) {
      if (node.owner !== 'player') continue;
      if (node.type === 'turret') {
        node.fireClock = (node.fireClock || 0) - dt;
        if (node.fireClock <= 0) {
          const target = this.convoys.find((convoy) => convoy.owner !== 'player' && distance(this.convoyPoint(convoy), node) < 185);
          if (target) {
            target.amount -= 4.5 * this.eventModifiers.turret;
            node.fireClock = 1.15;
            this.effects.push({ type: 'strike', x: this.convoyPoint(target).x, y: this.convoyPoint(target).y, life: .35 });
          }
        }
      }
      if (node.type === 'shieldgen') {
        node.shieldClock = (node.shieldClock || 0) - dt;
        if (node.shieldClock <= 0) {
          const ally = this.factionNodes('player').filter((item) => !item.virtual && distance(item, node) <= 220).sort((a, b) => a.troops - b.troops)[0];
          if (ally) ally.shieldUntil = Math.max(ally.shieldUntil || 0, this.time + 7);
          node.shieldClock = 14;
        }
      }
    }
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
        const reversedRoute = a.from === b.to && a.to === b.from;
        const interceptRadius = reversedRoute ? 92 : 30;
        if (distance(pointA, pointB) > interceptRadius) continue;
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
    if (target.virtual) {
      if (convoy.route.length) return this.continueConvoy(convoy, convoy.route.shift(), convoy.amount);
      if (convoy.escort) this.modeState.escortComplete = true;
      if (this.nextPatrol(convoy, convoy.amount)) return true;
      return false;
    }

    if (target.owner === convoy.owner) {
      if (convoy.route.length) return this.continueConvoy(convoy, convoy.route.shift(), convoy.amount);
      if (this.nextPatrol(convoy, convoy.amount)) return true;
      const heal = target.type === 'medbay' ? 1.16 : 1;
      target.troops = Math.min(this.capacity(target), target.troops + convoy.amount * heal);
      return false;
    }

    const shield = target.shieldUntil > this.time ? 1.65 : 1;
    const effective = convoy.amount * convoy.attack / (this.defense(target) * shield);
    if (effective >= target.troops) {
      if (target.boss && target.bossPhase > 1) {
        target.bossPhase -= 1;
        target.troops = target.bossPhaseTroops || Math.max(55, target.bossMaxTroops * (0.58 + target.bossPhase * 0.12));
        this.effects.push({ type: 'intercept', x: target.x, y: target.y, life: 1.4 });
        this.events.push({ type: 'bad', text: `${target.bossName || 'БОСС'}: активирована фаза ${target.bossPhase}` });
        this.modeState.bossPhase = target.bossPhase;
        return false;
      }
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
      if (this.nextPatrol(convoy, survivors)) {
        target.troops = Math.min(4, Math.max(1, survivors * 0.2));
        convoy.amount = Math.max(0.5, survivors - target.troops);
        return true;
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
    if (this.eventModifiers.reveal && viewer === 'player') return true;
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

    const personality = AI_PERSONALITIES[this.aiPersonalities[owner]] || AI_PERSONALITIES.tactical;
    this.aiClock[owner] = clamp((2.8 - this.difficulty * 0.42 + this.rng() * 1.3) * personality.interval, 0.72, 4.1);
    const sources = owned.filter((node) => node.troops > 22).sort((a, b) => b.troops - a.troops);
    if (!sources.length) return;

    const source = sources[Math.floor(this.rng() * Math.min(3, sources.length))];
    const candidates = Object.values(this.nodes).filter((node) => node.id !== source.id);
    const scored = candidates.map((target) => {
      let score = 0;
      if (target.owner !== owner) score += 42 * personality.attackBias;
      if (target.owner === 'player') score += 18 * this.difficulty;
      if (target.owner === 'neutral') score += 11;
      if (target.type === 'factory' || target.type === 'reactor') score += 14;
      if (target.type === 'fortress') score -= 14 * personality.defenseBias;
      if (target.type === 'factory' && this.aiPersonalities[owner] === 'economic') score += 26;
      if (target.type === 'radar' && this.aiPersonalities[owner] === 'stealth') score += 22;
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
    const playerRemains = this.factionNodes('player').some((node) => !node.virtual);
    if (!playerRemains) this.result = 'defeat';
    else if (['conquest', 'boss'].includes(this.mode) && !enemiesRemain) this.result = 'victory';
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
      mode: this.mode,
      modeState: { ...this.modeState },
      aiPersonalities: { ...this.aiPersonalities },
      eventModifiers: { ...this.eventModifiers },
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
