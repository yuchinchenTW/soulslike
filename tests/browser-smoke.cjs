// Uses an existing Puppeteer installation when PUPPETEER_PATH is provided.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require(process.env.PUPPETEER_PATH || 'puppeteer');

(async () => {
  fs.mkdirSync('artifacts', { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    userDataDir: path.resolve('artifacts/browser-profile'),
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
    defaultViewport: { width: 1440, height: 900 }
  });
  try {
    const page = await browser.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => window.ashfall && !document.getElementById('menu').classList.contains('hidden'));
    await page.screenshot({ path: 'artifacts/title.png' });
    await page.click('#menu-help'); assert.ok(await page.$eval('#help', e => !e.classList.contains('hidden')));
    await page.click('#close-help'); await page.click('#start');
    await page.waitForFunction(() => window.ashfall.snapshot().state === 'playing');
    const before = await page.evaluate(() => ashfall.snapshot());
    await page.keyboard.down('w');
    await page.waitForFunction(z => ashfall.snapshot().player.z < z - 3, { timeout: 20000 }, before.player.z);
    await page.keyboard.up('w');
    await page.keyboard.press('q');
    assert.ok((await page.evaluate(() => ashfall.snapshot())).locked);
    await page.keyboard.press('Space');
    await page.waitForFunction(() => ashfall.snapshot().player.action === 'roll');
    assert.ok((await page.evaluate(() => ashfall.snapshot())).player.stamina < 100);
    await page.waitForFunction(() => ashfall.snapshot().player.action === 'idle');
    await page.keyboard.press('j'); await page.waitForFunction(() => ashfall.snapshot().player.action === 'light');
    await page.screenshot({ path: 'artifacts/gameplay.png' });
    await page.keyboard.press('h');
    assert.equal((await page.evaluate(() => ashfall.snapshot())).state, 'paused');
    await page.click('#close-help'); await page.waitForFunction(() => ashfall.snapshot().state === 'playing');
    await page.evaluate(() => document.exitPointerLock());
    await page.waitForFunction(() => ashfall.snapshot().state === 'paused');
    await page.click('#resume'); await page.waitForFunction(() => ashfall.snapshot().state === 'playing');
    await page.keyboard.press('q');
    await page.screenshot({ path: 'artifacts/courtyard.png' });
    await page.waitForFunction(() => ashfall.snapshot().player.hp < 100, { timeout: 30000 });
    await page.waitForFunction(() => ashfall.snapshot().player.action === 'idle');
    await page.keyboard.press('f');
    await page.waitForFunction(() => ashfall.snapshot().player.flasks === 2, { timeout: 10000 });
    await page.waitForFunction(() => ashfall.snapshot().state === 'dead', { timeout: 60000 });
    assert.ok(await page.$eval('#death', e => !e.classList.contains('hidden')));
    await page.screenshot({ path: 'artifacts/death.png' });
    await page.click('#respawn');
    await page.waitForFunction(() => ashfall.snapshot().state === 'playing');
    const restored = await page.evaluate(() => ashfall.snapshot());
    assert.equal(restored.player.hp, 100); assert.equal(restored.player.flasks, 3);
    await page.keyboard.down('a');
    await page.waitForFunction(() => ashfall.snapshot().player.x < -3.5);
    await page.keyboard.up('a'); await page.keyboard.press('e');
    await page.waitForFunction(() => ashfall.snapshot().player.x === -1);
    await page.screenshot({ path: 'artifacts/bonfire.png' });
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ result: 'PASS', checks: ['WebGL scene', 'menu', 'help', 'start', 'movement', 'lock-on', 'dodge and stamina', 'attack', 'pause and resume', 'enemy damage', 'healing', 'death', 'respawn', 'bonfire rest'], snapshot: await page.evaluate(() => ashfall.snapshot()), errors }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
