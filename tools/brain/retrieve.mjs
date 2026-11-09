// What the brain knows that matters for one question (odd/tasks/nqa-brain.md B5): the quests, NPCs,
// items and zones the question names (found by name, FTS5) and the player's own quests it's about,
// expanded with where things are and who gives, takes or drops them; every line carries its source.
// Synchronous (node:sqlite) and bounded, so a turn waits well under 100 ms for it.
//
//   retrieve({ db, question, state, now }) → { facts: [{ kind, id, name, text, source }], lines, ms }
//
// lines is what goes to the model: one fact per line, "[source] text", at most MAX_FACTS.
export const MAX_FACTS = 14;
export const MAX_SPAWNS = 3;

const QUOTED_RE = /["“«']([^"”»']{3,60})["”»']/g;
// Runs of capitalised words, with the small words names keep inside ("Call of Water", "Mutanus the Devourer").
const NAME_RUN_RE = /\b([A-Z][\w'’-]+(?:\s+(?:of|the|de|del|la|el|and|y)?\s*[A-Z][\w'’-]+)*)/g;
const STOP = new Set(['Dónde', 'Donde', 'Cómo', 'Como', 'Qué', 'Que', 'Quién', 'Quien', 'No', 'Me', 'Mi', 'Mis', 'Hay', 'Para', 'El', 'La', 'Los', 'Las', 'Un', 'Una', 'Y', 'En', 'De', 'Del', 'Es', 'Lo', 'Te', 'Tengo', 'Voy']);

const json = s => { try { return s ? JSON.parse(s) : null; } catch { return null; } };
const fmt = n => (Number.isFinite(n) ? (Math.round(n * 10) / 10).toFixed(1) : '?');

/** The names a question may be about: quoted phrases, runs of capitalised words, quest titles from the log. */
export function candidates(question, state) {
  const q = String(question || '');
  const out = new Set();
  for (const m of q.matchAll(QUOTED_RE)) out.add(m[1].trim());
  for (const m of q.matchAll(NAME_RUN_RE)) {
    const words = m[1].split(/\s+/).filter(w => !STOP.has(w));
    if (words.length && words.join(' ').length >= 4) out.add(words.join(' '));
  }
  const low = q.toLowerCase();
  for (const quest of Array.isArray(state?.quests) ? state.quests : []) {
    const t = typeof quest?.title === 'string' ? quest.title : '';
    if (t.length >= 4 && low.includes(t.toLowerCase())) out.add(t);
  }
  return [...out].slice(0, 8);
}

// FTS5 phrase query for a name, words only (no operators from the player's text).
const phrase = s => `"${String(s).toLowerCase().replace(/[^\p{L}\p{N}\s'’-]/gu, ' ').replace(/["']/g, ' ').trim().split(/\s+/).join(' ')}"`;

function findByName(db, name, limit = 5) {
  const exact = String(name).toLowerCase();
  let rows = [];
  try { rows = db.prepare('SELECT kind, id, name FROM name_index WHERE name_index MATCH ? LIMIT 40').all(phrase(name)); } catch { rows = []; }
  // Exact names first, then the shortest (the closest), then the kinds a player asks about most.
  const rank = { quest: 0, npc: 1, item: 2, zone: 3, object: 4 };
  return rows
    .map(r => ({ ...r, exact: String(r.name).toLowerCase() === exact }))
    .sort((a, b) => (b.exact - a.exact) || (a.name.length - b.name.length) || ((rank[a.kind] ?? 9) - (rank[b.kind] ?? 9)))
    .slice(0, limit);
}

function zoneName(db, areaId) {
  if (!areaId) return null;
  return db.prepare('SELECT name, ui_map_id FROM zone WHERE area_id = ?').get(areaId) || null;
}

/** "Thunder Bluff 43.6,57.2; ..." for an NPC's or object's first spawns. */
function where(db, kind, id) {
  const spawns = db.prepare('SELECT area_id, x, y FROM spawn WHERE kind = ? AND id = ? LIMIT ?').all(kind, id, MAX_SPAWNS);
  return spawns.map(s => {
    const z = zoneName(db, s.area_id);
    return `${z?.name || `zone ${s.area_id}`} ${fmt(s.x)},${fmt(s.y)}${z?.ui_map_id ? ` (map ${z.ui_map_id})` : ''}`;
  }).join('; ');
}

function nameOf(db, kind, id) {
  const table = { npc: 'npc', object: 'object', item: 'item', quest: 'quest' }[kind];
  if (!table) return null;
  return db.prepare(`SELECT name FROM ${table} WHERE id = ?`).get(id)?.name ?? null;
}

function whoText(db, list) {
  const parts = [];
  for (const kind of ['npc', 'object', 'item']) {
    for (const id of Array.isArray(list?.[kind]) ? list[kind].slice(0, 2) : []) {
      const n = nameOf(db, kind, id) || `${kind} ${id}`;
      const w = kind === 'item' ? '' : where(db, kind, id);
      parts.push(w ? `${n} (${w})` : n);
    }
  }
  return parts.join(' or ');
}

function questFact(db, id, mine) {
  const q = db.prepare('SELECT * FROM quest WHERE id = ?').get(id);
  if (!q) return null;
  const starts = whoText(db, json(q.starts));
  const ends = whoText(db, json(q.ends));
  const parts = [`Quest ${q.id} "${q.name}"${q.level ? ` (level ${q.level}${q.req_level ? `, from ${q.req_level}` : ''})` : ''}`];
  if (starts) parts.push(`given by ${starts}`);
  if (ends) parts.push(`turned in to ${ends}`);
  const obj = json(q.objectives);
  const targets = [];
  // Questie keeps objectives by position: creatures, objects, items (then reputation, kill credit,
  // spell); an importer may also have named them.
  for (const [kind, key, pos] of [['npc', 'creatures', 0], ['object', 'objects', 1], ['item', 'items', 2]]) {
    const list = Array.isArray(obj) ? obj[pos] : obj?.[key];
    for (const o of Array.isArray(list) ? list.slice(0, 3) : []) {
      const oid = Array.isArray(o) ? o[0] : o;
      if (!Number.isInteger(oid)) continue;
      const n = nameOf(db, kind, oid) || `${kind} ${oid}`;
      const w = kind === 'item' ? itemWhere(db, oid, 2) : where(db, kind, oid);
      targets.push(w ? `${n}: ${w}` : n);
    }
  }
  if (targets.length) parts.push(`objectives: ${targets.join(' | ')}`);
  else if (q.objectives_text) parts.push(`objective: ${String(q.objectives_text).slice(0, 160)}`);
  const pre = json(q.pre_quests);
  const preIds = Array.isArray(pre) ? pre.flat().filter(Number.isInteger).slice(0, 2) : [];
  if (preIds.length) parts.push(`needs first: ${preIds.map(p => nameOf(db, 'quest', p) || p).join(', ')}`);
  if (q.next_quest) parts.push(`next: ${nameOf(db, 'quest', q.next_quest) || q.next_quest}`);
  if (mine) parts.push('(in your log)');
  return { kind: 'quest', id: q.id, name: q.name, text: parts.join('; '), source: q.source };
}

function npcFact(db, id) {
  const n = db.prepare('SELECT * FROM npc WHERE id = ?').get(id);
  if (!n) return null;
  const parts = [`NPC ${n.id} ${n.name}${n.subname ? ` <${n.subname}>` : ''}${n.min_level ? ` (level ${n.min_level}${n.max_level && n.max_level !== n.min_level ? `-${n.max_level}` : ''})` : ''}`];
  const w = where(db, 'npc', id);
  if (w) parts.push(`at ${w}`);
  const starts = db.prepare("SELECT q.name FROM quest q, json_each(q.starts, '$.npc') j WHERE j.value = ? LIMIT 3").all(id).map(r => r.name);
  const ends = db.prepare("SELECT q.name FROM quest q, json_each(q.ends, '$.npc') j WHERE j.value = ? LIMIT 3").all(id).map(r => r.name);
  if (starts.length) parts.push(`gives: ${starts.join(', ')}`);
  if (ends.length) parts.push(`takes: ${ends.join(', ')}`);
  return { kind: 'npc', id: n.id, name: n.name, text: parts.join('; '), source: n.source };
}

function itemWhere(db, id, limit = 4) {
  const rows = db.prepare('SELECT kind, id, chance FROM item_source WHERE item_id = ? ORDER BY chance DESC LIMIT ?').all(id, limit);
  return rows.map(r => {
    const n = nameOf(db, r.kind, r.id) || `${r.kind} ${r.id}`;
    const w = r.kind === 'npc' || r.kind === 'object' ? where(db, r.kind, r.id).split('; ')[0] : '';
    const verb = r.kind === 'vendor' ? 'sold by' : r.kind === 'quest' ? 'reward of' : 'drops from';
    return `${verb} ${n}${r.chance ? ` ${fmt(r.chance)}%` : ''}${w ? ` (${w})` : ''}`;
  }).join('; ');
}

function itemFact(db, id) {
  const it = db.prepare('SELECT * FROM item WHERE id = ?').get(id);
  if (!it) return null;
  const parts = [`Item ${it.id} ${it.name}${it.level ? ` (item level ${it.level})` : ''}${it.slot ? ` [${it.slot}]` : ''}`];
  const w = itemWhere(db, id);
  if (w) parts.push(w);
  return { kind: 'item', id: it.id, name: it.name, text: parts.join('; '), source: it.source };
}

function zoneFact(db, id) {
  const z = db.prepare('SELECT * FROM zone WHERE area_id = ?').get(id);
  if (!z) return null;
  return { kind: 'zone', id: z.area_id, name: z.name, text: `Zone ${z.name}${z.ui_map_id ? ` (map ${z.ui_map_id})` : ''}`, source: z.source };
}

/** The facts for one question. */
export function retrieve({ db, question, state = null, now = Date.now() } = {}) {
  const t0 = performance.now();
  const facts = [];
  const seen = new Set();
  const mineIds = new Set((Array.isArray(state?.quests) ? state.quests : []).map(q => q?.id).filter(Number.isInteger));
  const add = f => { if (f && !seen.has(`${f.kind}:${f.id}`) && facts.length < MAX_FACTS) { seen.add(`${f.kind}:${f.id}`); facts.push(f); } };
  for (const name of candidates(question, state)) {
    for (const hit of findByName(db, name, 3)) {
      // A quest in the player's log wins over a same-named one they can't have.
      if (hit.kind === 'quest') {
        const sameName = db.prepare("SELECT q.id FROM quest q JOIN name_index n ON n.kind = 'quest' AND n.id = q.id WHERE name_index MATCH ?").all(phrase(name)).map(r => r.id);
        const mine = sameName.find(id => mineIds.has(id));
        add(questFact(db, mine ?? hit.id, mine !== undefined));
      } else if (hit.kind === 'npc') add(npcFact(db, hit.id));
      else if (hit.kind === 'item') add(itemFact(db, hit.id));
      else if (hit.kind === 'zone') add(zoneFact(db, hit.id));
    }
  }
  const lines = facts.map(f => `[${f.source}] ${f.text}`);
  return { facts, lines, ms: Math.round((performance.now() - t0) * 10) / 10, at: now };
}
