const puppeteer=require(process.env.PUPPETEER_PATH||'puppeteer');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
  fs.mkdirSync('artifacts',{recursive:true});
  const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader'],defaultViewport:{width:1000,height:750}});
  try{
    const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:4173/tests/character-view.html');await page.waitForFunction(()=>window.reviewReady);
    const reactions=await page.evaluate(async()=>{
      const T=await import('three'),{Game}=await import('/src/game.js'),{createKnight,animateKnight}=await import('/src/character.js');
      const results=[];
      for(const type of ['enemy','boss','phantom']){
        const g=new Game();g.start();Object.assign(g.player,{x:0,z:0,angle:0});
        for(const e of g.enemies)Object.assign(e,{x:60,z:60});
        const e=type==='enemy'?g.enemies[0]:type==='boss'?g.enemies[2]:{...g.enemies[2],id:'echo',boss:false,phantom:true};
        if(type==='phantom')g.enemies.push(e);
        Object.assign(e,{x:0,z:1.5,angle:Math.PI,action:type==='enemy'?'swing':'bossAttack',timer:type==='enemy'?.125:.815,move:type==='enemy'?null:'procession',hit:false,hitIndex:0});
        const rig=createKnight({boss:type!=='enemy',phantom:type==='phantom'});animateKnight(rig,e,1/60,0);
        g.trigger('parry');g.player.timer=.2;g.update(.01);
        let held=null,drift=0,footStart=null,footTravel=0,maxStep=0,lastHead=null;
        for(let i=0;i<60;i++){
          g.update(1/60);animateKnight(rig,e,1/60,g.time);
          const head=rig.head.getWorldPosition(new T.Vector3());
          const foot=rig.model.getObjectByName('mixamorigLeftFoot').getWorldPosition(new T.Vector3());
          if(i===12)footStart=foot.clone();if(i>12)footTravel=Math.max(footTravel,footStart.distanceTo(foot));
          if(lastHead)maxStep=Math.max(maxStep,lastHead.distanceTo(head));lastHead=head;
          if(i===24)held=head.clone();if(i>24)drift=Math.max(drift,held.distanceTo(head));
        }
        const head=rig.head.getWorldPosition(new T.Vector3()),hips=rig.model.getObjectByName('mixamorigHips').getWorldPosition(new T.Vector3());
        const result={type,action:e.action,clip:rig.current,indicator:rig.tell.visible,drift,footTravel,maxStep,bend:head.sub(hips).dot(new T.Vector3(Math.sin(e.angle),0,Math.cos(e.angle))),hp:g.player.hp};
        for(let i=60;i<(type==='enemy'?150:105);i++){
          g.update(1/60);animateKnight(rig,e,1/60,g.time);
          const head=rig.head.getWorldPosition(new T.Vector3());result.maxStep=Math.max(result.maxStep,lastHead.distanceTo(head));lastHead=head;
        }
        result.recovered=e.action!=='parried';results.push(result);
      }
      return results;
    });
    for(const r of reactions){assert.equal(r.action,'parried');assert.ok(r.clip.startsWith('parried'));assert.equal(r.indicator,true);assert.ok(r.bend>.15,'enemy stays off balance');assert.ok(r.drift>.035,'stun must keep moving instead of freezing');assert.ok(r.footTravel>.05,'enemy must step to regain balance');assert.ok(r.maxStep<.3,'reaction must not teleport');assert.equal(r.recovered,true);assert.equal(r.hp,100);}
    for(const type of ['enemy','boss','phantom'])for(const t of [.2,1]){
      await page.evaluate((type,t)=>reviewPose('parried',t,'side',type),type,t);
      await page.screenshot({path:`artifacts/parried-${type}-${t}.png`});
    }
    const result={result:'PASS',reactions,errors};assert.deepEqual(errors,[]);
    fs.writeFileSync('artifacts/parry-reaction-review.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
