// Offline asset preparation. Inputs: official Quaternius Base Characters and UAL Standard GLBs.
// Usage: node scripts/build-runner.mjs base-clean.glb UAL1_Standard.glb public/models/runner.glb
import { readFile, writeFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { retargetClip } from 'three/addons/utils/SkeletonUtils.js';
globalThis.FileReader = class {
  async readAsArrayBuffer(blob) { this.result=await blob.arrayBuffer(); this.onloadend?.(); }
  async readAsDataURL(blob) { this.result=`data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`; this.onloadend?.(); }
};
async function load(path){const b=await readFile(path);return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');}
const [base,source]=await Promise.all([load(process.argv[2]),load(process.argv[3])]);
let targetMesh,sourceMesh;base.scene.traverse(n=>{if(n.isSkinnedMesh)targetMesh=n;});source.scene.traverse(n=>{if(n.isSkinnedMesh)sourceMesh=n;});
// Remove facial relief while retaining a seamless skinned head and neck.
const p=targetMesh.geometry.attributes.position;
for(let i=0;i<p.count;i++){
  const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
  if(y>1.585){const dx=x/.097,dy=(y-1.688)/.123,dz=(z+.01)/.105;const length=Math.hypot(dx,dy,dz);const blend=THREE.MathUtils.smoothstep(y,1.585,1.62);p.setXYZ(i,THREE.MathUtils.lerp(x,dx/length*.097,blend),THREE.MathUtils.lerp(y,1.688+dy/length*.123,blend),THREE.MathUtils.lerp(z,-.01+dz/length*.105,blend));}
}
targetMesh.geometry.computeVertexNormals();
base.scene.updateMatrixWorld(true);source.scene.updateMatrixWorld(true);
const clips=[];
for(const name of ['Idle_Loop','Jog_Fwd_Loop','Sprint_Loop']){
 targetMesh.skeleton.pose();sourceMesh.skeleton.pose();base.scene.updateMatrixWorld(true);source.scene.updateMatrixWorld(true);
 const clip=retargetClip(targetMesh,sourceMesh,source.animations.find(c=>c.name===name),{hip:'pelvis',getBoneName:b=>b.name,preserveBonePositions:true,fps:30});
 // Keep only vertical root bob. Forward and lateral movement belong to the game simulation.
 for(const track of clip.tracks)if(track.name.endsWith('.position')){for(let i=0;i<track.values.length;i+=3){track.values[i]=0;track.values[i+1]=.043;}}
 for(const track of clip.tracks) track.name=track.name.replace(/^\.bones\[([^\]]+)\]/, "$1");
 clip.name=name;clips.push(clip);
}
targetMesh.skeleton.pose();base.scene.updateMatrixWorld(true);
const exported=await new GLTFExporter().parseAsync(base.scene,{binary:true,animations:clips,onlyVisible:true});
await writeFile(process.argv[4],Buffer.from(exported));
console.log('Runner GLB:',exported.byteLength,'bytes;',clips.map(c=>[c.name,c.duration]));
