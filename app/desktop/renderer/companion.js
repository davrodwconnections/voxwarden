(function(){'use strict';
 var api=window.nqa,card=document.getElementById('companion-setup'),line=document.getElementById('companion-ready');
 if(!api||!api.companionStatus||!card)return;
 var busy=false;
 function paint(s){if(!s||!s.ok)return;card.hidden=false;var k=s.knowledge||{};line.textContent='Game knowledge: '+String(k.phase||'not prepared').replace(/-/g,' ')+(k.counts?' — '+k.counts.npc+' NPCs, '+k.counts.quest+' quests':'')+'. Voice: '+(s.voice&&s.voice.open?'open':'closed')+'.';}
 async function refresh(){try{if(!busy)paint(await api.companionStatus());}catch{}}
 function bind(id,method){document.getElementById(id).addEventListener('click',async function(){if(busy)return;busy=true;this.disabled=true;line.textContent='Working…';try{var r=await api[method]();if(!r||r.ok===false)line.textContent=(r&&r.message)||'Could not finish: '+String(r&&r.error||'unavailable')+'. Retry when ready.';else paint(await api.companionStatus());}catch{line.textContent='Could not finish. Please retry.';}finally{busy=false;this.disabled=false;}});}
 bind('prepare-knowledge','prepareKnowledge');bind('paste-voice-key','pasteVoiceKey');bind('open-voice','openVoice');bind('close-voice','closeVoice');
 refresh();setInterval(refresh,3000);
})();
