import * as THREE from 'three';
import { GLTFLoader } from '../node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { applyWind } from './grass.js';

// Scanned CC0 props from Poly Haven: rubble rocks, the bonfire's stone ring and
// tufts of dry grass. Each model is loaded once and instanced across the court.
const MODELS = ['rock_09', 'rock_07', 'stone_fire_pit', 'grass_medium_02'];
const modelUrl = name => new URL(`../assets/models/${name}/${name}.gltf`, import.meta.url).href;

export async function loadProps(renderer) {
  const loader = new GLTFLoader(), anisotropy = renderer.capabilities.getMaxAnisotropy();
  const scenes = await Promise.all(MODELS.map(n => loader.loadAsync(modelUrl(n))));
  const props = {};
  MODELS.forEach((name, i) => {
    const meshes = [];
    scenes[i].scene.updateMatrixWorld(true);
    scenes[i].scene.traverse(o => {
      if (!o.isMesh) return;
      const geometry = o.geometry.clone(); geometry.applyMatrix4(o.matrixWorld); geometry.computeBoundingBox();
      for (const map of [o.material.map, o.material.normalMap, o.material.roughnessMap, o.material.aoMap]) if (map) map.anisotropy = anisotropy;
      meshes.push({ geometry, material: o.material });
    });
    props[name] = meshes;
  });
  return props;
}

function instanced(geometry, material, count, place, random) {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.castShadow = true; mesh.receiveShadow = true;
  const temp = new THREE.Object3D();
  for (let i = 0; i < count; i++) { place(temp, i, random); temp.updateMatrix(); mesh.setMatrixAt(i, temp.matrix); }
  mesh.computeBoundingSphere(); return mesh;
}

// Stones are scanned at real size (a few centimetres); grow them into rubble
// and sink them slightly so odd undersides never float above the paving.
export function createRubble(props, random, count = 48) {
  const group = new THREE.Group();
  for (const [name, share] of [['rock_09', .55], ['rock_07', .45]]) {
    const { geometry, material } = props[name][0], box = geometry.boundingBox, size = new THREE.Vector3(); box.getSize(size);
    const stone = material.clone(); stone.color.multiplyScalar(.62).lerp(new THREE.Color(0x8d918c), .45); stone.roughness = 1; stone.envMapIntensity = .4;
    const n = Math.round(count * share), base = -box.min.y;
    group.add(instanced(geometry, stone, n, (t, i, rnd) => {
      const s = (.34 + rnd() * .78) / Math.max(size.x, size.z);
      t.position.set((rnd() > .5 ? 1 : -1) * (10 + rnd() * 6.5), base * s - .03 * s * size.y, rnd() * 39 - 19.5);
      t.rotation.set((rnd() - .5) * .3, rnd() * Math.PI * 2, (rnd() - .5) * .3); t.scale.setScalar(s);
    }, random));
  }
  return group;
}

export function createFirePit(props, x, z, diameter = 1.7) {
  const { geometry, material } = props.stone_fire_pit[0], box = geometry.boundingBox;
  const s = diameter / (box.max.x - box.min.x);
  const pit = new THREE.Mesh(geometry, material.clone()); pit.material.roughness = 1; pit.material.envMapIntensity = .3;
  pit.material.color.multiplyScalar(.58).lerp(new THREE.Color(0x5e5b56), .35);
  pit.castShadow = true; pit.receiveShadow = true;
  pit.position.set(x, -box.min.y * s - .12 * s, z); pit.scale.setScalar(s); pit.rotation.y = .7;
  return pit;
}

// Dry tufts along the arcades: five scanned variants, alpha-cut for correct
// depth, tinted toward straw and swaying in the shared wind.
export function createTufts(props, random, count = 520, place) {
  const group = new THREE.Group(), variants = props.grass_medium_02;
  const material = variants[0].material.clone();
  material.transparent = false; material.alphaTest = .4; material.depthWrite = true; material.side = THREE.DoubleSide;
  material.color.set(0xf0e4b8); material.roughness = 1; material.envMapIntensity = .5;
  applyWind(material, .05, .25);
  const per = Math.ceil(count / variants.length);
  for (const variant of variants) {
    const box = variant.geometry.boundingBox;
    group.add(instanced(variant.geometry, material, per, (t, i, rnd) => {
      const [x, z] = place(); const s = 2 + rnd() * 1.8;
      t.position.set(x, -box.min.y * s, z); t.rotation.set(0, rnd() * Math.PI * 2, 0); t.scale.set(s, s * (.85 + rnd() * .5), s);
    }, random));
  }
  return group;
}
