import { CITY_CATALOG } from './data.js';
import { projectCity } from './engine.js';

const worldMap = document.querySelector('#worldMap');
const cityPoints = CITY_CATALOG.map((city) => ({ ...projectCity(city), id: city.id }));
const CITY_PRIORITY_RADIUS = 18;

installMapClarityStyles();

if (worldMap) {
  worldMap.addEventListener('click', prioritizeCityAtRouteEndpoint, true);
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
  `;
  document.head.append(style);
}

function prioritizeCityAtRouteEndpoint(event) {
  if (event.target.closest?.('[data-city-id]')) return;
  if (!event.target.closest?.('[data-route-id]')) return;

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
  const clickCurrentNode = () => {
    const node = worldMap.querySelector(`[data-city-id="${CSS.escape(cityId)}"]`);
    if (!node) return false;
    node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
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
