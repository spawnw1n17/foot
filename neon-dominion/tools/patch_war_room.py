from pathlib import Path

path = Path('neon-dominion/src/game.js')
text = path.read_text()
old = "    const asset = visualAssets.bases[node.type];\n"
new = "    const asset = visualAssets.bases[node.type] || visualAssets.bases.core;\n"
if old not in text:
    raise RuntimeError('WAR ROOM asset marker not found')
path.write_text(text.replace(old, new, 1))
Path(__file__).unlink()
print('WAR ROOM render fallback installed')
