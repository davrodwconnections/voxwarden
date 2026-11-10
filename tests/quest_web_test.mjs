import test from 'node:test';import assert from 'node:assert/strict';
import {openBrain} from '../tools/brain/db.mjs';
import {enrichQuestQuestion} from '../tools/brain/web.mjs';
const state={quests:[{id:79192,title:'Stepping Stones',complete:true}]};
test('requested web reference uses only live quest ids, caches source/date and never invents turn-in coordinates',async()=>{
 const db=openBrain(':memory:');let calls=0;
 try{
  const lookup=async(kind,id)=>{calls++;assert.equal(kind,'quest');assert.equal(id,79192);return {name:'Stepping Stones',text:'Read the note.'};};
  const h=[{role:'user',content:'Stepping Stones'}];
  const first=await enrichQuestQuestion({db,state,question:'busca donde la entrego',history:h,lookup});
  assert.equal(first.status,'available');assert.match(first.lines[0],/wowhead.*79192.*Read the note/);assert.equal(first.coordinatesAvailable,false);
  await enrichQuestQuestion({db,state,question:'busca online esa mision',history:h,lookup});assert.equal(calls,1);
  await enrichQuestQuestion({db,state:null,question:'busca quest 79192',lookup});assert.equal(calls,1,'no live data, no identifiers sent');
 }finally{db.close();}
});
test('web errors leave local facts usable and never mark a blocked read successful',async()=>{
 const db=openBrain(':memory:');try{
  const r=await enrichQuestQuestion({db,state,question:'busca esa mision',lookup:async()=>({error:'Wowhead answered 403'})});
  assert.equal(r.status,'unavailable');assert.deepEqual(r.lines,[]);assert.equal(r.attempted,1);
 }finally{db.close();}
});
