-- Player-controlled context, goals and local reminders. No gameplay actions.
local _, ns = ...
local H = {}; ns.HelperPanel=H
local P, G = ns.Companion, ns.GameContext
local window
local UpdateHints
local function Get(o,k) for _,kv in ipairs(type(o)=="table" and o._o or {}) do if kv[1]==k then return kv[2] end end end
local function Saved()
	local c=P.CharDB();if type(c.helper)~="table" then c.helper={goals={}} end
	if type(c.helper.goals)~="table" then c.helper.goals={} end
	return c.helper
end
function H.SetGoal(text)
	if type(text)~="string" or ns.Chats.KeyShaped(text) then return false end
	text=P.Clean(text,60);if text=="" then return false end
	local goals=Saved().goals;if #goals>=5 then return false end
	goals[#goals+1]=text;return true
end
function H.Goals() local out={};for i,g in ipairs(Saved().goals) do if i<=5 and type(g)=="string" and not ns.Chats.KeyShaped(g) then out[#out+1]=P.Clean(g,60) end end;return out end
function H.Lines()
	local lines={"Observed context",ns.db.settings.context and "Game data: on" or "Game data: off",P.Caps().xctx and "Expanded context: bridge ready" or "Expanded context: restart/update the app",P.DesktopOn() and "Companion context: on" or "Companion context: off (enable Check-ins in app to share extras)"}
	if ns.InCombat() then lines[#lines+1]="In combat: extra reads wait.";return lines end
	local snapshot=G.Snapshot()
	for _,k in ipairs({"inventory","spells","crafting","bank","merchant","training"}) do
		local v=Get(snapshot,k);local at=Get(v,"at")
		local age=type(at)=="number" and math.max(0,time()-at) or nil
		local list=Get(v,k=="crafting" and "recipes" or k=="training" and "services" or "items")
		local note=Get(v,"available")==false and "not captured" or (tostring(type(list)=="table" and #list or 0).." entries")
		lines[#lines+1]=k..": "..note..(age and (", "..age.."s old") or "")..(Get(v,"partial") and ", partial" or "")
	end
	lines[#lines+1]="Open your profession, personal bank, vendor or trainer to refresh."
	lines[#lines+1]="Goals (up to 5): "..table.concat(H.Goals(),"; ")
	lines[#lines+1]="Local reminders: "..(Saved().hints and "on" or "off")
	return lines
end
function H.Advice()
	if ns.InCombat() then return {} end
	local lines={}
	local quests=P.Quests();local ready=0;local first
	for _,q in ipairs(quests) do if q.complete then ready=ready+1;first=first or q.title end end
	if ready>0 then lines[#lines+1]=ready.." quest(s) ready, including "..(first or "a quest")..". Ask where to turn them in." end
	local durability=P.Durability()
	if durability and durability[1] and (Get(durability[1],"pct") or 100)<25 then lines[#lines+1]="Equipment below 25% durability: repair before your next dungeon." end
	local bags=P.Bags();local free=Get(bags,"free")
	if free and free<=2 then lines[#lines+1]="Only "..free.." free bag slot(s). Review supplies and quest items before selling." end
	local food=0;for _,i in ipairs(Get(bags,"items") or {}) do if Get(i,"kind")=="foodDrink" then food=food+(Get(i,"count") or 0) end end
	if food>0 and food<=2 and not Get(bags,"partial") then lines[#lines+1]="Only "..food.." observed food/drink item(s): consider restocking." end
	return lines
end
function H.Shopping(recipeID)
	local observed=P.CharDB().observed
	local craft=observed and observed.crafting
	if not craft then return {"Open your profession to capture its recipes first."} end
	for _,r in ipairs(craft.recipes or {}) do if r.id==recipeID then
		local out={"Materials for "..(r.name or tostring(r.id)).." (one craft):"}
		for _,i in ipairs(r.reagents or {}) do out[#out+1]=(i.name or ("item "..i.id))..": need "..i.count..", carried at capture "..(i.owned or "unknown")..". Check personal bank before buying." end
		if r.unknown then out[#out+1]="Some requirements are unknown; this list is incomplete." end
		return out
	end end
	return {"Recipe is not in the captured sample; filter your profession list to it and refresh."}
end
function H.Ask(kind)
	if ns.InCombat() then return end
	local questions={today="What are my two or three most useful next actions? Use current quests, turn-ins, location, repairs, training and my goals. Give only sourced places.",
		dungeon="Help me prepare for a dungeon appropriate to my current character: known related quests, my equipment and role, useful supplies and sourced boss mechanics. State what is unknown.",
		crafting="Which captured learned recipe should I craft to level my profession? Compare materials and sourced pre-fee margins; include a shopping list and check personal bank."}
	if questions[kind] then ns.Chats.Send(questions[kind]) end
end
function H.Refresh()
	if not window then return end
	window.text:SetText(table.concat(H.Lines(),"\n"))
end
function H.Toggle()
	if not window then
		window=CreateFrame("Frame","VoxwardenHelperPanel",UIParent,"BackdropTemplate")
		window:SetSize(590,390);window:SetPoint("CENTER");window:SetFrameStrata("DIALOG");window:SetClampedToScreen(true)
		local bg=window:CreateTexture(nil,"BACKGROUND");bg:SetAllPoints();bg:SetColorTexture(0.04,0.06,0.08,0.96)
		window.text=window:CreateFontString(nil,"OVERLAY","GameFontNormalSmall");window.text:SetPoint("TOPLEFT",16,-18);window.text:SetWidth(554);window.text:SetJustifyH("LEFT")
		local function Button(label,x,y,w,fn) local b=ns.UI.Button(window,label,w,fn);b:SetPoint("BOTTOMLEFT",x,y);return b end
		Button("Close",492,12,82,function()window:Hide()end)
		Button("Refresh",16,12,90,function()if not ns.InCombat() then P.Call("QueueState",8) end;H.Refresh()end)
		Button("Next steps",114,12,100,function()H.Ask("today")end)
		Button("Dungeon",222,12,90,function()H.Ask("dungeon")end)
		Button("Crafting",320,12,82,function()H.Ask("crafting")end)
		Button("Reminders",410,50,164,function()H.Reminders(not Saved().hints);H.Refresh()end)
		local input=CreateFrame("EditBox",nil,window,"InputBoxTemplate");input:SetSize(290,24);input:SetPoint("BOTTOMLEFT",20,95);input:SetAutoFocus(false);input:SetMaxLetters(200)
		Button("Add goal",320,90,90,function()H.SetGoal(input:GetText());input:SetText("");H.Refresh()end)
		Button("Clear goals",420,90,154,function()Saved().goals={};H.Refresh()end)
		window:Hide()
	end
	if window:IsShown() then window:Hide() else H.Refresh();window:Show() end
end
local lastHint=-1000
local function Hints()
	if not ns.db or ns.InCombat() or not Saved().hints or not P.DB().on or not P.DesktopOn() or not ns.db.settings.context or GetTime()-lastHint<300 then return end
	local lines=H.Advice();if #lines==0 then return end
	local saved=Saved();local hint=lines[1]
	local sid=P.CharDB().sid
	if saved.lastHint==hint and saved.lastHintSid==sid then return end
	saved.lastHint=hint;saved.lastHintSid=sid;lastHint=GetTime();ns.Chats.Notice(ns.Chats.Active(),hint)
end
local hintTicker
UpdateHints=function()
	if hintTicker and not Saved().hints then hintTicker:Cancel();hintTicker=nil end
	if not hintTicker and Saved().hints and C_Timer and C_Timer.NewTicker then hintTicker=C_Timer.NewTicker(30,function()pcall(Hints)end) end
end
function H.Reminders(on) if type(on)=="boolean" then Saved().hints=on;UpdateHints() end end
ns.On("PLAYER_LOGIN",function()UpdateHints()end)
