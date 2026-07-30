import { CITY_CATALOG } from './data.js';

const worldMap = document.querySelector('#worldMap');
const cityById = new Map(CITY_CATALOG.map((city) => [city.id, city]));
const SVG_NS = 'http://www.w3.org/2000/svg';

const commands = {
  selectCity,
  proposeRoute,
  findCityId
};

window.AeroSphereCommands = commands;
window.addEventListener('aerosphere:select-city', (event) => selectCity(event.detail?.cityId));
window.addEventListener('aerosphere:propose-route', (event) => proposeRoute(event.detail?.sourceId, event.detail?.targetId));
attachSearchBridge();

function selectCity(cityId) {
  if (!worldMap || !cityById.has(cityId)) return false;
  const proxy = document.createElementNS(SVG_NS, 'g');
  proxy.dataset.cityId = cityId;
  proxy.dataset.aeroCityProxy = '1';
  proxy.setAttribute('aria-hidden', 'true');
  proxy.style.pointerEvents = 'none';
  worldMap.append(proxy);

  const event = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
  Object.defineProperty(event, '__aeroGestureSynthetic', { value: true });
  proxy.dispatchEvent(event);
  proxy.remove();

  const node = worldMap.querySelector(`[data-city-id="${CSS.escape(cityId)}"]`);
  node?.focus?.({ preventScroll: true });
  window.__AEROSPHERE_QA__ && (window.__AEROSPHERE_QA__.lastCommand = `select:${cityId}`);
  return true;
}

async function proposeRoute(sourceId, targetId) {
  if (!cityById.has(sourceId) || !cityById.has(targetId) || sourceId === targetId) return false;
  selectCity(sourceId);
  const start = await waitForElement(`[data-action="start-route"][data-city-id="${CSS.escape(sourceId)}"]`);
  if (!start) return false;
  start.click();
  await nextFrame();
  selectCity(targetId);
  window.__AEROSPHERE_QA__ && (window.__AEROSPHERE_QA__.lastCommand = `route:${sourceId}:${targetId}`);
  return true;
}

function findCityId(query) {
  const needle = normalize(query);
  if (!needle) return null;
  return CITY_CATALOG.find((city) => normalize(city.name).includes(needle) || normalize(city.id).includes(needle))?.id || null;
}

function attachSearchBridge() {
  const attach = () => {
    const input = document.querySelector('#citySearch');
    if (!input) return false;
    if (input.dataset.commandBridgeReady) return true;
    input.dataset.commandBridgeReady = '1';
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      const cityId = findCityId(input.value);
      if (!cityId) return;
      requestAnimationFrame(() => selectCity(cityId));
    }, true);
    return true;
  };

  if (attach()) return;
  const observer = new MutationObserver(() => {
    if (attach()) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

function waitForElement(selector, attempts = 30) {
  return new Promise((resolve) => {
    const seek = (remaining) => {
      const node = document.querySelector(selector);
      if (node || remaining <= 0) return resolve(node || null);
      requestAnimationFrame(() => seek(remaining - 1));
    };
    seek(attempts);
  });
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function normalize(value) {
  return String(value || '').trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
}
