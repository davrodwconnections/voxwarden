import test from 'node:test';import assert from 'node:assert/strict';
import {voiceNetworkAllowed,voicePermissionAllowed}from'../app/desktop/src/companion-runtime.mjs';
import {validateVoiceKey}from'../tools/voice/server.mjs';
test('voice surface permits only exact loopback origin and OpenAI https without credentials',()=>{
 const origin='http://127.0.0.1:12345';
 assert.equal(voiceNetworkAllowed(origin+'/app.js',origin),true);
 assert.equal(voiceNetworkAllowed('https://api.openai.com/v1/realtime/calls',origin),true);
 for(const url of ['http://localhost:12345/','http://127.0.0.1:54321/','https://api.openai.com.evil.test/','https://user:pass@api.openai.com/','file:///etc/passwd','https://api.openai.com:8443/'])assert.equal(voiceNetworkAllowed(url,origin),false,url);
});
test('microphone permission is tied to owned surface, consent and audio-only requests',()=>{
 const owner={};const origin='http://127.0.0.1:12345';
 assert.equal(voicePermissionAllowed({owner,contents:owner,origin,requestingUrl:origin+'/',permission:'media',mediaTypes:['audio'],consent:true}),true);
 for(const change of [{contents:{}},{consent:false},{requestingUrl:'https://evil.test/'},{mediaTypes:['video']},{mediaTypes:[]},{permission:'display-capture'}])assert.equal(voicePermissionAllowed({owner,contents:owner,origin,requestingUrl:origin+'/',permission:'media',mediaTypes:['audio'],consent:true,...change}),false);
});
test('voice key validation checks Realtime only and returns no long-lived or ephemeral secret',async()=>{
 let calls=0;
 const out=await validateVoiceKey('sk-test-private',{fetchFn:async(url,init)=>{calls++;assert.equal(url,'https://api.openai.com/v1/realtime/client_secrets');assert.equal(init.headers.authorization,'Bearer sk-test-private');return new Response(JSON.stringify({value:'ek-test-private',expires_at:100}));}});
 assert.deepEqual(out,{ok:true});assert.equal(calls,1);
 const denied=await validateVoiceKey('sk-test-private',{fetchFn:async()=>new Response(JSON.stringify({error:{message:'sk-test-private'}}),{status:403})});
 assert.deepEqual(denied,{ok:false,error:'voice_not_allowed'});
});
