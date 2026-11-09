// One-time, local-only migration. Copies user state and backs up the old addon;
// never overwrites a destination, deletes data or copies an OS credential store.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const STATE = ['config.json','byok-chats.json','ledger.json','usage-history.json','memory','transcripts','brain','bridge'];
const inside = (root, file) => { const rel = path.relative(root, file); return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel)); };
function noLinks(file) {
  const st = fs.lstatSync(file);
  if (st.isSymbolicLink()) throw new Error('A migration source contains a link; inspect it before continuing.');
  if (st.isDirectory()) for (const name of fs.readdirSync(file)) noLinks(path.join(file,name));
}
export function migrateVoxwarden({ flavorDir, fromData, toData, backupDir, apply = false, running = false }) {
  if (running) throw new Error('Close WoW, both desktop apps and their source/voice processes before migrating.');
  for (const value of [flavorDir, fromData, toData, backupDir]) if (typeof value !== 'string' || !path.isAbsolute(value)) throw new Error('Migration paths must be explicit and absolute.');
  const [flavor, source, target, backup] = [flavorDir,fromData,toData,backupDir].map(p => path.resolve(p));
  if (inside(source,target) || inside(target,source) || inside(source,backup) || inside(target,backup)) throw new Error('Source, destination and backup must not overlap.');
  if (inside(flavor,target) || inside(path.join(flavor,'Interface','AddOns'),backup)) throw new Error('User data and addon backups must stay outside the live AddOns folder.');
  if (fs.existsSync(target)) throw new Error('The Voxwarden data destination already exists; nothing was overwritten.');
  if (fs.existsSync(backup)) throw new Error('The backup destination already exists; use a fresh backup folder.');
  const addon = path.join(flavor,'Interface','AddOns','NeverQuestAlone');
  const newAddon = path.join(flavor,'Interface','AddOns','Voxwarden');
  if (fs.existsSync(newAddon)) throw new Error('Voxwarden is already installed; inspect its state before migrating.');
  const copies = STATE.map(n => ({from:path.join(source,n),to:path.join(target,n)})).filter(x => fs.existsSync(x.from));
  const saves=[];
  const visit = dir => {
    if (!fs.existsSync(dir)) return;
    const stat=fs.lstatSync(dir); if (stat.isSymbolicLink()) throw new Error('The game data contains a link; inspect it before continuing.');
    if (!stat.isDirectory()) return;
    for (const e of fs.readdirSync(dir,{withFileTypes:true})) {
      const file=path.join(dir,e.name);
      if (e.isSymbolicLink()) throw new Error('The game data contains a link; inspect it before continuing.');
      if (e.isDirectory()) visit(file);
      else if (e.name==='NeverQuestAlone.lua' && path.basename(dir)==='SavedVariables') {
        const to=path.join(dir,'Voxwarden.lua'); if (fs.existsSync(to)) throw new Error('A Voxwarden saved-variable file already exists; nothing was overwritten.');
        saves.push({from:file,to});
      }
    }
  };
  visit(path.join(flavor,'WTF','Account'));
  for (const x of copies) noLinks(x.from);
  if (fs.existsSync(addon)) noLinks(addon);
  const plan={ dataEntries:copies.length, savedVariableFiles:saves.length, backsUpOldAddon:fs.existsSync(addon), applied:false };
  if (!apply) return plan;
  fs.mkdirSync(target,{recursive:true,mode:0o700});
  for (const x of copies) fs.cpSync(x.from,x.to,{recursive:true,errorOnExist:true,force:false});
  const config=path.join(target,'config.json');
  if (fs.existsSync(config)) {
    const c=JSON.parse(fs.readFileSync(config,'utf8'));
    if (c.byok?.persona?.name==='NeverQuestAlone') c.byok.persona.name='Voxwarden';
    if (c.byok?.persona==='NeverQuestAlone') c.byok.persona='Voxwarden';
    fs.writeFileSync(config,JSON.stringify(c,null,2)+'\n',{mode:0o600});
  }
  for (const x of saves) fs.copyFileSync(x.from,x.to,fs.constants.COPYFILE_EXCL);
  if (fs.existsSync(addon)) { fs.mkdirSync(backup,{recursive:true,mode:0o700}); fs.renameSync(addon,path.join(backup,'NeverQuestAlone')); }
  fs.writeFileSync(path.join(target,'voxwarden-migration.json'),JSON.stringify({v:1,at:new Date().toISOString(),dataEntries:copies.length,savedVariableFiles:saves.length,backup})+'\n',{mode:0o600});
  return {...plan,applied:true};
}

if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const value = flag => {const i=process.argv.indexOf(flag);return i<0?undefined:process.argv[i+1];};
    let running=false;
    if (process.platform==='win32') {
      const script="$p = Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^(Wow|NeverQuestAlone|Voxwarden)\\.exe$' -or ($_.Name -eq 'node.exe' -and $_.CommandLine -match '(bridge[\\/]nqa\\.mjs.*start|tools[\\/]voice[\\/]server\\.mjs)') }; if ($p) { exit 10 }";
      const r=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{stdio:'ignore'});
      if (r.status!==0 && r.status!==10) throw new Error('Could not verify that the game and apps are closed.');
      running=r.status===10;
    }
    console.log(JSON.stringify(migrateVoxwarden({flavorDir:value('--wow'),fromData:value('--from-data'),toData:value('--to-data'),backupDir:value('--backup'),apply:process.argv.includes('--apply'),running})));
  } catch(e) {console.error(e.message);process.exitCode=1;}
}
