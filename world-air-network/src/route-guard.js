import { CITY_CATALOG } from './data.js';
import { projectCity } from './engine.js';

const worldMap = document.querySelector('#worldMap');
const cityPoints = CITY_CATALOG.map((city) => ({ ...projectCity(city), id: city.id }));
const CITY_PRIORITY_RADIUS = 18;

if (worldMap) {
  worldMap.addEventListener('click', prioritizeCityAtRouteEndpoint, true);
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
