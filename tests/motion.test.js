import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { MOTION, travel } from '../src/motion.js';
import { Game } from '../src/game.js';
test('both character rigs have usable imported clips and normalized quaternion tracks',()=>{
  for(const type of ['knight','warden']){
    const data=JSON.parse(fs.readFileSync(`assets/characters/${type}-clips.json`));
    for(const name of ['idle','walk','run','light','light2','light3','dual','heavy','roll','block','death','backward','left','right']){
      const clip=data.clips[name];assert.ok(clip.duration>.1);assert.ok(clip.tracks.length>=50);
      for(const track of clip.tracks){assert.ok(track.times.length>2);if(track.type==='quaternion')for(let i=0;i<track.values.length;i+=4)assert.ok(Math.abs(Math.hypot(...track.values.slice(i,i+4))-1)<.00001);}
    }
    assert.ok(Math.min(...data.metadata.roll.hipTrajectory.map(p=>p[2]))<.35,'roll must actually lower the pelvis');
  }
});
test('root travel follows the animation and is independent of frame rate',()=>{
  const run=dt=>{const g=new Game();g.start();g.trigger('roll',{x:0,z:-1});const z=g.player.z;for(let t=0;t<1;t+=dt)g.update(dt);return z-g.player.z;};
  assert.ok(Math.abs(run(1/30)-MOTION.roll.distance)<1e-8);assert.ok(Math.abs(run(1/120)-MOTION.roll.distance)<1e-8);
  assert.equal(travel('roll',0),0);assert.equal(travel('roll',MOTION.roll.duration),MOTION.roll.distance);
  assert.ok(travel('roll',.07)<travel('roll',.25)-travel('roll',.18));
});
test('damage waits for the actual sword crossing, then happens only once',()=>{
  const g=new Game();g.start();g.player.x=0;g.player.z=0;g.player.angle=0;g.enemies[0].x=0;g.enemies[0].z=2;
  g.trigger('light');for(let t=0;t<.30;t+=.01)g.update(.01);
  assert.equal(g.enemies[0].hp,90);
  for(let i=0;i<20;i++)g.update(.01);
  assert.equal(g.enemies[0].hp,60);assert.equal(g.events.filter(e=>e.type==='swing').length,1);
});
test('an attack buffered at the end of recovery starts after recovery finishes',()=>{
  const g=new Game();g.start();g.trigger('light');
  for(let t=0;t<.65;t+=.01)g.update(.01);
  g.trigger('heavy');assert.equal(g.player.action,'light');
  for(let i=0;i<13;i++)g.update(.01);
  assert.equal(g.player.action,'heavy');assert.ok(g.player.stamina<50);
});
