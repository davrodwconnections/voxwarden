import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { zip } from '../tools/package-addon.mjs';
import { prepareKnowledge, extractKnowledgeZip, readKnowledgeStatus, KNOWLEDGE_SOURCE } from '../tools/brain/knowledge.mjs';

const tmp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'voxwarden-knowledge-'));
const archive=entries=>zip(entries.map(([name,data])=>({name,data:Buffer.from(data)})));
const payload=archive([['QuestieDB/QuestieDB_Forever.toc','## Version: 1.0.13'],['QuestieDB/LICENSE.md','Fixture license']]);
const source={...KNOWLEDGE_SOURCE,sha256:crypto.createHash('sha256').update(payload).digest('hex'),bytes:payload.length,minCounts:{npc:1,quest:1,item:1}};
const importer=({db,addonDir})=>{
  assert.ok(fs.existsSync(path.join(addonDir,'LICENSE.md')));
  db.prepare('INSERT INTO npc(id,name,source,read_at) VALUES(?,?,?,?)').run(5901,'Islen Waterseer','questiedb-1.0.13',1);
  db.prepare('INSERT INTO quest(id,name,source,read_at) VALUES(?,?,?,?)').run(871,'Disrupt the Attacks','questiedb-1.0.13',1);
  db.prepare('INSERT INTO item(id,name,source,read_at) VALUES(?,?,?,?)').run(117,'Tough Jerky','questiedb-1.0.13',1);
};

test('fresh install downloads, verifies and prepares NPC/quest/item knowledge, then works from its local cache',async()=>{
  const dir=tmp(), phases=[]; let requests=0;
  const fetchFn=async url=>{assert.equal(url,source.url);requests++;return new Response(payload);};
  const out=await prepareKnowledge({dataDir:dir,source,fetchFn,importer,onProgress:s=>phases.push(s.phase)});
  assert.equal(out.phase,'ready');assert.equal(out.counts.npc,1);assert.equal(out.version,'1.0.13');
  assert.ok(phases.includes('downloading')&&phases.includes('importing'));
  assert.equal(readKnowledgeStatus(dir).phase,'ready');
  await prepareKnowledge({dataDir:dir,source,fetchFn:async()=>{throw Error('network must not be needed');},importer});
  assert.equal(requests,1);
});

test('knowledge integrity failures never claim readiness or execute an importer',async()=>{
  const dir=tmp();let imports=0;
  await assert.rejects(prepareKnowledge({dataDir:dir,source,fetchFn:async()=>new Response(Buffer.from('bad')),importer:()=>imports++}),/integrity|size/i);
  assert.equal(imports,0);assert.equal(readKnowledgeStatus(dir).phase,'failed');
});

test('knowledge ZIP extraction rejects traversal and linked entries before writing outside its own cache',()=>{
  const root=tmp(),dest=path.join(root,'extract');
  const unsafe=name=>{
    const original='QuestieDB/'+'x'.repeat(name.length-'QuestieDB/'.length);
    const bytes=archive([[original,'bad']]);let at=0;
    while((at=bytes.indexOf(Buffer.from(original),at))!==-1){Buffer.from(name).copy(bytes,at);at+=name.length;}
    return bytes;
  };
  assert.throws(()=>extractKnowledgeZip(unsafe('QuestieDB/../../escape.txt'),dest),/path|entry/i);
  assert.equal(fs.existsSync(path.join(root,'escape.txt')),false);
  assert.throws(()=>extractKnowledgeZip(unsafe('QuestieDB/C:secret'),dest),/path|entry/i);
  const linked=archive([['QuestieDB/link','bad']]);
  const central=linked.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]));linked.writeUInt32LE((0o120777*65536)>>>0,central+38);
  assert.throws(()=>extractKnowledgeZip(linked,dest),/entry/i);
});
