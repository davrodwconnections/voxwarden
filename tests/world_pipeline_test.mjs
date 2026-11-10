import {test} from 'node:test';import assert from 'node:assert/strict';
import {sanitizeState} from '../bridge/byok/runtime/sanitize.mjs';
import {compactGame} from '../tools/brain/turn.mjs';
import {gameSections} from '../tools/voice/game.mjs';
const world={schema:1,map:1454,coverage:'partial',source:'fixture',omitted:0,candidates:[{kind:'turnin',id:2,questID:1,map:1454,x:50,y:60,name:'Quest giver',eligibility:'ready',reason:'ready quest in current log'}]};
test('world context excludes arbitrary identity and invalid coordinates',()=>{const s=sanitizeState({world:{...world,playerName:'PRIVATE',candidates:[...world.candidates,{...world.candidates[0],x:101}]}});assert.equal(s.world.playerName,undefined);assert.equal(s.world.candidates.length,1);});
test('nearby facts reach brain and location voice sections',()=>{assert.match(compactGame({loc:{zone:'Orgrimmar',map:1454},world}).join('\n'),/Quest giver/);assert.deepEqual(gameSections({ok:true,state:{world},ageSeconds:1},['location']).world,world);});

import {createRequire} from 'node:module';
const {newVM}=createRequire(import.meta.url)('./helpers/nqa-vm.js');
test('full addon gather and fitted JSON deliver nearby facts without removing quest identities',()=>{
 const v=newVM({skip:['WorldData.lua']}).login();
 v.run(`NS.WorldData={schema=1,metadata={source='fixture'},quest={['1']={name='Ready',ends={npc={2}}}},npc={['2']={name='Giver',friendly='H',npcFlags=16388}},byMap={['1454']={{1,2,50,50,1637}}}}; C_Map.GetBestMapForUnit=function() return 1454 end; C_Map.GetPlayerMapPosition=function() return {x=0.5,y=0.5} end; NS.QuestLog=function() return {{id=1,title='Ready',complete=true,level=10}},{count=1,max=40} end; UnitFactionGroup=function() return 'Horde' end; g=NS.Companion.Gather(); encoded=NS.Companion.Encode(g,{},1,1); fitted=NS.Companion.Fit(g,1,1,{qlog=true})`);
 const encoded=JSON.parse(v.evaluate('encoded'));const fitted=JSON.parse(v.evaluate('fitted'));assert.equal(encoded.world.candidates[0].kind,'turnin');assert.ok(fitted.quests.some(q=>q.id===1));assert.ok(fitted.world||fitted.omitted.includes('world'));assert.ok(Buffer.byteLength(v.evaluate('fitted'))<=3100);assert.match(compactGame(encoded).join('\n'),/Giver/);
});

import {refreshGame} from '../tools/voice/game.mjs';
test('stale voice snapshots request refresh, privacy off prevents requests',async()=>{let now=1000,calls=0,reads=0;const state=await refreshGame('unused',{clock:()=>now,sleep:async()=>{now+=100},request:()=>++calls,read:()=>++reads===1?{ok:true,stale:true,at:1,privacy:{gameContext:true}}:{ok:true,stale:false,at:1001,privacy:{gameContext:true}}});assert.equal(state.at,1001);assert.equal(calls,1);await refreshGame('unused',{request:()=>{throw Error('privacy bypass')},read:()=>({ok:false,privacy:{gameContext:false}})});});

test('refresh honors same-timestamp identity revocation and updated age on timeout',async()=>{let now=1000,reads=0;const game=await refreshGame('unused',{clock:()=>now,sleep:async()=>{now+=100},waitMs:200,request:()=>1,read:()=>++reads===1?{ok:true,stale:true,at:1,privacy:{gameContext:true,identity:true},state:{char:{name:'PRIVATE'}}}:{ok:true,stale:true,at:1,ageSeconds:now/1000,privacy:{gameContext:true,identity:false},state:{char:{}}}});assert.equal(game.state.char.name,undefined);assert.equal(game.privacy.identity,false);assert.equal(game.ageSeconds,1.2);});

test('explicit voice question can refresh a young snapshot after a new quest was accepted',async()=>{let now=1000,calls=0,reads=0;const game=await refreshGame('unused',{force:true,sections:['crafting'],clock:()=>now,sleep:async()=>{now+=100},request:(_dir,v)=>{calls++;assert.deepEqual(v.sections,['crafting']);return 1;},read:()=>++reads===1?{ok:true,stale:false,at:1,privacy:{gameContext:true},state:{quests:[]}}:{ok:true,stale:false,at:2,privacy:{gameContext:true},state:{quests:[{id:79192}]}}});assert.equal(calls,1);assert.equal(game.state.quests[0].id,79192);});
