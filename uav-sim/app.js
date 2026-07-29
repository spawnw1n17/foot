'use strict';

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const toRad=d=>d*Math.PI/180;
const toDeg=r=>r*180/Math.PI;
const fmt=n=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0}).format(n);
const money=n=>`${fmt(n)} ₽`;
const safeJsonParse=(s,fallback)=>{try{return JSON.parse(s)||fallback}catch{return fallback}};
const storageGet=(k,f=null)=>{try{return safeJsonParse(localStorage.getItem(k),f)}catch{return f}};
const storageSet=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch{}};
const todayKey=()=>new Date().toISOString().slice(0,10);

function defaultProfile(){return {
  version:4,level:1,xp:0,credits:1600,flights:0,successful:0,totalDistance:0,totalSeconds:0,gates:0,bestScore:0,
  unlocked:['mini','camera','fpv','orlan','eleron'],purchased:['mini','camera','fpv','orlan','eleron'],
  upgrades:{},achievements:[],usedModels:[],logs:[],records:{},dailyCompleted:null
}}
function defaultSettings(){return {sensitivity:1,quality:'high',haptics:true,assist:true,trail:true,sound:true,camera:'top'}}
let profile={...defaultProfile(),...storageGet(STORAGE_KEY,{})};
let settings={...defaultSettings(),...storageGet(SETTINGS_KEY,{})};

const state={
  model:MODEL_CATALOG.find(m=>m.id==='mini'),mission:MISSION_CATALOG.find(m=>m.id==='training'),category:'all',difficulty:'normal',weather:'breeze',time:'day',camera:settings.camera,
  phase:'setup',running:false,paused:false,launched:false,landing:false,rth:false,follow:true,homeChosen:true,routeEditing:false,
  pos:{...DEFAULT_CENTER},home:{...DEFAULT_CENTER},map:{center:{...DEFAULT_CENTER},zoom:14,dragging:false},
  alt:0,speed:0,heading:0,displayHeading:0,throttle:.44,battery:100,signal:100,verticalSpeed:0,roll:0,
  route:[],missionPoints:[],pointIndex:0,pointHold:0,totalDistance:0,flightSeconds:0,score:0,accuracy:100,
  keys:new Set(),stick:{left:{x:0,y:0},right:{x:0,y:0}},lastTime:0,toastTimer:null,audio:null,
  activeEvent:null,eventUntil:0,eventTriggered:0,nextEventAt:25,replayData:null,lastResult:null,tileErrors:0,quality:settings.quality,
  missionFlags:{},customPoints:[],searchTargetIndex:-1,damage:0
};

const RANKS=['Курсант','Оператор','Пилот','Старший пилот','Инструктор','Лётчик-испытатель','Командир звена','Мастер полёта','Эксперт авиации','Легенда неба'];
const levelFromXp=xp=>Math.floor(xp/1000)+1;
const xpInLevel=xp=>xp%1000;
function modelById(id){return MODEL_CATALOG.find(m=>m.id===id)||MODEL_CATALOG[0]}
function missionById(id){return MISSION_CATALOG.find(m=>m.id===id)||MISSION_CATALOG[1]}
function isModelAvailable(m){return m.unlock<=profile.level || profile.purchased.includes(m.id)}
function upgradeData(id){profile.upgrades[id]??={battery:0,motor:0,stability:0};return profile.upgrades[id]}
function effectiveModel(){
  const m=state.model,u=upgradeData(m.id);
  return {...m,speed:m.speed*(1+u.motor*.055),climb:m.climb*(1+u.motor*.045),drain:m.drain*(1-u.battery*.075),stability:clamp(m.stability+u.stability*3,0,100)};
}
function saveProfile(){profile.level=levelFromXp(profile.xp);storageSet(STORAGE_KEY,profile);renderCareer();renderHangarList();renderUpgrades();renderTopbar()}
function saveSettings(){storageSet(SETTINGS_KEY,settings)}
function haptic(pattern=20){if(settings.haptics&&navigator.vibrate)navigator.vibrate(pattern)}

function renderTopbar(){
  profile.level=levelFromXp(profile.xp);$('#levelBadge').textContent=profile.level;$('#pilotRank').textContent=RANKS[Math.min(RANKS.length-1,profile.level-1)];
  $('#creditsTop').textContent=money(profile.credits);$('#xpMiniBar').style.width=`${xpInLevel(profile.xp)/10}%`;
}
function renderMissionGrid(){
  const grid=$('#missionGrid');grid.innerHTML=MISSION_CATALOG.map(m=>{
    const locked=m.level>profile.level,active=m.id===state.mission.id;
    return `<button class="${active?'active ':''}${locked?'locked ':''}${m.id==='daily'?'daily':''}" data-mission="${m.id}" title="${m.name}${locked?` · уровень ${m.level}`:''}"><span>${m.icon}</span><small>${m.name.split(' ')[0]}</small></button>`
  }).join('');
  $('#selectedMissionName').textContent=state.mission.name;$('#missionDescription').textContent=state.mission.description;
  $('#routeEditBtn').classList.toggle('hidden',state.mission.id!=='custom');updateBriefing();
}
function renderModelList(){
  const filtered=MODEL_CATALOG.filter(m=>state.category==='all'||m.cat===state.category);
  $('#modelSelect').innerHTML=filtered.map(m=>`<option value="${m.id}" ${isModelAvailable(m)?'': 'disabled'}>${m.name}${isModelAvailable(m)?'':` · ур. ${m.unlock}`}</option>`).join('');
  if(!filtered.some(m=>m.id===state.model.id&&isModelAvailable(m)))state.model=filtered.find(isModelAvailable)||filtered[0];
  $('#modelSelect').value=state.model.id;renderModelCard();renderHangarList();renderUpgrades();
}
function renderModelCard(){
  const m=effectiveModel(),u=upgradeData(m.id);
  const stats=[['Скорость',m.speed,52],['Манёвренность',m.turn,100],['Набор высоты',m.climb,10],['Стабильность',m.stability,100],['Дальность',m.range,16],['Нагрузка',m.payload,7]];
  $('#modelCard').innerHTML=`<div class="model-top"><div class="model-icon">${m.icon}</div><div><b>${m.name}</b><small>${m.family} · ${m.launch}</small></div></div><div class="model-tags"><span>${m.hover?'Зависание':'Требует скорости'}</span><span>Сложность ${'●'.repeat(m.difficulty)}</span><span>${m.cat==='mil'?'Условный профиль ВС РФ':'Гражданский'}</span></div>${stats.map(([n,v,max])=>`<div class="stat-row"><span>${n}</span><div class="stat-track"><i style="width:${clamp(v/max*100,4,100)}%"></i></div><b>${Math.round(v/max*100)}</b></div>`).join('')}<p class="model-description">${m.desc} Модернизация: аккумулятор ${u.battery}/3, силовая установка ${u.motor}/3, стабилизация ${u.stability}/3.</p>`;
  $('#aircraft').classList.toggle('fixed-wing',!m.hover);$('#aircraft').dataset.model=m.id;
}
function renderHangarList(){
  const arr=MODEL_CATALOG.filter(m=>state.category==='all'||m.cat===state.category);
  $('#hangarList').innerHTML=arr.map(m=>{
    const owned=profile.purchased.includes(m.id),available=m.unlock<=profile.level,active=m.id===state.model.id;
    let action=owned?'Выбрать':available?money(m.price):`Ур. ${m.unlock}`;
    return `<div class="hangar-item ${active?'active':''} ${!owned&&!available?'locked':''}" data-model="${m.id}"><span>${m.icon}</span><div><b>${m.short}</b><small>${m.family} · ${m.speed*3.6|0} км/ч</small></div><button ${!available&&!owned?'disabled':''} data-buy="${m.id}">${action}</button></div>`
  }).join('');
}
function renderUpgrades(){
  const u=upgradeData(state.model.id),rows=[['battery','Аккумулятор','Меньше расход энергии'],['motor','Силовая установка','Выше скорость и набор'],['stability','Стабилизация','Меньше влияние ветра']];
  $('#upgradeList').innerHTML=rows.map(([id,n,d])=>{const level=u[id],cost=(level+1)*900;return `<div class="upgrade-row"><div><b>${n}</b><small>${d}</small><div class="upgrade-dots">${[0,1,2].map(i=>`<i class="${i<level?'on':''}"></i>`).join('')}</div></div><button data-upgrade="${id}" ${level>=3?'disabled':''}>${level>=3?'MAX':money(cost)}</button></div>`}).join('')
}
function renderCareer(){
  profile.level=levelFromXp(profile.xp);const rank=RANKS[Math.min(RANKS.length-1,profile.level-1)];
  $('#careerRank').textContent=rank;$('#careerLevelText').textContent=`Уровень ${profile.level} · ${money(profile.credits)}`;$('#xpText').textContent=`${xpInLevel(profile.xp)} / 1000`;$('#xpBar').style.width=`${xpInLevel(profile.xp)/10}%`;
  const rate=profile.flights?Math.round(profile.successful/profile.flights*100):0;
  $('#careerStats').innerHTML=[['Вылеты',profile.flights],['Успешность',`${rate}%`],['Налёт',formatTime(profile.totalSeconds)],['Дистанция',formatDistance(profile.totalDistance)],['Точки',profile.gates],['Рекорд',fmt(profile.bestScore)]].map(([n,v])=>`<div><small>${n.toUpperCase()}</small><b>${v}</b></div>`).join('');
  $('#achievementGrid').innerHTML=ACHIEVEMENTS.map(a=>`<div class="achievement ${profile.achievements.includes(a.id)?'unlocked':''}" title="${a.desc}"><span>${a.icon}</span><b>${a.name}</b><small>${profile.achievements.includes(a.id)?'Получено':'Закрыто'}</small></div>`).join('');
}
function renderLog(){
  const logs=[...profile.logs].reverse();$('#flightLog').innerHTML=logs.length?logs.map((l,i)=>`<div class="log-item"><div class="log-head"><b>${l.mission}</b><span>${l.date}</span></div><div class="log-meta"><span>${l.model}</span><span>${fmt(l.score)} очк. · ${l.success?'успех':'не завершено'}</span></div><button data-log-replay="${logs.length-1-i}">Посмотреть маршрут</button></div>`).join(''):'<div class="empty-state">Завершите первый полёт — здесь появится история.</div>';
  const recs=Object.entries(profile.records).sort((a,b)=>b[1]-a[1]).slice(0,8);$('#recordList').innerHTML=recs.length?recs.map(([id,score])=>`<div class="record"><span>${missionById(id).name}</span><b>${fmt(score)}</b></div>`).join(''):'<div class="empty-state">Рекордов пока нет.</div>';
}
function updateBriefing(){
  const m=state.mission,d=DIFFICULTIES[state.difficulty],w=WEATHER_PRESETS[state.weather];$('#briefingTitle').textContent=m.name;$('#briefingDescription').textContent=m.description;
  $('#briefingGrid').innerHTML=[['Аппарат',state.model.short],['Сложность',d.label],['Погода',w.label],['Награда',money(Math.round(m.reward*d.reward))],['Опыт',`${Math.round(m.xp*d.reward)} XP`],['Запуск',state.model.launch]].map(([n,v])=>`<div><small>${n.toUpperCase()}</small><b>${v}</b></div>`).join('')
}
function switchPanel(tab){
  $$('#panelTabs button').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));$$('.panel-view').forEach(v=>v.classList.toggle('active',v.dataset.view===tab));
  const titles={flight:'Подготовка полёта',hangar:'Ангар аппаратов',career:'Карьера пилота',log:'Журнал полётов'};$('#panelTitle').textContent=titles[tab];
  if(tab==='career')renderCareer();if(tab==='log')renderLog();
}
function setFlightState(text,type=''){const el=$('#flightState');el.className=`flight-state ${type}`.trim();el.querySelector('span').textContent=text}
function setObjective(text,index=1,hint=''){ $('#objectiveText').textContent=text;$('#objectiveIndex').textContent=index;$('#objectiveHint').textContent=hint }
function toast(text,duration=2400){const el=$('#toast');el.textContent=text;el.classList.add('visible');clearTimeout(state.toastTimer);state.toastTimer=setTimeout(()=>el.classList.remove('visible'),duration)}
function formatTime(s){const h=Math.floor(s/3600),m=Math.floor(s%3600/60),sec=Math.floor(s%60);return h?`${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`:`${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`}
function formatDistance(m){return m>=1000?`${(m/1000).toFixed(m>=10000?0:1)} км`:`${Math.round(m)} м`}
function playTone(freq=220,duration=.08,type='sine',volume=.035){if(!settings.sound)return;try{state.audio??=new (window.AudioContext||window.webkitAudioContext)();const o=state.audio.createOscillator(),g=state.audio.createGain();o.frequency.value=freq;o.type=type;g.gain.setValueAtTime(volume,state.audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,state.audio.currentTime+duration);o.connect(g).connect(state.audio.destination);o.start();o.stop(state.audio.currentTime+duration)}catch{}}
function engineTone(){if(!settings.sound||!state.launched)return;const m=effectiveModel();playTone(m.hover?85+state.throttle*95:58+state.throttle*48,.07,m.hover?'sawtooth':'triangle',.012)}
function unlockAchievement(id){if(profile.achievements.includes(id))return;const a=ACHIEVEMENTS.find(x=>x.id===id);if(!a)return;profile.achievements.push(id);toast(`Достижение: ${a.name}`,3200);playTone(760,.16,'sine',.045);haptic([35,40,60])}
function applySettings(){
  state.quality=settings.quality;document.body.classList.remove('quality-low','quality-medium','quality-high');document.body.classList.add(`quality-${settings.quality}`);
  $('#sensitivityRange').value=Math.round(settings.sensitivity*100);$('#sensitivityValue').textContent=`${Math.round(settings.sensitivity*100)}%`;$('#qualitySelect').value=settings.quality;$('#hapticsToggle').checked=settings.haptics;$('#assistToggle').checked=settings.assist;$('#trailToggle').checked=settings.trail;$('#soundBtn').textContent=settings.sound?'🔊':'🔇';
  createParticles();
}
function selectModel(id){
  const m=modelById(id);if(!profile.purchased.includes(id)){if(m.unlock>profile.level)return toast(`Требуется уровень ${m.unlock}`);if(profile.credits<m.price)return toast('Недостаточно средств');profile.credits-=m.price;profile.purchased.push(id);toast(`${m.short} добавлен в ангар`);saveProfile()}
  state.model=m;$('#modelSelect').value=id;renderModelCard();renderHangarList();renderUpgrades();updateBriefing();
}
function buyUpgrade(type){const u=upgradeData(state.model.id),level=u[type];if(level>=3)return;const cost=(level+1)*900;if(profile.credits<cost)return toast('Недостаточно средств');profile.credits-=cost;u[type]++;saveProfile();renderModelCard();renderUpgrades();toast('Модернизация установлена')}
function selectMission(id){const m=missionById(id);if(m.level>profile.level)return toast(`Миссия откроется на уровне ${m.level}`);if(id==='daily'&&profile.dailyCompleted===todayKey())toast('Ежедневное испытание уже выполнено — можно улучшить результат');state.mission=m;renderMissionGrid();prepareMission();updateBriefing()}
function createParticles(){
  const box=$('#particles');box.innerHTML='';const n=settings.quality==='low'?18:settings.quality==='medium'?34:55;for(let i=0;i<n;i++){const p=document.createElement('i');p.className='particle';p.style.left=`${Math.random()*100}%`;p.style.animationDuration=`${.7+Math.random()*1.5}s`;p.style.animationDelay=`${-Math.random()*2}s`;p.style.opacity=.25+Math.random()*.55;box.appendChild(p)}
}
function applyEnvironment(){
  state.weather=$('#weatherSelect').value;state.time=$('#timeSelect').value;const overlay=$('#weatherOverlay');overlay.className=`weather-overlay ${state.time==='day'?'':state.time} ${state.weather}`.trim();createParticles();updateBriefing();
}
function setCamera(mode){
  state.camera=mode;settings.camera=mode;saveSettings();$('#cameraSelect').value=mode;$('#world').classList.remove('camera-top','camera-chase','camera-cinematic');$('#world').classList.add(`camera-${mode}`);updateMapObjects();
}
function cycleCamera(){const modes=['top','chase','cinematic'],i=modes.indexOf(state.camera);setCamera(modes[(i+1)%modes.length]);toast(`Камера: ${$('#cameraSelect option:checked').textContent}`)}
function openBriefing(){updateBriefing();$('#briefingDialog').showModal()}
function initUi(){
  renderTopbar();renderMissionGrid();renderModelList();renderCareer();renderLog();applySettings();setCamera(settings.camera);applyEnvironment();
  $('#difficultySelect').value=state.difficulty;$('#weatherSelect').value=state.weather;$('#timeSelect').value=state.time;$('#cameraSelect').value=state.camera;
}
