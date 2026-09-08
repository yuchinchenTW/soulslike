import * as THREE from 'three';
import { mergeGeometries } from '../node_modules/three/examples/jsm/utils/BufferGeometryUtils.js';

// Bake fixed architecture into material batches, with spatial cells to retain
// frustum culling. Animated cloth, fire and existing instances stay separate.
export function batchArchitecture(scene, animated) {
  scene.updateMatrixWorld(true);
  const groups=new Map(),center=new THREE.Vector3();
  scene.traverse(o=>{
    if(!o.isMesh||o.isInstancedMesh||o.isSkinnedMesh||animated.has(o)||Array.isArray(o.material)||o.material.transparent)return;
    center.setFromMatrixPosition(o.matrixWorld);
    const key=`${o.material.id}/${o.castShadow}/${o.receiveShadow}/${Math.floor(center.x/18)}/${Math.floor(center.z/18)}`;
    if(!groups.has(key))groups.set(key,[]);groups.get(key).push(o);
  });
  for(const meshes of groups.values()){
    if(meshes.length<2)continue;
    const geometries=meshes.map(m=>{
      const g=m.geometry.index?m.geometry.toNonIndexed():m.geometry.clone();
      g.applyMatrix4(m.matrixWorld);g.clearGroups();return g;
    });
    const geometry=mergeGeometries(geometries);
    for(const g of geometries)g.dispose();
    if(!geometry)throw new Error('Static architecture geometry attributes do not match');
    const first=meshes[0],batch=new THREE.Mesh(geometry,first.material);
    batch.castShadow=first.castShadow;batch.receiveShadow=first.receiveShadow;batch.matrixAutoUpdate=false;
    geometry.computeBoundingSphere();scene.add(batch);
    for(const m of meshes)m.removeFromParent();
  }
}
