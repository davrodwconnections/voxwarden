# Subscription proxy

Use a Claude or ChatGPT subscription instead of an API key, for your own play. `proxy.mjs` is a small OpenAI-compatible server on your computer that answers each turn with the Claude Code CLI (`claude -p`, your Claude Pro or Max login) or the Codex CLI (`codex exec`, your ChatGPT login).

Personal use only. Your subscription's own terms apply: don't share or host it for others.

## Start it

```sh
node tools/subscription-proxy/proxy.mjs --port 8787
```

In the NeverQuestAlone app, pick **Other**, then **Connect another AI**:

- Base URL: `http://localhost:8787/v1`
- Key: leave it empty
- Model: one of the ids below

| Model | Uses | Measured reply time (Windows, WoW open, 2026-11-08) |
|---|---|---|
| `codex:gpt-reserve` | Codex, ChatGPT login | about 4.5 s |
| `codex:gpt-6-astra` | Codex, ChatGPT login | about 8 s |
| `codex` | Codex's own default model | about 9 s |
| `claude-code:haiku` | Claude Code | about 2.3 s |
| `claude-code` (Sonnet), `claude-code:opus` | Claude Code | about 7.5 s and up |

A ChatGPT login refuses some Codex models (`gpt-6-luna`, `gpt-6-sol`, `gpt-6.1-sol`, `gpt-6.1-terra` on 2026-11-08). With an API key, the app's own Claude or ChatGPT card is faster: it skips starting a CLI for every turn.

## What it does and doesn't

- It listens on `127.0.0.1` only, so nothing else on your network can spend your subscription.
- Claude Code runs with no tools (`--tools ""`), no settings, hooks or MCP servers, and at low effort.
- Codex runs read-only in an empty folder and is told not to use tools. Codex always loads your global `AGENTS.md`; the proxy tells it to set that aside for these turns.
- Any `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` in the environment is removed for the CLI, so it uses your subscription, not API billing.
- The app shows a server on `localhost` as private ("your messages stay on this computer"). With this proxy they go to Anthropic or OpenAI.

| Environment variable | Default | What it does |
|---|---|---|
| `NQA_PROXY_PORT` | `8787` | The port |
| `NQA_CLAUDE_BIN`, `NQA_CODEX_BIN` | `claude`, `codex` | Where the CLIs are |
| `NQA_CLAUDE_EFFORT`, `NQA_CODEX_EFFORT` | `low` | Thinking effort |
| `NQA_CODEX_MODEL` | Codex's own | The model plain `codex` uses |
| `NQA_PROXY_MAX_RUNS` | `2` | Turns at once |
| `NQA_PROXY_LOG` | the temp folder | Its log file |
