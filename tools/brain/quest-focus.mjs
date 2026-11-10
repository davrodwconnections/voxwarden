// Resolve only against the captured character's quest log. Conversation text
// selects an ID; it never supplies facts, coordinates or completion state.
export function questFocus(question,state,history=[],limit=6){
  const log=(Array.isArray(state?.quests)?state.quests:[]).filter(q=>Number.isInteger(q?.id)&&q.id>0);
  const text=String(question||'').toLowerCase();
  const ids=new Set([...text.matchAll(/(?:quest|misi[oó]n|#)\s*(\d{1,7})\b/g)].map(m=>Number(m[1])));
  const named=q=>ids.has(q.id)||(typeof q.title==='string'&&q.title.length>2&&text.includes(q.title.toLowerCase()));
  if(!log.some(named)&&!/entreg|turn.?in|misi[oó]n|misiones|\bquests?\b|qu[eé].*(?:hacer|ahora)|what.*(?:do|next)|pendiente|busca.*d[oó]nde|nueva|esa\b|that one/i.test(text))return [];
  const prior=(Array.isArray(history)?history:[]).slice(-6);
  const userText=prior.filter(m=>m?.role==='user').map(m=>String(m.content||m.text||'')).join(' ').toLowerCase();
  const allText=prior.map(m=>String(m?.content||m?.text||'')).join(' ').toLowerCase();
  const rank=q=>{const name=String(q.title||'').toLowerCase();return named(q)?[0,0]:name&&userText.includes(name)?[1,-userText.lastIndexOf(name)]:name&&allText.includes(name)?[2,-allText.lastIndexOf(name)]:q.complete?[3,0]:[4,0];};
  return [...log].sort((a,b)=>{const x=rank(a),y=rank(b);return x[0]-y[0]||x[1]-y[1];}).slice(0,Math.max(0,Math.min(limit,6)));
}
