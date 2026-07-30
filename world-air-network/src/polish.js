const BUILD_LABEL = 'Polish v2';
const svg = document.querySelector('#worldMap');
const mapStage = document.querySelector('#mapStage');
const mapPanel = document.querySelector('.map-panel');
const sidePanel = document.querySelector('.side-panel');
const toolbar = document.querySelector('.map-toolbar');

let zoom = 1;
let centerX = 600;
let centerY = 310;
let panSession = null;
let annotationQueued = false;
let hintTimer = null;

installGlobalErrorTelemetry();
installSkipLink();
installToolbarTools();
installMobileNavigation();
installConnectionStatus();
installKeyboardHelp();
installPersistenceHooks();
installAccessibilityObserver();
installBuildBadge();
refreshAnnotations();

function installGlobalErrorTelemetry() {
  window.__AEROSPHERE_QA__ = {
    errors: [],
    warnings: [],
    readyAt: Date.now(),
    build: BUILD_LABEL
  };

  window.addEventListener('error', (event) => {
    window.__AEROSPHERE_QA__.errors.push(String(event.error?.stack || event.message || 'Unknown error'));
    document.documentElement.dataset.runtimeErrors = String(window.__AEROSPHERE_QA__.errors.length);
  });

  window.addEventListener('unhandledrejection', (event) => {
    window.__AEROSPHERE_QA__.errors.push(String(event.reason?.stack || event.reason || 'Unhandled rejection'));
    document.documentElement.dataset.runtimeErrors = String(window.__AEROSPHERE_QA__.errors.length);
  });
}

function installSkipLink() {
  const link = document.createElement('a');
  link.className = 'skip-link';
  link.href = '#sideContent';
  link.textContent = 'К управлению сетью';
  document.body.prepend(link);
  document.querySelector('#sideContent')?.setAttribute('tabindex', '-1');
}

function installToolbarTools() {
  if (!toolbar || !svg) return;

  const tools = document.createElement('div');
  tools.className = 'aero-toolbar-tools';
  tools.innerHTML = `
    <div class="city-search-wrap">
      <label class="sr-only" for="citySearch">Найти город</label>
      <input id="citySearch" class="city-search" type="search" autocomplete="off" placeholder="Найти город…" aria-label="Найти город на карте" />
      <button class="city-search-clear" type="button" aria-label="Очистить поиск" title="Очистить">×</button>
    </div>
    <div class="map-zoom-controls" role="group" aria-label="Масштаб карты">
      <button type="button" data-zoom="out" aria-label="Уменьшить карту" title="Уменьшить">−</button>
      <button type="button" data-zoom="fit" aria-label="Показать всю карту" title="Показать всю карту">◎</button>
      <button type="button" data-zoom="in" aria-label="Увеличить карту" title="Увеличить">＋</button>
    </div>`;
  toolbar.append(tools);

  const input = tools.querySelector('#citySearch');
  const clear = tools.querySelector('.city-search-clear');

  input.addEventListener('input', () => highlightCity(input.value));
  input.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'Enter') {
      event.preventDefault();
      focusFirstMatchingCity(input.value, true);
    }
    if (event.key === 'Escape') {
      input.value = '';
      highlightCity('');
      input.blur();
    }
  });

  clear.addEventListener('click', () => {
    input.value = '';
    highlightCity('');
    input.focus();
  });


  showMapHint('Карта готова: колесо масштабирует, обычное перетаскивание двигает её плавно.');
}

function highlightCity(query) {
  const needle = normalize(query);
  const nodes = [...document.querySelectorAll('[data-city-id]')];
  let matches = 0;
  nodes.forEach((node) => {
    const label = normalize(node.querySelector('text')?.textContent || node.dataset.cityId);
    const match = needle.length >= 2 && label.includes(needle);
    node.classList.toggle('search-match', match);
    if (match) matches += 1;
  });
  window.__AEROSPHERE_QA__.searchMatches = matches;
}

function focusFirstMatchingCity(query, activate) {
  const needle = normalize(query);
  if (!needle) return false;
  const node = [...document.querySelectorAll('[data-city-id]')].find((item) => {
    const label = normalize(item.querySelector('text')?.textContent || item.dataset.cityId);
    return label.includes(needle);
  });
  if (!node) {
    showMapHint('Город не найден. Попробуйте часть названия.');
    return false;
  }

  const position = parseTranslate(node.getAttribute('transform'));
  if (position) {
    centerX = position.x;
    centerY = position.y;
    setZoom(Math.max(zoom, 2.2));
  }
  node.focus({ preventScroll: true });
  if (activate) node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  return true;
}

function setZoom(nextZoom) {
  zoom = Math.max(1, Math.min(4.5, nextZoom));
  applyViewBox();
}

function resetView() {
  zoom = 1;
  centerX = 600;
  centerY = 310;
  applyViewBox();
}

function applyViewBox() {
  if (!svg) return;
  const width = 1200 / zoom;
  const height = 620 / zoom;
  centerX = clamp(centerX, width / 2, 1200 - width / 2);
  centerY = clamp(centerY, height / 2, 620 - height / 2);
  svg.setAttribute('viewBox', `${centerX - width / 2} ${centerY - height / 2} ${width} ${height}`);
  svg.classList.toggle('is-zoomed', zoom > 1.01);
  svg.dataset.zoom = zoom.toFixed(2);
  window.__AEROSPHERE_QA__.zoom = zoom;
}

function installMobileNavigation() {
  if (!mapPanel || !sidePanel) return;
  const nav = document.createElement('div');
  nav.className = 'mobile-quick-nav';
  nav.setAttribute('aria-label', 'Быстрая навигация');
  nav.innerHTML = `
    <button type="button" data-jump="map" class="active">Карта</button>
    <button type="button" data-jump="control">Управление</button>`;
  document.body.append(nav);

  nav.addEventListener('click', (event) => {
    const button = event.target.closest('[data-jump]');
    if (!button) return;
    const target = button.dataset.jump === 'map' ? mapPanel : sidePanel;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    nav.querySelectorAll('button').forEach((item) => item.classList.toggle('active', item === button));
  });
}

function installConnectionStatus() {
  const brandSubtitle = document.querySelector('.brand-subtitle');
  if (!brandSubtitle) return;
  const status = document.createElement('span');
  status.className = 'connection-status';
  brandSubtitle.after(status);

  const update = () => {
    const online = navigator.onLine;
    status.textContent = online ? 'онлайн' : 'офлайн';
    status.classList.toggle('offline', !online);
    status.title = online ? 'Сеть доступна, автосохранение активно' : 'Игра продолжает работать локально';
  };
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  update();
}

function installKeyboardHelp() {
  const panel = document.createElement('section');
  panel.className = 'keyboard-help hidden';
  panel.setAttribute('aria-label', 'Горячие клавиши');
  panel.innerHTML = `
    <h3>Горячие клавиши</h3>
    <p>Управляйте скоростью и картой без лишних переходов.</p>
    <div class="keyboard-help-grid">
      <kbd>Space</kbd><span>пауза / продолжить</span>
      <kbd>/</kbd><span>поиск города</span>
      <kbd>+</kbd><span>увеличить карту</span>
      <kbd>−</kbd><span>уменьшить карту</span>
      <kbd>0</kbd><span>показать всю карту</span>
      <kbd>Esc</kbd><span>закрыть окно или сбросить поиск</span>
    </div>
    <button type="button" class="secondary-button">Закрыть</button>`;
  document.body.append(panel);
  panel.querySelector('button').addEventListener('click', () => panel.classList.add('hidden'));

  window.addEventListener('keydown', (event) => {
    const target = event.target;
    const isTyping = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
    if (isTyping) {
      if (event.code === 'Space') event.stopImmediatePropagation();
      return;
    }

    if (event.key === '?') {
      event.preventDefault();
      panel.classList.toggle('hidden');
    }
    if (event.key === '/') {
      event.preventDefault();
      document.querySelector('#citySearch')?.focus();
    }
    if (event.key === '+' || event.key === '=') setZoom(zoom * 1.25);
    if (event.key === '-' || event.key === '_') setZoom(zoom / 1.25);
    if (event.key === '0') resetView();
  }, true);
}

function installPersistenceHooks() {
  const save = () => document.querySelector('#saveButton')?.click();
  window.addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') save();
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then((registration) => registration.update()).catch(() => {});
  }
}

function installAccessibilityObserver() {
  const observer = new MutationObserver(queueAnnotationRefresh);
  const cityLayer = document.querySelector('#cityLayer');
  const routeLayer = document.querySelector('#routeLayer');
  const sideContent = document.querySelector('#sideContent');
  if (cityLayer) observer.observe(cityLayer, { childList: true });
  if (routeLayer) observer.observe(routeLayer, { childList: true });
  if (sideContent) observer.observe(sideContent, { childList: true, subtree: true });
}

function queueAnnotationRefresh() {
  if (annotationQueued) return;
  annotationQueued = true;
  requestAnimationFrame(() => {
    annotationQueued = false;
    refreshAnnotations();
  });
}

function refreshAnnotations() {
  const cityNodes = [...document.querySelectorAll('[data-city-id]')];
  cityNodes.forEach((node) => {
    const name = node.querySelector('text')?.textContent?.trim() || node.dataset.cityId;
    const isOpen = node.classList.contains('open');
    node.setAttribute('role', 'button');
    node.setAttribute('tabindex', '0');
    node.setAttribute('aria-label', `${name}: ${isOpen ? 'аэропорт открыт' : 'аэропорт не открыт'}`);
    if (!node.dataset.keyboardReady) {
      node.dataset.keyboardReady = '1';
      node.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        }
      });
    }
  });

  document.querySelectorAll('[data-route-id]').forEach((node) => {
    if (node.closest('.route-card')) return;
    node.setAttribute('role', 'button');
    node.setAttribute('tabindex', '0');
    node.setAttribute('aria-label', `Маршрут ${node.dataset.routeId.replace('__', ' — ')}`);
  });

  document.querySelectorAll('[data-speed]').forEach((button) => {
    const speed = Number(button.dataset.speed);
    button.setAttribute('aria-label', speed === 0 ? 'Поставить игру на паузу' : `Скорость игры ${speed}`);
  });

  document.querySelectorAll('button:not([type])').forEach((button) => button.setAttribute('type', 'button'));
  document.documentElement.dataset.cityCount = String(cityNodes.length);
  document.documentElement.dataset.routeCount = String(document.querySelectorAll('#routeLayer [data-route-id]').length);
  window.__AEROSPHERE_QA__.cityCount = cityNodes.length;
  window.__AEROSPHERE_QA__.routeCount = Number(document.documentElement.dataset.routeCount);
  window.__AEROSPHERE_QA__.documentOverflow = document.documentElement.scrollWidth > window.innerWidth + 2;
}

function installBuildBadge() {
  if (!mapStage) return;
  const badge = document.createElement('div');
  badge.className = 'build-badge';
  badge.textContent = BUILD_LABEL;
  mapStage.append(badge);
}

function showMapHint(message) {
  if (!mapStage) return;
  let hint = mapStage.querySelector('.map-hint');
  if (!hint) {
    hint = document.createElement('div');
    hint.className = 'map-hint';
    hint.setAttribute('role', 'status');
    mapStage.append(hint);
  }
  clearTimeout(hintTimer);
  hint.textContent = message;
  hint.classList.add('visible');
  hintTimer = setTimeout(() => hint.classList.remove('visible'), 3600);
}

function clientToMap(clientX, clientY) {
  const box = svg.getBoundingClientRect();
  const viewBox = svg.viewBox.baseVal;
  return {
    x: viewBox.x + ((clientX - box.left) / Math.max(1, box.width)) * viewBox.width,
    y: viewBox.y + ((clientY - box.top) / Math.max(1, box.height)) * viewBox.height
  };
}

function parseTranslate(value) {
  const match = /translate\(([-\d.]+)[ ,]([-\d.]+)\)/.exec(value || '');
  return match ? { x: Number(match[1]), y: Number(match[2]) } : null;
}

function normalize(value) {
  return String(value || '').trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
