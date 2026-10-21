import * as THREE from 'three';

/**
 * Materiais "archviz" em tempo real.
 * Principio: a COR SEMANTICA definida pelo autor no Blender e preservada (baseColorFactor do GLB);
 * as texturas procedurais sao quase brancas e apenas MULTIPLICAM detalhe (agregado, juntas, fiadas, veios).
 * Nenhuma textura altera geometria: o relevo e so visual (bumpMap).
 */
type Kind = 'asphalt' | 'aggregate' | 'concrete' | 'grass' | 'soil' | 'gravel' | 'brick' | 'tile' | 'wood' | 'plaster' | 'red';

const MAT_KIND: Record<string, { kind: Kind; size: number; rough: number; bump?: number; tint?: number }> = {
  'EP_ASFALTO': { kind: 'asphalt', size: 6, rough: 0.92, bump: 0.6 },
  'Cracked asphalt': { kind: 'asphalt', size: 6, rough: 0.92, bump: 0.6 },
  'EP_CONCRETO_FULGET_CINZA': { kind: 'aggregate', size: 2.5, rough: 0.85, bump: 0.4, tint: 1.08 },
  'EP_PERMANENCIA_FULGET_TERROSO': { kind: 'aggregate', size: 2.5, rough: 0.85, bump: 0.4, tint: 1.05 },
  'R10_FULGET_TERROSO_PLACAS': { kind: 'aggregate', size: 2.5, rough: 0.85, bump: 0.4 },
  'EP_GUIA_CONCRETO': { kind: 'concrete', size: 3, rough: 0.8, bump: 0.3 },
  'EP_R02_CONCRETO_BRANCO_FLOREIRA': { kind: 'concrete', size: 3, rough: 0.78, bump: 0.3 },
  'R06_CONCRETO_CLARO_FOSCO_MICROAGREGADO': { kind: 'concrete', size: 3, rough: 0.78, bump: 0.3 },
  'EP_FAIXA_ESPECIAL_CIMENTICIO': { kind: 'red', size: 3, rough: 0.82, bump: 0.3 },
  'EP_CANTEIRO': { kind: 'grass', size: 4, rough: 0.95, bump: 0.8, tint: 1.0 },
  'EP_VEGETACAO_BAIXA': { kind: 'grass', size: 3, rough: 0.95, bump: 0.9 },
  'EP_R02_VEGETACAO_BAIXA_MASSA': { kind: 'grass', size: 2, rough: 0.95, bump: 1.0 },
  'EP_R02_SOLO_ORGANICO_ESCUR0': { kind: 'soil', size: 2, rough: 1, bump: 0.8 },
  'R03_SOLO_AERADO': { kind: 'soil', size: 2, rough: 1, bump: 0.8 },
  'EP_LASTRO': { kind: 'gravel', size: 1.5, rough: 0.95, bump: 1.2 },
  'Brick Wall': { kind: 'brick', size: 1.2, rough: 0.85, bump: 0.8 },
  'R03_TIJOLINHO_BASE_CAFE_BISTRO': { kind: 'brick', size: 1.2, rough: 0.85, bump: 0.8 },
  'R13_TELHA_CERAMICA': { kind: 'tile', size: 2.0, rough: 0.7, bump: 1.0 },
  'WOOD': { kind: 'wood', size: 1.5, rough: 0.7, bump: 0.3 },
  'EP_MADEIRA_BANCO': { kind: 'wood', size: 1.2, rough: 0.65, bump: 0.3 },
  'R15_MADEIRA_RIPADO_SUAVE': { kind: 'wood', size: 1.2, rough: 0.65, bump: 0.3 },
  'R10_MADEIRA_SUAVE': { kind: 'wood', size: 1.2, rough: 0.65, bump: 0.3 },
  'ENTORNO': { kind: 'plaster', size: 4, rough: 0.9, bump: 0.2 },
};

function rng(seed: number) { return () => ((seed = (seed * 16807) % 2147483647) / 2147483647); }

function makeCanvas(kind: Kind, S = 512): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d')!;
  const r = rng(kind.length * 7919 + 13);
  const fill = (v: number) => { g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(0, 0, S, S); };
  const speck = (n: number, min: number, max: number, rmin: number, rmax: number, tint?: (v: number) => string) => {
    for (let i = 0; i < n; i++) {
      const v = Math.round(min + r() * (max - min));
      g.fillStyle = tint ? tint(v) : `rgb(${v},${v},${v})`;
      const rad = rmin + r() * (rmax - rmin);
      g.beginPath(); g.arc(r() * S, r() * S, rad, 0, 6.283); g.fill();
    }
  };
  const blotch = (n: number, a: number, rmin: number, rmax: number, light = false) => {
    for (let i = 0; i < n; i++) {
      const x = r() * S, y = r() * S, rad = rmin + r() * (rmax - rmin);
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      const col = light ? '255,255,255' : '0,0,0';
      gr.addColorStop(0, `rgba(${col},${a})`); gr.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
  };
  switch (kind) {
    case 'asphalt': fill(225); blotch(40, 0.08, 40, 140); speck(9000, 150, 255, 0.5, 1.6); blotch(20, 0.06, 30, 90, true); break;
    case 'aggregate': fill(236); blotch(30, 0.05, 40, 120); speck(14000, 170, 255, 0.6, 1.8); break;
    case 'concrete': fill(242); blotch(40, 0.05, 30, 140); speck(3000, 200, 255, 0.4, 1.0); break;
    case 'red': fill(235); blotch(40, 0.07, 30, 120); speck(5000, 190, 255, 0.4, 1.2); break;
    case 'grass': {
      fill(215);
      for (let i = 0; i < 26000; i++) {
        const v = 150 + r() * 105; g.strokeStyle = `rgb(${v * 0.92},${v},${v * 0.8})`; g.lineWidth = 1 + r();
        const x = r() * S, y = r() * S; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 4, y - 3 - r() * 6); g.stroke();
      }
      blotch(30, 0.12, 40, 130); blotch(20, 0.08, 40, 110, true); break;
    }
    case 'soil': fill(200); speck(12000, 120, 255, 0.6, 2.2); blotch(30, 0.12, 20, 90); break;
    case 'gravel': fill(190); speck(9000, 110, 255, 1.2, 3.4); break;
    case 'plaster': fill(246); blotch(50, 0.035, 40, 160); speck(2500, 220, 255, 0.4, 1.0); break;
    case 'brick': {
      fill(170); const bh = S / 8, bw = S / 4;
      for (let row = 0; row < 8; row++) for (let col = -1; col < 5; col++) {
        const off = row % 2 ? bw / 2 : 0; const v = 205 + r() * 50;
        g.fillStyle = `rgb(${v},${v * 0.97},${v * 0.95})`; g.fillRect(col * bw + off + 3, row * bh + 3, bw - 6, bh - 6);
      }
      speck(3000, 150, 255, 0.5, 1.2); break;
    }
    case 'tile': {
      fill(160); const rows = 8, cols = 6, th = S / rows, tw = S / cols;
      for (let row = 0; row < rows; row++) for (let col = -1; col <= cols; col++) {
        const off = row % 2 ? tw / 2 : 0; const v = 200 + r() * 55;
        const gr = g.createLinearGradient(0, row * th, 0, row * th + th);
        gr.addColorStop(0, `rgb(${v * 0.8},${v * 0.8},${v * 0.8})`); gr.addColorStop(0.75, `rgb(${v},${v},${v})`); gr.addColorStop(1, `rgb(${v * 0.6},${v * 0.6},${v * 0.6})`);
        g.fillStyle = gr; g.beginPath(); g.roundRect(col * tw + off + 2, row * th + 1, tw - 4, th - 2, 10); g.fill();
      }
      blotch(25, 0.12, 30, 100); break;
    }
    case 'wood': {
      fill(225);
      for (let y = 0; y < S; y += 1) { const v = 200 + 40 * Math.sin(y * 0.15 + Math.sin(y * 0.031) * 4) * (0.5 + r() * 0.5); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(0, y, S, 1); }
      for (let i = 0; i < 8; i++) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, (i * S) / 8, S, 2); }
      break;
    }
  }
  return c;
}

const texCache = new Map<Kind, THREE.CanvasTexture>();
function tex(kind: Kind, aniso: number) {
  let t = texCache.get(kind);
  if (!t) {
    t = new THREE.CanvasTexture(makeCanvas(kind));
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso;
    texCache.set(kind, t);
  }
  return t;
}

/** UV em metros por projecao triplanar "box": cada face recebe o plano do eixo dominante da normal. */
export function boxUV(geo: THREE.BufferGeometry, size: number) {
  const p = geo.attributes.position, n = geo.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u: number, v: number;
    if (ay >= ax && ay >= az) { u = p.getX(i); v = p.getZ(i); }
    else if (ax >= az) { u = p.getZ(i); v = p.getY(i); }
    else { u = p.getX(i); v = p.getY(i); }
    uv[i * 2] = u / size; uv[i * 2 + 1] = v / size;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

export function upgradeMaterial(mesh: THREE.Mesh, aniso: number) {
  const src = mesh.material as THREE.MeshStandardMaterial;
  const name = src.name;
  // Vidro dos anexos: fisicamente plausivel, transparente e reflexivo
  if (name.includes('VIDRO')) {
    mesh.material = new THREE.MeshPhysicalMaterial({
      name, color: new THREE.Color(0xdfeef2), metalness: 0, roughness: 0.04, transparent: true, opacity: 0.22,
      envMapIntensity: 1.6, side: THREE.DoubleSide, depthWrite: false, specularIntensity: 1, clearcoat: 1,
    });
    mesh.castShadow = false; mesh.renderOrder = 2;
    return;
  }
  if (name.includes('LED')) {
    mesh.material = new THREE.MeshStandardMaterial({ name, color: 0xfff6e0, emissive: 0xfff1d0, emissiveIntensity: 0.4, roughness: 0.3 });
    return;
  }
  const spec = MAT_KIND[name];
  const m = src.clone();
  m.side = THREE.DoubleSide; // preserva faces com normal invertida vindas do CAD (evita "buracos")
  m.shadowSide = THREE.BackSide;
  if (/METAL|PERFIL|GRELHA|GRAFITE|GRADIL/.test(name)) { m.metalness = 0.55; m.roughness = 0.42; }
  if (spec) {
    boxUV(mesh.geometry, spec.size);
    const t = tex(spec.kind, aniso);
    m.map = t; m.bumpMap = t; m.bumpScale = spec.bump ?? 0.4; m.roughness = spec.rough; m.metalness = 0;
    if (spec.tint) m.color.multiplyScalar(spec.tint);
  }
  // Ajuste de percepcao (cor apenas, sem geometria):
  //  - entorno volumetrico em tom neutro mais baixo para o projeto se destacar
  //  - paredes da estacao (material ENTORNO no grupo estacao) em creme, conforme fotografia do local
  if (name === 'ENTORNO') {
    const layer = mesh.userData.layer;
    if (layer === 'estacao' || layer === 'cafes') m.color.setRGB(0.80, 0.72, 0.58);
    else m.color.setRGB(0.62, 0.61, 0.59);
  }
  // Superficies muito claras estouram sob sol tropical: limita albedo maximo a ~0,8
  const mx = Math.max(m.color.r, m.color.g, m.color.b);
  if (mx > 0.8) m.color.multiplyScalar(0.8 / mx);
  // Superficies planas de piso nao precisam lancar sombra (economia), apenas recebe-las
  m.needsUpdate = true;
  mesh.material = m;
}
