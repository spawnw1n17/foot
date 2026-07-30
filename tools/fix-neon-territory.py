from pathlib import Path

path = Path(__file__).resolve().parents[1] / 'neon-dominion/src/engine.js'
text = path.read_text(encoding='utf-8')
old = "        if (distance(pointA, pointB) > 22) continue;"
new = "        const reversedRoute = a.from === b.to && a.to === b.from;\n        const interceptRadius = reversedRoute ? 92 : 30;\n        if (distance(pointA, pointB) > interceptRadius) continue;"
if old not in text:
    raise SystemExit('intercept marker not found')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
print('Interception radius updated')
