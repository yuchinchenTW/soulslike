// Gameplay windows calibrated against the imported sword-and-shield clips.
export const MOTION = Object.freeze({
  light: { duration: .76, impact: .38, activeEnd: .44, distance: .48 },
  heavy: { duration: 1.16, impact: .50, activeEnd: .57, distance: .75 },
  roll: { duration: .88, invulnerableStart: .085, invulnerableEnd: .48, distance: 3.9 }
});
const clamp01 = t => Math.max(0, Math.min(1, t));
export const smooth = t => { t = clamp01(t); return t * t * (3 - 2 * t); };
// Forward displacement measured from the trimmed roll's pelvis track.
const rollCurve = [[0,0],[.043,.030],[.146,.167],[.244,.348],[.348,.536],[.451,.700],[.550,.792],[.652,.871],[.756,.950],[.854,.989],[.96,1],[1,1]];
export function travel(action,time) {
  const motion=MOTION[action];if(!motion)return 0;
  if(action==='roll'){
    const t=clamp01(time/motion.duration);let i=0;
    while(i<rollCurve.length-2&&t>rollCurve[i+1][0])i++;
    const a=rollCurve[i],b=rollCurve[i+1],weight=(t-a[0])/(b[0]-a[0]);
    return motion.distance*(a[1]+(b[1]-a[1])*weight);
  }
  return motion.distance*smooth((time-motion.impact+.14)/.27);
}
