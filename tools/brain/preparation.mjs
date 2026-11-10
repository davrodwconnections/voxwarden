import {dungeonFact,questForMe,npcForMe} from './gear.mjs';
const parse=s=>{try{return JSON.parse(s)||{};}catch{return {};}};
export function preparationFacts(db,question,state){
  if(!/dungeon|mazmorra|instancia|prepar/i.test(String(question||'')))return [];
  const level=state?.char?.level;if(!Number.isInteger(level))return [];
  const zones=db.prepare(`SELECT z.area_id,z.name,z.source,min(n.min_level) low,max(n.max_level) high
    FROM zone z JOIN spawn s ON s.area_id=z.area_id AND s.kind='npc' AND s.x=-1
    JOIN npc n ON n.id=s.id WHERE n.max_level BETWEEN ? AND ? GROUP BY z.area_id
    ORDER BY abs(avg(n.max_level)-?) LIMIT 3`).all(Math.max(1,level-6),level+8,level+2);
  return zones.map(z=>{
    const quests=db.prepare('SELECT * FROM quest WHERE zone_area=? AND (req_level IS NULL OR req_level<=?) ORDER BY level,id LIMIT 30').all(z.area_id,level).filter(q=>questForMe(db,q.id,state)!==false).slice(0,6);
    const mine=new Set((state.quests||[]).map(q=>q.id));
    const loot=dungeonFact(db,z.area_id,state,3);
    return {kind:'preparation',id:z.area_id,name:z.name,source:z.source,
      text:`Dungeon candidate ${z.name}, based on observed NPC levels ${z.low}-${z.high}, not verified entry requirements. Related quest sample: ${quests.map(q=>`${q.id} ${q.name}${mine.has(q.id)?' [in your log]':' [availability/prerequisites must be checked]'}`).join('; ')||'none found'}. ${loot?.text||'Usable boss loot not known'}. Review captured durability, supplies and group roles; missing mechanics and requirements remain unknown.`};
  });
}
const SERVICES=[['bank',256,/banco|bank/i],['auction',4096,/subasta|auction/i],['inn',128,/posada|innkeeper|hearth|descans/i],['flight',8,/vuelo|flight/i],['repair',16384,/repar|repair/i]];
export function serviceFacts(db,question,state){
 const map=state?.loc?.map;if(!Number.isInteger(map))return [];
 const out=[];
 for(const [kind,flag,re]of SERVICES){if(!re.test(String(question||'')))continue;
  const rows=db.prepare(`SELECT n.*,s.x,s.y,z.name zone,z.ui_map_id FROM npc n JOIN spawn s ON s.kind='npc' AND s.id=n.id JOIN zone z ON z.area_id=s.area_id
   WHERE z.ui_map_id=? AND s.x>=0 AND s.y>=0 AND (cast(json_extract(n.raw,'$.npcFlags') AS INTEGER) & ?)!=0 LIMIT 80`).all(map,flag)
   .filter(n=>npcForMe(db,n.id,state)).sort((a,b)=>Math.hypot(a.x-(state.loc.x??50),a.y-(state.loc.y??50))-Math.hypot(b.x-(state.loc.x??50),b.y-(state.loc.y??50))).slice(0,2);
  for(const n of rows)out.push({kind:'service',id:`${kind}-${n.id}`,name:n.name,source:n.source,text:`${kind} service ${n.name} in ${n.zone} ${n.x},${n.y} (map ${map}); access, stock, fees, unlocked routes and current availability unknown.`});
 }
 return out.slice(0,4);
}
