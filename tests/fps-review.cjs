const puppeteer=require(process.env.PUPPETEER_PATH||'puppeteer');
const assert=require('node:assert/strict');
(async()=>{
  const browser=await puppeteer.launch({executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader'],defaultViewport:{width:1440,height:900,deviceScaleFactor:1}});
  try{
    const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:4173/');await page.waitForFunction(()=>window.ashfall&&Number(document.querySelector('#fps-value').textContent)>0);
    let snapshot=await page.evaluate(()=>ashfall.snapshot());assert.ok(snapshot.performance.fps>0);assert.equal(snapshot.quality,'auto');
    await page.select('#quality','performance');snapshot=await page.evaluate(()=>ashfall.snapshot());assert.equal(snapshot.quality,'performance');assert.equal(snapshot.renderScale,.65);
    await page.select('#quality','high');snapshot=await page.evaluate(()=>ashfall.snapshot());assert.equal(snapshot.renderScale,1);
    await page.setViewport({width:2560,height:1440,deviceScaleFactor:2});await page.waitForFunction(()=>ashfall.snapshot().renderScale<1);assert.equal(await page.evaluate(()=>document.querySelector('canvas').width),1920);
    await page.setViewport({width:1440,height:900,deviceScaleFactor:1});await page.select('#quality','auto');await page.click('#start');
    await page.waitForFunction(()=>ashfall.snapshot().state==='playing');
    const bounds=await page.evaluate(()=>{const a=document.querySelector('#fps-meter').getBoundingClientRect(),b=document.querySelector('.area-label').getBoundingClientRect();return {bottom:a.bottom,top:b.top}});assert.ok(bounds.bottom<bounds.top,'FPS must not cover the area name');
    await page.screenshot({path:'artifacts/fps-game.png'});
    assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'PASS',checks:['live FPS and frame time','three quality modes','high-DPI pixel cap','HUD placement'],snapshot:await page.evaluate(()=>ashfall.snapshot().performance),errors}));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
