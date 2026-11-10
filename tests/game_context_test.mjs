import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {sanitizeState} from '../bridge/byok/runtime/sanitize.mjs';
import {compactGame} from '../tools/brain/turn.mjs';
import {gameSections} from '../tools/voice/game.mjs';
const {newVM}=createRequire(import.meta.url)('./helpers/nqa-vm.js');
const fixture=`
 C_TradeSkillUI={IsTradeSkillReady=function() return true end,
 IsTradeSkillLinked=function() return STUB.foreign or false end,
 GetBaseProfessionInfo=function() return {professionName='Leatherworking',professionID=165,skillLevel=82,maxSkillLevel=150} end,
 GetFilteredRecipeIDs=function() return {100,101,102} end,
 GetRecipeInfo=function(id) return {recipeID=id,name='Recipe '..id,learned=id~=102,relativeDifficulty=id==100 and 0 or 3,numSkillUps=1} end,
 GetRecipeSchematic=function(id) return {recipeType=1,outputItemID=id+1000,quantityMin=2,quantityMax=2,reagentSlotSchematics={{reagents={{itemID=2318}},quantityRequired=3,required=true,dataSlotType=1}}} end,
 GetCraftableCount=function() return 1 end}
 IsPlayerSpell=function() return true end
 Auctionator={API={v1={GetAuctionPriceByItemID=function(_,id) return id==2318 and 200 or 500 end,GetAuctionAgeByItemID=function() return 1 end}}}
 C_Container={GetContainerNumSlots=function(b) return (b==0 or b==-1) and 1 or 0 end,
 GetContainerItemInfo=function(b) return {itemID=b==-1 and 777 or 2318,stackCount=4} end}
 C_Item.GetItemInfo=function(id) return 'Item '..id end
 C_Item.GetItemCount=function() return 4 end
 UnitHealth=function() return 300 end; UnitHealthMax=function() return 500 end
 UnitPower=function() return 70 end; UnitPowerMax=function() return 100 end
 UnitPowerType=function() return 0,'MANA' end
 GetNumSpellTabs=function() return 1 end
 GetSpellTabInfo=function() return 'Skills',nil,0,2 end
 GetSpellBookItemInfo=function(i) return 'SPELL',i+900 end
 GetSpellBookItemName=function(i) return 'Spell '..i,'Rank 2' end
`;
function read(v){return JSON.parse(v.evaluate('NS.Companion.JSON.encode(NS.GameContext.Snapshot())'));}
function player(){const v=newVM({extra:fixture}).login();v.run('STUB.FireEvent("TRADE_SKILL_SHOW")');return v;}
test('learned recipes carry reagents, output counts and current-market price ages; foreign recipes never replace own capture',()=>{
 const v=player(); const s=read(v);
 assert.equal(s.crafting.profession,'Leatherworking');assert.equal(s.crafting.filtered,true);
 assert.deepEqual(s.crafting.recipes.map(r=>r.id),[100,101]);
 assert.equal(s.crafting.recipes[0].reagents[0].count,3);
 assert.equal(s.crafting.recipes[0].reagents[0].quote.copper,200);
 assert.equal(s.crafting.recipes[0].quote.ageDays,1);
 assert.equal(s.crafting.recipes[0].min,2);
 v.run('STUB.foreign=true');v.advance(16);
 const foreign=read(v);assert.equal(foreign.crafting.at,s.crafting.at);assert.equal(foreign.crafting.open,false);
});
test('bank snapshots require personal bank interaction and keep original capture time after closing',()=>{
 const v=player();assert.equal(read(v).bank.available,false);
 v.run('STUB.FireEvent("BANKFRAME_OPENED")');const before=read(v).bank;
 assert.equal(before.items[0].id,777);assert.equal(before.open,true);
 v.run('STUB.FireEvent("BANKFRAME_CLOSED")');v.advance(40);const after=read(v).bank;
 assert.equal(after.at,before.at);assert.equal(after.open,false);assert.equal(after.items[0].id,777);
});
test('combat context excludes restricted reads; spellbook and inventory are bounded and omit identities',()=>{
 const v=player();const s=read(v);
 assert.equal(s.status.health,300);assert.equal(s.inventory.items[0].count,4);
 assert.equal(s.spells.items[0].id,901);
 v.run('STUB.combat=true; UnitHealth=function() error("combat read") end; C_TradeSkillUI.GetFilteredRecipeIDs=function() error("combat recipe read") end');
 const combat=read(v);assert.equal(combat.status.combat,true);assert.equal(combat.crafting,undefined);
});
test('learned talent ranks reach the same spell context without changing the talent UI',()=>{
 const v=player();v.run(`GetNumTalentTabs=function()return 1 end;GetNumTalents=function()return 2 end;GetTalentInfo=function(_,i)return 'Talent '..i,nil,1,i,i==1 and 3 or 0,5 end;STUB.FireEvent('SPELLS_CHANGED')`);
 const s=read(v);assert.equal(s.spells.talents.length,1);assert.equal(s.spells.talents[0].name,'Talent 1');assert.equal(s.spells.talents[0].rank,3);
 assert.equal(sanitizeState(s).spells.talents[0].max,5);
});
test('recipe schemas remove identity and malformed quantities; compact brain and voice expose new sections',()=>{
 const v=player();const raw=read(v);raw.crafting.playerName='PRIVATE';raw.crafting.recipes[0].reagents.push({id:9,count:-2});
 const s=sanitizeState(raw);assert.equal(s.crafting.playerName,undefined);assert.equal(s.crafting.recipes[0].reagents.length,1);assert.equal(s.crafting.recipes[0].unknown,true,'invalid required materials cannot silently reduce the cost');
 const lines=compactGame(s).join('\n');assert.match(lines,/Leatherworking/);assert.match(lines,/Recipe 100/);assert.match(lines,/before fees/);
 assert.equal(gameSections({ok:true,state:s,ageSeconds:1},['crafting','bank','spells']).crafting.recipes[0].id,100);
});
test('new context participates in real addon encode/fit, keeps every quest id and respects privacy list-only mode',()=>{
 const v=player();v.run(`NS.Companion.DesktopOn=function() return true end; NS.Companion.Caps=function() return {xctx=true} end; NS.db.settings.context=true; g=NS.Companion.Gather(); all=NS.Companion.Encode(g,{},1,1); fitted=NS.Companion.Fit(g,1,1,{qlog=true,z=true}); private=NS.Companion.Encode(NS.Companion.ListOnlyOf(g),{},2,2)`);
 const full=JSON.parse(v.evaluate('all'));assert.equal(full.crafting.recipes[0].id,100);
 const fit=JSON.parse(v.evaluate('fitted'));assert.deepEqual(fit.quests.map(q=>q.id),full.quests.map(q=>q.id));assert.ok(Buffer.byteLength(v.evaluate('fitted'))<=12000);
 const priv=JSON.parse(v.evaluate('private'));for(const k of ['crafting','bank','spells','inventory','status']) assert.equal(priv[k],undefined);
});
