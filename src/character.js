import * as THREE from 'three';
import { GLTFLoader } from '../node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from '../node_modules/three/examples/jsm/utils/SkeletonUtils.js';
import { MOTION } from './motion.js';

const cache = new Map();
const boneName = name => `mixamorig${name}`;
let props;
function extractProp(scene, name, jointName) {
  const source = scene.getObjectByName(name), bone = scene.getObjectByName(boneName(jointName));
  if (!source?.isSkinnedMesh || !bone) throw new Error(`Missing character equipment: ${name}`);
  scene.updateMatrixWorld(true); source.skeleton.update();
  const geometry = source.geometry.clone(), positions = geometry.attributes.position, p = new THREE.Vector3();
  for(let i=0;i<positions.count;i++) { p.fromBufferAttribute(source.geometry.attributes.position,i); source.applyBoneTransform(i,p); source.localToWorld(p); bone.worldToLocal(p); positions.setXYZ(i,p.x,p.y,p.z); }
  geometry.deleteAttribute('skinIndex');geometry.deleteAttribute('skinWeight');geometry.computeVertexNormals();geometry.computeBoundingBox();
  return {geometry,material:source.material,position:bone.position.clone(),quaternion:bone.quaternion.clone(),parent:bone.parent.name};
}
export async function loadCharacterAssets() {
  if(cache.size===2)return;
  const loader = new GLTFLoader();
  await Promise.all(['knight','warden'].map(async type=>{
    const [gltf,response]=await Promise.all([loader.loadAsync(new URL(`../assets/characters/${type}.glb`,import.meta.url).href),fetch(new URL(`../assets/characters/${type}-clips.json`,import.meta.url))]);
    if(!response.ok)throw new Error(`Could not load ${type} animation library`);
    const data=await response.json();
    gltf.scene.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false;const materials=Array.isArray(o.material)?o.material:[o.material];for(const mat of materials){mat.envMapIntensity=.55;mat.roughness=Math.max(.6,mat.roughness);if(mat.map)mat.map.anisotropy=4;}}});
    cache.set(type,{scene:gltf.scene,clips:Object.fromEntries(Object.entries(data.clips).map(([n,c])=>[n,THREE.AnimationClip.parse(c)])),metadata:data.metadata});
  }));
  const warden=cache.get('warden').scene;
  // The source conversion labels meshes out of order; these are verified by geometry and skin weights.
  props={sword:extractProp(warden,'Paladin_J_Nordstrom','Sword_joint'),shield:extractProp(warden,'Paladin_J_Nordstrom_Helmet','Shield_joint')};
}

function prop(model, definition) {
  const g=new THREE.Group();g.position.copy(definition.position);g.quaternion.copy(definition.quaternion);
  const m=new THREE.Mesh(definition.geometry,definition.material);m.castShadow=true;m.receiveShadow=true;g.add(m);
  const parent=model.getObjectByName(definition.parent);if(!parent)throw new Error('Equipment attachment bone missing');parent.add(g);return {group:g,mesh:m};
}
export function createKnight({boss=false,player=false}={}) {
  const type=boss||player?'warden':'knight', asset=cache.get(type);
  if(!asset)throw new Error('Character assets have not loaded');
  const root=new THREE.Group(), model=clone(asset.scene);root.add(model);
  model.updateMatrixWorld(true);
  // Normalize anatomy to world metres, independently of the source FBX centimetres.
  const bounds=new THREE.Box3().setFromObject(model), height=bounds.max.y-bounds.min.y;
  root.scale.setScalar((boss?3.0:2.03)/height);
  const materialCopies=new Map();
  model.traverse(o=>{if(o.isMesh){o.material=Array.isArray(o.material)?o.material.map(tint):tint(o.material);o.frustumCulled=false;}});
  function tint(mat){if(!materialCopies.has(mat)){const m=mat.clone();m.color.multiply(new THREE.Color(player?0xc6cdd0:boss?0x9b9181:0x89918e));m.roughness=player?.67:.76;m.envMapIntensity=.55;m.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\n diffuseColor.rgb = mix(vec3(dot(diffuseColor.rgb, vec3(0.2126,0.7152,0.0722))), diffuseColor.rgb, 0.38);');};m.customProgramCacheKey=()=> 'ashfall-worn-texture';materialCopies.set(mat,m);}return materialCopies.get(mat);}
  let swordJoint, swordMesh, shieldMesh;
  if(type==='knight'){const s=prop(model,props.sword),g=prop(model,props.shield);swordJoint=s.group;swordMesh=s.mesh;shieldMesh=g.mesh;}
  else {swordJoint=model.getObjectByName(boneName('Sword_joint'));swordMesh=model.getObjectByName('Paladin_J_Nordstrom');shieldMesh=model.getObjectByName('Paladin_J_Nordstrom_Helmet');}
  const bladeTip=new THREE.Object3D(),bladeHeel=new THREE.Object3D();
  // Actual equipment-space endpoints, shared by the blade trail and visual checks.
  const vertices=props.sword.geometry.attributes.position,p=new THREE.Vector3();let farthest=0;
  for(let i=0;i<vertices.count;i++){p.fromBufferAttribute(vertices,i);if(p.lengthSq()>farthest){farthest=p.lengthSq();bladeTip.position.copy(p);}}
  bladeHeel.position.copy(bladeTip.position).multiplyScalar(.18);
  swordJoint.add(bladeTip,bladeHeel);
  const mixer=new THREE.AnimationMixer(model),actions={};
  for(const [name,clip]of Object.entries(asset.clips)){const a=mixer.clipAction(clip);a.clampWhenFinished=true;a.setLoop(['idle','walk','run','block','backward','left','right'].includes(name)?THREE.LoopRepeat:THREE.LoopOnce,Infinity);actions[name]=a;}
  const tell=new THREE.Mesh(new THREE.TorusGeometry(boss?1.1:.9,.012,6,64),new THREE.MeshBasicMaterial({color:0xbc925e,transparent:true,opacity:0,depthWrite:false}));tell.rotation.x=Math.PI/2;tell.position.y=.026;root.add(tell);
  const contacts=['LeftFoot','RightFoot','LeftToeBase','RightToeBase','Head','LeftForeArm','RightForeArm','LeftLeg','RightLeg'].map(n=>({node:model.getObjectByName(boneName(n)),radius:n==='Head'?.11:.035}));
  const support=[];
  model.updateMatrixWorld(true);
  model.traverse(o=>{if(o.isSkinnedMesh&&o.geometry.attributes.position.count>1500){const indices=[],a=o.geometry.attributes.position;for(let i=0;i<a.count;i+=Math.max(1,Math.floor(a.count/350)))indices.push(i);support.push({mesh:o,indices});}});
  return {root,model,mixer,actions,asset,type,boss,player,tell,blade:{tip:bladeTip,heel:bladeHeel},swordMesh,shieldMesh,contacts,support,trailPoints:[],current:null,elapsed:0,deathElapsed:0,lastState:null,baseY:-bounds.min.y};
}

function animationChoice(rig,state) {
  if(state.hp<=0)return'death';
  if(['light','heavy','roll','heal','stagger'].includes(state.action))return state.action;
  if(['windup','swing','recover'].includes(state.action))return 'heavy';
  if(state.blocking)return'block';
  if(state.moving>.1){
    if(state.moveX!==undefined){const forward=state.moveX*Math.sin(state.angle)+state.moveZ*Math.cos(state.angle),side=state.moveX*Math.cos(state.angle)-state.moveZ*Math.sin(state.angle);if(forward<-.4)return'backward';if(Math.abs(side)>.65)return side>0?'right':'left';}
    return state.moving>3?'run':'walk';
  }
  return'idle';
}
export function animateKnight(rig,state,dt,time) {
  rig.root.position.set(state.x,0,state.z);rig.root.rotation.y=state.angle;
  const name=animationChoice(rig,state),action=rig.actions[name];
  if(rig.current!==name || (rig.lastState!==state.action&&['light','heavy','roll','heal','stagger'].includes(name))){
    const previous=rig.current&&rig.actions[rig.current];action.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play();
    if(previous&&previous!==action)previous.crossFadeTo(action,name==='roll'?.07:.13,false);
    rig.current=name;rig.elapsed=0;if(name==='death')rig.deathElapsed=0;
  }
  rig.lastState=state.action;rig.elapsed+=dt;
  const duration=rig.asset.clips[name].duration;
  if(name==='death'){rig.deathElapsed+=dt;action.time=Math.min(duration-.001,rig.deathElapsed*1.15);}
  else if(state.action==='windup')action.time=Math.min(.45,state.timer/state.windup*.45);
  else if(state.action==='swing')action.time=Math.min(duration-.001,.45+state.timer*1.45);
  else if(state.action==='recover')action.time=Math.min(duration-.001,1.073+state.timer*.55);
  else if(name==='roll')action.time=.43+Math.min(1,state.timer/MOTION.roll.duration)*1.64;
  else if(['light','heavy'].includes(name))action.time=Math.min(duration-.001,state.timer/MOTION[name].duration*duration);
  else if(name==='heal')action.time=2.15+Math.min(1,state.timer/1.3)*2.35;
  else if(name==='stagger')action.time=Math.min(duration-.001,state.timer/.48*duration);
  else {const speed=name==='walk'?Math.max(.6,state.moving/1.8):name==='run'?Math.max(.8,state.moving/4.4):1;action.time=(rig.elapsed*speed)%duration;}
  // The combat clock selects the exact frame; the mixer only performs cross-fades.
  action.paused=true;rig.mixer.update(dt);
  rig.model.position.y=rig.baseY;
  rig.root.updateMatrixWorld(true);
  // Imported foot/toe contacts correct tiny rig-height differences while preserving mocap pelvis motion.
  if(name!=='death'){
    let floor=Infinity;const p=new THREE.Vector3();
    for(const s of rig.support){s.mesh.skeleton.update();for(const i of s.indices){p.fromBufferAttribute(s.mesh.geometry.attributes.position,i);s.mesh.applyBoneTransform(i,p);s.mesh.localToWorld(p);floor=Math.min(floor,p.y);}}
    if(name!=='roll'||floor<.006)rig.model.position.y+=(.006-floor)/rig.root.scale.x;
  }
  rig.tell.visible=state.action==='windup'&&state.hp>0;
  if(rig.tell.visible)rig.tell.material.opacity=.1+Math.min(1,state.timer/state.windup)*.3;
  rig.root.visible=state.hp>0||rig.player||rig.deathElapsed<3;
  rig.root.updateMatrixWorld(true);
}
