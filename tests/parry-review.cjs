const puppeteer=require(process.env.PUPPETEER_PATH||'puppeteer');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
  fs.mkdirSync('artifacts',{recursive:true});
  const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader'],defaultViewport:{width:1280,height:800}});
  try{
    const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:4173/tests/character-view.html');await page.waitForFunction(()=>window.reviewReady);
    const motion=await page.evaluate(async()=>{
      const T=await import('three'),{createKnight,animateKnight}=await import('/src/character.js');
      const results=[];
      for(const angle of [0,1.2,Math.PI])for(const entry of ['guard','idle','left','backward','hurt']){
        const rig=createKnight({player:true});
        const state={hp:100,x:0,z:0,angle,action:'idle',actionSerial:0,timer:0,blocking:entry!=='idle',moving:entry==='left'||entry==='backward'?2:0,
          moveX:entry==='left'?-Math.cos(angle):entry==='backward'?-Math.sin(angle):0,
          moveZ:entry==='left'?Math.sin(angle):entry==='backward'?-Math.cos(angle):0};
        const point=()=>rig.model.getObjectByName('mixamorigLeftHand').getWorldPosition(new T.Vector3());
        for(let i=0;i<90;i++)animateKnight(rig,state,1/60,0);
        let maxStep=0,maxTurn=0,maxDrift=0,excursion=0,worst='sweep';
        for(let repeat=0;repeat<(entry==='hurt'?1:3);repeat++){
          state.action='parry';state.actionSerial++;state.blocking=false;state.moving=0;
          let last=point(),rotation=rig.leftArm.getWorldQuaternion(new T.Quaternion());const start=last.clone();
          for(let i=0;i<(entry==='hurt'?19:54);i++){
            state.timer=i/60;animateKnight(rig,state,1/60,0);
            const p=point(),q=rig.leftArm.getWorldQuaternion(new T.Quaternion());
            maxStep=Math.max(maxStep,last.distanceTo(p));maxTurn=Math.max(maxTurn,rotation.angleTo(q));excursion=Math.max(excursion,start.distanceTo(p));last=p;rotation=q;
            // During hit-stop, many renders must not add the same bone offset.
            if(i===18){for(let j=0;j<20;j++){animateKnight(rig,state,0,0);maxDrift=Math.max(maxDrift,last.distanceTo(point()));}}
          }
          state.action=entry==='hurt'?'stagger':'idle';state.actionSerial++;state.timer=0;state.blocking=entry!=='idle'&&entry!=='hurt';
          for(let i=0;i<24;i++){if(entry==='hurt')state.timer=i/60;animateKnight(rig,state,1/60,0);const p=point();if(last.distanceTo(p)>maxStep){maxStep=last.distanceTo(p);worst='exit '+i;}last=p;}
        }
        results.push({angle,entry,maxStep,maxTurn,maxDrift,excursion,worst});
      }
      return results;
    });
    console.log(JSON.stringify({motion}));
    for(const m of motion){assert.ok(m.maxDrift<.00001,'held pose accumulates rotation');assert.ok(m.maxStep<.12,'shield jumps between frames');assert.ok(m.maxTurn<.3,'arm snaps between frames');assert.ok(m.excursion>.2,'shield must visibly sweep');}
    const body=await page.evaluate(async()=>{
      const T=await import('three'),{createKnight,animateKnight}=await import('/src/character.js'),rig=createKnight({player:true});
      const state={x:0,z:0,angle:0,hp:100,action:'parry',timer:0,moving:0};
      for(let i=0;i<60;i++)animateKnight(rig,state,1/60,0);
      const names=['Hips','Spine','LeftForeArm','LeftHand'],bones=names.map(n=>rig.model.getObjectByName('mixamorig'+n)),initial=bones.map(b=>b.quaternion.clone()),turns=names.map(()=>0);
      const feet=['LeftFoot','RightFoot'].map(n=>rig.model.getObjectByName('mixamorig'+n)),anchors=feet.map(f=>f.getWorldPosition(new T.Vector3()));let slide=0;
      for(let i=0;i<54;i++){
        state.timer=i/60;animateKnight(rig,state,1/60,0);
        bones.forEach((b,j)=>turns[j]=Math.max(turns[j],initial[j].angleTo(b.quaternion)));
        feet.forEach((f,j)=>{const p=f.getWorldPosition(new T.Vector3());slide=Math.max(slide,Math.hypot(p.x-anchors[j].x,p.z-anchors[j].z));});
      }
      return {joints:Object.fromEntries(names.map((n,i)=>[n,turns[i]])),footSlide:slide};
    });
    console.log(JSON.stringify({body}));
    assert.ok(body.joints.Hips>.05&&body.joints.Spine>.1,'the torso and pelvis must contribute to the sweep');
    assert.ok(body.joints.LeftForeArm>.15&&body.joints.LeftHand>.05,'the elbow and wrist must follow the shoulder');
    assert.ok(body.footSlide<.015,'weight transfer must keep both feet planted');
    await page.evaluate(()=>reviewPose('parry',.33,'front','player'));
    await page.screenshot({path:'artifacts/parry-sweep.png'});
    await page.goto('http://127.0.0.1:4173/');await page.waitForFunction(()=>window.ashfall,{timeout:60000});await page.click('#start');
    const frames=()=>page.evaluate(()=>new Promise(resolve=>{let count=0;function next(){if(++count>=35)resolve();else requestAnimationFrame(next);}requestAnimationFrame(next);}));
    // Real mouse events: holding must never enter parry or spend stamina.
    await page.mouse.move(640,400);await page.mouse.down({button:'right'});await frames();
    let s=await page.evaluate(()=>ashfall.snapshot());assert.equal(s.player.action,'idle');assert.equal(s.player.blocking,true);assert.equal(s.player.stamina,100);
    await page.mouse.up({button:'right'});await frames();s=await page.evaluate(()=>ashfall.snapshot());assert.equal(s.player.action,'idle');assert.equal(s.player.blocking,false);
    await page.mouse.click(640,400,{button:'right'});
    await page.waitForFunction(()=>ashfall.snapshot().player.action==='parry');
    s=await page.evaluate(()=>ashfall.snapshot());assert.equal(s.clip,'parry');const serial=s.player.actionSerial;
    // Re-press while the swing is playing: finish recovery before guarding.
    await page.mouse.down({button:'right'});
    await page.waitForFunction(()=>{const p=ashfall.snapshot().player;return p.action==='parry'&&p.timer>.4;});
    s=await page.evaluate(()=>ashfall.snapshot());assert.equal(s.player.blocking,false);assert.equal(s.player.actionSerial,serial);
    await page.waitForFunction(()=>{const p=ashfall.snapshot().player;return p.action==='idle'&&p.blocking;});
    await page.mouse.up({button:'right'});await frames();assert.equal((await page.evaluate(()=>ashfall.snapshot())).player.action,'idle');
    await page.keyboard.press('k');await page.waitForFunction(()=>ashfall.snapshot().player.action==='parry');
    await page.waitForFunction(()=>ashfall.snapshot().player.action==='idle');
    // Losing input focus clears a held shield and must not queue a tap.
    await page.mouse.down({button:'right'});await page.keyboard.press('h');await page.mouse.up({button:'right'});await page.click('#close-help');await frames();
    s=await page.evaluate(()=>ashfall.snapshot());assert.equal(s.player.action,'idle');assert.equal(s.player.blocking,false);
    assert.deepEqual(errors,[]);
    const result={result:'PASS',motion,body,checks:['mouse hold guards without parry','released click parries once','re-press preserves full recovery','keyboard tap','pause clears held input','frozen pose does not drift','three repeated sweeps at three facings'],errors};
    fs.writeFileSync('artifacts/parry-review.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
