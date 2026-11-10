import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const {newVM}=createRequire(import.meta.url)('./helpers/nqa-vm.js');
test('goals stay per character, refuse credentials, and respect list-only privacy',()=>{
 const v=newVM().login();v.run(`assert(NS.HelperPanel.SetGoal('Level Leatherworking'));assert(not NS.HelperPanel.SetGoal('sk-proj-'..string.rep('A',100)));NS.Companion.Caps=function() return {xctx=true} end;NS.Companion.DesktopOn=function()return true end;NS.db.settings.context=true;full=NS.Companion.Encode(NS.Companion.Gather(),{},1,1);private=NS.Companion.Encode(NS.Companion.ListOnlyOf(NS.Companion.Gather()),{},2,2)`);
 assert.match(v.evaluate('full'),/Level Leatherworking/);
 // List-only retains the basic character object; goals are additional context.
 assert.doesNotMatch(v.evaluate('private'),/Level Leatherworking/);
 v.run(`UnitName=function()return 'Other' end`);assert.equal(v.num('#NS.HelperPanel.Goals()'),0);
});
test('helper panel opens on first click, reads no restricted data in combat, and closes',()=>{
 const v=newVM().login();v.run('NS.HelperPanel.Toggle()');assert.equal(v.bool('VoxwardenHelperPanel:IsShown()'),true);
 v.run('NS.HelperPanel.Toggle()');assert.equal(v.bool('VoxwardenHelperPanel:IsShown()'),false);
 v.run('STUB.combat=true; GetNumSpellTabs=function()error("restricted read")end; NS.HelperPanel.Toggle()');assert.match(v.json('NS.HelperPanel.Lines()').join('\n'),/In combat/);
});
test('reminders create no background ticker while disabled and cancel it when turned off',()=>{
 const v=newVM().login();v.run(`STUB.helperTimers=0;C_Timer.NewTicker=function()STUB.helperTimers=STUB.helperTimers+1;return {Cancel=function()STUB.helperCancelled=true end} end;NS.HelperPanel.Reminders(false)`);
 assert.equal(v.num('STUB.helperTimers'),0);v.run('NS.HelperPanel.Reminders(true)');assert.equal(v.num('STUB.helperTimers'),1);
 v.run('NS.HelperPanel.Reminders(false)');assert.equal(v.bool('STUB.helperCancelled'),true);
});
