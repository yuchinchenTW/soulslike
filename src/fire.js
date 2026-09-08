import * as THREE from 'three';

// Fire is drawn as camera-facing sheets of scrolling noise shaped into a
// tongue of flame, with GPU-driven embers, a smoke sheet and a soft halo.
// Everything animates from one shared time uniform, so no per-frame CPU work.
const time = { value: 0 }, viewportHeight = { value: 720 };

const NOISE_GLSL = /* glsl */`
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * vnoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return v; }`;

const SHEET_VERTEX = /* glsl */`
uniform vec2 uScale;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 center = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  center.xy += vec2(position.x * uScale.x, (position.y + 0.5) * uScale.y);
  gl_Position = projectionMatrix * center;
}`;

const FLAME_FRAGMENT = /* glsl */`
uniform float uTime, uSeed;
varying vec2 vUv;
${NOISE_GLSL}
void main() {
  vec2 uv = vUv; float t = uTime * 1.7 + uSeed;
  float n = fbm(vec2(uv.x * 3.0 + uSeed, uv.y * 2.2 - t)) * 0.7 + fbm(vec2(uv.x * 6.5 - uSeed, uv.y * 4.5 - t * 1.6)) * 0.3;
  float width = mix(0.36, 0.05, pow(uv.y, 0.7));
  float dx = abs(uv.x - 0.5) + (n - 0.5) * 0.55 * (0.3 + uv.y);
  float shape = 1.0 - smoothstep(width * 0.45, width, dx);
  float height = smoothstep(0.0, 0.07, uv.y) * (1.0 - smoothstep(0.5, 1.0, uv.y + (n - 0.5) * 0.55));
  float intensity = shape * height * (0.65 + 0.7 * n);
  float heat = intensity * (1.35 - uv.y * 0.9);
  vec3 col = mix(vec3(0.55, 0.06, 0.0), vec3(1.0, 0.42, 0.06), smoothstep(0.08, 0.45, heat));
  col = mix(col, vec3(1.0, 0.92, 0.62), smoothstep(0.5, 0.95, heat));
  float alpha = smoothstep(0.04, 0.5, intensity);
  gl_FragColor = vec4(col * alpha * 0.95, alpha);
}`;

const SMOKE_FRAGMENT = /* glsl */`
uniform float uTime, uSeed;
varying vec2 vUv;
${NOISE_GLSL}
void main() {
  vec2 uv = vUv; float t = uTime * 0.45 + uSeed;
  float n = fbm(vec2(uv.x * 2.5 + uSeed, uv.y * 1.6 - t));
  float width = mix(0.2, 0.5, uv.y);
  float dx = abs(uv.x - 0.5) + (n - 0.5) * 0.5 * uv.y;
  float shape = 1.0 - smoothstep(width * 0.3, width, dx);
  float height = smoothstep(0.0, 0.25, uv.y) * (1.0 - smoothstep(0.35, 1.0, uv.y));
  float alpha = shape * height * smoothstep(0.35, 0.7, n) * 0.28;
  gl_FragColor = vec4(vec3(0.16, 0.15, 0.14), alpha);
}`;

const EMBER_VERTEX = /* glsl */`
attribute float aSeed;
uniform float uTime, uHeight, uSpread, uSize, uViewportHeight;
varying float vLife;
void main() {
  float speed = 0.28 + fract(aSeed * 7.13) * 0.35;
  float life = fract(uTime * speed + aSeed); vLife = life;
  float angle = aSeed * 6.2832, radius = fract(aSeed * 3.71) * uSpread;
  vec3 p = vec3(cos(angle) * radius, life * uHeight, sin(angle) * radius);
  p.x += sin(uTime * 2.1 + aSeed * 21.0) * 0.16 * life; p.z += cos(uTime * 1.7 + aSeed * 13.0) * 0.16 * life;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * uViewportHeight * (1.0 - life * 0.55) / max(-mv.z, 0.1);
}`;

const EMBER_FRAGMENT = /* glsl */`
varying float vLife;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.12, d) * (1.0 - smoothstep(0.55, 1.0, vLife));
  vec3 col = mix(vec3(1.0, 0.85, 0.45), vec3(1.0, 0.28, 0.04), smoothstep(0.1, 0.7, vLife));
  gl_FragColor = vec4(col * a, a);
}`;

let haloTexture;
function halo() {
  if (haloTexture) return haloTexture;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,170,80,0.55)'); grad.addColorStop(0.4, 'rgba(255,110,30,0.18)'); grad.addColorStop(1, 'rgba(255,80,20,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  haloTexture = new THREE.CanvasTexture(c); haloTexture.colorSpace = THREE.SRGBColorSpace;
  return haloTexture;
}

const sheetGeo = new THREE.PlaneGeometry(1, 1);
function sheet(fragment, scale, seed, additive) {
  const material = new THREE.ShaderMaterial({
    vertexShader: SHEET_VERTEX, fragmentShader: fragment, transparent: true, depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: { uTime: time, uSeed: { value: seed }, uScale: { value: new THREE.Vector2(...scale) } }
  });
  const m = new THREE.Mesh(sheetGeo, material); m.frustumCulled = false; m.castShadow = m.receiveShadow = false; return m;
}

export class Fire {
  constructor(size, { smoke = true, embers = 40 } = {}) {
    this.group = new THREE.Group();
    // Two flame sheets with different seeds read as volume from any angle.
    this.group.add(sheet(FLAME_FRAGMENT, [size * 1.15, size * 1.9], 0, true));
    const inner = sheet(FLAME_FRAGMENT, [size * .8, size * 1.45], 4.7, true); inner.position.y = size * .05; this.group.add(inner);
    if (smoke) { const s = sheet(SMOKE_FRAGMENT, [size * 1.6, size * 3.2], 2.3, false); s.position.y = size * .9; s.renderOrder = 1; this.group.add(s); }
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: halo(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    glow.scale.setScalar(size * 3.2); glow.position.y = size * .55; this.group.add(glow);
    const geo = new THREE.BufferGeometry(), seeds = new Float32Array(embers);
    for (let i = 0; i < embers; i++) seeds[i] = Math.random();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(embers * 3), 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    const points = new THREE.Points(geo, new THREE.ShaderMaterial({
      vertexShader: EMBER_VERTEX, fragmentShader: EMBER_FRAGMENT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: time, uViewportHeight: viewportHeight, uHeight: { value: size * 2.6 }, uSpread: { value: size * .3 }, uSize: { value: size * .014 } }
    }));
    points.frustumCulled = false; this.group.add(points);
  }
}

export function updateFires(elapsed, drawingBufferHeight) { time.value = elapsed; viewportHeight.value = drawingBufferHeight; }
