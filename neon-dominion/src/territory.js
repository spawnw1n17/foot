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
