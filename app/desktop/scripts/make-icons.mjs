// Voxwarden's original geometry lives in tools/brand-assets.py and branding/voxwarden.svg.
// Generated platform files are committed; normal builds need no image tooling.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(ROOT, '../..');
const manifest = JSON.parse(fs.readFileSync(path.join(REPO, 'branding/assets.sha256.json'), 'utf8'));
export const SHA256 = Object.freeze(Object.fromEntries(Object.entries(manifest)
  .filter(([f]) => f.startsWith('app/desktop/build/') || f.startsWith('app/desktop/assets/'))
  .map(([f, hash]) => [f.slice('app/desktop/'.length), hash])));
export const ICONS = Object.freeze(Object.fromEntries(Object.keys(SHA256).map(f => [f, f])));
export function checkIcons({ root = ROOT } = {}) {
  const bad = [];
  for (const [file, hash] of Object.entries(SHA256)) {
    const target = path.join(root, file);
    if (!fs.existsSync(target)) bad.push({ copy: file, why: 'missing' });
    else if (crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex') !== hash) bad.push({ copy: file, why: 'differs from the original Voxwarden mark' });
  }
  return bad;
}
export function copyIcons({ root = ROOT, from }) {
  if (!from) throw new Error('Regenerate with python tools/brand-assets.py, or provide --from <asset folder>.');
  for (const file of Object.keys(ICONS)) fs.copyFileSync(path.join(from, file), path.join(root, file));
  return Object.keys(ICONS);
}
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--check')) {
    const bad = checkIcons(); for (const b of bad) console.error(`${b.copy}: ${b.why}`);
    process.exitCode = bad.length ? 1 : 0;
  } else console.log('Regenerate the original Voxwarden assets with: python tools/brand-assets.py');
}
