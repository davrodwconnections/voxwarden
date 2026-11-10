import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer, DEFAULTS } from '../tools/voice/server.mjs';

test('embedded voice binds an ephemeral localhost port and reads its key privately on demand',async()=>{
  const secret='sk-test-voice-private-not-a-real-key';let sent=null;
  const server=createServer({...DEFAULTS,host:'127.0.0.1',port:0},{key:async()=>secret,fetchFn:async(url,o)=>{sent=o.headers;return new Response(JSON.stringify({value:'ephemeral-client',expires_at:123}));}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try {
    const origin=`http://127.0.0.1:${server.address().port}`;
    const r=await fetch(origin+'/session',{method:'POST',headers:{origin,'content-type':'application/json'},body:'{}'});
    assert.equal(r.status,200);const body=await r.json();assert.equal(body.value,'ephemeral-client');
    assert.ok(JSON.stringify(sent).includes(secret));assert.ok(!JSON.stringify(body).includes(secret));
  } finally {await new Promise(r=>server.close(r));}
});

test('embedded voice answers through the connected backend without requiring a subscription proxy',async()=>{
  const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'voxwarden-native-voice-'));
  let asked=null;
  const server=createServer({...DEFAULTS,host:'127.0.0.1',port:0,appData:dataDir},{answerBrain:async v=>{asked=v;return {ok:true,answer:'The trainer is nearby.\n\nTL;DR: Nearby.'};},fetchFn:async()=>{throw Error('no text HTTP proxy should be used');}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try {
    const origin=`http://127.0.0.1:${server.address().port}`;
    const r=await fetch(origin+'/tool',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({name:'ask_brain',args:{question:'Where is the trainer?'}})});
    const body=await r.json();assert.equal(asked.question,'Where is the trainer?');assert.equal(body.answer,'The trainer is nearby.');
  } finally {await new Promise(r=>server.close(r));}
});
