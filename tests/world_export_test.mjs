import {test} from 'node:test';
import assert from 'node:assert/strict';
import {lua, validPoint} from '../tools/brain/world-export.mjs';
test('safe inert Lua strings and deterministic keys',()=>{assert.equal(lua({b:1,a:'"\n'}),lua({a:'"\n',b:1}));assert.match(lua('\n'),/\\010/);assert.throws(()=>lua(NaN));});
test('coordinates reject sentinels and unsafe IDs',()=>{assert.equal(validPoint(1637,50,60),true);assert.equal(validPoint(1637,-1,-1),false);assert.equal(validPoint(0,50,60),false);});
import {openBrain} from '../tools/brain/db.mjs';
import {buildWorld} from '../tools/brain/world-export.mjs';
test('fixture joins map, quest giver and positions; excludes unknown variants',()=>{
 const d=openBrain(':memory:');
 d.exec("INSERT INTO quest(id,name,starts,raw,source,read_at) VALUES(1,'Test','{\"npc\":[2]}','{}','questiedb-1.0.13',0); INSERT INTO npc(id,name,raw,source,read_at) VALUES(2,'Giver','{}','questiedb-1.0.13',0),(3,'Conditional','{\"_conditionalFields\":[\"spawns\"]}','questiedb-1.0.13',0); INSERT INTO spawn(kind,id,area_id,x,y,source) VALUES('npc',2,1637,50,60,'questiedb-1.0.13'),('npc',3,1637,51,61,'questiedb-1.0.13'),('npc',2,1637,-1,-1,'questiedb-1.0.13');");
 const opts={mappingText:'[1637] = 1454, -- Orgrimmar',license:'Synthetic'};
 const a=buildWorld(d,opts),b=buildWorld(d,opts);
 assert.deepEqual(a,b);assert.equal(a.maps[1637],1454);
 assert.equal(a.quest[1].starts.npc[0],a.byMap[1454][0][1]);
 assert.equal(a.npc[3],undefined);assert.equal(a.counts.rejectedSpawns,2);
 d.close();
});

test('nested quest references reject unsafe IDs and malformed collections',()=>{
 for(const value of ['{"npc":[-2]}','{"npc":[1.5]}','{"npc":["2"]}','{"npc":"2"}','{"npc":[9007199254740992]}']){
  const d=openBrain(':memory:');
  try{
   d.prepare('INSERT INTO quest(id,name,starts,raw,source,read_at) VALUES(1,?,?,?,?,0)').run('Unsafe',value,'{}','questiedb-1.0.13');
   assert.throws(()=>buildWorld(d,{mappingText:'[1637] = 1454,',license:'Synthetic'}),/quest reference/);
  }finally{d.close();}
 }
});

import {newLuaVM} from './helpers/luavm.mjs';
test('generated table executes as inert Lua with exact string and reference values',()=>{
 const vm=newLuaVM();const value={name:'"; error("injected") --\n\0',links:{npc:[2]},map:1454};
 vm.run('WORLD='+lua(value));assert.deepEqual(vm.global('WORLD'),value);
});
