from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def replace_once(source: str, old: str, new: str, label: str) -> str:
    if old not in source:
        if new in source:
            return source
        raise SystemExit(f'{label}: marker not found')
    return source.replace(old, new, 1)


def replace_regex(source: str, pattern: str, replacement: str, label: str) -> str:
    updated, count = re.subn(pattern, replacement, source, count=1, flags=re.S)
    if count == 0:
        if replacement.strip() in source:
            return source
        raise SystemExit(f'{label}: block not found')
    return updated


def patch_game() -> None:
    path = ROOT / 'src/game.js'
    source = path.read_text()

    source = replace_once(
        source,
        "let renderAccumulator = 0;\nlet gameOverShown = false;",
        "let renderAccumulator = 0;\nlet panelRenderAccumulator = 0;\nlet routeLayerSignature = '';\nlet cityLayerSignature = '';\nlet planeLayerSignature = '';\nconst planeVisuals = new Map();\nlet gameOverShown = false;",
        'game render state'
    )

    old_frame = '''function frameLoop(now) {
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
}'''
    new_frame = '''function frameLoop(now) {
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

  const mapBusy = dom.worldMap.classList.contains('is-interacting')
    || dom.worldMap.classList.contains('is-inertial');

  if (!mapBusy) updatePlanePositions(elapsedSeconds);

  renderAccumulator += elapsedSeconds;
  panelRenderAccumulator += elapsedSeconds;
  if (renderAccumulator >= 0.22) {
    renderAccumulator = 0;
    renderStats();
    if (!mapBusy) {
      renderMap();
      renderEvents();
    }
    if (!mapBusy && panelRenderAccumulator >= 0.72) {
      panelRenderAccumulator = 0;
      renderSidePanel();
    }
    if (state.gameOver && !gameOverShown) showGameOver();
  }

  requestAnimationFrame(frameLoop);
}'''
    source = replace_once(source, old_frame, new_frame, 'game frame loop')

    source = replace_once(
        source,
        '''function renderAll() {
  renderStats();
  renderMap();
  renderSidePanel();
  renderEvents();
  syncTabs();
}''',
        '''function renderAll() {
  renderStats();
  renderMap(true);
  renderSidePanel();
  renderEvents();
  syncTabs();
}''',
        'renderAll'
    )

    map_renderer = r'''function renderMap\(\) \{.*?\n\}\n\nfunction renderCityNode'''
    replacement = '''function renderMap(force = false) {
  renderRouteLayer(force);
  renderCityLayer(force);
  const planesRebuilt = ensurePlaneNodes(force);
  updateRouteVisuals();
  updateCityVisuals();
  if (planesRebuilt) updatePlanePositions(0, true);
}

function renderRouteLayer(force = false) {
  const signature = state.routes.map((route) => route.id).join('|');
  if (!force && signature === routeLayerSignature) return;

  dom.routeLayer.innerHTML = state.routes.map((route) => {
    const a = projectCity(cityMap[route.a]);
    const b = projectCity(cityMap[route.b]);
    const path = `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} L ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
    return `
      <g data-route-id="${route.id}">
        <path class="route-base" d="${path}" />
        <path class="route-core" d="${path}" />
        <path class="route-hit" d="${path}" />
      </g>`;
  }).join('');
  routeLayerSignature = signature;
}

function renderCityLayer(force = false) {
  const cities = CITY_CATALOG.filter((city) => mapFilter === 'all' || state.airports[city.id]);
  const signature = `${mapFilter}|${cities.map((city) => `${city.id}:${state.airports[city.id] ? 1 : 0}`).join('|')}`;
  if (!force && signature === cityLayerSignature) return;

  dom.cityLayer.innerHTML = cities.map((city) => renderCityNode(city)).join('');
  cityLayerSignature = signature;
}

function ensurePlaneNodes(force = false) {
  const signature = state.routes.map((route) => route.id).join('|');
  if (!force && signature === planeLayerSignature) return false;

  dom.planeLayer.innerHTML = state.routes.map((route) => `
    <g class="plane-marker" data-plane-route-id="${route.id}">
      <circle r="8"></circle>
      <path d="M-5,-1 L2,-1 L6,-5 L8,-5 L6,-1 L9,0 L6,1 L8,5 L6,5 L2,1 L-5,1 L-8,4 L-9,4 L-8,0 L-9,-4 L-8,-4 Z"></path>
    </g>`).join('');
  planeLayerSignature = signature;
  planeVisuals.clear();
  return true;
}

function updateRouteVisuals() {
  state.routes.forEach((route) => {
    const group = dom.routeLayer.querySelector(`[data-route-id="${CSS.escape(route.id)}"]`);
    if (!group) return;
    const disabled = route.disabledUntil > state.clock;
    const selected = route.id === selectedRouteId;
    group.querySelector('.route-base')?.classList.toggle('route-disabled', disabled);
    const core = group.querySelector('.route-core');
    core?.classList.toggle('route-disabled', disabled);
    core?.classList.toggle('route-selected', selected);
  });
}

function updateCityVisuals() {
  dom.cityLayer.querySelectorAll('[data-city-id]').forEach((node) => {
    const cityId = node.dataset.cityId;
    const isOpen = Boolean(state.airports[cityId]);
    const queue = isOpen ? queueTotal(state, cityId) : 0;
    const capacity = isOpen ? getAirportCapacity(state, cityId) : 1;
    const ratio = queue / Math.max(1, capacity);

    node.classList.toggle('open', isOpen);
    node.classList.toggle('closed', !isOpen);
    node.classList.toggle('selected', cityId === selectedCityId);
    node.classList.toggle('route-source', cityId === routeDraftCityId);
    node.classList.toggle('overloaded', ratio >= 1);

    const arc = node.querySelector('.city-capacity-arc');
    if (!arc) return;
    const circumference = 2 * Math.PI * 11;
    const dash = Math.min(1, ratio) * circumference;
    arc.setAttribute('stroke-dasharray', `${dash.toFixed(1)} ${(circumference - dash).toFixed(1)}`);
    arc.classList.toggle('bad', ratio >= 1);
    arc.classList.toggle('warn', ratio >= 0.75 && ratio < 1);
  });
}

function updatePlanePositions(elapsedSeconds = 0, snap = false) {
  const smoothing = snap || elapsedSeconds <= 0 ? 1 : 1 - Math.exp(-elapsedSeconds * 18);

  state.routes.forEach((route) => {
    const a = projectCity(cityMap[route.a]);
    const b = projectCity(cityMap[route.b]);
    const from = route.direction === 0 ? a : b;
    const to = route.direction === 0 ? b : a;
    const progress = Math.max(0, Math.min(1, route.progress));
    const targetX = from.x + (to.x - from.x) * progress;
    const targetY = from.y + (to.y - from.y) * progress;
    const targetAngle = Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI;

    let visual = planeVisuals.get(route.id);
    if (!visual) {
      const node = dom.planeLayer.querySelector(`[data-plane-route-id="${CSS.escape(route.id)}"]`);
      if (!node) return;
      visual = { node, x: targetX, y: targetY, angle: targetAngle };
      planeVisuals.set(route.id, visual);
    }

    visual.x += (targetX - visual.x) * smoothing;
    visual.y += (targetY - visual.y) * smoothing;
    const angleDelta = ((targetAngle - visual.angle + 540) % 360) - 180;
    visual.angle += angleDelta * smoothing;
    visual.node.setAttribute('transform', `translate(${visual.x.toFixed(2)} ${visual.y.toFixed(2)}) rotate(${visual.angle.toFixed(2)})`);
    visual.node.setAttribute('opacity', route.disabledUntil > state.clock ? '0.35' : '1');
  });
}

function renderCityNode'''
    source = replace_regex(source, map_renderer, replacement, 'map renderer')

    path.write_text(source)


def patch_gestures() -> None:
    path = ROOT / 'src/gesture-controls.js'
    source = path.read_text()

    source = replace_once(
        source,
        "  let inertiaFrame = 0;",
        "  let inertiaFrame = 0;\n  let mapFrame = 0;\n  let lastAppliedViewBox = worldMap.getAttribute('viewBox') || '';\n  let lastQaSample = 0;",
        'gesture state'
    )

    source = replace_once(
        source,
        "  new MutationObserver(() => syncMapView()).observe(worldMap, { attributes: true, attributeFilter: ['viewBox'] });",
        "  new MutationObserver(() => {\n    const current = worldMap.getAttribute('viewBox') || '';\n    if (current !== lastAppliedViewBox) syncMapView();\n  }).observe(worldMap, { attributes: true, attributeFilter: ['viewBox'] });",
        'gesture observer'
    )

    source = replace_once(
        source,
        "      .world-map.is-panning { cursor: grabbing; }\n      .world-map.is-route-dragging { cursor: crosshair; }",
        "      .world-map.is-panning,\n      .world-map.is-inertial { cursor: grabbing; }\n      .world-map.is-route-dragging { cursor: crosshair; }\n      .world-map.is-interacting .route-core,\n      .world-map.is-interacting .city-ring,\n      .world-map.is-interacting .city-core,\n      .world-map.is-inertial .route-core,\n      .world-map.is-inertial .city-ring,\n      .world-map.is-inertial .city-core { filter: none !important; }\n      .world-map.is-interacting text,\n      .world-map.is-inertial text { text-rendering: optimizeSpeed; }\n      .world-map.is-route-dragging .route-drag-preview { filter: none; }",
        'gesture performance styles'
    )

    source = replace_once(
        source,
        "      lastTime: performance.now(),\n      velocityX: 0,\n      velocityY: 0,\n      startCenterX: mapView.centerX,",
        "      lastTime: performance.now(),\n      velocityX: 0,\n      velocityY: 0,\n      lastCenterX: mapView.centerX,\n      lastCenterY: mapView.centerY,\n      startCenterX: mapView.centerX,",
        'gesture velocity state'
    )

    source = replace_once(
        source,
        "    try { worldMap.setPointerCapture(event.pointerId); } catch {}\n    event.stopImmediatePropagation();",
        "    worldMap.classList.add('is-interacting');\n    try { worldMap.setPointerCapture(event.pointerId); } catch {}\n    event.stopImmediatePropagation();",
        'gesture interaction class'
    )

    old_pan = '''    const now = performance.now();
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
    applyMapView();'''
    new_pan = '''    const now = performance.now();
    const elapsed = Math.max(1, now - gesture.lastTime);
    const nextCenterX = gesture.startCenterX - dx * gesture.scaleX;
    const nextCenterY = gesture.startCenterY - dy * gesture.scaleY;
    const instantVelocityX = (nextCenterX - gesture.lastCenterX) / elapsed;
    const instantVelocityY = (nextCenterY - gesture.lastCenterY) / elapsed;
    gesture.velocityX = gesture.velocityX * 0.72 + instantVelocityX * 0.28;
    gesture.velocityY = gesture.velocityY * 0.72 + instantVelocityY * 0.28;
    gesture.lastTime = now;
    gesture.lastCenterX = nextCenterX;
    gesture.lastCenterY = nextCenterY;
    mapView.centerX = nextCenterX;
    mapView.centerY = nextCenterY;
    scheduleMapView();'''
    source = replace_once(source, old_pan, new_pan, 'gesture pan loop')

    source = replace_once(
        source,
        "    const completed = gesture;\n    gesture = null;\n    try { worldMap.releasePointerCapture(event.pointerId); } catch {}\n    worldMap.classList.remove('is-panning', 'is-route-dragging');",
        "    const completed = gesture;\n    gesture = null;\n    flushScheduledMapView();\n    try { worldMap.releasePointerCapture(event.pointerId); } catch {}\n    worldMap.classList.remove('is-panning', 'is-route-dragging', 'is-interacting');",
        'gesture pointer up'
    )

    source = replace_once(
        source,
        "    gesture = null;\n    worldMap.classList.remove('is-panning', 'is-route-dragging');\n    clearRoutePreview();",
        "    gesture = null;\n    cancelScheduledMapView();\n    worldMap.classList.remove('is-panning', 'is-route-dragging', 'is-interacting');\n    clearRoutePreview();",
        'gesture pointer cancel'
    )

    old_apply = '''  function applyMapView() {
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
  }'''
    new_apply = '''  function scheduleMapView() {
    if (mapFrame) return;
    mapFrame = requestAnimationFrame(() => {
      mapFrame = 0;
      applyMapView();
    });
  }

  function flushScheduledMapView() {
    if (!mapFrame) return;
    cancelAnimationFrame(mapFrame);
    mapFrame = 0;
    applyMapView();
  }

  function cancelScheduledMapView() {
    if (mapFrame) cancelAnimationFrame(mapFrame);
    mapFrame = 0;
  }

  function applyMapView() {
    mapView.width = MAP_WIDTH / mapView.zoom;
    mapView.height = MAP_HEIGHT / mapView.zoom;
    mapView.centerX = clamp(mapView.centerX, mapView.width / 2, MAP_WIDTH - mapView.width / 2);
    mapView.centerY = clamp(mapView.centerY, mapView.height / 2, MAP_HEIGHT - mapView.height / 2);
    const viewBox = `${mapView.centerX - mapView.width / 2} ${mapView.centerY - mapView.height / 2} ${mapView.width} ${mapView.height}`;
    if (viewBox !== lastAppliedViewBox) {
      lastAppliedViewBox = viewBox;
      worldMap.setAttribute('viewBox', viewBox);
    }
    worldMap.classList.toggle('is-zoomed', mapView.zoom > 1.01);
    const zoomText = mapView.zoom.toFixed(2);
    if (worldMap.dataset.zoom !== zoomText) worldMap.dataset.zoom = zoomText;

    const now = performance.now();
    if (window.__AEROSPHERE_QA__ && now - lastQaSample >= 100) {
      lastQaSample = now;
      window.__AEROSPHERE_QA__.zoom = mapView.zoom;
      window.__AEROSPHERE_QA__.mapCenter = { x: mapView.centerX, y: mapView.centerY };
    }
  }'''
    source = replace_once(source, old_apply, new_apply, 'gesture map view')

    old_inertia = '''  function startInertia(velocityX, velocityY) {
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
  }'''
    new_inertia = '''  function startInertia(velocityX, velocityY) {
    cancelInertia();
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let vx = velocityX;
    let vy = velocityY;
    if (Math.hypot(vx, vy) < 0.035) return;
    worldMap.classList.add('is-inertial');
    let previous = performance.now();
    const step = (now) => {
      const elapsed = Math.min(34, Math.max(1, now - previous));
      previous = now;
      mapView.centerX += vx * elapsed;
      mapView.centerY += vy * elapsed;
      applyMapView();
      const friction = Math.pow(0.915, elapsed / 16.67);
      vx *= friction;
      vy *= friction;
      if (Math.hypot(vx, vy) < 0.008) {
        inertiaFrame = 0;
        worldMap.classList.remove('is-inertial');
        return;
      }
      inertiaFrame = requestAnimationFrame(step);
    };
    inertiaFrame = requestAnimationFrame(step);
  }

  function cancelInertia() {
    if (inertiaFrame) cancelAnimationFrame(inertiaFrame);
    inertiaFrame = 0;
    worldMap.classList.remove('is-inertial');
  }'''
    source = replace_once(source, old_inertia, new_inertia, 'gesture inertia')

    path.write_text(source)


def patch_polish() -> None:
    path = ROOT / 'src/polish.js'
    source = path.read_text()
    source = source.replace('installMapPanning();\n', '', 1)

    source = replace_regex(
        source,
        r'''\n  tools\.querySelectorAll\('\[data-zoom\]'\)\.forEach\(\(button\) => \{.*?\n  \}\);\n\n  svg\.addEventListener\('wheel',.*?\n  \}, \{ passive: false \}\);''',
        '',
        'legacy zoom handlers'
    )
    source = source.replace(
        "showMapHint('Поиск города и масштабирование карты готовы. Ctrl + колесо — быстрый зум.');",
        "showMapHint('Карта готова: колесо масштабирует, обычное перетаскивание двигает её плавно.');",
        1
    )
    source = replace_regex(
        source,
        r'''\nfunction installMapPanning\(\) \{.*?\n\}\n\nfunction installMobileNavigation''',
        '\nfunction installMobileNavigation',
        'legacy panning function'
    )
    path.write_text(source)


def patch_service_worker() -> None:
    path = ROOT / 'sw.js'
    source = path.read_text()
    source = re.sub(r"const CACHE_NAME = 'aerosphere-v\d+';", "const CACHE_NAME = 'aerosphere-v10';", source, count=1)
    path.write_text(source)


patch_game()
patch_gestures()
patch_polish()
patch_service_worker()
print('Smooth rendering patch applied')
