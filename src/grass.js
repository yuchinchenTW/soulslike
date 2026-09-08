import * as THREE from 'three';

// Dry courtyard grass: instanced clumps of two crossed alpha-cut cards with a
// painted blade texture, per-clump tint, and a vertex-shader wind sway that
// only bends the upper part of each blade.
const wind = { value: 0 };

function bladeTexture() {
  const size = 256, c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); g.clearRect(0, 0, size, size);
  let seed = 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 26; i++) {
    const x0 = 40 + rnd() * 176, lean = (rnd() - .5) * 120, h = 120 + rnd() * 130, w = 5 + rnd() * 7;
    const tipX = x0 + lean, tipY = size - h, ctrlX = x0 + lean * .35, ctrlY = size - h * .55;
    const shade = .75 + rnd() * .5;
    const grad = g.createLinearGradient(0, size, 0, tipY);
    grad.addColorStop(0, `rgb(${Math.round(58 * shade)},${Math.round(62 * shade)},${Math.round(34 * shade)})`);
    grad.addColorStop(.6, `rgb(${Math.round(118 * shade)},${Math.round(122 * shade)},${Math.round(62 * shade)})`);
    grad.addColorStop(1, `rgb(${Math.round(168 * shade)},${Math.round(156 * shade)},${Math.round(92 * shade)})`);
    g.fillStyle = grad; g.beginPath();
    g.moveTo(x0 - w, size); g.quadraticCurveTo(ctrlX - w * .5, ctrlY, tipX, tipY); g.quadraticCurveTo(ctrlX + w * .5, ctrlY, x0 + w, size); g.closePath(); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.generateMipmaps = true; return t;
}

function clumpGeometry() {
  const a = new THREE.PlaneGeometry(.6, .5, 1, 2), b = a.clone();
  a.translate(0, .25, 0); b.translate(0, .25, 0); b.rotateY(Math.PI / 2);
  const p = [a, b].map(x => x.toNonIndexed());
  const geometry = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const arrays = p.map(x => x.attributes[name].array), size = p[0].attributes[name].itemSize;
    const merged = new Float32Array(arrays[0].length + arrays[1].length); merged.set(arrays[0]); merged.set(arrays[1], arrays[0].length);
    geometry.setAttribute(name, new THREE.BufferAttribute(merged, size));
  }
  geometry.computeBoundingSphere(); return geometry;
}

export function createGrass(random, count, place) {
  const material = new THREE.MeshStandardMaterial({ map: bladeTexture(), alphaTest: .45, side: THREE.DoubleSide, roughness: 1, metalness: 0, color: 0xbfb89a });
  material.onBeforeCompile = shader => {
    shader.uniforms.uWind = wind;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 clumpOrigin = vec3(0.0);
        #ifdef USE_INSTANCING
          clumpOrigin = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        #endif
        float bend = uv.y * uv.y;
        float gust = sin(uWind * 1.4 + clumpOrigin.x * .7 + clumpOrigin.z * .5) + .5 * sin(uWind * 2.9 + clumpOrigin.z * 1.3);
        transformed.x += gust * .07 * bend; transformed.z += cos(uWind * 1.1 + clumpOrigin.x * .9) * .04 * bend;`);
  };
  const grass = new THREE.InstancedMesh(clumpGeometry(), material, count);
  grass.castShadow = true; grass.receiveShadow = true;
  const temp = new THREE.Object3D(), color = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const [x, z] = place(i);
    temp.position.set(x, 0, z); temp.rotation.set(0, random() * Math.PI, 0);
    const s = .55 + random() * .9; temp.scale.set(s * (.8 + random() * .5), s, s * (.8 + random() * .5)); temp.updateMatrix(); grass.setMatrixAt(i, temp.matrix);
    color.setHSL(.13 + random() * .05, .25 + random() * .2, .32 + random() * .18); grass.setColorAt(i, color);
  }
  return grass;
}

export function updateGrass(elapsed) { wind.value = elapsed; }
