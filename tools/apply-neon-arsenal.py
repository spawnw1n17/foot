from pathlib import Path

path = Path(__file__).resolve().parents[1] / 'neon-dominion/src/game.js'
text = path.read_text(encoding='utf-8')


def replace_once(old: str, new: str, label: str) -> None:
    global text
    if new in text:
        return
    if old not in text:
        raise SystemExit(f'{label} marker not found')
    text = text.replace(old, new, 1)


replace_once(
    "import { TerritoryController } from './territory.js';",
    "import { TerritoryController } from './territory.js';\nimport { MetaController } from './meta.js';",
    'import',
)

replace_once(
    "});\nconst particles = Array.from({ length: 96 }, (_, index) => ({",
    "});\nconst meta = new MetaController({\n  notice: (text, type = '') => notice(text, type),\n  onChange: () => {},\n});\nconst particles = Array.from({ length: 96 }, (_, index) => ({",
    'controller',
)

replace_once(
    "  territory.start(engine);\n  primarySelectedId = [...selectedIds][0] || null;",
    "  territory.start(engine);\n  const activeCommander = meta.beginBattle(engine);\n  primarySelectedId = [...selectedIds][0] || null;",
    'battle start',
)

replace_once(
    "  log(`Операция «${currentMap.title}» началась`);\n  notice('Зажмите базу, проведите через другие свои базы и отпустите на цели.', 'good');",
    "  log(`Операция «${currentMap.title}» началась`);\n  log(`${activeCommander.name}: ${activeCommander.role}`);\n  notice(`Командир: ${activeCommander.name}. Зажмите базу и постройте цепной маршрут.`, 'good');",
    'commander log',
)

replace_once(
    "  territory.stop();\n  selectedIds.clear();",
    "  territory.stop();\n  meta.refresh();\n  selectedIds.clear();",
    'home refresh',
)

replace_once(
    "    ctx.shadowBlur = 0;\n\n    ctx.globalCompositeOperation = 'screen';",
    "    ctx.shadowBlur = 0;\n    meta.decorateBase(ctx, node, config, faction, now);\n\n    ctx.globalCompositeOperation = 'screen';",
    'base cosmetic',
)

replace_once(
    "    const faction = FACTIONS[convoy.owner];\n\n    ctx.strokeStyle = `${faction.color}38`;",
    "    const faction = FACTIONS[convoy.owner];\n    meta.decorateConvoy(ctx, convoy, geometry);\n\n    ctx.strokeStyle = `${faction.color}38`;",
    'convoy cosmetic',
)

old_result = """  if (victory) {
    profile.completed[currentMap.id] = Math.max(profile.completed[currentMap.id] || 0, stars);
    saveProfile();
    beep(820, 0.25);
  } else {
    beep(100, 0.28);
  }
  dom.result.classList.add('visible');"""
new_result = """  if (victory) {
    profile.completed[currentMap.id] = Math.max(profile.completed[currentMap.id] || 0, stars);
    saveProfile();
    beep(820, 0.25);
  } else {
    beep(100, 0.28);
  }
  const totalStars = Object.values(profile.completed).reduce((sum, value) => sum + value, 0);
  const reward = meta.completeBattle({
    victory,
    stars,
    totalStars,
    order: currentMap.order,
    mapId: currentMap.id,
    time: engine.time,
    stats: engine.stats,
    longestChain: engine.stats.chainedRoutes,
  });
  dom.resultStats.insertAdjacentHTML('beforeend', `<div class=\"result-reward\"><span>НАГРАДА ПРОФИЛЯ</span><b>◈ ${reward.credits}</b><b>✦ ${reward.shards}</b><b>${reward.xp} XP</b></div>`);
  dom.result.classList.add('visible');"""
replace_once(old_result, new_result, 'battle result')

replace_once(
    "  getSelection: () => [...selectedIds],\n  assetsReady: () => visualAssets.background.complete",
    "  getSelection: () => [...selectedIds],\n  openMeta: (tab = 'profile') => meta.open(tab),\n  closeMeta: () => meta.close(),\n  getMeta: () => meta.snapshot(),\n  resetMeta: () => meta.resetForQA(),\n  buyMeta: (id) => meta.buy(id),\n  equipMeta: (id) => meta.equip(id),\n  chooseCommander: (id) => meta.chooseCommander(id),\n  completeMetaBattle: (battle) => meta.completeBattle(battle),\n  assetsReady: () => visualAssets.background.complete",
    'qa meta',
)

path.write_text(text, encoding='utf-8')
print('Arsenal integrated into game.js')
