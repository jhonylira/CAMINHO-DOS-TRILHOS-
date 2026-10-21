import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Humanizacao em tempo real (instancing = 1 chamada de desenho para N copias).
 * - Arvores: substituem visualmente as esferas-proxy do R07 mantendo CENTRO, RAIO E ALTURA da copa
 *   lidos do proprio modelo (semantic.json). Especie: nao confirmada (sem cor de especie inventada).
 * - Pessoas: pontos aleatorios sobre passeios do modelo. ILUSTRATIVO, nao representa fluxo ou contagem.
 */
function rng(seed: number) { return () => ((seed = (seed * 16807) % 2147483647) / 2147483647); }

function canopyGeometry(seed: number) {
  const r = rng(seed);
  const parts: THREE.BufferGeometry[] = [];
  const blobs = [[0, 0, 0, 0.72], ...Array.from({ length: 7 }, () => {
    const a = r() * Math.PI * 2, e = (r() - 0.35) * 0.9, d = 0.42 + r() * 0.12;
    return [Math.cos(a) * d * Math.cos(e), Math.sin(e) * d * 0.9, Math.sin(a) * d * Math.cos(e), 0.38 + r() * 0.16];
  })];
  for (const [x, y, z, s] of blobs) {
    const g = new THREE.IcosahedronGeometry(s, 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(p, i);
      const n = 1 + (Math.sin(v.x * 9 + seed) * Math.cos(v.y * 11) * Math.sin(v.z * 7)) * 0.12;
      v.multiplyScalar(n); p.setXYZ(i, v.x + x, v.y + y, v.z + z);
    }
    parts.push(g);
  }
  const geo = mergeVertices(mergeGeometries(parts.map((g) => { g.deleteAttribute('uv'); g.deleteAttribute('normal'); return g; }))!, 1e-4);
  // normaliza para caber exatamente na esfera unitaria (copa CAD = escala rx, h/2, ry)
  geo.computeBoundingBox();
  const bb = geo.boundingBox!; const c = bb.getCenter(new THREE.Vector3()); const s = bb.getSize(new THREE.Vector3());
  geo.translate(-c.x, -c.y, -c.z); geo.scale(2 / s.x, 2 / s.y, 2 / s.z);
  geo.computeVertexNormals();
  // oclusao falsa: base da copa mais escura (cor por vertice)
  const p = geo.attributes.position; const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const k = 0.55 + 0.45 * (p.getY(i) * 0.5 + 0.5); col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k; }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

export interface TreeData { x: number; y: number; rx: number; ry: number; zmin: number; zmax: number }

export function buildTrees(trees: TreeData[]) {
  const group = new THREE.Group(); group.name = 'arvores_humanizadas';
  const variants = [canopyGeometry(3), canopyGeometry(11), canopyGeometry(29)];
  const leaf = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.88, metalness: 0 });
  const bark = new THREE.MeshStandardMaterial({ color: 0x5a4636, roughness: 0.95 });
  const trunkGeo = new THREE.CylinderGeometry(0.09, 0.15, 1, 7); trunkGeo.translate(0, 0.5, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, bark, trees.length);
  trunks.castShadow = true; trunks.receiveShadow = true;
  const byVar: TreeData[][] = [[], [], []];
  trees.forEach((t, i) => byVar[i % 3].push(t));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), r = rng(5);
  const baseCols = [new THREE.Color(0x3f6b2e), new THREE.Color(0x4d7a35), new THREE.Color(0x56803a)];
  trees.forEach((t, i) => {
    const h = Math.max(t.zmin + (t.zmax - t.zmin) * 0.35, 0.5);
    m.compose(new THREE.Vector3(t.x, 0.1, -t.y), q, new THREE.Vector3(1, h, 1));
    trunks.setMatrixAt(i, m);
  });
  group.add(trunks);
  byVar.forEach((list, vi) => {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(variants[vi], leaf, list.length);
    im.castShadow = true; im.receiveShadow = true;
    list.forEach((t, i) => {
      const cy = (t.zmin + t.zmax) / 2, hy = (t.zmax - t.zmin) / 2;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 6.283);
      m.compose(new THREE.Vector3(t.x, cy, -t.y), q, new THREE.Vector3(t.rx, hy, t.ry));
      im.setMatrixAt(i, m);
      const c = baseCols[Math.floor(r() * 3)].clone().offsetHSL((r() - 0.5) * 0.02, 0, (r() - 0.5) * 0.06);
      im.setColorAt(i, c);
    });
    group.add(im);
  });
  return group;
}

export interface PersonData { x: number; y: number; z: number; rot: number; kind: number }

export function buildPeople(people: PersonData[]) {
  const group = new THREE.Group(); group.name = 'pessoas_ilustrativas';
  // corpo estilizado (tronco + pernas) e cabeca: escala humana ~1,70 m
  const body = mergeGeometries([
    new THREE.CapsuleGeometry(0.17, 0.62, 3, 8).translate(0, 1.13, 0),
    new THREE.CapsuleGeometry(0.075, 0.72, 3, 6).translate(-0.08, 0.43, 0),
    new THREE.CapsuleGeometry(0.075, 0.72, 3, 6).translate(0.08, 0.43, 0),
  ])!;
  const head = new THREE.SphereGeometry(0.11, 10, 8).translate(0, 1.6, 0);
  const mb = new THREE.MeshStandardMaterial({ roughness: 0.8 });
  const mh = new THREE.MeshStandardMaterial({ roughness: 0.7 });
  const ib = new THREE.InstancedMesh(body, mb, people.length);
  const ih = new THREE.InstancedMesh(head, mh, people.length);
  ib.castShadow = ih.castShadow = true;
  const clothes = [0x2f4a6d, 0xd9d4c7, 0x8a3b2e, 0x3b3b3b, 0x6f8a5a, 0xc9a24a, 0x5b6f86, 0xb5654a];
  const skins = [0xe0b48f, 0xc68c62, 0x8d5a3b, 0xf0cfb0, 0x6b4430];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), r = rng(17);
  people.forEach((p, i) => {
    const s = 0.94 + r() * 0.12;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rot);
    m.compose(new THREE.Vector3(p.x, p.z, -p.y), q, new THREE.Vector3(s, s, s));
    ib.setMatrixAt(i, m); ih.setMatrixAt(i, m);
    ib.setColorAt(i, new THREE.Color(clothes[Math.floor(r() * clothes.length)]));
    ih.setColorAt(i, new THREE.Color(skins[Math.floor(r() * skins.length)]));
  });
  group.add(ib, ih);
  return group;
}
