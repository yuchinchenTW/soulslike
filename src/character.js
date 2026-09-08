import * as THREE from 'three';
import { GLTFLoader } from '../node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from '../node_modules/three/examples/jsm/utils/SkeletonUtils.js';
import { MOTION, attackMotion } from './motion.js';
import { BOSS_MOVES, bossClipTime } from './pontiff.js';
import { addRegalia } from './regalia.js';

const cache = new Map();
const boneName = name => `mixamorig${name}`;
let props;
const skinMatrix=new THREE.Matrix4(),worldSkin=new THREE.Matrix4(),boneMatrix=new THREE.Matrix4();
// Cache bind-space samples once; per frame only the Y rows of bone matrices
// are needed to preserve the same contact accuracy as full CPU skinning.
function contactSamples(mesh,indices){
  const g=mesh.geometry,p=new THREE.Vector3(),samples=[];
  for(const i of indices){
    p.fromBufferAttribute(g.attributes.position,i).applyMatrix4(mesh.bindMatrix);
    const influences=[];
    for(let k=0;k<4;k++){const weight=g.attributes.skinWeight.getComponent(i,k);if(weight)influences.push([g.attributes.skinIndex.getComponent(i,k),p.x*weight,p.y*weight,p.z*weight,weight]);}
    samples.push(influences);
  }
  return {mesh,samples,rows:new Float64Array(mesh.skeleton.bones.length*4)};
}
function contactFloor(s){
  const {mesh,rows,samples}=s,skeleton=mesh.skeleton;
  worldSkin.multiplyMatrices(mesh.matrixWorld,mesh.bindMatrixInverse);
  for(let i=0;i<skeleton.bones.length;i++){
    boneMatrix.multiplyMatrices(skeleton.bones[i].matrixWorld,skeleton.boneInverses[i]);
    skinMatrix.multiplyMatrices(worldSkin,boneMatrix);const e=skinMatrix.elements,j=i*4;
    rows[j]=e[1];rows[j+1]=e[5];rows[j+2]=e[9];rows[j+3]=e[13];
  }
  let floor=Infinity;
  for(const influences of samples){let y=0;for(const [bone,x,py,z,w]of influences){const i=bone*4;y+=rows[i]*x+rows[i+1]*py+rows[i+2]*z+rows[i+3]*w;}floor=Math.min(floor,y);}
  return floor;
}
function extractProp(scene, name, jointName) {
  const source = scene.getObjectByName(name), bone = scene.getObjectByName(boneName(jointName));
  if (!source?.isSkinnedMesh || !bone) throw new Error(`Missing character equipment: ${name}`);
  scene.updateMatrixWorld(true); source.skeleton.update();
  const geometry = source.geometry.clone(), positions = geometry.attributes.position, p = new THREE.Vector3();
  for(let i=0;i<positions.count;i++) { p.fromBufferAttribute(source.geometry.attributes.position,i); source.applyBoneTransform(i,p); source.localToWorld(p); bone.worldToLocal(p); positions.setXYZ(i,p.x,p.y,p.z); }
  geometry.deleteAttribute('skinIndex');geometry.deleteAttribute('skinWeight');geometry.computeVertexNormals();geometry.computeBoundingBox();
  return {geometry,material:source.material,position:bone.position.clone(),quaternion:bone.quaternion.clone(),parent:bone.parent.name};
}
// Guarding while moving has no clip of its own: the shield pose is held on the
// upper body while each locomotion clip keeps driving the hips and legs.
const LOWER_BODY=/Hips|Leg|Foot|Toe/;
function guardClips(clips){
  if(!clips.block)return clips;
  const held=clips.block.tracks.filter(t=>!LOWER_BODY.test(t.name)).map(t=>{const v=t.createInterpolant().evaluate(.5);return new t.constructor(t.name,[0],Array.from(v));});
  for(const move of ['walk','backward','left','right']){
    const base=clips[move];if(!base)continue;
    clips['block_'+move]=new THREE.AnimationClip('block_'+move,base.duration,[...base.tracks.filter(t=>LOWER_BODY.test(t.name)).map(t=>t.clone()),...held.map(t=>t.clone())]);
  }
  return clips;
}
export async function loadCharacterAssets() {
  if(cache.size===2)return;
  const loader = new GLTFLoader();
  await Promise.all(['knight','warden'].map(async type=>{
    const [gltf,response]=await Promise.all([loader.loadAsync(new URL(`../assets/characters/${type}.glb`,import.meta.url).href),fetch(new URL(`../assets/characters/${type}-clips.json`,import.meta.url))]);
    if(!response.ok)throw new Error(`Could not load ${type} animation library`);
    const data=await response.json();
    gltf.scene.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false;const materials=Array.isArray(o.material)?o.material:[o.material];for(const mat of materials){mat.envMapIntensity=.55;mat.roughness=Math.max(.6,mat.roughness);if(mat.map)mat.map.anisotropy=4;}}});
    cache.set(type,{scene:gltf.scene,clips:guardClips(Object.fromEntries(Object.entries(data.clips).map(([n,c])=>[n,THREE.AnimationClip.parse(c)]))),metadata:data.metadata});
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
export function createKnight({boss=false,player=false,phantom=false}={}) {
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
  const blades=[{tip:bladeTip,heel:bladeHeel,hand:'right',color:boss?0xff7b28:0xdde5dd,trailPoints:[]}];
  if(boss){
    shieldMesh.visible=false;
    swordMesh.visible=false;
    const swordGeometry=props.sword.geometry.clone(),glow=[];
    const direction=bladeTip.position.clone().normalize(),length=bladeTip.position.length();
    for(let i=0;i<vertices.count;i++){p.fromBufferAttribute(vertices,i);glow.push(THREE.MathUtils.smoothstep(p.dot(direction)/length,.25,.4));}
    // Enlarge beyond the guard, preserving the grip's fit in the hand.
    const guard=length*.22,bladePositions=swordGeometry.attributes.position;
    function enlarge(point){
      const along=point.dot(direction),extension=Math.max(0,along-guard)*1.8;
      if(along>guard){point.addScaledVector(direction,-along).multiplyScalar(2.2).addScaledVector(direction,along+extension);}
      return point;
    }
    for(let i=0;i<bladePositions.count;i++){p.fromBufferAttribute(bladePositions,i);enlarge(p);bladePositions.setXYZ(i,p.x,p.y,p.z);}
    enlarge(bladeTip.position);swordGeometry.computeVertexNormals();swordGeometry.computeBoundingSphere();
    swordGeometry.setAttribute('bladeGlow',new THREE.Float32BufferAttribute(glow,1));
    function bladeMaterial(color){
      const m=new THREE.MeshStandardMaterial({color:0x8c8580,metalness:.75,roughness:.35,emissive:color,emissiveIntensity:1.8});
      m.onBeforeCompile=shader=>{
        shader.vertexShader='attribute float bladeGlow; varying float vBladeGlow;\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n vBladeGlow=bladeGlow;');
        shader.fragmentShader='varying float vBladeGlow;\n'+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\n totalEmissiveRadiance *= vBladeGlow;');
      };return m;
    }
    const flame=new THREE.Mesh(swordGeometry,bladeMaterial(0xff5112));swordJoint.add(flame);flame.castShadow=true;
    const left=new THREE.Group();
    left.position.copy(props.sword.position);left.position.x*=-1;
    const q=props.sword.quaternion;left.quaternion.set(q.x,-q.y,-q.z,q.w);
    model.getObjectByName(boneName('LeftHand')).add(left);
    const magic=new THREE.Mesh(swordGeometry,bladeMaterial(0x7040ff));left.add(magic);magic.castShadow=true;
    const tip=bladeTip.clone(),heel=bladeHeel.clone();left.add(tip,heel);
    blades.push({tip,heel,hand:'left',color:0x9774ff,trailPoints:[]});
  }
  if(boss)addRegalia(root,model,height,bounds.min.y);
  if(phantom)root.traverse(o=>{if(o.isMesh){o.material=o.material.clone();o.material.color.set(0x756bb1);o.material.emissive.set(0x514589);o.material.emissiveIntensity=.7;o.material.transparent=true;o.material.opacity=.38;o.material.depthWrite=false;o.material.forceSinglePass=true;o.castShadow=false;o.receiveShadow=false;}});
  const mixer=new THREE.AnimationMixer(model),actions={};
  for(const [name,clip]of Object.entries(asset.clips)){const a=mixer.clipAction(clip);a.clampWhenFinished=true;a.setLoop(['idle','walk','run','block','backward','left','right'].includes(name)||name.startsWith('block_')?THREE.LoopRepeat:THREE.LoopOnce,Infinity);actions[name]=a;}
  const tell=new THREE.Mesh(new THREE.TorusGeometry(boss?1.1:.9,.012,6,64),new THREE.MeshBasicMaterial({color:0xbc925e,transparent:true,opacity:0,depthWrite:false}));tell.rotation.x=Math.PI/2;tell.position.y=.026;root.add(tell);
  const contacts=['LeftFoot','RightFoot','LeftToeBase','RightToeBase','Head','LeftForeArm','RightForeArm','LeftLeg','RightLeg'].map(n=>({node:model.getObjectByName(boneName(n)),radius:n==='Head'?.11:.035}));
  const support=[];
  model.updateMatrixWorld(true);
  model.traverse(o=>{if(o.isSkinnedMesh&&o.geometry.attributes.position.count>1500){const indices=[],a=o.geometry.attributes.position;for(let i=0;i<a.count;i+=Math.max(1,Math.floor(a.count/350)))indices.push(i);support.push(contactSamples(o,indices));}});
  return {root,model,mixer,actions,asset,type,boss,player,phantom,tell,blade:blades[0],blades,swordMesh,shieldMesh,contacts,support,trailPoints:[],current:null,elapsed:0,deathElapsed:0,lastState:null,baseY:-bounds.min.y,stanceYaw:0,headYaw:0,neck:model.getObjectByName(boneName('Neck')),head:model.getObjectByName(boneName('Head'))};
}

// Mixamo's sword-and-shield stances stand turned away from the travel axis
// (measured at the hips). The root is counter-rotated so idle, guard and
// strafe clips face the way the character actually faces, e.g. a locked enemy.
// Attack, roll and boss clips keep their own orientation: their timing is tuned.
const STANCE_YAW={idle:55,block:67,stagger:61,left:70,right:65,block_left:70,block_right:65};
// In those stances the head looks past the shield toward where the body was
// turned; once the body faces forward the gaze is brought forward as well.
const HEAD_YAW={idle:43,block:63,left:62,right:58,block_walk:65,block_backward:64,block_left:65,block_right:64};
const _up=new THREE.Vector3(0,1,0),_qa=new THREE.Quaternion(),_qb=new THREE.Quaternion(),_qc=new THREE.Quaternion();
function yawBone(bone,yaw){
  const parent=bone.parent.getWorldQuaternion(_qa);
  bone.quaternion.premultiply(_qc.copy(parent).invert().multiply(_qb.setFromAxisAngle(_up,yaw)).multiply(parent));
  bone.updateWorldMatrix(false,false);
}
function locomotion(state){
  if(state.moveX!==undefined){const forward=state.moveX*Math.sin(state.angle)+state.moveZ*Math.cos(state.angle),side=state.moveX*Math.cos(state.angle)-state.moveZ*Math.sin(state.angle);if(forward<-.4)return'backward';if(Math.abs(side)>.65)return side>0?'right':'left';}
  return state.moving>3&&!state.blocking?'run':'walk';
}
function animationChoice(rig,state) {
  if(state.hp<=0)return'death';
  if(state.action==='light')return state.attackClip||'light';
  if(state.action==='bossAttack'||(rig.boss&&state.action==='recover'&&state.move))return BOSS_MOVES[state.move].clip;
  if(rig.boss&&['summon','echoWait','idle','recover'].includes(state.action)&&!state.moving)return'dual';
  if(['light','heavy','roll','heal','stagger'].includes(state.action))return state.action;
  if(['windup','swing','recover'].includes(state.action))return 'heavy';
  if(state.blocking)return state.moving>.1?'block_'+locomotion(state):'block';
  if(state.moving>.1)return locomotion(state);
  return'idle';
}
export function animateKnight(rig,state,dt,time) {
  if(state.hp<=0&&rig.current==='death'&&rig.deathElapsed>=(rig.phantom?.55:3)&&!rig.player){rig.root.visible=false;return;}
  rig.root.position.set(state.x,0,state.z);
  const name=animationChoice(rig,state),action=rig.actions[name];
  const stance=rig.boss?0:(STANCE_YAW[name]||0)*Math.PI/180;
  rig.stanceYaw+=(stance-rig.stanceYaw)*Math.min(1,dt*12);
  const gaze=rig.boss?0:(HEAD_YAW[name]||0)*Math.PI/180;
  rig.headYaw+=(gaze-rig.headYaw)*Math.min(1,dt*12);
  rig.root.rotation.y=state.angle+rig.stanceYaw;
  if(rig.current!==name || rig.lastSerial!==state.actionSerial || (rig.lastState!==state.action&&['light','light2','light3','heavy','roll','heal','stagger'].includes(name))){
    const previous=rig.current&&rig.actions[rig.current];action.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play();
    if(previous&&previous!==action)previous.crossFadeTo(action,name==='roll'?.07:.13,false);
    rig.current=name;rig.elapsed=0;if(name==='death')rig.deathElapsed=0;
  }
  rig.lastState=state.action;rig.lastSerial=state.actionSerial;rig.elapsed+=dt;
  const duration=rig.asset.clips[name].duration;
  if(name==='death'){rig.deathElapsed+=dt;action.time=Math.min(duration-.001,rig.deathElapsed*1.15);}
  else if(state.action==='bossAttack')action.time=bossClipTime(state);
  else if(rig.boss&&state.action==='recover'&&state.move)action.time=duration-.001;
  else if(rig.boss&&name==='dual')action.time=state.action==='summon'?.35:0;
  else if(state.action==='windup')action.time=Math.min(.45,state.timer/state.windup*.45);
  else if(state.action==='swing')action.time=Math.min(duration-.001,.45+state.timer*1.45);
  else if(state.action==='recover')action.time=Math.min(duration-.001,1.073+state.timer*.55);
  else if(name==='roll')action.time=.43+Math.min(1,state.timer/MOTION.roll.duration)*1.64;
  else if(['light','light2','light3','heavy'].includes(name))action.time=Math.min(duration-.001,state.timer/attackMotion(state).duration*duration);
  else if(name==='heal')action.time=2.15+Math.min(1,state.timer/1.3)*2.35;
  else if(name==='stagger')action.time=Math.min(duration-.001,state.timer/.48*duration);
  else {const gait=name.replace('block_','');const speed=gait==='walk'?Math.max(.6,state.moving/1.8):gait==='run'?Math.max(.8,state.moving/4.4):name.startsWith('block_')?.8:1;action.time=(rig.elapsed*speed)%duration;}
  // The combat clock selects the exact frame; the mixer only performs cross-fades.
  action.paused=true;rig.mixer.update(dt);
  rig.model.position.y=rig.baseY;
  rig.root.updateMatrixWorld(true);
  if(Math.abs(rig.headYaw)>.001&&rig.neck&&rig.head){yawBone(rig.neck,-rig.headYaw*.45);yawBone(rig.head,-rig.headYaw*.55);rig.root.updateMatrixWorld(true);}
  // Imported foot/toe contacts correct tiny rig-height differences while preserving mocap pelvis motion.
  if(name!=='death'){
    let floor=Infinity;
    for(const s of rig.support)floor=Math.min(floor,contactFloor(s));
    if(name!=='roll'||floor<.006)rig.model.position.y+=(.006-floor)/rig.root.scale.x;
  }
  const windup=state.action==='bossAttack'&&state.timer<BOSS_MOVES[state.move].hits[0].at;
  rig.tell.visible=(state.action==='windup'||windup||state.action==='summon')&&state.hp>0;
  if(rig.tell.visible){rig.tell.material.color.set(state.action==='summon'?0x9974ee:0xbc925e);rig.tell.scale.setScalar(state.action==='summon'?3.6/(1.1*rig.root.scale.x):1);rig.tell.material.opacity=.12+Math.min(1,state.timer/(state.windup||1.2))*.3;}
  rig.root.visible=state.hp>0||rig.player||rig.deathElapsed<(rig.phantom?.55:3);
  rig.root.updateMatrixWorld(true);
}
