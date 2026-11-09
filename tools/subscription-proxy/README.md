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

**Codex is disabled by default**, including the Codex models listed above. Use `claude-code` unless you explicitly accept the security risk below. The recorded reply times predate this hardening.

## Security: what it does and doesn't

- It listens on `127.0.0.1` only, so nothing else on your network can spend your subscription.
- Claude Code runs with no tools (`--tools ""`), no settings, hooks or MCP servers, and at low effort.
- Codex requests return HTTP 403 (`codex_tools_not_accepted`) before a CLI starts, including streaming requests, unless the proxy starts with exactly `NQA_PROXY_CODEX_TOOLS=accept`. A request cannot opt in for the operator.
- **Opting in is unsafe with untrusted game or web text.** A malicious quest title, chat message or web excerpt can try to make the agent use tools or disclose local files. A prompt saying "do not use tools" is not a security boundary. A scratch working directory does not confine file reads to that directory.
- When opted in, Codex uses a fresh empty scratch directory, `--sandbox read-only` (no writes or network for sandboxed commands), `approval_policy="never"` (no escalation approvals), disabled web search, an empty `mcp_servers` configuration, and disabled apps, plugins, remote plugins, hooks and skill MCP installation. Shell and local image tools are also disabled as defense in depth. User config and execpolicy rules are ignored; strict config parsing rejects unsupported settings. These restrictions are **not a verified no-tools mode** and do not guarantee that all local file access is impossible. Codex can still load global instructions such as `AGENTS.md`.
- Any `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` in the environment is removed for the CLI, so it uses your subscription, not API billing.
- The app shows a server on `localhost` as private ("your messages stay on this computer"). With this proxy they go to Anthropic or OpenAI.

### Evidence and explicit opt-in

Checked on 2026-11-08 with installed **codex-cli 0.166.0**: `codex --help`, `codex exec --help` and `codex features list`. Neither help command offers a general no-tools switch. The feature list confirms individual switches such as `shell_tool`, `view_image`, `apps` and `plugins`; their presence does not establish that every tool can be removed. OpenAI's [configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference) documents these separate controls and notes that user opt-outs of `unified_exec` are ignored. Its [sandbox documentation](https://learn.chatgpt.com/docs/agent-approvals-security) explicitly describes read-only mode as allowing file reads and command execution. We could not verify a supported zero-tools turn, so the proxy fails closed by default.

Only if you accept that risk, start it from PowerShell with:

```powershell
$env:NQA_PROXY_CODEX_TOOLS = 'accept'
node tools/subscription-proxy/proxy.mjs --port 8787
```

To revoke acceptance, stop the proxy, run `Remove-Item Env:NQA_PROXY_CODEX_TOOLS`, and restart it. Claude Code remains available without this opt-in. Network restrictions apply to agent tools; the CLI still needs to contact OpenAI to answer. Automated proxy tests use a fake CLI and verify refusal and arguments, not real Windows sandbox enforcement or resistance to prompt injection. Prefer Claude's no-tools route for untrusted game text.

| Environment variable | Default | What it does |
|---|---|---|
| `NQA_PROXY_PORT` | `8787` | The port |
| `NQA_CLAUDE_BIN`, `NQA_CODEX_BIN` | `claude`, `codex` | Where the CLIs are |
| `NQA_CLAUDE_EFFORT`, `NQA_CODEX_EFFORT` | `low` | Thinking effort |
| `NQA_CODEX_MODEL` | Codex's own | The model plain `codex` uses |
| `NQA_PROXY_CODEX_TOOLS` | unset (Codex refused) | Exactly `accept` enables the unsafe Codex route; read the security section first |
| `NQA_PROXY_MAX_RUNS` | `2` | Turns at once |
| `NQA_PROXY_LOG` | the temp folder | Its log file |
