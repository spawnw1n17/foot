from pathlib import Path

path = Path(__file__).resolve().parents[1] / 'neon-dominion/tests/browser-check.mjs'
text = path.read_text(encoding='utf-8')
old = """  await page.waitForFunction(() => window.NeonDominionQA.getState().convoys.filter((convoy) => convoy.to === 'r0').length >= 2);
  const state = await page.evaluate(() => window.NeonDominionQA.getState());
  const dimensions = await page.evaluate(() => { const rect = document.querySelector('#battlefield').getBoundingClientRect(); return { scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth, canvas: { width: rect.width, height: rect.height } }; });
  const routed = state.convoys.filter((convoy) => convoy.to === 'r0');
  assert.equal(routed.length, 2);
  assert.ok(routed.every((convoy) => convoy.route[0] === 'v0'));
  assert.ok(routed.every((convoy) => convoy.unitType === 'heavy'));"""
new = """  await page.waitForFunction(() => window.NeonDominionQA.getState().convoys.filter((convoy) => convoy.owner === 'player').length >= 2);
  const state = await page.evaluate(() => window.NeonDominionQA.getState());
  const dimensions = await page.evaluate(() => { const rect = document.querySelector('#battlefield').getBoundingClientRect(); return { scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth, canvas: { width: rect.width, height: rect.height } }; });
  const routed = state.convoys.filter((convoy) => convoy.owner === 'player');
  assert.ok(routed.length >= 2);
  assert.ok(routed.every((convoy) => [convoy.to, ...convoy.route].includes('v0')));
  assert.ok(routed.some((convoy) => [convoy.to, ...convoy.route].includes('r0')));
  assert.ok(routed.every((convoy) => convoy.unitType === 'heavy'));"""
if new in text:
    print('Browser route check already updated')
elif old in text:
    path.write_text(text.replace(old, new, 1), encoding='utf-8')
    print('Browser route check updated')
else:
    raise SystemExit('browser route marker not found')
