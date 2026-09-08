// Measure real presentation intervals, never the clamped combat timestep.
export class FrameMeter {
  constructor(){this.reset();}
  reset(){this.last=null;this.elapsed=0;this.frames=0;}
  tick(now){
    if(this.last===null){this.last=now;return null;}
    const dt=now-this.last;this.last=now;
    if(dt<=0)return null;
    this.elapsed+=dt;this.frames++;
    if(this.elapsed<500)return null;
    const result={fps:1000*this.frames/this.elapsed,ms:this.elapsed/this.frames,seconds:this.elapsed/1000};
    this.elapsed=0;this.frames=0;return result;
  }
}
export class AdaptiveResolution {
  constructor(){this.scale=.85;this.slow=0;this.fast=0;}
  sample({fps,seconds}){
    this.slow=fps<50?this.slow+seconds:0;
    this.fast=fps>58?this.fast+seconds:0;
    const before=this.scale;
    if(this.slow>=1.5){this.scale=Math.max(.55,this.scale-.1);this.slow=0;this.fast=0;}
    else if(this.fast>=8){this.scale=Math.min(1,this.scale+.05);this.fast=0;}
    return Math.abs(this.scale-before)>.001;
  }
}
