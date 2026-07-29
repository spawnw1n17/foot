'use strict';

function resetFlight(keepHome=true){
  state.phase='setup';state.running=false;state.paused=false;state.launched=false;state.landing=false;state.rth=false;state.follow=true;state.routeEditing=false;
  state.alt=0;state.speed=0;state.heading=0;state.displayHeading=0;state.throttle=.44;state.battery=100;state.signal=100;state.verticalSpeed=0;state.roll=0;
  state.route=[];state.pointIndex=0;state.pointHold=0;state.totalDistance=0;state.flightSeconds=0;state.score=0;state.accuracy=100;state.lastTime=0;state.damage=0;
  state.activeEvent=null;state.eventUntil=0;state.eventTriggered=0;state.nextEventAt=22+Math.random()*20;state.missionFlags={};state.searchTargetIndex=-1;
  if(!keepHome){state.home={...DEFAULT_CENTER};state.pos={...DEFAULT_CENTER};state.map.center={...DEFAULT_CENTER};state.homeChosen=true}else state.pos={...state.home};
  $('#launchBtn').disabled=false;$('#modelSelect').disabled=false;$('#weatherSelect').disabled=false;$('#timeSelect').disabled=false;$('#difficultySelect').disabled=false;$('#aircraft').classList.remove('low-battery');$('#pauseBtn').textContent='Ⅱ Пауза';$('#signalOverlay').classList.remove('active');hideEvent();
  prepareMission();setFlightState('ГОТОВ К ПОДГОТОВКЕ');setObjective('Подготовьте аппарат к запуску',1,'Выберите миссию и условия');updateUi();renderTiles();
}
function launch(){
  if(state.launched)return;if(!state.homeChosen)return toast('Сначала укажите место старта');if(state.mission.id==='custom'&&!state.missionPoints.length)return toast('Поставьте хотя бы одну точку маршрута');
  state.phase='flight';state.running=true;state.launched=true;state.paused=false;state.landing=false;state.rth=false;const m=effectiveModel();
  state.alt=m.hover?1.5:8;state.speed=m.hover?0:Math.max(11,m.speed*.48);state.throttle=m.hover?.52:.68;state.lastTime=performance.now();state.route=[{...state.pos,t:0,alt:state.alt,speed:state.speed}];
  if(state.mission.id==='emergency')state.battery=58;else if(state.mission.id==='landing')state.battery=72;else state.battery=100;
  $('#launchBtn').disabled=true;$('#modelSelect').disabled=true;$('#weatherSelect').disabled=true;$('#timeSelect').disabled=true;$('#difficultySelect').disabled=true;$('#controlCenter').classList.remove('open');
  setFlightState('ПОЛЁТ ВЫПОЛНЯЕТСЯ');setObjectiveForMission();playTone(175,.16,'sawtooth',.04);haptic(30);requestAnimationFrame(loop);toast('Аппарат запущен');
}
function togglePause(){
  if(!state.launched)return;state.paused=!state.paused;$('#pauseBtn').textContent=state.paused?'▶ Продолжить':'Ⅱ Пауза';setFlightState(state.paused?'ПОЛЁТ ПРИОСТАНОВЛЕН':'ПОЛЁТ ВЫПОЛНЯЕТСЯ',state.paused?'warning':'');
  if(!state.paused){state.lastTime=performance.now();requestAnimationFrame(loop)}
}
function beginRth(auto=false){if(!state.launched)return;state.rth=true;state.landing=false;setFlightState(auto?'АВТОВОЗВРАТ ПО ЗАРЯДУ':'АВТОВОЗВРАТ','warning');setObjective('Возврат к месту старта',4,'Автопилот удерживает безопасную высоту');toast('Возврат домой включён');haptic(25)}
function beginLanding(){if(!state.launched)return;state.landing=true;state.rth=true;setFlightState('ПОСАДКА','warning');setObjective('Снижение и посадка',5,'Контролируйте скорость и точность');toast('Режим посадки включён');haptic([20,30,20])}

function loop(now){
  if(!state.running||state.paused)return;const dt=clamp((now-state.lastTime)/1000,0,.05);state.lastTime=now;stepFlight(dt);updateUi();updateMapObjects();if(state.running)requestAnimationFrame(loop)
}
function stepFlight(dt){
  const m=effectiveModel(),w=WEATHER_PRESETS[state.weather],diff=DIFFICULTIES[state.difficulty];
  const keyTurn=(state.keys.has('ArrowLeft')||state.keys.has('KeyA')?-1:0)+(state.keys.has('ArrowRight')||state.keys.has('KeyD')?1:0);
  const keyAlt=(state.keys.has('ArrowUp')?1:0)+(state.keys.has('ArrowDown')?-1:0),keyThrottle=(state.keys.has('KeyW')?1:0)+(state.keys.has('KeyS')?-1:0);
  const sens=settings.sensitivity,turnInput=clamp(keyTurn+state.stick.left.x*.85+state.stick.right.x*.55,-1,1),altInput=clamp(keyAlt-state.stick.right.y,-1,1),throttleInput=clamp(keyThrottle-state.stick.left.y,-1,1);
  const previousAlt=state.alt;
  if(state.rth)autopilotStep(dt,m,diff);else{
    state.heading=(state.heading+turnInput*m.turn*diff.physics*sens*dt+360)%360;
    state.roll=lerp(state.roll,turnInput*clamp(28+(100-m.stability)*.25,18,42),clamp(dt*4.5,0,1));
    const maxThrottle=state.activeEvent?.id==='motorheat'?.76:1;state.throttle=clamp(state.throttle+throttleInput*.39*sens*dt,.1,maxThrottle);
    state.alt=clamp(state.alt+altInput*m.climb*diff.physics*sens*dt,0,220);
  }
  if(Math.abs(turnInput)<.05)state.roll=lerp(state.roll,0,clamp(dt*3,0,1));
  const targetSpeed=m.hover?m.speed*Math.max(0,(state.throttle-.16)/.84):Math.max(6.5,m.speed*(.32+state.throttle*.68));state.speed=lerp(state.speed,targetSpeed,dt*(m.hover?2.3:1.1));
  if(!m.hover&&state.speed<8.5){state.alt=Math.max(0,state.alt-(4.2+(8.5-state.speed)*.35)*dt);state.damage+=dt*.35}
  if(settings.assist&&diff.assist&&!state.rth&&m.hover&&Math.abs(altInput)<.05&&state.alt>1)state.alt=lerp(state.alt,Math.round(state.alt*2)/2,dt*.5);
  state.verticalSpeed=(state.alt-previousAlt)/Math.max(dt,.001);

  const eventGust=state.activeEvent?.id==='gust'?5.2:0,windGust=state.weather==='windy'?(Math.sin(state.flightSeconds*1.9)+Math.sin(state.flightSeconds*.47))*1.15:0;
  const stabilityFactor=clamp(1-(m.stability-60)/110,.35,1),windSpeed=(w.wind+windGust+eventGust)*stabilityFactor*diff.physics,headingRad=toRad(state.heading),windRad=toRad(w.dir);
  const east=(Math.sin(headingRad)*state.speed+Math.sin(windRad)*windSpeed)*dt,north=(Math.cos(headingRad)*state.speed+Math.cos(windRad)*windSpeed)*dt,old={...state.pos};state.pos=moveLatLon(state.pos,east,north);
  const moved=metersBetween(old,state.pos);state.totalDistance+=moved;state.flightSeconds+=dt;
  updateFollowCamera(dt);
  const drain=m.drain*(.56+state.throttle*.76)*w.drain*diff.physics*dt;state.battery=clamp(state.battery-drain,0,100);
  const distHome=metersBetween(state.pos,state.home);state.signal=clamp(100-distHome/(m.range*115)*6-(state.weather==='fog'?10:0)-(state.activeEvent?.id==='gps'?25:0),4,100);
  if(!state.route.length||metersBetween(state.pos,state.route.at(-1))>7){state.route.push({...state.pos,t:state.flightSeconds,alt:state.alt,speed:state.speed});if(state.route.length>1600)state.route.shift()}
  updateEventSystem();checkMission();checkWarnings();
  if(state.alt<=.08&&state.launched){const safe=distHome<70&&(m.hover?state.speed<7.5:state.speed<18)&&Math.abs(state.verticalSpeed)<4.8;finishFlight(safe,distHome)}
  if(state.battery<=0)finishFlight(false,distHome,'Энергия исчерпана');
  if(state.flightSeconds%1<dt)engineTone();
}
function autopilotStep(dt,m,diff){
  const dist=metersBetween(state.pos,state.home),target=bearingBetween(state.pos,state.home),delta=((target-state.heading+540)%360)-180;state.heading=(state.heading+clamp(delta,-m.turn*dt,m.turn*dt)+360)%360;state.roll=lerp(state.roll,clamp(delta,-28,28),dt*3);
  const safeAlt=m.hover?22:32;if(dist>65&&state.alt<safeAlt)state.alt+=m.climb*.7*dt;
  state.throttle=state.landing&&dist<65?(m.hover?.25:.39):(m.hover?.63:.72);
  if(state.landing&&dist<65){const descent=m.hover?m.climb*.58:m.climb*.35;state.alt=Math.max(0,state.alt-descent*dt);if(m.hover)state.speed=lerp(state.speed,Math.min(2.6,dist*.055),dt*2.8);else if(dist<28)state.throttle=.28}
  if(!state.landing&&dist<75&&state.pointIndex>=state.missionPoints.length)setObjective('Выполните посадку',5,'Нажмите кнопку посадки');
}

function missionNeedsHold(){return ['survey','delivery','inspection','firewatch'].includes(state.mission.id)}
function missionAltitudeValid(){const id=state.mission.id;if(id==='inspection')return state.alt>=25&&state.alt<=55;if(id==='survey')return state.alt>=18&&state.alt<=65;if(id==='delivery')return state.alt<=9;if(id==='firewatch')return state.alt>=35&&state.alt<=90;return state.alt>4}
function setObjectiveForMission(){
  const id=state.mission.id;if(id==='free')return setObjective('Свободный полёт',2,'Возвращайтесь на площадку в любое время');
  if(id==='search')return setObjective('Проверьте поисковую зону 1',2,'Учебный маяк находится в одной из зон');
  if(id==='delivery')return setObjective('Доставьте груз в отмеченную зону',2,'Снизьтесь ниже 9 м и удерживайте позицию');
  if(id==='survey')return setObjective('Выполните съёмку точки 1',2,'Удерживайте аппарат над точкой');
  if(id==='inspection')return setObjective('Осмотрите точку 1',2,'Высота 25–55 м');
  if(id==='landing')return setObjective('Пройдите посадочный круг',2,'После точек вернитесь на площадку');
  if(id==='emergency')return setObjective('Пройдите контрольную точку',2,'Следите за запасом энергии');
  if(id==='firewatch')return setObjective('Облетите сектор 1',2,'Сохраняйте безопасную высоту');
  setObjective(`Пройдите точку 1`,2,'Следуйте к бирюзовой отметке')
}
function checkMission(){
  if(state.mission.id==='free')return;
  if(state.pointIndex<state.missionPoints.length){
    const p=state.missionPoints[state.pointIndex],dist=metersBetween(state.pos,p),radius=state.mission.id==='search'?55:state.mission.id==='delivery'?32:28;
    if(dist<radius&&missionAltitudeValid()){
      if(missionNeedsHold()){state.pointHold+=1/60;const needed=state.mission.id==='delivery'?3.2:2.2;setObjective(`Удерживайте позицию ${Math.min(100,Math.round(state.pointHold/needed*100))}%`,2,'Стабилизируйте аппарат');if(state.pointHold<needed)return}
      completeMissionPoint();
    }else if(missionNeedsHold())state.pointHold=Math.max(0,state.pointHold-.05);
  }else if(!state.rth&&metersBetween(state.pos,state.home)<95)setObjective('Выполните посадку',5,'Посадочная площадка отмечена буквой H')
}
function completeMissionPoint(){
  const current=state.pointIndex;state.pointHold=0;state.pointIndex++;profile.gates++;state.score+=state.mission.id==='search'?300:250;playTone(630,.1,'sine',.045);haptic([20,25,35]);updateMissionUi();
  if(state.mission.id==='search'){
    if(current===state.searchTargetIndex){state.score+=500;toast('Учебный маяк обнаружен');state.pointIndex=state.missionPoints.length}else toast(`Зона ${current+1}: маяк не найден`)
  }else toast(`Точка ${state.pointIndex} выполнена`);
  if(state.mission.id==='emergency'&&state.pointIndex===1&&!state.missionFlags.emergency){state.missionFlags.emergency=true;state.battery=Math.min(state.battery,26);showEvent({id:'battery',title:'Резкое падение заряда',text:'Возвращайтесь на площадку немедленно.',duration:6,severity:'danger'});beginRth(true)}
  if(state.pointIndex<state.missionPoints.length)setObjectiveForNextPoint();else{state.score+=500;setObjective('Вернитесь к месту старта',4,'Можно включить автоматический возврат');toast('Основная задача выполнена')}
}
function setObjectiveForNextPoint(){
  const n=state.pointIndex+1,id=state.mission.id;if(id==='survey')setObjective(`Выполните съёмку точки ${n}`,2,'Удерживайте аппарат над точкой');else if(id==='search')setObjective(`Проверьте поисковую зону ${n}`,2,'Маяк находится в одной из зон');else if(id==='inspection')setObjective(`Осмотрите точку ${n}`,2,'Высота 25–55 м');else if(id==='firewatch')setObjective(`Облетите сектор ${n}`,2,'Высота 35–90 м');else setObjective(`Пройдите точку ${n}`,2,'Следуйте к отметке')
}

function updateEventSystem(){
  if(state.activeEvent&&state.flightSeconds>=state.eventUntil){endEvent()}
  if(!state.activeEvent&&state.flightSeconds>=state.nextEventAt&&state.mission.id!=='free'){
    const chance=DIFFICULTIES[state.difficulty].eventChance;if(Math.random()<chance)triggerRandomEvent();state.nextEventAt=state.flightSeconds+28+Math.random()*35
  }
}
function triggerRandomEvent(){
  const pool=EVENT_CATALOG.filter(e=>!(e.id==='battery'&&state.battery<35)),event={...pool[Math.floor(Math.random()*pool.length)]};
  if(event.id==='battery')state.battery=clamp(state.battery-8-Math.random()*6,0,100);if(event.id==='gps'){state.missionFlags.previousFollow=state.follow;state.follow=false;$('#signalOverlay').classList.add('active')}if(event.id==='raincell')$('#weatherOverlay').classList.add('rain');
  state.activeEvent=event;state.eventUntil=state.flightSeconds+event.duration;state.eventTriggered++;showEvent(event);playTone(event.severity==='danger'?120:270,.18,'square',.035);haptic(event.severity==='danger'?[50,50,80]:35)
}
function showEvent(event){const card=$('#eventCard');card.className=`event-card glass ${event.severity||''}`.trim();card.classList.remove('hidden');$('#eventTitle').textContent=event.title;$('#eventText').textContent=event.text;$('#eventIcon').textContent=event.severity==='danger'?'!':'△'}
function hideEvent(){$('#eventCard').classList.add('hidden')}
function endEvent(){
  const id=state.activeEvent?.id;if(id==='gps'){state.follow=state.missionFlags.previousFollow??true;$('#signalOverlay').classList.remove('active')}if(id==='raincell'&&state.weather!=='rain')$('#weatherOverlay').classList.remove('rain');state.activeEvent=null;hideEvent();setFlightState(state.rth?'АВТОВОЗВРАТ':'ПОЛЁТ ВЫПОЛНЯЕТСЯ',state.rth?'warning':'')
}
function checkWarnings(){
  const dist=metersBetween(state.pos,state.home);if(state.battery<20&&!state.rth){setFlightState('НИЗКИЙ ЗАРЯД','danger');$('#aircraft').classList.add('low-battery');if(state.battery<12)beginRth(true)}else if(!state.rth&&!state.activeEvent)setFlightState('ПОЛЁТ ВЫПОЛНЯЕТСЯ');
  if(state.signal<25&&!state.rth)setFlightState('СЛАБЫЙ СИГНАЛ','warning');if(state.signal<10&&!state.rth&&DIFFICULTIES[state.difficulty].assist)beginRth(true);
  if(dist>effectiveModel().range*1000)state.damage+=.01;
}

function finishFlight(success,distHome,reason=''){
  if(!state.running)return;state.running=false;state.launched=false;state.phase='result';state.roll=0;const missionDone=state.mission.id==='free'||state.pointIndex>=state.missionPoints.length;
  const precision=Math.round(clamp(100-distHome*1.3-Math.max(0,state.speed-4)*1.8-Math.abs(state.verticalSpeed)*2,0,100));state.accuracy=precision;
  const landingBonus=success?500:0,missionBonus=missionDone?850:0,batteryBonus=Math.round(state.battery*4),eventBonus=state.eventTriggered*90;state.score=Math.round(state.score+landingBonus+missionBonus+batteryBonus+precision*3+eventBonus-state.damage*30);
  const grade=success&&missionDone&&precision>=90?'S':success&&missionDone?'A':success?'B':'C',diff=DIFFICULTIES[state.difficulty];
  const reward=success?Math.round((state.mission.reward+state.score*.08)*diff.reward):Math.round(state.score*.025),earnedXp=success?Math.round((state.mission.xp+state.score*.035)*diff.reward):Math.round(state.score*.012);
  const oldLevel=profile.level;profile.flights++;profile.successful+=success?1:0;profile.totalDistance+=state.totalDistance;profile.totalSeconds+=state.flightSeconds;profile.credits+=reward;profile.xp+=earnedXp;profile.bestScore=Math.max(profile.bestScore,state.score);profile.level=levelFromXp(profile.xp);profile.records[state.mission.id]=Math.max(profile.records[state.mission.id]||0,state.score);
  if(!profile.usedModels.includes(state.model.id))profile.usedModels.push(state.model.id);if(state.mission.id==='daily'&&success)profile.dailyCompleted=todayKey();
  const replayStep=Math.max(1,Math.ceil(state.route.length/260));state.lastResult={success,missionDone,precision,reward,earnedXp,grade,reason};state.replayData={route:state.route.filter((_,i)=>i%replayStep===0||i===state.route.length-1).map(p=>({...p})),home:{...state.home},missionPoints:state.missionPoints.map(p=>({...p})),duration:state.flightSeconds,title:`${state.mission.name} · ${state.model.short}`};
  profile.logs.push({date:new Date().toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}),mission:state.mission.name,missionId:state.mission.id,model:state.model.short,score:state.score,success,distance:state.totalDistance,time:state.flightSeconds,replay:state.replayData});if(profile.logs.length>25)profile.logs.shift();
  checkAchievements(success,missionDone,precision);saveProfile();
  setFlightState(success?'ПОСАДКА ВЫПОЛНЕНА':'ПОЛЁТ ЗАВЕРШЁН',success?'':'danger');$('#resultBadge').textContent=grade;$('#resultTitle').textContent=success?'Посадка выполнена':'Полёт завершён';
  $('#resultDescription').textContent=reason||(!success?'Аппарат приземлился вне зоны или с превышением безопасной скорости.':missionDone?'Задание выполнено полностью.':'Посадка выполнена, но задача завершена не полностью.');
  $('#scoreValue').textContent=fmt(state.score);$('#rewardValue').textContent=money(reward);$('#earnedXpValue').textContent=`${fmt(earnedXp)} XP`;$('#timeValue').textContent=formatTime(state.flightSeconds);$('#totalDistanceValue').textContent=formatDistance(state.totalDistance);$('#accuracyValue').textContent=`${precision}%`;playTone(success?560:110,.28,success?'sine':'square',.045);haptic(success?[40,30,70]:[90,50,90]);$('#resultDialog').showModal();
  if(profile.level>oldLevel)setTimeout(()=>toast(`Новый уровень: ${profile.level} — ${RANKS[Math.min(RANKS.length-1,profile.level-1)]}`,4000),500)
}
function checkAchievements(success,missionDone,precision){
  if(profile.flights>=1)unlockAchievement('first_flight');if(success&&precision>=90)unlockAchievement('soft_landing');if(profile.gates>=25)unlockAchievement('navigator');if(success&&state.battery>=60)unlockAchievement('economy');if(success&&['windy','rain','snow'].includes(state.weather))unlockAchievement('storm');if(success&&state.time==='night')unlockAchievement('night_owl');if(profile.totalDistance>=100000)unlockAchievement('veteran');if(profile.usedModels.length>=8)unlockAchievement('collector');if(success&&state.mission.id==='daily')unlockAchievement('daily')
}
function updateUi(){
  $('#altitudeValue').textContent=Math.round(state.alt);$('#speedValue').textContent=Math.round(state.speed*3.6);const dist=metersBetween(state.pos,state.home);$('#distanceValue').textContent=formatDistance(dist);
  const compassDrift=state.activeEvent?.id==='compass'?Math.sin(state.flightSeconds*2.1)*18:0;state.displayHeading=(state.heading+compassDrift+360)%360;$('#headingValue').textContent=String(Math.round(state.displayHeading)%360).padStart(3,'0');
  const b=Math.round(state.battery);$('#batteryValue').textContent=`${b}%`;$('#batteryCompact').textContent=`${b}%`;$('#batteryBar').style.width=`${b}%`;$('#batteryBar').style.background=b<20?'var(--danger)':b<40?'var(--amber)':'var(--green)';$('#signalValue').textContent=`${Math.round(state.signal)}%`;
}

function openReplay(data=state.replayData){
  if(!data||!data.route?.length)return toast('Повтор недоступен');state.replayData=data;$('#replayTitle').textContent=data.title||'Маршрут';$('#replayDialog').showModal();setTimeout(()=>{drawReplay(0);$('#replayRange').value=0;$('#replayRange').max=Math.max(1,data.route.length-1);$('#replayTime').textContent='00:00'},30)
}
function drawReplay(index){
  const data=state.replayData,c=$('#replayCanvas'),box=$('#replayMap'),dpr=Math.min(2,devicePixelRatio||1),r=box.getBoundingClientRect();c.width=r.width*dpr;c.height=r.height*dpr;const ctx=c.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,r.width,r.height);ctx.fillStyle='#10221b';ctx.fillRect(0,0,r.width,r.height);if(!data?.route?.length)return;
  const pts=data.route,latMin=Math.min(...pts.map(p=>p.lat),data.home.lat),latMax=Math.max(...pts.map(p=>p.lat),data.home.lat),lonMin=Math.min(...pts.map(p=>p.lon),data.home.lon),lonMax=Math.max(...pts.map(p=>p.lon),data.home.lon),pad=30;
  const cv=p=>({x:pad+(p.lon-lonMin)/(lonMax-lonMin||1)*(r.width-pad*2),y:r.height-pad-(p.lat-latMin)/(latMax-latMin||1)*(r.height-pad*2)});ctx.beginPath();pts.forEach((p,i)=>{const q=cv(p);i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y)});ctx.strokeStyle='rgba(75,242,165,.72)';ctx.lineWidth=2;ctx.stroke();data.missionPoints?.forEach((p,i)=>{const q=cv(p);ctx.beginPath();ctx.arc(q.x,q.y,7,0,Math.PI*2);ctx.strokeStyle='#62e7ff';ctx.stroke();ctx.fillStyle='#effbf7';ctx.font='8px system-ui';ctx.fillText(i+1,q.x-2,q.y+3)});const h=cv(data.home);ctx.beginPath();ctx.arc(h.x,h.y,9,0,Math.PI*2);ctx.strokeStyle='#4bf2a5';ctx.stroke();const pos=cv(pts[clamp(index,0,pts.length-1)]),dot=$('#replayDot');dot.style.left=`${pos.x}px`;dot.style.top=`${pos.y}px`;$('#replayTime').textContent=formatTime(pts[clamp(index,0,pts.length-1)].t||0)
}
let replayTimer=null;function toggleReplay(){if(replayTimer){clearInterval(replayTimer);replayTimer=null;$('#replayPlayBtn').textContent='▶ Воспроизвести';return}$('#replayPlayBtn').textContent='Ⅱ Пауза';replayTimer=setInterval(()=>{let i=+$(`#replayRange`).value+1,max=+$(`#replayRange`).max;if(i>max){clearInterval(replayTimer);replayTimer=null;$('#replayPlayBtn').textContent='▶ Воспроизвести';return}$('#replayRange').value=i;drawReplay(i)},40)}
