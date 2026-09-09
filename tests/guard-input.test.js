import test from 'node:test';
import assert from 'node:assert/strict';
import { GuardInput, GUARD_TAP_MS } from '../src/guard-input.js';
import { Game } from '../src/game.js';

function setup() { const game=new Game(); game.start(); return {game,input:new GuardInput(),p:game.player}; }
test('a complete click between frames parries once on release',()=>{
  const {game,input,p}=setup(); input.down('mouse',0,p);
  assert.equal(input.consume(),false); assert.equal(input.held,true);
  input.up('mouse',80,p); assert.equal(input.held,false);
  game.update(.01,{block:input.held,parry:input.consume()});
  assert.equal(p.action,'parry'); assert.equal(input.consume(),false);
});
test('holding right mouse guards immediately and releasing a hold never parries',()=>{
  for(const duration of [GUARD_TAP_MS,500,3000]){
    const {game,input,p}=setup();input.down('mouse',0,p);
    for(let i=0;i<100;i++)game.update(.01,{block:input.held,parry:input.consume(),x:1});
    assert.equal(p.action,'idle');assert.equal(p.blocking,true);assert.equal(p.moving,2);assert.equal(p.stamina,100);
    input.up('mouse',duration,p);game.update(.01,{block:input.held,parry:input.consume()});
    assert.equal(p.action,'idle');assert.equal(p.blocking,false);
  }
});
test('a short guard that already blocked a strike does not turn into a parry',()=>{
  const {game,input,p}=setup();input.down('mouse',0,p);game.update(.01,{block:input.held});
  game.hurt(19,{x:p.x,z:p.z-1,action:'swing'});input.up('mouse',80,p);
  assert.equal(input.consume(),false);assert.equal(p.hp,98);
});
test('overlapping keyboard and mouse holds and repeats never retrigger a tap',()=>{
  const {input,p}=setup();input.down('keyboard',0,p);input.down('keyboard',200,p);
  input.down('mouse',300,p);input.up('keyboard',320,p);
  assert.equal(input.held,true);assert.equal(input.consume(),false);
  input.up('mouse',350,p);assert.equal(input.held,false);assert.equal(input.consume(),false);
  input.down('keyboard',400,p);input.up('keyboard',450,p);assert.equal(input.consume(),true);
});
test('pause, lost focus and actions during a press cancel pending taps',()=>{
  const {game,input,p}=setup();input.down('mouse',0,p);input.reset();input.up('mouse',50,p);
  assert.equal(input.consume(),false);assert.equal(input.held,false);
  input.down('mouse',100,p);game.trigger('light');input.up('mouse',150,p);assert.equal(input.consume(),false);
  input.down('mouse',200,p);game.setAction('idle',0);input.up('mouse',250,p);assert.equal(input.consume(),false);
});
