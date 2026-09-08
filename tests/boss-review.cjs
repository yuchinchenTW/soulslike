const puppeteer=require(process.env.PUPPETEER_PATH||'puppeteer');
const assert=require('node:assert/strict');
(async()=>{
  const browser=await puppeteer.launch({executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader'],defaultViewport:{width:1440,height:900}});
  try{
    const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto('http://127.0.0.1:4173/tests/character-view.html');await page.waitForFunction(()=>window.reviewReady);
    for(const [clip,t]of [['light',.38],['light2',.315],['light3',.54]]){
      const pose=await page.evaluate((attackClip,time)=>reviewPose('light',time,'front','player',{attackClip}),clip,t);
      assert.ok(pose.tip[2]>1,'blade must cross the forward hit arc');assert.ok(pose.floor>-.03);
      await page.screenshot({path:`artifacts/combo-${clip}.png`});
    }
    // Verify both swords actually reach forward at the declared source contacts.
    for(const [t,hands]of [[.78,['left']],[1.11,['right']],[1.76,['right']],[1.89,['left']],[2.64,['right','left']]]){
      const pose=await page.evaluate(t=>sampleClip('dual',t,'boss'),t);
      for(const hand of hands)assert.ok(pose.blades.find(b=>b.hand===hand).tip[2]>1.4,`${hand} blade contact at ${t}`);
    }
    await page.goto('http://127.0.0.1:4173/tests/boss-view.html');await page.waitForFunction(()=>window.bossReview);
    await page.evaluate(()=>bossReview.step(.9));await page.screenshot({path:'artifacts/pontiff-phase-one.png'});
    await page.evaluate(()=>bossReview.phaseTwo());let state=await page.evaluate(()=>bossReview.step(2.2));
    assert.equal(state.actors.find(e=>e.id==='warden').phase,2);assert.equal(state.rigs.find(e=>e.id==='echo').blades,2);assert.ok(state.rigs.find(e=>e.id==='echo').opacity<.5);
    const seen=[];
    for(let i=0;i<32;i++){state=await page.evaluate(()=>bossReview.step(.15));seen.push(state);const boss=state.actors.find(e=>e.id==='warden'),echo=state.actors.find(e=>e.id==='echo');if(boss.action==='bossAttack'&&echo.action==='bossAttack'&&boss.timer>.55&&boss.timer<.9)await page.screenshot({path:'artifacts/pontiff-phase-two.png'});}
    assert.ok(seen.some(s=>s.actors.find(e=>e.id==='warden').action==='echoWait'));
    assert.ok(seen.some(s=>s.rigs.find(e=>e.id==='warden').clip==='dual'));
    state=await page.evaluate(()=>bossReview.rest());assert.equal(state.rigs.find(e=>e.id==='echo').visible,false);
    assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'PASS',checks:['three distinct sword contacts','five dual-sword contacts','boss phase change','translucent dual-sword echo','delayed follow-up','rest removes echo'],errors}));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
