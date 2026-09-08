// Combat simulation stays independent of rendering so damage and timing can be checked.
import { MOTION, LIGHT_COMBO, attackMotion, travel } from './motion.js';
import { updatePontiff } from './pontiff.js';
export const CAMP = { x: -4, z: 14 };
export const PILLARS = [-13, 13].flatMap(x => [-15, -5, 5, 15].map(z => ({ x, z, r: 1.05 })));
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const angleTo = (a, b) => Math.atan2(b.x - a.x, b.z - a.z);
export const angleDelta = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const enemySpecs = [
  { id: 'sentinel-a', x: -6, z: 2, hp: 90, boss: false },
  { id: 'sentinel-b', x: 7, z: -4, hp: 90, boss: false },
  { id: 'warden', x: 0, z: -13, hp: 680, boss: true }
];

export class Game {
  constructor() {
    this.time = 0; this.events = []; this.souls = 0; this.drop = null;
    this.won = false; this.state = 'menu'; this.locked = null; this.bossActive = false;
    this.player = { x: -1, z: 13, angle: Math.PI, hp: 100, stamina: 100, flasks: 3, action: 'idle', timer: 0, duration: 0, regenDelay: 0, invuln: 0, moving: 0, blocking: false, radius: .43 };
    this.resetEnemies();
  }
  resetEnemies() {
    this.enemies = enemySpecs.map(s => ({ ...s, maxHp: s.hp, hp: this.won && s.boss ? 0 : s.hp, home: { x: s.x, z: s.z }, angle: 0, action: 'idle', timer: 0, cooldown: 1, moving: 0, hit: false, attackCount: 0, phase: 1, radius: s.boss ? .85 : .45, flash: 0, deathTime: 0 }));
  }
  emit(type, data = {}) { this.events.push({ type, ...data }); }
  start() { this.state = 'playing'; this.emit('banner', { title: '灰燼之庭', subtitle: 'THE FORSAKEN COURTYARD' }); }
  setAction(action, duration) {
    const p = this.player;
    if (action === 'idle' && p.action === 'light') p.comboUntil = this.time + .65;
    if (['heavy','roll','heal','stagger','dead'].includes(action)) { p.comboUntil = 0; p.comboIndex = -1; }
    Object.assign(p, { action, duration, timer: 0, hit: false, actionSerial: (p.actionSerial || 0) + 1 });
  }
  canAct() { return this.state === 'playing' && this.player.action === 'idle'; }
  spend(amount) {
    if (this.player.stamina < amount) { this.emit('toast', { text: '體力不足，稍作喘息' }); return false; }
    this.player.stamina -= amount; this.player.regenDelay = .65; return true;
  }
  trigger(action, direction) {
    const p = this.player;
    if (this.state !== 'playing') return;
    if (action === 'lock') {
      if (this.locked) this.locked = null;
      else {
        const candidates = this.enemies.filter(e => e.hp > 0 && distance(p, e) < 19).sort((a, b) => distance(p, a) - distance(p, b));
        this.locked = candidates[0]?.id || null;
        if (!this.locked) this.emit('toast', { text: '附近沒有可鎖定的敵人' });
      }
      return;
    }
    if (!this.canAct()) {
      if (['light','heavy','roll'].includes(action) && ['light','heavy','roll'].includes(p.action) && p.duration - p.timer <= .38) this.buffered = {action,direction,until:this.time + p.duration - p.timer + .1};
      return;
    }
    if (action === 'light' || action === 'heavy') {
      const index = action === 'light' && this.time <= (p.comboUntil || -1) ? ((p.comboIndex ?? -1) + 1) % LIGHT_COMBO.length : 0;
      const clip = action === 'light' ? LIGHT_COMBO[index] : 'heavy';
      if (!this.spend(action === 'light' ? MOTION[clip].stamina : 37)) return;
      p.attackClip = clip; p.comboIndex = index;
      const target = this.target;
      if (target) p.angle = angleTo(p, target);
      this.setAction(action, MOTION[clip].duration);
      p.blocking = false; p.swingSound = false;
    } else if (action === 'roll') {
      if (!this.spend(28)) return;
      const d = direction && Math.hypot(direction.x, direction.z) > .1 ? direction : { x: Math.sin(p.angle), z: Math.cos(p.angle) };
      const length = Math.hypot(d.x, d.z);
      p.rollX = d.x / length; p.rollZ = d.z / length;
      p.angle = Math.atan2(p.rollX, p.rollZ);
      p.blocking = false; this.setAction('roll', MOTION.roll.duration); this.emit('roll');
    } else if (action === 'heal') {
      if (!p.flasks) { this.emit('toast', { text: '餘火瓶已用盡，於篝火休息補充' }); return; }
      if (p.hp >= 100) { this.emit('toast', { text: '生命已滿' }); return; }
      this.setAction('heal', 1.3); p.blocking = false;
    } else if (action === 'interact') {
      if (this.drop && distance(p, this.drop) < 2.2) {
        this.souls += this.drop.amount; this.drop = null; this.emit('toast', { text: '已拾回遺失的餘燼' }); this.emit('rest');
      } else if (distance(p, CAMP) < 2.8) {
        this.respawn(false); this.emit('banner', { title: '餘火尚存', subtitle: 'RESTORED AT THE EMBER' }); this.emit('rest');
      }
    }
  }
  get target() { return this.enemies.find(e => e.id === this.locked && e.hp > 0); }
  cycleTarget(step) {
    if (this.state !== 'playing' || !this.target || !Number.isFinite(step) || step === 0) return;
    // Keep roster order stable as enemies move; retain the current target out
    // to the existing lock range, but acquire new targets only within 19m.
    const candidates = this.enemies.filter(e => e.hp > 0 && distance(this.player, e) < (e.id === this.locked ? 23 : 19));
    const index = candidates.findIndex(e => e.id === this.locked);
    if (index < 0 || candidates.length < 2) return;
    this.locked = candidates[(index + Math.sign(step) + candidates.length) % candidates.length].id;
  }
  move(actor, dx, dz) {
    actor.x = clamp(actor.x + dx, -16.7 + actor.radius, 16.7 - actor.radius);
    actor.z = clamp(actor.z + dz, -19.7 + actor.radius, 19.7 - actor.radius);
    for (const o of PILLARS) {
      const d = distance(actor, o), r = actor.radius + o.r;
      if (d < r) { const a = d > .001 ? angleTo(o, actor) : 0; actor.x = o.x + Math.sin(a) * r; actor.z = o.z + Math.cos(a) * r; }
    }
  }
  update(dt, input = {}) {
    if (this.state !== 'playing') return;
    dt = Math.min(dt, .05); this.time += dt;
    const p = this.player;
    const previousTime = p.timer;
    p.timer += dt; p.invuln = Math.max(0, p.invuln - dt); p.regenDelay = Math.max(0, p.regenDelay - dt);
    if (this.locked && (!this.target || distance(p, this.target) > 23)) this.locked = null;
    p.blocking = !!input.block && p.action === 'idle' && p.stamina > 0;
    p.moving = 0; p.moveX = 0; p.moveZ = 0;
    if (p.action === 'roll') {
      const step = travel('roll', p.timer) - travel('roll', previousTime);
      this.move(p, p.rollX * step, p.rollZ * step);
      if (p.timer >= .57 && previousTime < .57) this.emit('land', { x: p.x, z: p.z });
    }
    if (p.action === 'light' || p.action === 'heavy') {
      const heavy = p.action === 'heavy', motion = attackMotion(p), impact = motion.impact;
      const step = travel(p.action, p.timer, motion) - travel(p.action, previousTime, motion);
      this.move(p, Math.sin(p.angle) * step, Math.cos(p.angle) * step);
      if (!p.swingSound && p.timer >= impact - .06) { p.swingSound = true; this.emit('swing', { heavy }); }
      if (p.timer >= impact && !p.hit) { p.hit = true; this.playerStrike(heavy); }
    }
    if (p.action === 'heal' && p.timer >= .85 && !p.hit) {
      p.hit = true; p.flasks--; p.hp = Math.min(100, p.hp + 65); this.emit('heal', { x: p.x, z: p.z });
    }
    if (p.action !== 'idle' && p.timer >= p.duration) this.setAction('idle', 0);
    if (this.buffered && p.action === 'idle') { const queued=this.buffered; this.buffered=null; if(this.time<=queued.until)this.trigger(queued.action,queued.direction); }
    if (p.action === 'idle') {
      const dx = input.x || 0, dz = input.z || 0, len = Math.hypot(dx, dz);
      if (len > .01) {
        const running = !!input.sprint && p.stamina > 3 && !p.blocking;
        const speed = p.blocking ? 2 : running ? 7 : 4.3;
        if (running) { p.stamina = Math.max(0, p.stamina - dt * 17); p.regenDelay = .4; }
        this.move(p, dx / len * speed * dt, dz / len * speed * dt);
        p.moving = speed;
        p.moveX = dx / len; p.moveZ = dz / len;
        if (!this.target && !p.blocking) p.angle += angleDelta(Math.atan2(dx, dz), p.angle) * Math.min(1, dt * 16);
      }
      if (this.target) {
        if (p.blocking) p.angle = angleTo(p, this.target);
        else p.angle += angleDelta(angleTo(p, this.target), p.angle) * Math.min(1, dt * 14);
      }
    }
    if (p.regenDelay === 0 && (p.action === 'idle' || p.action === 'stagger')) p.stamina = Math.min(100, p.stamina + dt * (p.blocking ? 13 : 31));
    for (const e of [...this.enemies]) { if(this.state !== 'playing') break; this.updateEnemy(e, dt); }
    if (this.state !== 'playing') return;
    // Soft separation avoids standing inside an enemy without making dodge movement sticky.
    if (p.action !== 'roll') for (const e of this.enemies) {
      if (e.hp <= 0) continue;
      const d = distance(p, e), r = p.radius + e.radius;
      if (d < r) { const a = angleTo(e, p); this.move(p, Math.sin(a) * (r - d), Math.cos(a) * (r - d)); }
    }
    // Enemy movement and separation can change the bearing during this frame.
    if (p.blocking && this.target) p.angle = angleTo(p, this.target);
  }
  playerStrike(heavy) {
    const p = this.player;
    this.emit('slash', { x: p.x, z: p.z, angle: p.angle, heavy });
    for (const e of this.enemies) {
      if (e.hp <= 0 || distance(p, e) > (heavy ? 2.1 : 1.9) + e.radius * .3 || Math.abs(angleDelta(angleTo(p, e), p.angle)) > (heavy ? 1.2 : 1.05)) continue;
      const damage = heavy ? 55 : attackMotion(p)?.damage || 30;
      e.hp = Math.max(0, e.hp - damage); e.flash = .18;
      this.emit('hit', { x: e.x, z: e.z, boss: e.boss });
      if (!e.boss && !e.phantom && e.hp > 0) { e.action = 'stagger'; e.timer = 0; }
      if (e.hp === 0) {
        e.action = 'dead'; e.deathTime = this.time; this.souls += e.phantom ? 0 : e.boss ? 1000 : 100;
        if (this.locked === e.id) this.locked = null;
        this.emit('kill', { x: e.x, z: e.z, boss: e.boss });
        if (e.boss) { this.dismissPhantom(); this.won = true; this.bossActive = false; this.emit('victory'); }
      }
    }
  }
  updateEnemy(e, dt) {
    e.flash = Math.max(0, e.flash - dt); e.moving = 0;
    if (e.hp <= 0) return;
    if (e.boss || e.phantom) { updatePontiff(this, e, dt); return; }
    e.timer += dt; e.cooldown -= dt;
    const p = this.player, d = distance(e, p);
    if (e.action === 'stagger') { if (e.timer > .55) { e.action = 'idle'; e.cooldown = .65; } return; }
    if (e.action === 'windup') {
      if (e.timer < e.windup * .52) e.angle += angleDelta(angleTo(e, p), e.angle) * Math.min(1, dt * 7);
      if (e.timer >= e.windup) { e.action = 'swing'; e.timer = 0; e.hit = false; this.emit('enemySwing', { boss: e.boss }); }
      return;
    }
    if (e.action === 'swing') {
      if (e.timer < .2) this.move(e, Math.sin(e.angle) * dt * 2.7, Math.cos(e.angle) * dt * 2.7);
      if (e.timer >= .13 && !e.hit) {
        e.hit = true;
        this.emit('enemySlash', { x: e.x, z: e.z, angle: e.angle, boss: e.boss });
        if (distance(e, p) < 2.35 && Math.abs(angleDelta(angleTo(e, p), e.angle)) < 1.1) this.hurt(19, e);
      }
      if (e.timer > .43) { e.action = 'recover'; e.timer = 0; }
      return;
    }
    if (e.action === 'recover') { if (e.timer > .9) { e.action = 'idle'; e.cooldown = .3; } return; }
    const active = d < 9 || e.hp < e.maxHp;
    if (!active) return;
    e.angle += angleDelta(angleTo(e, p), e.angle) * Math.min(1, dt * 5);
    if (d > 1.85) {
      e.moving = 2.2;
      this.move(e, Math.sin(e.angle) * e.moving * dt, Math.cos(e.angle) * e.moving * dt);
    } else if (e.cooldown <= 0) {
      e.action = 'windup'; e.timer = 0; e.attackCount++;
      e.windup = .85;
      this.emit('windup', { x: e.x, z: e.z, boss: e.boss });
    }
  }
  hurt(amount, attacker) {
    const p = this.player;
    if (p.hp <= 0 || p.invuln > 0 || (p.action === 'roll' && p.timer >= MOTION.roll.invulnerableStart && p.timer <= MOTION.roll.invulnerableEnd)) return false;
    const front = Math.abs(angleDelta(angleTo(p, attacker), p.angle)) < 1.25;
    if (p.blocking && front) {
      const cost = amount * 1.35;
      p.regenDelay = 1;
      if (p.stamina >= cost) { p.stamina -= cost; p.hp = Math.max(1, p.hp - Math.round(amount * .08)); this.emit('block', { x: p.x, z: p.z }); return true; }
      p.stamina = 0; p.blocking = false; this.emit('toast', { text: '防禦崩潰' });
    }
    p.hp = Math.max(0, p.hp - amount); p.invuln = .48;
    this.setAction('stagger', .48); this.emit('hurt', { amount });
    if (p.hp === 0) {
      if (this.souls > 0) this.drop = { x: p.x, z: p.z, amount: this.souls };
      else this.drop = null;
      this.dismissPhantom(); this.buffered = null; this.souls = 0; this.locked = null; this.state = 'dead'; this.setAction('dead', 9); this.emit('death');
    }
    return true;
  }
  dismissPhantom() {
    for (const e of this.enemies) if (e.phantom) { e.hp = 0; e.action = 'dead'; e.timer = 0; }
    if (this.locked === 'echo') this.locked = null;
  }
  respawn(fromDeath = true) {
    Object.assign(this.player, { x: -1, z: 13, angle: Math.PI, hp: 100, stamina: 100, flasks: 3, blocking: false, invuln: 0, regenDelay: 0, moving: 0, comboIndex: -1, comboUntil: 0, attackClip: 'light' });
    this.setAction('idle', 0); this.resetEnemies(); this.locked = null; this.bossActive = false; this.buffered = null; this.state = 'playing';
    if (fromDeath) this.emit('toast', { text: '餘火重燃' });
  }
  interaction() {
    if (this.drop && distance(this.player, this.drop) < 2.2) return '拾回餘燼';
    if (distance(this.player, CAMP) < 2.8) return '於篝火休息';
    return '';
  }
}
