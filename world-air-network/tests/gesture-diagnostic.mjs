import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseUrl = process.env.AEROSPHERE_URL || 'http://127.0.0.1:8080/world-air-network/';
const outputDir = process.env.QA_OUTPUT_DIR || 'artifacts/aerosphere-qa';
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

await page.addInitScript(() => {
  localStorage.clear();
  window.__AERO_POINTER_TRACE__ = [];
  const describe = (event) => {
    const target = event.target;
    window.__AERO_POINTER_TRACE__.push({
      type: event.type,
      x: Math.round(event.clientX || 0),
      y: Math.round(event.clientY || 0),
      pointerId: event.pointerId ?? null,
      pointerType: event.pointerType ?? null,
      button: event.button ?? null,
      buttons: event.buttons ?? null,
      targetTag: target?.tagName || null,
      targetClass: target?.getAttribute?.('class') || null,
      cityId: target?.closest?.('[data-city-id]')?.dataset.cityId || null,
      routeId: target?.closest?.('[data-route-id]')?.dataset.routeId || null,
      time: Math.round(performance.now())
    });
  };
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'lostpointercapture', 'click']) {
    window.addEventListener(type, describe, true);
  }
});

try {
  await page.goto(`${baseUrl}?qa=gesture-diagnostic`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForFunction(() => document.querySelectorAll('#cityLayer [data-city-id]').length === 40);
  const search = page.locator('#citySearch');
  await search.fill('Минск');
  await search.press('Enter');
  await page.waitForFunction(() => document.querySelector('#sideContent .panel-title')?.textContent?.includes('Минск'));
  await page.locator('[data-action="open-airport"][data-city-id="minsk"]').click();
  await page.waitForFunction(() => document.querySelector('[data-city-id="minsk"]')?.classList.contains('open'));
  await page.locator('[data-zoom="fit"]').click();

  const source = await cityPoint('moscow');
  const target = await cityPoint('minsk');
  await page.mouse.move(source.x, source.y);
  await page.mouse.down();
  await page.mouse.move((source.x + target.x) / 2, (source.y + target.y) / 2, { steps: 8 });
  await page.mouse.move(target.x, target.y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(600);

  const diagnostic = await page.evaluate(({ source, target }) => ({
    source,
    target,
    pointerTrace: window.__AERO_POINTER_TRACE__.slice(-80),
    qa: window.__AEROSPHERE_QA__,
    game: window.AeroSphereGame?.getSnapshot?.() || null,
    modalHidden: document.querySelector('#confirmModal')?.classList.contains('hidden'),
    modalTitle: document.querySelector('#modalTitle')?.textContent,
    hint: document.querySelector('.map-hint')?.textContent,
    mapClass: document.querySelector('#worldMap')?.getAttribute('class'),
    previewHidden: document.querySelector('.route-drag-preview')?.hidden,
    previewPath: document.querySelector('.route-drag-preview')?.getAttribute('d'),
    openCities: [...document.querySelectorAll('.city-node.open')].map((node) => node.dataset.cityId)
  }), { source, target });

  await writeFile(`${outputDir}/gesture-diagnostic.json`, JSON.stringify(diagnostic, null, 2));
  await page.screenshot({ path: `${outputDir}/gesture-diagnostic.png`, fullPage: true });
  console.log(JSON.stringify(diagnostic, null, 2));
} finally {
  await browser.close();
}

async function cityPoint(cityId) {
  return page.locator(`#cityLayer [data-city-id="${cityId}"]`).evaluate((element) => {
    const matrix = element.getScreenCTM();
    const point = new DOMPoint(0, 0).matrixTransform(matrix);
    return { x: point.x, y: point.y };
  });
}
