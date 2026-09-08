const puppeteer = require(process.env.PUPPETEER_PATH || 'puppeteer');
const fs = require('node:fs');
const assert = require('node:assert/strict');
(async()=>{
  fs.mkdirSync('artifacts',{recursive:true});
  const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader'],defaultViewport:{width:1100,height:900}});
  try{
    const page=await browser.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
    await page.goto('http://127.0.0.1:4173/tests/character-view.html',{waitUntil:'networkidle0'});
    await page.waitForFunction(()=>window.reviewReady);
    const results=[];
    for(const [label,action,time,view] of [['knight-front','idle',0,'front'],['knight-back','idle',0,'back'],['sword-impact','light',.38,'front'],['heavy-windup','heavy',.42,'side'],['roll-tuck','roll',.17,'side'],['roll-inverted','roll',.31,'side'],['roll-landing','roll',.59,'side']]){
      const metrics=await page.evaluate((a,t,v)=>reviewPose(a,t,v),action,time,view);
      assert.ok(metrics.floor>=-.03,`${label} clips the floor`);assert.ok(metrics.joints>=25);
      await page.screenshot({path:`artifacts/${label}.png`});results.push({label,...metrics});
    }
    for(let t=0;t<=.88;t+=.01){const metrics=await page.evaluate(t=>reviewPose('roll',t,'side'),t);assert.ok(metrics.floor>=-.03,'roll contact');}
    for(const type of ['enemy','boss']){const metrics=await page.evaluate(t=>reviewPose('idle',0,'front',t),type);await page.screenshot({path:`artifacts/${type}-model.png`});assert.ok(metrics.joints>=65);results.push({label:type,...metrics});}
    assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'PASS',results,errors},null,2));
  }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
