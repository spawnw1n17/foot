import './command-bridge.js';
import { CITY_CATALOG } from './data.js';
import { projectCity } from './engine.js';
import { dispatchGestureClick, installOriginalStyleMapControls } from './gesture-controls.js';

const worldMap = document.querySelector('#worldMap');
const cityPoints = CITY_CATALOG.map((city) => ({ ...projectCity(city), id: city.id }));
const cityNames = new Map(CITY_CATALOG.map((city) => [city.id, city.name]));
const CITY_PRIORITY_RADIUS = 18;
const TUTORIAL_KEY = 'aerosphere-tutorial-complete';

installMapClarityStyles();
installTutorialCompletion();
installPointerFocusCleanup();
installRiskAdvisor();
installOriginalStyleMapControls({ worldMap, cityPoints, cityNames, activateCity });

if (worldMap) {
  worldMap.addEventListener('click', prioritizeCityAtMapPoint, true);
}

function installMapClarityStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .city-node text { transition: opacity 140ms ease, font-size 140ms ease; }
    .city-node.closed text { opacity: 0; pointer-events: none; }
    .city-node.closed:hover text,
    .city-node.closed:focus text,
    .city-node.closed.selected text,
    .city-node.closed.search-match text { opacity: 1; }
    .city-node.open text { opacity: .88; }
    .city-node.open:hover text,
    .city-node.open:focus text,
    .city-node.open.selected text { opacity: 1; }
    .skip-link:focus:not(:focus-visible) { transform: translateY(-160%); }
    .build-badge { display: none; }
    .map-panel,
    .side-panel { scroll-margin-top: calc(88px + var(--safe-top)); }
    .risk-advisor {
      position: absolute;
      z-index: 8;
      right: 14px;
      bottom: 14px;
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 5px 10px;
      align-items: center;
      width: min(340px, calc(100% - 28px));
      padding: 11px 12px;
      border: 1px solid rgba(255, 199, 92, .4);
      border-radius: 13px;
      color: var(--text);
      background: rgba(20, 17, 10, .94);
      box-shadow: 0 16px 42px rgba(0, 0, 0, .38);
      backdrop-filter: blur(14px);
    }
    .risk-advisor.hidden { display: none; }
    .risk-advisor.critical {
      border-color: rgba(255, 101, 113, .55);
      background: rgba(29, 10, 14, .95);
    }
    .risk-advisor strong { font-size: 12px; }
    .risk-advisor span { grid-column: 1 / -1; color: var(--muted); font-size: 10px; line-height: 1.45; }
    .risk-advisor button {
      min-height: 32px;
      border: 1px solid rgba(255,255,255,.13);
      border-radius: 9px;
      padding: 0 11px;
      color: var(--text);
      background: rgba(255,255,255,.06);
      cursor: pointer;
      font-weight: 750;
    }
    .risk-advisor button:hover { background: rgba(255,255,255,.12); }
    .health-chip.risk-pulse { animation: risk-pulse 1.5s ease-in-out infinite; }
    @keyframes risk-pulse {
      0%, 100% { box-shadow: inset 0 0 0 1px transparent; }
      50% { box-shadow: inset 0 0 0 1px rgba(255, 199, 92, .5); }
    }
    @media (max-width: 640px) {
      .map-panel,
      .side-panel { scroll-margin-top: calc(112px + var(--safe-top)); }
      .risk-advisor { top: 10px; right: 10px; bottom: auto; width: calc(100% - 20px); }
    }
  `;
  document.head.append(style);
}

function installTutorialCompletion() {
  const card = document.querySelector('#tutorialCard');
  const close = document.querySelector('#closeTutorial');
  const routeLayer = document.querySelector('#routeLayer');
  if (!card) return;

  const complete = () => {
    card.classList.add('hidden');
    try { localStorage.setItem(TUTORIAL_KEY, '1'); } catch {}
  };

  try {
    if (localStorage.getItem(TUTORIAL_KEY) === '1') card.classList.add('hidden');
  } catch {}

  close?.addEventListener('click', complete, { once: true });
  worldMap?.addEventListener('pointerdown', complete, { once: true, capture: true });
  worldMap?.addEventListener('wheel', complete, { once: true, passive: true });

  if (routeLayer) {
    const observer = new MutationObserver(() => {
      if (routeLayer.querySelectorAll('[data-route-id]').length >= 3) {
        complete();
        observer.disconnect();
      }
    });
    observer.observe(routeLayer, { childList: true });
  }
}

function installPointerFocusCleanup() {
  document.addEventListener('pointerdown', () => {
    if (document.activeElement?.classList?.contains('skip-link')) document.activeElement.blur();
  }, true);
}

function installRiskAdvisor() {
  const mapStage = document.querySelector('#mapStage');
  const cityLayer = document.querySelector('#cityLayer');
  if (!mapStage || !cityLayer) return;

  const advisor = document.createElement('aside');
  advisor.className = 'risk-advisor hidden';
  advisor.setAttribute('role', 'status');
  advisor.setAttribute('aria-live', 'polite');
  advisor.innerHTML = '<strong></strong><button type="button">Открыть</button><span></span>';
  mapStage.append(advisor);

  let targetCityId = null;
  let refreshQueued = false;

  const refresh = () => {
    refreshQueued = false;
    const candidates = [...cityLayer.querySelectorAll('.city-node.open')]
      .map((node) => {
        const arc = node.querySelector('.city-capacity-arc');
        const values = String(arc?.getAttribute('stroke-dasharray') || '0 1').split(/[ ,]+/).map(Number);
        const total = Math.max(1, (values[0] || 0) + (values[1] || 0));
        return {
          cityId: node.dataset.cityId,
          ratio: (values[0] || 0) / total,
          critical: arc?.classList.contains('bad') || node.classList.contains('overloaded')
        };
      })
      .filter((item) => item.critical || item.ratio >= 0.74)
      .sort((a, b) => Number(b.critical) - Number(a.critical) || b.ratio - a.ratio);

    const risk = candidates[0];
    const healthChip = document.querySelector('.health-chip');
    if (!risk) {
      targetCityId = null;
      advisor.classList.add('hidden');
      healthChip?.classList.remove('risk-pulse');
      return;
    }

    targetCityId = risk.cityId;
    const name = cityNames.get(risk.cityId) || risk.cityId;
    const percent = Math.max(75, Math.round(risk.ratio * 100));
    advisor.classList.remove('hidden');
    advisor.classList.toggle('critical', risk.critical);
    advisor.querySelector('strong').textContent = risk.critical ? `Критическая очередь: ${name}` : `Риск перегрузки: ${name}`;
    advisor.querySelector('span').textContent = risk.critical
      ? `Загрузка не менее ${percent}%. Поставьте игру на паузу и модернизируйте аэропорт или самолёт.`
      : `Загрузка около ${percent}%. Проверьте пропускную способность до ускорения времени.`;
    healthChip?.classList.add('risk-pulse');
  };

  const queueRefresh = () => {
    if (refreshQueued) return;
    refreshQueued = true;
    requestAnimationFrame(refresh);
  };

  advisor.querySelector('button').addEventListener('click', () => {
    if (!targetCityId) return;
    activateCity(targetCityId);
    document.querySelector('.side-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  new MutationObserver(queueRefresh).observe(cityLayer, { childList: true });
  queueRefresh();
}

function prioritizeCityAtMapPoint(event) {
  if (event.target.closest?.('[data-city-id]')) return;

  const point = clientPointToSvg(event.clientX, event.clientY);
  if (!point) return;

  const nearest = cityPoints
    .map((city) => ({ city, distance: Math.hypot(city.x - point.x, city.y - point.y) }))
    .sort((a, b) => a.distance - b.distance)[0];

  if (!nearest || nearest.distance > CITY_PRIORITY_RADIUS) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  activateCity(nearest.city.id);
}

function activateCity(cityId) {
  if (window.AeroSphereCommands?.selectCity(cityId)) return;
  const clickCurrentNode = () => {
    const node = worldMap.querySelector(`[data-city-id="${CSS.escape(cityId)}"]`);
    if (!node) return false;
    dispatchGestureClick(node);
    node.focus?.({ preventScroll: true });
    return true;
  };

  if (!clickCurrentNode()) requestAnimationFrame(clickCurrentNode);
}

function clientPointToSvg(clientX, clientY) {
  const matrix = worldMap.getScreenCTM();
  if (!matrix) return null;
  const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
  return { x: point.x, y: point.y };
}
