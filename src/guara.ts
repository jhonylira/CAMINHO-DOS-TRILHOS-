import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Silhueta de voo: pescoço estendido, bico recurvado, rémiges escuras e pernas para trás. */
export function buildGuara() {
 const bird = new THREE.Group();
 bird.name = 'Guará-vermelho';
 const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .76, side: THREE.DoubleSide });
 const red = 0xe83b27, shadow = 0xb9231b, coral = 0xf34c30, dark = 0x262024;
 function part(parent: THREE.Group, geometry: THREE.BufferGeometry, color: number, position: number[], scale=[1,1,1], rotation=[0,0,0]) {
  const m = new THREE.Mesh(geometry, material);m.position.fromArray(position);m.scale.fromArray(scale);m.rotation.set(rotation[0],rotation[1],rotation[2]);
  m.updateMatrix();let g=geometry.index?geometry.toNonIndexed():geometry.clone();g.applyMatrix4(m.matrix);g.deleteAttribute('uv');
  const c=new THREE.Color(color),colors=new Float32Array(g.getAttribute('position').count*3);
  for(let i=0;i<colors.length;i+=3){colors[i]=c.r;colors[i+1]=c.g;colors[i+2]=c.b;}g.setAttribute('color',new THREE.BufferAttribute(colors,3));
  const piece=new THREE.Mesh(g,material);parent.add(piece);geometry.dispose();
 }
 const sphere=()=>new THREE.SphereGeometry(1,14,9);
 function tube(parent:THREE.Group, points:THREE.Vector3[],radius:number,color:number){part(parent,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),12,radius,6,false),color,[0,0,0]);}
 part(bird,sphere(),red,[0,0,0],[.21,.23,.56]);
 part(bird,sphere(),shadow,[0,-.09,.14],[.18,.15,.37]);
 tube(bird,[new THREE.Vector3(0,.06,-.36),new THREE.Vector3(0,.17,-.66),new THREE.Vector3(0,.32,-.87),new THREE.Vector3(0,.32,-1.02)],.085,red);
 part(bird,sphere(),coral,[0,.32,-1.04],[.115,.115,.17]);
 // Tapered curved beak: 15 rings × 7 points, no texture or external asset.
 const curve=new THREE.QuadraticBezierCurve3(new THREE.Vector3(0,.32,-1.16),new THREE.Vector3(0,.3,-1.59),new THREE.Vector3(0,.04,-1.66));
 const vertices:number[]=[],indices:number[]=[];
 for(let i=0;i<=14;i++){const p=curve.getPoint(i/14),r=.038*(1-i/14)+.002;for(let j=0;j<=6;j++){const a=j/6*Math.PI*2;vertices.push(p.x+Math.cos(a)*r,p.y+Math.sin(a)*r,p.z);if(i<14&&j<6){const n=i*7+j;indices.push(n,n+7,n+1,n+1,n+7,n+8);}}}
 const beak=new THREE.BufferGeometry();beak.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));beak.setIndex(indices);beak.computeVertexNormals();part(bird,beak,dark,[0,0,0]);
 for(const side of [-1,1]){
  part(bird,sphere(),dark,[side*.104,.35,-1.075],[.019,.019,.019]);
  tube(bird,[new THREE.Vector3(side*.075,-.12,.34),new THREE.Vector3(side*.085,-.13,.76),new THREE.Vector3(side*.09,-.08,1.08)],.013,shadow);
  for(let i=-1;i<=1;i++)tube(bird,[new THREE.Vector3(side*.09,-.08,1.02),new THREE.Vector3(side*.09+i*.025,-.09,1.17)],.007,dark);
 }
 function feather(parent:THREE.Group,x:number,z:number,width:number,length:number,angle:number,color:number){
  const s=new THREE.Shape();s.moveTo(-width/2,0);s.quadraticCurveTo(-width*.65,length*.55,0,length);s.quadraticCurveTo(width*.65,length*.55,width/2,0);s.closePath();
  part(parent,new THREE.ExtrudeGeometry(s,{depth:.009,bevelEnabled:false,curveSegments:4,steps:1}),color,[x,.012,z],[1,1,1],[Math.PI/2,0,angle]);
 }
 for(let i=-2;i<=2;i++)feather(bird,i*.04,.35,.09,.37,-i*.07,i%2?shadow:red);
 const wings:THREE.Group[]=[];
 for(const side of [-1,1]){
  const wing=new THREE.Group();wing.position.set(side*.12,.08,-.12);bird.add(wing);wings.push(wing);
  part(wing,sphere(),red,[side*.37,0,.04],[.5,.065,.25],[0,-side*.13,0]);
  for(let i=0;i<7;i++)feather(wing,side*(.18+i*.105),.02,.14,.43-i*.018,side*(.05+i*.035),i%2?coral:red);
  for(let i=0;i<7;i++){
   const x=side*(.79+i*.065),z=.015+i*.025,angle=-side*(.36+i*.11);
   feather(wing,x,z,.13,.43+i*.016,angle,i>3?shadow:red);
   feather(wing,x+side*.025,z+.30,.105,.19,angle,dark);
  }
 }
 function merge(group:THREE.Group){const meshes=group.children.filter(o=>o instanceof THREE.Mesh) as THREE.Mesh[];const geometry=mergeGeometries(meshes.map(m=>m.geometry),false);for(const m of meshes){group.remove(m);m.geometry.dispose();}const m=new THREE.Mesh(geometry,material);m.castShadow=true;group.add(m);}
 wings.forEach(merge);merge(bird);bird.scale.setScalar(1.25);
 return {bird,wings};
}
