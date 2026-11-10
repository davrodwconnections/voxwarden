import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeCrafting} from '../tools/brain/crafting.mjs';
const q=copper=>({source:'auctionator',scope:'current-market',copper,ageDays:1});
const recipe={id:1,name:'Boots',output:10,min:2,max:3,unknown:false,difficulty:0,reagents:[{id:20,count:3,owned:50,quote:q(200)}],quote:q(500)};
const crafting={available:true,at:1000,profession:'Leatherworking',recipes:[recipe]};
test('gathered materials keep opportunity cost; output ranges produce pre-fee margin ranges',()=>{
 const [r]=analyzeCrafting(crafting,{now:1000_000});assert.equal(r.materialCost,600);assert.equal(r.marginMin,400);assert.equal(r.marginMax,900);assert.equal(r.saleGuaranteed,false);assert.equal(r.feesIncluded,false);
});
test('missing/stale prices, unknown ingredients and ancient captures never become numeric profits',()=>{
 for(const change of [{unknown:true},{reagents:[{id:20,count:3}]},{quote:{...q(500),ageDays:8}},{min:0}]){
  const [r]=analyzeCrafting({...crafting,recipes:[{...recipe,...change}]},{now:1000_000});assert.equal(r.marginMin,undefined);assert.equal(r.complete,false);
 }
 assert.equal(analyzeCrafting(crafting,{now:4000_000})[0].marginMin,undefined);
});
test('empty reagent lists and foreign quote provenance cannot imply free crafting',()=>{
 for(const change of [{reagents:[]},{quote:{...q(500),scope:'other-realm'}}])assert.equal(analyzeCrafting({...crafting,recipes:[{...recipe,...change}]},{now:1000_000})[0].complete,false);
});
