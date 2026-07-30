import{FACTIONS,NODE_TYPES,cloneMap}from'./maps.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export class DominionEngine{
 constructor(map,options={}){this.map=cloneMap(map);this.nodes=Object.fromEntries(this.map.nodes.map(n=>[n.id,n]));this.links=this.map.links;this.convoys=[];this.effects=[];this.time=0;this.speed=1;this.result=null;this.energy=25;this.reputation=100;this.stats={sent:0,captured:0,lost:0,abilities:0};this.boostUntil=0;this.aiClock={red:1.1,violet:1.7};this.difficulty=options.difficulty||1;this.rng=mulberry32(options.seed||hash(map.id));this.events=[];this.abilityHistory=new Set()}
 neighbors(id){return this.links.flatMap(([a,b])=>a===id?[this.nodes[b]]:b===id?[this.nodes[a]]:[])}
 connected(a,b){return this.links.some(([x,y])=>(x===a&&y===b)||(x===b&&y===a))}
 factionNodes(owner){return Object.values(this.nodes).filter(n=>n.owner===owner)}
 factionPower(owner){return this.factionNodes(owner).reduce((s,n)=>s+n.troops,0)+this.convoys.filter(c=>c.owner===owner).reduce((s,c)=>s+c.amount,0)}
 send(fromId,toId,ratio=.5,owner='player'){
  const from=this.nodes[fromId],to=this.nodes[toId];if(this.result||!from||!to||from.owner!==owner||!this.connected(fromId,toId))return false;
  const amount=Math.floor(from.troops*clamp(ratio,.15,.9));if(amount<2)return false;from.troops-=amount;const len=distance(from,to);this.convoys.push({id:`c${this.time}-${this.rng()}`,from:fromId,to:toId,owner,amount,progress:0,speed:owner==='player'?150:135+this.difficulty*9,length:len});if(owner==='player')this.stats.sent+=amount;return true
 }
 useAbility(type,targetId){if(this.result)return false;const costs={shield:35,overdrive:60,strike:50,surge:75};const cost=costs[type];if(!cost||this.energy<cost)return false;
  if(type==='shield'){const n=this.nodes[targetId];if(!n||n.owner!=='player')return false;n.shieldUntil=this.time+16;this.events.push({type:'good',text:`Купол активирован: ${targetId}`})}
  if(type==='overdrive'){this.boostUntil=this.time+18;this.events.push({type:'good',text:'Форсаж сети активирован'})}
  if(type==='strike'){const n=this.nodes[targetId];if(!n||n.owner==='player'||n.owner==='neutral')return false;const damage=Math.max(12,Math.round(n.troops*.38));n.troops=Math.max(1,n.troops-damage);this.effects.push({type:'strike',x:n.x,y:n.y,life:1});this.events.push({type:'good',text:`Импульс: −${damage} сил`})}
  if(type==='surge'){this.factionNodes('player').forEach(n=>n.troops=Math.min(this.capacity(n),n.troops+12));this.events.push({type:'good',text:'Проведена общая мобилизация'})}
  this.energy-=cost;this.stats.abilities++;this.abilityHistory.add(type);return true
 }
 capacity(node){return NODE_TYPES[node.type].capacity+(node.level-1)*18}
 update(dt){if(this.result||this.speed===0)return;dt=Math.min(.05,dt)*this.speed;this.time+=dt;this.energy=clamp(this.energy+dt*1.6,0,100);
  for(const n of Object.values(this.nodes)){if(n.owner==='neutral')continue;const cfg=NODE_TYPES[n.type];let growth=cfg.growth*(1+(n.level-1)*.18);if(n.owner==='player'&&this.time<this.boostUntil)growth*=1.85;n.troops=Math.min(this.capacity(n),n.troops+growth*dt)}
  const arrived=[];for(const c of this.convoys){c.progress+=c.speed*dt/c.length;if(c.progress>=1)arrived.push(c)}for(const c of arrived){this.resolveArrival(c);this.convoys.splice(this.convoys.indexOf(c),1)}
  this.effects.forEach(e=>e.life-=dt);this.effects=this.effects.filter(e=>e.life>0);this.updateAI('red',dt);this.updateAI('violet',dt);this.checkResult()
 }
 resolveArrival(c){const target=this.nodes[c.to];if(!target)return;if(target.owner===c.owner){target.troops=Math.min(this.capacity(target),target.troops+c.amount);return}const cfg=NODE_TYPES[target.type];const shield=target.shieldUntil>this.time?1.65:1;const effective=c.amount/(cfg.defense*shield);if(effective>=target.troops){const previous=target.owner;const remain=Math.max(2,Math.round(c.amount-target.troops*cfg.defense*shield));target.owner=c.owner;target.troops=remain;target.shieldUntil=0;if(c.owner==='player'){this.stats.captured++;this.events.push({type:'good',text:`Сектор ${target.id} захвачен`})}if(previous==='player'){this.stats.lost++;this.reputation=clamp(this.reputation-8,0,100);this.events.push({type:'bad',text:`Сектор ${target.id} потерян`})}}else target.troops=Math.max(0,target.troops-effective)}
 updateAI(owner,dt){if(!this.factionNodes(owner).length)return;this.aiClock[owner]-=dt;if(this.aiClock[owner]>0)return;this.aiClock[owner]=clamp(2.8-this.difficulty*.42+this.rng()*1.3,1.05,3.3);const sources=this.factionNodes(owner).filter(n=>n.troops>22).sort((a,b)=>b.troops-a.troops);if(!sources.length)return;const source=sources[Math.floor(this.rng()*Math.min(3,sources.length))];const candidates=this.neighbors(source.id);if(!candidates.length)return;const scored=candidates.map(t=>{let score=0;if(t.owner!==owner)score+=38;if(t.owner==='player')score+=18*this.difficulty;if(t.owner==='neutral')score+=12;if(t.type==='factory'||t.type==='reactor')score+=14;if(t.type==='fortress')score-=14;score+=source.troops-t.troops;score+=this.rng()*18;return{t,score}}).sort((a,b)=>b.score-a.score);const target=scored[0].t;if(target.owner===owner&&target.troops>source.troops*.8)return;this.send(source.id,target.id,source.troops>70?.66:.48,owner)}
 checkResult(){const enemies=['red','violet'].some(f=>this.factionNodes(f).length>0);const player=this.factionNodes('player').length>0;if(!player)this.result='defeat';else if(!enemies)this.result='victory'}
 snapshot(){return{time:this.time,energy:this.energy,reputation:this.reputation,result:this.result,nodes:Object.values(this.nodes).map(n=>({...n})),convoys:this.convoys.map(c=>({...c})),stats:{...this.stats}}}
}
function hash(s){let h=2166136261;for(const ch of s)h=Math.imul(h^ch.charCodeAt(0),16777619);return h>>>0}
function mulberry32(a){return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
export{FACTIONS,NODE_TYPES};
