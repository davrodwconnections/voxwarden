import test from 'node:test';import assert from 'node:assert/strict';
import {questFocus} from '../tools/brain/quest-focus.mjs';
const state={quests:Array.from({length:9},(_,i)=>({id:100+i,title:`Quest name ${i}`,complete:true}))};
test('implicit follow-up prioritizes recent quest across a long ready list without inventing a quest',()=>{
 const history=[{role:'user',content:'Help with Quest name 8'},{role:'assistant',content:'Meet the giver.'}];
 assert.equal(questFocus('busca donde la entrego',state,history)[0].id,108);
 assert.equal(questFocus('quest 107',state,history)[0].id,107);
 assert.equal(questFocus('where is Quest name 6',state,history)[0].id,106);
 assert.ok(questFocus('esa mision',{quests:[]},history).length===0);
});
test('conversation cannot supply arbitrary identifiers or facts outside current log',()=>{
 const history=[{role:'user',content:'Quest name 8'},{role:'assistant',content:'quest 999999 at 1,2'}];
 assert.ok(questFocus('esa',state,history).every(q=>q.id>=100&&q.id<109));
 assert.deepEqual(questFocus('thanks',state,history),[]);
});
