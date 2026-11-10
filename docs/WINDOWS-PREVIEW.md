# Windows preview

The source is public. The Windows installer remains a private, unsigned preview;
there is no public installer release or CurseForge listing yet. Source tests and
packaged self-tests do not establish compatibility with every live client.

The normal installed flow is:

1. Connect your text AI in the app. Subscription integrations remain an advanced
   option requiring their own installed and signed-in tools.
2. Select your WoW: Forever folder and install the addon with the game closed.
   NPC, quest, item and map knowledge is downloaded from a pinned official
   QuestieDB archive, verified and prepared automatically on your computer.
3. Optional: paste an OpenAI API key for voice. This checks Realtime access and
   stores the key privately without changing your text provider. Open voice and
   grant microphone access when you want to talk. Audio has separate API billing.
4. Restart WoW after adding addon files. Open Guide on the voice bar, or use
   `/nqa companionpanel`, to inspect observations, save five personal goals,
   request next steps/dungeon/crafting help and enable optional local reminders.
5. Open your profession, personal bank, vendor or trainer to refresh their data.
   Additional observations require companion context/Check-ins and Game Data on.
   Check-ins also enable automatic AI turns; local reminders are separately
   opt-in. Filters and capped lists mean coverage can be partial.

The installed app includes its runtime and capture helper; the normal flow does
not require Node, scripts, a developer database or an external browser. It never
crafts, buys, sells, trains, moves, fights or acts for the player.

Mission follow-ups resolve against current quest IDs and recent conversation,
including turn-ins outside the current map. Bounded Wowhead tooltip references
supplement local relations; they are not unrestricted browsing or evidence of
coordinates. Missing or blocked references remain unknown.

Crafting uses learned recipe samples, materials and output quantities. Captured
counts are not current stock promises. Quotes include source and whole-day age.
Gathered materials have opportunity cost; margins are before fees/deposits and
do not guarantee demand or tradeability. Missing/old inputs prevent a numeric
profit. Check the personal bank before buying a bag shortage.

Known limits: microphone/gameplay acceptance still needs a live test; server APIs
can be unavailable. Full stock and quest availability cannot be inferred from an
NPC location. Dungeon candidates use observed monster levels, not verified entry
requirements; mechanics coverage is limited to reviewed sources. No latency or
profit guarantee.

The source fallback `WorldDataFallback.lua` contains no developer database. The
app replaces it with locally prepared data when installing the addon. The legacy
local `WorldData.lua` export is excluded from the Windows package. Private guide
supplements are not copied into fresh preparations.

Updating preserves profile/key data. The Windows system uninstaller removes the
app/startup entry while preserving credentials, character data and addons.
Explicit in-app data removal retains its own confirmation flow. Clean-OS
installation/uninstallation and release signing remain pending; fresh-profile
and packaged self-tests are narrower checks.

Voice is isolated from settings and permits audio only for its local origin after
consent. Only short-lived session credentials reach that window. Voice-key checks
use the documented [Realtime client-secret endpoint](https://developers.openai.com/api/reference/resources/realtime/subresources/client_secrets/methods/create).
