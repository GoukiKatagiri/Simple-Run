import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('bundled runner contains skinned body and actual standalone locomotion clips',()=>{
 const b=readFileSync(new URL('../public/models/runner.glb',import.meta.url));
 assert.equal(b.readUInt32LE(0),0x46546c67);assert.equal(b.readUInt32LE(8),b.length);
 const j=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)).toString());
 assert.ok(j.skins.length>0);assert.equal(j.meshes.length,1);
 for(const name of ['Idle_Loop','Jog_Fwd_Loop','Sprint_Loop']){
  const clip=j.animations.find(a=>a.name===name);assert.ok(clip);assert.ok(clip.channels.length>30);
  assert.ok(clip.channels.some(c=>j.nodes[c.target.node].name==='thigh_l'&&c.target.path==='rotation'));
 }
 assert.ok(!j.images?.length);assert.ok(j.buffers.every(b=>!b.uri));
});
