'use strict';

function bindControls(){
  $('#panelTabs').addEventListener('click',e=>{const b=e.target.closest('button');if(b)switchPanel(b.dataset.tab)});
  $('#missionGrid').addEventListener('click',e=>{const b=e.target.closest('[data-mission]');if(b)selectMission(b.dataset.mission)});
  $('#categoryTabs').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;$$('#categoryTabs button').forEach(x=>x.classList.toggle('active',x===b));state.category=b.dataset.category;renderModelList()});
  $('#modelSelect').onchange=e=>selectModel(e.target.value);
  $('#hangarList').addEventListener('click',e=>{const b=e.target.closest('[data-buy]');if(b)selectModel(b.dataset.buy)});
  $('#upgradeList').addEventListener('click',e=>{const b=e.target.closest('[data-upgrade]');if(b)buyUpgrade(b.dataset.upgrade)});
  $('#difficultySelect').onchange=e=>{state.difficulty=e.target.value;updateBriefing()};
  $('#weatherSelect').onchange=applyEnvironment;$('#timeSelect').onchange=applyEnvironment;$('#cameraSelect').onchange=e=>setCamera(e.target.value);
  $('#chooseHomeBtn').onclick=()=>{state.phase='choose-home';state.routeEditing=false;$('#chooseHomeBtn').textContent='Нажмите на карту…';setObjective('Укажите место старта на карте',1,'Коснитесь нужной точки');$('#controlCenter').classList.remove('open');toast('Нажмите на нужную точку карты')};
  $('#routeEditBtn').onclick=toggleRouteEditor;$('#briefingBtn').onclick=openBriefing;$('#briefingLaunchBtn').onclick=()=>{$('#briefingDialog').close();setTimeout(launch,50)};$('#launchBtn').onclick=launch;
  $('#returnBtn').onclick=()=>beginRth(false);$('#landBtn').onclick=beginLanding;$('#pauseBtn').onclick=togglePause;
  $('#followBtn').onclick=()=>{state.follow=!state.follow;$('#followBtn').textContent=`◎ Слежение: ${state.follow?'вкл.':'выкл.'}`;toast(state.follow?'Слежение включено':'Карта разблокирована')};
  $('#centerBtn').onclick=()=>centerOn(state.launched?'aircraft':'home');$('#zoomInBtn').onclick=()=>changeZoom(1);$('#zoomOutBtn').onclick=()=>changeZoom(-1);$('#cameraBtn').onclick=cycleCamera;
  $('#searchBtn').onclick=()=>$('#searchDialog').showModal();$('#placeSearchBtn').onclick=e=>{e.preventDefault();searchPlace($('#placeInput').value)};$('#searchForm').onsubmit=e=>{e.preventDefault();searchPlace($('#placeInput').value)};
  $('#helpBtn').onclick=()=>$('#helpDialog').showModal();$('#settingsBtn').onclick=()=>$('#settingsDialog').showModal();$('#soundBtn').onclick=()=>{settings.sound=!settings.sound;saveSettings();applySettings();toast(settings.sound?'Звук включён':'Звук выключен')};
  $('#fullscreenBtn').onclick=()=>{if(!document.fullscreenElement)document.documentElement.requestFullscreen?.();else document.exitFullscreen?.()};
  $('#menuBtn').onclick=()=>$('#controlCenter').classList.add('open');$('#closePanel').onclick=()=>$('#controlCenter').classList.remove('open');
  $('#newFlightBtn').onclick=()=>setTimeout(()=>resetFlight(true),0);$('#replayBtn').onclick=e=>{e.preventDefault();$('#resultDialog').close();setTimeout(()=>openReplay(),80)};
  $('#replayPlayBtn').onclick=e=>{e.preventDefault();toggleReplay()};$('#replayRange').oninput=e=>drawReplay(+e.target.value);
  $('#clearLogBtn').onclick=()=>{if(confirm('Очистить журнал полётов?')){profile.logs=[];saveProfile();renderLog()}};
  $('#flightLog').addEventListener('click',e=>{const b=e.target.closest('[data-log-replay]');if(!b)return;const log=profile.logs[+b.dataset.logReplay];if(log?.replay)openReplay(log.replay)});

  $('#sensitivityRange').oninput=e=>$('#sensitivityValue').textContent=`${e.target.value}%`;
  $('#settingsDialog').addEventListener('close',()=>{settings.sensitivity=+$('#sensitivityRange').value/100;settings.quality=$('#qualitySelect').value;settings.haptics=$('#hapticsToggle').checked;settings.assist=$('#assistToggle').checked;settings.trail=$('#trailToggle').checked;saveSettings();applySettings();renderTiles()});
  $$('.dialog-close').forEach(b=>b.onclick=()=>b.closest('dialog').close());

  document.addEventListener('keydown',e=>{
    if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();state.keys.add(e.code);
    if(e.code==='Space'&&!state.launched)launch();if(e.code==='KeyR')beginRth(false);if(e.code==='KeyL')beginLanding();if(e.code==='KeyP')togglePause();if(e.code==='KeyC')cycleCamera();if(e.code==='Escape')$('#controlCenter').classList.remove('open')
  });document.addEventListener('keyup',e=>state.keys.delete(e.code));

  bindMapInteractions();bindJoysticks();
  $$('.mobile-actions button').forEach(b=>b.onclick=()=>{const a=b.dataset.action;if(a==='rth')beginRth(false);if(a==='pause')togglePause();if(a==='land')beginLanding();b.classList.add('active');setTimeout(()=>b.classList.remove('active'),180)});
  window.addEventListener('resize',resizeCanvas);window.addEventListener('online',updateOfflineBadge);window.addEventListener('offline',updateOfflineBadge);
}

function bindMapInteractions(){
  const map=$('#map');let drag=null,moved=false;
  map.addEventListener('pointerdown',e=>{moved=false;drag={x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY};map.setPointerCapture(e.pointerId);map.classList.add('dragging')});
  map.addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.lastX,dy=e.clientY-drag.lastY;if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>5)moved=true;drag.lastX=e.clientX;drag.lastY=e.clientY;if((state.follow&&state.launched)||state.phase==='choose-home'||state.routeEditing)return;panMapByPixels(dx,dy)});
  map.addEventListener('pointerup',e=>{
    if(!drag)return;map.classList.remove('dragging');const rect=map.getBoundingClientRect(),p=screenToLatLon(e.clientX-rect.left,e.clientY-rect.top);
    if(!moved&&state.phase==='choose-home'){setHome(p);state.phase='setup'}else if(!moved&&state.routeEditing)addCustomPoint(p);drag=null
  });
  map.addEventListener('pointercancel',()=>{drag=null;map.classList.remove('dragging')});
  map.addEventListener('wheel',e=>{e.preventDefault();const r=map.getBoundingClientRect();changeZoom(e.deltaY<0?1:-1,{x:e.clientX-r.left,y:e.clientY-r.top})},{passive:false});
  let pinch=null;map.addEventListener('touchstart',e=>{if(e.touches.length===2)pinch=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY)},{passive:true});map.addEventListener('touchmove',e=>{if(e.touches.length===2&&pinch){const d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);if(Math.abs(d-pinch)>38){changeZoom(d>pinch?1:-1);pinch=d}}},{passive:true});map.addEventListener('touchend',()=>pinch=null,{passive:true})
}
function bindJoysticks(){
  $$('.joystick').forEach(stick=>{let activeId=null;const knob=stick.querySelector('.stick-knob'),side=stick.dataset.stick;
    const update=e=>{const r=stick.getBoundingClientRect(),radius=r.width*.34,dx=e.clientX-(r.left+r.width/2),dy=e.clientY-(r.top+r.height/2),len=Math.hypot(dx,dy),scale=len>radius?radius/len:1,x=dx*scale,y=dy*scale;knob.style.transform=`translate(calc(-50% + ${x}px),calc(-50% + ${y}px))`;state.stick[side]={x:clamp(x/radius,-1,1),y:clamp(y/radius,-1,1)}};
    stick.addEventListener('pointerdown',e=>{activeId=e.pointerId;stick.setPointerCapture(e.pointerId);update(e);haptic(8)});stick.addEventListener('pointermove',e=>{if(e.pointerId===activeId)update(e)});const stop=e=>{if(activeId!==null&&(!e||e.pointerId===activeId)){activeId=null;state.stick[side]={x:0,y:0};knob.style.transform='translate(-50%,-50%)'}};stick.addEventListener('pointerup',stop);stick.addEventListener('pointercancel',stop)
  })
}

async function init(){
  initUi();bindControls();resizeCanvas();resetFlight(false);updateOfflineBadge();
  if('serviceWorker' in navigator){try{await navigator.serviceWorker.register('sw.js')}catch{}}
  setTimeout(()=>{$('#bootText').textContent='Карта и системы готовы'},350);setTimeout(()=>$('#boot').classList.add('hidden'),900);
  let helped=false;try{helped=localStorage.getItem('aurora-uav-help-v4')}catch{}if(!helped)setTimeout(()=>{$('#helpDialog').showModal();try{localStorage.setItem('aurora-uav-help-v4','1')}catch{}},1200);
  window.__AURORA_TEST__={state,profile,launch,beginRth,beginLanding,finishFlight,prepareMission,selectMission,selectModel,resetFlight,openReplay};
}
init();
