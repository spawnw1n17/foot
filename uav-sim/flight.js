function resetFlight(keepHome=true){
 state.phase='setup';state.running=false;state.paused=false;state.launched=false;state.landing=false;state.rth=false;state.alt=0;state.speed=0;state.heading=0;state.throttle=.44;state.battery=100;state.route=[];state.gateIndex=0;state.totalDistance=0;state.flightSeconds=0;state.score=0;state.accuracy=100;state.lastTime=0;
 if(!keepHome){state.homeChosen=false;state.home={x:0,y:0};state.x=0;state.y=0;state.gates=[]}
 else {state.x=state.home.x;state.y=state.home.y;createMission()}
 $('#launchBtn').disabled=false;$('#modelSelect').disabled=false;$('#weatherSelect').disabled=false;$('#timeSelect').disabled=false;$('#aircraft').classList.remove('low-battery');
 setFlightState(state.homeChosen?'СТАРТОВАЯ ТОЧКА ВЫБРАНА':'ГОТОВ К ПОДГОТОВКЕ');setObjective(state.homeChosen?'Запустите аппарат':'Укажите место старта',1);updateUi();renderTiles();
}
function launch(){
 if(state.launched)return;if(!state.homeChosen){toast('Сначала укажите место старта на карте');state.phase='choose-home';$('#chooseHomeBtn').textContent='Нажмите на карту…';setObjective('Укажите место старта на карте',1);return}
 state.phase='flight';state.running=true;state.launched=true;state.paused=false;state.alt=state.model.hover?1.5:6;state.speed=state.model.hover?0:Math.max(12,state.model.speed*.48);state.throttle=state.model.hover?.52:.68;state.lastTime=performance.now();state.route=[{x:state.x,y:state.y}];
 $('#launchBtn').disabled=true;$('#modelSelect').disabled=true;$('#weatherSelect').disabled=true;$('#timeSelect').disabled=true;setFlightState('ПОЛЁТ ВЫПОЛНЯЕТСЯ');setObjective('Пройдите контрольную точку 1',2);playTone(170,.14);requestAnimationFrame(loop);toast('Аппарат запущен');
}
function togglePause(){if(!state.launched)return;state.paused=!state.paused;$('#pauseBtn').textContent=state.paused?'▶ Продолжить':'Ⅱ Пауза';setFlightState(state.paused?'ПОЛЁТ ПРИОСТАНОВЛЕН':'ПОЛЁТ ВЫПОЛНЯЕТСЯ',state.paused?'warning':'');if(!state.paused){state.lastTime=performance.now();requestAnimationFrame(loop)}}
function beginRth(){if(!state.launched)return;state.rth=true;state.landing=false;setFlightState('АВТОВОЗВРАТ', 'warning');setObjective('Автовозврат к месту старта',4);toast('Возврат домой включён')}
function beginLanding(){if(!state.launched)return;state.landing=true;state.rth=true;setFlightState('ПОСАДКА', 'warning');setObjective('Снижение и посадка',5);toast('Режим посадки включён')}

function loop(now){
 if(!state.running||state.paused)return;const dt=clamp((now-state.lastTime)/1000,0,.05);state.lastTime=now;step(dt);updateUi();updateMapObjects();if(state.running)requestAnimationFrame(loop)
}
function step(dt){
 const m=state.model,w=WEATHER[$('#weatherSelect').value],turnInput=(state.keys.has('ArrowLeft')||state.keys.has('KeyA')?-1:0)+(state.keys.has('ArrowRight')||state.keys.has('KeyD')?1:0),altInput=(state.keys.has('ArrowUp')?1:0)+(state.keys.has('ArrowDown')?-1:0),throttleInput=(state.keys.has('KeyW')?1:0)+(state.keys.has('KeyS')?-1:0);
 if(state.rth){
   const dx=state.home.x-state.x,dy=state.home.y-state.y,target=toDeg(Math.atan2(dx,-dy)),diff=((target-state.heading+540)%360)-180;state.heading=(state.heading+clamp(diff,-m.turn*dt,m.turn*dt)+360)%360;
   const dist=Math.hypot(dx,dy);state.throttle=state.landing&&dist<55?(m.hover?.28:.42):(m.hover?.62:.72);if(state.alt<24&&dist>55)state.alt+=m.climb*.7*dt;
   if(dist<55&&state.landing){state.alt=Math.max(0,state.alt-m.climb*.62*dt);if(m.hover)state.speed=lerp(state.speed,Math.min(3,dist*.08),dt*2.5)}
 }else{
   state.heading=(state.heading+turnInput*m.turn*dt+360)%360;state.throttle=clamp(state.throttle+throttleInput*.34*dt,.12,1);state.alt=clamp(state.alt+altInput*m.climb*dt,0,180);
 }
 const targetSpeed=m.hover?m.speed*Math.max(0,(state.throttle-.18)/.82):Math.max(7,m.speed*(.35+state.throttle*.65));state.speed=lerp(state.speed,targetSpeed,dt*(m.hover?2.3:1.15));
 if(!m.hover&&state.speed<8){state.alt=Math.max(0,state.alt-3.7*dt);state.accuracy=Math.max(0,state.accuracy-6*dt)}
 const gust=$('#weatherSelect').value==='windy'?(Math.sin(state.flightSeconds*1.9)+Math.sin(state.flightSeconds*.47))*1.1:0,windSpeed=w.wind+gust,headingRad=toRad(state.heading),windRad=toRad(w.dir);
 const vx=Math.sin(headingRad)*state.speed+Math.sin(windRad)*windSpeed,vy=-Math.cos(headingRad)*state.speed-Math.cos(windRad)*windSpeed,oldX=state.x,oldY=state.y;state.x+=vx*dt;state.y+=vy*dt;state.totalDistance+=Math.hypot(state.x-oldX,state.y-oldY);state.flightSeconds+=dt;
 if(state.follow){state.map.offsetX=lerp(state.map.offsetX,state.x,clamp(dt*2.4,0,1));state.map.offsetY=lerp(state.map.offsetY,state.y,clamp(dt*2.4,0,1));renderTiles()}
 const drain=m.drain*(.58+state.throttle*.72)*(1+(w.wind/13))*dt;state.battery=clamp(state.battery-drain,0,100);
 if(!state.route.length||Math.hypot(state.x-state.route.at(-1).x,state.y-state.route.at(-1).y)>8)state.route.push({x:state.x,y:state.y});if(state.route.length>900)state.route.shift();
 checkMission();checkWarnings();
 if(state.alt<=0.08&&state.launched){const distHome=Math.hypot(state.x-state.home.x,state.y-state.home.y),safe=distHome<65&&(m.hover?state.speed<8:state.speed<17);finishFlight(safe,distHome)}
 if(state.battery<=0)finishFlight(false,Math.hypot(state.x-state.home.x,state.y-state.home.y),'Энергия исчерпана')
}
function checkMission(){
 if(state.gateIndex<state.gates.length){const g=state.gates[state.gateIndex];if(Math.hypot(state.x-g.x,state.y-g.y)<24&&state.alt>4){state.gateIndex++;state.score+=250;playTone(620,.08);updateMissionUi();toast(`Контрольная точка ${state.gateIndex} пройдена`);if(state.gateIndex<state.gates.length)setObjective(`Пройдите контрольную точку ${state.gateIndex+1}`,2);else{setObjective('Вернитесь к месту старта',3);state.score+=400}}}
 else if(!state.rth&&Math.hypot(state.x-state.home.x,state.y-state.home.y)<90){setObjective('Выполните посадку',5)}
}
function checkWarnings(){
 if(state.battery<20&&!state.rth){setFlightState('НИЗКИЙ ЗАРЯД','danger');$('#aircraft').classList.add('low-battery');if(state.battery<12)beginRth()}else if(!state.rth)setFlightState('ПОЛЁТ ВЫПОЛНЯЕТСЯ')
}
function finishFlight(success,distHome,reason=''){
 state.running=false;state.launched=false;state.phase='result';const missionDone=state.gateIndex===state.gates.length;const landingBonus=success?500:0,routeBonus=missionDone?900:0,batteryBonus=Math.round(state.battery*5),precision=Math.round(clamp(100-distHome*1.4,0,100));state.score=Math.round(state.score+landingBonus+routeBonus+batteryBonus+precision*3);state.accuracy=precision;
 setFlightState(success?'ПОСАДКА ВЫПОЛНЕНА':'ПОЛЁТ ЗАВЕРШЁН',success?'':'danger');$('#resultBadge').textContent=success&&missionDone?'A':success?'B':'C';$('#resultTitle').textContent=success?'Посадка выполнена':'Полёт завершён';$('#resultDescription').textContent=reason||(!success?'Аппарат приземлился вне посадочной зоны или с превышением безопасной скорости.':missionDone?'Учебный маршрут пройден полностью.':'Посадка выполнена, но маршрут завершён не полностью.');$('#scoreValue').textContent=fmt(state.score);$('#timeValue').textContent=formatTime(state.flightSeconds);$('#totalDistanceValue').textContent=`${fmt(state.totalDistance)} м`;$('#accuracyValue').textContent=`${precision}%`;playTone(success?520:110,.25);$('#resultDialog').showModal();
}
function formatTime(s){const m=Math.floor(s/60),sec=Math.floor(s%60);return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`}
function updateUi(){
 $('#altitudeValue').textContent=Math.round(state.alt);$('#speedValue').textContent=Math.round(state.speed*3.6);const dist=Math.hypot(state.x-state.home.x,state.y-state.home.y);$('#distanceValue').textContent=dist>=1000?`${(dist/1000).toFixed(1)} км`:`${Math.round(dist)} м`;$('#headingValue').textContent=String(Math.round(state.heading)%360).padStart(3,'0');const b=Math.round(state.battery);$('#batteryValue').textContent=`${b}%`;$('#batteryCompact').textContent=`${b}%`;$('#batteryBar').style.width=`${b}%`;$('#batteryBar').style.background=b<20?'var(--danger)':b<40?'var(--amber)':'var(--green)';
}

function playTone(freq=220,duration=.08){if(!state.sound)return;try{state.audio??=new (window.AudioContext||window.webkitAudioContext)();const o=state.audio.createOscillator(),g=state.audio.createGain();o.frequency.value=freq;o.type='sine';g.gain.setValueAtTime(.04,state.audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,state.audio.currentTime+duration);o.connect(g).connect(state.audio.destination);o.start();o.stop(state.audio.currentTime+duration)}catch{}}
function toggleSound(){state.sound=!state.sound;$('#soundBtn').textContent=state.sound?'🔊':'🔇';toast(state.sound?'Звук включён':'Звук выключен')}
function toggleFullscreen(){if(!document.fullscreenElement)document.documentElement.requestFullscreen?.();else document.exitFullscreen?.()}
