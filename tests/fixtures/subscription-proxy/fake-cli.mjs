// A stand-in for the Claude Code and Codex CLIs (tests/subscription_proxy_test.mjs): it reads the
// prompt on stdin and answers in the CLI's own JSON lines, echoing what it was given.
import fs from 'node:fs';
const argv = process.argv.slice(2);
const input = fs.readFileSync(0, 'utf8');
const out = o => process.stdout.write(JSON.stringify(o) + '\n');
const env = { anthropic: !!process.env.ANTHROPIC_API_KEY, openai: !!process.env.OPENAI_API_KEY, nqa: !!process.env.NQA_API_KEY };
// Every start is counted in a file the test names, so a turn that never should start can be seen.
if (process.env.FAKE_CLI_STARTS) fs.appendFileSync(process.env.FAKE_CLI_STARTS, input.slice(-40).replace(/\n/g, ' ') + '\n');
if (input.includes('SLOW')) await new Promise(r => setTimeout(r, 1500));
if (argv[0] === 'exec') {
  if (input.includes('FAIL')) { out({ type: 'turn.failed', error: { message: 'You have hit your usage limit' } }); process.exit(1); }
  out({ type: 'thread.started', thread_id: 't' });
  out({ type: 'item.completed', item: { type: 'agent_message', text: `codex saw ${input.length} chars; args ${argv.join(' ')}; env ${JSON.stringify(env)}` } });
  out({ type: 'turn.completed', usage: { input_tokens: 100, cached_input_tokens: 40, output_tokens: 7, reasoning_output_tokens: 2 } });
} else {
  const sysFile = argv[argv.indexOf('--system-prompt-file') + 1];
  const sys = fs.readFileSync(sysFile, 'utf8');
  out({ type: 'system', subtype: 'init' });
  for (const part of ['claude ', 'saw ', `system=${sys.length} prompt=${input.length}; args ${argv.filter(a => !a.includes('system')).join(' ')}; env ${JSON.stringify(env)}`]) {
    out({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: part } } });
  }
  out({ type: 'result', is_error: false, stop_reason: 'end_turn', usage: { input_tokens: 50, cache_read_input_tokens: 10, output_tokens: 5 } });
}
