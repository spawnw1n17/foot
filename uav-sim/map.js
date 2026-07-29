'use strict';

const TILE_SIZE=256;
function project(lat,lon,z){const scale=TILE_SIZE*Math.pow(2,z),s=Math.sin(toRad(clamp(lat,-85.0511,85.0511)));return{x:(lon+180)/360*scale,y:(.5-Math.log((1+s)/(1-s))/(4*Math.PI))*scale}}
function unproject(x,y,z){const scale=TILE_SIZE*Math.pow(2,z),n=Math.PI-2*Math.PI*y/scale;return{lat:toDeg(Math.atan(Math.sinh(n))),lon:x/scale*360-180}}
function viewportSize(){const r=$('#map').getBoundingClientRect();return{w:r.width,h:r.height}}
function latLonToScreen(p){const {w,h}=viewportSize(),a=project(p.lat,p.lon,state.map.zoom),c=project(state.map.center.lat,state.map.center.lon,state.map.zoom);return{x:w/2+a.x-c.x,y:h/2+a.y-c.y}}
function screenToLatLon(x,y){const {w,h}=viewportSize(),c=project(state.map.center.lat,state.map.center.lon,state.map.zoom);return unproject(c.x+x-w/2,c.y+y-h/2,state.map.zoom)}
function metersBetween(a,b){const lat=toRad((a.lat+b.lat)/2),dy=(b.lat-a.lat)*111320,dx=(b.lon-a.lon)*111320*Math.cos(lat);return Math.hypot(dx,dy)}
function vectorMeters(a,b){const lat=toRad((a.lat+b.lat)/2);return{x:(b.lon-a.lon)*111320*Math.cos(lat),y:(b.lat-a.lat)*111320}}
function moveLatLon(p,east,north){const lat=p.lat+north/111320,lon=p.lon+east/(111320*Math.cos(toRad(clamp(p.lat,-80,80))));return{lat,lon}}
function bearingBetween(a,b){const v=vectorMeters(a,b);return(toDeg(Math.atan2(v.x,v.y))+360)%360}

function renderTiles(){
  const layer=$('#tileLayer'),{w,h}=viewportSize(),z=state.map.zoom,c=project(state.map.center.lat,state.map.center.lon,z),max=Math.pow(2,z);
  const minX=Math.floor((c.x-w/2)/TILE_SIZE)-1,maxX=Math.floor((c.x+w/2)/TILE_SIZE)+1,minY=Math.floor((c.y-h/2)/TILE_SIZE)-1,maxY=Math.floor((c.y+h/2)/TILE_SIZE)+1,wanted=new Set();
  for(let tx=minX;tx<=maxX;tx++)for(let ty=minY;ty<=maxY;ty++){
    if(ty<0||ty>=max)continue;const wrap=((tx%max)+max)%max,key=`${z}/${wrap}/${ty}`;wanted.add(key);let img=layer.querySelector(`[data-key="${key}"]`);
    if(!img){img=new Image();img.className='map-tile';img.dataset.key=key;img.alt='';img.draggable=false;img.referrerPolicy='no-referrer';img.src=`https://tile.openstreetmap.org/${z}/${wrap}/${ty}.png`;img.onload=()=>{state.tileErrors=Math.max(0,state.tileErrors-1);updateOfflineBadge()};img.onerror=()=>{img.classList.add('tile-error');state.tileErrors++;updateOfflineBadge()};layer.appendChild(img)}
    img.style.left=`${tx*TILE_SIZE-c.x+w/2}px`;img.style.top=`${ty*TILE_SIZE-c.y+h/2}px`;
  }
  [...layer.children].forEach(img=>{if(!wanted.has(img.dataset.key))img.remove()});updateMapObjects();
}
function updateOfflineBadge(){const offline=!navigator.onLine||state.tileErrors>8;$('#offlineBadge').classList.toggle('hidden',!offline)}
function updateMapObjects(){
  if(!$('#map').clientWidth)return;const pos=latLonToScreen(state.pos),home=latLonToScreen(state.home),target=state.missionPoints[state.pointIndex]?latLonToScreen(state.missionPoints[state.pointIndex]):null;
  const ac=$('#aircraft'),shadow=$('#aircraftShadow');ac.style.left=`${pos.x}px`;ac.style.top=`${pos.y}px`;ac.style.setProperty('--rotation',`${state.heading}deg`);ac.style.setProperty('--roll',`${state.roll}deg`);ac.style.setProperty('--scale',`${clamp(.82+state.alt/140, .82,1.24)}`);
  const shadowOffset=clamp(state.alt*.16,2,28);shadow.style.left=`${pos.x+shadowOffset}px`;shadow.style.top=`${pos.y+shadowOffset*.55}px`;shadow.style.setProperty('--shadow-scale',clamp(1+state.alt/65,1,2.8));shadow.style.setProperty('--shadow-opacity',clamp(.6-state.alt/320,.16,.58));
  $('#landingZone').style.left=`${home.x}px`;$('#landingZone').style.top=`${home.y}px`;
  const mt=$('#missionTarget');if(target){mt.classList.remove('hidden');mt.style.left=`${target.x}px`;mt.style.top=`${target.y}px`;mt.querySelector('span').textContent=state.pointIndex+1}else mt.classList.add('hidden');
  drawRoute();updateCompass();
}
function resizeCanvas(){const c=$('#routeCanvas'),r=$('#map').getBoundingClientRect(),dpr=Math.min(2,devicePixelRatio||1);c.width=Math.round(r.width*dpr);c.height=Math.round(r.height*dpr);c.style.width=`${r.width}px`;c.style.height=`${r.height}px`;const ctx=c.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);renderTiles()}
function drawRoute(){
  const c=$('#routeCanvas'),ctx=c.getContext('2d'),{w,h}=viewportSize();ctx.clearRect(0,0,w,h);
  if(settings.trail&&state.route.length>1){ctx.beginPath();state.route.forEach((p,i)=>{const s=latLonToScreen(p);i?ctx.lineTo(s.x,s.y):ctx.moveTo(s.x,s.y)});ctx.strokeStyle='rgba(75,242,165,.72)';ctx.lineWidth=2;ctx.setLineDash([8,6]);ctx.stroke();ctx.setLineDash([])}
  if(state.missionPoints.length){ctx.beginPath();state.missionPoints.forEach((p,i)=>{const s=latLonToScreen(p);i?ctx.lineTo(s.x,s.y):ctx.moveTo(s.x,s.y)});ctx.strokeStyle='rgba(98,231,255,.22)';ctx.lineWidth=1;ctx.setLineDash([4,8]);ctx.stroke();ctx.setLineDash([])}
  state.missionPoints.forEach((g,i)=>{const s=latLonToScreen(g),active=i===state.pointIndex,done=i<state.pointIndex;ctx.beginPath();ctx.arc(s.x,s.y,active?21:16,0,Math.PI*2);ctx.strokeStyle=done?'rgba(75,242,165,.38)':active?'#62e7ff':'rgba(255,255,255,.25)';ctx.lineWidth=active?3:2;ctx.stroke();ctx.fillStyle=done?'rgba(75,242,165,.1)':active?'rgba(98,231,255,.12)':'rgba(255,255,255,.04)';ctx.fill();ctx.fillStyle='#effbf7';ctx.font='700 9px system-ui';ctx.textAlign='center';ctx.fillText(String(i+1),s.x,s.y+3)});
  if(state.mission.id==='search'&&state.searchTargetIndex>=0&&state.pointIndex>state.searchTargetIndex){const p=state.missionPoints[state.searchTargetIndex],s=latLonToScreen(p);ctx.beginPath();ctx.arc(s.x,s.y,32,0,Math.PI*2);ctx.strokeStyle='rgba(255,189,90,.8)';ctx.lineWidth=2;ctx.stroke()}
}
function updateCompass(){
  const headings=[];for(let d=-90;d<=90;d+=15){let val=(Math.round(state.displayHeading/15)*15+d+360)%360,label=val===0?'С':val===90?'В':val===180?'Ю':val===270?'З':String(val);headings.push(`<span class="${val%90===0?'major':''}">${label}</span>`)}$('#compassTape').innerHTML=headings.join('');
}
function setHome(p){state.home={...p};state.pos={...p};state.homeChosen=true;state.map.center={...p};state.route=[];prepareMission();setObjective('Запустите аппарат',1,'Откройте инструктаж или начинайте полёт');setFlightState('СТАРТОВАЯ ТОЧКА ВЫБРАНА');$('#chooseHomeBtn').textContent='Изменить место старта';toast('Стартовая точка установлена');renderTiles()}
function panMapByPixels(dx,dy){const c=project(state.map.center.lat,state.map.center.lon,state.map.zoom);state.map.center=unproject(c.x-dx,c.y-dy,state.map.zoom);renderTiles()}
function changeZoom(delta,anchor=null){
  const old=state.map.zoom,next=clamp(old+delta,4,19);if(next===old)return;let before=null;if(anchor)before=screenToLatLon(anchor.x,anchor.y);state.map.zoom=next;if(anchor&&before){const after=screenToLatLon(anchor.x,anchor.y),v={lat:before.lat-after.lat,lon:before.lon-after.lon};state.map.center.lat+=v.lat;state.map.center.lon+=v.lon}renderTiles();toast(`Масштаб: ${next}`)
}
function centerOn(target='home'){const p=target==='aircraft'?state.pos:state.home;state.map.center={...p};renderTiles()}
function updateFollowCamera(dt){
  if(!state.follow)return;let target={...state.pos};if(state.camera!=='top'){const ahead=state.camera==='cinematic'?150:90,rad=toRad(state.heading);target=moveLatLon(target,Math.sin(rad)*ahead,Math.cos(rad)*ahead)}
  state.map.center.lat=lerp(state.map.center.lat,target.lat,clamp(dt*2.3,0,1));state.map.center.lon=lerp(state.map.center.lon,target.lon,clamp(dt*2.3,0,1));renderTiles()
}

function randomPoint(origin,min=160,max=420,angle=Math.random()*Math.PI*2){const r=min+Math.random()*(max-min);return moveLatLon(origin,Math.cos(angle)*r,Math.sin(angle)*r)}
function seededRandom(seed){let x=Math.sin(seed)*10000;return()=>{x=Math.sin(x)*10000;return x-Math.floor(x)}}
function prepareMission(){
  state.pointIndex=0;state.pointHold=0;state.missionFlags={};state.searchTargetIndex=-1;const id=state.mission.id,base=state.home;let points=[];
  if(id==='free')points=[];
  else if(id==='custom')points=state.customPoints.length?[...state.customPoints]:[randomPoint(base,160,250),randomPoint(base,260,360)];
  else if(id==='daily'){const seed=Number(todayKey().replaceAll('-','')),rnd=seededRandom(seed);for(let i=0;i<5;i++){const a=rnd()*Math.PI*2,r=180+rnd()*520;points.push(moveLatLon(base,Math.cos(a)*r,Math.sin(a)*r))}const weather=['breeze','windy','fog','rain'][Math.floor(rnd()*4)];state.weather=weather;$('#weatherSelect').value=weather;applyEnvironment()}
  else {const count={training:3,survey:4,search:5,delivery:1,inspection:5,landing:2,emergency:2,firewatch:4}[id]||3;const start=Math.random()*Math.PI*2;for(let i=0;i<count;i++){const radius=id==='delivery'?380:150+i*85,a=start+i*(Math.PI*2/count)+Math.random()*.35;points.push(moveLatLon(base,Math.cos(a)*radius,Math.sin(a)*radius))}}
  if(id==='search')state.searchTargetIndex=Math.floor(Math.random()*points.length);
  if(id==='landing'){state.weather='windy';$('#weatherSelect').value='windy';applyEnvironment()}
  state.missionPoints=points;updateMissionUi();renderTiles()
}
function updateMissionUi(){
  const total=state.missionPoints.length||0,done=state.pointIndex;$('#missionCounter').textContent=state.mission.id==='free'?'Свободно':`${done} / ${total}`;$('#missionProgress').style.width=`${total?done/total*100:0}%`;
  const text={free:'Летайте без обязательных целей.',training:'Пройдите контрольные точки и вернитесь домой.',survey:'Удерживайте аппарат над каждой точкой съёмки.',search:'Проверьте зоны и найдите учебный маяк.',delivery:'Доставьте груз и зависните над зоной.',inspection:'Соблюдайте высоту 25–55 метров.',landing:'Выполните круг и точную посадку.',emergency:'Будьте готовы к аварийному возврату.',firewatch:'Пройдите безопасный периметр.',custom:'Пройдите поставленные точки.',daily:'Выполните ежедневный маршрут.'};$('#liveMissionText').textContent=text[state.mission.id]||state.mission.description;
}
function addCustomPoint(p){if(state.customPoints.length>=12)return toast('Максимум 12 точек');state.customPoints.push(p);state.missionPoints=[...state.customPoints];updateMissionUi();renderTiles();toast(`Точка ${state.customPoints.length} добавлена`)}
function toggleRouteEditor(){state.routeEditing=!state.routeEditing;if(state.routeEditing){state.customPoints=[];state.missionPoints=[];state.pointIndex=0;$('#routeEditBtn').textContent='Завершить построение';setObjective('Поставьте точки на карте',1,'До 12 точек маршрута');$('#controlCenter').classList.remove('open')}else{$('#routeEditBtn').textContent='Поставить точки маршрута';prepareMission();toast(`Маршрут: ${state.customPoints.length} точек`)}}

async function searchPlace(query){
  const results=$('#searchResults');if(!query.trim())return;results.innerHTML='<p>Поиск…</p>';
  try{const url=`https://nominatim.openstreetmap.org/search?format=json&limit=5&accept-language=ru&q=${encodeURIComponent(query)}`,r=await fetch(url,{headers:{'Accept':'application/json'}});if(!r.ok)throw new Error();const data=await r.json();results.innerHTML=data.length?data.map((x,i)=>`<button class="search-result" data-place="${i}"><b>${x.display_name.split(',').slice(0,2).join(',')}</b><small>${x.display_name}</small></button>`).join(''):'<p>Ничего не найдено. Выберите точку вручную.</p>';results.querySelectorAll('[data-place]').forEach(b=>b.onclick=()=>{const x=data[+b.dataset.place],p={lat:+x.lat,lon:+x.lon};state.map.center={...p};renderTiles();$('#searchDialog').close();toast('Место найдено — укажите старт на карте')})}catch{results.innerHTML='<p>Поиск недоступен без сети. Закройте окно и выберите точку на карте вручную.</p>'}
}
