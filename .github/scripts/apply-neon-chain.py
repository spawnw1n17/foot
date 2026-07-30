from pathlib import Path


def replace(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    if old not in text:
        raise SystemExit(f'Pattern not found in {path}: {old[:120]!r}')
    file.write_text(text.replace(old, new, 1))


engine = Path('neon-dominion/src/engine.js')
if 'const sendAll = normalizedRatio >= 0.999;' not in engine.read_text():
    replace('neon-dominion/src/engine.js', '''    const amount = Math.floor(from.troops * clamp(ratio, 0.15, 0.9));
    if (amount < 2) return false;

    from.troops -= amount;''', '''    const normalizedRatio = clamp(ratio, 0.15, 1);
    const sendAll = normalizedRatio >= 0.999;
    const amount = sendAll ? from.troops : Math.floor(from.troops * normalizedRatio);
    if (amount < (sendAll ? 0.5 : 2)) return false;

    from.troops = sendAll ? 0 : Math.max(0, from.troops - amount);''')

    replace('neon-dominion/src/engine.js', '''  sendMany(fromIds, toId, ratio = 0.5, owner = 'player') {
    const unique = [...new Set(fromIds)].filter((id) => id !== toId);
    let sent = 0;
    for (const fromId of unique) {
      if (this.send(fromId, toId, ratio, owner)) sent += 1;
    }''', '''  sendMany(fromIds, toId, ratio = 1, owner = 'player') {
    const unique = [...new Set(fromIds)].filter((id) => id !== toId);
    const groupRatio = owner === 'player' ? 1 : ratio;
    let sent = 0;
    for (const fromId of unique) {
      if (this.send(fromId, toId, groupRatio, owner)) sent += 1;
    }''')


game = Path('neon-dominion/src/game.js')
if 'dragOrder.hoverTargetId' not in game.read_text():
    replace('neon-dominion/src/game.js', '''  if (hit?.owner === 'player') {
    if (!selectedIds.has(hit.id)) selectOnly(hit.id);
    const sourceIds = selectedIds.size ? [...selectedIds] : [hit.id];
    dragOrder = {
      pointerId: event.pointerId,
      sourceIds,
      startClientX: event.clientX,
      startClientY: event.clientY,
      moved: false,
    };
    primarySelectedId = hit.id;
    selectedSignature = '';
    syncSelected();
    beep(430, 0.035);
  } else {''', '''  if (hit?.owner === 'player') {
    selectOnly(hit.id);
    dragOrder = {
      pointerId: event.pointerId,
      sourceIds: [hit.id],
      startClientX: event.clientX,
      startClientY: event.clientY,
      moved: false,
      hoverTargetId: null,
    };
    primarySelectedId = hit.id;
    selectedSignature = '';
    syncSelected();
    beep(430, 0.035);
  } else {''')

    replace('neon-dominion/src/game.js', '''  if (dragOrder) {
    const distance = Math.hypot(event.clientX - dragOrder.startClientX, event.clientY - dragOrder.startClientY);
    if (distance > 7) dragOrder.moved = true;
    const hit = hitNode(pointerWorld);
    dom.dragLabel.style.display = dragOrder.moved ? 'block' : 'none';
    dom.dragLabel.style.left = `${event.offsetX + 12}px`;
    dom.dragLabel.style.top = `${event.offsetY + 12}px`;
    if (hit && !dragOrder.sourceIds.includes(hit.id)) {
      dom.dragLabel.textContent = `${dragOrder.sourceIds.length} БАЗ → ${hit.id.toUpperCase()}`;
    } else {
      dom.dragLabel.textContent = 'ВЕДИТЕ К ЛЮБОЙ БАЗЕ';
    }
  }''', '''  if (dragOrder) {
    const distance = Math.hypot(event.clientX - dragOrder.startClientX, event.clientY - dragOrder.startClientY);
    if (distance > 7) dragOrder.moved = true;
    const hit = hitNode(pointerWorld);

    if (dragOrder.moved && hit?.owner === 'player' && !dragOrder.sourceIds.includes(hit.id)) {
      dragOrder.sourceIds.push(hit.id);
      selectedIds = new Set(dragOrder.sourceIds);
      primarySelectedId = hit.id;
      selectedSignature = '';
      syncSelected(true);
      syncGroupControls();
      beep(520 + Math.min(180, dragOrder.sourceIds.length * 24), 0.04);
      navigator.vibrate?.(18);
    }

    dragOrder.hoverTargetId = hit && !dragOrder.sourceIds.includes(hit.id) ? hit.id : null;
    dom.dragLabel.style.display = dragOrder.moved ? 'block' : 'none';
    dom.dragLabel.style.left = `${event.offsetX + 12}px`;
    dom.dragLabel.style.top = `${event.offsetY + 12}px`;
    if (dragOrder.hoverTargetId) {
      dom.dragLabel.textContent = `${dragOrder.sourceIds.length} БАЗ → ${hit.id.toUpperCase()} · ОТПУСТИТЕ`;
    } else if (hit?.owner === 'player') {
      dom.dragLabel.textContent = `${dragOrder.sourceIds.length} БАЗ В ЦЕПОЧКЕ`;
    } else {
      dom.dragLabel.textContent = 'ВЕДИТЕ ЧЕРЕЗ СВОИ БАЗЫ К ЦЕЛИ';
    }
  }''')

    replace('neon-dominion/src/game.js', "const sent = engine.sendMany(dragOrder.sourceIds, target.id, 0.52, 'player');", "const sent = engine.sendMany(dragOrder.sourceIds, target.id, 1, 'player');")
    replace('neon-dominion/src/game.js', "const sent = engine.sendMany(sources, targetId, 0.52, 'player');", "const sent = engine.sendMany(sources, targetId, 1, 'player');")

    replace('neon-dominion/src/game.js', '''function drawDrag() {
  for (const sourceId of dragOrder.sourceIds) {
    const source = engine.nodes[sourceId];
    if (!source) continue;
    const dx = pointerWorld.x - source.x;
    const dy = pointerWorld.y - source.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    const bend = Math.min(70, length * 0.12) * ((source.x + source.y) % 2 ? 1 : -1);
    const controlX = (source.x + pointerWorld.x) / 2 - dy / length * bend;
    const controlY = (source.y + pointerWorld.y) / 2 + dx / length * bend;
    ctx.strokeStyle = '#54f5ff';
    ctx.globalAlpha = 0.8;
    ctx.lineWidth = sourceId === primarySelectedId ? 3 : 2;
    ctx.setLineDash([8, 7]);
    ctx.beginPath();
    ctx.moveTo(source.x, source.y);
    ctx.quadraticCurveTo(controlX, controlY, pointerWorld.x, pointerWorld.y);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}''', '''function drawDrag() {
  const sources = dragOrder.sourceIds.map((id) => engine.nodes[id]).filter(Boolean);
  if (!sources.length) return;

  ctx.save();
  ctx.strokeStyle = '#54f5ff';
  ctx.shadowColor = '#54f5ff';
  ctx.shadowBlur = 16;
  ctx.globalAlpha = 0.92;
  ctx.lineWidth = 3.4;
  ctx.setLineDash([10, 7]);
  ctx.lineDashOffset = -engine.time * 30;
  ctx.beginPath();
  ctx.moveTo(sources[0].x, sources[0].y);
  for (let index = 1; index < sources.length; index += 1) ctx.lineTo(sources[index].x, sources[index].y);
  ctx.lineTo(pointerWorld.x, pointerWorld.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.shadowBlur = 0;

  sources.forEach((source, index) => {
    ctx.fillStyle = '#07111c';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(source.x, source.y, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 9px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(index + 1), source.x, source.y + 0.5);
  });

  const target = engine.nodes[dragOrder.hoverTargetId];
  if (target) {
    const radius = NODE_TYPES[target.type].radius + 18;
    ctx.strokeStyle = target.owner === 'player' ? '#58f2a5' : '#ff6589';
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.arc(target.x, target.y, radius, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}''')

    replace('neon-dominion/src/game.js', "notice('Свободное движение активно. Проведите от базы к любой цели.', 'good');", "notice('Зажмите базу, проведите через другие свои базы и отпустите на цели.', 'good');")
    replace('neon-dominion/src/game.js', "        : 'Свободное движение';", "        : 'Цепной жест: база → база → цель';")
    replace('neon-dominion/src/game.js', "sendMany: (fromIds, to, ratio = 0.5) => engine?.sendMany(fromIds, to, ratio, 'player'),", "sendMany: (fromIds, to, ratio = 1) => engine?.sendMany(fromIds, to, ratio, 'player'),")


index = Path('neon-dominion/index.html')
text = index.read_text()
old_hint = 'Проведите от своей базы к любой цели. Для группового приказа нажмите «Группа», коснитесь нескольких баз или обведите их рамкой, затем нажмите «Отправить» и выберите цель.'
if old_hint in text:
    index.write_text(text.replace(old_hint, 'Зажмите первую свою базу и, не отпуская, проведите через вторую, третью и остальные базы. Отпустите палец на цели — все выбранные базы отправят весь гарнизон и начнут новый набор с нуля.', 1))

sw = Path('neon-dominion/sw.js')
text = sw.read_text()
if "neon-dominion-v2" in text:
    sw.write_text(text.replace("neon-dominion-v2", "neon-dominion-v3", 1))


tests = Path('neon-dominion/tests/engine.test.mjs')
text = tests.read_text()
old = '''test('групповой приказ отправляет армии сразу с нескольких баз', () => {
  const engine = new DominionEngine(MAPS[1], { seed: 7 });
  const sent = engine.sendMany(['p0', 'p1'], 'r0', 0.5, 'player');
  assert.equal(sent, 2);
  assert.equal(engine.convoys.length, 2);
  assert.equal(engine.stats.groupOrders, 1);
});'''
new = '''test('групповой приказ полностью опустошает базы и после отправки начинается новый набор', () => {
  const engine = new DominionEngine(MAPS[1], { seed: 7 });
  const p0 = engine.nodes.p0.troops;
  const p1 = engine.nodes.p1.troops;
  const sent = engine.sendMany(['p0', 'p1'], 'r0', 0.5, 'player');
  assert.equal(sent, 2);
  assert.equal(engine.convoys.length, 2);
  assert.equal(engine.nodes.p0.troops, 0);
  assert.equal(engine.nodes.p1.troops, 0);
  assert.equal(engine.convoys.find((convoy) => convoy.from === 'p0').amount, p0);
  assert.equal(engine.convoys.find((convoy) => convoy.from === 'p1').amount, p1);
  assert.equal(engine.stats.groupOrders, 1);
  engine.update(0.05);
  assert.ok(engine.nodes.p0.troops > 0);
  assert.ok(engine.nodes.p1.troops > 0);
});'''
if old in text:
    tests.write_text(text.replace(old, new, 1))


browser = Path('neon-dominion/tests/browser-check.mjs')
text = browser.read_text()
old = '''  const p1 = mapPoint(box, 320, 170);
  const r0 = mapPoint(box, 1020, 190);

  const initialSelection = await page.evaluate(() => window.NeonDominionQA.getSelection());
  assert.deepEqual(initialSelection, ['p0']);
  await page.locator('#groupSelectBtn').click();
  await page.touchscreen.tap(p1.x, p1.y);
  await page.waitForFunction(() => window.NeonDominionQA.getSelection().length === 2);
  await page.locator('#groupSendBtn').click();
  await page.touchscreen.tap(r0.x, r0.y);
  await page.waitForFunction(() => window.NeonDominionQA.getState().convoys.filter((convoy) => convoy.to === 'r0').length >= 2);'''
new = '''  const p0 = mapPoint(box, 165, 360);
  const p1 = mapPoint(box, 320, 170);
  const r0 = mapPoint(box, 1020, 190);

  const initialSelection = await page.evaluate(() => window.NeonDominionQA.getSelection());
  assert.deepEqual(initialSelection, ['p0']);
  const client = await context.newCDPSession(page);
  const point = (position) => ({ x: position.x, y: position.y, radiusX: 8, radiusY: 8, force: 1, id: 1 });
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(p0)] });
  for (let step = 1; step <= 12; step += 1) {
    const t = step / 12;
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point({ x: p0.x + (p1.x - p0.x) * t, y: p0.y + (p1.y - p0.y) * t })] });
  }
  for (let step = 1; step <= 18; step += 1) {
    const t = step / 18;
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point({ x: p1.x + (r0.x - p1.x) * t, y: p1.y + (r0.y - p1.y) * t })] });
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForFunction(() => window.NeonDominionQA.getState().convoys.filter((convoy) => convoy.to === 'r0').length >= 2);'''
if old in text:
    text = text.replace(old, new, 1)
old2 = '''  assert.equal(state.stats.groupOrders, 1);
  assert.equal(errors.length, 0);

  report.mobile = {'''
new2 = '''  assert.equal(state.stats.groupOrders, 1);
  assert.ok(state.nodes.find((node) => node.id === 'p0').troops < 3);
  assert.ok(state.nodes.find((node) => node.id === 'p1').troops < 3);
  assert.equal(errors.length, 0);

  report.mobile = {'''
if old2 in text:
    text = text.replace(old2, new2, 1)
if 'emptiedSources:' not in text:
    text = text.replace("    groupOrders: state.stats.groupOrders,", "    groupOrders: state.stats.groupOrders,\n    emptiedSources: state.nodes.filter((node) => ['p0', 'p1'].includes(node.id)).map((node) => ({ id: node.id, troops: node.troops })),")
browser.write_text(text)


readme = Path('neon-dominion/README.md')
text = readme.read_text()
if 'Цепной групповой жест' not in text:
    text += '\n- Цепной групповой жест: провести через несколько своих баз и отпустить на цели.\n- Все выбранные базы отправляют весь гарнизон до нуля, после чего сразу начинается новый набор.\n'
    readme.write_text(text)
