// Wowhead in the brain (odd/tasks/nqa-brain.md B9): tooltips by id (item stats, quest text, NPC and
// spell text) kept in web_cache, so a question about them needs no network at the moment it's asked.
//
//   cachedTooltip(db, kind, id, { lookup, maxAgeMs, now }) → { name, text, url, cached } | { error }
//   warmFromState(db, state, { lookup, limit, gapMs }) → how many new tooltips were fetched
//   tooltipFact(db, kind, id) → "[wowhead] …" line for retrieval, or null
//
// Only ids from the game data or the brain leave the PC (one host, by id: tools/voice/wowhead.mjs).
import { lookupWowhead } from '../voice/wowhead.mjs';

export const WEB_MAX_AGE_MS = 14 * 24 * 3600 * 1000; // tooltips change rarely
export const WARM_LIMIT = 12; // per round
export const WARM_GAP_MS = 1000; // politely: one request a second
const pause = ms => new Promise(r => setTimeout(r, ms));
const url = (kind, id) => `https://www.wowhead.com/forever/${kind}=${id}`;

export async function cachedTooltip(db, kind, id, { lookup = lookupWowhead, maxAgeMs = WEB_MAX_AGE_MS, now = Date.now() } = {}) {
  const row = db.prepare('SELECT text, url, read_at FROM web_cache WHERE kind = ? AND id = ?').get(kind, id);
  if (row && now - row.read_at < maxAgeMs) {
    const [name, ...rest] = String(row.text || '').split('\n');
    return { name, text: rest.join('\n'), url: row.url, cached: true };
  }
  const r = await lookup(kind, id);
  if (r.error) return { error: r.error };
  db.prepare('INSERT INTO web_cache (kind, id, text, url, read_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(kind, id) DO UPDATE SET text = excluded.text, url = excluded.url, read_at = excluded.read_at')
    .run(kind, id, `${r.name}\n${r.text}`.slice(0, 2000), url(kind, id), now);
  return { name: r.name, text: r.text, url: url(kind, id), cached: false };
}

/** The ids worth having before the player asks: quests in the log, gear worn, bag items. */
export function idsFromState(state) {
  const out = [];
  for (const q of Array.isArray(state?.quests) ? state.quests : []) if (Number.isInteger(q?.id)) out.push(['quest', q.id]);
  for (const g of Array.isArray(state?.gear) ? state.gear : []) if (Number.isInteger(g?.id)) out.push(['item', g.id]);
  for (const i of Array.isArray(state?.bags?.items) ? state.bags.items : []) if (Number.isInteger(i?.id)) out.push(['item', i.id]);
  return out;
}

/** Fetch up to `limit` tooltips the cache lacks (or has old), one a second; errors are skipped. */
export async function warmFromState(db, state, { lookup = lookupWowhead, limit = WARM_LIMIT, gapMs = WARM_GAP_MS, now = Date.now, sleep = pause } = {}) {
  let fetched = 0;
  for (const [kind, id] of idsFromState(state)) {
    if (fetched >= limit) break;
    const row = db.prepare('SELECT read_at FROM web_cache WHERE kind = ? AND id = ?').get(kind, id);
    if (row && now() - row.read_at < WEB_MAX_AGE_MS) continue;
    const r = await cachedTooltip(db, kind, id, { lookup, now: now() });
    if (!r.error && !r.cached) { fetched += 1; await sleep(gapMs); }
  }
  return fetched;
}

/** One retrieval line from the cache (no network), or null. */
export function tooltipFact(db, kind, id, max = 320) {
  let row;
  try { row = db.prepare('SELECT text FROM web_cache WHERE kind = ? AND id = ?').get(kind, id); } catch { return null; }
  if (!row?.text) return null;
  return `[wowhead] ${kind} ${id}: ${String(row.text).replace(/\s+/g, ' ').trim().slice(0, max)}`;
}
