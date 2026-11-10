import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {openBrain} from './db.mjs';
import {loadSupplements} from './world-supplements.mjs';
const id=n=>Number.isSafeInteger(n)&&n>0;
export const validPoint=(area,x,y)=>id(area)&&Number.isFinite(x)&&Number.isFinite(y)&&x>=0&&x<=100&&y>=0&&y<=100;
export function lua(v) {
  if(v==null)return 'nil';
  if(typeof v==='string')return '"'+v.replace(/[\\"\x00-\x1f\x7f]/g,c=>c==='\\'?'\\\\':c==='"'?'\\"':'\\'+String(c.charCodeAt(0)).padStart(3,'0'))+'"';
  if(typeof v==='number'){if(!Number.isFinite(v)||Math.abs(v)>Number.MAX_SAFE_INTEGER)throw Error('Unsafe number');return String(v);}
  if(typeof v==='boolean')return String(v);
  if(Array.isArray(v))return '{'+v.map(lua).join(',')+'}';
  if(typeof v==='object')return '{'+Object.keys(v).sort().map(k=>'['+lua(k)+']='+lua(v[k])).join(',')+'}';
  throw Error('Unsupported value');
}
function references(value, fields) {
  if (value == null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid quest reference collection');
  for (const [key, ids] of Object.entries(value)) {
    if (!fields.includes(key) || (ids != null && (!Array.isArray(ids) || ids.some(n => !id(n))))) throw Error('Invalid quest reference IDs');
  }
  return value;
}
const hash=s=>createHash('sha256').update(s).digest('hex');
export function buildWorld(db,{mappingText,license,version='1.0.13',client='Forever 1.60.1.70862'}){
  const mappings={};
  // Only explicit positive numeric assignments. Legacy/synthetic/dungeon aliases are unsafe.
  for(const line of mappingText.split(/\r?\n/)){
    const m=/^\s*\[(\d+)\]\s*=\s*(\d+),/.exec(line);
    if(m&&id(+m[1])&&id(+m[2])&&!/Legacy|Synthetic|dungeon|consumer|suppression/i.test(line))mappings[m[1]]=+m[2];
  }
  const out={schema:1,metadata:{source:'questiedb-1.0.13',version,client,license,licenseHash:hash(license),mappingHash:hash(mappingText),redistribution:'LOCAL ONLY; review per-file licenses before redistribution',availability:'unknown; conditional entities excluded'},maps:mappings,quest:{},npc:{},object:{},byMap:{},counts:{excludedConditional:0,excludedUnsupportedPrerequisites:0,rejectedSpawns:0}};
  const conditional=new Set(db.prepare('SELECT kind,id FROM questie_variant').all().map(r=>r.kind+':'+r.id));
  for(const kind of ['quest','npc','object']){
    for(const r of db.prepare('SELECT * FROM '+kind+' ORDER BY id').all()){
      if(r.source!=='questiedb-1.0.13'||!id(r.id))continue;
      const raw=JSON.parse(r.raw||'{}');
      if(conditional.has(kind+':'+r.id)||raw._conditionalFields?.length){out.counts.excludedConditional++;continue;}
      const record={name:r.name};
      if(kind==='quest'){
        for(const key of ['level','req_level','races','classes','next_quest'])if(r[key]!=null){if(!Number.isSafeInteger(r[key]))throw Error('Invalid quest numeric field');record[key]=r[key];}
        for(const key of ['starts','ends'])record[key]=references(JSON.parse(r[key]||'null'),['npc','object','item']);
        try { record.pre_quests=references(JSON.parse(r.pre_quests||'null'),['group','single']); }
        catch { out.counts.excludedUnsupportedPrerequisites++; continue; }
        // Other source conditions remain inert, never an availability decision.
        try { record.conditions=references({exclusiveTo:raw.exclusiveTo,preQuestGroup:raw.preQuestGroup,preQuestSingle:raw.preQuestSingle},['exclusiveTo','preQuestGroup','preQuestSingle']); }
        catch { out.counts.excludedUnsupportedPrerequisites++; continue; }
      }else{
        record.subname=r.subname??null;record.friendly=r.friendly??null;
        if(raw.npcFlags!=null){if(!Number.isSafeInteger(raw.npcFlags)||raw.npcFlags<0)throw Error('Invalid flags');record.npcFlags=raw.npcFlags;}
      }
      out[kind][r.id]=record;
    }
  }
  for(const r of db.prepare('SELECT kind,id,area_id,x,y FROM spawn ORDER BY area_id,kind,id,x,y').all()){
    if(!out[r.kind]?.[r.id]||!mappings[r.area_id]||!validPoint(r.area_id,r.x,r.y)){out.counts.rejectedSpawns++;continue;}
    const map=mappings[r.area_id];
    (out.byMap[map]??=[]).push([r.kind==='npc'?1:2,r.id,r.x,r.y,r.area_id]);
  }
  out.metadata.contentHash=hash(JSON.stringify(out));
  return out;
}
export function exportWorld({brain,addonDir,output,maxBytes=32*1024*1024}){
  const target=path.resolve(output);
  if(target!==path.resolve('addon/Voxwarden/WorldData.lua'))throw Error('Output must be source addon/Voxwarden/WorldData.lua');
  const db=openBrain(brain,{readOnly:true});
  let data;
  db.exec('BEGIN');
  try{data=buildWorld(db,{mappingText:fs.readFileSync(path.join(addonDir,'support/Forever/Zones/areaIdToUiMapId.lua'),'utf8'),license:fs.readFileSync(path.join(addonDir,'LICENSE.md'),'utf8')});data.supplements=loadSupplements(path.dirname(addonDir),db);delete data.metadata.contentHash;data.metadata.contentHash=hash(JSON.stringify(data));}finally{db.exec('ROLLBACK');db.close();}
  const text='-- Generated local-only inert world data. No runtime source dependency.\nlocal _, ns = ...; ns.WorldData = '+lua(data)+'\n';
  const bytes=Buffer.byteLength(text);if(bytes>maxBytes)throw Error('Output exceeds byte budget');
  fs.writeFileSync(target,text);
  return {bytes,quests:Object.keys(data.quest).length,npcs:Object.keys(data.npc).length,objects:Object.keys(data.object).length,spawns:Object.values(data.byMap).reduce((n,a)=>n+a.length,0),orgrimmar:data.byMap[1454]?.length??0,...data.counts,hash:data.metadata.contentHash};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [brain,addonDir,output]=process.argv.slice(2);
 console.log(JSON.stringify(exportWorld({brain,addonDir,output}),null,2));
}
