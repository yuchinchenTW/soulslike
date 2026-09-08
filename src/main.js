import { Game } from './game.js';
import { World } from './world.js';
import { loadCharacterAssets } from './character.js';

const $ = id => document.getElementById(id);
const show = (id, visible = true) => $(id).classList.toggle('hidden', !visible);
const canvas = $('scene');
let game = new Game(), world, last = performance.now(), elapsed = 0;
let toastUntil = 0, bannerUntil = 0, hurtUntil = 0, helpReturn = 'menu';
let hitStop = 0;
const keys = new Set();
let rightMouse = false, dragged = false;

class Sound {
  constructor() { this.enabled = true; this.ctx = null; }
  init() {
    try {
      if (!this.ctx) { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); this.master = this.ctx.createGain(); this.master.gain.value = .3; this.master.connect(this.ctx.destination); }
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    } catch { this.enabled = false; }
  }
  tone(freq, duration, type = 'sine', volume = .2, end = freq) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, end), t + duration);
    g.gain.setValueAtTime(.001, t); g.gain.exponentialRampToValueAtTime(volume, t + .012); g.gain.exponentialRampToValueAtTime(.001, t + duration);
    o.connect(g); g.connect(this.master); o.start(); o.stop(t + duration + .01);
    o.onended = () => { o.disconnect(); g.disconnect(); };
  }
  noise(duration, volume = .15) {
    if (!this.enabled || !this.ctx) return;
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * duration, this.ctx.sampleRate), data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2;
    const s = this.ctx.createBufferSource(), g = this.ctx.createGain(), f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1600; s.buffer = buffer; g.gain.value = volume;
    s.connect(f); f.connect(g); g.connect(this.master); s.start(); s.onended = () => { s.disconnect(); f.disconnect(); g.disconnect(); };
  }
  play(type) {
    if (['swing', 'enemySwing', 'roll'].includes(type)) this.noise(.23, .35);
    if (type === 'land') { this.noise(.12, .28); this.tone(88, .12, 'triangle', .2, 40); }
    if (type === 'hit') { this.noise(.14, .65); this.tone(130, .16, 'triangle', .5, 45); }
    if (type === 'hurt') { this.noise(.2, .6); this.tone(76, .4, 'sawtooth', .3, 30); }
    if (type === 'block') { this.tone(730, .3, 'triangle', .25, 200); this.noise(.08, .5); }
    if (['heal', 'rest', 'kill'].includes(type)) { this.tone(330, .6, 'sine', .18, 660); this.tone(495, .8, 'sine', .12, 990); }
    if (['bossAwake', 'rage', 'death'].includes(type)) { this.tone(55, 1.8, 'sawtooth', .16, 35); this.tone(83, 2, 'sine', .2, 55); }
    if (type === 'victory') for (const f of [196, 246.94, 293.66, 392]) this.tone(f, 3, 'sine', .13);
  }
}
const sound = new Sound();
function toast(text, seconds = 2.7) { $('toast').textContent = text; toastUntil = elapsed + seconds; show('toast'); }
function banner(title, subtitle, seconds = 3.5) { $('banner').querySelector('h2').textContent = title; $('banner').querySelector('p').textContent = subtitle; bannerUntil = elapsed + seconds; show('banner'); }
function requestMouse() {
  try { const result = canvas.requestPointerLock?.(); result?.catch?.(() => toast('可按住滑鼠拖曳或使用方向鍵旋轉視角')); } catch { toast('使用方向鍵旋轉視角'); }
}
function clearInput() { keys.clear(); rightMouse = false; dragged = false; }
function pause() {
  if (game.state !== 'playing') return;
  game.state = 'paused'; clearInput(); show('pause'); document.exitPointerLock?.();
}
function resume() {
  show('pause', false); show('help', false); game.state = 'playing'; clearInput(); sound.init(); requestMouse();
}
function help() {
  helpReturn = game.state;
  if (game.state === 'playing') game.state = 'paused';
  clearInput(); show('help'); document.exitPointerLock?.();
}
function direction() {
  const forward = Number(keys.has('KeyW')) - Number(keys.has('KeyS'));
  const side = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
  return { x: side * Math.cos(world.yaw) - forward * Math.sin(world.yaw), z: -side * Math.sin(world.yaw) - forward * Math.cos(world.yaw) };
}
function updateHUD() {
  const p = game.player;
  $('health').style.transform = $('health-lag').style.transform = `scaleX(${p.hp / 100})`;
  $('stamina').style.transform = `scaleX(${p.stamina / 100})`;
  $('hp-label').textContent = `${Math.ceil(p.hp)} / 100`; $('flasks').textContent = p.flasks; $('souls').textContent = game.souls.toLocaleString();
  const boss = game.enemies.find(e => e.boss);
  show('boss', game.bossActive && boss.hp > 0);
  $('boss-fill').style.transform = $('boss-lag').style.transform = `scaleX(${boss.hp / boss.maxHp})`;
  $('boss-phase').textContent = boss.phase === 2 ? 'THE BURNING VOW' : 'THE LAST VOW';
  $('objective').textContent = game.won ? '誓約已盡 · 庭院重歸寂靜' : game.bossActive ? '擊敗灰庭守誓者' : '尋找庭院深處的守誓者';
  const target = game.target;
  if (target) {
    const pos = world.project(target, target.boss ? 2.4 : 1.55);
    show('lock', pos.visible); $('lock').style.left = `${pos.x}px`; $('lock').style.top = `${pos.y}px`;
    const label = world.project(target, target.boss ? 4 : 2.6);
    show('enemy-label', !target.boss && label.visible); $('enemy-label').style.left = `${label.x}px`; $('enemy-label').style.top = `${label.y}px`;
    $('enemy-label').querySelector('b').style.transform = `scaleX(${target.hp / target.maxHp})`;
  } else { show('lock', false); show('enemy-label', false); }
  const prompt = game.state === 'playing' ? game.interaction() : '';
  show('prompt', !!prompt); if (prompt) $('prompt').innerHTML = `<kbd>E</kbd>${prompt}`;
  show('toast', elapsed < toastUntil); show('banner', elapsed < bannerUntil);
  $('hurt').style.opacity = elapsed < hurtUntil ? '.8' : '0';
}
function handleEvents() {
  for (const e of game.events.splice(0)) {
    sound.play(e.type); world.addEffect(e.type, e);
    if (e.type === 'toast') toast(e.text);
    if (e.type === 'banner') banner(e.title, e.subtitle);
    if (e.type === 'hurt') hurtUntil = elapsed + .23;
    if (e.type === 'hit') hitStop = e.boss ? .055 : .04;
    if (e.type === 'bossAwake') toast('灰庭守誓者已甦醒', 3);
    if (e.type === 'death') { clearInput(); show('death'); document.exitPointerLock?.(); }
    if (e.type === 'victory' && game.state !== 'dead') { game.state = 'victory'; clearInput(); show('victory'); document.exitPointerLock?.(); }
  }
}
function frame(now) {
  const dt = Math.min((now - last) / 1000, .05); last = now; elapsed += dt;
  if (game.state === 'playing') {
    if (!game.target) world.yaw += (Number(keys.has('ArrowLeft')) - Number(keys.has('ArrowRight'))) * dt * 1.8;
    const d = direction();
    if (hitStop > 0) hitStop = Math.max(0, hitStop - dt);
    else game.update(dt, { ...d, block: rightMouse || keys.has('KeyK'), sprint: keys.has('ShiftLeft') || keys.has('ShiftRight') });
  }
  handleEvents();
  world.update(game, dt, elapsed, game.state === 'menu');
  updateHUD(); requestAnimationFrame(frame);
}

try {
  await loadCharacterAssets();
  world = new World(canvas);
  $('start').addEventListener('click', () => { game.start(); show('menu', false); show('hud'); sound.init(); requestMouse(); });
  $('resume').addEventListener('click', resume);
  $('menu-help').addEventListener('click', help); $('pause-help').addEventListener('click', help);
  $('close-help').addEventListener('click', () => { show('help', false); if (helpReturn === 'playing') resume(); });
  $('respawn').addEventListener('click', () => { game.respawn(); show('death', false); world.yaw = 0; requestMouse(); });
  $('continue').addEventListener('click', () => { show('victory', false); game.state = 'playing'; requestMouse(); });
  $('restart').addEventListener('click', () => { game = new Game(); game.start(); show('victory', false); world.yaw = 0; requestMouse(); });
  $('sound').addEventListener('click', () => { sound.enabled = !sound.enabled; $('sound').textContent = `音效：${sound.enabled ? '開啟' : '關閉'}`; });
  document.addEventListener('keydown', e => {
    if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code === 'Escape') { if (!$('help').classList.contains('hidden')) { show('help', false); if (helpReturn === 'playing') show('pause'); } else pause(); return; }
    if (e.code === 'KeyM') { sound.enabled = !sound.enabled; $('sound').textContent = `音效：${sound.enabled ? '開啟' : '關閉'}`; toast(`音效已${sound.enabled ? '開啟' : '關閉'}`); }
    if (e.code === 'KeyH' && game.state === 'playing') help();
    const actions = { Space: 'roll', KeyJ: 'light', KeyR: 'heavy', KeyQ: 'lock', KeyF: 'heal', KeyE: 'interact' };
    if (actions[e.code]) game.trigger(actions[e.code], direction());
  });
  document.addEventListener('keyup', e => keys.delete(e.code));
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('mousedown', e => {
    if (game.state !== 'playing') return;
    if (e.button === 0) game.trigger('light');
    if (e.button === 2) rightMouse = true;
    dragged = true;
  });
  document.addEventListener('mouseup', e => { if (e.button === 2) rightMouse = false; dragged = false; });
  document.addEventListener('mousemove', e => {
    if (game.state !== 'playing' || game.target || !(document.pointerLockElement === canvas || dragged)) return;
    world.yaw -= e.movementX * .003; world.pitch = Math.max(-.04, Math.min(.95, world.pitch + e.movementY * .0025));
  });
  canvas.addEventListener('wheel', e => { e.preventDefault(); world.cameraDistance = Math.max(4, Math.min(10, world.cameraDistance + e.deltaY * .006)); }, { passive: false });
  document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement && game.state === 'playing') pause(); });
  window.addEventListener('blur', pause);
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  window.addEventListener('resize', () => world.resize());
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); pause(); show('error'); $('error-message').textContent = '圖形裝置暫時中斷，請重新整理頁面後再試。'; });
  // Read-only instrumentation for smoke checks, also useful when reporting a bug.
  window.ashfall = Object.freeze({ snapshot: () => ({ state: game.state, player: { ...game.player }, enemies: game.enemies.map(e => ({ ...e })), souls: game.souls, locked: game.locked, won: game.won, drawCalls: world.renderer.info.render.calls }) });
  show('loading', false); show('menu'); requestAnimationFrame(frame);
} catch (error) {
  console.error(error); show('loading', false); show('error');
  $('error-message').textContent = `請使用 Chrome 或 Edge 並啟用硬體加速。請以 start-game.cmd 啟動遊戲。錯誤：${error.message}`;
}
