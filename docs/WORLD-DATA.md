# Embedded world data (schema 1)

The app prepares fresh data locally and replaces the installed
`WorldDataFallback.lua` during addon installation. The tracked fallback has no
database. The legacy `WorldData.lua` export below is a developer artifact excluded
from Windows packages. Fresh preparation does not copy private guide supplements.

Local-only generated data; public redistribution requires a per-file license review.
The complete installed QuestieDB root license notice is retained verbatim in
metadata.license, with its SHA-256. It explicitly defers to subordinate licenses.
This is not a redistribution clearance. RestedXP was inspected for corroboration;
its runtime and guide code are not included. Selected WhatsTraining Camelot
literal records supplement class training and one verified Alchemy recipe vendor.
Their source hashes and MIT license are retained in supplements; local-only
redistribution limits of the underlying Questie data still apply.

Run from the source checkout (Node 24, existing dependencies):
```bash
node --test tests/world_export_test.mjs
node tools/brain/world-export.mjs "$APPDATA/Voxwarden/dev/brain/brain.sqlite" "C:/Program Files (x86)/World of Warcraft/_forever_/Interface/AddOns/QuestieDB" addon/Voxwarden/WorldData.lua
```

SQLite opens read-only in a read transaction. No importer, game API or network runs.
The only permitted output is the source addon path. Keep it in .git/info/exclude.
The generated chunk assigns the table to the addon namespace as WorldData.
The TOC loads it before WorldContext.lua and Companion.lua; it reads no other addon at runtime.

API: buildWorld(db,{mappingText,license,version?,client?}) returns the schema.
exportWorld({brain,addonDir,output,maxBytes?}) writes Lua and returns counts.
The default byte ceiling is 32 MiB; this is not a measured client memory budget.

- schema = 1; metadata holds source/version, declared client build, content hash,
  mapping hash and verbatim license/hash. Client metadata is a compatibility label,
  not evidence of live API validation. No private character data is exported.
- maps[areaID] = uiMapID (numeric keys serialize as Lua string keys; use tostring).
  Explicit installed Forever assignments only. Legacy/synthetic aliases annotated
  in source comments are excluded. Mapping provenance reviewed through build 70291;
  running build 70862 still needs live validation.
- quest[id] contains name, level, req_level, races/classes masks, next_quest,
  starts/ends {npc,object,item}, pre_quests {group,single}, conditions preserving
  source exclusiveTo/preQuestGroup/preQuestSingle. Nil means unknown.
- npc[id] contains name/subname/friendly and sourced npcFlags where present.
  Flags are raw service evidence, never inventory or purchasable training spells.
- object[id] contains name.
- byMap[uiMapID] arrays contain {kind,id,x,y,areaID}; kind 1 NPC, 2 object.
  Coordinates are percentages, not route distances. Invalid/sentinel positions
  and unknown maps are omitted. Join quest giver IDs against npc/object IDs.
- counts records exclusions. Entities with conditional fields or variant rows are
  excluded entirely, including their positions. Consumers must never conclude
  absence or ineligibility from exclusion, missing fields, or incomplete joins.

Unsupported prerequisite reference forms are excluded and counted separately.
No availability is precomputed. Runtime must check log/completion/prerequisites,
class/race masks and faction, and retain unknown when unsupported conditions
remain. Vendor inventory, trainer spells, navigation and guide availability are
outside this export. WorldContext supplies at most six candidates through the optional world state section.
The state fitter may omit that section and reports it in omitted. Brain and voice
consume the sanitized section; freshness and game-data privacy remain controlled
by the existing state pipeline. Quest starts remain possible/unknown, not certified
available. Instructor locations do not identify unlearned skills or prices.

Supplement coverage: only Shaman literal level/cost/prerequisite schedules are
parsed, with expressions and extra conditions ignored. Costs are not presented
as live prices. Missing known-spell API means unknown training need. Alchemy
recipe item 5640 from NPC 3335 requires rank 60 for the recommendation; learning
state, price and stock stay unknown. Complete material shopping lists are not
available from these sources. Localized profession matching currently covers
selected English/Spanish names, not every locale.

Voice requests a fresh snapshot for stale/missing game data for at most two
seconds, using the existing addon request channel. It does not enable continuous
Live mode and never requests data when game-context privacy is off. A timeout
retains the old age warning; it does not claim current game visibility.

Supplement source acceptance is pinned to the reviewed Shaman and Alchemy file
SHA-256 values. Any source update fails export until explicitly reviewed; regex
extraction is not a general Lua parser. This prevents unknown enclosing conditions,
level expressions or new recipe constraints from silently becoming recommendations.
