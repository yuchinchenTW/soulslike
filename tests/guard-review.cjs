const puppeteer=require(process.env.PUPPETEER_PATH||'puppeteer');
const assert=require('node:assert/strict');
(async()=>{
  const browser=await puppeteer.launch({executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader'],defaultViewport:{width:1440,height:900}});
  try{
    const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:4173/tests/character-view.html');await page.waitForFunction(()=>window.reviewReady);
    const poses=await page.evaluate(async()=>{
      const T=await import('three'),{createKnight,animateKnight,GUARD_BLADE}=await import('/src/character.js');
      const rig=createKnight({player:true}),results=[];
      const state={hp:100,x:0,z:0,angle:1.2,action:'idle',timer:0,blocking:true,moving:0,moveX:0,moveZ:0};
      for(const [name,side,forward]of [['still',0,0],['forward',0,1],['left',-1,0],['backward',0,-1],['right',1,0]]){
        state.moveX=side*Math.cos(state.angle)+forward*Math.sin(state.angle);
        state.moveZ=-side*Math.sin(state.angle)+forward*Math.cos(state.angle);state.moving=side||forward?2:0;
        let maxError=0,footMin=Infinity,footMax=-Infinity;
        for(let i=0;i<180;i++){
          animateKnight(rig,state,1/60,i/60);
          const l=new T.Vector3().setFromMatrixPosition(rig.leftShoulder.matrixWorld),r=new T.Vector3().setFromMatrixPosition(rig.rightShoulder.matrixWorld);
          const yaw=Math.atan2(r.z-l.z,l.x-r.x);
          const expected=state.angle-GUARD_BLADE;maxError=Math.max(maxError,Math.abs(Math.atan2(Math.sin(yaw-expected),Math.cos(yaw-expected))));
          const foot=rig.model.getObjectByName('mixamorigLeftFoot').getWorldPosition(new T.Vector3());
          footMin=Math.min(footMin,foot.y);footMax=Math.max(footMax,foot.y);
        }
        results.push({name,clip:rig.current,maxError,footTravel:footMax-footMin});
      }
      return results;
    });
    for(const p of poses){assert.ok(p.maxError<.001,`${p.name}: torso turns away`);if(p.name!=='still')assert.ok(p.footTravel>.01,`${p.name}: feet stopped animating`);}
    await page.goto('http://127.0.0.1:4173/');await page.waitForFunction(()=>window.ashfall);await page.click('#start');
    await page.keyboard.down('k');const initial=(await page.evaluate(()=>ashfall.snapshot())).player.angle;
    await page.keyboard.down('d');await page.evaluate(()=>new Promise(resolve=>{let n=0;function frame(){if(++n===45)resolve();else requestAnimationFrame(frame)}requestAnimationFrame(frame)}));await page.keyboard.up('d');
    assert.equal((await page.evaluate(()=>ashfall.snapshot())).player.angle,initial);
    await page.mouse.click(720,450,{button:'middle'});await page.keyboard.down('a');
    await page.evaluate(()=>new Promise(resolve=>{let n=0;function frame(){if(++n===45)resolve();else requestAnimationFrame(frame)}requestAnimationFrame(frame)}));await page.keyboard.up('a');
    const s=await page.evaluate(()=>ashfall.snapshot()),target=s.enemies.find(e=>e.id===s.locked),bearing=Math.atan2(target.x-s.player.x,target.z-s.player.z);
    assert.ok(Math.abs(Math.atan2(Math.sin(s.player.angle-bearing),Math.cos(s.player.angle-bearing)))<.001);
    await page.screenshot({path:'artifacts/guard-locked-movement.png'});await page.keyboard.up('k');
    assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'PASS',poses,checks:['guard keeps the bladed torso on the facing in all four gaits','legs remain animated','unlocked guard holds bearing','locked guard faces target'],errors}));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
