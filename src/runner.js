import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

// Quaternius CC0 base body + retargeted UAL clips. Gameplay always moves along -Z.
export async function createRunner() {
  const gltf = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/runner.glb`);
  const root = new THREE.Group();
  const model = gltf.scene;
  // Slim the superhero base into a lean, long-limbed runner; preserve 0.6-wide shoulders.
  model.scale.set(.94, 1.105, .92);
  model.rotation.y=Math.PI;
  model.position.y = .075;
  const material = new THREE.MeshStandardMaterial({color:0xf0f0eb, roughness:.72, metalness:0});
  model.traverse(n=>{if(n.isMesh){n.material=material;n.castShadow=true;n.receiveShadow=true;n.frustumCulled=false;}});
  root.add(model);
  const mixer = new THREE.AnimationMixer(model);
  const idle = mixer.clipAction(THREE.AnimationClip.findByName(gltf.animations,'Idle_Loop')).play();
  const jog = mixer.clipAction(THREE.AnimationClip.findByName(gltf.animations,'Jog_Fwd_Loop')).play();
  const sprint = mixer.clipAction(THREE.AnimationClip.findByName(gltf.animations,'Sprint_Loop')).play();
  jog.weight=0;sprint.weight=0;mixer.update(0);
  const trails=new THREE.Group(),sourceBones=[];
  root.traverse(n=>{if(n.isBone)sourceBones.push(n);});
  const ghosts=Array.from({length:2},()=>{
    const mesh=clone(root),bones=new Map();
    const material=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0,depthWrite:false});
    mesh.traverse(n=>{if(n.isMesh){n.material=material;n.castShadow=false;n.receiveShadow=false;}if(n.isBone)bones.set(n.name,n);});
    mesh.visible=false;trails.add(mesh);return {mesh,bones,material,age:1};
  });
  let nextGhost=0;
  return {
    root,trails,
    prepareTrails(renderer,scene,camera){
      for(const g of ghosts){g.mesh.visible=true;g.material.opacity=0;}
      renderer.compile(scene,camera);
      for(const g of ghosts)g.mesh.visible=false;
    },
    afterimage(){
      const ghost=ghosts[nextGhost++%ghosts.length];ghost.age=0;ghost.mesh.visible=true;
      ghost.mesh.position.copy(root.position);ghost.mesh.rotation.copy(root.rotation);
      for(const bone of sourceBones){const target=ghost.bones.get(bone.name);target.position.copy(bone.position);target.quaternion.copy(bone.quaternion);target.scale.copy(bone.scale);}
      ghost.material.opacity=.12;ghost.mesh.updateMatrixWorld(true);
    },
    updateTrails(dt,speed){for(const g of ghosts){if(!g.mesh.visible)continue;g.age+=dt;g.mesh.position.z+=speed*dt*.5;g.material.opacity=.12*Math.max(0,1-g.age/.16)**2;if(g.age>=.16)g.mesh.visible=false;}},
    clearTrails(){for(const g of ghosts){g.mesh.visible=false;g.age=1;}},
    trailCount:()=>ghosts.filter(g=>g.mesh.visible).length,
    update(dt,running,speed){
      const blend=THREE.MathUtils.smoothstep(speed,11,17);
      idle.setEffectiveWeight(running?0:1);
      jog.setEffectiveWeight(running?1-blend:0);
      sprint.setEffectiveWeight(running?blend:0);
      jog.setEffectiveTimeScale(THREE.MathUtils.clamp(speed/9,.9,1.25));
      sprint.setEffectiveTimeScale(THREE.MathUtils.clamp(speed/17,.85,1.15));
      mixer.update(dt);
    },
    reset(){for(const a of [idle,jog,sprint])a.reset().play();idle.weight=1;jog.weight=0;sprint.weight=0;mixer.update(0);},
  };
}
