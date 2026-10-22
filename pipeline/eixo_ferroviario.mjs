// Extrai o EIXO CENTRAL DA FERROVIA a partir da geometria do proprio GLB (trilhos EP_METAL da camada ferrovia).
// Metodo: os dois trilhos sao simetricos ao eixo -> a media dos vertices em fatias transversais = ponto do eixo.
// As fatias seguem a direcao principal local (PCA), entao funciona mesmo em curvas.
// Saida: public/data/rail_axis.json  { points: [[x,y],...], length_m, note }  (coordenadas CAD/Blender locais)
// Uso: node pipeline/eixo_ferroviario.mjs
import fs from 'node:fs';

const GLB = 'public/models/caminho_dos_trilhos_R07.glb';
const b = fs.readFileSync(GLB);
const jlen = b.readUInt32LE(12);
const j = JSON.parse(b.slice(20, 20 + jlen).toString());
const binStart = 20 + jlen + 8;
const node = j.nodes.find((n) => n.name === 'ferrovia__EP_METAL');
if (!node) throw new Error('ferrovia__EP_METAL nao encontrado');
const acc = j.accessors[j.meshes[node.mesh].primitives[0].attributes.POSITION];
const bv = j.bufferViews[acc.bufferView];
const f = new Float32Array(b.buffer, b.byteOffset + binStart + (bv.byteOffset || 0) + (acc.byteOffset || 0), acc.count * 3);
// three (x, y, z) -> CAD (x, -z). Os trilhos sao prismas longos com poucos vertices:
// amostramos as ARESTAS dos triangulos a cada 0,5 m para ter pontos ao longo de todo o trilho.
const V = []; for (let i = 0; i < acc.count; i++) V.push([f[i * 3], -f[i * 3 + 2]]);
const prim = j.meshes[node.mesh].primitives[0];
const ia = j.accessors[prim.indices], ibv = j.bufferViews[ia.bufferView];
const IA = ia.componentType === 5125 ? Uint32Array : Uint16Array;
const idx = new IA(b.buffer, b.byteOffset + binStart + (ibv.byteOffset || 0) + (ia.byteOffset || 0), ia.count);
const P = []; const seen = new Set();
for (let t = 0; t < idx.length; t += 3) for (const [a, c] of [[idx[t], idx[t + 1]], [idx[t + 1], idx[t + 2]], [idx[t + 2], idx[t]]]) {
  const key = a < c ? `${a}_${c}` : `${c}_${a}`; if (seen.has(key)) continue; seen.add(key);
  const A = V[a], C = V[c]; const L = Math.hypot(C[0] - A[0], C[1] - A[1]); const n = Math.max(1, Math.ceil(L / 0.5));
  if (L < 0.3) { P.push(A); continue; }   // arestas transversais curtas (secao do trilho)
  for (let s = 0; s <= n; s++) P.push([A[0] + (C[0] - A[0]) * s / n, A[1] + (C[1] - A[1]) * s / n]);
}
console.log('vertices:', V.length, 'amostras:', P.length);

// 1) ordenacao grosseira: projecao na direcao principal global e caminhada por fatias de 4 m
const mean = (a) => a.reduce((s, p) => [s[0] + p[0], s[1] + p[1]], [0, 0]).map((v) => v / a.length);
function pca(a) {
  const m = mean(a); let xx = 0, xy = 0, yy = 0;
  for (const [x, y] of a) { const dx = x - m[0], dy = y - m[1]; xx += dx * dx; xy += dx * dy; yy += dy * dy; }
  const t = 0.5 * Math.atan2(2 * xy, xx - yy); return { m, d: [Math.cos(t), Math.sin(t)] };
}
// caminhada: comeca na ponta oeste, avanca ao longo da direcao local
let start = P.reduce((a, p) => (p[0] < a[0] ? p : a));
const axis = [];
let cur = start, dir = null;
const STEP = 4, R = 6;
for (let k = 0; k < 2000; k++) {
  const near = P.filter((p) => Math.hypot(p[0] - cur[0], p[1] - cur[1]) < R);
  if (near.length < 6) break;
  const { m, d } = pca(near);
  let dd = d; if (dir && dd[0] * dir[0] + dd[1] * dir[1] < 0) dd = [-dd[0], -dd[1]];
  if (!dir && dd[0] < 0) dd = [-dd[0], -dd[1]];
  // fatia transversal fina em torno de m: media dos vertices = ponto do eixo (trilhos simetricos)
  const slab = near.filter((p) => Math.abs((p[0] - m[0]) * dd[0] + (p[1] - m[1]) * dd[1]) < 1.0);
  const c = slab.length > 3 ? mean(slab) : m;
  if (!axis.length || Math.hypot(c[0] - axis.at(-1)[0], c[1] - axis.at(-1)[1]) > 1) axis.push(c);
  dir = dd; cur = [c[0] + dd[0] * STEP, c[1] + dd[1] * STEP];
}
// suavizacao leve (media movel de 3) sem mexer nas pontas
const sm = axis.map((p, i) => (i === 0 || i === axis.length - 1 ? p : [(axis[i - 1][0] + p[0] + axis[i + 1][0]) / 3, (axis[i - 1][1] + p[1] + axis[i + 1][1]) / 3]));
let L = 0; for (let i = 1; i < sm.length; i++) L += Math.hypot(sm[i][0] - sm[i - 1][0], sm[i][1] - sm[i - 1][1]);
// conferencia: distancia media de cada vertice de trilho ao eixo deve ser ~ meia bitola
function distToAxis(p) {
  let best = 1e9;
  for (let i = 1; i < sm.length; i++) {
    const [ax, ay] = sm[i - 1], [bx, by] = sm[i]; const vx = bx - ax, vy = by - ay; const l2 = vx * vx + vy * vy || 1;
    const t = Math.max(0, Math.min(1, ((p[0] - ax) * vx + (p[1] - ay) * vy) / l2));
    best = Math.min(best, Math.hypot(p[0] - ax - t * vx, p[1] - ay - t * vy));
  }
  return best;
}
const sample = P.filter((_, i) => i % 50 === 0).map(distToAxis);
const avg = sample.reduce((s, v) => s + v, 0) / sample.length;
const out = {
  points: sm.map((p) => [+p[0].toFixed(2), +p[1].toFixed(2)]),
  length_m: +L.toFixed(1),
  half_gauge_check_m: +avg.toFixed(3),
  source: 'GLB ferrovia__EP_METAL (R07), media transversal dos dois trilhos',
  note: 'Eixo central da ferrovia em coordenadas locais CAD (origem E 700080 / N 7070350). Usado para ancorar as tags dos trechos.',
};
fs.writeFileSync('public/data/rail_axis.json', JSON.stringify(out));
console.log(`eixo: ${sm.length} pontos, ${L.toFixed(0)} m; distancia media trilho-eixo ${avg.toFixed(3)} m (esperado ~0,5 m p/ bitola metrica)`);
console.log('pontas:', sm[0], sm.at(-1));
