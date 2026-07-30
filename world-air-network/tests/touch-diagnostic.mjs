import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseUrl = process.env.AEROSPHERE_URL || 'http://127.0.0.1:8080/world-air-network/';
const outputDir = process.env.QA_OUTPUT_DIR || 'artifacts/aerosphere-qa';
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const page = await context.newPage();

await page.addInitScript(() => {
  localStorage.clear();
  window.__AERO_TOUCH_TRACE__ = [];
  for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel', 'pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'lostpointercapture']) {
    window.addEventListener(type, (event) => {
      const touch = event.touches?.[0] || event.changedTouches?.[0];
      window.__AERO_TOUCH_TRACE__.push({
        type,
        x: Math.round(event.clientX ?? touch?.clientX ?? 0),
        y: Math.round(event.clientY ?? touch?.clientY ?? 0),
        pointerId: event.pointerId ?? null,
        pointerType: event.pointerType ?? null,
        isPrimary: event.isPrimary ?? null,
        button: event.button ?? null,
        buttons: event.buttons ?? null,
        targetTag: event.target?.tagName || null,
        targetClass: event.target?.getAttribute?.('class') || null,
        cityId: event.target?.closest?.('[data-city-id]')?.dataset.cityId || null,
        defaultPrevented: event.defaultPrevented,
        scrollY: Math.round(window.scrollY),
        time: Math.round(performance.now())
      });
    }, true);
  }
});

try {
  await page.goto(`${baseUrl}?qa=touch-diagnostic`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForFunction(() => document.querySelectorAll('#cityLayer [data-city-id]').length === 40);
  await page.locator('[data-zoom="in"]').click();
  const map = page.locator('#worldMap');
  const before = await map.getAttribute('viewBox');
  const box = await map.boundingBox();
  const startX = box.x + box.width * 0.55;
  const startY = box.y + box.height * 0.62;
  const session = await context.newCDPSession(page);
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: startX, y: startY, radiusX: 6, radiusY: 6, force: 1, id: 1 }]
  });
  for (let step = 1; step <= 12; step += 1) {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: startX - 72 * (step / 12), y: startY + 35 * (step / 12), radiusX: 6, radiusY: 6, force: 1, id: 1 }]
    });
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await session.detach();
  await page.waitForTimeout(500);

  const diagnostic = await page.evaluate((before) => ({
    before,
    after: document.querySelector('#worldMap')?.getAttribute('viewBox'),
    touchAction: getComputedStyle(document.querySelector('#worldMap')).touchAction,
    trace: window.__AERO_TOUCH_TRACE__.slice(-100),
    qa: window.__AEROSPHERE_QA__,
    game: window.AeroSphereGame?.getSnapshot?.() || null,
    scrollY: window.scrollY,
    mapClass: document.querySelector('#worldMap')?.getAttribute('class'),
    hint: document.querySelector('.map-hint')?.textContent
  }), before);

  await writeFile(`${outputDir}/touch-diagnostic.json`, JSON.stringify(diagnostic, null, 2));
  await page.screenshot({ path: `${outputDir}/touch-diagnostic.png`, fullPage: true });
  console.log(JSON.stringify(diagnostic, null, 2));
} finally {
  await browser.close();
}
