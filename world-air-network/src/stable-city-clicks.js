const worldMap = document.querySelector('#worldMap');
const SVG_NS = 'http://www.w3.org/2000/svg';

if (worldMap) {
  window.addEventListener('click', bridgeSyntheticCityClick, true);
}

function bridgeSyntheticCityClick(event) {
  if (!event.__aeroGestureSynthetic) return;
  const cityId = event.target?.closest?.('[data-city-id]')?.dataset.cityId;
  if (!cityId || event.target?.closest?.('[data-aero-city-proxy]')) return;

  event.preventDefault();
  event.stopImmediatePropagation();

  const proxy = document.createElementNS(SVG_NS, 'g');
  proxy.dataset.cityId = cityId;
  proxy.dataset.aeroCityProxy = '1';
  proxy.setAttribute('aria-hidden', 'true');
  proxy.style.pointerEvents = 'none';
  worldMap.append(proxy);

  const forwarded = new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: event.clientX,
    clientY: event.clientY
  });
  Object.defineProperty(forwarded, '__aeroGestureSynthetic', { value: true });
  proxy.dispatchEvent(forwarded);
  proxy.remove();
}
