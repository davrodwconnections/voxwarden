// Offline literal extraction: never execute third-party addon code.
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
const digest=s=>createHash('sha256').update(s).digest('hex');
export function parseShaman(text){
 if(digest(text)!=='ce81ebba15b201d5f9e44c2fb1a86a72c2be9893849a07e24f2c5fa9069126a5')throw Error('Unreviewed Shaman source; inspect before export');
 let level=null;const spells=[];
 for(const line of text.split(/\r?\n/)){
  if(/^\s*--/.test(line))continue;
  const group=/^\s*\[(\d+)\]\s*=/.exec(line);if(group)level=Number(group[1]);
  if(!level||level>100)continue;
  const re=/\{\s*id\s*=\s*(\d+)\s*,\s*cost\s*=\s*(\d+)(?:\s*,\s*requiredIds\s*=\s*\{([\d,\s]+)\})?\s*\}/g;
  for(const m of line.matchAll(re)){
   const spell=Number(m[1]),cost=Number(m[2]),requires=m[3]?m[3].split(',').map(s=>Number(s.trim())).filter(Boolean):[];
   if(![spell,...requires].every(n=>Number.isSafeInteger(n)&&n>0)||!Number.isSafeInteger(cost))throw Error('Unsafe spell record');
   spells.push({spell,level,requires});
  }
 }
 return spells.sort((a,b)=>a.level-b.level||a.spell-b.spell);
}
export function loadSupplements(root,db){
 const read=p=>fs.readFileSync(path.join(root,p),'utf8');
 const spellPath='WhatsTraining/Classes/Camelot/Shaman.lua',recipePath='WhatsTraining/Crafting/Recipes/Camelot/Alchemy.lua';
 if(!fs.existsSync(path.join(root,spellPath)))return {training:{},recipes:[],coverage:'unavailable'};
 const spells=read(spellPath),recipes=read(recipePath),license=read('WhatsTraining/LICENSE');
 if(digest(recipes)!=='dd7d66223aaf37689d7c0200b761d3a17dfe89a80043813b02cc7fcb5346521a')throw Error('Unreviewed recipe source; inspect before export');
 const selected=recipes.split(/\r?\n/).find(s=>/spell\s*=\s*6617\s*,/.test(s));
 const out={training:{SHAMAN:parseShaman(spells)},recipes:[],coverage:'partial',sources:[{path:spellPath,hash:digest(spells)},{path:recipePath,hash:digest(recipes)}],license};
 // Narrow verified record only. Reject source drift or unsupported conditions.
 if(selected&&/skill\s*=\s*60\s*,/.test(selected)&&/teach\s*=\s*5640\s*,/.test(selected)&&/source\s*=\s*\{\s*"vendor"\s*\}/.test(selected)&&/\{\s*npc\s*=\s*3335\s*,\s*area\s*=\s*1637\s*,\s*faction\s*=\s*"Horde"\s*\}/.test(selected)&&!/(merchantFavor|quests|level|requires)\s*=/.test(selected)){
  const name=db.prepare('SELECT name FROM item WHERE id=?').get(5640)?.name;
  out.recipes.push({npc:3335,item:5640,spell:6617,skill:60,profession:'Alchemy',faction:'Horde',name:name||'Recipe 5640'});
 }
 return out;
}
