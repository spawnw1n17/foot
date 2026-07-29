import {
  AIRPORT_LEVELS,
  CITY_CATALOG,
  OBJECTIVES,
  PLANE_LEVELS,
  RESEARCH_ITEMS
} from './data.js';
import {
  addRoute,
  airportOpenCost,
  buyResearch,
  createInitialState,
  getAirportCapacity,
  getPlaneCapacity,
  haversineKm,
  makeCityMap,
  networkHealth,
  objectiveProgress,
  openAirport,
  projectCity,
  queueTotal,
  routeBuildCost,
  sanitizeLoadedState,
  shortestPath,
  simulateMinutes,
  upgradeAirport,
  upgradeRoute
} from './engine.js';

const SAVE_KEY = 'aerosphere-save-v1';
const cityMap = makeCityMap(CITY_CATALOG);

const dom = {
  worldMap: document.querySelector('#worldMap'),
  routeLayer: document.querySelector('#routeLayer'),
  planeLayer: document.querySelector('#planeLayer'),
  cityLayer: document.querySelector('#cityLayer'),
  sideContent: document.querySelector('#sideContent'),
  eventTicker: document.querySelector('#eventTicker'),
  moneyStat: document.querySelector('#moneyStat'),
  profitStat: document.querySelector('#profitStat'),
  passengerStat: document.querySelector('#passengerStat'),
  reputationStat: document.querySelector('#reputationStat'),
  healthStat: document.querySelector('#healthStat'),
  dayStat: document.querySelector('#dayStat'),
  timeStat: document.querySelector('#timeStat'),
  routeModeButton: document.querySelector('#routeModeButton'),
  routeDraftBanner: document.querySelector('#routeDraftBanner'),
  routeDraftText: document.querySelector('#routeDraftText'),
  cancelRouteDraft: document.querySelector('#cancelRouteDraft'),
  confirmModal: document.querySelector('#confirmModal'),
  modalTitle: document.querySelector('#modalTitle'),
  modalBody: document.querySelector('#modalBody'),
  modalMetrics: document.querySelector('#modalMetrics'),
  modalConfirm: document.querySelector('#modalConfirm'),
  modalCancel: document.querySelector('#modalCancel'),
  gameOverModal: document.querySelector('#gameOverModal'),
  gameOverReason: document.querySelector('#gameOverReason'),
  gameOverSummary: document.querySelector('#gameOverSummary'),
  toast: document.querySelector('#toast'),
  saveButton: document.querySelector('#saveButton'),
  newGameButton: document.querySelector('#newGameButton'),
  restartButton: document.querySelector('#restartButton'),
  tutorialCard: document.querySelector('#tutorialCard'),
  closeTutorial: document.querySelector('#closeTutorial')
};

let state = loadState();
let selectedCityId = state.airports.moscow ? 'moscow' : Object.keys(state.airports)[0];
let selectedRouteId = null;
let activeTab = 'city';
let mapFilter = 'all';
let routeDraftCityId = null;
let gameSpeed = 1;
let pendingConfirm = null;
let toastTimer = null;
let lastFrame = performance.now();
let simulationAccumulator = 0;
let renderAccumulator = 0;
let gameOverShown = false;

bindEvents();
setSpeed(1);
renderAll();
requestAnimationFrame(frameLoop);
setInterval(() => saveState(false), 10000);

function bindEvents() {
  document.querySelectorAll('[data-speed]').forEach((button) => {
    button.addEventListener('click', () => setSpeed(Number(button.dataset.speed)));
  });

  document.querySelectorAll('[data-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      activeTab = button.dataset.tab;
      syncTabs();
      renderSidePanel();
    });
  });

  document.querySelectorAll('[data-map-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      mapFilter = button.dataset.mapFilter;
      document.querySelectorAll('[data-map-filter]').forEach((item) => item.classList.toggle('active', item === button));
      renderMap();
    });
  });

  dom.worldMap.addEventListener('click', (event) => {
    const cityNode = event.target.closest('[data-city-id]');
    if (cityNode) {
      handleCityClick(cityNode.dataset.cityId);
      return;
    }
    const routeNode = event.target.closest('[data-route-id]');
    if (routeNode) {
      selectedRouteId = routeNode.dataset.routeId;
      activeTab = 'network';
      syncTabs();
      renderMap();
      renderSidePanel();
    }
  });

  dom.sideContent.addEventListener('click', (event) => {
    const actionButton = event.target.closest('[data-action]');
    if (!actionButton) return;
    handlePanelAction(actionButton.dataset.action, actionButton.dataset);
  });

  dom.routeModeButton.addEventListener('click', () => {
    if (routeDraftCityId) {
      cancelRouteDraft();
      return;
    }
    if (!selectedCityId || !state.airports[selectedCityId]) {
      showToast('Сначала выберите открытый аэропорт.', true);
      return;
    }
    startRouteDraft(selectedCityId);
  });

  dom.cancelRouteDraft.addEventListener('click', cancelRouteDraft);
  dom.modalCancel.addEventListener('click', closeConfirmModal);
  dom.modalConfirm.addEventListener('click', () => {
    if (pendingConfirm) pendingConfirm();
    closeConfirmModal();
  });
  dom.confirmModal.addEventListener('click', (event) => {
    if (event.target === dom.confirmModal) closeConfirmModal();
  });

  dom.saveButton.addEventListener('click', () => saveState(true));
  dom.newGameButton.addEventListener('click', requestNewGame);
  dom.restartButton.addEventListener('click', resetGame);
  dom.closeTutorial.addEventListener('click', () => {
    dom.tutorialCard.classList.add('hidden');
    localStorage.setItem('aerosphere-tutorial-dismissed', '1');
  });

  if (localStorage.getItem('aerosphere-tutorial-dismissed')) dom.tutorialCard.classList.add('hidden');

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeConfirmModal();
      cancelRouteDraft();
    }
    if (event.code === 'Space' && !event.repeat) {
      event.preventDefault();
      setSpeed(gameSpeed === 0 ? 1 : 0);
    }
  });
}

function frameLoop(now) {
  const elapsedSeconds = Math.min(0.25, Math.max(0, (now - lastFrame) / 1000));
  lastFrame = now;

  if (gameSpeed > 0 && !state.gameOver) {
    simulationAccumulator += elapsedSeconds * 8 * gameSpeed;
    if (simulationAccumulator >= 1) {
      const wholeMinutes = Math.floor(simulationAccumulator);
      simulationAccumulator -= wholeMinutes;
      simulateMinutes(state, CITY_CATALOG, wholeMinutes);
    }
  }

  renderAccumulator += elapsedSeconds;
  if (renderAccumulator >= 0.22) {
    renderAccumulator = 0;
    renderStats();
    renderMap();
    renderSidePanel();
    renderEvents();
    if (state.gameOver && !gameOverShown) showGameOver();
  }

  requestAnimationFrame(frameLoop);
}

function handleCityClick(cityId) {
  if (routeDraftCityId) {
    if (cityId === routeDraftCityId) {
      showToast('Выберите другой аэропорт.', true);
      return;
    }
    if (!state.airports[cityId]) {
      selectedCityId = cityId;
      activeTab = 'city';
      syncTabs();
      renderAll();
      showToast('Для маршрута второй аэропорт должен быть открыт.', true);
      return;
    }
    proposeRoute(routeDraftCityId, cityId);
    return;
  }

  selectedCityId = cityId;
  selectedRouteId = null;
  activeTab = 'city';
  syncTabs();
  renderMap();
  renderSidePanel();
}

function handlePanelAction(action, data) {
  const city = data.cityId ? cityMap[data.cityId] : null;

  if (action === 'open-airport' && city) {
    const result = openAirport(state, city);
    showToast(result.message, !result.ok);
    renderAll();
    return;
  }

  if (action === 'upgrade-airport' && data.cityId) {
    const result = upgradeAirport(state, data.cityId);
    showToast(result.message, !result.ok);
    renderAll();
    return;
  }

  if (action === 'start-route' && data.cityId) {
    startRouteDraft(data.cityId);
    return;
  }

  if (action === 'upgrade-route' && data.routeId) {
    const result = upgradeRoute(state, data.routeId);
    showToast(result.message, !result.ok);
    renderAll();
    return;
  }

  if (action === 'focus-route' && data.routeId) {
    selectedRouteId = data.routeId;
    const route = state.routes.find((item) => item.id === selectedRouteId);
    if (route) selectedCityId = route.a;
    renderAll();
    return;
  }

  if (action === 'buy-research' && data.researchId) {
    const item = RESEARCH_ITEMS.find((research) => research.id === data.researchId);
    if (!item) return;
    const result = buyResearch(state, item);
    showToast(result.message, !result.ok);
    renderAll();
  }
}

function startRouteDraft(cityId) {
  if (!state.airports[cityId]) {
    showToast('Сначала откройте аэропорт.', true);
    return;
  }
  routeDraftCityId = cityId;
  dom.routeModeButton.classList.add('active');
  dom.routeDraftBanner.classList.remove('hidden');
  dom.routeDraftText.textContent = `Исходный аэропорт: ${cityMap[cityId].name}. Выберите второй город.`;
  renderMap();
}

function cancelRouteDraft() {
  routeDraftCityId = null;
  dom.routeModeButton.classList.remove('active');
  dom.routeDraftBanner.classList.add('hidden');
  renderMap();
}

function proposeRoute(aId, bId) {
  const a = cityMap[aId];
  const b = cityMap[bId];
  const distance = haversineKm(a, b);
  const cost = routeBuildCost(a, b);
  const estimatedFlight = Math.max(38, (distance / PLANE_LEVELS[0].speed) * 60 + 16);
  const hasRoute = state.routes.some((route) => route.id === [aId, bId].sort().join('__'));

  if (hasRoute) {
    showToast('Этот маршрут уже существует.', true);
    cancelRouteDraft();
    return;
  }

  openConfirmModal({
    title: 'Открыть новый маршрут',
    body: `${a.name} — ${b.name}. На линию выйдет региональный самолёт на ${PLANE_LEVELS[0].capacity} мест.`,
    metrics: [
      ['Расстояние', `${Math.round(distance).toLocaleString('ru-RU')} км`],
      ['Время рейса', formatDuration(estimatedFlight)],
      ['Инвестиции', formatMoney(cost)]
    ],
    confirmText: 'Построить маршрут',
    onConfirm: () => {
      const result = addRoute(state, a, b);
      showToast(result.message, !result.ok);
      if (result.ok) selectedRouteId = [aId, bId].sort().join('__');
      cancelRouteDraft();
      renderAll();
    }
  });
}

function renderAll() {
  renderStats();
  renderMap();
  renderSidePanel();
  renderEvents();
  syncTabs();
}

function renderStats() {
  const profit = state.stats.revenueToday - state.stats.costsToday;
  dom.moneyStat.textContent = formatMoney(state.money);
  dom.profitStat.textContent = `${profit >= 0 ? '+' : ''}${formatMoney(profit)}`;
  dom.profitStat.closest('.stat-chip').classList.toggle('positive', profit >= 0);
  dom.profitStat.closest('.stat-chip').classList.toggle('negative', profit < 0);
  dom.passengerStat.textContent = state.stats.passengersTotal.toLocaleString('ru-RU');
  dom.reputationStat.textContent = `${Math.round(state.reputation)} / 100`;
  dom.healthStat.textContent = `${networkHealth(state)}%`;

  const day = Math.floor(state.clock / 1440) + 1;
  const minuteOfDay = Math.floor(state.clock % 1440);
  const hours = Math.floor(minuteOfDay / 60).toString().padStart(2, '0');
  const minutes = (minuteOfDay % 60).toString().padStart(2, '0');
  dom.dayStat.textContent = `День ${day}`;
  dom.timeStat.textContent = `${hours}:${minutes}`;
}

function renderMap() {
  const routes = state.routes.map((route) => {
    const a = projectCity(cityMap[route.a]);
    const b = projectCity(cityMap[route.b]);
    const disabled = route.disabledUntil > state.clock;
    const selected = route.id === selectedRouteId;
    const className = ['route-core', disabled ? 'route-disabled' : '', selected ? 'route-selected' : ''].filter(Boolean).join(' ');
    return `
      <g data-route-id="${route.id}">
        <path class="route-base ${disabled ? 'route-disabled' : ''}" d="M ${a.x.toFixed(1)} ${a.y.toFixed(1)} L ${b.x.toFixed(1)} ${b.y.toFixed(1)}" />
        <path class="${className}" d="M ${a.x.toFixed(1)} ${a.y.toFixed(1)} L ${b.x.toFixed(1)} ${b.y.toFixed(1)}" />
        <path class="route-hit" d="M ${a.x.toFixed(1)} ${a.y.toFixed(1)} L ${b.x.toFixed(1)} ${b.y.toFixed(1)}" />
      </g>`;
  }).join('');
  dom.routeLayer.innerHTML = routes;

  dom.planeLayer.innerHTML = state.routes.map((route) => {
    const a = projectCity(cityMap[route.a]);
    const b = projectCity(cityMap[route.b]);
    const from = route.direction === 0 ? a : b;
    const to = route.direction === 0 ? b : a;
    const progress = Math.max(0, Math.min(1, route.progress));
    const x = from.x + (to.x - from.x) * progress;
    const y = from.y + (to.y - from.y) * progress;
    const angle = Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI;
    const opacity = route.disabledUntil > state.clock ? 0.35 : 1;
    return `<g class="plane-marker" transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${angle.toFixed(1)})" opacity="${opacity}">
      <circle r="8"></circle>
      <path d="M-5,-1 L2,-1 L6,-5 L8,-5 L6,-1 L9,0 L6,1 L8,5 L6,5 L2,1 L-5,1 L-8,4 L-9,4 L-8,0 L-9,-4 L-8,-4 Z"></path>
    </g>`;
  }).join('');

  dom.cityLayer.innerHTML = CITY_CATALOG
    .filter((city) => mapFilter === 'all' || state.airports[city.id])
    .map((city) => renderCityNode(city))
    .join('');
}

function renderCityNode(city) {
  const point = projectCity(city);
  const isOpen = Boolean(state.airports[city.id]);
  const isSelected = city.id === selectedCityId;
  const isRouteSource = city.id === routeDraftCityId;
  const queue = isOpen ? queueTotal(state, city.id) : 0;
  const capacity = isOpen ? getAirportCapacity(state, city.id) : 1;
  const ratio = queue / Math.max(1, capacity);
  const radius = isOpen ? 7.2 : Math.max(3.7, Math.min(5.7, 3.5 + Math.log10(city.population) - 5.5));
  const circumference = 2 * Math.PI * 11;
  const dash = Math.min(1, ratio) * circumference;
  const classes = [
    'city-node',
    isOpen ? 'open' : 'closed',
    isSelected ? 'selected' : '',
    isRouteSource ? 'route-source' : '',
    ratio >= 1 ? 'overloaded' : ''
  ].filter(Boolean).join(' ');
  const arcClass = ratio >= 1 ? 'bad' : ratio >= 0.75 ? 'warn' : '';
  const anchor = point.x > 1030 ? 'end' : 'start';
  const labelX = point.x > 1030 ? -10 : 10;
  const labelY = point.y < 60 ? 16 : -10;

  return `<g class="${classes}" data-city-id="${city.id}" transform="translate(${point.x.toFixed(1)} ${point.y.toFixed(1)})">
    ${isOpen ? `<circle class="city-capacity-arc ${arcClass}" r="11" transform="rotate(-90)" stroke-dasharray="${dash.toFixed(1)} ${(circumference - dash).toFixed(1)}"></circle>` : ''}
    <circle class="city-ring" r="${radius + 3}"></circle>
    <circle class="city-core" r="${radius}"></circle>
    <text x="${labelX}" y="${labelY}" text-anchor="${anchor}">${escapeHtml(city.name)}</text>
  </g>`;
}

function renderSidePanel() {
  if (activeTab === 'city') dom.sideContent.innerHTML = renderCityPanel();
  if (activeTab === 'network') dom.sideContent.innerHTML = renderNetworkPanel();
  if (activeTab === 'research') dom.sideContent.innerHTML = renderResearchPanel();
  if (activeTab === 'objectives') dom.sideContent.innerHTML = renderObjectivesPanel();
}

function renderCityPanel() {
  if (!selectedCityId || !cityMap[selectedCityId]) {
    return emptyState('◎', 'Выберите город', 'Нажмите на точку на карте, чтобы открыть карточку города и начать развитие сети.');
  }

  const city = cityMap[selectedCityId];
  const airport = state.airports[city.id];
  if (!airport) {
    const cost = airportOpenCost(city);
    const afford = state.money >= cost;
    return `
      <div class="section-eyebrow">Новая территория</div>
      <div class="panel-title-row">
        <div>
          <h2 class="panel-title">${escapeHtml(city.name)}</h2>
          <div class="panel-subtitle">${escapeHtml(city.country)} · ${escapeHtml(city.continent)}</div>
        </div>
        <span class="status-badge closed">нет аэропорта</span>
      </div>
      <div class="metric-grid">
        <div class="metric-card"><span>Население</span><strong>${formatPopulation(city.population)}</strong><small>потенциал спроса</small></div>
        <div class="metric-card"><span>Открытие</span><strong>${formatMoney(cost)}</strong><small>разовая инвестиция</small></div>
      </div>
      <div class="insight-card">Крупные города создают больше пассажиропотока. После открытия обязательно подключите аэропорт к действующей сети, иначе очередь начнёт расти без возможности отправки.</div>
      <div class="action-stack">
        <button class="primary-button" data-action="open-airport" data-city-id="${city.id}" ${afford ? '' : 'disabled'}>Открыть аэропорт · ${formatMoney(cost)}</button>
      </div>`;
  }

  const queue = queueTotal(state, city.id);
  const capacity = getAirportCapacity(state, city.id);
  const ratio = queue / Math.max(1, capacity);
  const nextLevel = AIRPORT_LEVELS[airport.level + 1];
  const connectedRoutes = state.routes.filter((route) => route.a === city.id || route.b === city.id);
  const queueGroups = [...(state.queues[city.id] ?? [])].sort((a, b) => b.count - a.count).slice(0, 7);
  const status = ratio >= 1 ? ['Перегрузка', 'bad'] : ratio >= 0.75 ? ['Высокая нагрузка', ''] : ['Работает', ''];

  return `
    <div class="section-eyebrow">${escapeHtml(AIRPORT_LEVELS[airport.level].name)}</div>
    <div class="panel-title-row">
      <div>
        <h2 class="panel-title">${escapeHtml(city.name)}</h2>
        <div class="panel-subtitle">${escapeHtml(city.country)} · ${connectedRoutes.length} ${pluralize(connectedRoutes.length, 'маршрут', 'маршрута', 'маршрутов')}</div>
      </div>
      <span class="status-badge ${status[1]}">${status[0]}</span>
    </div>

    <div class="capacity-block">
      <div class="capacity-row"><span>Пассажиры в терминале</span><strong>${queue.toLocaleString('ru-RU')} / ${capacity.toLocaleString('ru-RU')}</strong></div>
      <div class="progress-track"><div class="progress-fill ${ratio >= 1 ? 'bad' : ratio >= 0.75 ? 'warn' : ''}" style="width:${Math.min(100, ratio * 100).toFixed(1)}%"></div></div>
      <div class="capacity-row" style="margin-top:8px"><span>Уровень нагрузки</span><strong>${Math.round(ratio * 100)}%</strong></div>
    </div>

    <div class="metric-grid">
      <div class="metric-card"><span>Уровень</span><strong>${airport.level + 1} / ${AIRPORT_LEVELS.length}</strong><small>${AIRPORT_LEVELS[airport.level].gates} ${pluralize(AIRPORT_LEVELS[airport.level].gates, 'выход', 'выхода', 'выходов')}</small></div>
      <div class="metric-card"><span>Население</span><strong>${formatPopulation(city.population)}</strong><small>база спроса</small></div>
    </div>

    <div class="action-stack">
      <button class="primary-button" data-action="start-route" data-city-id="${city.id}">＋ Создать маршрут</button>
      <button class="secondary-button" data-action="upgrade-airport" data-city-id="${city.id}" ${nextLevel && state.money >= nextLevel.upgradeCost ? '' : 'disabled'}>
        ${nextLevel ? `Модернизировать · ${formatMoney(nextLevel.upgradeCost)}` : 'Максимальный уровень'}
      </button>
    </div>

    <div class="panel-section">
      <div class="panel-section-heading"><h3>Очередь по направлениям</h3><span>${queueGroups.length ? 'приоритет: долго ожидающие' : 'терминал свободен'}</span></div>
      <div class="queue-list">
        ${queueGroups.length ? queueGroups.map((group) => {
          const destination = cityMap[group.destination];
          const path = destination ? shortestPath(state, cityMap, city.id, destination.id) : null;
          return `<div class="queue-item">
            <div><strong>${escapeHtml(destination?.name ?? group.destination)}</strong><span>${path ? `${path.length - 1} ${pluralize(path.length - 1, 'сегмент', 'сегмента', 'сегментов')} · ожидание ${formatDuration(group.waitingMinutes)}` : 'нет доступного пути'}</span></div>
            <div class="queue-count">${group.count}</div>
          </div>`;
        }).join('') : '<div class="insight-card">Очередей пока нет. Новые группы пассажиров формируются каждый игровой час.</div>'}
      </div>
    </div>`;
}

function renderNetworkPanel() {
  const airportCount = Object.keys(state.airports).length;
  const activeRoutes = state.routes.filter((route) => route.disabledUntil <= state.clock).length;
  const dailyProfit = state.stats.revenueToday - state.stats.costsToday;

  return `
    <div class="section-eyebrow">Управление маршрутами</div>
    <div class="panel-title-row">
      <div><h2 class="panel-title">Авиасеть</h2><div class="panel-subtitle">Маршруты, флот и устойчивость пересадок</div></div>
      <span class="status-badge">${networkHealth(state)}%</span>
    </div>
    <div class="metric-grid">
      <div class="metric-card"><span>Аэропорты</span><strong>${airportCount}</strong><small>открыто городов</small></div>
      <div class="metric-card"><span>Маршруты</span><strong>${activeRoutes} / ${state.routes.length}</strong><small>доступно сейчас</small></div>
      <div class="metric-card"><span>Рейсы</span><strong>${state.stats.flightsTotal.toLocaleString('ru-RU')}</strong><small>за всё время</small></div>
      <div class="metric-card"><span>Баланс дня</span><strong>${dailyProfit >= 0 ? '+' : ''}${formatMoney(dailyProfit)}</strong><small>доходы минус расходы</small></div>
    </div>

    ${state.effects.length ? `<div class="panel-section"><div class="panel-section-heading"><h3>Активные факторы</h3><span>${state.effects.length}</span></div>${state.effects.map(renderEffect).join('')}</div>` : ''}

    <div class="panel-section">
      <div class="panel-section-heading"><h3>Линии компании</h3><span>${state.routes.length}</span></div>
      <div class="route-list">
        ${state.routes.map((route) => renderRouteCard(route)).join('')}
      </div>
    </div>`;
}

function renderRouteCard(route) {
  const a = cityMap[route.a];
  const b = cityMap[route.b];
  const plane = PLANE_LEVELS[route.planeLevel];
  const next = PLANE_LEVELS[route.planeLevel + 1];
  const disabled = route.disabledUntil > state.clock;
  const selected = route.id === selectedRouteId;
  const minutesLeft = Math.max(0, route.disabledUntil - state.clock);

  return `<article class="route-card ${selected ? 'selected' : ''}" data-action="focus-route" data-route-id="${route.id}">
    <div class="route-card-top">
      <div><div class="route-card-title">${escapeHtml(a.name)} — ${escapeHtml(b.name)}</div><div class="route-card-meta">${Math.round(route.distance).toLocaleString('ru-RU')} км · ${escapeHtml(plane.name)}</div></div>
      <div class="route-card-side"><strong>${getPlaneCapacity(state, route)} мест</strong>${disabled ? `закрыт ещё ${formatDuration(minutesLeft)}` : `${route.passengers.toLocaleString('ru-RU')} доставлено`}</div>
    </div>
    <div class="progress-track"><div class="progress-fill ${disabled ? 'bad' : ''}" style="width:${Math.min(100, route.progress * 100).toFixed(1)}%"></div></div>
    <div class="route-card-actions">
      <button class="secondary-button" data-action="upgrade-route" data-route-id="${route.id}" ${next && state.money >= next.upgradeCost ? '' : 'disabled'}>${next ? `Новый самолёт · ${formatMoney(next.upgradeCost)}` : 'Флот максимален'}</button>
    </div>
  </article>`;
}

function renderEffect(effect) {
  const minutesLeft = Math.max(0, effect.expiresAt - state.clock);
  const isBad = effect.type === 'fuel';
  const label = effect.type === 'fuel' ? `Топливо ×${effect.multiplier.toFixed(2)}` : `Спрос ×${effect.multiplier.toFixed(2)}`;
  return `<div class="insight-card" style="border-left-color:${isBad ? 'var(--red)' : 'var(--yellow)'}">${label}. Осталось ${formatDuration(minutesLeft)}.</div>`;
}

function renderResearchPanel() {
  return `
    <div class="section-eyebrow">Технологии компании</div>
    <div class="panel-title-row"><div><h2 class="panel-title">Исследования</h2><div class="panel-subtitle">Постоянные улучшения всей авиасети</div></div></div>
    <div class="research-summary"><div><span>Доступно очков</span><strong>${state.research}</strong></div><span>Очки начисляются за перевезённых пассажиров и события</span></div>
    <div class="research-list">
      ${RESEARCH_ITEMS.map((item) => {
        const complete = state.techs.includes(item.id);
        return `<article class="research-card ${complete ? 'complete' : ''}">
          <h4>${escapeHtml(item.title)}</h4>
          <p>${escapeHtml(item.description)}</p>
          <div class="research-effect">${escapeHtml(item.effect)}</div>
          <button class="${complete ? 'secondary-button' : 'primary-button'}" data-action="buy-research" data-research-id="${item.id}" ${complete || state.research < item.cost ? 'disabled' : ''}>${complete ? 'Внедрено' : `Исследовать · ${item.cost} R&D`}</button>
        </article>`;
      }).join('')}
    </div>`;
}

function renderObjectivesPanel() {
  return `
    <div class="section-eyebrow">Стратегическое развитие</div>
    <div class="panel-title-row"><div><h2 class="panel-title">Цели</h2><div class="panel-subtitle">Награды начисляются автоматически</div></div><span class="status-badge">${state.objectivesClaimed.length} / ${OBJECTIVES.length}</span></div>
    <div class="objective-list">
      ${OBJECTIVES.map((objective) => {
        const [value, target] = objectiveProgress(state, cityMap, objective.id);
        const complete = state.objectivesClaimed.includes(objective.id);
        const percent = Math.min(100, value / target * 100);
        return `<article class="objective-card ${complete ? 'done' : ''}">
          <div class="objective-card-top"><div><h4>${escapeHtml(objective.title)}</h4><p>${escapeHtml(objective.description)}</p></div><div class="objective-reward">${complete ? 'получено' : `+${formatMoney(objective.reward)}`}</div></div>
          <div class="objective-progress"><div class="progress-track"><div class="progress-fill" style="width:${percent.toFixed(1)}%"></div></div><span>${Math.min(value, target).toLocaleString('ru-RU')} / ${target.toLocaleString('ru-RU')}</span></div>
        </article>`;
      }).join('')}
    </div>
    <div class="insight-card">Совет: сначала развивайте устойчивую региональную сеть. Межконтинентальные линии требуют дорогих самолётов и запасной вместимости в хабах.</div>`;
}

function renderEvents() {
  dom.eventTicker.innerHTML = state.log.slice(0, 6).map((event) => `
    <div class="event-item ${event.tone}">
      <strong>${escapeHtml(event.title)}</strong>
      <span>${escapeHtml(event.body)}</span>
    </div>`).join('');
}

function openConfirmModal({ title, body, metrics = [], confirmText = 'Подтвердить', onConfirm }) {
  dom.modalTitle.textContent = title;
  dom.modalBody.textContent = body;
  dom.modalMetrics.innerHTML = metrics.map(([label, value]) => `<div class="modal-metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('');
  dom.modalConfirm.textContent = confirmText;
  pendingConfirm = onConfirm;
  dom.confirmModal.classList.remove('hidden');
}

function closeConfirmModal() {
  pendingConfirm = null;
  dom.confirmModal.classList.add('hidden');
}

function requestNewGame() {
  openConfirmModal({
    title: 'Начать новую игру?',
    body: 'Текущее сохранение будет удалено. Восстановить его после подтверждения не получится.',
    metrics: [
      ['Аэропорты', String(Object.keys(state.airports).length)],
      ['Маршруты', String(state.routes.length)],
      ['Пассажиры', state.stats.passengersTotal.toLocaleString('ru-RU')]
    ],
    confirmText: 'Удалить и начать',
    onConfirm: resetGame
  });
}

function resetGame() {
  state = createInitialState(CITY_CATALOG);
  selectedCityId = 'moscow';
  selectedRouteId = null;
  activeTab = 'city';
  gameSpeed = 1;
  gameOverShown = false;
  routeDraftCityId = null;
  localStorage.removeItem(SAVE_KEY);
  dom.gameOverModal.classList.add('hidden');
  setSpeed(1);
  renderAll();
  saveState(false);
  showToast('Создана новая авиакомпания.');
}

function showGameOver() {
  gameOverShown = true;
  setSpeed(0);
  dom.gameOverReason.textContent = state.gameOverReason;
  dom.gameOverSummary.innerHTML = `
    <div class="metric-card"><span>Дней работы</span><strong>${Math.floor(state.clock / 1440) + 1}</strong></div>
    <div class="metric-card"><span>Пассажиры</span><strong>${state.stats.passengersTotal.toLocaleString('ru-RU')}</strong></div>
    <div class="metric-card"><span>Аэропорты</span><strong>${Object.keys(state.airports).length}</strong></div>
    <div class="metric-card"><span>Маршруты</span><strong>${state.routes.length}</strong></div>`;
  dom.gameOverModal.classList.remove('hidden');
  saveState(false);
}

function saveState(showMessage) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    if (showMessage) showToast('Игра сохранена в браузере.');
  } catch (error) {
    console.error(error);
    if (showMessage) showToast('Не удалось сохранить игру.', true);
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? sanitizeLoadedState(JSON.parse(raw), CITY_CATALOG) : createInitialState(CITY_CATALOG);
  } catch (error) {
    console.error(error);
    return createInitialState(CITY_CATALOG);
  }
}

function setSpeed(speed) {
  gameSpeed = speed;
  document.querySelectorAll('[data-speed]').forEach((button) => button.classList.toggle('active', Number(button.dataset.speed) === speed));
}

function syncTabs() {
  document.querySelectorAll('[data-tab]').forEach((button) => button.classList.toggle('active', button.dataset.tab === activeTab));
}

function showToast(message, isBad = false) {
  clearTimeout(toastTimer);
  dom.toast.textContent = message;
  dom.toast.classList.toggle('bad', isBad);
  dom.toast.classList.remove('hidden');
  toastTimer = setTimeout(() => dom.toast.classList.add('hidden'), 2600);
}

function formatMoney(value) {
  const abs = Math.abs(value);
  const sign = value < 0 ? '−' : '';
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(1).replace('.', ',')} млрд ₽`;
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(2).replace('.', ',')} млн ₽`;
  return `${sign}${Math.round(abs).toLocaleString('ru-RU')} ₽`;
}

function formatPopulation(value) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace('.', ',')} млн`;
  return `${Math.round(value / 1000).toLocaleString('ru-RU')} тыс.`;
}

function formatDuration(minutes) {
  const rounded = Math.max(0, Math.round(minutes));
  if (rounded < 60) return `${rounded} мин`;
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return rest ? `${hours} ч ${rest} мин` : `${hours} ч`;
}

function pluralize(number, one, few, many) {
  const n10 = number % 10;
  const n100 = number % 100;
  if (n10 === 1 && n100 !== 11) return one;
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few;
  return many;
}

function emptyState(icon, title, text) {
  return `<div class="empty-state"><div><div class="empty-state-icon">${icon}</div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(text)}</p></div></div>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
