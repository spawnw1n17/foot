function lon2x(lon,z){return (lon+180)/360*Math.pow(2,z)*TILE_SIZE}
function lat2y(lat,z){const r=toRad(lat);return (1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2*Math.pow(2,z)*TILE_SIZE}
function x2lon(x,z){return x/(Math.pow(2,z)*TILE_SIZE)*360-180}
function y2lat(y,z){const n=Math.PI-2*Math.PI*y/(Math.pow(2,z)*TILE_SIZE);return toDeg(Math.atan(.5*(Math.exp(n)-Math.exp(-n))))}
function viewportSize(){const r=$('#map').getBoundingClientRect();return {w:r.width,h:r.height}}
function mapCenterPixels(){return {x:lon2x(state.map.lon,state.map.zoom)+state.map.offsetX,y:lat2y(state.map.lat,state.map.zoom)+state.map.offsetY}}
function worldToScreen(wx,wy){const {w,h}=viewportSize();return {x:w/2+wx-state.map.offsetX,y:h/2+wy-state.map.offsetY}}
function screenToWorld(sx,sy){const {w,h}=viewportSize();return {x:sx-w/2+state.map.offsetX,y:sy-h/2+state.map.offsetY}}

function renderTiles(){
 const layer=$('#tileLayer'),{w,h}=viewportSize(),z=state.map.zoom,center=mapCenterPixels();
 const startX=Math.floor((center.x-w/2)/TILE_SIZE)-1,endX=Math.floor((center.x+w/2)/TILE_SIZE)+1;
 const startY=Math.floor((center.y-h/2)/TILE_SIZE)-1,endY=Math.floor((center.y+h/2)/TILE_SIZE)+1;
 const max=Math.pow(2,z),wanted=new Set();
 for(let tx=startX;tx<=endX;tx++)for(let ty=startY;ty<=endY;ty++){
   if(ty<0||ty>=max)continue; const wrap=((tx%max)+max)%max,key=`${z}/${wrap}/${ty}`;wanted.add(key);
   let img=layer.querySelector(`[data-key="${key}"]`);
   if(!img){img=new Image();img.className='map-tile';img.dataset.key=key;img.alt='';img.draggable=false;img.src=`https://tile.openstreetmap.org/${z}/${wrap}/${ty}.png`;img.onerror=()=>img.classList.add('tile-error');layer.appendChild(img)}
   img.style.left=`${tx*TILE_SIZE-center.x+w/2}px`;img.style.top=`${ty*TILE_SIZE-center.y+h/2}px`;
 }
 [...layer.children].forEach(img=>{if(!wanted.has(img.dataset.key))img.remove()});
 updateMapObjects();
}
function updateMapObjects(){
 const pos=worldToScreen(state.x,state.y),home=worldToScreen(state.home.x,state.home.y);
 $('#aircraft').style.left=`${pos.x}px`;$('#aircraft').style.top=`${pos.y}px`;$('#aircraft').style.setProperty('--rotation',`${state.heading}deg`);
 $('#landingZone').style.left=`${home.x}px`;$('#landingZone').style.top=`${home.y}px`;
 drawRoute();
}
function resizeCanvas(){const c=$('#routeCanvas'),r=$('#map').getBoundingClientRect(),dpr=Math.min(2,devicePixelRatio||1);c.width=Math.round(r.width*dpr);c.height=Math.round(r.height*dpr);c.style.width=`${r.width}px`;c.style.height=`${r.height}px`;const ctx=c.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);renderTiles()}
function drawRoute(){
 const c=$('#routeCanvas'),ctx=c.getContext('2d'),{w,h}=viewportSize();ctx.clearRect(0,0,w,h);
 if(state.route.length>1){ctx.beginPath();state.route.forEach((p,i)=>{const s=worldToScreen(p.x,p.y);i?ctx.lineTo(s.x,s.y):ctx.moveTo(s.x,s.y)});ctx.strokeStyle='rgba(75,242,165,.72)';ctx.lineWidth=2;ctx.setLineDash([8,6]);ctx.stroke();ctx.setLineDash([])}
 state.gates.forEach((g,i)=>{const s=worldToScreen(g.x,g.y);ctx.beginPath();ctx.arc(s.x,s.y,18,0,Math.PI*2);ctx.strokeStyle=i<state.gateIndex?'rgba(75,242,165,.35)':i===state.gateIndex?'#62e7ff':'rgba(255,255,255,.25)';ctx.lineWidth=i===state.gateIndex?3:2;ctx.stroke();ctx.fillStyle=i<state.gateIndex?'rgba(75,242,165,.1)':i===state.gateIndex?'rgba(98,231,255,.12)':'rgba(255,255,255,.04)';ctx.fill();ctx.fillStyle='#effbf7';ctx.font='700 10px system-ui';ctx.textAlign='center';ctx.fillText(String(i+1),s.x,s.y+3)});
}

function setHomeFromScreen(clientX,clientY){
 const rect=$('#map').getBoundingClientRect(),p=screenToWorld(clientX-rect.left,clientY-rect.top);state.home={x:p.x,y:p.y};state.x=p.x;state.y=p.y;state.homeChosen=true;state.map.offsetX=p.x;state.map.offsetY=p.y;createMission();setObjective('Запустите аппарат',1);setFlightState('СТАРТОВАЯ ТОЧКА ВЫБРАНА');toast('Стартовая точка установлена');renderTiles();
}
function createMission(){
 const base=state.home,angle=Math.random()*Math.PI*2;state.gates=[0,1,2].map((_,i)=>{const radius=150+i*85,a=angle+i*1.85;return{x:base.x+Math.cos(a)*radius,y:base.y+Math.sin(a)*radius}});state.gateIndex=0;updateMissionUi();
}
function updateMissionUi(){
 $('#gateCounter').textContent=`${state.gateIndex} / ${state.gates.length||3}`;$('#missionProgress').style.width=`${state.gates.length?state.gateIndex/state.gates.length*100:0}%`;
}
function setObjective(text,index){$('#objectiveText').textContent=text;$('#objectiveIndex').textContent=index}
function setFlightState(text,type=''){const el=$('#flightState');el.className=`flight-state ${type}`.trim();el.querySelector('span').textContent=text}
function toast(text){const el=$('#toast');el.textContent=text;el.classList.add('visible');clearTimeout(state.toastTimer);state.toastTimer=setTimeout(()=>el.classList.remove('visible'),2400)}
function applyEnvironment(){const t=$('#timeSelect').value,w=$('#weatherSelect').value;$('#weatherOverlay').className=`weather-overlay ${t==='day'?'':t} ${w==='fog'?'fog':''}`.trim()}
