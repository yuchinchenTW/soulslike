import * as THREE from 'three';

// The robe is bound to the imported pelvis and leg bones, so it follows the
// same motion as the armor. Split panels leave room for lunges and turns.
export function addRegalia(root, model, height, minY) {
  root.updateMatrixWorld(true);
  const bones=['Hips','LeftUpLeg','RightUpLeg'].map(n=>model.getObjectByName(`mixamorig${n}`));
  const positions=[],uv=[],indices=[],skinIndices=[],weights=[],colors=[];
  const rows=16,cols=64,cloth=new THREE.Color(0x24202e),thread=new THREE.Color(0x9a8050);
  for(let j=0;j<=rows;j++)for(let i=0;i<=cols;i++){
    const t=j/rows,a=i/cols*Math.PI*2;
    const radius=height*(.125+.12*t)*(1+Math.sin(a*14)*.065*t);
    positions.push(Math.sin(a)*radius,minY+height*(.585-.505*t),Math.cos(a)*radius*.8);
    uv.push(i/cols,t);
    const leg=Math.sin(a)>0?1:2,weight=t*.55;
    skinIndices.push(0,leg,0,0);weights.push(1-weight,weight,0,0);
    const c=(j>=rows-1||i%16===0)?thread:cloth;colors.push(c.r,c.g,c.b);
    if(j<rows&&i<cols&&!(j>3&&(i<3||i>61))){const n=j*(cols+1)+i;indices.push(n,n+cols+1,n+1,n+1,n+cols+1,n+cols+2);}
  }
  const geometry=new THREE.BufferGeometry();geometry.setIndex(indices);
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(new Float32Array(positions.length),3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(skinIndices,4));
  geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));geometry.computeVertexNormals();
  const robe=new THREE.SkinnedMesh(geometry,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.94,metalness:.12,side:THREE.DoubleSide}));
  root.add(robe);root.updateMatrixWorld(true);robe.bind(new THREE.Skeleton(bones));robe.frustumCulled=false;robe.castShadow=true;robe.receiveShadow=true;
  const head=model.getObjectByName('mixamorigHead'),crown=new THREE.Group();root.add(crown);
  const gold=new THREE.MeshStandardMaterial({color:0xb19a66,metalness:.75,roughness:.43});
  const ring=new THREE.Mesh(new THREE.TorusGeometry(height*.071,height*.009,8,48),gold);ring.rotation.x=Math.PI/2;ring.position.y=minY+height*.972;crown.add(ring);
  for(let i=0;i<7;i++){
    const a=i/7*Math.PI*2,h=height*(i%2?.11:.16);
    const point=new THREE.Mesh(new THREE.ConeGeometry(height*.015,h,5),gold);
    point.position.set(Math.sin(a)*height*.073,minY+height*.973+h*.46,Math.cos(a)*height*.073);crown.add(point);
  }
  // Preserve the crown's rest transform when moving it under the head bone.
  root.updateMatrixWorld(true);head.attach(crown);
  return robe;
}
