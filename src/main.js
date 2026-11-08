import * as THREE from 'three';
import './style.css';
import { createSound } from './sound.js';
import { C, Course, clamp, limit, distanceAt, speedAt, dragPosition, hit, groundSections, trackNearMiss } from './core.js';
async function main() {
const $ = s => document.querySelector(s);
const canvas=$('#scene'), game=$('#game'), overlay=$('#overlay'), countdown=$('#countdown'), distanceUI=$('#distance'), title=$('#title'), result=$('#result'), action=$('#action');
let renderer;
try { renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'}); }
catch { $('#error').hidden=false; $('#error').textContent='WebGLを利用できません。ブラウザを更新して、もう一度開いてください。'; overlay.hidden=true; throw new Error('WebGL unavailable'); }
renderer.setPixelRatio(Math.min(devicePixelRatio,2)); renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.setClearColor(0xd9dbde); renderer.outputColorSpace=THREE.SRGBColorSpace;
const scene=new THREE.Scene(); scene.fog=new THREE.Fog(0xd9dbde,22,40);
const camera=new THREE.PerspectiveCamera(48,1,.1,220);
scene.add(new THREE.HemisphereLight(0xffffff,0x777f8a,1.0));
const sun=new THREE.DirectionalLight(0xfff9ed,3.5);sun.position.set(-8,14,12);sun.target.position.set(0,0,-10); scene.add(sun,sun.target);
sun.castShadow=true; sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-7,right:7,top:30,bottom:-8,near:.1,far:60});sun.shadow.bias=-.0005;sun.shadow.normalBias=.025;
const roadMat=new THREE.MeshStandardMaterial({color:0xb7bcc2,roughness:1});
const edgeMat=new THREE.MeshStandardMaterial({color:0xcbd0d5,roughness:1});
const boxMat=new THREE.MeshStandardMaterial({color:0x969c9f,roughness:.95});
const darkMat=new THREE.MeshStandardMaterial({color:0x626b74,roughness:1});
const cube=new THREE.BoxGeometry(1,1,1);
const pitBottomMat=new THREE.MeshStandardMaterial({color:0x151b23,roughness:1});
const terrain=new THREE.Group();scene.add(terrain);
function block(parent,mat,x,y,z,w,h,d,shadow=false){const m=new THREE.Mesh(cube,mat);m.position.set(x,y,z);m.scale.set(w,h,d);m.receiveShadow=true;m.castShadow=shadow;parent.add(m);return m;}
action.disabled=true;
let character;
try { const { createRunner } = await import('./runner.js');character=await createRunner(); }
catch { $('#error').hidden=false;$('#error').textContent='キャラクターを読み込めませんでした。ページを再読み込みしてください。';overlay.hidden=true;throw new Error('Runner model unavailable'); }
const runner=character.root;scene.add(runner,character.trails);character.prepareTrails(renderer,scene,camera);action.disabled=false;
const sound=createSound();
const recordMarker=new THREE.Group();scene.add(recordMarker);
const recordMat=new THREE.MeshBasicMaterial({color:0xb3a58c,transparent:true,opacity:.6,depthWrite:false});
let state='ready', resumeState='running', elapsed=0, intro=0, deadTime=0, deathType='', x=0,targetX=0, accumulator=0;
let course, events=[], best=0, pointer=null, dragStart=0, cameraBlend=0;
let runBest=0,bestCrossed=false,nearMisses=0,lastNearMiss=-Infinity;
try{best=Number(localStorage.getItem('simple-run.best.v1'))||0;}catch{}
function updateGround(){
  terrain.clear();
  const dist=distanceAt(elapsed), start=Math.max(-20,dist-14), end=dist+speedAt(elapsed)*5.2;
  const half=C.road/2;
  const sections=groundSections(events,start,end);
  recordMarker.clear();
  if(runBest>0&&runBest>=start&&runBest<=end){
    const section=sections.find(s=>s.a<=runBest&&s.b>runBest);
    for(const [left,right] of section?.spans??[]){block(recordMarker,recordMat,(left+right)/2,.009,0,right-left,.004,.11);}
  }
  for(const {a,b,spans} of sections){
    for(const [left,right] of spans){
      block(terrain,roadMat,(left+right)/2,-.12,-(a+b)/2,right-left,.24,b-a);
      if(left<=-half+1e-6)block(terrain,edgeMat,-half+.012,.004,-(a+b)/2,.024,.008,b-a);
      if(right>=half-1e-6)block(terrain,edgeMat,half-.012,.004,-(a+b)/2,.024,.008,b-a);
    }
    for(let z=Math.ceil(a/4)*4;z<b;z+=4)for(const [left,right] of spans){
      block(terrain,edgeMat,(left+right)/2,.002,-z,right-left,.003,.018);
    }
  }
  for(const o of events){
    if(o.z+o.depth<start||o.z>end)continue;
    if(o.type==='pit'){
      const a=Math.max(start,o.z),b=Math.min(end,o.z+o.depth);
      block(terrain,pitBottomMat,o.x,-1.9,-(a+b)/2,o.width,.2,b-a);
      block(terrain,darkMat,o.x,-.9,-a,o.width,1.8,.025);
      block(terrain,darkMat,o.x,-.9,-b,o.width,1.8,.025);
      // Edge cut-outs are genuinely open on the outside; no strip of floor or outer wall remains.
      if(o.x-o.width/2>-half+1e-6)block(terrain,darkMat,o.x-o.width/2,-.9,-(a+b)/2,.025,1.8,b-a);
      if(o.x+o.width/2<half-1e-6)block(terrain,darkMat,o.x+o.width/2,-.9,-(a+b)/2,.025,1.8,b-a);
    }else{
      const h=Math.min(1.3,.6+o.width*.25);
      block(terrain,boxMat,o.x,h/2,-o.z-o.depth/2,o.width,h,o.depth,true);
    }
  }
}
function populate(){let changed=false;const horizon=elapsed+5.5;while(course.nextTime<horizon){events.push(...course.append().obstacles);changed=true;}while(events.length&&events[0].z+events[0].depth<distanceAt(elapsed)-16){events.shift();changed=true;}if(changed)updateGround();}
function reset(){runBest=best;bestCrossed=false;nearMisses=0;lastNearMiss=-Infinity;sound.reset();character.clearTrails();elapsed=0;x=0;targetX=0;intro=0;deadTime=0;cameraBlend=0;accumulator=0;runner.rotation.set(0,0,0);runner.position.set(0,0,0);character.reset();course=new Course(import.meta.env.DEV && new URLSearchParams(location.search).has("seed") ? Number(new URLSearchParams(location.search).get("seed")) : Date.now());events=[];populate();updateGround();}
function buttonMode(mode){$('#action-path').setAttribute('d',mode==='retry'?'M35 14 A16 16 0 1 0 39 29 L34 27 A11 11 0 1 1 31 18 L23 18 L23 23 L40 23 L40 7 L35 7 Z':'M18 12 L36 24 L18 36 Z'); action.setAttribute('aria-label',mode==='retry'?'リトライ':mode==='resume'?'再開':'スタート');}
function begin(){reset();state='countdown';overlay.hidden=true;distanceUI.hidden=true;countdown.textContent='3';}
function pause(){if(!['countdown','running'].includes(state))return;resumeState=state;state='paused';sound.silence();pointer=null;targetX=x;overlay.hidden=false;title.hidden=true;result.hidden=true;countdown.textContent='';buttonMode('resume');}
function die(type){sound.impact(type);character.clearTrails();state='dead';deathType=type;deadTime=0;pointer=null;targetX=x;countdown.textContent='';const score=Math.floor(distanceAt(elapsed));best=Math.max(best,score);try{localStorage.setItem('simple-run.best.v1',String(best));}catch{}}
function showResult(){overlay.hidden=false;title.hidden=true;result.hidden=false;distanceUI.hidden=true;$('#score').textContent=`${Math.floor(distanceAt(elapsed))} m`;$('#best').textContent=`BEST ${best} m`;buttonMode('retry');}
action.addEventListener('click',()=>{sound.unlock();last=performance.now();if(state==='paused'){state=resumeState;overlay.hidden=true;accumulator=0;}else begin();});
game.addEventListener('pointerdown',e=>{if(state!=='running'||pointer!==null||!e.isPrimary)return;sound.unlock();pointer=e.pointerId;dragStart=e.clientX;targetX=x;game.setPointerCapture(e.pointerId);});
const projectionOrigin=new THREE.Vector3(), projectionRight=new THREE.Vector3();
function drag(e){
  if(e.pointerId!==pointer||state!=='running')return;
  // Match the torso's projected screen displacement, including the moving intro camera.
  camera.updateMatrixWorld();
  projectionOrigin.set(0,1,0).project(camera);
  projectionRight.set(1,1,0).project(camera);
  const pixelsPerUnit=Math.abs(projectionRight.x-projectionOrigin.x)*game.clientWidth/2;
  const nextX=dragPosition(x,e.clientX-dragStart,Math.max(1,pixelsPerUnit));
  dragStart=e.clientX;
  const z=distanceAt(elapsed);
  // Test the complete horizontal sweep before accepting input; instant input cannot teleport through hazards.
  const obstacle=events.find(o=>hit(o,z,z,x,nextX));
  if(obstacle){die(obstacle.type);return;}
  x=nextX;targetX=x;runner.position.x=x;
}
game.addEventListener('pointermove',e=>{
  if(e.pointerId!==pointer)return;
  const samples=e.getCoalescedEvents?.();
  for(const sample of samples?.length?samples:[e])drag(sample);
});
function release(e){if(e.pointerId!==pointer)return;if(e.type==='pointerup')drag(e);pointer=null;targetX=x;}
game.addEventListener('pointerup',release);game.addEventListener('pointercancel',release);game.addEventListener('lostpointercapture',release);
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});window.addEventListener('blur',pause);window.addEventListener('orientationchange',pause);
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();pause();$('#error').hidden=false;$('#error').textContent='描画が停止しました。ページを再読み込みしてください。';});
function resize(){camera.aspect=game.clientWidth/game.clientHeight;camera.updateProjectionMatrix();renderer.setSize(game.clientWidth,game.clientHeight,false);}window.addEventListener('resize',resize);resize();
function step(dt){
  if(state==='countdown'){
    character.update(dt,false,8);intro+=dt;countdown.textContent=String(3-Math.floor(intro/.65));
    if(intro>=1.95){state='running';distanceUI.hidden=false;countdown.textContent='Run!';}
  }else if(state==='running'){
    const previous=distanceAt(elapsed),oldX=x;
    elapsed+=dt;character.update(dt,true,speedAt(elapsed));
    const now=distanceAt(elapsed);
    for(const o of events)if(hit(o,previous,now,oldX,x)){die(o.type);break;}
    if(state==='running'){
      for(const o of events)if(trackNearMiss(o,previous,now,x)&&elapsed-lastNearMiss>=.22){
        lastNearMiss=elapsed;nearMisses++;sound.near(o.type,x/limit);runner.position.x=x;character.afterimage();
      }
      if(runBest>0&&!bestCrossed&&previous<runBest&&now>=runBest){bestCrossed=true;sound.record();}
      character.updateTrails(dt,speedAt(elapsed));populate();
    }
    if(elapsed>.45)countdown.textContent='';
    distanceUI.textContent=`${Math.floor(distanceAt(elapsed))} m`;
    cameraBlend=Math.min(1,elapsed/1.4);
  }else if(state==='dead'){
    deadTime+=dt;if(deathType==='pit'&&deadTime<.28)character.update(dt,true,speedAt(elapsed));if(deadTime>=.9){state='result';showResult();}
  }
}
function draw(){
  const dist=distanceAt(elapsed),speed=speedAt(elapsed);
  terrain.position.z=dist;
  recordMarker.position.z=dist-runBest;recordMarker.visible=runBest>0&&dist<runBest+3;
  scene.fog.near=speed*2.4;scene.fog.far=speed*4.4;camera.far=speed*6+30;camera.updateProjectionMatrix();
  runner.position.x=x;
  if(state==='dead'||state==='result'){
    const k=Math.min(1,deadTime/.65);
    if(deathType==='pit'){runner.position.y=-11*deadTime*deadTime;runner.rotation.x=-.18*k;}else{runner.rotation.x=-Math.PI/2*Math.sin(k*Math.PI/2);runner.position.y=.025+Math.sin(k*Math.PI)*.08;}
  }else{
    runner.position.y=0;
  }
  const k=cameraBlend*cameraBlend*(3-2*cameraBlend);
  camera.position.set(0,2.35+(7-2.35)*k,4.8+(7-4.8)*k);
  camera.lookAt(0,.8*(1-k),-6-3*k);
  camera.updateMatrixWorld();
  // Align with the visible end of the road rather than the top of the viewport.
  projectionOrigin.set(0,0,-speed*4.4).project(camera);
  distanceUI.style.top=`${clamp((1-projectionOrigin.y)/2,.10,.32)*100}%`;
  renderer.render(scene,camera);
}
reset();buttonMode('start');
let last=performance.now();
function frame(now){requestAnimationFrame(frame);const dt=(now-last)/1000;last=now;if(dt>.3&&state==='running')pause();if(state!=='paused'&&state!=='ready'&&state!=='result'){accumulator+=Math.min(dt,.1);while(accumulator>=C.step){step(C.step);accumulator-=C.step;}}draw();}
requestAnimationFrame(frame);
// Read-only diagnostics for local QA; no gameplay controls or route hints exposed.
window.simpleRun={snapshot:()=>({state,deathType,nearMisses,runBest,bestCrossed,trails:character.trailCount(),audio:sound.snapshot(),recordLine:recordMarker.children.length,time:elapsed,distance:distanceAt(elapsed),x,targetX,screenX:(new THREE.Vector3(x,1,0).project(camera).x+1)*game.clientWidth/2,speed:speedAt(elapsed),active:events.map(({type,x,width,z,depth,pattern,sequence,challenge,rhythm,recovery})=>({type,x,width,z:z-distanceAt(elapsed),depth,pattern,sequence,challenge,rhythm,recovery})),render:renderer.info.render.calls})};

}
main().catch(console.error);
