import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseUrl = process.env.AEROSPHERE_URL || 'http://127.0.0.1:8080/world-air-network/';
const outputDir = process.env.QA_OUTPUT_DIR || 'artifacts/aerosphere-qa';
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
let activePage = null;
const report = {
  baseUrl,
  startedAt: new Date().toISOString(),
  desktop: {},
  mobile: {},
  consoleErrors: [],
  pageErrors: []
};

try {
  await runDesktopScenario();
  await runMobileScenario();

  assert.deepEqual(report.consoleErrors, [], `Console errors: ${report.consoleErrors.join('\n')}`);
  assert.deepEqual(report.pageErrors, [], `Page errors: ${report.pageErrors.join('\n')}`);
  report.ok = true;
} catch (error) {
  report.ok = false;
  report.failure = error?.stack || String(error);
  if (activePage && !activePage.isClosed()) {
    await activePage.screenshot({ path: `${outputDir}/failure.png`, fullPage: true }).catch(() => {});
    await writeFile(`${outputDir}/failure.html`, await activePage.content()).catch(() => {});
  }
  throw error;
} finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(`${outputDir}/qa-report.json`, JSON.stringify(report, null, 2));
  await browser.close();
}

async function runDesktopScenario() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  activePage = page;
  attachDiagnostics(page, 'desktop');
  await page.addInitScript(() => localStorage.clear());

  await page.goto(`${baseUrl}?qa=desktop`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForFunction(() => document.querySelectorAll('#cityLayer [data-city-id]').length === 40);
  await page.waitForSelector('#sideContent .panel-title');

  const startup = await page.evaluate(() => ({
    cityCount: document.querySelectorAll('#cityLayer [data-city-id]').length,
    routeCount: document.querySelectorAll('#routeLayer [data-route-id]').length,
    searchReady: Boolean(document.querySelector('#citySearch')),
    gestureLayerReady: Boolean(document.querySelector('.gesture-layer')),
    commandApiReady: Boolean(window.AeroSphereGame),
    qaReady: Boolean(window.__AEROSPHERE_QA__),
    runtimeErrors: document.documentElement.dataset.runtimeErrors || null
  }));
  assert.equal(startup.cityCount, 40, 'На карте должны отображаться 40 городов');
  assert.equal(startup.routeCount, 2, 'Новая игра должна начинаться с двух маршрутов');
  assert.equal(startup.searchReady, true, 'Поиск города должен быть подключён');
  assert.equal(startup.gestureLayerReady, true, 'Слой перетаскивания должен быть подключён');
  assert.equal(startup.commandApiReady, true, 'Прямой API игрового движка должен быть подключён');
  assert.equal(startup.qaReady, true, 'QA-телеметрия должна быть подключена');
  assert.equal(startup.runtimeErrors, null, 'Не должно быть ошибок рантайма');

  const search = page.locator('#citySearch');
  await search.fill('Минск');
  await search.press('Enter');
  await page.waitForFunction(() => document.querySelector('#sideContent .panel-title')?.textContent?.includes('Минск'));

  const openButton = page.locator('[data-action="open-airport"][data-city-id="minsk"]');
  await openButton.click();
  await page.waitForFunction(() => document.querySelector('[data-city-id="minsk"]')?.classList.contains('open'));

  await page.locator('[data-zoom="fit"]').click();
  assert.equal(Number(await page.locator('#worldMap').getAttribute('data-zoom')), 1, 'Полный вид должен сбрасывать масштаб');

  await dragCityToCity(page, 'moscow', 'minsk');
  await page.locator('#confirmModal:not(.hidden)').waitFor();
  await page.locator('#modalConfirm').click();
  await page.waitForFunction(() => document.querySelectorAll('#routeLayer [data-route-id]').length === 3);

  await clickCityOnMap(page, 'moscow');
  await page.waitForFunction(() => document.querySelector('#sideContent .panel-title')?.textContent?.includes('Москва'));

  const map = page.locator('#worldMap');
  const mapBox = await map.boundingBox();
  assert.ok(mapBox, 'Карта должна иметь экранные координаты');
  await page.mouse.move(mapBox.x + mapBox.width * 0.45, mapBox.y + mapBox.height * 0.55);
  await page.mouse.wheel(0, -360);
  await page.waitForTimeout(180);
  const wheelZoom = Number(await map.getAttribute('data-zoom'));
  assert.ok(wheelZoom > 1.2, `Колесо без Ctrl должно увеличивать карту: ${wheelZoom}`);

  const beforePan = await map.getAttribute('viewBox');
  await dragMap(page, 0.43, 0.68, 105, -48);
  await page.waitForTimeout(350);
  const afterPan = await map.getAttribute('viewBox');
  assert.notEqual(afterPan, beforePan, 'Обычное перетаскивание должно двигать увеличенную карту');

  await page.locator('[data-zoom="fit"]').click();
  assert.equal(Number(await map.getAttribute('data-zoom')), 1, 'Кнопка полного вида должна возвращать масштаб 1');

  await page.locator('[data-speed="4"]').click();
  await page.waitForTimeout(1800);
  assert.match(await page.locator('#timeStat').textContent(), /^\d{2}:\d{2}$/);

  await page.locator('[data-tab="network"]').click();
  await page.waitForFunction(() => document.querySelector('#sideContent')?.textContent?.includes('Авиасеть'));
  assert.equal(await page.locator('.route-card').count(), 3, 'Новый маршрут должен появиться в панели сети');

  await page.locator('[data-tab="research"]').click();
  assert.equal(await page.locator('.research-card').count(), 4, 'Должны отображаться все исследования');
  await page.locator('[data-tab="objectives"]').click();
  assert.equal(await page.locator('.objective-card').count(), 5, 'Должны отображаться все цели');

  await page.locator('#saveButton').click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('aerosphere-save-v1') || 'null'));
  assert.ok(saved, 'Сохранение должно появиться в localStorage');
  assert.ok(saved.airports.minsk, 'Открытый аэропорт должен сохраняться');
  assert.ok(saved.routes.some((route) => route.id === 'minsk__moscow'), 'Маршрут, созданный перетаскиванием, должен сохраняться');

  const qa = await page.evaluate(() => window.__AEROSPHERE_QA__);
  assert.equal(qa.errors.length, 0, 'Встроенная телеметрия не должна содержать ошибок');
  assert.equal(qa.cityCount, 40);
  assert.equal(qa.routeCount, 3);
  assert.ok(qa.gestures?.routeDrag >= 1, 'Телеметрия должна подтвердить создание маршрута перетаскиванием');
  assert.ok(qa.gestures?.pan >= 1, 'Телеметрия должна подтвердить перетаскивание карты');
  assert.ok(qa.gestures?.zoom >= 1, 'Телеметрия должна подтвердить масштабирование колесом');
  assert.equal(qa.documentOverflow, false, 'На десктопе не должно быть горизонтального переполнения документа');

  await page.screenshot({ path: `${outputDir}/desktop-final.png`, fullPage: true });
  report.desktop = {
    cityCount: qa.cityCount,
    routeCount: qa.routeCount,
    gestures: qa.gestures,
    zoom: qa.zoom,
    savedMoney: saved.money,
    savedAirports: Object.keys(saved.airports).length,
    savedRoutes: saved.routes.length
  };

  activePage = null;
  await context.close();
}

async function runMobileScenario() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  activePage = page;
  attachDiagnostics(page, 'mobile');
  await page.addInitScript(() => localStorage.clear());

  await page.goto(`${baseUrl}?qa=mobile`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForFunction(() => document.querySelectorAll('#cityLayer [data-city-id]').length === 40);

  const layout = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    mapHeight: Math.round(document.querySelector('#worldMap')?.getBoundingClientRect().height || 0),
    quickNavVisible: getComputedStyle(document.querySelector('.mobile-quick-nav')).display !== 'none',
    touchActionFit: getComputedStyle(document.querySelector('#worldMap')).touchAction,
    errors: window.__AEROSPHERE_QA__.errors
  }));

  assert.ok(layout.scrollWidth <= layout.innerWidth + 2, `Мобильная страница не должна расширяться: ${layout.scrollWidth} > ${layout.innerWidth}`);
  assert.ok(layout.mapHeight >= 300 && layout.mapHeight <= 520, `Высота мобильной карты должна быть удобной: ${layout.mapHeight}`);
  assert.equal(layout.quickNavVisible, true, 'На мобильном размере должна отображаться быстрая навигация');
  assert.ok(layout.touchActionFit.includes('pan-y'), `При полном виде карта должна разрешать вертикальную прокрутку страницы: ${layout.touchActionFit}`);
  assert.deepEqual(layout.errors, []);

  await page.locator('[data-zoom="in"]').click();
  const mobileMap = page.locator('#worldMap');
  const mobileBeforePan = await mobileMap.getAttribute('viewBox');
  const zoomedTouchAction = await mobileMap.evaluate((node) => getComputedStyle(node).touchAction);
  assert.equal(zoomedTouchAction, 'none', 'После увеличения карта должна перехватывать жест перетаскивания');
  await dragMapTouch(context, page, 0.55, 0.62, -72, 35);
  await page.waitForTimeout(280);
  const mobileAfterPan = await mobileMap.getAttribute('viewBox');
  assert.notEqual(mobileAfterPan, mobileBeforePan, 'Перетаскивание должно работать и в мобильной раскладке');
  await page.locator('[data-zoom="fit"]').click();

  await page.locator('.mobile-quick-nav [data-jump="control"]').click();
  await page.waitForTimeout(500);
  const sideVisible = await page.locator('.side-panel').evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return rect.top < window.innerHeight && rect.bottom > 0;
  });
  assert.equal(sideVisible, true, 'Кнопка «Управление» должна прокручивать к панели');

  await page.locator('.mobile-quick-nav [data-jump="map"]').click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${outputDir}/mobile-final.png`, fullPage: true });
  report.mobile = {
    ...layout,
    gestures: await page.evaluate(() => window.__AEROSPHERE_QA__.gestures || {})
  };

  activePage = null;
  await context.close();
}

async function clickCityOnMap(page, cityId) {
  const point = await cityScreenPoint(page, cityId);
  await page.mouse.click(point.x, point.y);
}

async function dragCityToCity(page, sourceId, targetId) {
  const source = await cityScreenPoint(page, sourceId);
  const target = await cityScreenPoint(page, targetId);
  await page.mouse.move(source.x, source.y);
  await page.mouse.down();
  await page.mouse.move((source.x + target.x) / 2, (source.y + target.y) / 2, { steps: 8 });
  await page.mouse.move(target.x, target.y, { steps: 8 });
  await page.mouse.up();
}

async function dragMapTouch(context, page, xRatio, yRatio, deltaX, deltaY) {
  const box = await page.locator('#worldMap').boundingBox();
  assert.ok(box, 'Карта должна иметь экранные координаты для сенсорного перетаскивания');
  const startX = box.x + box.width * xRatio;
  const startY = box.y + box.height * yRatio;
  const session = await context.newCDPSession(page);
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: startX, y: startY, radiusX: 5, radiusY: 5, force: 1, id: 1 }]
  });
  for (let step = 1; step <= 12; step += 1) {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{
        x: startX + deltaX * (step / 12),
        y: startY + deltaY * (step / 12),
        radiusX: 5,
        radiusY: 5,
        force: 1,
        id: 1
      }]
    });
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await session.detach();
}

async function dragMap(page, xRatio, yRatio, deltaX, deltaY) {
  const box = await page.locator('#worldMap').boundingBox();
  assert.ok(box, 'Карта должна иметь экранные координаты для перетаскивания');
  const startX = box.x + box.width * xRatio;
  const startY = box.y + box.height * yRatio;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + deltaX, startY + deltaY, { steps: 12 });
  await page.mouse.up();
}

async function cityScreenPoint(page, cityId) {
  const node = page.locator(`#cityLayer [data-city-id="${cityId}"]`);
  const point = await node.evaluate((element) => {
    const matrix = element.getScreenCTM();
    if (!matrix) return null;
    const center = new DOMPoint(0, 0).matrixTransform(matrix);
    return { x: center.x, y: center.y };
  });
  assert.ok(point, `Город ${cityId} должен иметь экранные координаты`);
  return point;
}

function attachDiagnostics(page, label) {
  page.on('console', (message) => {
    if (message.type() === 'error') report.consoleErrors.push(`[${label}] ${message.text()}`);
  });
  page.on('pageerror', (error) => report.pageErrors.push(`[${label}] ${error.stack || error.message}`));
  page.on('requestfailed', (request) => {
    const failure = request.failure();
    report.consoleErrors.push(`[${label}] request failed: ${request.url()} — ${failure?.errorText || 'unknown'}`);
  });
}
