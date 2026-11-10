-- Optional, bounded observations. No action APIs, UI selections, filter changes,
-- auction searches, other-character banks or player names. Windows are opened by
-- the player. Saved captures keep their original timestamp after closing.
local _, ns = ...
local G = {}
ns.GameContext = G
local P, Try = ns.Companion, ns.Try
local Clean, O = P.Clean, P.JSON.O
local bankOpen, merchantOpen, trainerOpen, tradeOpen = false, false, false, false
local lastRead, cached = -100, nil

local function Int(v, max)
	if ns.IsSecret(v) or type(v) ~= "number" or v ~= v or v < 0 or v > (max or 2147483647) then return nil end
	return math.floor(v)
end
local function Bool(v) if not ns.IsSecret(v) and type(v) == "boolean" then return v end end
local function Text(v) if not ns.IsSecret(v) and type(v) == "string" then return Clean(v) end end
local function Store()
	local c = P.CharDB()
	if type(c.observed) ~= "table" then c.observed = {} end
	return c.observed
end
local function LinkID(v) return type(v) == "string" and Int(tonumber(v:match("item:(%d+)"))) or nil end
local arrays = { items=true, recipes=true, reagents=true, services=true, stats=true,talents=true }
local function Pack(v, list)
	if type(v) ~= "table" then return v end
	local out = {}
	if list then for i, x in ipairs(v) do out[i] = Pack(x, false) end; return out end
	local keys = {}; for k in pairs(v) do keys[#keys+1] = k end; table.sort(keys)
	for _, k in ipairs(keys) do out[#out+1] = k; out[#out+1] = Pack(v[k], arrays[k]) end
	return O((unpack or table.unpack)(out))
end

-- Auctionator's stable v1 API: current character's market, copper per item;
-- age is whole days, not seconds. No scan/query is started by these calls.
function G.Quote(id)
	local api = Auctionator and Auctionator.API and Auctionator.API.v1
	if not api then return nil end
	local price = Int(Try(api.GetAuctionPriceByItemID, "Voxwarden", id))
	local days = Int(Try(api.GetAuctionAgeByItemID, "Voxwarden", id), 21)
	if price and price > 0 and days then
		return {copper=price, ageDays=days, source="auctionator", scope="current-market"}
	end
end
local function Item(id, count)
	local data = P.ItemData(id)
	return {id=id, name=data.name, count=count, sell=data.sell, quote=G.Quote(id)}
end
local function Containers(bags, cap)
	local C = C_Container
	if not C or type(C.GetContainerNumSlots) ~= "function" or type(C.GetContainerItemInfo) ~= "function" then return nil end
	local out, seen, partial, slots = {}, {}, false, 0
	for _, bag in ipairs(bags) do
		local n = Int(Try(C.GetContainerNumSlots, bag), 200)
		if not n then partial = true end
		slots = slots + (n or 0)
		for slot = 1, n or 0 do
			local ok, info = pcall(C.GetContainerItemInfo, bag, slot)
			if not ok then partial = true end
			if type(info) == "table" then
				local id, count = Int(info.itemID), Int(info.stackCount, 1000000)
				if id and id > 0 and count and count > 0 then
					if seen[id] then seen[id].count = math.min(1000000, seen[id].count + count)
					elseif #out < cap then local row=Item(id,count);out[#out+1]=row;seen[id]=row
					else partial=true end
				else partial=true end
			end
		end
	end
	return {available=true, at=time(), partial=partial, slots=slots, items=out}
end
function G.Inventory()
	local bags = {};for i=0,math.min(Int(NUM_BAG_SLOTS,5) or 4,5) do bags[#bags+1]=i end
	return Containers(bags, 32)
end
function G.Bank()
	if not bankOpen then return nil end
	local C, E = C_Bank, Enum and Enum.BagIndex
	local character = Enum and Enum.BankType and Enum.BankType.Character
	if C and character and type(C.CanViewBank)=="function" and Try(C.CanViewBank, character)~=true then return nil end
	local bags = {}
	-- Current tab-based personal banks: use only purchased CHARACTER tab IDs.
	if C and character and E and E.CharacterBankTab_1 and type(C.FetchPurchasedBankTabData)=="function" then
		local tabs=Try(C.FetchPurchasedBankTabData, character)
		if type(tabs)~="table" then return nil end
		for i=1,math.min(#tabs,9) do local id=E["CharacterBankTab_"..i];if id then bags[#bags+1]=id end end
	else
		bags[1]=(E and E.Bank) or BANK_CONTAINER or -1
		for i=1,math.min(Int(NUM_BANKBAGSLOTS,7) or 7,7) do bags[#bags+1]=(Int(NUM_BAG_SLOTS,5) or 4)+i end
	end
	local v=Containers(bags,32);if v then v.open=true end;return v
end

function G.Status()
	if ns.InCombat() then return {at=time(),combat=true,restricted=true} end
	local _, powerType=Try(UnitPowerType,"player")
	local _, armor=Try(UnitArmor,"player")
	local stats={}
	for i=1,5 do local _,v=Try(UnitStat,"player",i);if Int(v) then stats[#stats+1]={id=i,value=Int(v)} end end
	local inside, instanceType=Try(IsInInstance)
	return {at=time(),combat=false,health=Int(Try(UnitHealth,"player")),healthMax=Int(Try(UnitHealthMax,"player")),
		power=Int(Try(UnitPower,"player")),powerMax=Int(Try(UnitPowerMax,"player")),powerType=Text(powerType),
		dead=Bool(Try(UnitIsDeadOrGhost,"player")),resting=Bool(Try(IsResting)),mounted=Bool(Try(IsMounted)),
		armor=Int(armor),stats=stats,role=Text(Try(UnitGroupRolesAssigned,"player")),instance=Bool(inside),instanceType=Text(instanceType),
		pet=Try(UnitExists,"pet")==true and {level=Int(Try(UnitLevel,"pet"),1000),health=Int(Try(UnitHealth,"pet")),healthMax=Int(Try(UnitHealthMax,"pet"))} or nil}
end
function G.Spells()
	local C=C_SpellBook
	local modern=C and type(C.GetNumSpellBookSkillLines)=="function" and type(C.GetSpellBookSkillLineInfo)=="function" and type(C.GetSpellBookItemInfo)=="function"
	local n=Int(Try(modern and C.GetNumSpellBookSkillLines or GetNumSpellTabs),20)
	if not n then return nil end
	local out,seen,partial={}, {},false
	for tab=1,n do
		local offset,count
		if modern then local info=Try(C.GetSpellBookSkillLineInfo,tab);if type(info)=="table" then offset,count=info.itemIndexOffset,info.numSpellBookItems end
		else local _,_,a,b=Try(GetSpellTabInfo,tab);offset,count=a,b end
		offset,count=Int(offset,1000),Int(count,1000)
		if not offset or not count then partial=true end
		for i=(offset or 0)+1,math.min((offset or 0)+(count or 0),1000) do
			local id,name,rank
			if modern then
				local info=Try(C.GetSpellBookItemInfo,i,Enum and Enum.SpellBookSpellBank and Enum.SpellBookSpellBank.Player or 0)
				if type(info)=="table" and info.isOffSpec~=true and info.isPassive~=true and info.isUnlearned~=true and info.itemType==(Enum and Enum.SpellBookItemType and Enum.SpellBookItemType.Spell or 1) then id=Int(info.spellID);name=info.name end
			else
				local kind,spellID=Try(GetSpellBookItemInfo,i,BOOKTYPE_SPELL or "spell")
				if kind=="SPELL" then id=Int(spellID);name,rank=Try(GetSpellBookItemName,i,BOOKTYPE_SPELL or "spell") end
			end
			if id and id>0 and not seen[id] then
				seen[id]=true
				if #out<48 then out[#out+1]={id=id,name=Text(name) or Text(Try(C_Spell and C_Spell.GetSpellName,id)),rank=Text(rank)} else partial=true end
			end
		end
	end
	local talents={}
	for tab=1,math.min(Int(Try(GetNumTalentTabs),5) or 0,5) do
		for i=1,math.min(Int(Try(GetNumTalents,tab),100) or 0,60) do
			local name,_,tier,column,rank,max=Try(GetTalentInfo,tab,i)
			if Int(rank,10) and rank>0 then
				if #talents<24 then talents[#talents+1]={tree=tab,index=i,name=Text(name),rank=Int(rank,10),max=Int(max,10),tier=Int(tier,20),column=Int(column,10)} else partial=true end
			end
		end
	end
	return {available=true,at=time(),partial=partial,items=out,talents=talents}
end

local function OwnTrade(C)
	if Try(IsTradeSkillLinked)==true or Try(IsTradeSkillGuild)==true then return false end
	for _, name in ipairs({"IsTradeSkillLinked","IsTradeSkillGuild","IsTradeSkillGuildMember","IsNPCCrafting"}) do
		if Try(C and C[name])==true then return false end
	end
	return true
end
local function KnownRecipe(id)
	local f=C_SpellBook and C_SpellBook.IsSpellKnown
	local known=Try(f,id,Enum and Enum.SpellBookSpellBank and Enum.SpellBookSpellBank.Player or 0)
	if type(known)~="boolean" then known=Try(IsPlayerSpell,id) end
	if type(known)~="boolean" then known=Try(IsSpellKnown,id) end
	return known==true
end
local function ModernCrafting(C)
	if Try(C.IsTradeSkillReady)~=true or not OwnTrade(C) then return nil end
	local prof=Try(C.GetBaseProfessionInfo)
	if type(prof)~="table" or not Text(prof.professionName) then return nil end
	local filtered=type(C.GetAllRecipeIDs)~="function"
	local ids=Try(filtered and C.GetFilteredRecipeIDs or C.GetAllRecipeIDs)
	if type(ids)~="table" then return nil end
	local candidates,partial={},filtered
	for i,id in ipairs(ids) do
		if i>300 then partial=true;break end
		id=Int(id)
		local info=id and Try(C.GetRecipeInfo,id)
		if type(info)=="table" and info.learned==true and KnownRecipe(id) then candidates[#candidates+1]={id=id,info=info} end
	end
	table.sort(candidates,function(a,b) local x,y=Int(a.info.relativeDifficulty,3) or 3,Int(b.info.relativeDifficulty,3) or 3;return x<y or (x==y and a.id<b.id) end)
	local rows={}
	for i,c in ipairs(candidates) do
		if i>8 then partial=true;break end
		local s=Try(C.GetRecipeSchematic,c.id,false)
		local reagents,unknown={},c.info.supportsQualities==true
		local output,min,max
		if type(s)=="table" and s.recipeType==1 and s.isRecraft~=true then
			output,min,max=Int(s.outputItemID),Int(s.quantityMin,10000),Int(s.quantityMax,10000)
			if type(s.reagentSlotSchematics)~="table" then unknown=true end
			for _,slot in ipairs(s.reagentSlotSchematics or {}) do
				if slot.required~=false and (Int(slot.quantityRequired) or 0)>0 then
					local rs=slot.reagents
					local id=type(rs)=="table" and #rs==1 and Int(rs[1].itemID) or nil
					if not id or (slot.variableQuantities~=nil and slot.variableQuantities~=false) or (slot.dataSlotType and slot.dataSlotType~=1) or #reagents>=8 then unknown=true
					else local r=Item(id,Int(slot.quantityRequired,1000000));r.owned=Int(Try(C_Item and C_Item.GetItemCount or GetItemCount,id,false));reagents[#reagents+1]=r end
				end
			end
		else unknown=true end
		rows[#rows+1]={id=c.id,name=Text(c.info.name),difficulty=Int(c.info.relativeDifficulty,3),skillUps=Int(c.info.numSkillUps,100),canSkillUp=Bool(c.info.canSkillUp),disabled=Bool(c.info.disabled),
			output=output,min=min,max=max,reagents=reagents,unknown=unknown,quote=output and G.Quote(output) or nil,
			craftable=Int(Try(C.GetCraftableCount,c.id),1000000)}
	end
	return {available=true,open=true,at=time(),profession=Text(prof.professionName),rank=Int(prof.skillLevel,2000),max=Int(prof.maxSkillLevel,2000),filtered=filtered,partial=partial,recipes=rows}
end
local function LegacyCrafting()
	if not OwnTrade(C_TradeSkillUI) then return nil end
	local name,rank,max=Try(GetTradeSkillLine)
	local n=Int(Try(GetNumTradeSkills),1000)
	if not Text(name) or not n or n==0 then return nil end
	local rows={}
	for i=1,math.min(n,300) do
		local title,kind=Try(GetTradeSkillInfo,i)
		local id=LinkID(Try(GetTradeSkillItemLink,i))
		local spellLink=Try(GetTradeSkillRecipeLink,i)
		local recipe=type(spellLink)=="string" and tonumber(spellLink:match("enchant:(%d+)") or spellLink:match("spell:(%d+)"))
		if kind~="header" and recipe and KnownRecipe(recipe) and #rows<8 then
			local rs,unknown={},false
			local nr=Int(Try(GetTradeSkillNumReagents,i),100)
			if not nr or nr>8 then unknown=true end
			for j=1,math.min(nr or 0,8) do
				local _,_,need,owned=Try(GetTradeSkillReagentInfo,i,j)
				local rid=LinkID(Try(GetTradeSkillReagentItemLink,i,j));need=Int(need,1000000)
				if rid and need and need>0 then local r=Item(rid,need);r.owned=Int(owned,1000000);rs[#rs+1]=r else unknown=true end
			end
			local min,countMax=Try(GetTradeSkillNumMade,i)
			local difficulty=({optimal=0,medium=1,easy=2,trivial=3})[kind]
			rows[#rows+1]={id=recipe,name=Text(title),output=id,min=Int(min,10000),max=Int(countMax,10000),difficulty=difficulty,reagents=rs,unknown=unknown,quote=id and G.Quote(id) or nil}
		end
	end
	return {available=true,open=true,at=time(),profession=Text(name),rank=Int(rank,2000),max=Int(max,2000),filtered=true,partial=true,recipes=rows}
end
function G.Crafting()
	if ns.InCombat() or not tradeOpen then return nil end
	local C=C_TradeSkillUI
	if C and type(C.GetRecipeSchematic)=="function" then return ModernCrafting(C) end
	return LegacyCrafting()
end
function G.Merchant()
	if not merchantOpen then return nil end
	local n=Int(Try(GetMerchantNumItems),1000);if not n then return nil end
	local items={}
	for i=1,math.min(n,12) do
		local name,_,price,quantity,stock,usable,extended=Try(GetMerchantItemInfo,i)
		local id=LinkID(Try(GetMerchantItemLink,i))
		if id then items[#items+1]={id=id,name=Text(name),price=Int(price),quantity=Int(quantity,1000000),stock=type(stock)=="number" and stock>=-1 and math.floor(stock) or nil,usable=Bool(usable),extended=Bool(extended)} end
	end
	return {available=true,at=time(),open=true,partial=n>12,repair=Bool(Try(CanMerchantRepair)),items=items}
end
function G.Training()
	if not trainerOpen then return nil end
	local n=Int(Try(GetNumTrainerServices),1000);if not n then return nil end
	local rows={}
	for i=1,math.min(n,100) do
		local name,rank,kind=Try(GetTrainerServiceInfo,i)
		if kind=="available" and #rows<12 then rows[#rows+1]={name=Text(name),rank=Text(rank),cost=Int(Try(GetTrainerServiceCost,i))} end
	end
	return {available=true,at=time(),open=true,partial=true,services=rows}
end

function G.Snapshot()
	if ns.InCombat() then return Pack({status=G.Status()}) end
	local now=GetTime()
	if not cached or now-lastRead>=15 then
		local saved=Store()
		local bank,craft,merchant,training=G.Bank(),G.Crafting(),G.Merchant(),G.Training()
		if bank then saved.bank=bank end
		if craft then saved.crafting=craft end
		if merchant then saved.merchant=merchant end
		if training then saved.training=training end
		cached={inventory=G.Inventory(),spells=G.Spells(),bank=saved.bank or {available=false},crafting=saved.crafting or {available=false},
			merchant=saved.merchant or {available=false},training=saved.training or {available=false}}
		lastRead=now
	end
	-- Window state is current, timestamps always describe the original read.
	for _,k in ipairs({"bank","crafting","merchant","training"}) do if cached[k] then
		cached[k].open= k=="bank" and bankOpen or k=="merchant" and merchantOpen or k=="training" and trainerOpen or k=="crafting" and tradeOpen and OwnTrade(C_TradeSkillUI) or false
	end end
	cached.status=G.Status()
	return Pack(cached)
end
local function Invalidate() cached=nil;lastRead=-100;if P.LiveChanged then P.LiveChanged() end end
local function CaptureSoon()
	Invalidate()
	if C_Timer and C_Timer.After then C_Timer.After(0.2,function()
		if not ns.InCombat() and ns.db and ns.db.settings.context and P.Caps().xctx and P.DesktopOn() then pcall(G.Snapshot) end
	end) end
end
local function On(event, fn) ns.On(event,function(...) local ok=pcall(fn,...);if not ok then cached=nil end end) end
On("BANKFRAME_OPENED",function() bankOpen=true;CaptureSoon() end)
On("BANKFRAME_CLOSED",function() bankOpen=false;Invalidate() end)
On("MERCHANT_SHOW",function() merchantOpen=true;CaptureSoon() end)
On("MERCHANT_CLOSED",function() merchantOpen=false;Invalidate() end)
On("TRAINER_SHOW",function() trainerOpen=true;CaptureSoon() end)
On("TRAINER_CLOSED",function() trainerOpen=false;Invalidate() end)
On("TRADE_SKILL_SHOW",function() tradeOpen=true;CaptureSoon() end)
On("TRADE_SKILL_CLOSE",function() tradeOpen=false;Invalidate() end)
for _,e in ipairs({"TRADE_SKILL_LIST_UPDATE","SPELLS_CHANGED","BAG_UPDATE_DELAYED","PLAYERBANKSLOTS_CHANGED","PLAYER_ENTERING_WORLD"}) do On(e,Invalidate) end
