// The companion's brain (odd/tasks/nqa-brain.md B4-B7): the store, retrieval by name with sources,
// and the brain turn's request (compact prompt, compact game data, sourced facts, identity out).
import test from 'node:test';
import assert from 'node:assert/strict';
import { openBrain, upsertSource } from '../tools/brain/db.mjs';
import { retrieve, candidates, MAX_FACTS } from '../tools/brain/retrieve.mjs';
import { brainRequest, compactGame, BRAIN_MAX_TOKENS } from '../tools/brain/turn.mjs';

const SRC = 'questiedb-test';
function seed() {
  const db = openBrain(':memory:');
  const now = Date.now();
  const q = db.prepare('INSERT INTO quest (id, name, level, req_level, starts, ends, objectives_text, objectives, pre_quests, next_quest, source, read_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
  q.run(1536, 'Call of Water', 20, 20, JSON.stringify({ npc: [5900] }), JSON.stringify({ npc: [5900] }), 'Fill the waterskin.', JSON.stringify([null, [[148499, 'Water']], null]), null, 1534, SRC, now);
  q.run(9999, 'Call of Water', 20, 20, JSON.stringify({ npc: [5901] }), JSON.stringify({ npc: [5901] }), null, null, null, null, SRC, now);
  q.run(1486, 'Deviate Hides', 18, 17, JSON.stringify({ npc: [5767] }), JSON.stringify({ npc: [5767] }), 'Bring 20 Deviate Hides.', JSON.stringify([null, null, [[6443, 'Deviate Hide']]]), null, null, SRC, now);
  const n = db.prepare('INSERT INTO npc (id, name, subname, min_level, max_level, zone_area, source, read_at) VALUES (?,?,?,?,?,?,?,?)');
  n.run(5900, 'Brine', 'Shaman Trainer', 30, 30, 17, SRC, now);
  n.run(5901, 'Islen Waterseer', null, 30, 30, 1638, SRC, now);
  n.run(5767, 'Nalpak', null, 25, 25, 17, SRC, now);
  n.run(3636, 'Deviate Ravager', null, 18, 19, 718, SRC, now);
  db.prepare('INSERT INTO object (id, name, zone_area, source, read_at) VALUES (?,?,?,?,?)').run(148499, 'Pool of Water', 17, SRC, now);
  db.prepare('INSERT INTO item (id, name, quality, level, slot, source, read_at) VALUES (?,?,?,?,?,?,?)').run(6443, 'Deviate Hide', 1, 18, null, SRC, now);
  const sp = db.prepare('INSERT INTO spawn (kind, id, area_id, x, y, source) VALUES (?,?,?,?,?,?)');
  sp.run('npc', 5901, 1638, 22.5, 20.9, SRC); sp.run('npc', 5767, 17, 46.0, 36.2, SRC); sp.run('npc', 3636, 718, 50, 50, SRC); sp.run('object', 148499, 17, 51.1, 31.4, SRC);
  const z = db.prepare('INSERT INTO zone (area_id, name, ui_map_id, source) VALUES (?,?,?,?)');
  z.run(1638, 'Thunder Bluff', 1456, SRC); z.run(17, 'The Barrens', 1413, SRC); z.run(718, 'Wailing Caverns', 279, SRC);
  db.prepare('INSERT INTO item_source (item_id, kind, id, chance, source) VALUES (?,?,?,?,?)').run(6443, 'npc', 3636, 38.5, SRC);
  const ni = db.prepare('INSERT INTO name_index (name, kind, id) VALUES (?,?,?)');
  for (const [name, kind, id] of [['Call of Water', 'quest', 1536], ['Call of Water', 'quest', 9999], ['Deviate Hides', 'quest', 1486], ['Brine', 'npc', 5900],
    ['Islen Waterseer', 'npc', 5901], ['Nalpak', 'npc', 5767], ['Deviate Ravager', 'npc', 3636], ['Deviate Hide', 'item', 6443], ['Thunder Bluff', 'zone', 1638],
    ['The Barrens', 'zone', 17], ['Wailing Caverns', 'zone', 718]]) ni.run(name, kind, id);
  upsertSource(db, SRC, { version: 'test' });
  return db;
}
const STATE = {
  v: 1, char: { name: 'Arystar', realm: 'CAMWOW', class: 'SHAMAN', race: 'Orc', level: 22, money: 49600, xp: 8700, xpMax: 27300 },
  loc: { zone: 'Thunder Bluff', map: 1456, x: 64.9, y: 37.5 }, rested: 212,
  quests: [{ id: 1536, title: 'Call of Water', complete: false, obj: [{ have: 0, need: 1 }] }, { id: 1486, title: 'Deviate Hides', complete: false, obj: [{ have: 8, need: 20 }] }],
  gear: [{ slot: 5, id: 15304, ilvl: 16 }],
};

test('brain: candidates are the names a question is about, not its Spanish words', () => {
  assert.deepEqual(candidates('¿Dónde está Islen Waterseer?', null), ['Islen Waterseer']);
  assert.ok(candidates('¿Qué mecánicas tiene Mutanus the Devourer?', null).includes('Mutanus the Devourer'));
  assert.ok(candidates('como llego a la entrega de call of water', STATE).includes('Call of Water'), 'a quest title from the log, any case');
});

test('brain: retrieval finds an NPC with where it stands and what it gives, each line with its source, fast', () => {
  const db = seed();
  const r = retrieve({ db, question: '¿Dónde está Islen Waterseer?', state: STATE });
  assert.equal(r.facts[0].kind, 'npc');
  assert.match(r.lines[0], /^\[questiedb-test\] NPC 5901 Islen Waterseer/);
  assert.match(r.lines[0], /Thunder Bluff 22\.5,20\.9 \(map 1456\)/);
  assert.match(r.lines[0], /gives: Call of Water/);
  assert.ok(r.ms < 100, `${r.ms} ms`);
});

test('brain: a quest in the log wins over another with the same name, with giver, turn-in, objective spots and the next step', () => {
  const db = seed();
  const r = retrieve({ db, question: '¿Dónde está el siguiente paso de Call of Water?', state: STATE });
  const q = r.facts.find(f => f.kind === 'quest');
  assert.equal(q.id, 1536, 'the one in the log');
  assert.match(q.text, /given by Brine/);
  assert.match(q.text, /objectives: Pool of Water: The Barrens 51\.1,31\.4 \(map 1413\)/);
  assert.match(q.text, /\(in your log\)/);
  const items = retrieve({ db, question: '¿Dónde están los Deviate Hides que me faltan?', state: STATE }).facts.find(f => f.kind === 'quest');
  assert.match(items.text, /Deviate Hide: drops from Deviate Ravager 38\.5% \(Wailing Caverns 50\.0,50\.0 \(map 279\)\)/);
});

test('brain: nothing found is said, words from the player can\'t become an FTS query, and the list is bounded', () => {
  const db = seed();
  assert.deepEqual(retrieve({ db, question: '¿Qué hago con Zzyzx Unknown?', state: STATE }).facts, []);
  assert.doesNotThrow(() => retrieve({ db, question: 'Islen" OR name:* NEAR(x) "Waterseer', state: STATE }));
  assert.ok(MAX_FACTS <= 20);
});

test('brain: the turn has the compact prompt, game data without identity, the facts, short replies', async () => {
  const db = seed();
  const r = await brainRequest({ db, question: '¿Dónde está Islen Waterseer?', state: STATE, history: [{ role: 'user', content: 'hola' }, { role: 'assistant', content: '¡Hola!' }] });
  assert.equal(r.maxTokens, BRAIN_MAX_TOKENS);
  assert.equal(r.messages[0].role, 'system');
  assert.match(r.messages[0].content, /Never make up names, places, coordinates/);
  assert.match(r.messages[0].content, /one to three sentences/);
  const user = r.messages.at(-1).content;
  assert.match(user, /GAME DATA[\s\S]*level 22 Orc SHAMAN/);
  assert.match(user, /FACTS[\s\S]*Islen Waterseer/);
  assert.doesNotMatch(user, /Arystar|CAMWOW/, 'no name or realm');
  assert.equal(r.messages.length, 4, 'system, two turns of history, the question');
  assert.equal(r.meta.facts, 1);
  const empty = await brainRequest({ db, question: 'hola', state: null });
  assert.match(empty.messages.at(-1).content, /nothing found for this question/);
});

test('brain: compact game data names gear from the item table when the strip sent ids only', () => {
  const db = seed();
  db.prepare('INSERT INTO item (id, name, source, read_at) VALUES (?,?,?,?)').run(15304, 'Grizzly Jerkin', SRC, Date.now());
  assert.ok(compactGame(STATE, db).some(l => l.includes('chest Grizzly Jerkin (16)')));
  assert.ok(compactGame(STATE).some(l => l.includes('chest item 15304')));
});
