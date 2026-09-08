import fs from 'node:fs';
import * as THREE from 'three';
import { FBXLoader } from '../node_modules/three/examples/jsm/loaders/FBXLoader.js';

const short = name => name.replace(/^mixamorig:?/, '');
function readRig(file) {
  const data = fs.readFileSync(file), json = JSON.parse(data.subarray(20, 20 + data.readUInt32LE(12)).toString());
  const objects = json.nodes.map(n => { const o = new THREE.Bone(); o.name = THREE.PropertyBinding.sanitizeNodeName(n.name || ''); if (n.translation) o.position.fromArray(n.translation); if (n.rotation) o.quaternion.fromArray(n.rotation); if (n.scale) o.scale.fromArray(n.scale); if (n.matrix) new THREE.Matrix4().fromArray(n.matrix).decompose(o.position,o.quaternion,o.scale); return o; });
  json.nodes.forEach((n,i) => n.children?.forEach(c => objects[i].add(objects[c])));
  const root = new THREE.Group(); for (const i of json.scenes[json.scene || 0].nodes) root.add(objects[i]); root.updateMatrixWorld(true);
  return root;
}
const sources = Object.fromEntries(['idle','walk','run','light','heavy','roll','block','stagger','death','heal','backward','right','left'].map(name => {
  const b=fs.readFileSync(`assets/animations/${name}.fbx`); return [name,new FBXLoader().parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'')];
}));
for (const type of ['knight','warden']) {
  const target = readRig(`assets/characters/${type}.glb`), targetBones = new Map();
  target.traverse(b => { if (b.name.startsWith('mixamorig')) targetBones.set(short(b.name), b); });
  const targetRest = new Map([...targetBones].map(([name,b])=>[name,b.getWorldQuaternion(new THREE.Quaternion())]));
  const hip = targetBones.get('Hips'), targetHipHeight = hip.getWorldPosition(new THREE.Vector3()).y;
  const clips = {}, metadata = {};
  for (const [name,source] of Object.entries(sources)) {
    source.updateMatrixWorld(true); const sourceBones = new Map();
    source.traverse(b => { if(b.isBone) sourceBones.set(short(b.name),b); });
    const sourceRest = new Map([...sourceBones].map(([n,b])=>[n,b.getWorldQuaternion(new THREE.Quaternion()).invert()]));
    const sourceHip=sourceBones.get('Hips'), ratio=targetHipHeight/sourceHip.getWorldPosition(new THREE.Vector3()).y;
    const sourceLocalRest = new Map([...sourceBones].map(([n,b])=>[n,{position:b.position.clone(),quaternion:b.quaternion.clone()}]));
    const original = source.animations[0], mixer = new THREE.AnimationMixer(source), action = mixer.clipAction(original); action.setLoop(THREE.LoopOnce,1); action.clampWhenFinished=true; action.play();
    const q = new THREE.Quaternion(), parentQ = new THREE.Quaternion(), position = new THREE.Vector3();
    const times=[], rotations=new Map([...targetBones].filter(([n])=>sourceBones.has(n)).map(([n])=>[n,[]])), hips=[], trajectory=[];
    const frames=Math.ceil(original.duration*30);
    for(let frame=0;frame<=frames;frame++) {
      const t=Math.min(original.duration,frame/30); times.push(t); mixer.setTime(t); source.updateMatrixWorld(true);
      const desired = new Map();
      for(const [n,b] of targetBones) if(sourceBones.has(n)) desired.set(n,sourceBones.get(n).getWorldQuaternion(new THREE.Quaternion()).multiply(sourceRest.get(n)).multiply(targetRest.get(n)));
      for(const [n,values] of rotations) {
        const b=targetBones.get(n), p=desired.get(short(b.parent.name));
        if(p) parentQ.copy(p); else b.parent.getWorldQuaternion(parentQ);
        q.copy(parentQ).invert().multiply(desired.get(n)).normalize(); values.push(...q.toArray());
      }
      sourceHip.getWorldPosition(position); trajectory.push([t,position.x*ratio,position.y*ratio,position.z*ratio]);
      position.set(0,position.y*ratio,0); hip.parent.worldToLocal(position); hips.push(...position.toArray());
    }
    const tracks=[...rotations].map(([n,v])=>new THREE.QuaternionKeyframeTrack(`${targetBones.get(n).name}.quaternion`,times,v));
    tracks.push(new THREE.VectorKeyframeTrack(`${hip.name}.position`,times,hips));
    const clip=new THREE.AnimationClip(name,original.duration,tracks); clips[name]=THREE.AnimationClip.toJSON(clip);
    metadata[name]={duration:original.duration,hipTrajectory:trajectory};
    mixer.stopAllAction();mixer.uncacheRoot(source);
    // Each next target must see the original bind pose, not the last animated pose.
    for(const [n,b] of sourceBones){b.position.copy(sourceLocalRest.get(n).position);b.quaternion.copy(sourceLocalRest.get(n).quaternion);}
  }
  fs.writeFileSync(`assets/characters/${type}-clips.json`,JSON.stringify({clips,metadata}));
  console.log(type, 'clips:',Object.keys(clips).length,'bytes:',fs.statSync(`assets/characters/${type}-clips.json`).size);
}
