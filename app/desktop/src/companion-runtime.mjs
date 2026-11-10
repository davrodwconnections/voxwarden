import fs from 'node:fs';import path from 'node:path';import {Worker}from'node:worker_threads';
import {importBridge}from'./bridge-module.mjs';
export function voiceNetworkAllowed(raw,origin){try{const u=new URL(raw);return !u.username&&!u.password&&(u.origin===origin||(u.protocol==='https:'&&u.hostname==='api.openai.com'&&(!u.port||u.port==='443')));}catch{return false;}}
export function voicePermissionAllowed({owner,contents,origin,requestingUrl,permission,mediaTypes,consent}){
 if(!consent||!owner||contents!==owner||permission!=='media'||!Array.isArray(mediaTypes)||!mediaTypes.length||mediaTypes.some(t=>t!=='audio'))return false;
 try{return new URL(requestingUrl).origin===origin;}catch{return false;}
}
export async function createCompanionRuntime({api,dataDir,BrowserWindow,session,ledger,onChange=()=>{},log=()=>{},showVoiceWindow=true}){
 const [{createServer,DEFAULTS,validateVoiceKey},{createEgress},{readVoiceControl}]=await Promise.all([importBridge('tools/voice/server.mjs'),importBridge('bridge/byok/security/egress.mjs'),importBridge('tools/voice/game.mjs')]);
 const consentFile=path.join(dataDir,'companion-preferences.json');let consent=false;
 try{consent=JSON.parse(fs.readFileSync(consentFile,'utf8')).voiceConsent===true;}catch{}
 let voiceWindow=null,server=null,origin=null,worker=null,preparing=null,rejectPrepare=null,closed=false,opening=null;
 let prepared=false;const abort=new AbortController();
 let knowledge={phase:'not_prepared'};try{knowledge=JSON.parse(fs.readFileSync(path.join(dataDir,'brain','knowledge.json'),'utf8'));}catch{}
 if(!fs.existsSync(path.join(dataDir,'brain','WorldData.lua'))&&knowledge.phase==='ready')knowledge={phase:'not_prepared'};
 const egress=createEgress({allowHosts:()=>new Map([['api.openai.com','voice'],['nether.wowhead.com','game_reference'],['github.com','game_data'],['release-assets.githubusercontent.com','game_data'],['objects.githubusercontent.com','game_data']]),
  onEvent:e=>ledger?.record({allow:e.type==='connect',kind:e.type,host:e.host,scheme:'https',port:e.port,feature:e.feature},`https://${e.host}/`)});
 const status=()=>({ok:true,knowledge:{phase:knowledge.phase,counts:knowledge.counts||null,received:knowledge.received,total:knowledge.total},voice:{consented:consent,open:!!voiceWindow&&!voiceWindow.isDestroyed(),connected:!!server}});
 const changed=()=>onChange(status());
 async function prepareKnowledge(){
  if(closed)return {ok:false,error:'stopped'};
  if(prepared)return status();
  if(preparing)return preparing;
  preparing=new Promise((resolve,reject)=>{
   let finished=false;rejectPrepare=reject;worker=new Worker(new URL('./knowledge-worker.mjs',import.meta.url),{workerData:{dataDir}});
   const own=worker;const send=m=>{try{own.postMessage(m);}catch{}};
   worker.on('message',async m=>{
    if(m.type==='fetch'){
     try{
      const u=new URL(m.url);if(u.protocol!=='https:'||u.username||u.password||!['github.com','release-assets.githubusercontent.com','objects.githubusercontent.com'].includes(u.hostname))throw Error('Refused download');
      const r=await egress.fetch(u,{redirect:'manual',signal:AbortSignal.any([abort.signal,AbortSignal.timeout(120000)])});
      const parts=[];let bytes=0;const reader=r.body?.getReader();if(reader){for(;;){const x=await reader.read();if(x.done)break;bytes+=x.value.byteLength;if(bytes>16*1024*1024){await reader.cancel();throw Error('Download too large');}parts.push(Buffer.from(x.value));}}
      send({id:m.id,status:r.status,headers:[...r.headers],body:Buffer.concat(parts)});
     }catch{send({id:m.id,error:true});}
    }else if(m.type==='progress'){knowledge=m.value;changed();}
    else if(m.type==='done'){finished=true;prepared=true;knowledge=m.value;try{await api.warmKnowledge?.();}catch{}changed();resolve({ok:true,...status()});}
    else if(m.type==='failed'){finished=true;knowledge={phase:'failed'};changed();reject(Error('Game knowledge setup failed; retry when connected.'));}
   });
   worker.once('error',()=>reject(Error('Game knowledge worker failed.')));
   worker.once('exit',()=>{if(!finished)reject(Error('Game knowledge worker stopped.'));});
  }).catch(e=>({ok:false,error:'knowledge_setup_failed',message:e.message})).finally(()=>{worker=null;preparing=null;rejectPrepare=null;});
  return preparing;
 }
 async function voiceServer(){
  if(server)return;
  server=createServer({...DEFAULTS,port:0,host:'127.0.0.1',appData:dataDir,web:true},{
   key:async()=>{const key=await api.voiceRuntimeKey();return typeof key==='string'?key:null;},fetchFn:egress.fetch,
   answerBrain:v=>api.askVoice(v),log:(event)=>log('voice-runtime',{event})});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});origin=`http://127.0.0.1:${server.address().port}`;changed();
 }
 async function openVoiceNow({approved=false}={}){
  if(closed)return {ok:false,error:'stopped'};
  if(!consent&&!approved)return {ok:false,error:'consent_required'};
  if(approved){consent=true;fs.writeFileSync(consentFile,JSON.stringify({voiceConsent:true}),{mode:0o600});}
  await voiceServer();
  if(closed)return {ok:false,error:'stopped'};
  if(voiceWindow&&!voiceWindow.isDestroyed()){if(showVoiceWindow)voiceWindow.show();return {ok:true};}
  const ses=session.fromPartition('voxwarden-voice');
  voiceWindow=new BrowserWindow({width:520,height:700,show:false,title:'Voxwarden Voice',backgroundColor:'#10171d',webPreferences:{session:ses,contextIsolation:true,sandbox:true,nodeIntegration:false,webSecurity:true,spellcheck:false}});
  const owned=voiceWindow.webContents;
  ses.webRequest.onBeforeRequest((d,cb)=>{const allow=voiceNetworkAllowed(d.url,origin);try{const u=new URL(d.url);if(u.protocol==='https:')ledger?.record({allow,kind:allow?'voice':'host',host:u.hostname,port:443,scheme:'https',feature:'voice'},d.url);}catch{}cb({cancel:!allow});});
  ses.setPermissionRequestHandler((contents,permission,callback,details)=>callback(voicePermissionAllowed({owner:owned,contents,origin,requestingUrl:details.requestingUrl||details.requestingOrigin,permission,mediaTypes:details.mediaTypes,consent})));
  ses.setPermissionCheckHandler((contents,permission,requestingOrigin,details)=>voicePermissionAllowed({owner:owned,contents,origin,requestingUrl:requestingOrigin,permission,mediaTypes:details?.mediaType==='audio'?['audio']:details?.mediaTypes,consent}));
  ses.setDisplayMediaRequestHandler((_request,callback)=>callback({}));
  owned.setWindowOpenHandler(()=>({action:'deny'}));
  owned.on('will-navigate',(event,url)=>{if(new URL(url).origin!==origin)event.preventDefault();});
  owned.on('will-redirect',event=>event.preventDefault());
  voiceWindow.once('closed',()=>{voiceWindow=null;changed();});
  await voiceWindow.loadURL(origin+'/');if(showVoiceWindow)voiceWindow.show();changed();return {ok:true};
 }
 function openVoice(options){if(opening)return opening;opening=openVoiceNow(options).finally(()=>{opening=null;});return opening;}
 let lastControl=0;
 const controlTimer=setInterval(()=>{if(!consent||closed)return;const c=readVoiceControl(dataDir);if(c&&c.n!==lastControl){lastControl=c.n;if(['talk','tip'].includes(c.cmd)&&!voiceWindow)openVoice().catch(()=>{});}},1000);controlTimer.unref?.();
 async function closeVoice(){voiceWindow?.destroy();voiceWindow=null;if(server){const s=server;server=null;await new Promise(r=>{s.close(r);s.closeAllConnections?.();});}changed();return {ok:true};}
 async function stop(){closed=true;abort.abort();clearInterval(controlTimer);if(worker){const own=worker;rejectPrepare?.(Error('Stopped'));await own.terminate();worker=null;}await opening?.catch(()=>{});await closeVoice();egress.uninstall();}
 return {status,prepareKnowledge,openVoice,closeVoice,stop,validateVoiceKey:key=>validateVoiceKey(key,{fetchFn:egress.fetch}),voiceSurface:()=>voiceWindow?.webContents};
}
