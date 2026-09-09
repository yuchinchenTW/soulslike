// Gameplay windows calibrated against the imported sword-and-shield clips.
export const MOTION = Object.freeze({
  light: { duration: .76, impact: .38, activeEnd: .44, distance: .48, damage: 30, stamina: 23 },
  light2: { duration: .72, impact: .315, activeEnd: .37, distance: .42, damage: 30, stamina: 22 },
  light3: { duration: .94, impact: .54, activeEnd: .60, distance: .68, damage: 42, stamina: 28 },
  heavy: { duration: 1.16, impact: .50, activeEnd: .57, distance: .75 },
  roll: { duration: .88, invulnerableStart: .085, invulnerableEnd: .48, distance: 3.9 },
  // A tap of the guard button sweeps the shield: attacks that land inside the
  // window are deflected and leave the attacker open to a riposte.
  parry: { duration: .9, windowStart: .1, windowEnd: .36, stamina: 12, sweepScale: 1.8 },
  riposte: { duration: 1.25, impact: .52, damage: 95, bossDamage: 130, distance: .3 }
});
export const LIGHT_COMBO = ['light', 'light2', 'light3'];
export const parriedDuration = actor => actor.boss || actor.phantom ? 1.4 : 2.2;
export const parriedTravel = (actor,time) => (actor.boss || actor.phantom ? .22 : .32) * smooth((time-.08)/.42);
export const attackMotion = state => MOTION[state.action === 'light' ? (state.attackClip || 'light') : state.action];
const clamp01 = t => Math.max(0, Math.min(1, t));
export const smooth = t => { t = clamp01(t); return t * t * (3 - 2 * t); };
// Forward displacement measured from the trimmed roll's pelvis track.
const rollCurve = [[0,0],[.043,.030],[.146,.167],[.244,.348],[.348,.536],[.451,.700],[.550,.792],[.652,.871],[.756,.950],[.854,.989],[.96,1],[1,1]];
export function travel(action,time,motion=MOTION[action]) {
  if(!motion)return 0;
  if(action==='roll'){
    const t=clamp01(time/motion.duration);let i=0;
    while(i<rollCurve.length-2&&t>rollCurve[i+1][0])i++;
    const a=rollCurve[i],b=rollCurve[i+1],weight=(t-a[0])/(b[0]-a[0]);
    return motion.distance*(a[1]+(b[1]-a[1])*weight);
  }
  return motion.distance*smooth((time-motion.impact+.14)/.27);
}
