import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { MOTION } from '../src/motion.js';
import { BOSS_MOVES } from '../src/pontiff.js';
const tick=(g,n)=>{for(let t=0;t<n-1e-8;t+=.01)g.update(.01);};
function arena(){const g=new Game();g.start();g.enemies[0].hp=g.enemies[1].hp=0;g.player.x=0;g.player.z=0;g.player.invuln=100;return g;}
function phaseTwo(){const g=arena();g.enemies[2].hp=300;tick(g,2.2);return g;}
test('three buffered light attacks use distinct clips, costs and a fresh animation serial',()=>{
  const g=arena();g.player.z=13;const clips=[],serials=[];
  g.trigger('light');
  for(let i=0;i<3;i++){
    const p=g.player;clips.push(p.attackClip);serials.push(p.actionSerial);
    tick(g,p.duration-.3);g.trigger('light');assert.equal(p.attackClip,clips[i]);tick(g,.31);
  }
  assert.deepEqual(clips,['light','light2','light3']);assert.equal(new Set(serials).size,3);
  // Four swings cost 23 + 22 + 28 + 23, without passive regeneration in recovery.
  assert.equal(g.player.stamina,4);assert.equal(g.player.attackClip,'light');
});
test('pausing a combo or rolling resets it, and insufficient stamina cannot advance it',()=>{
  const g=arena();g.player.z=13;g.trigger('light');tick(g,1.5);g.trigger('light');assert.equal(g.player.attackClip,'light');
  tick(g,.77);g.trigger('roll');tick(g,.89);g.player.stamina=100;g.trigger('light');assert.equal(g.player.attackClip,'light');
  tick(g,.77);g.player.stamina=1;const serial=g.player.actionSerial;g.trigger('light');assert.equal(g.player.action,'idle');assert.equal(g.player.actionSerial,serial);
});
test('every combo clip damages once at its own contact time',()=>{
  for(const clip of ['light','light2','light3']){
    const g=arena(),p=g.player,e=g.enemies[0],m=MOTION[clip];
    Object.assign(e,{x:0,z:1.6,hp:200,maxHp:200,action:'stagger',timer:-10});
    p.angle=0;p.attackClip=clip;g.setAction('light',m.duration);
    tick(g,m.impact-.02);assert.equal(e.hp,200);tick(g,.05);assert.equal(e.hp,200-m.damage);tick(g,.25);assert.equal(e.hp,200-m.damage);
  }
});
test('echo leads and the boss follows the same move after half a second',()=>{
  const g=phaseTwo(),boss=g.enemies[2],echo=g.enemies.find(e=>e.phantom);
  Object.assign(boss,{x:0,z:-3,action:'idle',cooldown:0,timer:0});Object.assign(echo,{action:'idle',timer:0});
  g.update(.01);assert.equal(echo.action,'bossAttack');assert.equal(boss.action,'echoWait');const move=echo.move;
  tick(g,.5);assert.equal(boss.action,'echoWait');tick(g,.06);assert.equal(boss.action,'bossAttack');assert.equal(boss.move,move);assert.ok(echo.timer-boss.timer>=.5);
});
test('killing an echo gives no boss reward and death/rest/real boss defeat remove it',()=>{
  const g=phaseTwo(),p=g.player,boss=g.enemies[2],echo=g.enemies.find(e=>e.phantom);
  Object.assign(p,{x:0,z:0,angle:0,attackClip:'light'});Object.assign(echo,{x:0,z:1.6,hp:30});g.locked=echo.id;
  g.playerStrike(false);assert.equal(echo.hp,0);assert.equal(g.won,false);assert.equal(g.souls,0);assert.equal(g.locked,null);
  echo.hp=100;p.invuln=0;g.hurt(200,boss);assert.equal(echo.hp,0);g.respawn();assert.equal(g.enemies.some(e=>e.phantom),false);
  const h=phaseTwo(),b=h.enemies[2],copy=h.enemies.find(e=>e.phantom);Object.assign(h.player,{x:0,z:-11,angle:Math.PI,attackClip:'light'});b.hp=30;
  h.playerStrike(false);assert.equal(h.won,true);assert.equal(copy.hp,0);assert.equal(h.souls,1000);
});
test('boss selects a lunge at distance and recovery has no extra damage',()=>{
  const g=arena(),b=g.enemies[2];Object.assign(b,{x:0,z:-6,cooldown:0});g.update(.01);assert.equal(b.move,'lunge');
  tick(g,BOSS_MOVES.lunge.duration+.01);assert.equal(b.action,'recover');const hits=g.events.filter(e=>e.type==='enemySlash').length;
  tick(g,.8);assert.equal(g.events.filter(e=>e.type==='enemySlash').length,hits);assert.equal(hits,1);
});
test('boss committed swings cannot turn around to hit a player behind it',()=>{
  const g=arena(),b=g.enemies[2];Object.assign(b,{x:0,z:-3,cooldown:0});g.update(.01);
  const h=BOSS_MOVES[b.move].hits[0];tick(g,h.at-.15);g.player.x=b.x;g.player.z=b.z-1.8;g.player.invuln=0;
  const angle=b.angle;tick(g,.16);assert.equal(g.player.hp,100);assert.equal(b.angle,angle);
});
