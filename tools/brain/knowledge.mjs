// First-run game knowledge, downloaded directly from the original publisher.
// No user's database or third-party dataset is distributed with the installer.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { openBrain, brainFile } from './db.mjs';
import { importQuestie } from './questie.mjs';

export const KNOWLEDGE_SOURCE=Object.freeze(JSON.parse(fs.readFileSync(new URL('./knowledge-source.json',import.meta.url),'utf8')));
const MAX_UNPACKED=256*1024*1024, MAX_FILE=128*1024*1024, MAX_ENTRIES=10000;
const statusFile=dir=>path.join(dir,'brain','knowledge.json');
export function readKnowledgeStatus(dir) {
  try {return JSON.parse(fs.readFileSync(statusFile(dir),'utf8'));} catch {return {phase:'missing'};}
}
function writeStatus(dir,status) {
  const file=statusFile(dir);fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const tmp=`${file}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(tmp,JSON.stringify(status)+'\n',{flag:'wx',mode:0o600});fs.renameSync(tmp,file);
}
function checkedName(name) {
  if (!name.startsWith('QuestieDB/') || /[\\:\x00-\x1f]/.test(name)) throw Error('Invalid knowledge entry path');
  const parts=name.split('/').filter(Boolean);
  if (parts.some(p=>p==='.'||p==='..'||/[. ]$/.test(p)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))) throw Error('Invalid knowledge entry path');
  return name;
}
/** Bounded ZIP reader: stored/deflated only, no encryption, links or path traversal. */
export function extractKnowledgeZip(bytes,destination) {
  const b=Buffer.from(bytes), end=b.lastIndexOf(Buffer.from([0x50,0x4b,0x05,0x06]));
  if (end<0||end+22>b.length||end+22+b.readUInt16LE(end+20)!==b.length) throw Error('Invalid knowledge ZIP entry directory');
  const count=b.readUInt16LE(end+10), start=b.readUInt32LE(end+16), length=b.readUInt32LE(end+12);
  if (b.readUInt16LE(end+4)||b.readUInt16LE(end+6)||count>MAX_ENTRIES||count===0xffff||start+length!==end) throw Error('Unsupported knowledge ZIP directory');
  let at=start,total=0;const entries=[],seen=new Set();
  for(let i=0;i<count;i++) {
    if(at+46>end||b.readUInt32LE(at)!==0x02014b50) throw Error('Invalid knowledge ZIP entry');
    const flags=b.readUInt16LE(at+8),method=b.readUInt16LE(at+10),crc=b.readUInt32LE(at+16),compressed=b.readUInt32LE(at+20),size=b.readUInt32LE(at+24);
    const n=b.readUInt16LE(at+28),extra=b.readUInt16LE(at+30),comment=b.readUInt16LE(at+32),local=b.readUInt32LE(at+42),mode=(b.readUInt32LE(at+38)>>>16)&0xf000;
    if(at+46+n+extra+comment>end) throw Error('Invalid knowledge ZIP entry bounds');
    const rawName=b.subarray(at+46,at+46+n),name=checkedName(rawName.toString('utf8'));
    if(!Buffer.from(name).equals(rawName)||seen.has(name.toLowerCase())||(flags&1)||![0,8].includes(method)||![0,0x8000,0x4000].includes(mode)) throw Error('Unsupported or duplicate knowledge entry');
    seen.add(name.toLowerCase());total+=size;
    if(size>MAX_FILE||total>MAX_UNPACKED||local+30>start||b.readUInt32LE(local)!==0x04034b50) throw Error('Invalid knowledge ZIP entry size');
    const ln=b.readUInt16LE(local+26),le=b.readUInt16LE(local+28),data=local+30+ln+le;
    if(b.readUInt16LE(local+8)!==method||data+compressed>start||!b.subarray(local+30,local+30+ln).equals(rawName)) throw Error('Invalid knowledge ZIP local entry');
    entries.push({name,method,crc,compressed,size,data});at+=46+n+extra+comment;
  }
  if(at!==end) throw Error('Invalid knowledge ZIP directory length');
  const root=path.resolve(destination);fs.mkdirSync(root,{recursive:true,mode:0o700});
  for(const e of entries) {
    const file=path.resolve(root,...e.name.split('/'));
    if(!file.startsWith(root+path.sep)) throw Error('Knowledge entry path escapes cache');
    if(e.name.endsWith('/')) {fs.mkdirSync(file,{recursive:true,mode:0o700});continue;}
    const compressed=b.subarray(e.data,e.data+e.compressed);
    const data=e.method===0?compressed:zlib.inflateRawSync(compressed,{maxOutputLength:Math.max(1,e.size)});
    if(data.length!==e.size||zlib.crc32(data)!==e.crc) throw Error('Knowledge entry integrity mismatch');
    fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});fs.writeFileSync(file,data,{flag:'wx',mode:0o600});
  }
  return path.join(root,'QuestieDB');
}
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
async function download(source,fetchFn,signal,onBytes) {
  let url=new URL(source.url);
  const allowed=new Set(['github.com','release-assets.githubusercontent.com','objects.githubusercontent.com']);
  for(let n=0;n<5;n++) {
    if(url.protocol!=='https:'||url.username||url.password||!allowed.has(url.hostname)) throw Error('Untrusted knowledge download destination');
    const r=await fetchFn(url.href,{redirect:'manual',signal,headers:{'user-agent':'Voxwarden','accept':'application/octet-stream'}});
    if([301,302,303,307,308].includes(r.status)) {const next=r.headers.get('location');await r.body?.cancel();if(!next)throw Error('Knowledge download redirect is missing');url=new URL(next,url);continue;}
    if(!r.ok) throw Error(`Game data download failed (${r.status})`);
    const parts=[];let size=0;
    for await(const chunk of r.body) {size+=chunk.length;if(size>source.bytes)throw Error('Knowledge download size mismatch');parts.push(chunk);onBytes?.(size);}
    const bytes=Buffer.concat(parts);
    if(bytes.length!==source.bytes||digest(bytes)!==source.sha256) throw Error('Knowledge archive integrity mismatch');
    return bytes;
  }
  throw Error('Too many knowledge download redirects');
}
function countsOf(file,minCounts) {
  const db=openBrain(file,{readOnly:true});
  try {return Object.fromEntries(Object.keys(minCounts).map(table=>{
    if(!['npc','quest','item'].includes(table))throw Error('Invalid knowledge table');
    return [table,db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n];
  }));} finally {db.close();}
}
function complete(counts,min) {return Object.entries(min).every(([k,n])=>Number.isInteger(counts[k])&&counts[k]>=n);}
export async function prepareKnowledge({dataDir,source=KNOWLEDGE_SOURCE,fetchFn=fetch,importer=importQuestie,onProgress=()=>{},signal}={}) {
  if(!path.isAbsolute(String(dataDir||''))||!/^\d+\.\d+\.\d+$/.test(source.version)||!/^[a-f0-9]{64}$/.test(source.sha256)) throw Error('Invalid knowledge setup configuration');
  const file=brainFile(dataDir),old=readKnowledgeStatus(dataDir),cache=path.join(dataDir,'cache','game-knowledge');
  const report=s=>{const out={source:source.id,version:source.version,flavor:source.flavor,provenance:source.provenance,...s};writeStatus(dataDir,out);onProgress(out);return out;};
  if(old.phase==='ready'&&old.archiveSha256===source.sha256&&fs.existsSync(file)) {
    try {const counts=countsOf(file,source.minCounts);if(complete(counts,source.minCounts)) {onProgress(old);return old;}}catch{}
  }
  fs.mkdirSync(cache,{recursive:true,mode:0o700});
  const root=fs.realpathSync(cache),temp=fs.mkdtempSync(path.join(root,'prepare-')),archive=path.join(root,`questiedb-${source.version}.zip`);
  try {
    report({phase:'checking'});let bytes=null;
    if(fs.existsSync(archive)) {const stat=fs.statSync(archive);if(stat.isFile()&&stat.size===source.bytes){const b=fs.readFileSync(archive);if(digest(b)===source.sha256)bytes=b;}}
    if(!bytes) {
      report({phase:'downloading',received:0,total:source.bytes});
      const timeout=AbortSignal.timeout(120000),s=signal?AbortSignal.any([signal,timeout]):timeout;
      bytes=await download(source,fetchFn,s,n=>onProgress({phase:'downloading',received:n,total:source.bytes}));
      const partial=path.join(temp,'archive.zip');fs.writeFileSync(partial,bytes,{flag:'wx',mode:0o600});fs.renameSync(partial,archive);
    }
    const addonDir=extractKnowledgeZip(bytes,path.join(temp,'source'));
    report({phase:'importing'});const db=openBrain(file);
    try {await importer({addonDir,db});} finally {db.close();}
    const counts=countsOf(file,source.minCounts);
    if(!complete(counts,source.minCounts))throw Error('Incomplete NPC, quest or item knowledge');
    const notices=path.join(root,`questiedb-${source.version}-notices`);fs.mkdirSync(notices,{recursive:true,mode:0o700});
    for(const name of ['LICENSE.md','gpl-3.0.md','PROVENANCE.md','CHANGELOG.md']) {const input=path.join(addonDir,name);if(fs.existsSync(input))fs.copyFileSync(input,path.join(notices,name));}
    return report({phase:'ready',counts,archiveSha256:source.sha256,preparedAt:Date.now()});
  } catch(e) {report({phase:'failed',error:'knowledge_setup_failed'});throw e;}
  finally {
    // Delete only the fresh temporary folder created under this explicitly resolved cache root.
    const resolved=path.resolve(temp);if(resolved.startsWith(root+path.sep)&&path.basename(resolved).startsWith('prepare-'))fs.rmSync(resolved,{recursive:true,force:true});
  }
}

/** Generate inert addon tables locally from the independently downloaded source.
 * Never copy a developer's database or paid guide supplements into a package. */
export async function prepareWorldKnowledge({dataDir,onProgress=()=>{}}={}){
 const source=KNOWLEDGE_SOURCE,cache=path.join(dataDir,'cache','game-knowledge');
 const archive=path.join(cache,`questiedb-${source.version}.zip`),bytes=fs.readFileSync(archive);
 if(bytes.length!==source.bytes||digest(bytes)!==source.sha256)throw Error('World source integrity mismatch');
 const root=fs.realpathSync(cache),temp=fs.mkdtempSync(path.join(root,'prepare-world-'));
 try{
  onProgress({phase:'preparing-map'});
  const addonDir=extractKnowledgeZip(bytes,path.join(temp,'source'));
  const {buildWorld,lua}=await import('./world-export.mjs');
  const db=openBrain(brainFile(dataDir),{readOnly:true});let data;
  try{data=buildWorld(db,{mappingText:fs.readFileSync(path.join(addonDir,'support/Forever/Zones/areaIdToUiMapId.lua'),'utf8'),license:fs.readFileSync(path.join(addonDir,'LICENSE.md'),'utf8')});}finally{db.close();}
  const text='-- Generated local-only inert world data.\nlocal _, ns = ...; ns.WorldData = '+lua(data)+'\n';
  if(Buffer.byteLength(text)>32*1024*1024)throw Error('World data exceeds budget');
  const file=path.join(dataDir,'brain','WorldData.lua');fs.writeFileSync(file+'.tmp',text,{mode:0o600});fs.renameSync(file+'.tmp',file);
  return {sha256:digest(Buffer.from(text)),bytes:Buffer.byteLength(text)};
 }finally{const resolved=path.resolve(temp);if(resolved.startsWith(root+path.sep)&&path.basename(resolved).startsWith('prepare-world-'))fs.rmSync(resolved,{recursive:true,force:true});}
}
