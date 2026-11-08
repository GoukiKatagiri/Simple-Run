import test from 'node:test';
import assert from 'node:assert/strict';
import { C, Course, distanceAt, timeAt, speedAt, safeIntervals, intersectSpans, groundSections, openSpans, exitTime, entryTime, hit, dragPosition, limit, intervalAt, trackNearMiss } from '../src/core.js';
test('200,000 rows have a reachable route through every obstacle in each group', () => {
  const totals={switch:0,narrow:0,gate:0,rest:0};const combinations=new Set();let edgePits=0;
  for(let seed=0;seed<200;seed++) {
    const c=new Course(seed);let px=0,previousExit=0,prev,recent=[],lastKind=null,streak=0;
    for(let n=0;n<1000;n++) {
      const row=c.append(),safe=safeIntervals(row);totals[row.pattern]++;
      const kind=row.obstacles.every(o=>o.type===row.obstacles[0].type)?row.obstacles[0].type:null;
      streak=kind?(kind===lastKind?streak+1:1):0;lastKind=kind;
      assert.ok(streak<=3,`seed ${seed}, row ${n}: ${kind} repeated ${streak} times`);
      assert.ok(safe.some(([a,b])=>row.safeX>=a-1e-8&&row.safeX<=b+1e-8));
      assert.ok(Math.abs(row.safeX-px)/C.planningLateralSpeed+C.reaction<=entryTime(row)-previousExit+1e-8);
      for(const o of row.obstacles){
        assert.ok(o.x-o.width/2>=-1.500001&&o.x+o.width/2<=1.500001);
        assert.ok(!hit(o,o.z-1,o.z+o.depth+1,row.safeX,row.safeX));
        if(o.type==='box')assert.ok(o.depth<=1.5+1e-8);
        else {assert.ok(o.depth<=5.5+1e-8);if(Math.abs(o.x-o.width/2+1.5)<1e-8||Math.abs(o.x+o.width/2-1.5)<1e-8)edgePits++;}
      }
      if(row.pattern==='gate'){
        assert.equal(row.obstacles.length,2);combinations.add(row.obstacles.map(o=>o.type).join('+'));
        const [a,b]=row.obstacles;
        assert.ok(b.x-b.width/2-(a.x+a.width/2)>=.84-1e-8);
        assert.ok(!safe.some(([a,b])=>a<=-limit||b>=limit));
      }
      if(row.pattern!=='rest')assert.ok(Math.abs(row.safeX-px)>=.55);
      if(recent.length===2)assert.equal(intersectSpans(intersectSpans(recent[0],recent[1]),safe).length,0);
      recent.push(safe);if(recent.length>2)recent.shift();
      if(prev){const [lo,hi]=row.recovery?[1.3,1.6]:intervalAt(prev.z);assert.ok(row.t-prev.t>=lo-1e-8&&row.t-prev.t<=hi+1e-8);}
      assert.ok(entryTime(row)>previousExit);
      px=row.safeX;previousExit=exitTime(row);prev=row;
    }
  }
  assert.equal(combinations.size,4);assert.ok(edgePits>10000);
  assert.ok(totals.gate>15000&&totals.gate<50000,JSON.stringify(totals));
  assert.ok(totals.rest<12000);
});
test('floor generation subtracts both pits at the same depth and preserves their central bridge',()=>{
 const pits=[{type:'pit',x:-1,width:1,z:10,depth:4},{type:'pit',x:1,width:1,z:10,depth:2}];
 const sections=groundSections(pits,8,16);
 assert.deepEqual(sections.map(s=>[s.a,s.b,s.spans]),[
  [8,10,[[-1.5,1.5]]],[10,12,[[-.5,.5]]],[12,14,[[-.5,1.5]]],[14,16,[[-1.5,1.5]]]
 ]);
});
test('group clearance subtracts the union of overlapping collision margins',()=>{
 const obstacles=[{x:-1,width:1},{x:1,width:1}];
 const safe=safeIntervals({obstacles});assert.equal(safe.length,1);assert.ok(safe[0][0]<0&&safe[0][1]>0);
 assert.deepEqual(openSpans([{x:0,width:2},{x:.2,width:2}]),[[-1.5,-1],[1.2,1.5]]);
});
test('distance and inverse remain continuous through speed cap',()=>{
  for(const t of [0,1,119.999,120,120.001,200,1000])assert.ok(Math.abs(timeAt(distanceAt(t))-t)<1e-8);
  assert.equal(speedAt(0),8); assert.equal(speedAt(60),39); assert.equal(speedAt(120),70); assert.equal(speedAt(10000),70); assert.equal(distanceAt(120),4680); assert.equal(distanceAt(121),4750);
});
test('collision sweeps catch crossing without endpoint overlap',()=>{
  const box={type:'box',x:0,width:.5,z:10,depth:.1};
  assert.equal(hit(box,8,12,0,0),true);
  assert.equal(hit(box,8,12,1,1),false);
  assert.equal(hit(box,10,10.1,-1,1),true);
  assert.equal(hit(box,10,10.1,.57,.57),true);
  assert.equal(hit({...box,type:'pit'},10,10.1,.57,.57),false);
});
test('drag moves immediately at 1:1 screen scale, clamps and reverses at edges',()=>{
  assert.equal(dragPosition(0,80,100),.8);
  assert.equal(dragPosition(0,1000,100),limit);
  assert.equal(dragPosition(0,-1000,100),-limit);
  assert.ok(Math.abs(dragPosition(limit,-10,100)-(limit-.1))<1e-10);
  assert.equal(dragPosition(.4,0,100),.4);
});

test('challenge is four reachable rows after 900m, with two big turns, a narrow gate and a paired recovery',()=>{
 let challenges=0,rhythms=0;
 for(let seed=0;seed<100;seed++){
  const c=new Course(seed);let current=[],lastChallengeExit=-Infinity,prev;
  for(let n=0;n<1000;n++){
   const row=c.append();
   if(row.challenge){
    const {index,id,length}=row.challenge;
    assert.equal(length,4);assert.ok(row.z>=900);
    if(index===0){assert.equal(current.length,0);assert.ok(row.t-lastChallengeExit>=20);}
    assert.equal(index,current.length);if(index)assert.equal(id,current[0].row.challenge.id);
    current.push({row,move:Math.abs(row.safeX-(prev?.safeX??0))});
    if(index===3){
     assert.deepEqual(current.map(c=>c.row.pattern),['switch','switch','switch','gate']);
     assert.ok(current.filter(c=>c.move>=1.2).length>=2);
     const [left,right]=row.obstacles;
     assert.ok(right.x-right.width/2-(left.x+left.width/2)<1.01);
     lastChallengeExit=exitTime(row);current=[];challenges++;
    }
   }
   if(row.recovery){assert.equal(prev.challenge?.index,3);assert.ok(row.t-prev.t>=1.3&&row.t-prev.t<=1.6);}
   if(prev?.challenge?.index===3)assert.equal(row.recovery,true);
   if(row.rhythm){assert.equal(row.rhythm.length,3);assert.ok(row.z>=400);rhythms++;}
   prev=row;
  }
 }
 assert.ok(challenges>100);assert.ok(rhythms>100);
});
test('near miss triggers once only after full passage, not for distant or colliding passes',()=>{
 const o={type:'box',x:0,width:1,z:10,depth:1};
 assert.equal(trackNearMiss(o,9,10,.9),false);
 assert.equal(trackNearMiss(o,10,11,.9),false);
 assert.equal(trackNearMiss(o,11,12,.9),true);
 assert.equal(trackNearMiss(o,12,13,.9),false);
 assert.equal(trackNearMiss({...o,passed:false,closest:Infinity},9,12,1.2),false);
 assert.equal(trackNearMiss({...o,passed:false,closest:Infinity},9,12,0),false);
 const pit={type:'pit',x:0,width:1,z:10,depth:2};
 assert.equal(trackNearMiss(pit,9,10,.6),false);assert.equal(trackNearMiss(pit,11,13,.6),true);
});
