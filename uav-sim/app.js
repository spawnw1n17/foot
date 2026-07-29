'use strict';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const toRad=d=>d*Math.PI/180;
const toDeg=r=>r*180/Math.PI;
const fmt=n=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0}).format(n);
const storageGet=k=>{try{return localStorage.getItem(k)}catch{return null}};
const storageSet=(k,v)=>{try{localStorage.setItem(k,v)}catch{}};

const MODELS=[
 {id:'mini',cat:'civil',name:'Лёгкий квадрокоптер',family:'Мультикоптер',icon:'✣',launch:'Вертикальный',speed:12,turn:58,climb:6,drain:.115,hover:true,stability:90},
 {id:'camera',cat:'civil',name:'Киносъёмочный квадрокоптер',family:'Мультикоптер',icon:'✥',launch:'Вертикальный',speed:15,turn:50,climb:5.5,drain:.105,hover:true,stability:95},
 {id:'hex',cat:'civil',name:'Грузовой гексакоптер',family:'Гексакоптер',icon:'✺',launch:'Вертикальный',speed:11,turn:35,climb:4.2,drain:.135,hover:true,stability:88},
 {id:'fpv',cat:'civil',name:'Гоночный FPV',family:'Мультикоптер',icon:'◆',launch:'Вертикальный',speed:28,turn:92,climb:9,drain:.18,hover:true,stability:62},
 {id:'wing',cat:'civil',name:'Гражданское летающее крыло',family:'Самолётный',icon:'➤',launch:'С руки',speed:31,turn:31,climb:5,drain:.075,hover:false,stability:74},
 {id:'vtol',cat:'civil',name:'Гражданский VTOL',family:'Гибридный',icon:'✈',launch:'Вертикальный',speed:35,turn:34,climb:6,drain:.082,hover:true,stability:83},
 {id:'orlan',cat:'mil',name:'Орлан-10 · игровой профиль',family:'Самолётный',icon:'➤',launch:'Катапульта',speed:32,turn:28,climb:5.2,drain:.066,hover:false,stability:82},
 {id:'eleron',cat:'mil',name:'Элерон-3 · игровой профиль',family:'Лёгкий самолётный',icon:'➤',launch:'С руки',speed:25,turn:40,climb:5.8,drain:.09,hover:false,stability:76},
 {id:'zala',cat:'mil',name:'ZALA 421-16E · игровой профиль',family:'Самолётный',icon:'➤',launch:'Катапульта',speed:34,turn:31,climb:5.6,drain:.073,hover:false,stability:80},
 {id:'supercam',cat:'mil',name:'SuperCam S350 · игровой профиль',family:'Самолётный',icon:'➤',launch:'Катапульта',speed:36,turn:29,climb:5.5,drain:.068,hover:false,stability:84},
 {id:'forpost',cat:'mil',name:'Форпост-Р · игровой профиль',family:'Тяжёлый самолётный',icon:'✈',launch:'Полоса',speed:42,turn:20,climb:4.4,drain:.052,hover:false,stability:91},
 {id:'inohodets',cat:'mil',name:'Иноходец · игровой профиль',family:'Тяжёлый самолётный',icon:'✈',launch:'Полоса',speed:44,turn:18,climb:4.8,drain:.048,hover:false,stability:92},
 {id:'sirius',cat:'mil',name:'Сириус · игровой профиль',family:'Тяжёлый самолётный',icon:'✈',launch:'Полоса',speed:48,turn:17,climb:4.7,drain:.045,hover:false,stability:94},
 {id:'altius',cat:'mil',name:'Альтиус · игровой профиль',family:'Высотный самолётный',icon:'✈',launch:'Полоса',speed:50,turn:15,climb:4.2,drain:.04,hover:false,stability:96}
];
const WEATHER={calm:{wind:0,dir:40,label:'штиль'},breeze:{wind:2.8,dir:125,label:'лёгкий ветер'},windy:{wind:6.5,dir:230,label:'порывистый ветер'},fog:{wind:1.3,dir:75,label:'туман'}};
const MAP_CENTER={lat:55.7558,lon:37.6176};
const TILE_SIZE=256;

const state={
 model:MODELS[0], category:'all', phase:'setup', running:false, paused:false, launched:false, landing:false, rth:false, follow:true,
 x:0,y:0,alt:0,speed:0,heading:0,throttle:0.44,battery:100,home:{x:0,y:0},homeChosen:false,
 route:[],gates:[],gateIndex:0,totalDistance:0,flightSeconds:0,score:0,accuracy:100,
 map:{lat:MAP_CENTER.lat,lon:MAP_CENTER.lon,zoom:14,offsetX:0,offsetY:0,dragging:false},
 keys:new Set(),lastTime:0,sound:true,toastTimer:null,audio:null
};

function modelById(id){return MODELS.find(m=>m.id===id)||MODELS[0]}
function modelStats(){return [
 ['Скорость',state.model.speed,50],['Манёвренность',state.model.turn,95],['Набор высоты',state.model.climb,9],['Стабильность',state.model.stability,100]
]}
function renderModelList(){
 const filtered=MODELS.filter(m=>state.category==='all'||m.cat===state.category);
 $('#modelSelect').innerHTML=filtered.map(m=>`<option value="${m.id}">${m.name}</option>`).join('');
 if(!filtered.some(m=>m.id===state.model.id)) state.model=filtered[0];
 $('#modelSelect').value=state.model.id;
 renderModelCard();
}
function renderModelCard(){
 const m=state.model;
 $('#modelCard').innerHTML=`<div class="model-top"><div class="model-icon">${m.icon}</div><div><b>${m.name}</b><small>${m.family} · ${m.launch}</small></div></div><div class="model-tags"><span>${m.hover?'Зависание':'Требует скорости'}</span><span>Учебный профиль</span><span>${m.cat==='mil'?'ВС РФ':'Гражданский'}</span></div>${modelStats().map(([n,v,max])=>`<div class="stat-row"><span>${n}</span><div class="stat-track"><i style="width:${clamp(v/max*100,5,100)}%"></i></div><b>${Math.round(v/max*100)}</b></div>`).join('')}`;
 $('#aircraft').classList.toggle('fixed-wing',!m.hover);
}
