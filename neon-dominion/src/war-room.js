import { CATALOG } from './meta.js';
import {
  AI_PERSONALITIES,
  BOSSES,
  BUILDINGS,
  FORMATIONS,
  MEDALS,
  MISSION_MODES,
  RANDOM_EVENTS,
  SHOP_BUNDLES,
  TITLES,
  WORLD_REGIONS,
  adaptiveDifficulty,
  availableTitles,
  calculateUnlockedMedals,
  chooseRandomEvent,
  createWarRoomState,
  dateKey,
  exportWarRoomState,
  generateDailyChallenge,
  generateSandboxMap,
  generateSurvivalMap,
  importWarRoomState,
  normalizeComposition,
  normalizeCustomMap,
  normalizeWarRoomState,
  shopRotation,
  survivalWave,
  unlockWorldRegion,
  updateRecords,
  validateCustomMap,
} from './war-room-core.js';

const STORAGE_KEY = 'neon-dominion-war-room-v7';
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const clone = (value) => JSON.parse(JSON.stringify(value));
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
const formatTime = (seconds = 0) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const percent = (value) => `${Math.round((value || 0) * 100)}%`;

function download(name, content, type = 'application/json') {
  const blob = new Blob([content], { type });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function safeParse(text, fallback = null) {
  try { return JSON.parse(text); } catch { return fallback; }
}

export class WarRoomController {
  constructor(options = {}) {
    this.options = options;
    this.state = this.load();
    this.activeTab = 'world';
    this.editor = { tool: 'node', type: 'relay', owner: 'neutral', nodes: [], links: [], selected: null };
    this.battle = null;
    this.buildMode = null;
    this.routeMode = false;
    this.routePoints = [];
    this.selectedConvoyId = null;
    this.convoyCommandMode = null;
    this.patrolTargets = [];
    this.eventClock = 24;
    this.activeEvent = null;
    this.eventEnd = 0;
    this.lastHud = 0;
    this.audio = { context: null, master: null, drone: null, pulse: null, voiceReady: false };
    this.buildUI();
    this.renderHomeEntry();
    this.refresh();
  }

  load() {
    try { return normalizeWarRoomState(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')); }
    catch { return createWarRoomState(); }
  }

  save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    this.renderHomeEntry();
    this.options.onChange?.(this.snapshot());
  }

  buildUI() {
    this.overlay = document.createElement('div');
    this.overlay.id = 'warRoomOverlay';
    this.overlay.className = 'war-room-overlay';
    this.overlay.innerHTML = `<div class="war-room-shell glass">
      <header class="war-room-header">
        <div><span class="eyebrow">СТРАТЕГИЧЕСКОЕ КОМАНДОВАНИЕ</span><h2>WAR ROOM</h2><p>Кампании, режимы, редактор и долгосрочная статистика</p></div>
        <div class="war-room-header-state" id="warRoomHeaderState"></div>
        <button class="war-room-close" id="warRoomClose" aria-label="Закрыть">×</button>
      </header>
      <nav class="war-room-nav" id="warRoomNav">
        <button data-war-tab="world">КАРТА МИРА</button>
        <button data-war-tab="modes">РЕЖИМЫ</button>
        <button data-war-tab="survival">ВЫЖИВАНИЕ</button>
        <button data-war-tab="sandbox">ПЕСОЧНИЦА</button>
        <button data-war-tab="editor">РЕДАКТОР</button>
        <button data-war-tab="records">РЕКОРДЫ</button>
        <button data-war-tab="identity">ПРОФИЛЬ+</button>
        <button data-war-tab="arsenal">ВИТРИНА</button>
        <button data-war-tab="audio">ЗВУК</button>
      </nav>
      <main class="war-room-content" id="warRoomContent"></main>
    </div>`;
    document.body.append(this.overlay);
    this.content = $('#warRoomContent', this.overlay);
    this.headerState = $('#warRoomHeaderState', this.overlay);
    $('#warRoomClose', this.overlay).onclick = () => this.close();
    this.overlay.addEventListener('pointerdown', (event) => { if (event.target === this.overlay) this.close(); });
    $('#warRoomNav', this.overlay).onclick = (event) => {
      const button = event.target.closest('[data-war-tab]');
      if (!button) return;
      this.activeTab = button.dataset.warTab;
      this.render();
    };
    this.content.onclick = (event) => this.handleAction(event);
    this.content.onchange = (event) => this.handleChange(event);
    this.content.oninput = (event) => this.handleInput(event);

    this.hud = document.createElement('section');
    this.hud.id = 'warBattlePanel';
    this.hud.className = 'war-battle-panel glass-inset';
    this.hud.hidden = true;
    $('.battlefield-wrap')?.append(this.hud);
    this.hud.onclick = (event) => this.handleBattleAction(event);
    this.hud.onchange = (event) => this.handleBattleChange(event);
    this.hud.oninput = (event) => this.handleBattleInput(event);

    this.planner = document.createElement('section');
    this.planner.id = 'tacticalPlanner';
    this.planner.className = 'tactical-planner';
    this.planner.hidden = true;
    $('#pauseOverlay')?.append(this.planner);
    this.planner.onclick = (event) => this.handlePlanner(event);

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.overlay.classList.contains('visible')) this.close();
      if ((event.key === 'w' || event.key === 'ц') && event.altKey) this.open('world');
    });
  }

  renderHomeEntry() {
    const install = () => {
      const home = $('#homeOverlay .home-hero');
      if (!home) return false;
      let button = $('#warRoomHomeBtn');
      if (!button) {
        button = document.createElement('button');
        button.id = 'warRoomHomeBtn';
        button.className = 'war-room-home-btn';
        button.type = 'button';
        button.onclick = () => this.open('world');
        const quick = $('#quickBtn');
        quick?.insertAdjacentElement('afterend', button);
      }
      const complete = this.state.world.completed.length;
      button.innerHTML = `<i>▦</i><span><b>WAR ROOM</b><small>${complete} / ${WORLD_REGIONS.length} регионов · рекорд ${this.state.records.survivalWave || 0} волн</small></span><em>→</em>`;
      const dockActions = $('#homeProfileDock .home-arsenal-actions');
      if (dockActions && !$('#homeWarRoomShortcut')) {
        const shortcut = document.createElement('button');
        shortcut.id = 'homeWarRoomShortcut';
        shortcut.type = 'button';
        shortcut.innerHTML = '<i>▦</i><span>WAR ROOM<small>Карта и режимы</small></span>';
        shortcut.onclick = () => this.open('world');
        dockActions.append(shortcut);
      }
      return true;
    };
    if (!install()) setTimeout(install, 120);
  }

  open(tab = 'world') {
    this.activeTab = tab;
    this.overlay.classList.add('visible');
    this.render();
  }

  close() { this.overlay.classList.remove('visible'); }

  refresh() {
    this.state = normalizeWarRoomState(this.state);
    this.state.medals = calculateUnlockedMedals(this.state.records, this.options.getMeta?.()?.stats || {});
    this.save();
    if (this.overlay.classList.contains('visible')) this.render();
  }

  snapshot() {
    return {
      ...clone(this.state),
      activeTab: this.activeTab,
      battle: this.battle ? { mode: this.battle.mode, wave: this.battle.wave, score: this.battle.score, activeEvent: this.activeEvent?.id || null } : null,
      editor: clone(this.editor),
    };
  }

  render() {
    const meta = this.options.getMeta?.() || { name: 'Оператор', level: { level: 1 }, credits: 0, shards: 0, stats: {} };
    this.headerState.innerHTML = `<span>${escapeHtml(meta.name)}</span><b>УР. ${meta.level?.level || 1}</b><i>◈ ${meta.credits || 0}</i><i>✦ ${meta.shards || 0}</i>`;
    $$('[data-war-tab]', this.overlay).forEach((button) => button.classList.toggle('active', button.dataset.warTab === this.activeTab));
    const renderers = {
      world: () => this.renderWorld(),
      modes: () => this.renderModes(),
      survival: () => this.renderSurvival(),
      sandbox: () => this.renderSandbox(),
      editor: () => this.renderEditor(),
      records: () => this.renderRecords(),
      identity: () => this.renderIdentity(),
      arsenal: () => this.renderArsenal(),
      audio: () => this.renderAudio(),
    };
    this.content.innerHTML = (renderers[this.activeTab] || renderers.world)();
  }

  renderWorld() {
    const selected = WORLD_REGIONS.find((region) => region.id === this.state.world.selected) || WORLD_REGIONS[0];
    const lineSvg = WORLD_REGIONS.flatMap((region) => region.links.map((targetId) => {
      const target = WORLD_REGIONS.find((item) => item.id === targetId);
      return target ? `<line x1="${region.x}" y1="${region.y}" x2="${target.x}" y2="${target.y}"/>` : '';
    })).join('');
    return `<section class="world-layout">
      <div class="world-map-card">
        <div class="war-section-head"><div><span class="eyebrow">ГЛОБАЛЬНАЯ КАМПАНИЯ</span><h3>Карта цифрового фронта</h3><p>Выбирайте направление наступления. Победы открывают соседние регионы.</p></div><strong>${this.state.world.completed.length} / ${WORLD_REGIONS.length}</strong></div>
        <div class="world-map" data-world-map>
          <svg viewBox="0 0 100 75" preserveAspectRatio="none">${lineSvg}</svg>
          ${WORLD_REGIONS.map((region) => {
            const completed = this.state.world.completed.includes(region.id);
            const unlocked = this.state.world.unlocked.includes(region.id);
            return `<button data-war-action="select-region" data-region="${region.id}" class="world-region ${completed ? 'completed' : ''} ${unlocked ? 'unlocked' : 'locked'} ${selected.id === region.id ? 'selected' : ''}" style="left:${region.x}%;top:${region.y}%" ${unlocked ? '' : 'disabled'}><i>${completed ? '✓' : MISSION_MODES[region.mode]?.icon || '◆'}</i><span>${region.name}</span></button>`;
          }).join('')}
        </div>
      </div>
      <aside class="region-brief" style="--region:${BOSSES[selected.boss]?.color || '#54f5ff'}">
        <span class="eyebrow">${MISSION_MODES[selected.mode]?.name || 'ОПЕРАЦИЯ'}</span>
        <h3>${selected.name}</h3>
        ${selected.boss ? `<div class="boss-chip"><i>${BOSSES[selected.boss].icon}</i><span><b>${BOSSES[selected.boss].name}</b><small>${BOSSES[selected.boss].description}</small></span></div>` : ''}
        <dl><div><dt>РЕЖИМ</dt><dd>${MISSION_MODES[selected.mode]?.name}</dd></div><div><dt>НАГРАДА</dt><dd>${selected.reward}</dd></div><div><dt>СТАТУС</dt><dd>${this.state.world.completed.includes(selected.id) ? 'ЗАВЕРШЕНО' : this.state.world.unlocked.includes(selected.id) ? 'ДОСТУПНО' : 'ЗАКРЫТО'}</dd></div></dl>
        <button class="war-primary" data-war-action="start-region" data-region="${selected.id}" ${this.state.world.unlocked.includes(selected.id) ? '' : 'disabled'}>${this.state.world.completed.includes(selected.id) ? 'ПОВТОРИТЬ ОПЕРАЦИЮ' : 'НАЧАТЬ ОПЕРАЦИЮ'} →</button>
      </aside>
    </section>`;
  }

  renderModes() {
    const cards = [
      ['daily', 'Испытание дня', 'Одинаковая процедурная карта для всех игроков на текущую дату.', 'start-daily'],
      ['survival', 'Бесконечный рубеж', 'Волны, выбор усилений и боссы каждые пять волн.', 'start-survival'],
      ['sandbox', 'Песочница', 'Настройте противников, производство, туман и события.', 'open-sandbox'],
      ['editor', 'Редактор операций', 'Создайте карту пальцем, экспортируйте JSON и запускайте её.', 'open-editor'],
      ['defense', 'Оборона ядра', 'Переживите массированное наступление в течение 90 секунд.', 'start-mode'],
      ['hold', 'Удержание сектора', 'Захватите центр и удерживайте его 45 секунд.', 'start-mode'],
      ['escort', 'Сопровождение ядра', 'Защитите мобильное ядро на маршруте эвакуации.', 'start-mode'],
      ['energy', 'Энергетический протокол', 'Удерживайте реактор и накопите максимальный резерв.', 'start-mode'],
    ];
    return `<div class="war-section-head"><div><span class="eyebrow">ОТДЕЛЬНЫЕ СЦЕНАРИИ</span><h3>Режимы операции</h3><p>Каждый режим имеет собственные условия победы и рекорды.</p></div></div>
      <div class="mode-grid">${cards.map(([id, name, copy, action]) => `<article class="mode-card"><i>${MISSION_MODES[id]?.icon || '◆'}</i><span class="eyebrow">${MISSION_MODES[id]?.name || 'СПЕЦОПЕРАЦИЯ'}</span><h3>${name}</h3><p>${copy}</p><button data-war-action="${action}" data-mode="${id}">ОТКРЫТЬ →</button></article>`).join('')}</div>`;
  }

  renderSurvival() {
    const record = this.state.records.survivalWave || 0;
    const score = this.state.records.survivalScore || 0;
    return `<section class="survival-hero"><div><span class="eyebrow">БЕСКОНЕЧНЫЙ РЕЖИМ</span><h3>Последний рубеж</h3><p>Враги усиливаются с каждой волной. После отражения волны выбирайте одно из трёх улучшений. На 5-й, 10-й и последующих кратных пяти волнах появляется усиленный босс.</p><button class="war-primary" data-war-action="start-survival">НАЧАТЬ ВЫЖИВАНИЕ →</button></div><div class="survival-record"><i>∞</i><span>ЛИЧНЫЙ РЕКОРД</span><b>${record} ВОЛН</b><small>${score.toLocaleString('ru-RU')} очков</small></div></section>
      <div class="wave-preview">${[1, 5, 10, 15, 20].map((wave) => { const data = survivalWave(wave); return `<article class="${data.boss ? 'boss' : ''}"><small>ВОЛНА ${wave}</small><b>${data.troops} сил</b><span>${data.boss ? 'БОСС' : `интервал ${data.interval.toFixed(1)} с`}</span></article>`; }).join('')}</div>`;
  }

  renderSandbox() {
    const s = this.state.sandbox;
    return `<div class="war-section-head"><div><span class="eyebrow">СВОБОДНАЯ НАСТРОЙКА</span><h3>Песочница</h3><p>Все параметры сохраняются на устройстве.</p></div><button class="war-primary" data-war-action="start-sandbox">ЗАПУСТИТЬ →</button></div>
      <div class="sandbox-grid">
        ${this.rangeControl('Противники', 'enemies', s.enemies, 1, 2, 1)}
        ${this.rangeControl('Количество объектов', 'nodes', s.nodes, 7, 20, 1)}
        ${this.rangeControl('Сложность ИИ', 'difficulty', s.difficulty, .55, 2.2, .05)}
        ${this.rangeControl('Производство', 'production', s.production, .5, 2.5, .1)}
        <label class="war-select"><span>УСЛОВИЕ ПОБЕДЫ</span><select data-sandbox="mode">${['conquest', 'hold', 'defense', 'energy'].map((id) => `<option value="${id}" ${s.mode === id ? 'selected' : ''}>${MISSION_MODES[id].name}</option>`).join('')}</select></label>
        <label class="toggle-card"><input type="checkbox" data-sandbox="fog" ${s.fog ? 'checked' : ''}><span><b>Туман войны</b><small>Скрывать дальние объекты</small></span></label>
        <label class="toggle-card"><input type="checkbox" data-sandbox="events" ${s.events ? 'checked' : ''}><span><b>Случайные события</b><small>Бури, вирусы и подкрепления</small></span></label>
      </div>`;
  }

  rangeControl(label, key, value, min, max, step) {
    return `<label class="range-card"><span>${label.toUpperCase()}</span><b data-range-value="${key}">${Number(value).toFixed(step < 1 ? 2 : 0)}</b><input type="range" data-sandbox="${key}" value="${value}" min="${min}" max="${max}" step="${step}"></label>`;
  }

  renderEditor() {
    const result = this.editor.nodes.length ? validateCustomMap({ nodes: this.editor.nodes }) : { ok: false, errors: ['Добавьте базы на поле'] };
    return `<section class="editor-layout">
      <div class="editor-main">
        <div class="war-section-head"><div><span class="eyebrow">ВИЗУАЛЬНЫЙ РЕДАКТОР</span><h3>Конструктор карты</h3><p>Выберите владельца и тип, затем нажимайте на поле. Повторное нажатие выбирает объект.</p></div><div class="editor-actions"><button data-war-action="editor-clear">ОЧИСТИТЬ</button><button data-war-action="editor-export">ЭКСПОРТ JSON</button><button data-war-action="editor-import">ИМПОРТ</button><button class="war-primary" data-war-action="editor-start" ${result.ok ? '' : 'disabled'}>ЗАПУСТИТЬ</button></div></div>
        <div class="editor-canvas" id="editorCanvas" data-editor-canvas>
          ${this.editor.nodes.map((node) => `<button class="editor-node owner-${node.owner} ${this.editor.selected === node.id ? 'selected' : ''}" data-war-action="editor-select" data-node="${node.id}" style="left:${node.x / 12}%;top:${node.y / 7.2}%"><i>${node.type === 'core' ? '⬢' : node.type === 'fortress' ? '⬡' : node.type === 'factory' ? '⚙' : node.type === 'reactor' ? '⚡' : '◆'}</i><small>${node.id}</small></button>`).join('')}
        </div>
      </div>
      <aside class="editor-tools">
        <span class="eyebrow">НОВЫЙ ОБЪЕКТ</span>
        <label><span>Владелец</span><select data-editor="owner">${['player', 'neutral', 'red', 'violet'].map((owner) => `<option value="${owner}" ${this.editor.owner === owner ? 'selected' : ''}>${({ player: 'СПЕКТР', neutral: 'НЕЙТРАЛ', red: 'КАРМИН', violet: 'ВЕКТОР' })[owner]}</option>`).join('')}</select></label>
        <label><span>Тип базы</span><select data-editor="type">${['core', 'factory', 'fortress', 'relay', 'reactor'].map((type) => `<option value="${type}" ${this.editor.type === type ? 'selected' : ''}>${type.toUpperCase()}</option>`).join('')}</select></label>
        <div class="editor-validation ${result.ok ? 'ok' : ''}"><b>${result.ok ? 'КАРТА ГОТОВА' : 'НУЖНА НАСТРОЙКА'}</b>${result.errors.map((error) => `<small>${escapeHtml(error)}</small>`).join('')}</div>
        <div class="editor-node-list">${this.editor.nodes.map((node) => `<div><button data-war-action="editor-select" data-node="${node.id}">${node.id} · ${node.type}</button><button data-war-action="editor-delete" data-node="${node.id}">×</button></div>`).join('') || '<p>Объектов пока нет.</p>'}</div>
        <textarea id="editorJson" placeholder="Вставьте JSON карты для импорта"></textarea>
      </aside>
    </section>`;
  }

  renderRecords() {
    const records = Object.entries(this.state.records.maps || {}).sort((a, b) => (b[1].wins || 0) - (a[1].wins || 0));
    const meta = this.options.getMeta?.() || { stats: {} };
    const medals = MEDALS.map((medal) => ({ ...medal, unlocked: Boolean(this.state.medals[medal.id]) }));
    return `<div class="record-summary">
      <article><span>ВЫЖИВАНИЕ</span><b>${this.state.records.survivalWave || 0}</b><small>максимальная волна</small></article>
      <article><span>КАРТЫ</span><b>${this.state.records.mapsCreated || 0}</b><small>создано</small></article>
      <article><span>БОССЫ</span><b>${this.state.records.bossesDefeated || 0}</b><small>побеждено</small></article>
      <article><span>ПОСТРОЕНО</span><b>${this.state.records.built || 0}</b><small>объектов</small></article>
      <article><span>БЕЗ ПОТЕРЬ</span><b>${this.state.records.flawlessWins || 0}</b><small>побед</small></article>
      <article><span>БЫСТРЫЕ ПОБЕДЫ</span><b>${this.state.records.speedWins || 0}</b><small>до 01:30</small></article>
    </div>
    <div class="war-section-head"><div><span class="eyebrow">ЛОКАЛЬНЫЕ ДОСТИЖЕНИЯ</span><h3>Медали и рекорды</h3></div><button data-war-action="export-war-profile">ЭКСПОРТ WAR ROOM</button></div>
    <div class="medal-grid">${medals.map((medal) => `<article class="${medal.unlocked ? 'unlocked' : ''}"><i>${medal.icon}</i><span><b>${medal.name}</b><small>${medal.description}</small></span><em>${medal.unlocked ? 'ПОЛУЧЕНО' : 'ЗАКРЫТО'}</em></article>`).join('')}</div>
    <div class="record-table"><div class="record-row head"><span>ОПЕРАЦИЯ</span><span>ПОБЕДЫ</span><span>ВРЕМЯ</span><span>ТЕРРИТОРИЯ</span><span>ЦЕПОЧКА</span></div>${records.map(([key, record]) => `<div class="record-row"><span>${escapeHtml(key)}</span><b>${record.wins || 0} / ${record.plays || 0}</b><b>${record.bestTime ? formatTime(record.bestTime) : '—'}</b><b>${percent(record.maxTerritory)}</b><b>${record.maxChain || 0}</b></div>`).join('') || '<p class="war-empty">Рекорды появятся после первой операции WAR ROOM.</p>'}</div>`;
  }

  renderIdentity() {
    const meta = this.options.getMeta?.() || { owned: [] };
    const titles = availableTitles(this.state.records, meta.stats || {});
    const owned = (meta.owned || []).map((id) => CATALOG.find((item) => item.id === id)).filter(Boolean);
    return `<section class="identity-layout">
      <div class="identity-preview bg-${this.state.profileBackground}"><i>${escapeHtml(this.state.emblem)}</i><span><small>${escapeHtml(this.state.faction.toUpperCase())}</small><h3>${escapeHtml(meta.name || 'Оператор')}</h3><b>${escapeHtml(TITLES.find((title) => title.id === this.state.title)?.name || 'Рекрут сети')}</b><p>«${escapeHtml(this.state.motto)}»</p></span><div class="showcase-mini">${this.state.showcase.map((id) => { const item = CATALOG.find((entry) => entry.id === id); return item ? `<em style="--item:${item.preview}" title="${item.name}">◆</em>` : ''; }).join('')}</div></div>
      <div class="identity-settings">
        <div class="war-section-head"><div><span class="eyebrow">РАСШИРЕННЫЙ ПРОФИЛЬ</span><h3>Персонализация оператора</h3></div></div>
        <label><span>Девиз</span><input data-identity="motto" maxlength="72" value="${escapeHtml(this.state.motto)}"></label>
        <label><span>Эмблема</span><select data-identity="emblem">${['◆', '▲', '⬡', '◈', '◎', '✦', '⬢', 'Ø'].map((glyph) => `<option value="${glyph}" ${glyph === this.state.emblem ? 'selected' : ''}>${glyph}</option>`).join('')}</select></label>
        <label><span>Фракция</span><select data-identity="faction">${['specter', 'carmine', 'vector', 'neutral'].map((id) => `<option value="${id}" ${id === this.state.faction ? 'selected' : ''}>${id.toUpperCase()}</option>`).join('')}</select></label>
        <label><span>Фон</span><select data-identity="profileBackground">${['grid', 'nebula', 'terminal', 'void'].map((id) => `<option value="${id}" ${id === this.state.profileBackground ? 'selected' : ''}>${id.toUpperCase()}</option>`).join('')}</select></label>
        <label><span>Титул</span><select data-identity="title">${titles.map((title) => `<option value="${title.id}" ${title.id === this.state.title ? 'selected' : ''}>${title.name}</option>`).join('')}</select></label>
        <button class="war-primary" data-war-action="save-identity">СОХРАНИТЬ ПРОФИЛЬ</button>
      </div>
      <div class="showcase-editor"><span class="eyebrow">ВИТРИНА · ДО 3 ПРЕДМЕТОВ</span><div>${owned.map((item) => `<button data-war-action="toggle-showcase" data-item="${item.id}" class="${this.state.showcase.includes(item.id) ? 'active' : ''}" style="--item:${item.preview}"><i>◆</i><span>${item.name}</span></button>`).join('')}</div></div>
    </section>`;
  }

  renderArsenal() {
    const rotation = shopRotation(Date.now(), CATALOG);
    return `<div class="war-section-head"><div><span class="eyebrow">РОТАЦИЯ ПО ДАТЕ · БЕЗ ЛУТБОКСОВ</span><h3>Тактическая витрина</h3><p>Предпросмотр не покупает предмет. Испытание действует 30 секунд и применяется к следующей тренировке.</p></div><button data-war-action="open-full-shop">ПОЛНЫЙ МАГАЗИН</button></div>
      <div class="rotation-grid">${rotation.map((item) => `<article style="--item:${item.preview};--accent:${item.accent || item.preview}"><div><i>${item.type === 'trail' ? '➤' : item.type === 'theme' ? '▣' : item.type === 'avatar' ? '◆' : '⬡'}</i></div><small>${item.rarity}</small><h3>${item.name}</h3><p>${item.description}</p><footer><button data-war-action="preview-item" data-item="${item.id}" ${['base', 'trail', 'theme'].includes(item.type) ? '' : 'disabled'}>ПРЕДПРОСМОТР</button><button data-war-action="open-full-shop">МАГАЗИН</button></footer></article>`).join('')}</div>
      <div class="war-section-head bundle-head"><div><span class="eyebrow">КОМПЛЕКТЫ СО СКИДКОЙ</span><h3>Коллекционные наборы</h3></div></div>
      <div class="bundle-grid">${SHOP_BUNDLES.map((bundle) => `<article style="--bundle:${bundle.accent}"><i>⬡</i><span><small>СКИДКА ${bundle.discount}%</small><h3>${bundle.name}</h3><p>${bundle.items.map((id) => CATALOG.find((item) => item.id === id)?.name).filter(Boolean).join(' · ')}</p></span><button data-war-action="buy-bundle" data-bundle="${bundle.id}">КУПИТЬ НАБОР</button></article>`).join('')}</div>`;
  }

  renderAudio() {
    return `<section class="audio-layout"><div><span class="eyebrow">ДИНАМИЧЕСКАЯ СИСТЕМА</span><h3>Звук и атмосфера</h3><p>Музыка синтезируется в браузере и усиливается при потере территории, наступлении и появлении босса. Голосовые уведомления используют системный синтез речи.</p></div>
      <label class="toggle-card"><input type="checkbox" data-audio="music" ${this.state.audio.music ? 'checked' : ''}><span><b>Динамическая музыка</b><small>Спокойствие → напряжение → штурм</small></span></label>
      <label class="toggle-card"><input type="checkbox" data-audio="voice" ${this.state.audio.voice ? 'checked' : ''}><span><b>Голосовой оператор</b><small>События, волны и победа</small></span></label>
      <label class="range-card"><span>ИНТЕНСИВНОСТЬ</span><b>${Math.round(this.state.audio.intensity * 100)}%</b><input type="range" data-audio="intensity" min="0" max="1" step=".05" value="${this.state.audio.intensity}"></label>
      <button class="war-primary" data-war-action="audio-test">ПРОВЕРИТЬ ЗВУК</button>
    </section>`;
  }

  handleAction(event) {
    const target = event.target.closest('[data-war-action]');
    if (!target) {
      if (event.target.closest('[data-editor-canvas]')) this.editorCanvasClick(event);
      return;
    }
    const action = target.dataset.warAction;
    if (action === 'select-region') { this.state.world.selected = target.dataset.region; this.save(); this.render(); }
    if (action === 'start-region') this.startRegion(target.dataset.region);
    if (action === 'start-daily') this.startDaily();
    if (action === 'start-survival') this.startSurvival();
    if (action === 'start-sandbox') this.startSandbox();
    if (action === 'open-sandbox') { this.activeTab = 'sandbox'; this.render(); }
    if (action === 'open-editor') { this.activeTab = 'editor'; this.render(); }
    if (action === 'start-mode') this.startStandaloneMode(target.dataset.mode);
    if (action === 'editor-clear') { this.editor.nodes = []; this.editor.links = []; this.editor.selected = null; this.render(); }
    if (action === 'editor-select') { this.editor.selected = target.dataset.node; this.render(); }
    if (action === 'editor-delete') { const id = target.dataset.node; this.editor.nodes = this.editor.nodes.filter((node) => node.id !== id); this.editor.links = this.editor.links.filter((link) => !link.includes(id)); this.editor.selected = null; this.render(); }
    if (action === 'editor-export') this.exportEditor();
    if (action === 'editor-import') this.importEditor();
    if (action === 'editor-start') this.startEditorMap();
    if (action === 'save-identity') { this.save(); this.options.notice?.('Расширенный профиль сохранён', 'good'); this.render(); }
    if (action === 'toggle-showcase') this.toggleShowcase(target.dataset.item);
    if (action === 'preview-item') this.previewItem(target.dataset.item);
    if (action === 'open-full-shop') { this.close(); this.options.openMeta?.('shop'); }
    if (action === 'buy-bundle') this.buyBundle(target.dataset.bundle);
    if (action === 'audio-test') { this.ensureAudio(); this.speak('Тактическая сеть готова'); this.audioPulse(620); }
    if (action === 'export-war-profile') download(`neon-war-room-${dateKey()}.json`, exportWarRoomState(this.state));
  }

  handleChange(event) {
    const sandbox = event.target.dataset.sandbox;
    if (sandbox) {
      this.state.sandbox[sandbox] = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
      if (['enemies', 'nodes', 'difficulty', 'production'].includes(sandbox)) this.state.sandbox[sandbox] = Number(event.target.value);
      this.save(); this.render(); return;
    }
    const editor = event.target.dataset.editor;
    if (editor) { this.editor[editor] = event.target.value; return; }
    const identity = event.target.dataset.identity;
    if (identity) { this.state[identity] = event.target.value; this.save(); return; }
    const audio = event.target.dataset.audio;
    if (audio) {
      this.state.audio[audio] = event.target.type === 'checkbox' ? event.target.checked : Number(event.target.value);
      if (!this.state.audio.music) this.stopAudio();
      else this.ensureAudio();
      this.save(); this.render();
    }
  }

  handleInput(event) {
    const sandbox = event.target.dataset.sandbox;
    if (sandbox && event.target.type === 'range') {
      this.state.sandbox[sandbox] = Number(event.target.value);
      const label = $(`[data-range-value="${sandbox}"]`, this.content);
      if (label) label.textContent = Number(event.target.value).toFixed(Number(event.target.step) < 1 ? 2 : 0);
      this.save();
    }
    if (event.target.dataset.identity === 'motto') this.state.motto = event.target.value;
  }

  editorCanvasClick(event) {
    const canvas = event.target.closest('[data-editor-canvas]');
    if (!canvas || event.target.closest('.editor-node')) return;
    const rect = canvas.getBoundingClientRect();
    const x = clamp((event.clientX - rect.left) / rect.width * 1200, 40, 1160);
    const y = clamp((event.clientY - rect.top) / rect.height * 720, 40, 680);
    const prefix = this.editor.owner === 'player' ? 'p' : this.editor.owner === 'red' ? 'r' : this.editor.owner === 'violet' ? 'v' : 'n';
    const occupied = new Set(this.editor.nodes.map((node) => node.id));
    let index = 0;
    while (occupied.has(`${prefix}${index}`)) index += 1;
    const id = `${prefix}${index}`;
    this.editor.nodes.push({ id, x: Math.round(x), y: Math.round(y), type: this.editor.type, owner: this.editor.owner, troops: this.editor.type === 'core' ? 58 : 24, level: 1 });
    this.editor.selected = id;
    this.render();
  }

  exportEditor() {
    const payload = { title: 'Моя операция', nodes: this.editor.nodes, links: this.editor.links, warMode: 'conquest' };
    download(`neon-map-${Date.now()}.json`, JSON.stringify(payload, null, 2));
  }

  importEditor() {
    const text = $('#editorJson', this.content)?.value || '';
    const parsed = safeParse(text);
    const normalized = normalizeCustomMap(parsed);
    if (!normalized.validation.ok) { this.options.notice?.(normalized.validation.errors[0], 'bad'); return; }
    this.editor.nodes = normalized.map.nodes;
    this.editor.links = normalized.map.links;
    this.editor.selected = null;
    this.options.notice?.('Карта импортирована', 'good');
    this.render();
  }

  startEditorMap() {
    const payload = { title: 'Операция редактора', nodes: this.editor.nodes, links: this.editor.links, warMode: 'conquest' };
    const normalized = normalizeCustomMap(payload);
    if (!normalized.validation.ok) { this.options.notice?.(normalized.validation.errors[0], 'bad'); return; }
    this.state.records.mapsCreated += 1;
    this.state.createdMaps.unshift(normalized.map);
    this.state.createdMaps = this.state.createdMaps.slice(0, 30);
    this.save();
    this.launchMap(normalized.map, { mode: normalized.map.warMode, custom: true });
  }

  toggleShowcase(id) {
    if (this.state.showcase.includes(id)) this.state.showcase = this.state.showcase.filter((item) => item !== id);
    else if (this.state.showcase.length < 3) this.state.showcase.push(id);
    else this.options.notice?.('В витрине можно разместить три предмета', 'bad');
    this.save(); this.render();
  }

  previewItem(id) {
    if (!this.options.previewItem?.(id, 30_000)) { this.options.notice?.('Для этого предмета доступен только просмотр карточки', 'bad'); return; }
    this.options.notice?.('Предпросмотр активен 30 секунд', 'good');
  }

  buyBundle(id) {
    const result = this.options.buyBundle?.(id);
    if (!result?.ok) this.options.notice?.(result?.reason === 'funds' ? 'Недостаточно валюты для комплекта' : 'Комплект уже собран', 'bad');
    else this.options.notice?.('Коллекционный комплект приобретён', 'good');
    this.render();
  }

  startRegion(id) {
    const region = WORLD_REGIONS.find((item) => item.id === id);
    if (!region || !this.state.world.unlocked.includes(id)) return;
    this.launchExisting(region.map, { mode: region.mode, regionId: id, boss: region.boss });
  }

  startDaily() {
    this.launchMap(generateDailyChallenge(), { mode: 'daily', daily: true });
  }

  startSurvival() {
    this.launchMap(generateSurvivalMap(), { mode: 'survival' });
  }

  startSandbox() {
    this.launchMap(generateSandboxMap(this.state.sandbox), { mode: this.state.sandbox.mode, sandbox: true, difficulty: this.state.sandbox.difficulty });
  }

  startStandaloneMode(mode) {
    const mapIds = { hold: 'crossfire', defense: 'citadel', escort: 'trident', energy: 'fracture' };
    this.launchExisting(mapIds[mode] || 'awakening', { mode });
  }

  launchExisting(id, options = {}) {
    this.close();
    this.options.startLevel?.(id, { ...options, warRoom: true });
  }

  launchMap(map, options = {}) {
    this.close();
    this.options.startCustomMap?.(map, { ...options, warRoom: true });
  }

  onBattleStart(engine, map, options = {}) {
    if (!options.warRoom && !map.warMode) {
      this.battle = null;
      this.hud.hidden = true;
      return;
    }
    const mode = options.mode || map.warMode || 'conquest';
    engine.mode = mode === 'daily' ? map.warMode || 'conquest' : mode;
    const meta = this.options.getMeta?.() || { stats: {}, history: [] };
    if (this.state.battle.adaptiveAi) engine.difficulty *= adaptiveDifficulty(meta.stats, meta.history || []);
    if (options.difficulty) engine.difficulty = Number(options.difficulty);
    const personalities = options.boss ? { red: options.boss === 'swarm' ? 'swarm' : options.boss === 'phantom' ? 'stealth' : 'aggressive', violet: 'tactical' } : { red: 'aggressive', violet: 'economic' };
    engine.setAIProfile?.('red', personalities.red);
    engine.setAIProfile?.('violet', personalities.violet);
    engine.setDefaultTactics?.({ formation: this.state.battle.formation, composition: this.state.battle.composition });
    if (map.sandbox?.production) engine.eventModifiers.growth = Number(map.sandbox.production);
    this.battle = {
      engine,
      map,
      options,
      mode,
      started: engine.time,
      hold: 0,
      energyHold: 0,
      defenseTime: 0,
      wave: 1,
      waveClock: 3,
      score: 0,
      boss: options.boss || null,
      bossDefeated: false,
      plannerOrders: [],
      eventHistory: [],
      survivalUpgrade: null,
    };
    this.eventClock = 20 + Math.random() * 12;
    this.activeEvent = null;
    this.buildMode = null;
    this.routeMode = false;
    this.routePoints = [];
    this.selectedConvoyId = null;
    if (this.battle.boss) this.setupBoss(engine, this.battle.boss);
    if (mode === 'escort') this.setupEscort(engine);
    this.hud.hidden = false;
    this.renderBattleHud(true);
    this.ensureAudio();
    this.speak(`${MISSION_MODES[mode]?.name || 'Операция'} началась`);
  }

  setupBoss(engine, bossId) {
    const boss = BOSSES[bossId];
    const candidates = [...engine.factionNodes('red'), ...engine.factionNodes('violet')].filter((node) => node.type === 'core' || node.type === 'fortress');
    const node = candidates.sort((a, b) => b.troops - a.troops)[0];
    if (!boss || !node) return;
    node.boss = bossId;
    node.bossName = boss.name;
    node.bossPhase = boss.phases;
    node.bossMaxTroops = Math.max(node.troops * 1.45, 95);
    node.bossPhaseTroops = node.bossMaxTroops;
    node.troops = node.bossMaxTroops;
    engine.modeState.boss = bossId;
    engine.modeState.bossPhase = boss.phases;
    engine.modeState.bossMax = boss.phases;
    this.battle.bossNode = node.id;
  }

  setupEscort(engine) {
    const source = engine.factionNodes('player').filter((node) => !node.virtual)[0];
    if (!source) return;
    const points = [{ x: 360, y: 180 }, { x: 610, y: 360 }, { x: 850, y: 550 }, { x: 1110, y: 360 }];
    const ids = points.map((point) => engine.addWaypoint(point.x, point.y));
    engine.send(source.id, ids[0], .15, 'player', { route: ids.slice(1), unitType: 'heavy', formation: 'line', escort: true, origin: source.id });
    const escort = engine.convoys.at(-1);
    if (escort) { escort.escort = true; escort.amount = Math.max(12, escort.amount); this.battle.escortId = escort.id; }
  }

  onBattleEnd(payload = {}) {
    if (!this.battle) return null;
    const engine = this.battle.engine;
    const victory = Boolean(payload.victory);
    const result = {
      mapId: this.battle.map.id,
      mode: this.battle.mode,
      victory,
      time: engine.time,
      territory: engine.territory?.player || 0,
      losses: engine.stats?.lost || 0,
      longestChain: engine.stats?.chainedRoutes || 0,
      built: engine.stats?.built || 0,
      redirected: engine.stats?.redirected || 0,
      recalled: engine.stats?.recalled || 0,
      bossDefeated: this.battle.bossDefeated,
      survivalWave: this.battle.mode === 'survival' ? this.battle.wave : 0,
      survivalScore: this.battle.mode === 'survival' ? this.battle.score : 0,
    };
    this.state.records = updateRecords(this.state.records, result);
    if (victory && this.battle.options.regionId) {
      this.state.world = unlockWorldRegion(this.state.world, this.battle.options.regionId);
      this.state.records.worldRegions = this.state.world.completed.length;
    }
    if (this.battle.options.daily || this.battle.map.dailyKey) {
      const current = this.state.daily.best;
      if (victory && (!current || engine.time < current.time)) this.state.daily.best = { time: engine.time, stars: payload.stars || 0 };
      this.state.daily.played = true;
    }
    this.state.medals = calculateUnlockedMedals(this.state.records, this.options.getMeta?.()?.stats || {});
    this.save();
    this.stopAudio();
    this.speak(victory ? 'Операция завершена. Победа.' : 'Сеть потеряна.');
    const snapshot = clone(result);
    this.battle = null;
    this.hud.hidden = true;
    return snapshot;
  }

  update(dt, now = performance.now()) {
    if (!this.battle?.engine || this.battle.engine.result) return;
    const engine = this.battle.engine;
    const scaled = Math.min(.2, dt) * Math.max(1, engine.speed || 1);
    this.updateMode(scaled);
    this.updateEvents(scaled);
    this.updateBoss(scaled);
    this.updateMusic();
    if (now - this.lastHud > 350) { this.renderBattleHud(); this.lastHud = now; }
  }

  updateMode(dt) {
    const engine = this.battle.engine;
    const mode = engine.mode;
    if (mode === 'hold') {
      const center = Object.values(engine.nodes).filter((node) => !node.virtual).sort((a, b) => Math.hypot(a.x - 600, a.y - 360) - Math.hypot(b.x - 600, b.y - 360))[0];
      this.battle.hold = center?.owner === 'player' ? this.battle.hold + dt : Math.max(0, this.battle.hold - dt * .45);
      if (this.battle.hold >= 45) engine.result = 'victory';
    }
    if (mode === 'defense') {
      this.battle.defenseTime += dt;
      this.battle.waveClock -= dt;
      if (this.battle.waveClock <= 0) { this.spawnWave(false); this.battle.waveClock = Math.max(3.2, 8 - this.battle.wave * .3); this.battle.wave += 1; }
      if (this.battle.defenseTime >= 90) engine.result = 'victory';
    }
    if (mode === 'energy') {
      const reactor = engine.factionNodes('player').find((node) => node.type === 'reactor');
      this.battle.energyHold = reactor && engine.energy >= 95 ? this.battle.energyHold + dt : Math.max(0, this.battle.energyHold - dt);
      if (this.battle.energyHold >= 12) engine.result = 'victory';
    }
    if (mode === 'escort') {
      const escort = engine.convoys.find((convoy) => convoy.id === this.battle.escortId);
      if (engine.modeState.escortComplete) engine.result = 'victory';
      else if (!escort && !engine.modeState.escortComplete) engine.result = 'defeat';
    }
    if (mode === 'survival') {
      this.battle.waveClock -= dt;
      if (this.battle.waveClock <= 0) {
        this.spawnWave(this.battle.wave % 5 === 0);
        const data = survivalWave(this.battle.wave);
        this.battle.score += Math.round(data.troops * 14 + this.battle.wave * 90);
        this.battle.wave += 1;
        this.battle.waveClock = data.interval + 6;
        this.offerSurvivalUpgrade();
      }
    }
  }

  spawnWave(boss = false) {
    const engine = this.battle.engine;
    const waveData = survivalWave(this.battle.wave);
    const enemies = ['red', 'violet'].flatMap((owner) => engine.factionNodes(owner)).filter((node) => !node.virtual);
    const players = engine.factionNodes('player').filter((node) => !node.virtual);
    if (!enemies.length || !players.length) return;
    const target = players.sort((a, b) => a.troops - b.troops)[0];
    const source = enemies.sort((a, b) => b.troops - a.troops)[0];
    source.troops = Math.max(source.troops, waveData.troops * (boss ? 1.8 : 1));
    const personality = boss ? 'heavy' : this.battle.wave % 3 === 0 ? 'rapid' : 'assault';
    engine.send(source.id, target.id, boss ? .82 : .58, source.owner, { unitType: personality, formation: boss ? 'wedge' : 'column' });
    this.options.notice?.(`${boss ? 'БОСС-ВОЛНА' : 'ВОЛНА'} ${this.battle.wave}`, boss ? 'bad' : '');
    this.speak(`${boss ? 'Босс' : 'Волна'} ${this.battle.wave}`);
  }

  offerSurvivalUpgrade() {
    if (this.battle.mode !== 'survival' || this.battle.wave <= 2) return;
    const upgrades = [
      { id: 'reinforce', name: '+12 ко всем базам' },
      { id: 'energy', name: '+25 энергии' },
      { id: 'speed', name: 'Колонны +12% скорости' },
    ];
    this.battle.survivalUpgrade = upgrades[(this.battle.wave + Math.floor(Math.random() * upgrades.length)) % upgrades.length];
  }

  applySurvivalUpgrade(id) {
    const engine = this.battle?.engine;
    if (!engine) return;
    if (id === 'reinforce') engine.factionNodes('player').forEach((node) => { node.troops = Math.min(engine.capacity(node), node.troops + 12); });
    if (id === 'energy') engine.energy = Math.min(100, engine.energy + 25);
    if (id === 'speed') engine.defaultSendOptions.speedBonus = (engine.defaultSendOptions.speedBonus || 1) * 1.12;
    this.battle.survivalUpgrade = null;
    this.options.notice?.('Усиление применено', 'good');
    this.renderBattleHud(true);
  }

  updateBoss() {
    if (!this.battle?.bossNode) return;
    const engine = this.battle.engine;
    const node = engine.nodes[this.battle.bossNode];
    if (!node || node.owner === 'player') {
      if (!this.battle.bossDefeated) { this.battle.bossDefeated = true; engine.stats.bossesDefeated += 1; }
      return;
    }
    const boss = BOSSES[this.battle.boss];
    if (boss?.trait === 'relocate' && node.bossPhase !== this.battle.lastBossPhase) {
      this.battle.lastBossPhase = node.bossPhase;
      const angle = (node.bossPhase || 1) * 1.8;
      node.x = clamp(600 + Math.cos(angle) * 330, 100, 1100);
      node.y = clamp(360 + Math.sin(angle) * 220, 100, 620);
    }
    if (boss?.trait === 'spawn') {
      this.battle.spawnClock = (this.battle.spawnClock || 8) - .05;
      if (this.battle.spawnClock <= 0) {
        node.troops = Math.min(engine.capacity(node), node.troops + 14);
        this.battle.spawnClock = 8;
      }
    }
    if (boss?.trait === 'infect') {
      this.battle.infectClock = (this.battle.infectClock || 12) - .05;
      if (this.battle.infectClock <= 0) {
        const target = engine.factionNodes('player').sort((a, b) => b.troops - a.troops)[0];
        if (target) target.infectedUntil = engine.time + 8;
        this.battle.infectClock = 12;
      }
    }
  }

  updateEvents(dt) {
    const engine = this.battle.engine;
    if (!this.state.battle.randomEvents || this.battle.map.sandbox?.events === false) return;
    if (this.activeEvent && engine.time >= this.eventEnd) this.endEvent();
    if (this.activeEvent) return;
    this.eventClock -= dt;
    if (this.eventClock > 0) return;
    const event = chooseRandomEvent(`${this.battle.map.id}-${Math.floor(engine.time)}-${this.battle.eventHistory.length}`, this.battle.eventHistory.slice(-3));
    if (!event) return;
    this.startEvent(event);
    this.eventClock = 28 + Math.random() * 18;
  }

  startEvent(event) {
    const engine = this.battle.engine;
    this.activeEvent = event;
    this.eventEnd = engine.time + event.duration;
    this.battle.eventHistory.push(event.id);
    const modifiers = { speed: 1, growth: 1, energy: 1, vision: 1, reveal: false, turret: 1 };
    if (event.id === 'storm') { modifiers.speed = .68; modifiers.energy = 1.75; }
    if (event.id === 'blackout') modifiers.vision = .42;
    if (event.id === 'overclock') modifiers.growth = 1.65;
    if (event.id === 'portal') modifiers.speed = 1.5;
    if (event.id === 'reveal') modifiers.reveal = true;
    if (event.id === 'uprising') {
      const target = Object.values(engine.nodes).filter((node) => node.owner === 'neutral' && !node.virtual).sort((a, b) => a.troops - b.troops)[0];
      if (target) target.troops += 34;
    }
    if (event.id === 'satellite' || event.id === 'mutiny') {
      const target = [...engine.factionNodes('red'), ...engine.factionNodes('violet')].sort((a, b) => b.troops - a.troops)[0];
      if (target) target.troops = Math.max(1, target.troops * (event.id === 'satellite' ? .68 : .78));
    }
    if (event.id === 'virus') {
      const target = engine.factionNodes('player').sort((a, b) => b.troops - a.troops)[0];
      if (target) target.infectedUntil = engine.time + event.duration;
    }
    if (event.id === 'reinforcement') {
      const target = engine.factionNodes('player').sort((a, b) => a.troops - b.troops)[0];
      if (target) target.troops = Math.min(engine.capacity(target), target.troops + 28);
    }
    engine.setEventModifiers(modifiers);
    this.options.notice?.(`${event.name}: ${event.description}`, event.id === 'virus' || event.id === 'blackout' ? 'bad' : 'good');
    this.speak(event.name);
  }

  endEvent() {
    if (!this.battle) return;
    this.battle.engine.setEventModifiers({ speed: 1, growth: this.battle.map.sandbox?.production || 1, energy: 1, vision: 1, reveal: false, turret: 1 });
    this.battle.engine.stats.eventsSurvived += 1;
    this.activeEvent = null;
  }

  pointerDown(event, world, hit) {
    if (!this.battle) return false;
    if (this.convoyCommandMode && this.selectedConvoyId) {
      const engine = this.battle.engine;
      if (!hit || hit.virtual) { this.options.notice?.('Коснитесь базы-цели', 'bad'); return true; }
      if (this.convoyCommandMode === 'retarget') {
        engine.retargetConvoy(this.selectedConvoyId, hit.id);
        this.convoyCommandMode = null;
      } else if (this.convoyCommandMode === 'split') {
        engine.splitConvoy(this.selectedConvoyId, hit.id, .5);
        this.convoyCommandMode = null;
      } else if (this.convoyCommandMode === 'patrol') {
        if (!this.patrolTargets.includes(hit.id)) this.patrolTargets.push(hit.id);
        if (this.patrolTargets.length >= 2) {
          engine.patrolConvoy(this.selectedConvoyId, this.patrolTargets);
          this.convoyCommandMode = null;
          this.patrolTargets = [];
        } else this.options.notice?.('Выберите вторую точку патруля', 'good');
      }
      this.renderBattleHud(true);
      return true;
    }
    if (this.buildMode && !hit) {
      const node = this.battle.engine.buildNode(this.buildMode, world.x, world.y);
      if (node) { this.options.notice?.(`${BUILDINGS[this.buildMode].name} размещён`, 'good'); this.buildMode = null; }
      else this.options.notice?.('Недостаточно энергии или место занято', 'bad');
      this.renderBattleHud(true);
      return true;
    }
    if (this.routeMode) {
      if (hit) {
        const sources = this.options.getSelected?.() || [];
        const sent = this.battle.engine.sendWaypointRoute(sources, this.routePoints, hit.id, {
          unitType: this.options.getUnit?.() || 'assault',
          formation: this.state.battle.formation,
          composition: this.state.battle.composition,
        });
        this.options.notice?.(sent ? `Маршрут через ${this.routePoints.length} точек отправлен` : 'Выберите собственные базы-источники', sent ? 'good' : 'bad');
        this.routeMode = false;
        this.routePoints = [];
      } else if (this.routePoints.length < 8) {
        this.routePoints.push({ x: world.x, y: world.y });
        this.options.notice?.(`Точка маршрута ${this.routePoints.length}`, 'good');
      }
      this.renderBattleHud(true);
      return true;
    }
    return false;
  }

  pointerMove() { return false; }
  pointerUp() { return false; }

  draw(ctx, now) {
    if (!this.battle) return;
    if (this.routePoints.length) {
      ctx.save();
      ctx.strokeStyle = '#ffd66b'; ctx.fillStyle = '#07101b'; ctx.lineWidth = 2.5; ctx.setLineDash([8, 6]);
      ctx.beginPath();
      this.routePoints.forEach((point, index) => { if (index) ctx.lineTo(point.x, point.y); else ctx.moveTo(point.x, point.y); });
      ctx.stroke(); ctx.setLineDash([]);
      this.routePoints.forEach((point, index) => { ctx.beginPath(); ctx.arc(point.x, point.y, 10 + Math.sin(now * .005 + index) * 1.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#ffd66b'; ctx.font = '900 9px Inter'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(index + 1), point.x, point.y); ctx.fillStyle = '#07101b'; });
      ctx.restore();
    }
  }

  renderBattleHud(force = false) {
    if (!this.battle || !this.hud) return;
    const engine = this.battle.engine;
    const convoys = engine.convoys.filter((convoy) => convoy.owner === 'player');
    if (this.selectedConvoyId && !convoys.some((convoy) => convoy.id === this.selectedConvoyId)) this.selectedConvoyId = convoys[0]?.id || null;
    const selectedConvoy = convoys.find((convoy) => convoy.id === this.selectedConvoyId);
    const modeStatus = this.modeStatus();
    const bossNode = this.battle.bossNode ? engine.nodes[this.battle.bossNode] : null;
    this.hud.innerHTML = `<header><button data-battle-action="toggle-hud">▦</button><span><small>${MISSION_MODES[this.battle.mode]?.name || this.battle.mode.toUpperCase()}</small><b>${modeStatus}</b></span>${this.activeEvent ? `<em>${this.activeEvent.icon} ${this.activeEvent.name}</em>` : ''}</header>
      <div class="war-hud-body">
        ${bossNode && bossNode.owner !== 'player' ? `<div class="boss-bar" style="--boss:${BOSSES[this.battle.boss]?.color}"><span>${BOSSES[this.battle.boss]?.icon} ${BOSSES[this.battle.boss]?.name}</span><b>ФАЗА ${bossNode.bossPhase} / ${BOSSES[this.battle.boss]?.phases}</b><i><em style="width:${Math.min(100, bossNode.troops / bossNode.bossMaxTroops * 100)}%"></em></i></div>` : ''}
        <section><span>ПОСТРОЙКА</span><div class="build-strip">${Object.values(BUILDINGS).map((building) => `<button data-battle-action="build" data-building="${building.id}" class="${this.buildMode === building.id ? 'active' : ''}" title="${building.description}"><i>${building.icon}</i><small>${building.cost}</small></button>`).join('')}</div></section>
        <section><span>ТАКТИКА</span><div class="tactic-row"><select data-battle-setting="formation">${Object.values(FORMATIONS).map((formation) => `<option value="${formation.id}" ${this.state.battle.formation === formation.id ? 'selected' : ''}>${formation.name}</option>`).join('')}</select><button data-battle-action="route" class="${this.routeMode ? 'active' : ''}">ТОЧКИ ${this.routePoints.length}</button><button data-battle-action="planner">ПЛАН</button></div></section>
        <section><span>СОСТАВ ГРУППЫ</span><div class="composition-row">${Object.entries(this.state.battle.composition).map(([id, value]) => `<label title="${id}"><small>${({ assault: 'ШТ', rapid: 'РВ', heavy: 'ТР', scout: 'РЗ' })[id]}</small><input type="number" data-composition="${id}" min="0" max="100" value="${value}"></label>`).join('')}</div></section>
        <section><span>КОЛОННЫ</span><div class="convoy-command"><select data-battle-setting="convoy"><option value="">${convoys.length ? 'Выберите колонну' : 'Нет колонн'}</option>${convoys.map((convoy) => `<option value="${convoy.id}" ${convoy.id === this.selectedConvoyId ? 'selected' : ''}>${Math.floor(convoy.amount)} · ${convoy.to.toUpperCase()} · ${FORMATION_TYPES_LABEL(convoy.formation)}</option>`).join('')}</select><button data-battle-action="hold" ${selectedConvoy ? '' : 'disabled'}>${selectedConvoy?.held ? 'ПРОДОЛЖИТЬ' : 'СТОП'}</button><button data-battle-action="recall" ${selectedConvoy ? '' : 'disabled'}>НАЗАД</button><button data-battle-action="retarget" class="${this.convoyCommandMode === 'retarget' ? 'active' : ''}" ${selectedConvoy ? '' : 'disabled'}>ЦЕЛЬ</button><button data-battle-action="split" class="${this.convoyCommandMode === 'split' ? 'active' : ''}" ${selectedConvoy ? '' : 'disabled'}>РАЗДЕЛИТЬ</button><button data-battle-action="patrol" class="${this.convoyCommandMode === 'patrol' ? 'active' : ''}" ${selectedConvoy ? '' : 'disabled'}>ПАТРУЛЬ</button><button data-battle-action="merge" ${selectedConvoy ? '' : 'disabled'}>ОБЪЕДИНИТЬ</button></div></section>
        ${this.battle.survivalUpgrade ? `<button class="survival-upgrade" data-battle-action="survival-upgrade" data-upgrade="${this.battle.survivalUpgrade.id}">УСИЛЕНИЕ ВОЛНЫ: ${this.battle.survivalUpgrade.name}</button>` : ''}
      </div>`;
  }

  modeStatus() {
    if (!this.battle) return '';
    const engine = this.battle.engine;
    if (this.battle.mode === 'hold') return `ЦЕНТР ${Math.floor(this.battle.hold)} / 45 С`;
    if (this.battle.mode === 'defense') return `ОБОРОНА ${Math.floor(this.battle.defenseTime)} / 90 С`;
    if (this.battle.mode === 'energy') return `РЕЗЕРВ ${Math.floor(engine.energy)}% · ${Math.floor(this.battle.energyHold)} / 12 С`;
    if (this.battle.mode === 'escort') return engine.modeState.escortComplete ? 'ЭВАКУАЦИЯ ЗАВЕРШЕНА' : 'ЗАЩИЩАЙТЕ МОБИЛЬНОЕ ЯДРО';
    if (this.battle.mode === 'survival') return `ВОЛНА ${this.battle.wave} · ${this.battle.score.toLocaleString('ru-RU')} ОЧКОВ`;
    if (this.battle.mode === 'boss') return `БОСС · ФАЗА ${engine.modeState.bossPhase || 1}`;
    return `ТЕРРИТОРИЯ ${percent(engine.territory.player)}`;
  }

  handleBattleAction(event) {
    const button = event.target.closest('[data-battle-action]');
    if (!button || !this.battle) return;
    const action = button.dataset.battleAction;
    const engine = this.battle.engine;
    if (action === 'toggle-hud') this.hud.classList.toggle('collapsed');
    if (action === 'build') { this.buildMode = this.buildMode === button.dataset.building ? null : button.dataset.building; this.routeMode = false; this.options.notice?.(this.buildMode ? `Коснитесь свободного места: ${BUILDINGS[this.buildMode].name}` : 'Строительство отменено'); this.renderBattleHud(true); }
    if (action === 'route') { this.routeMode = !this.routeMode; this.buildMode = null; if (!this.routeMode) this.routePoints = []; this.options.notice?.(this.routeMode ? 'Поставьте точки на карте и завершите на базе-цели' : 'Маршрут отменён'); this.renderBattleHud(true); }
    if (action === 'planner') this.openPlanner();
    if (action === 'hold' && this.selectedConvoyId) { engine.toggleConvoyHold(this.selectedConvoyId); this.renderBattleHud(true); }
    if (action === 'recall' && this.selectedConvoyId) { engine.recallConvoy(this.selectedConvoyId); this.convoyCommandMode = null; this.renderBattleHud(true); }
    if (action === 'retarget' && this.selectedConvoyId) { this.convoyCommandMode = this.convoyCommandMode === 'retarget' ? null : 'retarget'; this.patrolTargets = []; this.options.notice?.(this.convoyCommandMode ? 'Коснитесь новой базы-цели' : 'Смена цели отменена'); this.renderBattleHud(true); }
    if (action === 'split' && this.selectedConvoyId) { this.convoyCommandMode = this.convoyCommandMode === 'split' ? null : 'split'; this.patrolTargets = []; this.options.notice?.(this.convoyCommandMode ? 'Коснитесь цели отделившейся группы' : 'Разделение отменено'); this.renderBattleHud(true); }
    if (action === 'patrol' && this.selectedConvoyId) { this.convoyCommandMode = this.convoyCommandMode === 'patrol' ? null : 'patrol'; this.patrolTargets = []; this.options.notice?.(this.convoyCommandMode ? 'Выберите две базы патрульного маршрута' : 'Патруль отменён'); this.renderBattleHud(true); }
    if (action === 'merge' && this.selectedConvoyId) {
      const selected = engine.convoys.find((item) => item.id === this.selectedConvoyId);
      if (selected) {
        const point = engine.convoyPoint(selected);
        const nearby = engine.convoys.filter((item) => item.owner === 'player' && Math.hypot(engine.convoyPoint(item).x - point.x, engine.convoyPoint(item).y - point.y) < 90).map((item) => item.id);
        this.options.notice?.(engine.mergeConvoys(nearby) ? `Объединено колонн: ${nearby.length}` : 'Рядом нет другой союзной колонны', nearby.length > 1 ? 'good' : 'bad');
      }
      this.renderBattleHud(true);
    }
    if (action === 'survival-upgrade') this.applySurvivalUpgrade(button.dataset.upgrade);
  }

  handleBattleChange(event) {
    if (!this.battle) return;
    const setting = event.target.dataset.battleSetting;
    if (setting === 'formation') {
      this.state.battle.formation = event.target.value;
      this.battle.engine.setDefaultTactics({ formation: event.target.value, composition: this.state.battle.composition });
      this.save();
    }
    if (setting === 'convoy') this.selectedConvoyId = event.target.value || null;
  }

  handleBattleInput(event) {
    const key = event.target.dataset.composition;
    if (!key || !this.battle) return;
    this.state.battle.composition[key] = Number(event.target.value);
    this.state.battle.composition = normalizeComposition(this.state.battle.composition);
    this.battle.engine.setDefaultTactics({ formation: this.state.battle.formation, composition: this.state.battle.composition });
    this.save();
  }

  openPlanner() {
    if (!this.battle) return;
    const engine = this.battle.engine;
    engine.speed = 0;
    $('#pauseOverlay')?.classList.add('visible');
    this.planner.hidden = false;
    const players = engine.factionNodes('player').filter((node) => !node.virtual);
    const targets = Object.values(engine.nodes).filter((node) => !node.virtual);
    this.planner.innerHTML = `<div class="planner-head"><span><small>ТАКТИЧЕСКАЯ ПАУЗА</small><b>Пакет приказов</b></span><button data-plan-action="close">×</button></div><p>Добавьте несколько приказов. Они будут выполнены одновременно при запуске.</p><div class="planner-order-form"><select id="planFrom">${players.map((node) => `<option value="${node.id}">${node.id.toUpperCase()} · ${Math.floor(node.troops)}</option>`).join('')}</select><select id="planTo">${targets.map((node) => `<option value="${node.id}">${node.id.toUpperCase()} · ${node.owner}</option>`).join('')}</select><button data-plan-action="add">ДОБАВИТЬ</button></div><div class="planner-orders">${this.battle.plannerOrders.map((order, index) => `<div><span>${order.from.toUpperCase()} → ${order.to.toUpperCase()}</span><button data-plan-action="remove" data-index="${index}">×</button></div>`).join('') || '<p>Приказы не добавлены.</p>'}</div><button class="war-primary" data-plan-action="execute">ВЫПОЛНИТЬ ${this.battle.plannerOrders.length} ПРИКАЗОВ</button>`;
  }

  handlePlanner(event) {
    const button = event.target.closest('[data-plan-action]');
    if (!button || !this.battle) return;
    const action = button.dataset.planAction;
    if (action === 'close') { this.planner.hidden = true; return; }
    if (action === 'add') {
      const from = $('#planFrom', this.planner)?.value;
      const to = $('#planTo', this.planner)?.value;
      if (from && to && from !== to) this.battle.plannerOrders.push({ from, to });
      this.openPlanner();
    }
    if (action === 'remove') { this.battle.plannerOrders.splice(Number(button.dataset.index), 1); this.openPlanner(); }
    if (action === 'execute') {
      const engine = this.battle.engine;
      this.battle.plannerOrders.forEach((order) => engine.send(order.from, order.to, 1, 'player', { formation: this.state.battle.formation, composition: this.state.battle.composition }));
      this.battle.plannerOrders = [];
      this.planner.hidden = true;
      $('#pauseOverlay')?.classList.remove('visible');
      this.options.setSpeed?.(1);
      this.options.notice?.('Пакет приказов выполнен', 'good');
    }
  }

  onHome() {
    this.hud.hidden = true;
    this.planner.hidden = true;
    this.stopAudio();
    this.renderHomeEntry();
  }

  ensureAudio() {
    if (!this.state.audio.music || this.audio.context) return;
    try {
      const context = new (window.AudioContext || window.webkitAudioContext)();
      const master = context.createGain();
      master.gain.value = .015 * this.state.audio.intensity;
      master.connect(context.destination);
      const drone = context.createOscillator();
      drone.type = 'sine'; drone.frequency.value = 58;
      const droneGain = context.createGain(); droneGain.gain.value = .55;
      drone.connect(droneGain).connect(master); drone.start();
      const pulse = context.createOscillator(); pulse.type = 'triangle'; pulse.frequency.value = 116;
      const pulseGain = context.createGain(); pulseGain.gain.value = .12;
      pulse.connect(pulseGain).connect(master); pulse.start();
      this.audio = { ...this.audio, context, master, drone, pulse, droneGain, pulseGain };
    } catch {}
  }

  updateMusic() {
    if (!this.audio.context || !this.battle) return;
    const engine = this.battle.engine;
    const danger = clamp((1 - (engine.territory.player || 0)) * .65 + (this.battle.boss ? .25 : 0) + (this.battle.mode === 'survival' ? Math.min(.3, this.battle.wave / 80) : 0), 0, 1);
    const now = this.audio.context.currentTime;
    this.audio.master.gain.setTargetAtTime((.008 + danger * .024) * this.state.audio.intensity, now, .4);
    this.audio.drone.frequency.setTargetAtTime(52 + danger * 32, now, .5);
    this.audio.pulse.frequency.setTargetAtTime(104 + danger * 140, now, .35);
  }

  stopAudio() {
    try { this.audio.context?.close(); } catch {}
    this.audio = { context: null, master: null, drone: null, pulse: null, voiceReady: false };
  }

  audioPulse(frequency = 440) {
    try {
      this.ensureAudio();
      const context = this.audio.context || new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = context.createOscillator(); const gain = context.createGain();
      oscillator.frequency.value = frequency; oscillator.type = 'square'; gain.gain.value = .03;
      gain.gain.exponentialRampToValueAtTime(.0001, context.currentTime + .18);
      oscillator.connect(gain).connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + .18);
    } catch {}
  }

  speak(text) {
    if (!this.state.audio.voice || !('speechSynthesis' in window)) return;
    try {
      speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ru-RU'; utterance.rate = .92; utterance.pitch = .82; utterance.volume = .62;
      speechSynthesis.speak(utterance);
    } catch {}
  }

  resetForQA() {
    this.state = createWarRoomState(1_760_000_000_000);
    this.editor = { tool: 'node', type: 'relay', owner: 'neutral', nodes: [], links: [], selected: null };
    this.save();
    this.render();
    return this.snapshot();
  }
}

function FORMATION_TYPES_LABEL(id) {
  return FORMATIONS[id]?.name || 'Клин';
}
