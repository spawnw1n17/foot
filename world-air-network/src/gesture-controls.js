const MAP_WIDTH = 1200;
const MAP_HEIGHT = 620;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4.5;
const PAN_THRESHOLD_PX = 6;
const ROUTE_THRESHOLD_PX = 10;
const ROUTE_DROP_RADIUS_PX = 34;

export function dispatchGestureClick(node) {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
  Object.defineProperty(event, '__aeroGestureSynthetic', { value: true });
  node.dispatchEvent(event);
}

export function installOriginalStyleMapControls({ worldMap, cityPoints, cityNames, activateCity }) {
  if (!worldMap) return;

  let mapView = readMapView();
  let gesture = null;
  let suppressClickUntil = 0;
  let routePreview = null;
  let routePreviewTarget = null;
  let inertiaFrame = 0;

  installGestureStyles();
  ensureGestureLayer();
  syncMapView();

  window.addEventListener('pointerdown', handlePointerDown, true);
  window.addEventListener('pointermove', handlePointerMove, true);
  window.addEventListener('pointerup', handlePointerUp, true);
  window.addEventListener('pointercancel', handlePointerCancel, true);
  window.addEventListener('click', suppressPostDragClick, true);
  window.addEventListener('wheel', handleWheelZoom, { capture: true, passive: false });
  window.addEventListener('dblclick', handleDoubleClickZoom, true);
  window.addEventListener('keydown', handleMapKeyboard, true);
  document.addEventListener('click', handleZoomControl, true);

  new MutationObserver(() => syncMapView()).observe(worldMap, { attributes: true, attributeFilter: ['viewBox'] });
  setTimeout(() => showGestureHint('Перетаскивайте карту мышью. Колесо меняет масштаб. Протяните линию между открытыми аэропортами, чтобы создать маршрут.'), 0);

  function installGestureStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .world-map { cursor: grab; touch-action: pan-y pinch-zoom; }
      .world-map.is-zoomed,
      .world-map.is-panning,
      .world-map.is-route-dragging { touch-action: none; }
      .world-map.is-panning { cursor: grabbing; }
      .world-map.is-route-dragging { cursor: crosshair; }
      .city-node.open { touch-action: none; }
      .gesture-layer { pointer-events: none; }
      .route-drag-preview {
        fill: none;
        stroke: var(--accent);
        stroke-width: 4;
        stroke-linecap: round;
        stroke-dasharray: 11 8;
        filter: url(#routeGlow);
        opacity: .94;
        animation: route-drag-flow .65s linear infinite;
      }
      .route-drag-preview.invalid { stroke: var(--red); opacity: .72; }
      .route-drag-target {
        fill: rgba(85, 213, 255, .12);
        stroke: var(--accent);
        stroke-width: 3;
        opacity: 0;
        transition: opacity 100ms ease;
      }
      .route-drag-target.visible { opacity: 1; }
      .route-drag-target.invalid { stroke: var(--red); fill: rgba(255, 101, 113, .12); }
      .city-node.route-drop-target .city-ring { stroke: var(--accent); stroke-width: 5; filter: url(#cityGlow); }
      .city-node.route-drop-invalid .city-ring { stroke: var(--red); stroke-width: 5; }
      @keyframes route-drag-flow { to { stroke-dashoffset: -19; } }
      @media (prefers-reduced-motion: reduce) { .route-drag-preview { animation: none; } }
    `;
    document.head.append(style);
  }

  function handlePointerDown(event) {
    if (!isMapPointer(event) || gesture || event.button > 1) return;
    syncMapView();
    cancelInertia();

    const cityNode = event.target.closest?.('[data-city-id]');
    const nearbyCity = findNearestCityOnScreen(event.clientX, event.clientY, ROUTE_DROP_RADIUS_PX);
    const sourceCityId = event.button === 0
      ? (cityNode?.classList.contains('open') ? cityNode.dataset.cityId : (nearbyCity && isOpenCity(nearbyCity.id) ? nearbyCity.id : null))
      : null;
    const canPan = mapView.zoom > 1.01 || event.button === 1;
    if (!sourceCityId && !canPan) return;

    const box = worldMap.getBoundingClientRect();
    gesture = {
      pointerId: event.pointerId,
      sourceCityId,
      mode: sourceCityId ? 'route-pending' : 'pan-pending',
      moved: false,
      startClientX: event.clientX,
      startClientY: event.clientY,
      lastTime: performance.now(),
      velocityX: 0,
      velocityY: 0,
      startCenterX: mapView.centerX,
      startCenterY: mapView.centerY,
      scaleX: mapView.width / Math.max(1, box.width),
      scaleY: mapView.height / Math.max(1, box.height)
    };

    try { worldMap.setPointerCapture(event.pointerId); } catch {}
    event.stopImmediatePropagation();
  }

  function handlePointerMove(event) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const dx = event.clientX - gesture.startClientX;
    const dy = event.clientY - gesture.startClientY;
    const distance = Math.hypot(dx, dy);
    const threshold = gesture.sourceCityId ? ROUTE_THRESHOLD_PX : PAN_THRESHOLD_PX;

    if (!gesture.moved && distance >= threshold) {
      gesture.moved = true;
      gesture.mode = gesture.sourceCityId ? 'route' : 'pan';
      if (gesture.mode === 'route') {
        worldMap.classList.add('is-route-dragging');
        showRoutePreview(gesture.sourceCityId, event.clientX, event.clientY);
      } else {
        worldMap.classList.add('is-panning');
      }
    }

    if (!gesture.moved) return;
    event.preventDefault();
    event.stopImmediatePropagation();

    if (gesture.mode === 'route') {
      updateRoutePreview(event.clientX, event.clientY);
      return;
    }

    const now = performance.now();
    const elapsed = Math.max(1, now - gesture.lastTime);
    const nextCenterX = gesture.startCenterX - dx * gesture.scaleX;
    const nextCenterY = gesture.startCenterY - dy * gesture.scaleY;
    const instantVelocityX = (nextCenterX - mapView.centerX) / elapsed;
    const instantVelocityY = (nextCenterY - mapView.centerY) / elapsed;
    gesture.velocityX = gesture.velocityX * 0.68 + instantVelocityX * 0.32;
    gesture.velocityY = gesture.velocityY * 0.68 + instantVelocityY * 0.32;
    gesture.lastTime = now;
    mapView.centerX = nextCenterX;
    mapView.centerY = nextCenterY;
    applyMapView();
  }

  function handlePointerUp(event) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const completed = gesture;
    gesture = null;
    try { worldMap.releasePointerCapture(event.pointerId); } catch {}
    worldMap.classList.remove('is-panning', 'is-route-dragging');

    if (!completed.moved) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    suppressClickUntil = performance.now() + 450;

    if (completed.mode === 'route') {
      const target = findNearestCityOnScreen(event.clientX, event.clientY, ROUTE_DROP_RADIUS_PX);
      clearRoutePreview();
      if (!target || target.id === completed.sourceCityId || !isOpenCity(target.id)) {
        showGestureHint('Маршрут не создан: отпустите линию над другим открытым аэропортом.');
        recordGesture('route-cancel');
        return;
      }
      beginRouteWorkflow(completed.sourceCityId, target.id);
      recordGesture('route-drag');
      return;
    }

    recordGesture('pan');
    startInertia(completed.velocityX, completed.velocityY);
  }

  function handlePointerCancel(event) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    gesture = null;
    worldMap.classList.remove('is-panning', 'is-route-dragging');
    clearRoutePreview();
  }

  function suppressPostDragClick(event) {
    if (event.__aeroGestureSynthetic) return;
    if (performance.now() >= suppressClickUntil) return;
    if (!isEventInsideMap(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function handleWheelZoom(event) {
    if (!isEventInsideMap(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    syncMapView();
    cancelInertia();
    zoomAt(event.clientX, event.clientY, mapView.zoom * Math.exp(-event.deltaY * 0.00145));
    recordGesture('wheel-zoom');
  }

  function handleDoubleClickZoom(event) {
    if (!isEventInsideMap(event) || event.target.closest?.('[data-city-id]')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    syncMapView();
    zoomAt(event.clientX, event.clientY, mapView.zoom * 1.55);
    recordGesture('double-click-zoom');
  }

  function handleZoomControl(event) {
    const button = event.target.closest?.('[data-zoom]');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    syncMapView();
    cancelInertia();
    if (button.dataset.zoom === 'fit') {
      resetMapView();
    } else {
      const box = worldMap.getBoundingClientRect();
      const factor = button.dataset.zoom === 'in' ? 1.35 : 1 / 1.35;
      zoomAt(box.left + box.width / 2, box.top + box.height / 2, mapView.zoom * factor);
    }
  }

  function handleMapKeyboard(event) {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
      if (target instanceof HTMLInputElement && target.id === 'citySearch' && event.key === 'Enter') {
        requestAnimationFrame(() => activateCityByQuery(target.value));
      }
      return;
    }
    if (!['+', '=', '-', '_', '0'].includes(event.key)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    syncMapView();
    const box = worldMap.getBoundingClientRect();
    if (event.key === '0') {
      resetMapView();
    } else {
      const factor = event.key === '+' || event.key === '=' ? 1.25 : 1 / 1.25;
      zoomAt(box.left + box.width / 2, box.top + box.height / 2, mapView.zoom * factor);
    }
  }

  function ensureGestureLayer() {
    const cityLayer = worldMap.querySelector('#cityLayer');
    const gestureLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    gestureLayer.setAttribute('class', 'gesture-layer');
    routePreview = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    routePreview.setAttribute('class', 'route-drag-preview');
    routePreview.hidden = true;
    routePreviewTarget = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    routePreviewTarget.setAttribute('class', 'route-drag-target');
    routePreviewTarget.setAttribute('r', '15');
    gestureLayer.append(routePreview, routePreviewTarget);
    if (cityLayer) worldMap.insertBefore(gestureLayer, cityLayer);
    else worldMap.append(gestureLayer);
  }

  function showRoutePreview(sourceCityId, clientX, clientY) {
    const source = cityPoints.find((city) => city.id === sourceCityId);
    if (!source) return;
    routePreview.hidden = false;
    updateRoutePreview(clientX, clientY);
  }

  function updateRoutePreview(clientX, clientY) {
    const source = cityPoints.find((city) => city.id === gesture?.sourceCityId);
    const pointer = clientPointToSvg(clientX, clientY);
    if (!source || !pointer) return;
    const target = findNearestCityOnScreen(clientX, clientY, ROUTE_DROP_RADIUS_PX);
    const valid = Boolean(target && target.id !== source.id && isOpenCity(target.id));
    const end = target || pointer;
    routePreview.setAttribute('d', `M ${source.x.toFixed(1)} ${source.y.toFixed(1)} L ${end.x.toFixed(1)} ${end.y.toFixed(1)}`);
    routePreview.classList.toggle('invalid', Boolean(target) && !valid);

    worldMap.querySelectorAll('.route-drop-target, .route-drop-invalid').forEach((node) => {
      node.classList.remove('route-drop-target', 'route-drop-invalid');
    });

    if (target) {
      const node = worldMap.querySelector(`[data-city-id="${CSS.escape(target.id)}"]`);
      node?.classList.add(valid ? 'route-drop-target' : 'route-drop-invalid');
      routePreviewTarget.setAttribute('cx', target.x.toFixed(1));
      routePreviewTarget.setAttribute('cy', target.y.toFixed(1));
      routePreviewTarget.classList.add('visible');
      routePreviewTarget.classList.toggle('invalid', !valid);
    } else {
      routePreviewTarget.classList.remove('visible', 'invalid');
    }
  }

  function clearRoutePreview() {
    routePreview.hidden = true;
    routePreview.removeAttribute('d');
    routePreview.classList.remove('invalid');
    routePreviewTarget.classList.remove('visible', 'invalid');
    worldMap.querySelectorAll('.route-drop-target, .route-drop-invalid').forEach((node) => {
      node.classList.remove('route-drop-target', 'route-drop-invalid');
    });
  }

  async function beginRouteWorkflow(sourceId, targetId) {
    showGestureHint(`${cityNames.get(sourceId)} → ${cityNames.get(targetId)}: подтвердите строительство маршрута.`);
    if (window.AeroSphereGame?.proposeRoute(sourceId, targetId)) return;
    if (window.AeroSphereGame?.proposeRoute(sourceId, targetId)) return;
    if (window.AeroSphereGame?.proposeRoute(sourceId, targetId)) return;
    const sourceNode = await waitForElement(`[data-city-id="${CSS.escape(sourceId)}"]`);
    if (!sourceNode) return showGestureHint('Не удалось выбрать исходный аэропорт.');
    dispatchGestureClick(sourceNode);
    const startButton = await waitForElement(`[data-action="start-route"][data-city-id="${CSS.escape(sourceId)}"]`);
    if (!startButton) return showGestureHint('Не удалось включить режим строительства маршрута.');
    dispatchGestureClick(startButton);
    const targetNode = await waitForElement(`[data-city-id="${CSS.escape(targetId)}"]`);
    if (!targetNode) return showGestureHint('Не удалось выбрать конечный аэропорт.');
    dispatchGestureClick(targetNode);
  }

  function activateCityByQuery(query) {
    const needle = normalize(query);
    if (!needle) return false;
    const node = [...worldMap.querySelectorAll('[data-city-id]')].find((item) => {
      const label = normalize(item.querySelector('text')?.textContent || item.dataset.cityId);
      return label.includes(needle);
    });
    if (!node) return false;
    activateCity(node.dataset.cityId);
    return true;
  }

  function findNearestCityOnScreen(clientX, clientY, radiusPx) {
    const matrix = worldMap.getScreenCTM();
    if (!matrix) return null;
    let nearest = null;
    for (const city of cityPoints) {
      const point = new DOMPoint(city.x, city.y).matrixTransform(matrix);
      const distance = Math.hypot(point.x - clientX, point.y - clientY);
      if (distance <= radiusPx && (!nearest || distance < nearest.distance)) nearest = { ...city, distance };
    }
    return nearest;
  }

  function isOpenCity(cityId) {
    return worldMap.querySelector(`[data-city-id="${CSS.escape(cityId)}"]`)?.classList.contains('open') ?? false;
  }

  function zoomAt(clientX, clientY, requestedZoom) {
    const nextZoom = clamp(requestedZoom, MIN_ZOOM, MAX_ZOOM);
    const box = worldMap.getBoundingClientRect();
    const point = clientPointToSvg(clientX, clientY);
    if (!point) return;
    const fractionX = clamp((clientX - box.left) / Math.max(1, box.width), 0, 1);
    const fractionY = clamp((clientY - box.top) / Math.max(1, box.height), 0, 1);
    const nextWidth = MAP_WIDTH / nextZoom;
    const nextHeight = MAP_HEIGHT / nextZoom;
    mapView.zoom = nextZoom;
    mapView.width = nextWidth;
    mapView.height = nextHeight;
    mapView.centerX = point.x + (0.5 - fractionX) * nextWidth;
    mapView.centerY = point.y + (0.5 - fractionY) * nextHeight;
    applyMapView();
  }

  function resetMapView() {
    cancelInertia();
    mapView = { zoom: 1, centerX: MAP_WIDTH / 2, centerY: MAP_HEIGHT / 2, width: MAP_WIDTH, height: MAP_HEIGHT };
    applyMapView();
  }

  function readMapView() {
    const box = worldMap.viewBox.baseVal;
    const width = Number(box?.width) || MAP_WIDTH;
    const height = Number(box?.height) || MAP_HEIGHT;
    return {
      zoom: clamp(MAP_WIDTH / width, MIN_ZOOM, MAX_ZOOM),
      centerX: (Number(box?.x) || 0) + width / 2,
      centerY: (Number(box?.y) || 0) + height / 2,
      width,
      height
    };
  }

  function syncMapView() {
    mapView = readMapView();
    worldMap.classList.toggle('is-zoomed', mapView.zoom > 1.01);
    worldMap.dataset.zoom = mapView.zoom.toFixed(2);
  }

  function applyMapView() {
    mapView.width = MAP_WIDTH / mapView.zoom;
    mapView.height = MAP_HEIGHT / mapView.zoom;
    mapView.centerX = clamp(mapView.centerX, mapView.width / 2, MAP_WIDTH - mapView.width / 2);
    mapView.centerY = clamp(mapView.centerY, mapView.height / 2, MAP_HEIGHT - mapView.height / 2);
    worldMap.setAttribute('viewBox', `${mapView.centerX - mapView.width / 2} ${mapView.centerY - mapView.height / 2} ${mapView.width} ${mapView.height}`);
    worldMap.classList.toggle('is-zoomed', mapView.zoom > 1.01);
    worldMap.dataset.zoom = mapView.zoom.toFixed(2);
    if (window.__AEROSPHERE_QA__) {
      window.__AEROSPHERE_QA__.zoom = mapView.zoom;
      window.__AEROSPHERE_QA__.mapCenter = { x: mapView.centerX, y: mapView.centerY };
    }
  }

  function startInertia(velocityX, velocityY) {
    cancelInertia();
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let vx = velocityX;
    let vy = velocityY;
    if (Math.hypot(vx, vy) < 0.035) return;
    let previous = performance.now();
    const step = (now) => {
      const elapsed = Math.min(34, Math.max(1, now - previous));
      previous = now;
      mapView.centerX += vx * elapsed;
      mapView.centerY += vy * elapsed;
      applyMapView();
      const friction = Math.pow(0.9, elapsed / 16.67);
      vx *= friction;
      vy *= friction;
      if (Math.hypot(vx, vy) < 0.008) return void (inertiaFrame = 0);
      inertiaFrame = requestAnimationFrame(step);
    };
    inertiaFrame = requestAnimationFrame(step);
  }

  function cancelInertia() {
    if (inertiaFrame) cancelAnimationFrame(inertiaFrame);
    inertiaFrame = 0;
  }

  function recordGesture(type) {
    if (!window.__AEROSPHERE_QA__) return;
    const qa = window.__AEROSPHERE_QA__;
    qa.gestures = qa.gestures || { pan: 0, routeDrag: 0, zoom: 0, cancelled: 0 };
    if (type === 'pan') qa.gestures.pan += 1;
    if (type === 'route-drag') qa.gestures.routeDrag += 1;
    if (type === 'route-cancel') qa.gestures.cancelled += 1;
    if (type.includes('zoom')) qa.gestures.zoom += 1;
    qa.lastGesture = type;
  }

  function isMapPointer(event) {
    return isEventInsideMap(event) && event.isPrimary !== false;
  }

  function isEventInsideMap(event) {
    return Boolean(event.composedPath?.().includes(worldMap));
  }

  function clientPointToSvg(clientX, clientY) {
    const matrix = worldMap.getScreenCTM();
    if (!matrix) return null;
    const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
    return { x: point.x, y: point.y };
  }

  function showGestureHint(message) {
    const mapStage = document.querySelector('#mapStage');
    if (!mapStage) return;
    let hint = mapStage.querySelector('.map-hint');
    if (!hint) {
      hint = document.createElement('div');
      hint.className = 'map-hint';
      hint.setAttribute('role', 'status');
      mapStage.append(hint);
    }
    hint.textContent = message;
    hint.classList.add('visible');
    clearTimeout(showGestureHint.timer);
    showGestureHint.timer = setTimeout(() => hint.classList.remove('visible'), 4200);
  }
}

function waitForElement(selector, attempts = 24) {
  return new Promise((resolve) => {
    const seek = (remaining) => {
      const node = document.querySelector(selector);
      if (node || remaining <= 0) return resolve(node || null);
      requestAnimationFrame(() => seek(remaining - 1));
    };
    seek(attempts);
  });
}

function normalize(value) {
  return String(value || '').trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
