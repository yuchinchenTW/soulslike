import fs from 'node:fs';
import { FBXLoader } from '../node_modules/three/examples/jsm/loaders/FBXLoader.js';
for (const name of ['idle','light','heavy','roll','walk','run','heal']) {
 const data=fs.readFileSync(`assets/animations/${name}.fbx`);
 const scene=new FBXLoader().parse(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'');
 const bones=[];scene.traverse(b=>{if(b.isBone&&/Hips|RightArm|RightHand$|Spine$/.test(b.name))bones.push({name:b.name,p:b.position.toArray(),q:b.quaternion.toArray()})});
 console.log(name,scene.animations.map(a=>({name:a.name,duration:a.duration,tracks:a.tracks.length,first:a.tracks.slice(0,3).map(t=>({name:t.name,start:Array.from(t.values.slice(0,t.getValueSize())),end:Array.from(t.values.slice(-t.getValueSize()))}))})),bones);
}
