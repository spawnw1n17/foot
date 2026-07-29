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
    qaReady: Boolean(window.__AEROSPHERE_QA__),
    runtimeErrors: document.documentElement.dataset.runtimeErrors || null
  }));
  assert.equal(startup.cityCount, 40, 'На карте должны отображаться 40 городов');
  assert.equal(startup.routeCount, 2, 'Новая игра должна начинаться с двух маршрутов');
  assert.equal(startup.searchReady, true, 'Поиск города должен быть подключён');
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
  await clickCityOnMap(page, 'moscow');
  await page.waitForFunction(() => document.querySelector('#sideContent .panel-title')?.textContent?.includes('Москва'));
  await page.locator('[data-action="start-route"][data-city-id="moscow"]').click();
  await clickCityOnMap(page, 'minsk');
  await page.locator('#confirmModal:not(.hidden)').waitFor();
  await page.locator('#modalConfirm').click();
  await page.waitForFunction(() => document.querySelectorAll('#routeLayer [data-route-id]').length === 3);

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

  await page.locator('[data-zoom="in"]').click();
  const zoom = Number(await page.locator('#worldMap').getAttribute('data-zoom'));
  assert.ok(zoom > 1, 'Кнопка увеличения должна менять масштаб карты');
  await page.locator('[data-zoom="fit"]').click();

  await page.locator('#saveButton').click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('aerosphere-save-v1') || 'null'));
  assert.ok(saved, 'Сохранение должно появиться в localStorage');
  assert.ok(saved.airports.minsk, 'Открытый аэропорт должен сохраняться');
  assert.ok(saved.routes.some((route) => route.id === 'minsk__moscow'), 'Новый маршрут должен сохраняться');

  const qa = await page.evaluate(() => window.__AEROSPHERE_QA__);
  assert.equal(qa.errors.length, 0, 'Встроенная телеметрия не должна содержать ошибок');
  assert.equal(qa.cityCount, 40);
  assert.equal(qa.routeCount, 3);
  assert.equal(qa.documentOverflow, false, 'На десктопе не должно быть горизонтального переполнения документа');

  await page.screenshot({ path: `${outputDir}/desktop-final.png`, fullPage: true });
  report.desktop = {
    cityCount: qa.cityCount,
    routeCount: qa.routeCount,
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
    errors: window.__AEROSPHERE_QA__.errors
  }));

  assert.ok(layout.scrollWidth <= layout.innerWidth + 2, `Мобильная страница не должна расширяться: ${layout.scrollWidth} > ${layout.innerWidth}`);
  assert.ok(layout.mapHeight >= 300 && layout.mapHeight <= 520, `Высота мобильной карты должна быть удобной: ${layout.mapHeight}`);
  assert.equal(layout.quickNavVisible, true, 'На мобильном размере должна отображаться быстрая навигация');
  assert.deepEqual(layout.errors, []);

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
  report.mobile = layout;

  activePage = null;
  await context.close();
}

async function clickCityOnMap(page, cityId) {
  const node = page.locator(`#cityLayer [data-city-id="${cityId}"]`);
  const point = await node.evaluate((element) => {
    const matrix = element.getScreenCTM();
    if (!matrix) return null;
    const center = new DOMPoint(0, 0).matrixTransform(matrix);
    return { x: center.x, y: center.y };
  });
  assert.ok(point, `Город ${cityId} должен иметь экранные координаты`);
  await page.mouse.click(point.x, point.y);
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
