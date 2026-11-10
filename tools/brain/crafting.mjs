// Conservative per-craft opportunity cost. Auction quotes are observations, not
// executable bids or evidence of demand. Currency is copper throughout.
const integer=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
export function analyzeCrafting(crafting,{now=Date.now(),maxAgeDays=2,maxSnapshotAgeSeconds=1800}={}) {
  if(crafting?.available!==true||!Array.isArray(crafting.recipes))return [];
  const age=integer(crafting.at)?now/1000-crafting.at:null;
  const fresh=age!==null&&age>=-60&&age<=maxSnapshotAgeSeconds;
  const priced=q=>q?.source==='auctionator'&&q.scope==='current-market'&&integer(q.copper,1,2147483647)&&integer(q.ageDays,0,maxAgeDays);
  return crafting.recipes.slice(0,8).map(r=>{
    const base={id:r.id,name:r.name,complete:false,feesIncluded:false,saleGuaranteed:false};
    const ingredients=Array.isArray(r.reagents)?r.reagents.slice(0,8):[];
    if(!fresh)return {...base,reason:'capture stale or capture age unknown; reopen profession'};
    if(r.unknown!==false||!integer(r.output,1)||!integer(r.min,1,10000)||!integer(r.max,r.min,10000)||!ingredients.length||ingredients.length!==r.reagents.length)return {...base,reason:'ingredients, output or quantity unknown'};
    if(!priced(r.quote)||!ingredients.every(i=>integer(i.id,1)&&integer(i.count,1,1000000)&&priced(i.quote)))return {...base,reason:'missing or old current-market price; refresh Auctionator quotes'};
    const materialCost=ingredients.reduce((n,i)=>n+i.count*i.quote.copper,0);
    const grossMin=r.min*r.quote.copper,grossMax=r.max*r.quote.copper;
    if(![materialCost,grossMin,grossMax].every(Number.isSafeInteger))return {...base,reason:'values outside supported bounds'};
    return {...base,complete:true,materialCost,grossMin,grossMax,marginMin:grossMin-materialCost,marginMax:grossMax-materialCost,
      priceAgeDays:Math.max(r.quote.ageDays,...ingredients.map(i=>i.quote.ageDays)),reason:'opportunity cost includes gathered materials; before fees, deposits and tradeability check; demand unknown'};
  });
}
export function craftingLines(crafting,options){
  return analyzeCrafting(crafting,options).map(r=>r.complete
    ? `[game+auctionator] ${r.name||r.id}: materials ${r.materialCost} copper per craft; margin ${r.marginMin}..${r.marginMax} copper before fees/deposits, sale and tradeability unknown; price age ${r.priceAgeDays} whole days. Gathered materials valued at market price.`
    : `[game] ${r.name||r.id}: margin unknown before fees: ${r.reason}. Gathered materials are not free.`);
}
export function shoppingList(crafting,recipeID){
 const recipe=crafting?.recipes?.find(r=>r.id===recipeID);if(!recipe)return null;
 return {recipeID,at:crafting.at,incomplete:recipe.unknown!==false,bankChecked:false,items:(recipe.reagents||[]).slice(0,8).map(i=>({id:i.id,name:i.name,required:i.count,carriedAtCapture:i.owned,
  shortageInBags:integer(i.count,1)&&integer(i.owned)?Math.max(0,i.count-i.owned):null})),note:'One craft, captured bag counts only. Check personal bank and current inventory before buying.'};
}
