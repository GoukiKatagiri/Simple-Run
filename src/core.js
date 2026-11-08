export const C = Object.freeze({ shoulder: .6, road: 3, radius: .3, padding: .03, clearance: .06, planningLateralSpeed: 5.4, reaction: .18, runnerDepth: .18, step: 1 / 120, viewSeconds: 4, startSpeed: 8, acceleration: 62 / 120, maxSpeed: 70 });
export const limit = C.road / 2 - C.radius;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const capTime = (C.maxSpeed - C.startSpeed) / C.acceleration;
const capDistance = C.startSpeed * capTime + .5 * C.acceleration * capTime ** 2;
export function speedAt(t) { return Math.min(C.maxSpeed, C.startSpeed + C.acceleration * Math.max(0, t)); }
export function distanceAt(t) {
  t = Math.max(0,t);
  return t <= capTime ? C.startSpeed*t + .5*C.acceleration*t*t : capDistance + (t-capTime)*C.maxSpeed;
}
export function timeAt(d) {
  d = Math.max(0,d);
  return d <= capDistance ? (-C.startSpeed+Math.sqrt(C.startSpeed**2+2*C.acceleration*d))/C.acceleration : capTime+(d-capDistance)/C.maxSpeed;
}
export function intervalAt(d) {
  const mix = (a, b, t) => a + (b - a) * t;
  if (d < 250) return [mix(1.8, 1, d / 250), mix(2.4, 1.5, d / 250)];
  const k = clamp((d - 250) / 650, 0, 1);
  return [mix(1, .6, k), mix(1.5, .9, k)];
}
export function random(seed) { let s = seed >>> 0; return () => { s += 0x6D2B79F5; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
// Subtract a union of blocked intervals; used for both physical floor geometry and clearance planning.
export function openSpans(obstacles, inflate = 0, left = -C.road/2, right = C.road/2) {
  const blocked = obstacles.map(o => [o.x-o.width/2-inflate, o.x+o.width/2+inflate]).sort((a,b)=>a[0]-b[0]);
  const spans=[]; let cursor=left;
  for(const [a,b] of blocked){
    if(b<=cursor||a>=right)continue;
    if(a>cursor)spans.push([cursor,Math.min(a,right)]);
    cursor=Math.max(cursor,b);
    if(cursor>=right)break;
  }
  if(cursor<right)spans.push([cursor,right]);
  return spans.filter(([a,b])=>b-a>1e-6);
}
export function safeIntervals(row) {
  return openSpans(row.obstacles ?? [row],C.radius+C.padding+C.clearance,-limit,limit);
}
export function intersectSpans(a,b){
  const result=[];
  for(const [al,ar] of a)for(const [bl,br] of b){const l=Math.max(al,bl),r=Math.min(ar,br);if(r-l>1e-6)result.push([l,r]);}
  return result;
}
export function entryTime(o) { return timeAt(o.z-C.runnerDepth); }
export function exitTime(o) { return timeAt(o.z+o.depth+C.runnerDepth); }
export function groundSections(obstacles,start,end){
  const pits=obstacles.filter(o=>o.type==='pit'&&o.z+o.depth>start&&o.z<end);
  const cuts=[...new Set([start,end,...pits.flatMap(o=>[clamp(o.z,start,end),clamp(o.z+o.depth,start,end)])])].sort((a,b)=>a-b);
  return cuts.slice(0,-1).map((a,i)=>{
    const b=cuts[i+1],mid=(a+b)/2;
    return {a,b,spans:openSpans(pits.filter(o=>o.z<=mid&&o.z+o.depth>=mid))};
  });
}

export class Course {
  constructor(seed=Date.now()) {
    this.rng=random(seed);this.count=0;this.previousX=0;this.previousExit=0;
    this.previousTime=0;this.previousDistance=0;this.nextTime=4;this.recentSafe=[];
    this.lastKind=null;this.kindStreak=0;
    this.challenge=null;this.rhythm=null;this.setSerial=0;this.recoveryPending=false;
    this.nextChallengeAt=timeAt(900)+4+this.rng()*6;this.nextRhythmAt=timeAt(400);
  }
  append(){
    const rng=this.rng;
    const recovering=this.recoveryPending;
    if(!this.challenge&&!this.rhythm&&!recovering){
      if(this.nextTime>=this.nextChallengeAt){
        this.challenge={id:++this.setSerial,index:0,patterns:['switch','switch','switch','gate']};
      }else if(this.nextTime>=this.nextRhythmAt&&rng()<.18){
        this.rhythm={id:++this.setSerial,index:0,patterns:rng()<.5?['switch','switch','switch']:['switch','switch','gate']};
      }
    }
    const script=this.challenge??this.rhythm;
    const difficulty=clamp(distanceAt(this.nextTime)/900,0,1);
    const variety=this.count<2?0:clamp((distanceAt(this.nextTime)-80)/320,0,1);
    const roll=rng();
    let pattern=roll<.15*variety?'gate':roll<.40*variety?'narrow':roll<.45*variety?'rest':'switch';
    // A single quiet beat is enough; the next row must ask for movement again.
    if(pattern==='rest'&&this.previousPattern==='rest')pattern='switch';
    if(script)pattern=script.patterns[script.index];
    const blockedKind=this.kindStreak>=3?this.lastKind:null;
    const type=()=>this.count<2?'box':blockedKind?(blockedKind==='box'?'pit':'box'):rng()<.45?'pit':'box';
    const half=C.road/2;
    let chosen;
    for(let attempt=0;attempt<48;attempt++){
      // Fallback keeps a real alternating route, rather than inserting a harmless obstacle.
      const mode=attempt===47&&!script?'switch':pattern;
      const opposite=this.previousX>0?-1:this.previousX<0?1:rng()<.5?-1:1;
      const span=(left,right,kind)=>({type:kind,x:(left+right)/2,width:right-left});
      let obstacles;
      if(mode==='gate'){
        const width=1.08-.24*difficulty+rng()*.08;
        const center=(rng()*2-1)*.35;
        const options=[['box','box'],['pit','pit'],['box','pit'],['pit','box']].filter(kinds=>!kinds.every(kind=>kind===blockedKind));
        const kinds=options[Math.floor(rng()*options.length)];
        obstacles=[span(-half,center-width/2,kinds[0]),span(center+width/2,half,kinds[1])];
      }else if(mode==='rest'){
        // A small inset obstacle makes occasional interior holes without occupying the previous safe point.
        const side=this.previousX>0?-1:1;
        obstacles=[{type:type(),x:side*.98,width:.65}];
      }else{
        const width=mode==='narrow'?.96-.12*difficulty+rng()*.05:1.3-.22*difficulty+rng()*.10;
        obstacles=[opposite>0?span(-half,half-width,type()):span(-half+width,half,type())];
      }
      const intervals=safeIntervals({obstacles});
      if(!intervals.length)continue;
      // Prefer the center of a passage; edges still have explicit body and collision clearance.
      let safeX;
      if(mode==='rest')safeX=this.previousX;
      else safeX=intervals.map(([a,b])=>(a+b)/2).sort((a,b)=>Math.abs(b-this.previousX)-Math.abs(a-this.previousX))[0];
      if(!intervals.some(([a,b])=>safeX>=a&&safeX<=b))continue;
      if(mode!=='rest'&&Math.abs(safeX-this.previousX)<.55)continue;
      if(this.recentSafe.length===2&&intersectSpans(intersectSpans(this.recentSafe[0],this.recentSafe[1]),intervals).length)continue;
      // Extend a too-short random beat only as much as needed for the chosen movement.
      const needed=this.previousExit+C.reaction+Math.abs(safeX-this.previousX)/C.planningLateralSpeed+.03;
      const t=Math.max(this.nextTime,needed);
      const hi=recovering?1.6:intervalAt(this.previousDistance)[1];
      if(this.count&&t-this.previousTime>hi+1e-8)continue;
      const z=distanceAt(t),speed=speedAt(t);
      for(const o of obstacles){
        o.z=z;o.t=t;o.sequence=this.count;o.pattern=mode;
        o.depth=o.type==='box'?.8+rng()*.7:clamp(speed*(.16+rng()*.10),1.4,5.5);
      }
      const depth=Math.max(...obstacles.map(o=>o.depth));
      const row={pattern:mode,t,z,depth,safeX,obstacles,recovery:recovering};
      if(script){
        row[this.challenge?'challenge':'rhythm']={id:script.id,index:script.index,length:script.patterns.length};
      }
      for(const o of obstacles){o.challenge=row.challenge;o.rhythm=row.rhythm;o.recovery=recovering;}
      if(Math.abs(safeX-this.previousX)/C.planningLateralSpeed+C.reaction>entryTime(row)-this.previousExit+1e-8)continue;
      chosen=row;break;
    }
    if(!chosen)throw new Error('Unable to generate a reachable course row');
    // Count homogeneous rows, not individual obstacles within a simultaneous pair.
    const kind=chosen.obstacles.every(o=>o.type===chosen.obstacles[0].type)?chosen.obstacles[0].type:null;
    this.kindStreak=kind?(kind===this.lastKind?this.kindStreak+1:1):0;this.lastKind=kind;
    this.previousX=chosen.safeX;this.previousExit=exitTime(chosen);
    this.previousTime=chosen.t;this.previousDistance=chosen.z;this.previousPattern=chosen.pattern;
    this.recentSafe.push(safeIntervals(chosen));if(this.recentSafe.length>2)this.recentSafe.shift();
    this.recoveryPending=false;
    let [lo,hi]=intervalAt(chosen.z);
    if(script){
      script.index++;
      if(script.index===script.patterns.length){
        if(this.challenge){
          this.challenge=null;this.recoveryPending=true;lo=1.3;hi=1.6;
          this.nextChallengeAt=exitTime(chosen)+20+rng()*15;
        }else this.rhythm=null;
        this.nextRhythmAt=chosen.t+5+rng()*4;
      }
    }
    this.nextTime=chosen.t+lo+rng()*(hi-lo);
    this.count++;return chosen;
  }
}
// Screen-space 1:1 input. No smoothing or simulated lateral speed limit.
export function dragPosition(x, deltaPixels, pixelsPerWorldUnit) {
  return clamp(x + deltaPixels / pixelsPerWorldUnit, -limit, limit);
}
// Slab intersection in (forward distance, lateral position); catches thin obstacles even across a long frame.
export function hit(o, z0, z1, x0, x1) {
  const r = o.type === 'box' ? C.radius + C.padding : 0;
  const front = o.z - (o.type === 'box' ? C.runnerDepth : 0);
  const back = o.z + o.depth + (o.type === 'box' ? C.runnerDepth : 0);
  let a = 0, b = 1;
  for (const [p, q, low, high] of [[z0, z1, front, back], [x0, x1, o.x - o.width / 2 - r, o.x + o.width / 2 + r]]) {
    const delta = q - p;
    if (Math.abs(delta) < 1e-10) { if (p < low || p > high) return false; }
    else { const t0 = (low - p) / delta, t1 = (high - p) / delta; a = Math.max(a, Math.min(t0,t1)); b = Math.min(b, Math.max(t0,t1)); if (a > b) return false; }
  }
  return true;
}

// Track the closest actual collision clearance only while alongside the obstacle.
// Feedback is emitted after fully passing it, never in advance of a possible collision.
export function trackNearMiss(o,z0,z1,x){
  if(o.passed)return false;
  const padding=o.type==='box'?C.radius+C.padding:0;
  const front=o.z-(o.type==='box'?C.runnerDepth:0);
  const back=o.z+o.depth+(o.type==='box'?C.runnerDepth:0);
  if(z1>=front&&z0<=back){
    const gap=Math.abs(x-o.x)-o.width/2-padding;
    if(gap>=0)o.closest=Math.min(o.closest??Infinity,gap);
  }
  if(z1>back){o.passed=true;return (o.closest??Infinity)<=.14;}
  return false;
}
