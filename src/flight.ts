import * as THREE from 'three';
import {pointAt,nearest,RailAxis} from './axis';
import {buildGuara} from './guara';
export function createFlight(scene:THREE.Scene,camera:THREE.PerspectiveCamera,controls:any,axis:RailAxis,onStart:()=>void){
 const dark=new THREE.MeshStandardMaterial({color:0x242527,roughness:.8});
 const {bird,wings}=buildGuara();scene.add(bird);bird.visible=false;
 const train=new THREE.Group();train.name='Trem de carga ilustrativo · escala aproximada';scene.add(train);
 const steel=new THREE.MeshStandardMaterial({color:0x3b5366,roughness:.8});const cargo=new THREE.MeshStandardMaterial({color:0x857b70,roughness:.85});const glass=new THREE.MeshStandardMaterial({color:0x253943,roughness:.3});
 function box(parent:THREE.Object3D,w:number,h:number,l:number,x:number,y:number,z:number,mat:THREE.Material){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,l),mat);m.position.set(x,y,z);m.castShadow=true;parent.add(m)}
 for(let i=0;i<5;i++){const car=new THREE.Group();const s=450-i*18;const p=pointAt(axis,s);car.position.set(p.x,0,-p.y);car.rotation.y=Math.atan2(-p.tx,p.ty);box(car,2.8,.55,16,0,1.1,0,dark);box(car,2.7,i===0?2.25:2.6,i===0?11:15,0,2.5,0,i===0?steel:cargo);if(i===0){box(car,2.85,2.65,3.2,0,2.7,-5.4,steel);box(car,2.88,.8,1,0,3.25,-6,glass);box(car,1.8,.15,1,0,4.08,-5.4,steel)}for(const z of [-5.7,-4.5,4.5,5.7])for(const x of [-1.05,1.05]){const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.45,.45,.22,8),dark);wheel.rotation.z=Math.PI/2;wheel.position.set(x,.48,z);car.add(wheel)}train.add(car)}
 const panel=document.createElement('section');panel.id='flight-panel';panel.className='glass hidden';panel.setAttribute('aria-label','Voo do guará');
 panel.innerHTML=`<div class="flight-heading"><strong>Voo do guará</strong><span id="flight-status" aria-live="polite">Voo livre</span><button id="flight-exit" type="button" aria-label="Sair do voo">Sair ×</button></div>
 <div class="flight-settings"><label>Modo <select id="flight-mode"><option value="free">Voo livre · WASD</option><option value="rail">Seguir o trilho</option></select></label><button id="flight-pause" type="button">Pausar</button><button id="flight-reverse" type="button">Virar 180°</button><label>Altura <input id="flight-height" type="range" min="12" max="100" value="28"><output id="flight-height-value">28 m</output></label><label>Velocidade <input id="flight-speed" type="range" min="3" max="25" value="10"><output id="flight-speed-value">10 m/s</output></label><label><input id="flight-bird" type="checkbox" checked> Guará</label></div>
 <div class="flight-pilot" role="group" aria-label="Pilotagem livre"><button data-flight-key="a" aria-label="Virar à esquerda">A ←</button><button data-flight-key="w" aria-label="Avançar">W ↑</button><button data-flight-key="s" aria-label="Recuar">S ↓</button><button data-flight-key="d" aria-label="Virar à direita">D →</button><button data-flight-key="q" aria-label="Descer">Q − altura</button><button data-flight-key="e" aria-label="Subir">E + altura</button></div>
 <small id="flight-help">Segure W/S para avançar/recuar · A/D para virar · Q/E para altura · Espaço pausa · Esc sai</small>`;document.body.append(panel);
 const button=document.createElement('button');button.id='btnFlight';button.textContent='Voo do guará';button.setAttribute('aria-pressed','false');document.querySelector('#btnHome')!.before(button);
 const trainControl=document.createElement('label');trainControl.className='train-toggle';trainControl.innerHTML='<input type="checkbox" checked> Trem ilustrativo <small>Escala aproximada · sem operação simulada</small>';document.querySelector('#layerList')!.append(trainControl);trainControl.querySelector('input')!.onchange=e=>train.visible=(e.target as HTMLInputElement).checked;
 let active=false,playing=true,s=0,direction=1,clock=0,height=28,speed=10,withBird=true,mode:'free'|'rail'='free',yaw=0,velocity=0,turn=0;
 const position=new THREE.Vector3(),keys=new Set<string>();const pause=panel.querySelector<HTMLButtonElement>('#flight-pause')!;
 const pilot=panel.querySelector<HTMLElement>('.flight-pilot')!,status=panel.querySelector<HTMLElement>('#flight-status')!;
 const heightInput=panel.querySelector<HTMLInputElement>('#flight-height')!;
 const extent={minX:Math.min(...axis.pts.map(p=>p[0]))-200,maxX:Math.max(...axis.pts.map(p=>p[0]))+200,minZ:-Math.max(...axis.pts.map(p=>p[1]))-200,maxZ:-Math.min(...axis.pts.map(p=>p[1]))+200};
 function clearKeys(){keys.clear();panel.querySelectorAll('[data-flight-key]').forEach(b=>b.classList.remove('held'));}
 function ui(){pause.textContent=playing?'Pausar':'Continuar';status.textContent=!playing?'Pausado':mode==='free'?'Voo livre · WASD':'Percurso pelo trilho';pilot.hidden=mode!=='free';panel.querySelector('#flight-reverse')!.textContent=mode==='free'?'Virar 180°':'Inverter sentido';panel.querySelector('#flight-help')!.textContent=mode==='free'?'Segure W/S para avançar/recuar · A/D para virar · Q/E para altura · Espaço pausa · Esc sai':'Percurso automático pelo trilho · ajuste altura e velocidade · mude para Voo livre para pilotar';}
 function setHeight(v:number){height=THREE.MathUtils.clamp(v,12,100);heightInput.value=String(height);panel.querySelector('#flight-height-value')!.textContent=Math.round(height)+' m';}
 function stop(){active=false;clearKeys();velocity=0;bird.visible=false;panel.classList.add('hidden');button.setAttribute('aria-pressed','false');controls.enabled=true;document.body.classList.remove('flight-active');}
 function start(){onStart();active=true;playing=true;clearKeys();velocity=turn=0;s=THREE.MathUtils.clamp(nearest(axis,controls.target.x,-controls.target.z).s,0,axis.length);const p=pointAt(axis,s);position.set(p.x,height,-p.y);yaw=Math.atan2(-p.tx*direction,p.ty*direction);controls.enabled=false;panel.classList.remove('hidden');button.setAttribute('aria-pressed','true');document.body.classList.add('flight-active');ui();update(0,true);}
 function togglePause(){playing=!playing;clearKeys();velocity=0;ui();}
 button.onclick=()=>active?stop():start();panel.querySelector<HTMLButtonElement>('#flight-exit')!.onclick=stop;pause.onclick=togglePause;
 panel.querySelector<HTMLButtonElement>('#flight-reverse')!.onclick=()=>{if(mode==='rail')direction*=-1;else yaw+=Math.PI;};
 panel.querySelector<HTMLSelectElement>('#flight-mode')!.onchange=e=>{(e.target as HTMLSelectElement).blur();mode=(e.target as HTMLSelectElement).value as 'free'|'rail';clearKeys();velocity=0;if(mode==='rail'){s=nearest(axis,position.x,-position.z).s;const p=pointAt(axis,s);direction=(-Math.sin(yaw)*p.tx+Math.cos(yaw)*p.ty)>=0?1:-1;}ui();};
 heightInput.oninput=e=>setHeight(Number((e.target as HTMLInputElement).value));panel.querySelector<HTMLInputElement>('#flight-speed')!.oninput=e=>{speed=Number((e.target as HTMLInputElement).value);panel.querySelector('#flight-speed-value')!.textContent=speed+' m/s';};panel.querySelector<HTMLInputElement>('#flight-bird')!.onchange=e=>withBird=(e.target as HTMLInputElement).checked;
 const aliases:Record<string,string>={arrowup:'w',arrowdown:'s',arrowleft:'a',arrowright:'d'};
 function keyName(e:KeyboardEvent){return aliases[e.key.toLowerCase()]||e.key.toLowerCase();}
 addEventListener('keydown',e=>{if(!active)return;const k=keyName(e);if(k==='escape'){e.preventDefault();e.stopImmediatePropagation();stop();return;}const el=e.target as HTMLElement;if(el.isContentEditable||el.matches('select,textarea,input:not([type=range]):not([type=checkbox])')||(el.matches('input')&&!['w','a','s','d','q','e'].includes(k)))return;if(!['w','a','s','d','q','e',' '].includes(k))return;e.preventDefault();e.stopImmediatePropagation();if(k===' '){if(!e.repeat)togglePause();return;}if(mode==='free'&&playing){keys.add(k);panel.querySelector(`[data-flight-key="${k}"]`)?.classList.add('held');}},true);
 addEventListener('keyup',e=>{const k=keyName(e);keys.delete(k);panel.querySelector(`[data-flight-key="${k}"]`)?.classList.remove('held');if(active&&['w','a','s','d','q','e',' '].includes(k)){e.preventDefault();e.stopImmediatePropagation();}},true);
 for(const b of panel.querySelectorAll<HTMLButtonElement>('[data-flight-key]')){
  b.onpointerdown=e=>{if(!playing||mode!=='free')return;e.preventDefault();b.setPointerCapture(e.pointerId);keys.add(b.dataset.flightKey!);b.classList.add('held');};
  const release=()=>{keys.delete(b.dataset.flightKey!);b.classList.remove('held');};b.onpointerup=release;b.onpointercancel=release;b.onlostpointercapture=release;
 }
 addEventListener('blur',()=>{clearKeys();if(active){playing=false;velocity=0;ui();}});document.addEventListener('visibilitychange',()=>{if(document.hidden&&active){playing=false;velocity=0;clearKeys();ui();}});
 const desired=new THREE.Vector3(),target=new THREE.Vector3(),forward=new THREE.Vector3();
 function update(dt:number,snap=false){
  if(!active)return false;dt=Math.min(dt,.05);clock+=dt;
  const alpha=1-Math.exp(-dt*5);
  if(mode==='rail'){
   if(playing)s=THREE.MathUtils.clamp(s+direction*speed*dt,0,axis.length);
   if(playing&&((s===0&&direction<0)||(s===axis.length&&direction>0))){playing=false;ui();}
   const p=pointAt(axis,s);position.set(p.x,height,-p.y);const desiredYaw=Math.atan2(-p.tx*direction,p.ty*direction);yaw+=Math.atan2(Math.sin(desiredYaw-yaw),Math.cos(desiredYaw-yaw))*(snap?1:alpha);turn*=1-alpha;
  }else{
   const steer=playing?(Number(keys.has('a'))-Number(keys.has('d'))):0;turn=THREE.MathUtils.lerp(turn,steer,alpha);if(playing)yaw+=turn*1.25*dt;
   const input=playing?(Number(keys.has('w'))-Number(keys.has('s'))):0;velocity=playing?THREE.MathUtils.lerp(velocity,input*speed,alpha):0;
   if(playing&&(keys.has('q')||keys.has('e')))setHeight(height+(Number(keys.has('e'))-Number(keys.has('q')))*8*dt);
   position.x=THREE.MathUtils.clamp(position.x-Math.sin(yaw)*velocity*dt,extent.minX,extent.maxX);position.z=THREE.MathUtils.clamp(position.z-Math.cos(yaw)*velocity*dt,extent.minZ,extent.maxZ);position.y=height;
  }
  bird.visible=withBird;bird.position.copy(position);bird.rotation.set(0,yaw,0);bird.rotateZ(-turn*.26);bird.rotateX(mode==='free'?Math.max(-.12,Math.min(.12,-velocity*.006)):0);
  const flap=Math.sin(clock*4.6)*.34;wings[0].rotation.z=flap+.08;wings[1].rotation.z=-flap-.08;
  forward.set(-Math.sin(yaw),0,-Math.cos(yaw));desired.copy(position).addScaledVector(forward,-11);desired.y+=4.2;target.copy(position).addScaledVector(forward,7);target.y-=innerWidth<760?5.5:.6;
  const cameraAlpha=snap?1:1-Math.exp(-dt*4);camera.position.lerp(desired,cameraAlpha);controls.target.lerp(target,cameraAlpha);camera.lookAt(controls.target);return true;
 }
 return {update,stop,get active(){return active},get mode(){return mode},get playing(){return playing},train,bird};
}
