import * as THREE from 'three';
import { RGBELoader } from '../node_modules/three/examples/jsm/loaders/RGBELoader.js';

// The courtyard is assembled from scaled primitives whose UVs stretch with the
// mesh, so PBR maps are projected in world space along the three axes instead.
// Face normals pick the projection; blending hides the seams between them.
const TRIPLANAR_GLSL = /* glsl */`
uniform float triScale;
varying vec3 vTriPos;
varying vec3 vTriNormal;
vec3 triWeights(vec3 n) { vec3 w = pow(abs(n), vec3(4.0)); return w / (w.x + w.y + w.z); }
vec2 triUvX(vec3 s) { vec2 uv = vTriPos.zy * triScale; uv.x *= s.x; return uv; }
vec2 triUvY(vec3 s) { vec2 uv = vTriPos.xz * triScale; uv.x *= s.y; return uv; }
vec2 triUvZ(vec3 s) { vec2 uv = vTriPos.xy * triScale; uv.x *= -s.z; return uv; }
vec4 triSample(sampler2D map, vec3 w, vec3 s) {
  return texture2D(map, triUvX(s)) * w.x + texture2D(map, triUvY(s)) * w.y + texture2D(map, triUvZ(s)) * w.z;
}`;

const VERTEX_GLSL = /* glsl */`
#include <begin_vertex>
vec4 triPos = vec4(transformed, 1.0); vec3 triNormal = objectNormal;
#ifdef USE_INSTANCING
  triPos = instanceMatrix * triPos; triNormal = mat3(instanceMatrix) * triNormal;
#endif
vTriPos = (modelMatrix * triPos).xyz; vTriNormal = normalize(mat3(modelMatrix) * triNormal);`;

const MAP_GLSL = /* glsl */`
#ifdef USE_MAP
  diffuseColor *= triSample(map, triWeights(vTriNormal), sign(vTriNormal));
#endif`;

const ROUGHNESS_GLSL = /* glsl */`
float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
  roughnessFactor *= triSample(roughnessMap, triWeights(vTriNormal), sign(vTriNormal)).g;
#endif`;

const AO_GLSL = /* glsl */`
#ifdef USE_AOMAP
  float ambientOcclusion = (triSample(aoMap, triWeights(vTriNormal), sign(vTriNormal)).r - 1.0) * aoMapIntensity + 1.0;
  reflectedLight.indirectDiffuse *= ambientOcclusion;
  #if defined( USE_ENVMAP ) && defined( STANDARD )
    float dotNV = saturate(dot(geometryNormal, geometryViewDir));
    reflectedLight.indirectSpecular *= computeSpecularOcclusion(dotNV, ambientOcclusion, material.roughness);
  #endif
#endif`;

// Whiteout blend of the three tangent-space samples, reoriented per axis.
const NORMAL_GLSL = /* glsl */`
#ifdef USE_NORMALMAP
{
  vec3 wn = normalize(vTriNormal), w = triWeights(wn), s = sign(wn);
  vec3 tx = texture2D(normalMap, triUvX(s)).xyz * 2.0 - 1.0;
  vec3 ty = texture2D(normalMap, triUvY(s)).xyz * 2.0 - 1.0;
  vec3 tz = texture2D(normalMap, triUvZ(s)).xyz * 2.0 - 1.0;
  tx.xy *= normalScale; ty.xy *= normalScale; tz.xy *= normalScale;
  tx.x *= s.x; ty.x *= s.y; tz.x *= -s.z;
  tx = vec3(tx.xy + wn.zy, abs(tx.z) * wn.x);
  ty = vec3(ty.xy + wn.xz, abs(ty.z) * wn.y);
  tz = vec3(tz.xy + wn.xy, abs(tz.z) * wn.z);
  vec3 worldNormal = normalize(tx.zyx * w.x + ty.xzy * w.y + tz.xyz * w.z);
  normal = normalize((viewMatrix * vec4(worldNormal, 0.0)).xyz);
}
#endif`;

export function triplanar(material, scale = 1) {
  material.userData.triScale = { value: scale };
  material.onBeforeCompile = shader => {
    shader.uniforms.triScale = material.userData.triScale;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTriPos; varying vec3 vTriNormal;')
      .replace('#include <begin_vertex>', VERTEX_GLSL);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + TRIPLANAR_GLSL)
      .replace('#include <map_fragment>', MAP_GLSL)
      .replace('#include <roughnessmap_fragment>', ROUGHNESS_GLSL)
      .replace('#include <aomap_fragment>', AO_GLSL)
      .replace('#include <normal_fragment_maps>', NORMAL_GLSL);
  };
  material.customProgramCacheKey = () => 'triplanar';
  return material;
}

const textureUrl = name => new URL(`../assets/textures/${name}_1k.jpg`, import.meta.url).href;

// Poly Haven CC0 sets: diffuse, OpenGL normal and packed AO/roughness/metal.
export async function loadSurfaces(renderer, sets) {
  const loader = new THREE.TextureLoader(), anisotropy = renderer.capabilities.getMaxAnisotropy();
  const load = async (name, srgb) => {
    const t = await loader.loadAsync(textureUrl(name));
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = anisotropy;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  await Promise.all(Object.entries(sets).map(async ([name, materials]) => {
    const [map, normalMap, arm] = await Promise.all([load(`${name}_diff`, true), load(`${name}_nor_gl`), load(`${name}_arm`)]);
    arm.channel = 0;
    for (const m of materials) { Object.assign(m, { map, normalMap, roughnessMap: arm, aoMap: arm }); m.needsUpdate = true; }
  }));
}

// Dusk sky lights and reflects the court; the tonemapped horizon sets the fog.
export async function loadSky(renderer, scene, { rotation = 0, blur = .04, background = 1, environment = 1 } = {}) {
  const hdr = await new RGBELoader().loadAsync(new URL('../assets/sky/qwantani_dusk_2_puresky_1k.hdr', import.meta.url).href);
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  const pmrem = new THREE.PMREMGenerator(renderer), target = pmrem.fromEquirectangular(hdr); pmrem.dispose();
  scene.environment?.dispose?.();
  scene.environment = target.texture; scene.background = hdr;
  scene.environmentRotation.set(0, rotation, 0); scene.backgroundRotation.set(0, rotation, 0);
  scene.backgroundBlurriness = blur; scene.backgroundIntensity = background; scene.environmentIntensity = environment;
  return hdr;
}
