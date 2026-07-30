import { MAPS, getMap, FACTIONS, NODE_TYPES } from './maps.js';
import { DominionEngine } from './engine.js';
import { TerritoryController } from './territory.js';
import { MetaController } from './meta.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const canvas = $('#battlefield');
const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });

const dom = {
  home: $('#homeOverlay'),
  result: $('#resultOverlay'),
  pause: $('#pauseOverlay'),
  levelGrid: $('#levelGrid'),
  sector: $('#sectorStat'),
  energy: $('#energyStat'),
  time: $('#timeStat'),
  missionTitle: $('#missionTitle'),
  missionCopy: $('#missionCopy'),
  difficulty: $('#difficultyChip'),
  objectives: $('#objectiveList'),
  selected: $('#selectedCard'),
  bars: $('#factionBars'),
  threat: $('#threatLabel'),
  log: $('#combatLog'),
  notices: $('#notificationStack'),
  resultTitle: $('#resultTitle'),
  resultKicker: $('#resultKicker'),
  resultStars: $('#resultStars'),
  resultStats: $('#resultStats'),
  profileStars: $('#profileStars'),
  profileProgress: $('#profileProgress'),
  dragLabel: $('#dragLabel'),
  groupSelect: $('#groupSelectBtn'),
  groupSend: $('#groupSendBtn'),
  groupClear: $('#groupClearBtn'),
  groupStatus: $('#groupStatus'),
};

const BASE_ASSET_PATHS = {
  core: './assets/base-core.svg',
  factory: './assets/base-factory.svg',
  fortress: './assets/base-fortress.svg',
  relay: './assets/base-relay.svg',
  reactor: './assets/base-reactor.svg',
};

const visualAssets = {
  background: loadImage('./assets/arena-background.svg'),
  bases: Object.fromEntries(Object.entries(BASE_ASSET_PATHS).map(([key, path]) => [key, loadImage(path)])),
};

let engine = null;
let currentMap = null;
let selectedIds = new Set();
let primarySelectedId = null;
let dragOrder = null;
let pointerWorld = null;
let armedAbility = null;
let selectionMode = false;
let groupTargetMode = false;
let selectionBox = null;
let last = performance.now();
let lastUI = 0;
let lastEvents = 0;
let resultShown = false;
let soundEnabled = true;
let audio = null;
let selectedSignature = '';
let barsSignature = '';
let camera = { zoom: 1, x: 0, y: 0 };
let viewport = { sx: 1, sy: 1, ox: 0, oy: 0, w: 1200, h: 720, portrait: false };
let pan = null;
let pinch = null;
const pointers = new Map();
const profile = loadProfile();
const territory = new TerritoryController({
  canvas,
  ctx,
  dragLabel: dom.dragLabel,
  getEngine: () => engine,
  screenToWorld,
  hitNode,
  allowChain: () => !selectionMode && !groupTargetMode && !armedAbility,
  getSelected: () => [...selectedIds],
  setSelected: (ids, primary) => {
    selectedIds = new Set(ids.filter((id) => engine?.nodes[id]?.owner === 'player'));
    primarySelectedId = primary || [...selectedIds][0] || null;
    selectedSignature = '';
    syncSelected(true);
    syncGroupControls();
  },
});
const meta = new MetaController({
  notice: (text, type = '') => notice(text, type),
  onChange: () => {},
});
const particles = Array.from({ length: 96 }, (_, index) => ({
  x: (index * 137) % 1200,
  y: (index * 251) % 720,
  radius: 0.45 + (index % 4) * 0.22,
  alpha: 0.05 + (index % 5) * 0.018,
}));

renderCampaign();
bindUI();
resize();
requestAnimationFrame(loop);
window.addEventListener('resize', resize);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});

function loadImage(source) {
  const image = new Image();
  image.decoding = 'async';
  image.src = source;
  return image;
}

function loadProfile() {
  try {
    return { stars: 0, completed: {}, ...JSON.parse(localStorage.getItem('neon-dominion-profile') || '{}') };
  } catch {
    return { stars: 0, completed: {} };
  }
}

function saveProfile() {
  localStorage.setItem('neon-dominion-profile', JSON.stringify(profile));
}

function bindUI() {
  $('#campaignBtn').onclick = () => startLevel(firstUnlocked());
  $('#quickBtn').onclick = () => startLevel(MAPS[Math.floor(Math.random() * MAPS.length)].id, { quick: true });
  $('#soundBtn').onclick = () => {
    soundEnabled = !soundEnabled;
    $('#soundBtn').textContent = soundEnabled ? '◉' : '○';
    beep(520, 0.05);
  };
  $('#pauseBtn').onclick = () => togglePause();
  $('#menuBtn').onclick = () => {
    if (!engine) return;
    engine.speed = 0;
    dom.pause.classList.add('visible');
  };
  $('#resumeBtn').onclick = () => resume();
  $('#exitBtn').onclick = () => goHome();
  $('#retryBtn').onclick = () => startLevel(currentMap.id);
  $('#nextBtn').onclick = () => {
    const next = MAPS[currentMap.order] || null;
    next ? startLevel(next.id) : goHome();
  };
  $('#clearLogBtn').onclick = () => { dom.log.innerHTML = ''; };
  $('#mobilePanelToggle').onclick = () => document.body.classList.toggle('show-right');

  $$('.speed-control button').forEach((button) => {
    button.onclick = () => setSpeed(Number(button.dataset.speed));
  });
  $$('.ability').forEach((button) => {
    button.onclick = () => activateAbility(button.dataset.ability);
  });

  dom.groupSelect?.addEventListener('click', () => setSelectionMode(!selectionMode));
  dom.groupSend?.addEventListener('click', armGroupTarget);
  dom.groupClear?.addEventListener('click', () => {
    clearSelection();
    notice('Групповое выделение сброшено');
  });

  document.addEventListener('keydown', (event) => {
    if (event.code === 'Space' && engine) {
      event.preventDefault();
      togglePause();
    }
    if (event.code === 'Escape') {
      armedAbility = null;
      groupTargetMode = false;
      setSelectionMode(false);
      syncAbilities();
      syncGroupControls();
      document.body.classList.remove('show-left', 'show-right');
    }
    if ((event.key === 'g' || event.key === 'G' || event.key === 'п' || event.key === 'П') && engine) {
      setSelectionMode(!selectionMode);
    }
  });

  canvas.addEventListener('pointerdown', pointerDown);
  canvas.addEventListener('pointermove', pointerMove);
  canvas.addEventListener('pointerup', pointerUp);
  canvas.addEventListener('pointercancel', pointerUp);
  canvas.addEventListener('wheel', wheel, { passive: false });
}

function renderCampaign() {
  const unlocked = Math.max(1, Object.keys(profile.completed).length + 1);
  dom.levelGrid.innerHTML = MAPS.map((map) => {
    const stars = profile.completed[map.id] || 0;
    return `<button class="level-card" data-level="${map.id}" ${map.order > unlocked ? 'disabled' : ''}>
      <span class="level-num">ОПЕРАЦИЯ 0${map.order}</span>
      <b>${map.title}</b>
      <small>${map.subtitle} · ${map.difficulty}</small>
      <span class="level-stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</span>
    </button>`;
  }).join('');
  $$('[data-level]').forEach((button) => { button.onclick = () => startLevel(button.dataset.level); });
  const total = Object.values(profile.completed).reduce((sum, value) => sum + value, 0);
  profile.stars = total;
  dom.profileStars.textContent = `${total} / 18 ★`;
  dom.profileProgress.style.width = `${total / 18 * 100}%`;
}

function firstUnlocked() {
  return MAPS.find((map) => !profile.completed[map.id])?.id || MAPS[MAPS.length - 1].id;
}

function startLevel(id, options = {}) {
  currentMap = getMap(id);
  engine = new DominionEngine(currentMap, {
    difficulty: currentMap.order < 2 ? 0.75 : currentMap.order < 4 ? 1.05 : 1.35,
    seed: options.quick ? Date.now() : undefined,
  });
  selectedIds = new Set(engine.factionNodes('player').slice(0, 1).map((node) => node.id));
  territory.start(engine);
  const activeCommander = meta.beginBattle(engine);
  primarySelectedId = [...selectedIds][0] || null;
  selectedSignature = '';
  barsSignature = '';
  armedAbility = null;
  selectionMode = false;
  groupTargetMode = false;
  selectionBox = null;
  camera = { zoom: 1, x: 0, y: 0 };
  resultShown = false;
  lastEvents = 0;
  dom.home.classList.remove('visible');
  dom.result.classList.remove('visible');
  dom.pause.classList.remove('visible');
  document.body.classList.remove('show-left', 'show-right');
  dom.missionTitle.textContent = currentMap.title;
  dom.missionCopy.textContent = `${currentMap.description} Теперь армии можно направлять из любой своей базы к любой цели без маршрутов и секторов.`;
  dom.difficulty.textContent = currentMap.difficulty;
  dom.objectives.innerHTML = currentMap.objectives.map((objective) => `<div class="objective">${objective}</div>`).join('');
  dom.log.innerHTML = '';
  log(`Операция «${currentMap.title}» началась`);
  log(`${activeCommander.name}: ${activeCommander.role}`);
  notice(`Командир: ${activeCommander.name}. Зажмите базу и постройте цепной маршрут.`, 'good');
  setSpeed(1);
  resize();
  syncUI(true);
  syncGroupControls();
  beep(290, 0.12);
}

function goHome() {
  engine = null;
  currentMap = null;
  territory.stop();
  meta.refresh();
  selectedIds.clear();
  primarySelectedId = null;
  dom.pause.classList.remove('visible');
  dom.result.classList.remove('visible');
  dom.home.classList.add('visible');
  renderCampaign();
}

function setSpeed(speed) {
  if (!engine) return;
  engine.speed = speed;
  $$('.speed-control button').forEach((button) => button.classList.toggle('active', Number(button.dataset.speed) === speed));
  $('#pauseBtn').textContent = speed === 0 ? '▶' : 'Ⅱ';
}

function togglePause() {
  if (!engine) return;
  if (engine.speed === 0) resume();
  else {
    engine.speed = 0;
    dom.pause.classList.add('visible');
  }
}

function resume() {
  dom.pause.classList.remove('visible');
  setSpeed(1);
}

function activateAbility(type) {
  if (!engine) return;
  if (type === 'strike') {
    armedAbility = armedAbility === 'strike' ? null : 'strike';
    syncAbilities();
    notice(armedAbility ? 'Выберите вражескую базу для импульса' : 'Импульс отменён');
    return;
  }
  const target = primarySelectedId;
  if (engine.useAbility(type, target)) {
    beep(type === 'overdrive' ? 760 : 620, 0.12);
    notice('Способность активирована', 'good');
    syncUI(true);
  } else {
    notice('Недостаточно энергии или неверная цель', 'bad');
  }
}

function setSelectionMode(enabled) {
  selectionMode = Boolean(enabled);
  groupTargetMode = false;
  selectionBox = null;
  dom.groupSelect?.classList.toggle('active', selectionMode);
  dom.groupSelect && (dom.groupSelect.textContent = selectionMode ? 'ГОТОВО' : 'ГРУППА');
  if (selectionMode) notice('Касайтесь баз или обведите их рамкой', 'good');
  syncGroupControls();
}

function armGroupTarget() {
  if (!engine || selectedIds.size < 2) return;
  selectionMode = false;
  groupTargetMode = true;
  dom.groupSelect?.classList.remove('active');
  dom.groupSelect && (dom.groupSelect.textContent = 'ГРУППА');
  notice(`Выбрано баз: ${selectedIds.size}. Коснитесь цели.`, 'good');
  syncGroupControls();
}

function clearSelection() {
  selectedIds.clear();
  primarySelectedId = null;
  selectionMode = false;
  groupTargetMode = false;
  selectionBox = null;
  selectedSignature = '';
  syncSelected();
  syncGroupControls();
}

function toggleSelected(id) {
  if (!engine?.nodes[id] || engine.nodes[id].owner !== 'player') return;
  if (selectedIds.has(id)) selectedIds.delete(id);
  else selectedIds.add(id);
  primarySelectedId = selectedIds.has(id) ? id : [...selectedIds][0] || null;
  selectedSignature = '';
  syncSelected();
  syncGroupControls();
  beep(selectedIds.has(id) ? 480 : 310, 0.035);
}

function selectOnly(id) {
  selectedIds = id ? new Set([id]) : new Set();
  primarySelectedId = id || null;
  selectedSignature = '';
  syncSelected();
  syncGroupControls();
}

function pointerDown(event) {
  if (!engine || engine.speed === 0) return;
  canvas.setPointerCapture(event.pointerId);
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  const world = screenToWorld(event.clientX, event.clientY);
  pointerWorld = world;
  const hit = hitNode(world);

  if (territory.pointerDown(event, hit)) return;

  if (pointers.size === 2) {
    const values = [...pointers.values()];
    pinch = {
      distance: Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y),
      zoom: camera.zoom,
    };
    dragOrder = null;
    selectionBox = null;
    return;
  }

  if (groupTargetMode) {
    if (hit) sendSelectionTo(hit.id);
    else notice('Коснитесь базы-цели', 'bad');
    return;
  }

  if (armedAbility === 'strike' && hit) {
    if (engine.useAbility('strike', hit.id)) {
      armedAbility = null;
      syncAbilities();
      beep(150, 0.18);
      notice('Импульс нанесён', 'good');
    } else {
      notice('Нужна вражеская цель и 50 энергии', 'bad');
    }
    return;
  }

  if (event.shiftKey && hit?.owner === 'player') {
    toggleSelected(hit.id);
    return;
  }

  if (selectionMode) {
    if (hit?.owner === 'player') {
      toggleSelected(hit.id);
    } else {
      selectionBox = { start: world, end: world };
    }
    return;
  }

  if (hit?.owner === 'player') {
    selectOnly(hit.id);
    dragOrder = {
      pointerId: event.pointerId,
      sourceIds: [hit.id],
      startClientX: event.clientX,
      startClientY: event.clientY,
      moved: false,
      hoverTargetId: null,
    };
    primarySelectedId = hit.id;
    selectedSignature = '';
    syncSelected();
    beep(430, 0.035);
  } else {
    pan = { sx: event.clientX, sy: event.clientY, x: camera.x, y: camera.y };
    if (hit) {
      primarySelectedId = hit.id;
      selectedSignature = '';
      syncSelected();
    }
  }
}

function pointerMove(event) {
  if (!engine) return;
  const previous = pointers.get(event.pointerId);
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

  if (pinch && pointers.size >= 2) {
    const values = [...pointers.values()];
    const distance = Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y);
    camera.zoom = Math.max(1, Math.min(1.9, pinch.zoom * distance / pinch.distance));
    clampCamera();
    return;
  }

  pointerWorld = screenToWorld(event.clientX, event.clientY);
  if (territory.pointerMove(event, pointerWorld)) return;
  if (selectionBox) {
    selectionBox.end = pointerWorld;
    return;
  }

  if (pan && previous) {
    camera.x = pan.x + (event.clientX - pan.sx) / viewport.sx / camera.zoom;
    camera.y = pan.y + (event.clientY - pan.sy) / viewport.sy / camera.zoom;
    clampCamera();
  }

  if (dragOrder) {
    const distance = Math.hypot(event.clientX - dragOrder.startClientX, event.clientY - dragOrder.startClientY);
    if (distance > 7) dragOrder.moved = true;
    const hit = hitNode(pointerWorld);

    if (dragOrder.moved && hit?.owner === 'player' && !dragOrder.sourceIds.includes(hit.id)) {
      dragOrder.sourceIds.push(hit.id);
      selectedIds = new Set(dragOrder.sourceIds);
      primarySelectedId = hit.id;
      selectedSignature = '';
      syncSelected(true);
      syncGroupControls();
      beep(520 + Math.min(180, dragOrder.sourceIds.length * 24), 0.04);
      navigator.vibrate?.(18);
    }

    dragOrder.hoverTargetId = hit && !dragOrder.sourceIds.includes(hit.id) ? hit.id : null;
    dom.dragLabel.style.display = dragOrder.moved ? 'block' : 'none';
    dom.dragLabel.style.left = `${event.offsetX + 12}px`;
    dom.dragLabel.style.top = `${event.offsetY + 12}px`;
    if (dragOrder.hoverTargetId) {
      dom.dragLabel.textContent = `${dragOrder.sourceIds.length} БАЗ → ${hit.id.toUpperCase()} · ОТПУСТИТЕ`;
    } else if (hit?.owner === 'player') {
      dom.dragLabel.textContent = `${dragOrder.sourceIds.length} БАЗ В ЦЕПОЧКЕ`;
    } else {
      dom.dragLabel.textContent = 'ВЕДИТЕ ЧЕРЕЗ СВОИ БАЗЫ К ЦЕЛИ';
    }
  }
}

function pointerUp(event) {
  if (!engine) return;
  const world = screenToWorld(event.clientX, event.clientY);
  const target = hitNode(world);

  if (territory.pointerUp(event, target)) {
    dragOrder = null;
    pan = null;
    pinch = null;
    pointers.delete(event.pointerId);
    dom.dragLabel.style.display = 'none';
    return;
  }

  if (selectionBox) {
    const minX = Math.min(selectionBox.start.x, selectionBox.end.x);
    const maxX = Math.max(selectionBox.start.x, selectionBox.end.x);
    const minY = Math.min(selectionBox.start.y, selectionBox.end.y);
    const maxY = Math.max(selectionBox.start.y, selectionBox.end.y);
    const enclosed = engine.factionNodes('player').filter((node) => node.x >= minX && node.x <= maxX && node.y >= minY && node.y <= maxY);
    if (enclosed.length) {
      enclosed.forEach((node) => selectedIds.add(node.id));
      primarySelectedId = enclosed.at(-1).id;
      selectedSignature = '';
      syncSelected();
      syncGroupControls();
      notice(`Выбрано баз: ${selectedIds.size}`, 'good');
    }
    selectionBox = null;
  } else if (dragOrder) {
    if (dragOrder.moved && target && !dragOrder.sourceIds.includes(target.id)) {
      const sent = engine.sendMany(dragOrder.sourceIds, target.id, 1, 'player');
      if (sent) {
        beep(560, 0.055);
        log(`Группа из ${sent} баз направлена к ${target.id}`);
      } else {
        notice('Недостаточно сил для отправки', 'bad');
      }
    } else if (!dragOrder.moved && target?.owner === 'player') {
      selectOnly(target.id);
    }
  }

  dragOrder = null;
  pan = null;
  pinch = null;
  pointers.delete(event.pointerId);
  dom.dragLabel.style.display = 'none';
}

function sendSelectionTo(targetId) {
  const sources = [...selectedIds].filter((id) => id !== targetId && engine.nodes[id]?.owner === 'player');
  const sent = engine.sendMany(sources, targetId, 1, 'player');
  groupTargetMode = false;
  if (sent) {
    beep(610, 0.08);
    log(`Сводная группа (${sent}) направлена к ${targetId}`);
    notice(`Приказ выполнен: ${sent} баз`, 'good');
  } else {
    notice('Недостаточно сил или выбрана собственная исходная база', 'bad');
  }
  syncGroupControls();
}

function wheel(event) {
  if (!engine) return;
  event.preventDefault();
  const before = screenToWorld(event.clientX, event.clientY);
  camera.zoom = Math.max(1, Math.min(1.9, camera.zoom * (event.deltaY < 0 ? 1.12 : 0.89)));
  const after = screenToWorld(event.clientX, event.clientY);
  camera.x += after.x - before.x;
  camera.y += after.y - before.y;
  clampCamera();
}

function clampCamera() {
  const limitX = (camera.zoom - 1) * 340 / camera.zoom;
  const limitY = (camera.zoom - 1) * 210 / camera.zoom;
  camera.x = Math.max(-limitX, Math.min(limitX, camera.x));
  camera.y = Math.max(-limitY, Math.min(limitY, camera.y));
}

function resize() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const portrait = rect.width < 620 && rect.height > rect.width * 1.15;
  if (portrait) {
    viewport = { sx: rect.width / 1200, sy: rect.height / 720, ox: 0, oy: 0, w: rect.width, h: rect.height, portrait: true };
  } else {
    const scale = Math.min(rect.width / 1200, rect.height / 720);
    viewport = { sx: scale, sy: scale, ox: (rect.width - 1200 * scale) / 2, oy: (rect.height - 720 * scale) / 2, w: rect.width, h: rect.height, portrait: false };
  }
}

function screenToWorld(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  let x = (clientX - rect.left - viewport.ox) / viewport.sx;
  let y = (clientY - rect.top - viewport.oy) / viewport.sy;
  x = (x - 600) / camera.zoom + 600 - camera.x;
  y = (y - 360) / camera.zoom + 360 - camera.y;
  return { x, y };
}

function hitNode(point) {
  if (!engine) return null;
  let best = null;
  let bestDistance = Infinity;
  for (const node of Object.values(engine.nodes)) {
    const nodeDistance = Math.hypot(point.x - node.x, point.y - node.y);
    const radius = NODE_TYPES[node.type].radius + (viewport.portrait ? 20 : 12);
    if (nodeDistance < radius && nodeDistance < bestDistance) {
      best = node;
      bestDistance = nodeDistance;
    }
  }
  return best;
}

function loop(now) {
  const dt = (now - last) / 1000;
  last = now;
  if (engine) {
    engine.update(dt);
    if (now - lastUI > 220) {
      syncUI();
      lastUI = now;
    }
    drainEvents();
    if (engine.result && !resultShown) showResult();
  }
  render(now);
  requestAnimationFrame(loop);
}

function render(now) {
  const rect = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width, rect.height);
  ctx.save();
  ctx.translate(viewport.ox, viewport.oy);
  ctx.scale(viewport.sx, viewport.sy);
  ctx.translate(600, 360);
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-600 + camera.x, -360 + camera.y);
  drawBackground(now);
  if (engine) {
    territory.drawTerritory(ctx, now);
    drawInfluenceField(now);
    territory.drawFog(ctx, now);
    drawConvoys(now);
    drawNodes(now);
    drawEffects();
    territory.drawOverlay(ctx, now);
    if (dragOrder?.moved && pointerWorld) drawDrag();
    if (selectionBox) drawSelectionBox();
  }
  ctx.restore();
}

function drawBackground(now) {
  ctx.fillStyle = '#03050c';
  ctx.fillRect(-300, -200, 1800, 1120);
  if (visualAssets.background.complete && visualAssets.background.naturalWidth) {
    ctx.globalAlpha = 0.96;
    ctx.drawImage(visualAssets.background, 0, 0, 1200, 720);
    ctx.globalAlpha = 1;
  } else {
    const gradient = ctx.createRadialGradient(600, 330, 80, 600, 360, 720);
    gradient.addColorStop(0, '#101b35');
    gradient.addColorStop(0.45, '#070b18');
    gradient.addColorStop(1, '#03050c');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1200, 720);
  }

  for (const particle of particles) {
    const pulse = 0.65 + 0.35 * Math.sin(now * 0.0007 + particle.x);
    ctx.globalAlpha = particle.alpha * pulse;
    ctx.fillStyle = '#b8edff';
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawInfluenceField(now) {
  for (const node of Object.values(engine.nodes)) {
    const faction = FACTIONS[node.owner];
    const radius = NODE_TYPES[node.type].radius + 26 + Math.sin(now * 0.0017 + node.x) * 3;
    const gradient = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, radius * 2.2);
    gradient.addColorStop(0, `${faction.color}14`);
    gradient.addColorStop(0.45, `${faction.color}08`);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(node.x, node.y, radius * 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawNodes(now) {
  const aspectFix = viewport.sx / viewport.sy;
  const portraitBoost = viewport.portrait ? 1.35 : 1;
  for (const node of Object.values(engine.nodes)) {
    if (!territory.isNodeVisible(node)) continue;
    const config = NODE_TYPES[node.type];
    const faction = FACTIONS[node.owner];
    const selected = selectedIds.has(node.id);
    const primary = node.id === primarySelectedId;
    const pulse = 1 + Math.sin(now * 0.003 + node.x) * 0.018;
    const asset = visualAssets.bases[node.type];

    ctx.save();
    ctx.translate(node.x, node.y);
    ctx.scale(pulse * portraitBoost, pulse * portraitBoost * aspectFix);

    const aura = ctx.createRadialGradient(0, 0, 4, 0, 0, config.radius + 28);
    aura.addColorStop(0, `${faction.color}42`);
    aura.addColorStop(0.55, `${faction.color}16`);
    aura.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(0, 0, config.radius + 28, 0, Math.PI * 2);
    ctx.fill();

    if (selected) {
      ctx.strokeStyle = primary ? '#ffffff' : faction.color;
      ctx.lineWidth = primary ? 3.2 : 2.4;
      ctx.setLineDash(primary ? [] : [6, 5]);
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(0, 0, config.radius + 17, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    ctx.shadowColor = faction.color;
    ctx.shadowBlur = node.owner === 'neutral' ? 7 : selected ? 27 : 16;
    if (asset.complete && asset.naturalWidth) {
      const size = config.radius * 2.42;
      ctx.drawImage(asset, -size / 2, -size / 2, size, size);
    } else {
      ctx.fillStyle = 'rgba(8,12,23,.98)';
      ctx.strokeStyle = faction.color;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      polygon(0, 0, config.radius, node.type === 'fortress' ? 6 : 8, Math.PI / 8);
      ctx.fill();
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    meta.decorateBase(ctx, node, config, faction, now);

    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = node.owner === 'neutral' ? 0.25 : 0.55;
    ctx.fillStyle = faction.color;
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(7, config.radius * 0.27), 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    const ratio = Math.min(1, node.troops / engine.capacity(node));
    ctx.strokeStyle = `${faction.color}45`;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(0, 0, config.radius + 8, -Math.PI / 2, Math.PI * 1.5);
    ctx.stroke();
    ctx.strokeStyle = faction.color;
    ctx.beginPath();
    ctx.arc(0, 0, config.radius + 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio);
    ctx.stroke();

    if (node.shieldUntil > engine.time) {
      ctx.strokeStyle = '#ffffff';
      ctx.globalAlpha = 0.45 + 0.2 * Math.sin(now * 0.008);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, config.radius + 14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '800 15px Inter, sans-serif';
    ctx.fillText(Math.floor(node.troops), 0, 1);
    ctx.fillStyle = faction.color;
    ctx.font = '800 8px Inter, sans-serif';
    ctx.fillText(config.name.toUpperCase(), 0, config.radius + 23);
    ctx.restore();
  }
}

function convoyGeometry(convoy) {
  const start = engine.nodes[convoy.from];
  const end = engine.nodes[convoy.to];
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const control = {
    x: (start.x + end.x) / 2 - dy / length * convoy.curve,
    y: (start.y + end.y) / 2 + dx / length * convoy.curve,
  };
  const t = Math.max(0, Math.min(1, convoy.progress));
  const one = 1 - t;
  const x = one * one * start.x + 2 * one * t * control.x + t * t * end.x;
  const y = one * one * start.y + 2 * one * t * control.y + t * t * end.y;
  const tangentX = 2 * one * (control.x - start.x) + 2 * t * (end.x - control.x);
  const tangentY = 2 * one * (control.y - start.y) + 2 * t * (end.y - control.y);
  return { start, end, control, x, y, angle: Math.atan2(tangentY * viewport.sy, tangentX * viewport.sx) };
}

function drawConvoys() {
  const aspectFix = viewport.sx / viewport.sy;
  const portraitBoost = viewport.portrait ? 1.35 : 1;
  for (const convoy of engine.convoys) {
    if (!territory.isConvoyVisible(convoy)) continue;
    const geometry = convoyGeometry(convoy);
    const faction = FACTIONS[convoy.owner];
    meta.decorateConvoy(ctx, convoy, geometry);

    ctx.strokeStyle = `${faction.color}38`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(geometry.start.x, geometry.start.y);
    ctx.quadraticCurveTo(geometry.control.x, geometry.control.y, geometry.x, geometry.y);
    ctx.stroke();

    ctx.save();
    ctx.translate(geometry.x, geometry.y);
    ctx.scale(portraitBoost, portraitBoost * aspectFix);
    ctx.rotate(geometry.angle);
    ctx.shadowColor = faction.color;
    ctx.shadowBlur = 16;
    const gradient = ctx.createLinearGradient(-10, 0, 10, 0);
    gradient.addColorStop(0, '#ffffff');
    gradient.addColorStop(0.35, faction.color);
    gradient.addColorStop(1, faction.color);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(11, 0);
    ctx.lineTo(-7, -5.5);
    ctx.lineTo(-3, 0);
    ctx.lineTo(-7, 5.5);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 8px Inter';
    ctx.textAlign = 'center';
    ctx.fillText(convoy.amount, 0, -11);
    ctx.restore();
  }
}

function drawEffects() {
  for (const effect of engine.effects) {
    ctx.strokeStyle = `rgba(255,255,255,${effect.life})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(effect.x, effect.y, (1 - effect.life) * 70 + 10, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawDrag() {
  const sources = dragOrder.sourceIds.map((id) => engine.nodes[id]).filter(Boolean);
  if (!sources.length) return;

  ctx.save();
  ctx.strokeStyle = '#54f5ff';
  ctx.shadowColor = '#54f5ff';
  ctx.shadowBlur = 16;
  ctx.globalAlpha = 0.92;
  ctx.lineWidth = 3.4;
  ctx.setLineDash([10, 7]);
  ctx.lineDashOffset = -engine.time * 30;
  ctx.beginPath();
  ctx.moveTo(sources[0].x, sources[0].y);
  for (let index = 1; index < sources.length; index += 1) ctx.lineTo(sources[index].x, sources[index].y);
  ctx.lineTo(pointerWorld.x, pointerWorld.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.shadowBlur = 0;

  sources.forEach((source, index) => {
    ctx.fillStyle = '#07111c';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(source.x, source.y, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 9px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(index + 1), source.x, source.y + 0.5);
  });

  const target = engine.nodes[dragOrder.hoverTargetId];
  if (target) {
    const radius = NODE_TYPES[target.type].radius + 18;
    ctx.strokeStyle = target.owner === 'player' ? '#58f2a5' : '#ff6589';
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.arc(target.x, target.y, radius, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawSelectionBox() {
  const x = Math.min(selectionBox.start.x, selectionBox.end.x);
  const y = Math.min(selectionBox.start.y, selectionBox.end.y);
  const width = Math.abs(selectionBox.end.x - selectionBox.start.x);
  const height = Math.abs(selectionBox.end.y - selectionBox.start.y);
  ctx.fillStyle = 'rgba(84,245,255,.08)';
  ctx.strokeStyle = 'rgba(84,245,255,.9)';
  ctx.lineWidth = 2;
  ctx.setLineDash([9, 7]);
  ctx.fillRect(x, y, width, height);
  ctx.strokeRect(x, y, width, height);
  ctx.setLineDash([]);
}

function polygon(x, y, radius, sides, rotation = 0) {
  for (let index = 0; index < sides; index += 1) {
    const angle = rotation + index * Math.PI * 2 / sides;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    index ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.closePath();
}

function syncUI(force = false) {
  if (!engine) return;
  const owned = engine.factionNodes('player').length;
  const total = Object.keys(engine.nodes).length;
  dom.sector.textContent = `${owned} / ${total}`;
  dom.energy.textContent = Math.floor(engine.energy);
  dom.time.textContent = formatTime(engine.time);
  syncSelected(force);
  syncAbilities();
  syncBars();
  syncGroupControls();
  territory.sync(force);
  const enemyPower = engine.factionPower('red') + engine.factionPower('violet');
  const playerPower = engine.factionPower('player');
  dom.threat.textContent = enemyPower > playerPower * 1.35 ? 'КРИТИЧНО' : enemyPower > playerPower * 0.8 ? 'НАПРЯЖЁННО' : 'СТАБИЛЬНО';
  dom.threat.style.color = enemyPower > playerPower * 1.35 ? '#ff5578' : enemyPower > playerPower * 0.8 ? '#ffd66b' : '#58f2a5';
}

function syncSelected(force = false) {
  if (!engine) return;
  const valid = [...selectedIds].filter((id) => engine.nodes[id]?.owner === 'player');
  if (valid.length !== selectedIds.size) selectedIds = new Set(valid);
  if (primarySelectedId && !engine.nodes[primarySelectedId]) primarySelectedId = valid[0] || null;

  if (valid.length > 1) {
    const totalTroops = valid.reduce((sum, id) => sum + engine.nodes[id].troops, 0);
    const signature = `group|${valid.join(',')}|${Math.floor(totalTroops)}`;
    if (!force && signature === selectedSignature) return;
    selectedSignature = signature;
    dom.selected.innerHTML = `<div class="selected-head"><b>ГРУППА БАЗ</b><span class="selected-type">${valid.length} ВЫБРАНО</span></div>
      <div class="selected-number">${Math.floor(totalTroops)}</div>
      <div class="selected-meta"><span>Общая сила</span><span>Свободный приказ</span></div>`;
    return;
  }

  const node = engine.nodes[primarySelectedId || valid[0]];
  if (!node) {
    if (selectedSignature !== 'empty') {
      dom.selected.innerHTML = '<div class="selected-empty">Выберите базу или группу</div>';
      selectedSignature = 'empty';
    }
    return;
  }

  const config = NODE_TYPES[node.type];
  const owner = FACTIONS[node.owner];
  const signature = `${node.id}|${node.owner}|${Math.floor(node.troops)}|${node.type}`;
  if (!force && signature === selectedSignature) return;
  selectedSignature = signature;
  dom.selected.innerHTML = `<div class="selected-head"><b>${node.id.toUpperCase()}</b><span class="selected-type" style="color:${owner.color}">${owner.name}</span></div>
    <div class="selected-number">${Math.floor(node.troops)}</div>
    <div class="selected-meta"><span>${config.name}</span><span>Прирост +${config.growth.toFixed(1)}/с</span></div>`;
}

function syncGroupControls() {
  if (!dom.groupSelect) return;
  const count = selectedIds.size;
  dom.groupSelect.classList.toggle('active', selectionMode);
  dom.groupSend.hidden = count < 2;
  dom.groupSend.classList.toggle('armed', groupTargetMode);
  dom.groupSend.textContent = groupTargetMode ? 'ВЫБЕРИТЕ ЦЕЛЬ' : `ОТПРАВИТЬ ${count}`;
  dom.groupClear.hidden = count === 0;
  dom.groupStatus.textContent = groupTargetMode
    ? 'Коснитесь базы-цели'
    : selectionMode
      ? 'Тапните базы или обведите рамкой'
      : count > 1
        ? `Группа: ${count} баз`
        : 'Цепной жест: база → база → цель';
}

function syncAbilities() {
  $$('.ability').forEach((button) => {
    const costs = { shield: 35, overdrive: 60, strike: 50, surge: 75 };
    button.disabled = !engine || engine.energy < costs[button.dataset.ability];
    button.classList.toggle('armed', armedAbility === button.dataset.ability);
  });
}

function syncBars() {
  const powers = ['player', 'red', 'violet'].map((id) => ({ id, power: engine.factionPower(id) }));
  const max = Math.max(1, ...powers.map((item) => item.power));
  const signature = powers.map((item) => Math.round(item.power)).join('|');
  if (signature === barsSignature) return;
  barsSignature = signature;
  dom.bars.innerHTML = powers.map((item) => `<div class="faction-row"><span>${FACTIONS[item.id].name}</span><div class="faction-track"><i style="width:${item.power / max * 100}%;background:${FACTIONS[item.id].color}"></i></div><b>${Math.round(item.power)}</b></div>`).join('');
}

function drainEvents() {
  while (lastEvents < engine.events.length) {
    const event = engine.events[lastEvents++];
    log(event.text);
    notice(event.text, event.type);
    if (event.type === 'bad') beep(130, 0.1);
  }
}

function log(text) {
  const element = document.createElement('div');
  element.className = 'log-item';
  element.textContent = `${engine ? formatTime(engine.time) : '00:00'} · ${text}`;
  dom.log.prepend(element);
  while (dom.log.children.length > 14) dom.log.lastChild.remove();
}

function notice(text, type = '') {
  const element = document.createElement('div');
  element.className = `notice ${type}`;
  element.textContent = text;
  dom.notices.append(element);
  setTimeout(() => element.remove(), 2600);
}

function showResult() {
  resultShown = true;
  setSpeed(0);
  const victory = engine.result === 'victory';
  const stars = victory ? calcStars() : 0;
  dom.resultKicker.textContent = victory ? 'ОПЕРАЦИЯ ЗАВЕРШЕНА' : 'СЕТЬ ПОТЕРЯНА';
  dom.resultTitle.textContent = victory ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ';
  dom.resultTitle.style.color = victory ? '#54f5ff' : '#ff5578';
  dom.resultStars.textContent = victory ? `${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}` : '✕';
  dom.resultStats.innerHTML = `<div class="result-stat"><span>ВРЕМЯ</span><strong>${formatTime(engine.time)}</strong></div>
    <div class="result-stat"><span>ЗАХВАЧЕНО</span><strong>${engine.stats.captured}</strong></div>
    <div class="result-stat"><span>ГРУППОВЫЕ</span><strong>${engine.stats.groupOrders}</strong></div>`;
  if (victory) {
    profile.completed[currentMap.id] = Math.max(profile.completed[currentMap.id] || 0, stars);
    saveProfile();
    beep(820, 0.25);
  } else {
    beep(100, 0.28);
  }
  const totalStars = Object.values(profile.completed).reduce((sum, value) => sum + value, 0);
  const reward = meta.completeBattle({
    victory,
    stars,
    totalStars,
    order: currentMap.order,
    mapId: currentMap.id,
    time: engine.time,
    stats: engine.stats,
    longestChain: engine.stats.chainedRoutes,
  });
  dom.resultStats.insertAdjacentHTML('beforeend', `<div class="result-reward"><span>НАГРАДА ПРОФИЛЯ</span><b>◈ ${reward.credits}</b><b>✦ ${reward.shards}</b><b>${reward.xp} XP</b></div>`);
  dom.result.classList.add('visible');
}

function calcStars() {
  let stars = 1;
  if (engine.time <= currentMap.parTime) stars += 1;
  if (engine.reputation >= 75 && engine.stats.lost <= 3) stars += 1;
  return stars;
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

function beep(frequency = 440, duration = 0.06) {
  if (!soundEnabled) return;
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.045, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + duration);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start();
    oscillator.stop(audio.currentTime + duration);
  } catch {}
}

window.NeonDominionQA = {
  startLevel: (id = 'awakening') => startLevel(id),
  getState: () => engine?.snapshot() || null,
  send: (from, to, ratio = 0.5) => engine?.send(from, to, ratio, 'player'),
  sendMany: (fromIds, to, ratio = 0.5) => engine?.sendMany(fromIds, to, ratio, 'player'),
  sendRoute: (fromIds, targets, unit = 'assault') => engine?.sendRoute(fromIds, targets, unit, 'player'),
  getEngine: () => engine,
  setUnit: (type) => territory.setUnit(type),
  upgrade: (id, path) => engine?.upgradeNode(id, path, 'player'),
  getTerritory: () => territory.state(),
  isVisible: (id) => engine?.isVisible(id, 'player') ?? false,
  ability: (type, id) => engine?.useAbility(type, id),
  setSpeed: (speed) => setSpeed(speed),
  setSelection: (ids) => {
    selectedIds = new Set(ids.filter((id) => engine?.nodes[id]?.owner === 'player'));
    primarySelectedId = [...selectedIds][0] || null;
    selectedSignature = '';
    syncSelected(true);
    syncGroupControls();
  },
  getSelection: () => [...selectedIds],
  openMeta: (tab = 'profile') => meta.open(tab),
  closeMeta: () => meta.close(),
  getMeta: () => meta.snapshot(),
  resetMeta: () => meta.resetForQA(),
  buyMeta: (id) => meta.buy(id),
  equipMeta: (id) => meta.equip(id),
  chooseCommander: (id) => meta.chooseCommander(id),
  completeMetaBattle: (battle) => meta.completeBattle(battle),
  assetsReady: () => visualAssets.background.complete
    && visualAssets.background.naturalWidth > 0
    && Object.values(visualAssets.bases).every((image) => image.complete && image.naturalWidth > 0),
  maps: MAPS.map((map) => map.id),
};
