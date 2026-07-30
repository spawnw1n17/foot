from pathlib import Path


def replace(path, old, new, label):
    text = path.read_text()
    if old not in text:
        raise SystemExit(f'{label} marker not found')
    path.write_text(text.replace(old, new))

war = Path('neon-dominion/src/war-room.js')
replace(
    war,
    """  open(tab = 'world') {
    this.activeTab = tab;
    this.overlay.classList.add('visible');
    this.render();
  }

  close() { this.overlay.classList.remove('visible'); }""",
    """  open(tab = 'world') {
    this.activeTab = tab;
    this.overlay.classList.add('visible');
    document.body.classList.add('war-room-open');
    this.render();
  }

  close() {
    this.overlay.classList.remove('visible');
    document.body.classList.remove('war-room-open');
  }""",
    'overlay scroll lock',
)
replace(
    war,
    """    this.hud.hidden = false;
    this.renderBattleHud(true);""",
    """    this.hud.hidden = false;
    const compactHud = matchMedia('(max-width: 900px)').matches || (innerHeight <= 520 && innerWidth > innerHeight);
    this.hud.classList.toggle('collapsed', compactHud);
    this.renderBattleHud(true);""",
    'compact HUD',
)

css = Path('neon-dominion/styles-v7.css')
with css.open('a') as stream:
    stream.write("""

/* Full Chromium audit fixes — mobile HUD, landscape viewport and visual states */
body.war-room-open{overflow:hidden}
.war-room-overlay{background:rgba(0,2,7,.93)}
.world-region.locked{opacity:.5;filter:grayscale(.72)}
.world-region.locked>i{color:#78879c;background:rgba(255,255,255,.055)}
.war-primary:disabled{opacity:.34;filter:grayscale(.9);box-shadow:none!important;background:rgba(91,103,123,.12)!important;color:#718096!important;border-color:rgba(130,145,169,.15)!important}
@media(max-width:900px){
  .war-battle-panel.collapsed{width:min(330px,calc(100% - 16px));max-height:none}
  .war-battle-panel.collapsed>header{border-bottom:0}
}
@media(max-height:520px) and (orientation:landscape){
  html,body{width:100%;height:100%;min-height:0;overflow:hidden}
  .app-shell{height:100dvh;min-height:0;padding:5px 7px}
  .topbar{display:flex;min-height:52px;height:52px;padding:5px 8px;gap:7px;border-radius:14px}
  .brand-wrap{min-width:0;gap:3px}
  .brand-mark{transform:scale(.74);transform-origin:left center;margin-right:-9px}
  .brand-wrap .eyebrow{display:none}
  .brand-wrap h1{margin:0;font-size:12px;white-space:nowrap}
  .top-actions{margin-left:auto;gap:4px}
  .player-profile-chip{min-width:0;width:40px;height:40px;padding:3px;border-radius:12px;overflow:hidden}
  .player-profile-chip>i{width:32px;height:32px;border-radius:9px}
  .player-profile-chip>span,.player-profile-chip>em{display:none}
  .icon-btn{width:38px;height:38px;border-radius:11px}
  .game-layout{height:calc(100dvh - 62px);min-height:0;margin-top:5px}
  .battlefield-wrap{height:100%;min-height:0;border-radius:14px}
  .war-battle-panel{top:auto;right:8px;bottom:48px;width:min(300px,calc(100% - 16px));max-height:calc(100% - 56px)}
  .war-battle-panel.collapsed{width:min(280px,calc(100% - 16px))}
  .war-battle-panel>header{padding:6px}
  .speed-control{left:8px;bottom:8px}
  .mobile-panel-toggle{right:8px;bottom:8px;padding:7px 10px}
  .notification-stack{top:8px;right:8px;max-width:245px}
  .notice{padding:8px 10px;font-size:9px}
}
""")

test = Path('neon-dominion/tests/full-audit.mjs')
replace(
    test,
    """  await page.locator('#profileNameInput').fill('Аудитор');""",
    """  await page.evaluate(() => window.NeonDominionQA.openMeta('profile'));
  await page.waitForSelector('#profileNameInput');
  await page.locator('#profileNameInput').fill('Аудитор');""",
    'profile tab test',
)
replace(
    test,
    """  assert.equal(await page.locator('#warRoomNav [data-war-tab]').count(), 9);
  for (const tab of ['world', 'modes', 'survival', 'sandbox', 'editor', 'records', 'identity', 'arsenal', 'audio']) await openWarTab(page, tab);""",
    """  assert.equal(await page.locator('#warRoomNav [data-war-tab]').count(), 9);
  assert.equal(await page.evaluate(() => document.body.classList.contains('war-room-open')), true);
  const lockedOpacity = Number(await page.locator('.world-region.locked').first().evaluate((node) => getComputedStyle(node).opacity));
  assert.ok(lockedOpacity >= .45, `locked regions are too dim: ${lockedOpacity}`);
  for (const tab of ['world', 'modes', 'survival', 'sandbox', 'editor', 'records', 'identity', 'arsenal', 'audio']) await openWarTab(page, tab);""",
    'desktop visual assertions',
)
replace(
    test,
    """  const hud = await dimensions(page, '#warBattlePanel');
  assert.ok(hud.width <= 390);
  await page.locator('[data-battle-action=\"toggle-hud\"]').tap();
  await page.locator('[data-battle-action=\"toggle-hud\"]').tap();""",
    """  const hud = await dimensions(page, '#warBattlePanel');
  assert.ok(hud.width <= 390);
  assert.equal(await page.locator('#warBattlePanel').evaluate((node) => node.classList.contains('collapsed')), true);
  assert.ok(hud.height < 90, `mobile HUD should start collapsed, got ${hud.height}px`);
  await page.locator('[data-battle-action=\"toggle-hud\"]').tap();
  assert.equal(await page.locator('#warBattlePanel').evaluate((node) => node.classList.contains('collapsed')), false);
  await page.locator('[data-battle-action=\"toggle-hud\"]').tap();""",
    'mobile HUD assertions',
)
replace(
    test,
    """  const canvas = await dimensions(page, '#battlefield');
  assert.ok(canvas.width > 400 && canvas.height > 200);
  await assertNoDocumentOverflow(page);
  await page.screenshot({ path: `${output}/full-audit-landscape-battle.png`, fullPage: true });""",
    """  const canvas = await dimensions(page, '#battlefield');
  assert.ok(canvas.width > 400 && canvas.height > 200);
  const viewportFit = await page.evaluate(() => ({ scroll: document.documentElement.scrollHeight, client: document.documentElement.clientHeight }));
  assert.ok(viewportFit.scroll <= viewportFit.client + 2, `landscape vertical overflow ${viewportFit.scroll}/${viewportFit.client}`);
  assert.equal(await page.locator('#warBattlePanel').evaluate((node) => node.classList.contains('collapsed')), true);
  await assertNoDocumentOverflow(page);
  await page.screenshot({ path: `${output}/full-audit-landscape-battle.png`, fullPage: true });""",
    'landscape viewport assertions',
)
replace(
    test,
    """  report.landscape = { canvas, diagnostics };""",
    """  report.landscape = { canvas, viewportFit, diagnostics };""",
    'landscape report',
)

sw = Path('neon-dominion/sw.js')
replace(sw, "neon-dominion-v7", "neon-dominion-v8", 'service worker cache')

pages = Path('.github/workflows/pages.yml')
replace(pages, "neon-dominion-v7", "neon-dominion-v8", 'pages cache validation')

Path('neon-dominion/tools/apply_full_audit_fixes.py').unlink()
