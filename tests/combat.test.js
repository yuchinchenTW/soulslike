import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, CAMP, PILLARS, distance, angleTo, angleDelta } from '../src/game.js';
import { MOTION, parriedDuration } from '../src/motion.js';

function play() { const g = new Game(); g.start(); return g; }
function tick(g, seconds, input = {}) { for (let t = 0; t < seconds; t += .01) g.update(.01, input); }

test('attacks consume stamina and damage only enemies within the forward arc', () => {
  const g = play(), p = g.player;
  p.x = 0; p.z = 0; p.angle = 0;
  Object.assign(g.enemies[0], { x: 0, z: 2 });
  Object.assign(g.enemies[1], { x: 0, z: -2 });
  g.trigger('light'); assert.equal(p.stamina, 77); tick(g, MOTION.light.impact + .01);
  assert.equal(g.enemies[0].hp, 60); assert.equal(g.enemies[1].hp, 90);
  g.trigger('heavy'); assert.equal(p.stamina, 77, 'cannot cancel recovery into another attack');
});

test('roll invulnerability excludes startup and recovery', () => {
  const g = play(), p = g.player, enemy = { x: p.x, z: p.z - 1 };
  g.trigger('roll'); p.timer = .2;
  assert.equal(g.hurt(30, enemy), false); assert.equal(p.hp, 100);
  p.timer = .5; assert.equal(g.hurt(30, enemy), true); assert.equal(p.hp, 70);
  const startup = play(); startup.trigger('roll'); startup.player.timer = .02;
  assert.equal(startup.hurt(20, enemy), true);
});

test('shield blocks in front, rear attacks bypass it, low stamina causes guard break', () => {
  const g = play(), p = g.player; p.angle = 0; p.blocking = true;
  g.hurt(20, { x: p.x, z: p.z + 1 }); assert.equal(p.hp, 98); assert.equal(p.stamina, 73);
  g.hurt(20, { x: p.x, z: p.z - 1 }); assert.equal(p.hp, 78);
  p.invuln = 0; p.blocking = true; p.stamina = 2;
  g.hurt(20, { x: p.x, z: p.z + 1 }); assert.equal(p.hp, 58); assert.equal(p.stamina, 0); assert.equal(p.action, 'stagger');
});

test('unlocked guard preserves facing during forward, side and backward steps', () => {
  const g=play(),p=g.player;p.angle=.7;
  for(const [x,z]of [[1,0],[-1,0],[0,1],[0,-1]]){
    tick(g,.2,{x,z,block:true,sprint:true});assert.equal(p.angle,.7);assert.equal(p.moving,2);
  }
  tick(g,.2,{x:1,z:0});assert.ok(Math.abs(p.angle-.7)>.1,'releasing guard restores normal movement-facing');
});

test('locked guard faces the enemy after strafing and after switching targets', () => {
  const g=play(),p=g.player;Object.assign(p,{x:0,z:0,angle:0});
  Object.assign(g.enemies[0],{x:0,z:-4,action:'stagger',timer:-100});
  Object.assign(g.enemies[1],{x:4,z:0,action:'stagger',timer:-100});
  g.locked=g.enemies[0].id;
  for(const [x,z]of [[1,0],[-1,0],[0,1]]){
    tick(g,.2,{x,z,block:true});assert.ok(Math.abs(angleDelta(p.angle,angleTo(p,g.target)))<1e-8);
  }
  g.cycleTarget(1);g.update(.01,{x:-1,z:0,block:true});assert.ok(Math.abs(angleDelta(p.angle,angleTo(p,g.target)))<1e-8);
  const hp=p.hp;g.hurt(20,g.target);assert.equal(p.hp,hp-2,'the shield still blocks the enemy being faced');
});

test('healing has a delay and interrupted healing does not consume a flask', () => {
  const g = play(); g.player.hp = 20; g.trigger('heal'); tick(g, .5);
  assert.equal(g.player.hp, 20); assert.equal(g.player.flasks, 3);
  g.hurt(5, { x: 0, z: 13 }); tick(g, .8);
  assert.equal(g.player.flasks, 3); assert.equal(g.player.hp, 15);
  g.trigger('heal'); tick(g, 1.35); assert.equal(g.player.hp, 80); assert.equal(g.player.flasks, 2);
});

test('death drops currency, respawn restores supplies, and currency can be retrieved', () => {
  const g = play(); g.souls = 200; g.player.x = 3; g.player.z = 10; g.player.flasks = 0;
  g.hurt(120, { x: 3, z: 11 }); assert.equal(g.state, 'dead'); assert.equal(g.souls, 0); assert.equal(g.drop.amount, 200);
  g.respawn(); assert.equal(g.state, 'playing'); assert.equal(g.player.hp, 100); assert.equal(g.player.flasks, 3);
  g.player.x = 3; g.player.z = 10; g.trigger('interact'); assert.equal(g.souls, 200); assert.equal(g.drop, null);
});

test('a second death replaces previously dropped currency', () => {
  const g = play(); g.souls = 100; g.hurt(200, { x: 0, z: 0 }); g.respawn();
  g.hurt(200, { x: 0, z: 0 }); assert.equal(g.drop, null);
});

test('rest resets ordinary enemies while defeated boss remains defeated', () => {
  const g = play(); g.won = true; g.enemies[0].hp = 0; g.player.hp = 40; g.player.x = CAMP.x; g.player.z = CAMP.z;
  g.trigger('interact'); assert.equal(g.player.hp, 100); assert.equal(g.enemies[0].hp, 90); assert.equal(g.enemies[2].hp, 0);
});

test('boss phase change has a telegraphed burst then summons an attackable echo', () => {
  const g=play(),boss=g.enemies[2];boss.hp=300;
  g.update(.01);assert.equal(boss.phase,2);assert.equal(boss.action,'summon');
  tick(g,1);assert.equal(g.enemies.length,3);assert.equal(g.events.filter(e=>e.type==='burst').length,0);
  tick(g,.3);assert.equal(g.events.filter(e=>e.type==='burst').length,1);
  tick(g,.85);const echo=g.enemies.find(e=>e.phantom);assert.equal(echo.hp,100);assert.equal(echo.boss,false);assert.equal(boss.action,'recover');
});

test('boss defeat grants the reward once and ends its attacks', () => {
  const g = play(), p = g.player, boss = g.enemies[2];
  p.x = 0; p.z = -11; p.angle = Math.PI; boss.hp = 30; g.bossActive = true;
  g.trigger('light'); tick(g, MOTION.light.impact + .01);
  assert.equal(boss.hp, 0); assert.equal(g.won, true); assert.equal(g.bossActive, false); assert.equal(g.souls, 1000);
  assert.equal(g.events.filter(e => e.type === 'victory').length, 1);
  tick(g, 1); g.trigger('heavy'); tick(g, 1.1);
  assert.equal(g.souls, 1000); assert.equal(p.hp, 100);
});

test('lock drops dead targets and collision keeps actors outside columns and walls', () => {
  const g = play(); g.trigger('lock'); assert.ok(g.target); g.target.hp = 0; g.update(.01); assert.equal(g.locked, null);
  const p = g.player, c = PILLARS[0]; p.x = c.x; p.z = c.z; g.move(p, 0, 0);
  assert.ok(distance(p, c) >= p.radius + c.r - .001);
  g.move(p, 100, 100); assert.ok(p.x < 16.7 && p.z < 19.7);
});

test('paused simulation freezes combat and stamina cannot fund unavailable actions', () => {
  const g = play(); g.player.stamina = 5; g.trigger('heavy'); assert.equal(g.player.action, 'idle');
  g.state = 'paused'; const z = g.player.z; tick(g, 1, { x: 0, z: -1 }); assert.equal(g.player.z, z); assert.equal(g.time, 0);
});

test('wheel target cycling wraps both ways and skips dead or distant enemies', () => {
  const g=play();Object.assign(g.player,{x:0,z:0});
  Object.assign(g.enemies[0],{x:-3,z:0});Object.assign(g.enemies[1],{x:3,z:0});
  g.locked='sentinel-a';g.cycleTarget(1);assert.equal(g.locked,'sentinel-b');
  g.cycleTarget(1);assert.equal(g.locked,'warden');g.cycleTarget(1);assert.equal(g.locked,'sentinel-a');
  g.cycleTarget(-1);assert.equal(g.locked,'warden');
  g.enemies[1].hp=0;g.enemies[2].z=-30;g.locked='sentinel-a';g.cycleTarget(1);assert.equal(g.locked,'sentinel-a');
  g.enemies.push({id:'echo',phantom:true,hp:100,x:2,z:0});g.cycleTarget(1);assert.equal(g.locked,'echo');
});

test('target cycling preserves actions and does not acquire targets while unlocked or paused', () => {
  const g=play();g.cycleTarget(1);assert.equal(g.locked,null);
  g.locked='sentinel-a';g.trigger('light');const serial=g.player.actionSerial,stamina=g.player.stamina;
  g.cycleTarget(1);assert.equal(g.locked,'sentinel-b');assert.equal(g.player.actionSerial,serial);assert.equal(g.player.stamina,stamina);
  g.state='paused';g.cycleTarget(-1);assert.equal(g.locked,'sentinel-b');
});

test('a released tap parries inside the window and a late parry takes the hit', () => {
  const g = play(), p = g.player; Object.assign(p, { x: 0, z: 0, angle: 0 });
  const e = g.enemies[0]; Object.assign(e, { x: 0, z: 1.5, angle: Math.PI, action: 'idle', cooldown: 100 });
  Object.assign(g.enemies[1], { x: 60, z: 60 }); // keep the other sentinel out of the fight
  g.update(.01, { parry: true }); assert.equal(p.action, 'parry', 'the released tap starts a parry');
  assert.equal(p.stamina, 100 - MOTION.parry.stamina);
  tick(g, MOTION.parry.windowStart + .02);
  Object.assign(e, { action: 'swing', timer: 0, hit: false });
  const hp = p.hp; g.hurt(19, e);
  assert.equal(p.hp, hp, 'deflected attacks do no damage');
  assert.equal(e.action, 'parried'); assert.ok(g.events.some(ev => ev.type === 'parry'));
  assert.equal(p.duration,MOTION.parry.duration,'success must not cut off the shield return');
  tick(g, 1, {}); assert.equal(e.action, 'parried', 'the sentinel stays open'); tick(g, 1.5, {}); assert.equal(e.action, 'idle');
  // Re-pressing during a parry cannot cut off its recovery into a block.
  g.update(.01, { parry: true }); tick(g, MOTION.parry.windowEnd + .02, { block: true });
  assert.equal(p.action,'parry'); assert.equal(p.blocking,false);
  tick(g,MOTION.parry.duration,{block:true});
  assert.equal(p.action, 'idle'); assert.equal(p.blocking, true);
  tick(g, .2, { block: true, x: 1, z: 0 }); assert.equal(p.moving, 2, 'guarded movement works after the flick');
  // A parry whose window has passed leaves the player open once released.
  Object.assign(e, { action: 'idle', cooldown: 100 }); tick(g, 1, {}); g.update(.01, { parry: true }); tick(g, MOTION.parry.windowEnd + .05, {});
  assert.equal(p.action, 'parry'); Object.assign(e, { action: 'swing', timer: 0, hit: false });
  g.hurt(19, e); assert.equal(p.hp, hp - 19); assert.equal(e.action, 'swing');
});

test('parry startup, rear strikes and non-weapon bursts cannot be deflected',()=>{
  for(const [time,rear,action]of [[.02,false,'swing'],[.2,true,'swing'],[.2,false,'summon']]){
    const g=play(),p=g.player;p.angle=0;g.trigger('parry');p.timer=time;
    g.hurt(20,{x:p.x,z:p.z+(rear?-1:1),action});
    assert.equal(p.hp,80);assert.equal(p.action,'stagger');assert.equal(p.blocking,false);
  }
});

test('parry faces the locked target and interrupts boss and phantom weapon attacks',()=>{
  for(const phantom of [false,true]){
    const g=play(),p=g.player,e=g.enemies[2];Object.assign(p,{x:0,z:0,angle:0});
    Object.assign(e,{x:2,z:0,action:'bossAttack',move:'procession',timer:.7,phantom});g.locked=e.id;
    g.trigger('parry');assert.equal(p.angle,angleTo(p,e));p.timer=.2;
    g.hurt(25,e);assert.equal(e.action,'parried');assert.equal(e.move,null);assert.equal(p.hp,100);
    e.x=1;e.z=1;g.update(.01);assert.equal(p.angle,angleTo(p,e));
  }
});

test('a light attack on a parried enemy becomes a critical riposte', () => {
  const g = play(), p = g.player; Object.assign(p, { x: 0, z: 0, angle: 0 });
  const e = g.enemies[0]; Object.assign(e, { x: 0, z: 1.4, angle: Math.PI, action: 'parried', timer: 0, hp: 90, cooldown: 100 });
  g.trigger('light'); assert.equal(p.action, 'riposte');
  tick(g, MOTION.riposte.impact + .02, {});
  assert.equal(e.hp, 0, 'the riposte finishes a sentinel'); assert.ok(g.events.some(ev => ev.type === 'hit' && ev.critical));
  tick(g, MOTION.riposte.duration, {}); assert.equal(p.action, 'idle');
  const boss = g.enemies[2]; Object.assign(boss, { x: 0, z: 1.8, angle: Math.PI, action: 'parried', timer: 0 }); const bossHp = boss.hp;
  g.trigger('light'); tick(g, MOTION.riposte.impact + .02, {});
  assert.equal(boss.hp, bossHp - MOTION.riposte.bossDamage);
  tick(g, .6, {}); assert.equal(boss.action, 'parried', 'the boss is still open'); tick(g, .7, {}); assert.ok(['recover', 'idle'].includes(boss.action), 'the boss recovers after 1.4 s');
});

test('actual enemy weapon contact enters lasting parry stun and stops the remaining combo',()=>{
  for(const type of ['sentinel','boss','phantom']){
    const g=play(),p=g.player;Object.assign(p,{x:0,z:0,angle:0});
    for(const e of g.enemies)Object.assign(e,{x:60,z:60});
    const e=type==='sentinel'?g.enemies[0]:type==='boss'?g.enemies[2]:{...g.enemies[2],id:'echo',boss:false,phantom:true};
    if(type==='phantom')g.enemies.push(e);
    Object.assign(e,{x:0,z:1.5,angle:Math.PI,action:type==='sentinel'?'swing':'bossAttack',timer:type==='sentinel'?.125:.815,move:type==='sentinel'?null:'procession',hit:false,hitIndex:0,actionSerial:4});
    g.trigger('parry');p.timer=.2;g.update(.01);
    assert.equal(e.action,'parried');assert.equal(e.actionSerial,5);assert.equal(e.move,null);assert.equal(e.moving,0);
    const start={x:e.x,z:e.z},swings=g.events.filter(ev=>ev.type==='enemySwing').length;
    tick(g,parriedDuration(e)-.3);
    assert.equal(e.action,'parried');assert.equal(p.hp,100);
    assert.ok(distance(e,start)>.15&&distance(e,start)<.4,'a short backward recovery step stays in riposte range');
    assert.equal(g.events.filter(ev=>ev.type==='enemySwing').length,swings,'no continuation of the deflected combo');
    g.trigger('light');assert.equal(p.action,'riposte','the stunned enemy remains available for a critical attack');
  }
});
