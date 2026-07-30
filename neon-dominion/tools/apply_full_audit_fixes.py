from pathlib import Path

css = Path('neon-dominion/styles-v7.css')
with css.open('a') as stream:
    stream.write("""

/* Safe compact HUD placement after visual screenshot review */
@media(max-width:900px){
  .war-battle-panel.collapsed{top:155px;bottom:auto;right:8px;left:auto;width:min(280px,calc(100% - 16px))}
}
@media(max-height:520px) and (orientation:landscape){
  .war-battle-panel.collapsed{top:8px;bottom:auto;left:8px;right:auto;width:min(260px,calc(100% - 16px))}
}
""")

test = Path('neon-dominion/tests/full-audit.mjs')
text = test.read_text()
old_mobile = """  await page.locator('[data-battle-action=\"toggle-hud\"]').tap();
  await assertNoDocumentOverflow(page);
  await page.screenshot({ path: `${output}/full-audit-mobile-battle.png`, fullPage: true });"""
new_mobile = """  await page.locator('[data-battle-action=\"toggle-hud\"]').tap();
  const mobileOverlap = await page.evaluate(() => {
    const hud = document.querySelector('#warBattlePanel')?.getBoundingClientRect();
    const controls = document.querySelector('.group-controls')?.getBoundingClientRect();
    const speed = document.querySelector('.speed-control')?.getBoundingClientRect();
    const intersects = (a, b) => Boolean(a && b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top);
    return { group: intersects(hud, controls), speed: intersects(hud, speed) };
  });
  assert.deepEqual(mobileOverlap, { group: false, speed: false });
  await assertNoDocumentOverflow(page);
  await page.screenshot({ path: `${output}/full-audit-mobile-battle.png`, fullPage: true });"""
if old_mobile not in text:
    raise SystemExit('mobile overlap marker not found')
text = text.replace(old_mobile, new_mobile)
old_mobile_report = """  report.mobile = { home, shell, hud, diagnostics };"""
new_mobile_report = """  report.mobile = { home, shell, hud, mobileOverlap, diagnostics };"""
if old_mobile_report not in text:
    raise SystemExit('mobile report marker not found')
text = text.replace(old_mobile_report, new_mobile_report)
old_landscape = """  assert.equal(await page.locator('#warBattlePanel').evaluate((node) => node.classList.contains('collapsed')), true);
  await assertNoDocumentOverflow(page);
  await page.screenshot({ path: `${output}/full-audit-landscape-battle.png`, fullPage: true });"""
new_landscape = """  assert.equal(await page.locator('#warBattlePanel').evaluate((node) => node.classList.contains('collapsed')), true);
  const landscapeOverlap = await page.evaluate(() => {
    const hud = document.querySelector('#warBattlePanel')?.getBoundingClientRect();
    const controls = document.querySelector('.group-controls')?.getBoundingClientRect();
    const speed = document.querySelector('.speed-control')?.getBoundingClientRect();
    const intersects = (a, b) => Boolean(a && b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top);
    return { group: intersects(hud, controls), speed: intersects(hud, speed) };
  });
  assert.deepEqual(landscapeOverlap, { group: false, speed: false });
  await assertNoDocumentOverflow(page);
  await page.screenshot({ path: `${output}/full-audit-landscape-battle.png`, fullPage: true });"""
if old_landscape not in text:
    raise SystemExit('landscape overlap marker not found')
text = text.replace(old_landscape, new_landscape)
old_landscape_report = """  report.landscape = { canvas, viewportFit, diagnostics };"""
new_landscape_report = """  report.landscape = { canvas, viewportFit, landscapeOverlap, diagnostics };"""
if old_landscape_report not in text:
    raise SystemExit('landscape report marker not found')
text = text.replace(old_landscape_report, new_landscape_report)
test.write_text(text)

Path('neon-dominion/tools/apply_full_audit_fixes.py').unlink()
