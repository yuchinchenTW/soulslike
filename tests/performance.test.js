import test from 'node:test';
import assert from 'node:assert/strict';
import { FrameMeter, AdaptiveResolution } from '../src/performance.js';

test('FPS uses wall-clock frame intervals including visible stalls',()=>{
  const meter=new FrameMeter();meter.tick(0);let sample;
  for(let i=1;i<=30;i++)sample=meter.tick(i*1000/60)||sample;
  assert.ok(Math.abs(sample.fps-60)<.001);assert.ok(Math.abs(sample.ms-1000/60)<.001);
  meter.reset();meter.tick(0);sample=meter.tick(1000);
  assert.equal(sample.fps,1);assert.equal(sample.ms,1000,'a stall must not become the 50ms combat clamp');
});
test('returning from a hidden tab starts a fresh FPS window',()=>{
  const meter=new FrameMeter();meter.tick(0);meter.tick(200);meter.reset();
  assert.equal(meter.tick(10000),null);assert.equal(meter.tick(10250),null);
  assert.equal(meter.tick(10500).fps,4);
});
test('automatic resolution reduces sustained load and recovers slowly within limits',()=>{
  const quality=new AdaptiveResolution();
  assert.equal(quality.sample({fps:30,seconds:.5}),false);
  quality.sample({fps:30,seconds:.5});assert.equal(quality.sample({fps:30,seconds:.5}),true);
  assert.ok(Math.abs(quality.scale-.75)<.001);
  for(let i=0;i<100;i++)quality.sample({fps:30,seconds:.5});assert.equal(quality.scale,.55);
  for(let i=0;i<15;i++)quality.sample({fps:60,seconds:.5});assert.equal(quality.scale,.55);
  quality.sample({fps:60,seconds:.5});assert.ok(quality.scale>.55);
  for(let i=0;i<200;i++)quality.sample({fps:60,seconds:.5});assert.equal(quality.scale,1);
});
