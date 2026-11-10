-- Embedded world facts only: no calls into other addons and no game actions.
local _, ns = ...
local W = {}
ns.WorldContext = W
local indexed, starts, ends
local function lookup(t, k) return t and (t[k] or t[tostring(k)]) end
local function point(n) return type(n) == 'number' and n == n and n >= 0 and n <= 100 end
local function flag(mask, bit) return type(mask) == 'number' and math.floor(mask / bit) % 2 == 1 end
local function text(s) return ns.Utf8Cut and ns.Utf8Cut(tostring(s or ''), 60) or tostring(s or ''):sub(1,60) end
local function index(data)
 if indexed == data then return end
 indexed, starts, ends = data, {}, {}
 for qid,q in pairs(data.quest or {}) do
  for _, pair in ipairs({{q.starts,starts},{q.ends,ends}}) do
   for _,kind in ipairs({'npc','object'}) do
    for _,id in ipairs(pair[1] and pair[1][kind] or {}) do
     local key=kind..':'..id;pair[2][key]=pair[2][key] or {};table.insert(pair[2][key],tonumber(qid))
    end
   end
  end
 end
end
-- Eligibility remains unknown without server acceptance evidence. Filters only
-- exclude positively known incompatibilities; absence in this database proves nothing.
function W.Build(loc, quests, facts)
 facts=facts or {};local data=ns.WorldData
 local out={schema=1,map=loc and loc.map,coverage='unavailable',source='embedded',candidates={}}
 if not data or data.schema~=1 or not loc or not loc.map then return out end
 local positions=lookup(data.byMap,loc.map)
 if not positions then return out end
 index(data);out.coverage='partial';out.source=text(data.metadata and data.metadata.source)
 local inLog={};for _,q in ipairs(quests or {}) do inLog[q.id]=q end
 local found,seen={},{}
 local function add(kind,id,qid,p,reason,priority,bucket)
  local key=kind..':'..id..':'..tostring(qid)
  local entity=lookup(p[1]==1 and data.npc or data.object,id);if not entity then return end
  local distance=point(loc.x) and point(loc.y) and ((p[3]-loc.x)^2+(p[4]-loc.y)^2) or 100000
  local old=seen[key];if old and old.priority<=priority and old.distance<=distance then return end
  local q=lookup(data.quest,qid)
  local c={kind=kind,id=id,questID=qid,map=loc.map,x=p[3],y=p[4],name=text(entity.name),title=q and text(q.name) or nil,reason=reason,eligibility=kind=='turnin' and 'ready' or 'unknown',distance=distance,priority=priority,bucket=bucket or kind}
  if old then old.removed=true end;seen[key]=c;table.insert(found,c)
 end
 local function friendly(p)
  if p[1]~=1 then return true end
  local n=lookup(data.npc,p[2]);local a=n and n.friendly
  return not ((facts.faction=='Horde' and a=='A') or (facts.faction=='Alliance' and a=='H'))
 end
 for _,p in ipairs(positions) do
  if friendly(p) and (p[1]==1 or p[1]==2) and point(p[3]) and point(p[4]) then
   local id=p[2];local key=(p[1]==1 and 'npc:' or 'object:')..id
   for _,qid in ipairs(ends[key] or {}) do
    if inLog[qid] and inLog[qid].complete==true then add('turnin',id,qid,p,'ready quest in current log',0) end
   end
   for _,qid in ipairs(starts[key] or {}) do
    local q=lookup(data.quest,qid);local allowed=not inLog[qid]
    if facts.completed and facts.completed(qid)==true then allowed=false end
    if q.req_level and facts.level and q.req_level>facts.level then allowed=false end
    if q.classes and q.classes>0 and facts.classID and not flag(q.classes,2^(facts.classID-1)) then allowed=false end
    if q.races and q.races>0 and facts.raceID and not flag(q.races,2^(facts.raceID-1)) then allowed=false end
    local pre=q.pre_quests or {};for _,pr in ipairs(pre.group or {}) do if facts.completed and facts.completed(pr)==false then allowed=false end end
    if pre.single and #pre.single>0 and facts.completed then
     local any,unknown=false,false;for _,pr in ipairs(pre.single) do local done=facts.completed(pr);any=any or done==true;unknown=unknown or done==nil end
     if not any and not unknown then allowed=false end
    end
    for _,other in ipairs(q.conditions and q.conditions.exclusiveTo or {}) do if inLog[other] or (facts.completed and facts.completed(other)==true) then allowed=false end end
    if allowed then add('quest',id,qid,p,'possible quest giver; confirm availability in game',3) end
   end
   if p[1]==1 then
    local npc=lookup(data.npc,id);local f=npc and npc.npcFlags or 0
    if flag(f,256) then add('bank',id,nil,p,'bank service; personal bank must be opened',4) end
    if flag(f,4096) then add('auction',id,nil,p,'auctioneer; prices and access unknown',4) end
    if flag(f,128) then add('inn',id,nil,p,'innkeeper; bind and stock not inspected',4) end
    if flag(f,8) then add('flight',id,nil,p,'flight master; unlocked routes and fees unknown',4) end
    if flag(f,16384) then add('repair',id,nil,p,'repair service; cost and access unknown',facts.needsRepair and 1 or 4)
    elseif flag(f,4) then add('vendor',id,nil,p,'vendor; inventory and access unknown',5) end
    local sub=tostring(npc and npc.subname or ''):lower()
    local aliases={alchemy='alchem',alquimia='alchem',enchanting='enchant',encantamiento='enchant',blacksmithing='blacksmith',herreria='blacksmith',engineering='engineer',ingenieria='engineer',tailoring='tailor',sastreria='tailor',leatherworking='leatherwork',peleteria='leatherwork',cooking='cook',cocina='cook',fishing='fish',pesca='fish',mining='mining',mineria='mining',herbalism='herbal',herboristeria='herbal',skinning='skinning',desuello='skinning'}
    for _,profession in ipairs(facts.professions or {}) do
     local name=tostring(profession.name or ''):lower();local needle=aliases[name] or name
     if needle~='' and sub:find(needle,1,true) then
      if flag(f,16) then add('trainer',id,nil,p,'profession trainer for '..name..'; skills and prices unknown',2,'profession') end
      if flag(f,4) then add('vendor',id,nil,p,'profession supplies for '..name..'; inventory unknown',2,'supplies') end
     end
    end
    if flag(f,16) then
     local sub=tostring(npc.subname or ''):lower();local class=tostring(facts.class or ''):lower()
     if class~='' and sub:find(class,1,true) then
      local missing={}
      for _,spell in ipairs(data.supplements and data.supplements.training and data.supplements.training[facts.class] or {}) do
       if facts.level and spell.level<=facts.level and facts.knowsSpell and facts.knowsSpell(spell.spell)==false then
        local ready=true;for _,pr in ipairs(spell.requires or {}) do if facts.knowsSpell(pr)~=true then ready=false end end
        if ready and #missing<2 then missing[#missing+1]=(facts.spellName and facts.spellName(spell.spell)) or ('spell '..spell.spell) end
       end
      end
      local reason=#missing>0 and ('check training: '..table.concat(missing,', ')..'; price unknown') or 'class trainer; available skills and access unknown'
      add('trainer',id,nil,p,reason,2)
     end
    end
    for _,recipe in ipairs(data.supplements and data.supplements.recipes or {}) do
     if recipe.npc==id and recipe.faction==facts.faction then
      for _,profession in ipairs(facts.professions or {}) do
       local name=tostring(profession.name or ''):lower()
       if (name=='alchemy' or name=='alquimia') and type(profession.rank)=='number' and profession.rank>=recipe.skill and (not facts.itemCount or facts.itemCount(recipe.item)~=nil and facts.itemCount(recipe.item)==0) then
        add('vendor',id,nil,p,'check recipe item '..recipe.item..'; learned/stock unknown',1,'supplies')
       end
      end
     end
    end
   end
  end
 end
 table.sort(found,function(a,b) if a.priority~=b.priority then return a.priority<b.priority end;if a.distance~=b.distance then return a.distance<b.distance end;return (a.kind..a.id..tostring(a.questID))<(b.kind..b.id..tostring(b.questID)) end)
 local total=0;local groups={};for _,c in ipairs(found) do if not c.removed then total=total+1;groups[c.bucket]=groups[c.bucket] or {};table.insert(groups[c.bucket],c) end end
 local selected={}
 local function take(c) if c and not selected[c] and #out.candidates<6 then selected[c]=true;table.insert(out.candidates,c) end end
 for _,bucket in ipairs({'turnin','repair','trainer','profession','supplies','quest','bank','auction','inn','flight','vendor'}) do take(groups[bucket] and groups[bucket][1]) end
 for _,c in ipairs(found) do if not c.removed and c.bucket~='trainer' then take(c) end end
 for _,c in ipairs(out.candidates) do c.priority=nil;c.distance=nil;c.bucket=nil end
 out.omitted=math.max(0,total-#out.candidates);return out
end
