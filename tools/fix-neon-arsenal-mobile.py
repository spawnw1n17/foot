from pathlib import Path

path = Path(__file__).resolve().parents[1] / 'neon-dominion/tests/browser-check.mjs'
text = path.read_text(encoding='utf-8')
text = text.replace("await page.screenshot({ path: `${output}/mobile-arsenal-season.png`, fullPage: true });", "await page.screenshot({ path: `${output}/mobile-arsenal-season.png` });")
old = "  await page.evaluate(() => { window.NeonDominionQA.closeMeta(); window.NeonDominionQA.startLevel('crossfire'); window.NeonDominionQA.setUnit('heavy'); });\n  await page.waitForFunction(() => window.NeonDominionQA.getState()?.nodes?.length >= 10);"
new = "  await page.evaluate(() => { window.NeonDominionQA.closeMeta(); window.scrollTo(0, 0); window.NeonDominionQA.startLevel('crossfire'); window.NeonDominionQA.setUnit('heavy'); });\n  await page.waitForFunction(() => !document.querySelector('#arsenalOverlay').classList.contains('visible'));\n  await page.waitForFunction(() => window.NeonDominionQA.getState()?.nodes?.length >= 10);\n  await page.waitForTimeout(450);\n  await page.locator('#battlefield').scrollIntoViewIfNeeded();"
if new not in text:
    if old not in text:
        raise SystemExit('mobile transition marker not found')
    text = text.replace(old, new, 1)
path.write_text(text, encoding='utf-8')
print('Mobile Arsenal scenario refined')
