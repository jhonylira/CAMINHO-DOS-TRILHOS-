import * as THREE from 'three';
import { pointAt, type RailAxis } from './axis';

/**
 * VEÍCULOS ILUSTRATIVOS (carros estacionados e "em circulação" congelados no viário).
 *
 * O que é: frota low-poly estilizada (hatch, sedã, SUV, picape, van) apenas para dar escala
 * e vida às ruas nas vistas aérea e de pedestre. É ILUSTRATIVO: não representa tráfego,
 * volume, vagas de estacionamento, sentido de circulação oficial nem contagem de veículos.
 *
 * Como funciona:
 *  1. Percorre o eixo da ferrovia (estacas a cada 18–30 m) e, de cada lado, faz uma varredura
 *     perpendicular de 2,5 a 45 m com raios verticais (BVH). Um ponto é "asfalto livre" quando o
 *     raio acerta o asfalto e nenhum outro elemento (passeio, canteiro, trilho...) está acima.
 *  2. Trechos contínuos de asfalto livre com 3,2–16 m de largura viram "pistas" (até 5,5 m: mão
 *     única, uma faixa central). Mais largos que 16 m costumam ser cruzamentos/praças: ignorados.
 *  3. Em cada pista escolhe-se uma faixa (centro ± 1,6 m; circulação pela direita, como no Brasil)
 *     ou, às vezes, vaga junto ao meio-fio. A direção é a tangente do eixo corrigida pela borda
 *     da pista medida 6 m à frente e atrás. A pegada do carro é conferida ponto a ponto.
 *  4. Uma InstancedMesh por tipo × material (carroceria, vidro, borracha, calota, faróis):
 *     ~25 draw calls para toda a frota; a cor de cada carro vai por instância (setColorAt).
 *
 * Referencial: three = (x, z, -y) do CAD. Determinístico (mesma seed → mesma frota).
 */

// ------------------------------------------------------------------ utilitários
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function pickWeighted<T>(items: [T, number][], r: number): T {
  const tot = items.reduce((s, [, w]) => s + w, 0);
  let acc = 0;
  for (const [it, w] of items) { acc += w / tot; if (r <= acc) return it; }
  return items[items.length - 1][0];
}

// ------------------------------------------------------------------ modelos
interface CarSpec {
  name: string;
  L: number; W: number; H: number;
  wb: number; fo: number; r: number;   // entre-eixos, balanço dianteiro, raio da roda
  belt: number;                        // linha de cintura (topo da carroceria inferior)
  hoodY: number; tailY: number;        // altura do capô na frente / da tampa traseira
  ws0: number; ws1: number;            // x da base e do topo do para-brisa
  rf1: number; rr0: number;            // x do fim do teto e da base do vidro traseiro
  glassRear?: number;                  // limite traseiro (vertical) do vidro (van de carga)
  bed?: boolean;                       // caçamba (picape)
}
// x: frente = +L/2, traseira = -L/2 (eixo local +X = sentido de marcha)
const SPECS: CarSpec[] = [
  { name: 'hatch', L: 3.9, W: 1.7, H: 1.5, wb: 2.5, fo: 0.78, r: 0.3, belt: 0.92, hoodY: 0.78, tailY: 0.95,
    ws0: 0.95, ws1: 0.15, rf1: -1.45, rr0: -1.88 },
  { name: 'sedan', L: 4.5, W: 1.75, H: 1.46, wb: 2.62, fo: 0.88, r: 0.31, belt: 0.9, hoodY: 0.8, tailY: 0.98,
    ws0: 1.15, ws1: 0.35, rf1: -0.95, rr0: -1.55 },
  { name: 'suv', L: 4.4, W: 1.82, H: 1.68, wb: 2.65, fo: 0.85, r: 0.35, belt: 1.05, hoodY: 0.98, tailY: 1.05,
    ws0: 1.05, ws1: 0.35, rf1: -1.95, rr0: -2.12 },
  { name: 'picape', L: 5.3, W: 1.86, H: 1.8, wb: 3.1, fo: 0.92, r: 0.37, belt: 1.12, hoodY: 1.05, tailY: 1.12,
    ws0: 1.35, ws1: 0.65, rf1: -0.55, rr0: -0.62, bed: true },
  { name: 'van', L: 5.0, W: 1.95, H: 2.25, wb: 3.0, fo: 0.82, r: 0.33, belt: 1.05, hoodY: 1.0, tailY: 1.05,
    ws0: 1.75, ws1: 1.15, rf1: -2.46, rr0: -2.5, glassRear: 0.25 },
];
const TYPE_WEIGHTS: [number, number][] = [[0, 0.32], [1, 0.22], [2, 0.24], [3, 0.12], [4, 0.10]];
// frota brasileira: muito branco/prata/cinza
const COLORS: [number, number][] = [
  [0xf2f2ef, 0.30], [0xb9bcbf, 0.22], [0x6b6e72, 0.15], [0x1c1d20, 0.14],
  [0x6e1a1f, 0.07], [0x1d2c4a, 0.06], [0xcfc6b4, 0.03], [0x2f4a3a, 0.03],
];

interface CarGeo { body: THREE.BufferGeometry; glass: THREE.BufferGeometry; dark: THREE.BufferGeometry; hub: THREE.BufferGeometry; lights: THREE.BufferGeometry }

function extrudeCentered(pts: [number, number][], width: number, bt: number, bs: number) {
  const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const depth = Math.max(0.01, width - 2 * bt);
  const g = new THREE.ExtrudeGeometry(sh, {
    depth, bevelEnabled: bt > 0, bevelThickness: bt, bevelSize: bs, bevelSegments: 2, curveSegments: 4,
  });
  g.translate(0, 0, -depth / 2);
  return clean(g);
}
function box(sx: number, sy: number, sz: number, x: number, y: number, z: number) {
  const g = new THREE.BoxGeometry(sx, sy, sz); g.translate(x, y, z); return clean(g);
}
/** padroniza atributos (position/normal/uv, não indexado) para poder mesclar */
function clean(g: THREE.BufferGeometry) {
  const n = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k);
  if (!n.attributes.normal) n.computeVertexNormals();
  return n;
}
function withColor(g: THREE.BufferGeometry, hex: number) {
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
/** concatena geometrias não indexadas com os mesmos atributos (evita depender de BufferGeometryUtils) */
function merge(gs: THREE.BufferGeometry[]) {
  const out = new THREE.BufferGeometry();
  for (const k of Object.keys(gs[0].attributes)) {
    const size = gs[0].attributes[k].itemSize;
    const total = gs.reduce((s, g) => s + g.attributes[k].count * size, 0);
    const arr = new Float32Array(total);
    let off = 0;
    for (const g of gs) { const a = g.attributes[k].array as Float32Array; arr.set(a, off); off += a.length; }
    out.setAttribute(k, new THREE.BufferAttribute(arr, size));
  }
  return out;
}

function buildCarGeo(s: CarSpec): CarGeo {
  const { L, W, H, r } = s;
  const xf = L / 2 - s.fo, xr = xf - s.wb;          // eixos dianteiro e traseiro
  const yb = 0.24;                                   // base da carroceria
  const ra = r + 0.09;                               // raio do recorte da caixa de roda
  const BS = 0.04, BT = 0.05;
  // --- carroceria inferior (perfil lateral extrudado na largura, com chanfro)
  const arch = (xa: number): [number, number][] => {
    const p: [number, number][] = [[xa - ra, yb]];
    for (let k = 0; k <= 8; k++) { const t = Math.PI * (1 - k / 8); p.push([xa + ra * Math.cos(t), r + ra * Math.sin(t)]); }
    p.push([xa + ra, yb]);
    return p;
  };
  const lower: [number, number][] = [
    [-L / 2 + 0.12, yb], ...arch(xr), ...arch(xf), [L / 2 - 0.12, yb],
    [L / 2 - BS, yb + 0.22], [L / 2 - BS, s.hoodY - 0.1], [L / 2 - 0.3, s.hoodY],
    [s.ws0, s.belt], [s.rr0 + 0.02, s.belt],
    [-L / 2 + 0.12, s.tailY], [-L / 2 + BS, s.tailY - 0.12], [-L / 2 + BS, yb + 0.2],
  ];
  const parts: THREE.BufferGeometry[] = [extrudeCentered(lower, W, BT, BS)];
  // --- cabine (teto pintado) e estufa de vidro
  const Wc = W * 0.86, cbs = 0.02;
  const cab: [number, number][] = [[s.ws0 + 0.05, s.belt - 0.05], [s.ws1, H - cbs], [s.rf1, H - cbs], [s.rr0 - 0.02, s.belt - 0.05]];
  parts.push(extrudeCentered(cab, Wc, 0.03, cbs));
  // coluna B (pintada), um pouco mais larga que o vidro
  const xB = s.glassRear !== undefined ? s.glassRear : (s.ws1 + s.rf1) / 2 + 0.1;
  parts.push(box(0.09, H - s.belt - 0.1, Wc + 0.1, xB, (H + s.belt) / 2 - 0.04, 0));
  // coluna D nos modelos de cabine longa (hatch, SUV, van com vidro): separa o vidro lateral traseiro
  if (s.glassRear === undefined && s.ws1 - s.rf1 > 1.6) parts.push(box(0.12, H - s.belt - 0.1, Wc + 0.1, s.rf1 + 0.3, (H + s.belt) / 2 - 0.04, 0));
  // retrovisores
  for (const z of [-1, 1]) parts.push(box(0.1, 0.12, 0.16, s.ws0 - 0.12, s.belt + 0.12, z * (W / 2 + 0.05)));
  // vidro: mesmo perfil, empurrado 3 cm para fora nas inclinadas e 6 cm abaixo do teto
  const gTop = H - 0.07, gBot = s.belt + 0.03;
  const onLine = (x0: number, y0: number, x1: number, y1: number, y: number) => x0 + (x1 - x0) * ((y - y0) / (y1 - y0));
  const fx = (y: number) => onLine(s.ws0 + 0.05, s.belt - 0.05, s.ws1, H - cbs, y) + 0.035;
  const rx = (y: number) => s.glassRear !== undefined ? s.glassRear : onLine(s.rr0 - 0.02, s.belt - 0.05, s.rf1, H - cbs, y) - 0.035;
  const glassPts: [number, number][] = [[fx(gBot), gBot], [fx(gTop), gTop], [rx(gTop), gTop], [rx(gBot), gBot]];
  const glass = extrudeCentered(glassPts, Wc + 0.07, 0, 0);
  // --- partes escuras: pneus, para-choques, caçamba
  const dark: THREE.BufferGeometry[] = [];
  const hub: THREE.BufferGeometry[] = [];
  const zw = W / 2 - 0.16;
  for (const x of [xf, xr]) for (const z of [-zw, zw]) {
    const t = new THREE.CylinderGeometry(r, r, 0.24, 18); t.rotateX(Math.PI / 2); t.translate(x, r, z); dark.push(clean(t));
    const h = new THREE.CylinderGeometry(r * 0.6, r * 0.6, 0.25, 12); h.rotateX(Math.PI / 2); h.translate(x, r, z * 1.01); hub.push(clean(h));
  }
  dark.push(box(0.12, 0.18, W - 0.06, L / 2 + 0.01, yb + 0.1, 0));
  dark.push(box(0.12, 0.18, W - 0.06, -L / 2 - 0.01, yb + 0.1, 0));
  if (s.bed) {
    const b0 = -L / 2 + 0.16, b1 = s.rr0 - 0.12; // fundo escuro da caçamba, cercado pela borda pintada
    dark.push(box(b1 - b0, 0.06, W - 0.22, (b0 + b1) / 2, s.belt + 0.035, 0));
  }
  // --- faróis (branco quente) e lanternas (vermelho)
  const lights: THREE.BufferGeometry[] = [];
  const zl = W / 2 - 0.28;
  for (const z of [-zl, zl]) {
    lights.push(withColor(box(0.06, 0.11, 0.34, L / 2 + 0.02, s.hoodY - 0.14, z), 0xfff3d6));
    lights.push(withColor(box(0.06, 0.14, 0.26, -L / 2 - 0.02, s.tailY - 0.16, z), 0xb3121a));
  }
  return { body: merge(parts), glass, dark: merge(dark), hub: merge(hub), lights: merge(lights) };
}

// ------------------------------------------------------------------ posicionamento
interface Placed { x: number; y: number; z: number; ang: number; type: number }

export function buildVehicles(
  asphalt: THREE.Mesh[], blockers: THREE.Mesh[], axis: RailAxis,
  opts: { seed?: number; density?: number } = {},
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'veiculos_ilustrativos';
  if (!asphalt.length || !axis?.pts?.length) return group;
  const rnd = rng(opts.seed ?? 20261022);
  const density = Math.max(0, opts.density ?? 1);

  const ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0), 0, 200);
  (ray as any).firstHitOnly = true;
  const o = ray.ray.origin;
  const hits: THREE.Intersection[] = [];
  /** altura do asfalto livre em (x,y) CAD, ou NaN se não houver asfalto livre */
  const free = (x: number, y: number): number => {
    o.set(x, 60, -y);
    hits.length = 0;
    ray.intersectObjects(asphalt, false, hits);
    if (!hits.length) return NaN;
    const ya = hits[0].point.y;
    hits.length = 0;
    ray.intersectObjects(blockers, false, hits);
    for (const h of hits) if (h.point.y > ya + 0.005) return NaN;
    return ya;
  };

  const placed: Placed[] = [];
  const MIN_D2 = 7 * 7;
  const tooClose = (x: number, y: number) => placed.some((p) => (p.x - x) ** 2 + (-p.z - y) ** 2 < MIN_D2);
  const STEP = 0.5, D0 = 2.5, D1 = 45;
  const pPlace = Math.min(0.95, 0.55 * density);
  const st: Record<string, number> = { runs: 0, estreito: 0, largo: 0, sorteio: 0, cortado: 0, perto: 0, borda: 0, curva: 0, pegada: 0 };

  for (let s = 6 + rnd() * 10; s < axis.length - 6; s += 18 + rnd() * 12) {
    const P = pointAt(axis, s);
    const tx = P.tx, ty = P.ty, nx = -ty, ny = tx;
    for (const side of [-1, 1]) {
      // 1. varredura lateral → trechos contínuos de asfalto livre
      const runs: [number, number][] = [];
      let start = -1;
      for (let d = D0; d <= D1 + 1e-6; d += STEP) {
        const ok = !Number.isNaN(free(P.x + nx * side * d, P.y + ny * side * d));
        if (ok && start < 0) start = d;
        if ((!ok || d + STEP > D1) && start >= 0) { runs.push([start, ok ? d : d - STEP]); start = -1; }
      }
      for (const [a, b] of runs) {
        const w = b - a + STEP;
        st.runs++;
        if (w < 3.2) { st.estreito++; continue; }
        if (w > 16) { st.largo++; continue; }
        if (rnd() > pPlace) { st.sorteio++; continue; }
        if (a <= D0 + 1e-6 || b >= D1 - 1e-6) { st.cortado++; continue; } // trecho cortado pela varredura: borda desconhecida
        const c = (a + b) / 2;
        // 2. candidatos: via de faixa única (3,2–5,5 m, mão única) → centro; via dupla → duas faixas
        //    (centro ± 1,6 m) e, se larga, as duas vagas junto ao meio-fio
        const single = w < 5.5;
        const slots: { d: number; park: boolean }[] = single ? [{ d: c, park: false }] : [{ d: c - 1.6, park: false }, { d: c + 1.6, park: false }];
        if (w >= 7.5) { slots.push({ d: a - STEP / 2 + 1.1, park: true }, { d: b + STEP / 2 - 1.1, park: true }); }
        // embaralha com viés: faixas 65%, vagas 35%
        const order = slots.map((sl) => ({ sl, k: rnd() * (sl.park ? 1.6 : 1) })).sort((p, q) => p.k - q.k).map((v) => v.sl);
        const type = pickWeighted(TYPE_WEIGHTS, rnd());
        const spec = SPECS[type];
        for (const sl of order) {
          const cx = P.x + nx * side * sl.d, cy = P.y + ny * side * sl.d;
          if (tooClose(cx, cy)) { st.perto++; continue; }
          // circulação pela direita: o lado da faixa em relação ao centro define o sentido.
          // Mão única: sentido fixo por lado do eixo (binário coerente ao longo de todo o corredor).
          const m = single ? side : Math.sign(sl.d - c) * side; // +1 → faixa no lado +n
          let hx = m > 0 ? -tx : tx, hy = m > 0 ? -ty : ty;
          // 3. corrige a direção pela borda mais próxima da pista medida ±6 m
          const e = (sl.d > c ? 1 : -1) * side;           // sentido (em n) da borda mais próxima
          const edgeDist = (qx: number, qy: number) => {
            for (let k = 0; k <= 24; k++) {
              const dd = k * 0.4;
              if (Number.isNaN(free(qx + nx * e * dd, qy + ny * e * dd))) return dd;
            }
            return NaN;
          };
          const dB = edgeDist(cx - tx * 6, cy - ty * 6), dF = edgeDist(cx + tx * 6, cy + ty * 6);
          if (Number.isNaN(dB) || Number.isNaN(dF)) { st.borda++; continue; } // borda some → provável cruzamento
          if (Math.abs(dF - dB) < 4) {
            const vx = tx * 12 + nx * e * (dF - dB), vy = ty * 12 + ny * e * (dF - dB);
            const len = Math.hypot(vx, vy), sg = hx * tx + hy * ty > 0 ? 1 : -1;
            hx = (sg * vx) / len; hy = (sg * vy) / len;
          } else { st.curva++; continue; }
          // 4. pegada do veículo: 3 × 3 pontos sobre asfalto livre
          const px = -hy, py = hx;
          let ok = true, yMax = -Infinity;
          for (const al of [-spec.L / 2 + 0.25, 0, spec.L / 2 - 0.25]) {
            for (const ac of [-spec.W / 2, 0, spec.W / 2]) {
              const h = free(cx + hx * al + px * ac, cy + hy * al + py * ac);
              if (Number.isNaN(h)) { ok = false; break; }
              yMax = Math.max(yMax, h);
            }
            if (!ok) break;
          }
          if (!ok) { st.pegada++; continue; }
          placed.push({ x: cx, y: yMax, z: -cy, ang: Math.atan2(hy, hx), type });
          break;
        }
      }
    }
  }

  // ------------------------------------------------------------------ malhas instanciadas
  const matBody = new THREE.MeshStandardMaterial({ name: 'VEIC_PINTURA', color: 0xffffff, roughness: 0.32, metalness: 0.35, envMapIntensity: 1.0 });
  const matGlass = new THREE.MeshStandardMaterial({ name: 'VEIC_VIDRO', color: 0x1e2731, roughness: 0.05, metalness: 0.65, envMapIntensity: 1.6 });
  const matDark = new THREE.MeshStandardMaterial({ name: 'VEIC_BORRACHA', color: 0x16171a, roughness: 0.85, metalness: 0 });
  const matHub = new THREE.MeshStandardMaterial({ name: 'VEIC_CALOTA', color: 0xc4c7cb, roughness: 0.35, metalness: 0.7 });
  const matLight = new THREE.MeshStandardMaterial({ name: 'VEIC_FAROIS', vertexColors: true, roughness: 0.3, metalness: 0, emissive: 0x2a2018, emissiveIntensity: 0.6 });

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
  const col = new THREE.Color(), crng = rng((opts.seed ?? 20261022) ^ 0x5bd1e995);
  // vans/utilitários: frota majoritariamente branca
  const colorOf = placed.map((p) => col.setHex(p.type === 4 && crng() < 0.7 ? 0xf2f2ef : pickWeighted(COLORS, crng())).clone());
  SPECS.forEach((spec, t) => {
    const list = placed.map((p, i) => ({ p, i })).filter((v) => v.p.type === t);
    if (!list.length) return;
    const geo = buildCarGeo(spec);
    const parts: [keyof CarGeo, THREE.Material][] = [['body', matBody], ['glass', matGlass], ['dark', matDark], ['hub', matHub], ['lights', matLight]];
    for (const [k, mat] of parts) {
      const im = new THREE.InstancedMesh(geo[k], mat, list.length);
      im.name = `veiculos_${spec.name}_${k}`;
      im.castShadow = k !== 'lights' && k !== 'hub';
      im.receiveShadow = true;
      list.forEach(({ p, i }, j) => {
        q.setFromAxisAngle(up, p.ang);
        m4.compose(new THREE.Vector3(p.x, p.y, p.z), q, one);
        im.setMatrixAt(j, m4);
        if (k === 'body') im.setColorAt(j, colorOf[i]);
      });
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.computeBoundingSphere();
      group.add(im);
    }
  });
  group.userData.count = placed.length;
  group.userData.stats = st;
  group.userData.byType = SPECS.map((s, t) => [s.name, placed.filter((p) => p.type === t).length]);
  return group;
}
