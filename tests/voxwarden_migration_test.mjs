import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { migrateVoxwarden } from '../tools/migrate-voxwarden.mjs';
function setup() {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'voxwarden-migration-'));
  const o={flavorDir:path.join(dir,'game'),fromData:path.join(dir,'old'),toData:path.join(dir,'new'),backupDir:path.join(dir,'backup')};
  for(const folder of [o.fromData,path.join(o.flavorDir,'Interface','AddOns','NeverQuestAlone'),path.join(o.flavorDir,'WTF','Account','test','SavedVariables')]) fs.mkdirSync(folder,{recursive:true});
  fs.writeFileSync(path.join(o.fromData,'config.json'),JSON.stringify({byok:{provider:'custom',model:'claude-code:sonnet'}}));
  fs.mkdirSync(path.join(o.fromData,'brain'));fs.writeFileSync(path.join(o.fromData,'brain','brain.sqlite'),'test database');
  fs.writeFileSync(path.join(o.flavorDir,'WTF','Account','test','SavedVariables','NeverQuestAlone.lua'),'NQADB = { history = "kept" }');
  return o;
}
test('Voxwarden migration previews without writing; apply preserves source data and saved variables and backs up the old addon',()=>{
  const o=setup();
  assert.equal(migrateVoxwarden(o).applied,false);assert.equal(fs.existsSync(o.toData),false);
  assert.equal(migrateVoxwarden({...o,apply:true}).applied,true);
  assert.equal(fs.readFileSync(path.join(o.toData,'brain','brain.sqlite'),'utf8'),'test database');
  assert.equal(fs.readFileSync(path.join(o.fromData,'brain','brain.sqlite'),'utf8'),'test database');
  const varsDir=path.join(o.flavorDir,'WTF','Account','test','SavedVariables');
  assert.equal(fs.readFileSync(path.join(varsDir,'NeverQuestAlone.lua'),'utf8'),fs.readFileSync(path.join(varsDir,'Voxwarden.lua'),'utf8'));
  assert.ok(fs.existsSync(path.join(o.backupDir,'NeverQuestAlone')));
  assert.equal(fs.existsSync(path.join(o.flavorDir,'Interface','AddOns','NeverQuestAlone')),false);
  assert.throws(()=>migrateVoxwarden({...o,apply:true}),/already exists/);
});
test('Voxwarden migration refuses a running app, overlapping paths or an existing destination before writing',()=>{
  const o=setup();
  assert.throws(()=>migrateVoxwarden({...o,apply:true,running:true}),/Close WoW/);
  assert.throws(()=>migrateVoxwarden({...o,apply:true,toData:path.join(o.fromData,'nested')}),/overlap/);
  fs.mkdirSync(o.toData);assert.throws(()=>migrateVoxwarden({...o,apply:true}),/already exists/);
  assert.equal(fs.existsSync(o.backupDir),false);
});
