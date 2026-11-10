import test from 'node:test';
import assert from 'node:assert/strict';
import { makeBackend, startMock, canaryKeystore, reply, sendParams, waitFor } from './helpers/byok-env.mjs';

test('desktop voice uses the configured provider and accounting, without publishing duplicate addon replies',async()=>{
  const mock=await startMock(()=>reply('The trainer is nearby.\n\nTL;DR: nearby.'));
  const env=makeBackend({url:mock.url,keystore:await canaryKeystore(),config:{model:'claude-sonnet-5'}});
  try {
    await env.backend.start();
    const out=await env.backend.askVoice({question:'Where is the trainer?',history:[{role:'user',content:'I am a shaman.'},{role:'assistant',content:'I can help.'}]});
    assert.equal(out.ok,true);assert.match(out.answer,/trainer/);
    assert.equal(mock.requests[0].body.model,'claude-sonnet-5');
    assert.ok(JSON.stringify(mock.requests[0].body).includes('I am a shaman.'));
    assert.equal(env.chats().length,0,'voice result is returned privately, not published twice');
    assert.equal(env.backend.slotExtras().bridge.usage.turns,1);
    const second=await env.backend.askVoice({question:'A different character?',history:[]});
    assert.equal(second.ok,true);
    assert.ok(!JSON.stringify(mock.requests.at(-1).body).includes('I am a shaman.'),'only caller-selected voice history is used');
  } finally {await env.backend.stop();await mock.close();}
});

test('cancelling a voice request does not abort the written message sharing its chat',async()=>{
  const mock=await startMock(()=>reply('Done.\n\nTL;DR: done.',{delayMs:150}));
  const env=makeBackend({url:mock.url,keystore:await canaryKeystore()});
  try {
    await env.backend.start();
    await env.backend.send(sendParams('c0ffee0','typed_1','Written question'));
    await waitFor(()=>mock.requests.length>0);
    const controller=new AbortController();
    const voice=env.backend.askVoice({question:'Spoken question',signal:controller.signal});controller.abort();
    assert.equal((await voice).ok,false);
    await waitFor(()=>env.chats('final').length===1);
    assert.equal(mock.requests.length,1,'cancelled queued voice is never billed or sent');
  } finally {await env.backend.stop();await mock.close();}
});
