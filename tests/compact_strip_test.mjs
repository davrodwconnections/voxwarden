import test from 'node:test';import assert from 'node:assert/strict';import{createRequire}from'node:module';
import{findAndDecode}from'../bridge/transport/strip.mjs';
import{encodeWithCodec,renderRgb}from'./byok/helpers/strip-fixtures.mjs';
const{newVM}=createRequire(import.meta.url)('./helpers/nqa-vm.js');
test('compact strip defaults to three pixels; changing size repositions existing cells and preserves wire bytes',()=>{
 const v=newVM().login();v.send('A compact strip question');const before=v.strip();assert.ok(before);
 assert.equal(v.num('NS.Transport.StripCellSize()'),3);assert.equal(v.num('NQAStrip:GetWidth()'),600);
 assert.equal(v.num('NQAStrip.textures[2].x'),3);
 v.slash('strip standard');assert.equal(v.num('NS.Transport.StripCellSize()'),4);assert.equal(v.num('NQAStrip:GetWidth()'),800);assert.equal(v.num('NQAStrip.textures[2].x'),4);assert.equal(v.strip().payload,before.payload);
 v.slash('strip compact');assert.equal(v.num('NQAStrip:GetWidth()'),600);assert.equal(v.num('NQAStrip.textures[2].width'),3);assert.equal(v.strip().payload,before.payload);
});
test('size choice persists across reload and screenshot geometry remains independent',()=>{
 const v=newVM().login();v.slash('strip standard');const r=newVM({db:'NQADB='+v.saved()}).login();r.send('Reloaded');assert.equal(r.num('NS.Transport.StripCellSize()'),4);assert.equal(r.num('NQAStrip:GetWidth()'),800);
});
test('existing pitch-search JS reader decodes compact and standard strips with the same payload',()=>{
 const text='2\x1fcurrent game context: misión ✓';const cells=encodeWithCodec('Voxwarden',73,text);
 for(const pitch of[3,4]){const image=renderRgb(cells,{pitch,width:1000,height:240});const r=findAndDecode({...image,data:image.rgb,channels:3});assert.equal(r.kind,'decoded');assert.equal(r.text,text);}
});
test('temporary visual adjustment is idempotent for an existing standard strip and does not save a preference',()=>{
 const v=newVM().login();v.slash('strip standard');v.send('Temporary visual adjustment');v.run('function GetPhysicalScreenSize()return 1920,1080 end');
 const adjust='local s=NQAStrip;if s and GetPhysicalScreenSize then local _,h=GetPhysicalScreenSize();if h and h>0 then s:SetScale(768/h*600/s:GetWidth()) end end';
 v.run(adjust);const scale=v.num('NQAStrip:GetScale()');assert.ok(Math.abs(v.num('NQAStrip:GetWidth()')*scale/(768/1080)-600)<1e-8);
 v.run(adjust);assert.equal(v.num('NQAStrip:GetScale()'),scale);assert.equal(v.evaluate('NS.db.settings.stripSize'),'standard');
});
