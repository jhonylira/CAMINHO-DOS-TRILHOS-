import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * HUMANIZACAO EM TEMPO REAL (v0.2)
 * ---------------------------------------------------------------------------
 * Instancing = 1 chamada de desenho para N copias (a placa de video desenha 70 arvores
 * com o custo de desenhar 1).
 *
 * ARVORES: mantem CENTRO, RAIOS (rx, ry) e ALTURAS (zmin, zmax) da copa lidos do R07
 *   (semantic.json). A copa agora e feita de ~260 "cartoes" de folhagem com recorte
 *   (alphaTest) + um nucleo solido escuro, tecnica classica de archviz em tempo real.
 *   Todos os cartoes ficam DENTRO do elipsoide CAD: a projecao da copa nao cresce
 *   (regra da faixa livre de 3 m do eixo ferroviario continua valendo).
 *   Especie: nao confirmada -> folhagem generica, sem atribuir especie.
 *
 * PESSOAS: figuras de escala low-poly articuladas (4 poses), cores de roupa variadas.
 *   ILUSTRATIVO: pontos sobre passeios, nao representa fluxo nem contagem.
 */
function rng(seed: number) { return () => ((seed = (seed * 16807) % 2147483647) / 2147483647); }

// ------------------------------------------------------------------ textura de folhagem (gerada no navegador)
function leafTexture(): THREE.CanvasTexture {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d')!; const r = rng(77);
  g.clearRect(0, 0, S, S);
  // aglomerado de folhas em formato de "nuvem": mais denso no centro
  for (let i = 0; i < 170; i++) {
    const a = r() * Math.PI * 2, d = Math.pow(r(), 0.7) * S * 0.42;
    const x = S / 2 + Math.cos(a) * d, y = S / 2 + Math.sin(a) * d * 0.9;
    const L = 16 + r() * 16, Wd = L * (0.38 + r() * 0.12);
    const v = 150 + r() * 105;
    g.save(); g.translate(x, y); g.rotate(r() * Math.PI * 2);
    g.fillStyle = `rgb(${v * 0.82 | 0},${v | 0},${v * 0.62 | 0})`;
    g.beginPath(); g.moveTo(-L / 2, 0); g.quadraticCurveTo(0, -Wd, L / 2, 0); g.quadraticCurveTo(0, Wd, -L / 2, 0); g.fill();
    g.strokeStyle = 'rgba(40,60,20,0.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(-L / 2, 0); g.lineTo(L / 2, 0); g.stroke();
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

/** Copa unitaria (cabe na esfera de raio 1) feita de cartoes com normais "esfericas" (sombreamento macio). */
function foliageGeometry(seed: number, cards = 260) {
  const r = rng(seed);
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [], col: number[] = [], idx: number[] = [];
  const q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3();
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (let i = 0; i < cards; i++) {
    // ponto no elipsoide com tendencia para a casca (onde a luz bate)
    let p: THREE.Vector3;
    do { p = new THREE.Vector3(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1); } while (p.lengthSq() > 1 || p.lengthSq() < 1e-4);
    p.normalize().multiplyScalar(0.45 + 0.36 * Math.sqrt(r()));
    const s = 0.14 + r() * 0.06;                                  // meia-largura do cartao (unidade = raio da copa)
    e.set(r() * Math.PI, r() * Math.PI, r() * Math.PI); q.setFromEuler(e);
    const n = p.clone().normalize();
    const shade = 0.5 + 0.5 * THREE.MathUtils.clamp((p.y + 1) / 2 + p.length() * 0.35 - 0.2, 0, 1); // base/interior mais escuros
    const b = pos.length / 3;
    for (const [cx, cy] of corners) {
      v.set(cx * s, cy * s, 0).applyQuaternion(q).add(p);
      pos.push(v.x, v.y, v.z); nrm.push(n.x, n.y, n.z);
      uv.push((cx + 1) / 2, (cy + 1) / 2); col.push(shade, shade, shade);
    }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

/** Nucleo solido da copa (evita "ver atraves") + galhos principais. Unidade = raio da copa. */
function coreGeometry(seed: number) {
  const r = rng(seed);
  const g = new THREE.IcosahedronGeometry(0.6, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(p, i);
    v.multiplyScalar(0.85 + r() * 0.25); p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}
function branchesGeometry(seed: number) {
  const r = rng(seed); const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + r() * 0.6, tilt = 0.55 + r() * 0.35, L = 0.55 + r() * 0.25;
    const b = new THREE.CylinderGeometry(0.012, 0.03, L, 5); b.translate(0, L / 2, 0);
    b.rotateZ(tilt); b.rotateY(a); b.translate(0, -0.75, 0);
    parts.push(b);
  }
  return mergeGeometries(parts)!;
}

export interface TreeData { x: number; y: number; rx: number; ry: number; zmin: number; zmax: number }

export function buildTrees(trees: TreeData[]) {
  const group = new THREE.Group(); group.name = 'arvores_humanizadas';
  const leafMap = leafTexture();
  const leaf = new THREE.MeshStandardMaterial({ map: leafMap, alphaTest: 0.45, side: THREE.DoubleSide, vertexColors: true, roughness: 0.82, metalness: 0 });
  const coreMat = new THREE.MeshStandardMaterial({ color: 0x24391a, roughness: 0.95 });
  const bark = new THREE.MeshStandardMaterial({ color: 0x4f3d2e, roughness: 0.95 });
  const NV = 3;
  const variants = [0, 1, 2].map((k) => ({ fol: foliageGeometry(13 + k * 17), core: coreGeometry(5 + k), br: branchesGeometry(9 + k) }));
  const trunkGeo = new THREE.CylinderGeometry(0.11, 0.17, 1, 8); trunkGeo.translate(0, 0.5, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, bark, trees.length);
  trunks.castShadow = true; trunks.receiveShadow = true;
  const byVar: TreeData[][] = Array.from({ length: NV }, () => []);
  trees.forEach((t, i) => byVar[i % NV].push(t));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), r = rng(5);
  // tons de verde tropical com variacao (multiplicam a textura)
  const baseCols = [0x5f8a3a, 0x6e9a45, 0x557f36, 0x7aa24c].map((h) => new THREE.Color(h));
  trees.forEach((t, i) => {
    const h = Math.max(t.zmin + (t.zmax - t.zmin) * 0.3, 0.5);
    m.compose(new THREE.Vector3(t.x, 0.05, -t.y), q, new THREE.Vector3(1, h, 1));
    trunks.setMatrixAt(i, m);
  });
  group.add(trunks);
  byVar.forEach((list, vi) => {
    if (!list.length) return;
    const V = variants[vi];
    const fol = new THREE.InstancedMesh(V.fol, leaf, list.length);
    const core = new THREE.InstancedMesh(V.core, coreMat, list.length);
    const br = new THREE.InstancedMesh(V.br, bark, list.length);
    fol.castShadow = core.castShadow = br.castShadow = true;
    fol.receiveShadow = core.receiveShadow = true;
    list.forEach((t, i) => {
      const cy = (t.zmin + t.zmax) / 2, hy = (t.zmax - t.zmin) / 2;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 6.283);
      // escala = raios CAD da copa: os cartoes ocupam no maximo ~1,0 do raio (nunca alem da copa CAD)
      m.compose(new THREE.Vector3(t.x, cy, -t.y), q, new THREE.Vector3(t.rx, hy, t.ry));
      fol.setMatrixAt(i, m); core.setMatrixAt(i, m); br.setMatrixAt(i, m);
      fol.setColorAt(i, baseCols[Math.floor(r() * baseCols.length)].clone().offsetHSL((r() - 0.5) * 0.03, 0, (r() - 0.5) * 0.05));
    });
    group.add(core, br, fol);
  });
  return group;
}

// ------------------------------------------------------------------ pessoas articuladas
type Part = 0 | 1 | 2 | 3 | 4; // 0 pele, 1 parte de cima, 2 parte de baixo, 3 cabelo, 4 calcado
function tag(g: THREE.BufferGeometry, part: Part) {
  g.deleteAttribute('uv');
  g.setAttribute('part', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(part), 1));
  return g;
}
/** Membro (cilindro) que sai de um pivo e gira no plano frente/tras. */
function limb(rTop: number, rBot: number, L: number, pivot: [number, number, number], swing: number, part: Part, seg = 6) {
  const g = new THREE.CylinderGeometry(rTop, rBot, L, seg); g.translate(0, -L / 2, 0);
  g.rotateX(swing); g.translate(...pivot);
  return tag(g, part);
}
function personGeometry(pose: number) {
  // pose 0/1: caminhando (passada alternada) · 2: parado · 3: parado com braco dobrado (celular)
  const sw = pose === 0 ? 0.42 : pose === 1 ? -0.42 : 0;
  const parts: THREE.BufferGeometry[] = [];
  const hipY = 0.9;
  for (const side of [-1, 1]) {   // pernas + calcados
    const a = side * sw;
    parts.push(limb(0.072, 0.052, 0.84, [side * 0.085, hipY, 0], a, 2));
    const foot = new THREE.BoxGeometry(0.095, 0.07, 0.25); foot.translate(0, -0.84 - 0.01, 0.055); foot.rotateX(a); foot.translate(side * 0.085, hipY, 0);
    parts.push(tag(foot, 4));
  }
  // quadril e tronco (achatados na profundidade)
  const pelvis = new THREE.CylinderGeometry(0.155, 0.15, 0.2, 10); pelvis.scale(1, 1, 0.65); pelvis.translate(0, hipY + 0.02, 0);
  parts.push(tag(pelvis, 2));
  const torso = new THREE.CylinderGeometry(0.19, 0.15, 0.56, 10); torso.scale(1, 1, 0.6); torso.translate(0, hipY + 0.39, 0);
  parts.push(tag(torso, 1));
  const shoulders = new THREE.SphereGeometry(0.19, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2); shoulders.scale(1, 0.35, 0.6); shoulders.translate(0, hipY + 0.67, 0);
  parts.push(tag(shoulders, 1));
  for (const side of [-1, 1]) {   // bracos (manga = cor de cima; mao = pele)
    let a = -side * sw * 0.8;
    const sh: [number, number, number] = [side * 0.215, hipY + 0.64, 0];
    if (pose === 3 && side === 1) {
      parts.push(limb(0.05, 0.045, 0.3, sh, 0.15, 1));
      const fore = new THREE.CylinderGeometry(0.042, 0.038, 0.27, 6); fore.translate(0, -0.135, 0); fore.rotateX(-1.7); fore.translate(sh[0] - 0.02, sh[1] - 0.29, 0.03);
      parts.push(tag(fore, 0));
      continue;
    }
    if (pose === 2) a = side * 0.06;
    parts.push(limb(0.05, 0.043, 0.6, sh, a, 1));
    const hand = new THREE.SphereGeometry(0.045, 6, 5); hand.translate(0, -0.62, 0); hand.rotateX(a); hand.translate(...sh);
    parts.push(tag(hand, 0));
  }
  const neck = new THREE.CylinderGeometry(0.05, 0.055, 0.1, 6); neck.translate(0, hipY + 0.73, 0); parts.push(tag(neck, 0));
  const head = new THREE.SphereGeometry(0.105, 12, 9); head.scale(0.9, 1.08, 1); head.translate(0, hipY + 0.88, 0.005); parts.push(tag(head, 0));
  const hair = new THREE.SphereGeometry(0.112, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.55); hair.scale(0.92, 1.08, 1.02); hair.translate(0, hipY + 0.895, -0.008); parts.push(tag(hair, 3));
  return mergeGeometries(parts)!;
}

export interface PersonData { x: number; y: number; z: number; rot: number; kind: number }

export function buildPeople(people: PersonData[]) {
  const group = new THREE.Group(); group.name = 'pessoas_ilustrativas';
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0 });
  // cada vertice sabe a que "parte" do corpo pertence; cada instancia traz suas 4 cores -> 1 draw call por pose
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float part; attribute vec3 iTop; attribute vec3 iBot; attribute vec3 iSkin; attribute vec3 iHair; varying vec3 vPC;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPC = part < 0.5 ? iSkin : part < 1.5 ? iTop : part < 2.5 ? iBot : part < 3.5 ? iHair : vec3(0.05);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPC;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vPC;');
  };
  mat.customProgramCacheKey = () => 'pessoas_v2';
  const tops = [0x2f4a6d, 0xe8e2d4, 0xa2402f, 0x3b3b3b, 0x6f8a5a, 0xd8a83c, 0x5b7fa6, 0xc76b4e, 0xf2f0ea, 0x7b4f8c];
  const bots = [0x2b3445, 0x3a3a3a, 0x5a5048, 0x7d8ea6, 0xd9cfb8, 0x1f2a38];
  const skins = [0xe0b48f, 0xc68c62, 0x8d5a3b, 0xf0cfb0, 0x6b4430, 0xa8754f];
  const hairs = [0x1d1612, 0x3a2a1e, 0x6b4a2a, 0x2b2b2b, 0xb59a6a];
  const byPose: PersonData[][] = [[], [], [], []];
  people.forEach((p) => byPose[Math.abs(p.kind | 0) % 4].push(p));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), r = rng(17), c = new THREE.Color();
  byPose.forEach((list, pose) => {
    if (!list.length) return;
    const geo = personGeometry(pose);
    const n = list.length;
    const A = (k: string) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3); geo.setAttribute(k, a); return a; };
    const aT = A('iTop'), aB = A('iBot'), aS = A('iSkin'), aH = A('iHair');
    const im = new THREE.InstancedMesh(geo, mat, n);
    im.castShadow = true; im.receiveShadow = true;
    list.forEach((p, i) => {
      const s = 0.93 + r() * 0.13;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rot);
      m.compose(new THREE.Vector3(p.x, p.z, -p.y), q, new THREE.Vector3(s, s, s));
      im.setMatrixAt(i, m);
      const pick = (arr: number[], at: THREE.InstancedBufferAttribute) => { c.setHex(arr[Math.floor(r() * arr.length)]); at.setXYZ(i, c.r, c.g, c.b); };
      pick(tops, aT); pick(bots, aB); pick(skins, aS); pick(hairs, aH);
    });
    group.add(im);
  });
  return group;
}

// ------------------------------------------------------------------ iluminacao noturna (manchas de luz no piso)
export interface LampData { x: number; y: number; h: number }
/**
 * "Pocas" de luz sob cada poste (decalque aditivo), visiveis so no entardecer/noite.
 * Sao 79 postes: 79 luzes reais seriam pesadas demais; o decalque custa 1 draw call.
 * Raio ilustrativo (~9 m), centrado no poste CAD: nao e calculo luminotecnico.
 */
export function buildLightPools(lamps: LampData[]) {
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d')!; const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(255,214,160,1)'); gr.addColorStop(0.35, 'rgba(255,200,140,0.55)'); gr.addColorStop(1, 'rgba(255,190,120,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4 });
  const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const im = new THREE.InstancedMesh(geo, mat, lamps.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion();
  lamps.forEach((l, i) => { const R = 15; m.compose(new THREE.Vector3(l.x, 0.2, -l.y), q, new THREE.Vector3(R, 1, R)); im.setMatrixAt(i, m); });
  im.renderOrder = 3; im.frustumCulled = false; im.visible = false;
  im.name = 'pocas_de_luz_ilustrativas';
  return im;
}
