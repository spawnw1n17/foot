import { readFile, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const required = [
  'index.html', 'styles.css', 'app.js', 'manifest.webmanifest', 'icon.svg', 'sw.js'
];

for (const file of required) await access(file);
execFileSync(process.execPath, ['--check', 'app.js'], { stdio: 'inherit' });
execFileSync(process.execPath, ['--check', 'sw.js'], { stdio: 'inherit' });

const html = await readFile('index.html', 'utf8');
for (const reference of ['styles.css', 'app.js', 'manifest.webmanifest', 'icon.svg']) {
  if (!html.includes(reference)) throw new Error(`index.html does not reference ${reference}`);
}

const manifest = JSON.parse(await readFile('manifest.webmanifest', 'utf8'));
if (manifest.name !== 'Aurora Eleven') throw new Error('Unexpected app name in manifest');
console.log('Aurora Eleven validation passed.');
