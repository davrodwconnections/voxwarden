import {parentPort,workerData} from 'node:worker_threads';
import {importBridge} from './bridge-module.mjs';
const {prepareKnowledge,prepareWorldKnowledge}=await importBridge('tools/brain/knowledge.mjs');
let next=0;const pending=new Map();
parentPort.on('message',m=>{const p=pending.get(m.id);if(!p)return;pending.delete(m.id);m.error?p.reject(Error('Knowledge download failed')):p.resolve(new Response(m.body,{status:m.status,headers:m.headers}));});
const fetchFn=(url,init)=>new Promise((resolve,reject)=>{const id=++next;pending.set(id,{resolve,reject});parentPort.postMessage({type:'fetch',id,url:String(url),redirect:init?.redirect});});
const progress=s=>parentPort.postMessage({type:'progress',value:s});
try{const knowledge=await prepareKnowledge({dataDir:workerData.dataDir,fetchFn,onProgress:progress});const world=await prepareWorldKnowledge({dataDir:workerData.dataDir,onProgress:progress});parentPort.postMessage({type:'done',value:{...knowledge,world}});}catch{parentPort.postMessage({type:'failed'});}
parentPort.close();
