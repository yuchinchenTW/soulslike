import * as THREE from 'three';
import { CAMP, PILLARS, clamp, angleDelta } from './game.js';
import { createKnight, animateKnight } from './character.js';
import { RoomEnvironment } from '../node_modules/three/examples/jsm/environments/RoomEnvironment.js';
import { attackMotion } from './motion.js';
import { activeBossHands } from './pontiff.js';

let seed = 381;
function random() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
const stone = new THREE.MeshStandardMaterial({ color: 0x555d57, roughness: .96 });
const trim = new THREE.MeshStandardMaterial({ color: 0x77796a, roughness: .87 });
const dark = new THREE.MeshStandardMaterial({ color: 0x222c29, roughness: .88 });
const gold = new THREE.MeshStandardMaterial({ color: 0x9b8350, metalness: .65, roughness: .42 });
const blackMetal = new THREE.MeshStandardMaterial({ color: 0x343e3c, metalness: .7, roughness: .44 });
const swordMat = new THREE.MeshStandardMaterial({ color: 0xb7c5bf, metalness: .88, roughness: .25 });
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
function mesh(geometry, material, parent, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, material); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}
function box(parent, material, x, y, z, sx, sy, sz) { const m = mesh(boxGeo, material, parent, x, y, z); m.scale.set(sx, sy, sz); return m; }
function cylinder(parent, material, x, y, z, top, bottom, height, sides = 12) { return mesh(new THREE.CylinderGeometry(top, bottom, height, sides), material, parent, x, y, z); }
function ring(parent, material, x, y, z, radius, tube, arc = Math.PI * 2) { const m = mesh(new THREE.TorusGeometry(radius, tube, 5, 64, arc), material, parent, x, y, z); m.rotation.x = Math.PI / 2; return m; }

export class World {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace; this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.12;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x718780); this.scene.fog = new THREE.FogExp2(0x718780, .025);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.environmentTarget = pmrem.fromScene(room, .04);
    this.scene.environment = this.environmentTarget.texture;
    this.scene.environmentIntensity = .65;
    room.dispose(); pmrem.dispose();
    this.camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, .1, 180);
    this.yaw = 0; this.pitch = .25; this.cameraDistance = 6; this.shake = 0;
    this.scene.add(new THREE.HemisphereLight(0xd0e3d4, 0x465044, 2.5));
    const fill = new THREE.DirectionalLight(0xbad1d4, 1.7); fill.position.set(12, 14, 18); this.scene.add(fill);
    const sun = new THREE.DirectionalLight(0xffe4b0, 3.1); sun.position.set(-19, 34, -27); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -28, right: 28, top: 29, bottom: -29, near: 1, far: 95 }); sun.shadow.bias = -.0004; sun.shadow.normalBias = .03; this.scene.add(sun);
    this.actors = new Map(); this.effects = []; this.fireParts = []; this.flags = [];
    this.buildEnvironment(); this.buildFire(); this.buildAtmosphere(); this.resize();
    this.dropMesh = new THREE.Group(); this.scene.add(this.dropMesh);
    const dropMat = new THREE.MeshBasicMaterial({ color: 0xa1d2bc, transparent: true, opacity: .65 });
    ring(this.dropMesh, dropMat, 0, .12, 0, .5, .025);
    this.dropBeam = cylinder(this.dropMesh, new THREE.MeshBasicMaterial({ color: 0x99bca5, transparent: true, opacity: .2, depthWrite: false }), 0, .65, 0, .035, .25, 1.3, 12);
    this.dropMesh.visible = false;
  }
  buildEnvironment() {
    box(this.scene, dark, 0, -.62, 0, 37, .8, 46);
    // Repeated paving is instanced: a complete court in one draw call.
    const tiles = new THREE.InstancedMesh(boxGeo, stone, 34 * 42);
    tiles.receiveShadow = true; const temp = new THREE.Object3D(), color = new THREE.Color();
    for (let iz = 0; iz < 42; iz++) for (let ix = 0; ix < 34; ix++) {
      const i = iz * 34 + ix; temp.position.set(ix - 16.5, -.14 + random() * .025, iz - 20.5); temp.scale.set(.968, .22, .966); temp.rotation.y = (random() - .5) * .012; temp.updateMatrix(); tiles.setMatrixAt(i, temp.matrix);
      color.setHSL(.15 + random() * .04, .035 + random() * .04, .22 + random() * .105); tiles.setColorAt(i, color);
    }
    this.scene.add(tiles);
    // Old processional path and inlaid ritual circle.
    for (const x of [-3.3, 3.3]) box(this.scene, trim, x, -.008, 0, .065, .024, 41);
    const inlay = new THREE.MeshStandardMaterial({ color: 0x998c63, metalness: .3, roughness: .8 });
    for (const r of [6.1, 6.3, 7.1]) ring(this.scene, inlay, 0, .015, -9, r, .025);
    for (let i = 0; i < 16; i++) {
      const a = i * Math.PI / 8;
      const m = box(this.scene, inlay, Math.sin(a) * 6.7, .01, -9 + Math.cos(a) * 6.7, .09, .015, .4); m.rotation.y = a;
    }
    ring(this.scene, dark, 0, .01, -9, 2.1, .055);
    for (const side of [-1, 1]) {
      box(this.scene, stone, side * 18.1, 1.4, 0, 1.8, 3, 45);
      box(this.scene, trim, side * 17.9, 3, 0, 2, .28, 45);
      for (const z of [-15, -5, 5, 15]) {
        this.pillar(side * 13, z);
        this.pillar(side * 18, z, 1.05);
        this.arch(side * 15.5, z, Math.PI / 2, 4.9, 7.1);
      }
      for (const z of [-10, 0, 10]) this.arch(side * 13, z, Math.PI / 2, 9.8, 7.1);
      for (let i = 0; i < 11; i++) box(this.scene, stone, side * 18, 3.7, -20 + i * 4, 1.8, 1.3, 1.45);
    }
    // The sealed chapel and its tall, pointed silhouette.
    for (const x of [-10.8, 10.8]) {
      box(this.scene, stone, x, 6, -22.7, 13, 12, 3);
      box(this.scene, trim, x, 11.8, -22.5, 13.4, .4, 3.4);
      for (const dx of [-3, 3]) {
        box(this.scene, dark, x + dx, 7.1, -21.15, 1.6, 4.4, .12);
        box(this.scene, trim, x + dx, 7.1, -21.02, .12, 4.5, .13);
        box(this.scene, trim, x + dx, 7, -21.01, 1.7, .13, .13);
      }
    }
    this.arch(0, -21.4, 0, 7.8, 8.2);
    for (const x of [-3.9, 3.9]) {
      box(this.scene, trim, x, 4.1, -21.4, .7, 8.2, .9);
      box(this.scene, trim, x, .3, -21.4, 1.1, .6, 1.2);
    }
    box(this.scene, dark, 0, 3.7, -22.2, 7, 7.5, .6);
    for (let x = -3; x <= 3; x += .5) box(this.scene, blackMetal, x, 3.65, -21.82, .07, 7.2, .1);
    for (const y of [1, 3, 5]) box(this.scene, blackMetal, 0, y, -21.7, 6.5, .12, .15);
    for (const x of [-5.2, 5.2]) { this.tower(x, -24, 16, 1.7); this.banner(x, -20.8); }
    box(this.scene, stone, 0, 11.8, -23, 7, 4, 2.4);
    const rose = ring(this.scene, trim, 0, 12.2, -21.7, 1.22, .16); rose.rotation.x = 0;
    for (let i = 0; i < 8; i++) { const spoke = box(this.scene, trim, 0, 12.2, -21.7, .08, 2.35, .16); spoke.rotation.z = i * Math.PI / 4; }
    for (const x of [-17, 17]) this.tower(x, -24.5, 18, 2.4);
    // Entrance parapet leaves the camera a clear view across the courtyard.
    for (const x of [-11.8, 11.8]) { box(this.scene, stone, x, 1.1, 21.5, 11, 2.4, 1.5); box(this.scene, trim, x, 2.3, 21.5, 11.2, .2, 1.8); }
    for (let i = 0; i < 19; i++) {
      const x = (i % 2 ? -1 : 1) * (25 + random() * 33), z = -25 - random() * 55;
      this.tower(x, z, 15 + random() * 24, 2.5 + random() * 3);
    }
    const rubble = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), stone, 160);
    rubble.castShadow = true; rubble.receiveShadow = true;
    for (let i = 0; i < 160; i++) {
      temp.position.set((random() > .5 ? 1 : -1) * (10 + random() * 6.5), .1, random() * 39 - 19.5);
      temp.rotation.set(random() * 3, random() * 6, random() * 3); const s = .1 + random() * .35; temp.scale.set(s * 1.8, s * .7, s); temp.updateMatrix(); rubble.setMatrixAt(i, temp.matrix);
    }
    this.scene.add(rubble);
    const grassGeo = new THREE.ConeGeometry(.065, .5, 3);
    const grass = new THREE.InstancedMesh(grassGeo, new THREE.MeshStandardMaterial({ color: 0x4c5840, roughness: 1 }), 1500);
    for (let i = 0; i < 1500; i++) {
      const x = (random() > .5 ? 1 : -1) * (8.5 + random() * 8);
      temp.position.set(x, .1, random() * 40 - 20); temp.rotation.set((random() - .5) * .5, random() * 6.3, (random() - .5) * .4); temp.scale.set(1, .4 + random() * 1.1, 1); temp.updateMatrix(); grass.setMatrixAt(i, temp.matrix);
    }
    this.scene.add(grass);
    for (const x of [-8, 8]) for (const z of [-18, 10]) this.brazier(x, z);
  }
  pillar(x, z, scale = 1) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(scale); this.scene.add(g);
    box(g, dark, 0, .18, 0, 2.1, .35, 2.1); box(g, trim, 0, .45, 0, 1.75, .2, 1.75);
    cylinder(g, stone, 0, 3.7, 0, .66, .76, 6.5, 8);
    for (const y of [.7, 6.5, 6.85]) box(g, trim, 0, y, 0, 1.7, .24, 1.7);
    for (const dx of [-.58, .58]) for (const dz of [-.58, .58]) cylinder(g, trim, dx, 3.6, dz, .12, .16, 5.7, 6);
    box(g, stone, 0, 7.35, 0, 1.5, .7, 1.5);
  }
  arch(x, z, rotation, width, spring) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotation; this.scene.add(g);
    const r = width / 2;
    for (let i = 0; i < 13; i++) {
      const a = (i + .5) / 13 * Math.PI;
      const m = box(g, i % 3 === 0 ? trim : stone, Math.cos(a) * r, spring + Math.sin(a) * r * .86, 0, width * .132, .66, .82); m.rotation.z = a + Math.PI / 2;
    }
  }
  tower(x, z, height, r) {
    cylinder(this.scene, stone, x, height / 2 - .5, z, r * .88, r, height, 8);
    cylinder(this.scene, trim, x, height - 1, z, r, r, .4, 8);
    cylinder(this.scene, dark, x, height + 1.4, z, 0, r * 1.22, 5, 8);
    cylinder(this.scene, gold, x, height + 4.3, z, .04, .07, 1.3, 5);
    if (Math.abs(x) < 20) for (const y of [height * .4, height * .7]) box(this.scene, dark, x, y, z + r * .92, .5, 2.8, .1);
  }
  banner(x, z) {
    const geometry = new THREE.PlaneGeometry(1.6, 5.7, 8, 16);
    const pos = geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) if (pos.getY(i) < -2.4) pos.setY(i, pos.getY(i) + random() * .6);
    const flag = mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x76613a, roughness: 1, side: THREE.DoubleSide }), this.scene, x, 6.5, z);
    flag.userData.base = Float32Array.from(pos.array); this.flags.push(flag);
    box(this.scene, gold, x, 9.5, z, 2.2, .08, .08);
    const emblem = box(this.scene, gold, x, 7, z + .04, .3, 1.4, .03); emblem.rotation.z = Math.PI / 4;
  }
  brazier(x, z) {
    cylinder(this.scene, dark, x, .3, z, .5, .65, .6, 8);
    cylinder(this.scene, blackMetal, x, 1, z, .16, .27, 1.3, 8);
    cylinder(this.scene, gold, x, 1.7, z, .48, .2, .4, 8);
    this.flame(x, 1.95, z, .55);
  }
  buildFire() {
    for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; const rock = mesh(new THREE.DodecahedronGeometry(.29), dark, this.scene, CAMP.x + Math.cos(a) * .72, .18, CAMP.z + Math.sin(a) * .72); rock.scale.y = .65; }
    for (let i = 0; i < 5; i++) { const log = cylinder(this.scene, dark, CAMP.x, .17 + i * .015, CAMP.z, .12, .14, 1.25, 6); log.rotation.z = Math.PI / 2; log.rotation.y = i * 2.2; }
    const sword = new THREE.Group(); sword.position.set(CAMP.x, .1, CAMP.z); sword.rotation.z = -.18; this.scene.add(sword);
    box(sword, swordMat, 0, .82, 0, .1, 1.65, .055); box(sword, gold, 0, 1.35, 0, .5, .08, .1); cylinder(sword, dark, 0, 1.55, 0, .05, .05, .35, 6);
    this.flame(CAMP.x, .3, CAMP.z, 1.2);
    this.campLight = new THREE.PointLight(0xff8c35, 26, 12, 2); this.campLight.position.set(CAMP.x, 1.6, CAMP.z); this.scene.add(this.campLight);
  }
  flame(x, y, z, size) {
    const g = new THREE.Group(); g.position.set(x, y, z); this.scene.add(g);
    for (let i = 0; i < 5; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: [0xff7331, 0xffb541, 0xffdc8c][i % 3], transparent: true, opacity: .72, depthWrite: false, blending: THREE.AdditiveBlending });
      const m = mesh(new THREE.OctahedronGeometry(1), mat, g, (random() - .5) * .27 * size, .35 * size, (random() - .5) * .27 * size);
      m.scale.set(.2 * size, (.4 + random() * .4) * size, .18 * size); m.castShadow = false;
      this.fireParts.push({ mesh: m, size, phase: random() * 6.28 });
    }
  }
  buildAtmosphere() {
    const geo = new THREE.BufferGeometry(), positions = new Float32Array(360 * 3);
    for (let i = 0; i < 360; i++) { positions[i * 3] = (random() - .5) * 38; positions[i * 3 + 1] = random() * 13; positions[i * 3 + 2] = (random() - .5) * 44; }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.ash = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xd8d1af, size: .035, transparent: true, opacity: .55, depthWrite: false })); this.scene.add(this.ash);
    const moon = mesh(new THREE.SphereGeometry(3.8, 24, 16), new THREE.MeshBasicMaterial({ color: 0xd9dfc3, fog: false }), this.scene, -30, 37, -95); moon.castShadow = false;
  }
  createActor(id, boss = false, player = false, phantom = false) {
    const rig = createKnight({ boss: boss || phantom, player, phantom });
    this.scene.add(rig.root); this.actors.set(id, rig);
    return rig;
  }
  syncActor(id, state, dt, time, player = false) {
    const rig = this.actors.get(id) || this.createActor(id, state.boss, player, state.phantom);
    animateKnight(rig, state, dt, time);
    this.updateSwordTrail(rig, state, dt);
  }
  updateSwordTrail(rig, state, dt) {
    const clock = attackMotion(state), hands = activeBossHands(state);
    for (const blade of rig.blades) {
      if (!blade.trail) {
        const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(10 * 6 * 3), 3)); geometry.setDrawRange(0, 0);
        blade.trail = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: blade.color, transparent: true, opacity: rig.boss ? .34 : .17, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
        blade.trail.frustumCulled = false; this.scene.add(blade.trail);
      }
      const active = state.hp > 0 && (hands.includes(blade.hand) || (clock && state.action !== 'roll' && state.timer >= clock.impact - .055 && state.timer < clock.activeEnd) || (state.action === 'swing' && state.timer < .24));
      for (const p of blade.trailPoints) p.age += dt;
      blade.trailPoints = blade.trailPoints.filter(p => p.age < .11);
      if (active && dt > 0) blade.trailPoints.push({ tip: blade.tip.getWorldPosition(new THREE.Vector3()), heel: blade.heel.getWorldPosition(new THREE.Vector3()), age: 0 });
      if (blade.trailPoints.length > 10) blade.trailPoints.shift();
      const positions = blade.trail.geometry.attributes.position; let n = 0;
      for (let i = 1; i < blade.trailPoints.length; i++) {
        const a = blade.trailPoints[i - 1], b = blade.trailPoints[i];
        for (const v of [a.heel, a.tip, b.tip, a.heel, b.tip, b.heel]) positions.setXYZ(n++, v.x, v.y, v.z);
      }
      positions.needsUpdate = true; blade.trail.geometry.setDrawRange(0, n); blade.trail.visible = n > 0;
    }
  }
  addEffect(type, e) {
    if (['hurt', 'hit', 'block', 'rage'].includes(type)) this.shake = type === 'hurt' ? .16 : .07;
    if (['summon','burst'].includes(type)) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(.85,1,80),new THREE.MeshBasicMaterial({color:0x9d7afa,transparent:true,opacity:.7,side:THREE.DoubleSide,depthWrite:false}));
      ring.rotation.x=-Math.PI/2;ring.position.set(e.x,.04,e.z);ring.scale.setScalar(type==='burst'?3.6:1.2);this.scene.add(ring);
      this.effects.push({mesh:ring,life:.6,max:.6});
    }
    if (['hit', 'block', 'heal', 'kill'].includes(type)) {
      for (let i = 0; i < (type === 'kill' ? 20 : 11); i++) {
        const mat = new THREE.MeshBasicMaterial({ color: type === 'heal' ? 0xffca72 : type === 'hit' ? 0xe7a074 : 0xf5de9e, transparent: true });
        const m = mesh(new THREE.OctahedronGeometry(.045), mat, this.scene, e.x + (random() - .5) * .5, .8 + random() * .8, e.z + (random() - .5) * .5); m.castShadow = false;
        this.effects.push({ mesh: m, life: .6, max: .6, velocity: new THREE.Vector3((random() - .5) * 4, 1 + random() * 3, (random() - .5) * 4) });
      }
    }
  }
  update(game, dt, elapsed, menu = false) {
    const animationDt = game.state !== 'paused' ? dt : 0;
    this.syncActor('player', game.player, animationDt, menu ? elapsed : game.time, true);
    for (const [id,rig] of this.actors) if(id!=='player'&&!game.enemies.some(e=>e.id===id)){rig.root.visible=false;for(const b of rig.blades){b.trailPoints=[];if(b.trail)b.trail.visible=false;}}
    for (const e of game.enemies) this.syncActor(e.id, e, animationDt, menu ? elapsed : game.time);
    for (const f of this.fireParts) {
      f.mesh.scale.y = f.size * (.6 + Math.sin(elapsed * 9 + f.phase) * .22);
      f.mesh.rotation.y = elapsed * 1.5 + f.phase; f.mesh.position.y = f.size * (.4 + Math.sin(elapsed * 4 + f.phase) * .08);
    }
    this.campLight.intensity = 25 + Math.sin(elapsed * 11) * 3 + Math.sin(elapsed * 7) * 2;
    for (const flag of this.flags) {
      const p = flag.geometry.attributes.position, base = flag.userData.base;
      for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(base[i * 3 + 1] * 2.2 + elapsed * 2 + flag.position.x) * .17 * (2.85 - base[i * 3 + 1]) / 5.7);
      p.needsUpdate = true;
    }
    const ap = this.ash.geometry.attributes.position;
    for (let i = 0; i < ap.count; i++) { ap.setY(i, (ap.getY(i) + dt * .15) % 13); ap.setX(i, ap.getX(i) + Math.sin(elapsed * .3 + i) * dt * .035); } ap.needsUpdate = true;
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const fx = this.effects[i]; fx.life -= dt; fx.mesh.material.opacity = Math.max(0, fx.life / fx.max) * .8;
      if (fx.velocity) { fx.mesh.position.addScaledVector(fx.velocity, dt); fx.velocity.y -= dt * 4; }
      if (fx.life <= 0) { this.scene.remove(fx.mesh); fx.mesh.geometry.dispose(); fx.mesh.material.dispose(); this.effects.splice(i, 1); }
    }
    this.dropMesh.visible = !!game.drop;
    if (game.drop) { this.dropMesh.position.set(game.drop.x, 0, game.drop.z); this.dropMesh.rotation.y = elapsed; this.dropBeam.scale.y = 1 + Math.sin(elapsed * 3) * .12; }
    if (menu) {
      this.camera.position.set(8.6 + Math.sin(elapsed * .08) * .7, 5.6, 20.3); this.camera.lookAt(-2.3, 2.7, -8);
    } else {
      const p = game.player, target = game.target;
      if (target) { const ideal = Math.atan2(p.x - target.x, p.z - target.z); this.yaw += angleDelta(ideal, this.yaw) * Math.min(1, dt * 4); }
      const focus = new THREE.Vector3(p.x, 1.5, p.z);
      const desired = new THREE.Vector3(p.x + Math.sin(this.yaw) * this.cameraDistance * Math.cos(this.pitch), 1.5 + Math.sin(this.pitch) * this.cameraDistance, p.z + Math.cos(this.yaw) * this.cameraDistance * Math.cos(this.pitch));
      desired.x = clamp(desired.x, -16.9, 16.9); desired.z = clamp(desired.z, -20.2, 20.2);
      // Shorten the camera arm when an architectural column lies between it and the player.
      for (const c of PILLARS) {
        const dx = desired.x - focus.x, dz = desired.z - focus.z, len2 = dx * dx + dz * dz;
        const t = clamp(((c.x - focus.x) * dx + (c.z - focus.z) * dz) / Math.max(len2, .001), 0, 1);
        if (Math.hypot(focus.x + dx * t - c.x, focus.z + dz * t - c.z) < 1.3 && t > .05) desired.lerp(focus, 1 - Math.max(.12, t - .22));
      }
      desired.y = Math.max(1.1, desired.y);
      this.camera.position.lerp(desired, Math.min(1, dt * 10));
      this.camera.lookAt(target ? new THREE.Vector3(p.x * .75 + target.x * .25, 1.65, p.z * .75 + target.z * .25) : focus);
      if (this.shake > 0) { this.camera.position.x += (random() - .5) * this.shake; this.camera.position.y += (random() - .5) * this.shake; this.shake = Math.max(0, this.shake - dt * .4); }
    }
    this.renderer.render(this.scene, this.camera);
  }
  project(actor, height) {
    const p = new THREE.Vector3(actor.x, height, actor.z).project(this.camera);
    return { x: (p.x * .5 + .5) * innerWidth, y: (-p.y * .5 + .5) * innerHeight, visible: p.z > -1 && p.z < 1 && Math.abs(p.x) < 1 && Math.abs(p.y) < 1 };
  }
  resize() { this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); this.renderer.setSize(innerWidth, innerHeight); }
}
