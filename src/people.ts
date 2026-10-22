import * as THREE from 'three';

/**
 * PESSOAS EM SILHUETA (estilo "figura de escala" do SketchUp / pranchas de arquitetura).
 *
 * O que é: recortes chapados quase pretos de pessoas reais (atlas PNG com transparência em
 * `public/people/silhuetas.png` + `silhuetas.json`, gerados por `pipeline/silhuetas.py`).
 * Servem APENAS para dar escala humana e vida à cena: são ilustrativas e NÃO representam
 * fluxo, contagem, demanda ou comportamento de pedestres/ciclistas.
 *
 * Técnica — billboard cilíndrico:
 *  - Uma única malha instanciada (InstancedMesh) de um quadrado unitário com pivô na base
 *    (centro dos pés). Cada instância recebe por atributo o retângulo UV da figura no atlas
 *    (`iUv`) e o tamanho em metros (`iSize` = largura, altura, espelhamento).
 *  - No vertex shader o quadrado é "girado" para ficar sempre de frente para a câmera, mas
 *    só em torno do eixo vertical (Y): a figura nunca tomba, mesmo vista de cima. Usa-se o
 *    vetor "direita" da câmera projetado no plano horizontal (robusto em vista ortogonal).
 *  - Sombra: `customDepthMaterial` repete o mesmo billboard + recorte alfa. No passe de
 *    sombra a "câmera" é a própria luz do sol, então a silhueta se vira para o sol e projeta
 *    no piso uma sombra recortada com o desenho da pessoa.
 *  - Cor: MeshBasicMaterial (sem iluminação) com `toneMapped = false` → mantém o cinza-quase-
 *    preto #1a1a1a constante como no SketchUp; a neblina (fog) da cena ainda atua.
 *
 * Referencial: entrada em coordenadas CAD/Blender locais (x Leste, y Norte, z cota);
 * no three.js a posição é (x, z, -y), conforme `coords.ts`. O grupo deve ficar sem rotação.
 */

export interface PersonData { x: number; y: number; z: number; rot: number; kind: number }

type FigKind = 'walk' | 'stand' | 'bike' | 'child';
interface AtlasFigure { u0: number; v0: number; u1: number; v1: number; aspect: number; kind: FigKind }
interface AtlasJson { figures: AtlasFigure[] }

/** gerador pseudoaleatório determinístico (mulberry32): mesma cena sempre gera as mesmas figuras */
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

// Trecho GLSL comum (cor e sombra): substitui <begin_vertex> pelo billboard cilíndrico.
const BILLBOARD_PARS = /* glsl */ `
attribute vec4 iUv;   // u0, v0, u1, v1 no atlas
attribute vec3 iSize; // largura (m), altura (m), espelhar (+1 / -1)
`;
const BILLBOARD_VERTEX = /* glsl */ `
  // vetor "direita" da câmera em coordenadas de mundo = 1a linha da matriz de vista
  vec3 bbRight = vec3( viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0] );
  bbRight.y = 0.0;
  float bbLen = length( bbRight );
  bbRight = bbLen > 1e-4 ? bbRight / bbLen : vec3( 1.0, 0.0, 0.0 );
  // leva para o espaço do objeto (o grupo/instâncias não devem ter rotação; isto só tolera rotação pura)
  bbRight = normalize( transpose( mat3( modelMatrix ) ) * bbRight );
  vec3 transformed = bbRight * ( position.x * iSize.x ) + vec3( 0.0, position.y * iSize.y, 0.0 );
`;
const BILLBOARD_UV = /* glsl */ `
  {
    float bbU = iSize.z < 0.0 ? 1.0 - uv.x : uv.x;
    vMapUv = vec2( mix( iUv.x, iUv.z, bbU ), mix( iUv.y, iUv.w, uv.y ) );
  }
`;
// o atlas é preto com alfa: só o alfa interessa; a cor vem de material.color
const ALPHA_ONLY_MAP = /* glsl */ `
#ifdef USE_MAP
  diffuseColor.a *= texture2D( map, vMapUv ).a;
#endif
`;

function patch(sh: THREE.WebGLProgramParametersWithUniforms) {
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\n' + BILLBOARD_PARS)
    .replace('#include <begin_vertex>', BILLBOARD_VERTEX)
    .replace('#include <uv_vertex>', '#include <uv_vertex>\n' + BILLBOARD_UV);
  sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', ALPHA_ONLY_MAP);
}

export async function buildSilhouettes(people: PersonData[], base: string): Promise<THREE.Group> {
  const group = new THREE.Group();
  group.name = 'pessoas_silhuetas';
  if (!people.length) return group;

  let atlas: AtlasJson;
  let tex: THREE.Texture;
  try {
    const [json, t] = await Promise.all([
      fetch(`${base}people/silhuetas.json`).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<AtlasJson>;
      }),
      new THREE.TextureLoader().loadAsync(`${base}people/silhuetas.png`),
    ]);
    atlas = json; tex = t;
  } catch (err) {
    console.warn('[pessoas] atlas de silhuetas indisponível:', err);
    return group;
  }
  const figs = atlas.figures ?? [];
  if (!figs.length) return group;

  tex.colorSpace = THREE.NoColorSpace; // só usamos o canal alfa
  tex.anisotropy = 4;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;

  // grupos de figuras por tipo
  const pool: Record<FigKind, number[]> = { walk: [], stand: [], bike: [], child: [] };
  figs.forEach((f, i) => (pool[f.kind] ?? pool.walk).push(i));
  const adults = [...pool.walk, ...pool.stand];
  const pick = (arr: number[], r: number) => arr[Math.min(arr.length - 1, Math.floor(r * arr.length))];

  // quadrado unitário com pivô no centro da base: x ∈ [-0.5, 0.5], y ∈ [0, 1]
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.translate(0, 0.5, 0);
  const n = people.length;
  const aUv = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
  const aSize = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
  geo.setAttribute('iUv', aUv);
  geo.setAttribute('iSize', aSize);

  const mat = new THREE.MeshBasicMaterial({
    color: 0x1a1a1a, map: tex, alphaTest: 0.5, side: THREE.DoubleSide,
    transparent: false, depthWrite: true, fog: true,
  });
  mat.toneMapped = false;
  mat.onBeforeCompile = patch;
  mat.customProgramCacheKey = () => 'pessoas_silhuetas_v1';

  const depth = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.5, side: THREE.DoubleSide,
  });
  depth.onBeforeCompile = patch;
  depth.customProgramCacheKey = () => 'pessoas_silhuetas_depth_v1';

  const im = new THREE.InstancedMesh(geo, mat, n);
  im.name = 'pessoas_silhuetas_instancias';
  im.customDepthMaterial = depth;
  im.castShadow = true;
  im.receiveShadow = false;
  im.frustumCulled = false; // o billboard gira no shader; a esfera envolvente padrão não vale

  const m = new THREE.Matrix4();
  people.forEach((p, i) => {
    const r = rng(((i + 1) * 2654435761) ^ (((p.kind | 0) + 7) * 40503));
    const a = r(), b = r(), c = r(), d = r();
    let idx: number;
    let h: number;
    if (a < 0.1 && pool.bike.length) { idx = pick(pool.bike, b); h = 1.62 + c * 0.16; }
    else if (a < 0.18 && pool.child.length) { idx = pick(pool.child, b); h = 1.1 + c * 0.2; }
    else {
      // kind par → preferência por caminhando; ímpar → parado (só viés, mantendo variedade)
      const pref = (Math.abs(p.kind | 0) % 2 === 0 ? pool.walk : pool.stand);
      const list = pref.length && b < 0.7 ? pref : adults.length ? adults : figs.map((_, k) => k);
      idx = pick(list, r());
      h = 1.55 + c * 0.3;
    }
    const f = figs[idx];
    aUv.setXYZW(i, f.u0, f.v0, f.u1, f.v1);
    aSize.setXYZ(i, h * f.aspect, h, d < 0.5 ? 1 : -1);
    m.makeTranslation(p.x, p.z, -p.y);
    im.setMatrixAt(i, m);
  });
  im.instanceMatrix.needsUpdate = true;
  group.add(im);
  return group;
}
