import * as THREE from 'three';
import { clone } from '../node_modules/three/examples/jsm/utils/SkeletonUtils.js';
import { MOTION, smooth, parriedDuration } from './motion.js';

const up=new THREE.Vector3(0,1,0),right=new THREE.Vector3(1,0,0);
const bone=(root,name)=>root.getObjectByName('mixamorig'+name);
const pulse=(t,start,peak,end)=>smooth((t-start)/(peak-start))*(1-smooth((t-peak)/(end-peak)));

// Shoulder leads the elbow and wrist; the return takes longer than the sweep.
// The wider 1.8x sweep is distributed across the body instead of one shoulder.
export function parryPose(t){
  const lead=pulse(t,0,.25,.78),arm=pulse(t,.025,.33,.82),hand=pulse(t,.055,.36,.86);
  const load=pulse(t,0,.075,.18),scale=MOTION.parry.sweepScale;
  return {hip:.085*lead,spine:.19*lead-.05*load,chest:.13*lead,
    arm:(.58*arm-.07*load)*scale,elbow:.24*hand*scale,wrist:.075*hand*scale,
    lead,hand,load};
}

function rotateWorld(node,axis,angle){
  const parent=node.parent.getWorldQuaternion(new THREE.Quaternion());
  const turn=parent.clone().invert().multiply(new THREE.Quaternion().setFromAxisAngle(axis,angle)).multiply(parent);
  node.quaternion.premultiply(turn).normalize();node.updateWorldMatrix(false,true);
}
function turnToward(node,from,to){
  const parent=node.parent.getWorldQuaternion(new THREE.Quaternion());
  const turn=new THREE.Quaternion().setFromUnitVectors(from.normalize(),to.normalize());
  node.quaternion.premultiply(parent.clone().invert().multiply(turn).multiply(parent)).normalize();node.updateWorldMatrix(false,true);
}
function shiftWorld(node,offset){
  const p=node.getWorldPosition(new THREE.Vector3()).add(offset);node.position.copy(node.parent.worldToLocal(p));node.updateWorldMatrix(false,true);
}
// Two-bone leg IK plants the feet while the pelvis shifts over the stance.
function plantLeg(hip,knee,foot,target,orientation){
  const a=hip.getWorldPosition(new THREE.Vector3()),b=knee.getWorldPosition(new THREE.Vector3()),c=foot.getWorldPosition(new THREE.Vector3());
  const upper=a.distanceTo(b),lower=b.distanceTo(c),direction=target.clone().sub(a),distance=THREE.MathUtils.clamp(direction.length(),Math.abs(upper-lower)+.00001,upper+lower-.00001);
  direction.normalize();
  const bend=b.clone().sub(a);bend.addScaledVector(direction,-bend.dot(direction));
  if(bend.lengthSq()<1e-10)bend.copy(right).addScaledVector(direction,-right.dot(direction));
  bend.normalize();
  const along=(upper*upper-lower*lower+distance*distance)/(2*distance);
  const desired=a.clone().addScaledVector(direction,along).addScaledVector(bend,Math.sqrt(Math.max(0,upper*upper-along*along)));
  turnToward(hip,b.sub(a),desired.sub(a));
  const joint=knee.getWorldPosition(new THREE.Vector3());
  turnToward(knee,foot.getWorldPosition(new THREE.Vector3()).sub(joint),target.clone().sub(joint));
  foot.quaternion.copy(foot.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(orientation));foot.updateWorldMatrix(false,true);
}

// Bake at loading time. Restore the source pose on every sample, since the
// mixer can skip unchanged tracks; no procedural offsets accumulate at runtime.
function bake(scene,source,name,duration,sample,poseFrame){
  const root=clone(scene),mixer=new THREE.AnimationMixer(root),action=mixer.clipAction(source);
  action.play();action.paused=true;
  const bindings=source.tracks.map(track=>{const [node,property]=track.name.split('.');return {track,node:root.getObjectByName(node),property,base:null,values:[]};});
  const times=[],frames=Math.ceil(duration*60);
  for(let i=0;i<=frames;i++){
    const t=Math.min(duration,i/60);
    for(const b of bindings)if(b.base)b.node[b.property].copy(b.base);
    action.time=sample(t);mixer.update(0);
    for(const b of bindings)b.base=b.node[b.property].clone();
    root.updateMatrixWorld(true);poseFrame(root,t);
    times.push(t);for(const b of bindings)b.node[b.property].toArray(b.values,b.values.length);
  }
  mixer.stopAllAction();mixer.uncacheRoot(root);
  return new THREE.AnimationClip(name,duration,bindings.map(b=>new b.track.constructor(b.track.name,times,b.values)));
}

export function buildShieldClips(scene,clips,guardBlade){
  clips.parry=bake(scene,clips.block,'parry',MOTION.parry.duration,()=>.5,(root,t)=>{
    const p=parryPose(t),hips=bone(root,'Hips'),spine=bone(root,'Spine');
    const legs=['Left','Right'].map(side=>{const foot=bone(root,side+'Foot');return {hip:bone(root,side+'UpLeg'),knee:bone(root,side+'Leg'),foot,target:foot.getWorldPosition(new THREE.Vector3()),orientation:foot.getWorldQuaternion(new THREE.Quaternion())};});
    const height=hips.getWorldPosition(new THREE.Vector3()).y-legs[0].target.y;
    const l=bone(root,'LeftShoulder').getWorldPosition(new THREE.Vector3()),r=bone(root,'RightShoulder').getWorldPosition(new THREE.Vector3());
    rotateWorld(spine,up,-guardBlade-Math.atan2(r.z-l.z,l.x-r.x));
    shiftWorld(hips,new THREE.Vector3(.065*p.lead,-.04*p.lead-.015*p.load,.035*p.lead).multiplyScalar(height));
    rotateWorld(hips,up,p.hip);rotateWorld(spine,up,p.spine);rotateWorld(bone(root,'Spine1'),up,p.chest);
    rotateWorld(spine,right,.055*p.lead);
    rotateWorld(bone(root,'LeftArm'),up,p.arm);rotateWorld(bone(root,'LeftArm'),right,-.14*p.lead);
    rotateWorld(bone(root,'LeftForeArm'),up,p.elbow);rotateWorld(bone(root,'LeftForeArm'),right,.12*p.hand);
    rotateWorld(bone(root,'LeftHand'),up,p.wrist);
    // Sword arm counterbalances; the head keeps watching the opponent.
    rotateWorld(bone(root,'RightArm'),up,-.12*p.lead);rotateWorld(bone(root,'Neck'),up,-.18*p.lead);
    for(const leg of legs)plantLeg(leg.hip,leg.knee,leg.foot,leg.target,leg.orientation);
  });
  for(const boss of [false,true]){
    const duration=parriedDuration({boss}),name=boss?'parried_boss':'parried';
    // Preserve the captured leg steps throughout the stun, slowing the middle
    // rather than freezing it. Finish the captured recovery before AI resumes.
    const keys=[[0,0],[.18,.18],[.48,.38],[duration-.28,.76],[duration,1]];
    clips[name]=bake(scene,clips.stagger,name,duration,t=>{
      let i=0;while(i<keys.length-2&&t>keys[i+1][0])i++;
      const [a,x]=keys[i],[b,y]=keys[i+1];return Math.min(clips.stagger.duration-.001,clips.stagger.duration*(x+(y-x)*smooth((t-a)/(b-a))));
    },(root,t)=>{
      const strike=pulse(t,0,.13,.52),settle=pulse(t,.09,.4,duration),lag=pulse(t,.06,.23,.7);
      const sway=Math.sin(t*9)*Math.exp(-t*2)*settle,hips=bone(root,'Hips');
      const height=hips.getWorldPosition(new THREE.Vector3()).y-bone(root,'LeftFoot').getWorldPosition(new THREE.Vector3()).y;
      shiftWorld(hips,new THREE.Vector3(.035*sway,-.025*settle,0).multiplyScalar(height));
      rotateWorld(bone(root,'Spine'),right,-.12*strike+.2*settle);
      rotateWorld(bone(root,'Spine1'),up,.1*strike+.08*sway);
      rotateWorld(bone(root,'Neck'),right,.12*lag);
      for(const [side,sign]of [['Left',1],['Right',-1]]){
        rotateWorld(bone(root,side+'Arm'),up,sign*(.45*strike+.2*settle));
        rotateWorld(bone(root,side+'Arm'),right,.35*settle+.15*lag);
        rotateWorld(bone(root,side+'ForeArm'),right,.12*lag);
      }
    });
  }
}
