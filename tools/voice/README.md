# Voice companion

Talk with Voxwarden while you play: speak, interrupt a response and ask for map pins. Available game observations include quests, location, equipment and professions; coverage and freshness are explicit. Response time depends on the connection and selected providers.

The Windows preview integrates voice and game-knowledge setup into the app: no separate browser or Node installation is needed in its normal flow. The commands below remain the developer/source route. See [Windows preview](../../docs/WINDOWS-PREVIEW.md).

It never plays for you: its tools only read your game data and draw on your map, like the companion in the chat window.

## What you need

- The Voxwarden app running, and the addon in game. For the voice to see changes between typed messages, type `/nqa live on` in game.
- An OpenAI API key with Realtime access and credit. Voice audio is billed separately from your text provider or subscription; cost depends on usage and model. The Windows preview checks Realtime access before saving the voice key, without changing the selected text AI.
- Node 22.19 or later, and a browser (Chrome or Edge).
- Headphones, so it doesn't hear itself or the game.

## Start it

```sh
node tools/voice/server.mjs --key-file ~/.config/neverquestalone/api-keys.json
```

Then open <http://localhost:8790> and click **Conectar**. On Windows, `tools\voice\start-voice.cmd` does both.

The key comes from `OPENAI_API_KEY`, or from `--key-file`: a file that holds the key, or JSON with an `"openai"` field. It stays in the server; the page only gets a session key that expires in 10 minutes.

| Option | Default | What it does |
|---|---|---|
| `--port` | `8790` | The port |
| `--host` | `127.0.0.1` | Listen address. Keep it local: the microphone needs `localhost` or `https`, and anyone who can reach the server can start sessions on your key |
| `--model` | `gpt-realtime-2.1-mini` | `gpt-realtime-2.1` sounds smarter and costs about three times as much |
| `--voice` | `marin` | The model's voice |
| `--lang` | `Spanish` | The language it speaks unless you speak another |
| `--web` | off | Lets it read Wowhead tooltips for World of Warcraft: Forever, by quest, item, spell or NPC id from your game data |
| `--app-data` | the app's folder | Where the app keeps `config.json` and `bridge/` (`%APPDATA%\Voxwarden` on Windows) |

## How it works

1. `server.mjs` gets a short-lived Realtime session key from OpenAI and gives it to the page.
2. The page (`index.html`, `app.js`) talks to OpenAI over WebRTC: your microphone in, its voice out, with captions.
3. When the model needs your game data, it calls `get_game_state`, and the server reads the newest game state the app saved (`bridge/companion.json`). It's cleaned the way the app cleans a turn's data, and your character's name, realm and guild stay out unless you share them on the app's Your data page. With game data off there, the voice gets none.
4. `place_map_pins` and each finished exchange go into `bridge/voice-inbox.jsonl`. The app reads that file and shows them in the addon's Companion chat, and draws the pins, through the same checks as any reply.

Tests: `node --test tests/voice_test.mjs`. A live check with a recorded question, Chrome and the real API (costs a few cents): `node tools/voice/e2e.mjs --wav question.wav`.
