import * as THREE from 'three';

/**
 * Materiais "archviz" em tempo real (v0.3 — texturas fotograficas PBR CC0).
 * ---------------------------------------------------------------------------
 * Principio: a COR SEMANTICA do autor (baseColorFactor do GLB) e preservada.
 *  - Cada superficie recebe uma foto PBR real (Poly Haven / ambientCG, CC0): cor (diff),
 *    relevo (normal map OpenGL) e rugosidade. Creditos em public/textures/CREDITOS.md.
 *  - Ao carregar a foto, medimos a sua cor MEDIA (copia reduzida num canvas, em espaco linear)
 *    e fazemos  material.color = corDoAutor / mediaDaFoto. Resultado: o albedo medio da
 *    superficie e exatamente a cor do autor; a foto contribui so com grao, juntas e variacao.
 *  - UV em metros (projecao "box") com o tamanho real fotografado de cada textura.
 *  - Superficies grandes (asfalto, fulget, grama, lastro) recebem "anti-repeticao": a foto e
 *    misturada com ela mesma em outra escala/rotacao e modulada por um ruido de 6 a 20 m.
 *  - Nenhuma geometria e alterada: relevo e apenas visual (normal map).
 */
type Kind = 'asphalt' | 'aggregate' | 'concrete' | 'grass' | 'groundcover' | 'soil' | 'gravel' | 'brick' | 'tile' | 'wood' | 'plaster' | 'red';

interface Spec {
  kind: Kind;
  asset: string;    // pasta em public/textures
  size: number;     // metros cobertos por uma repeticao da foto (medida real do escaneamento)
  rough: number;    // rugosidade: constante, ou multiplicador quando roughMap = true
  roughMap?: boolean; // so vale a pena onde a foto tem variacao real de brilho (asfalto trincado, madeira)
  normal?: number;  // intensidade do normal map
  contrast?: number; // 1 = foto original; <1 aproxima da media; >1 acentua o grao (a media nao muda)
  antiTile?: boolean;
  macro?: number;   // amplitude da variacao de grande escala (0..0,3)
  macroTint?: [number, number, number]; // matiz das manchas (ex.: grama mais seca)
  tint?: number;
  /**
   * Calibracao fisica de albedo (so vegetacao): as cores-diagrama do autor para grama sao mais
   * claras que um gramado real (albedo ~0,15-0,25). O MATIZ semantico e mantido; so o brilho medio
   * e multiplicado por este fator. Para voltar a cor exata do GLB, use 1.
   */
  albedo?: number;
  /** 0..1: quanto da variacao de COR da foto e mantida (padrao por tipo em CHROMA). */
  chroma?: number;
}

/**
 * Quando o matiz da foto difere muito do matiz do autor (ex.: concreto cinza usado na faixa vermelha),
 * a divisao canal a canal amplifica o ruido de um canal so e gera pintas de outra cor. Por isso cada
 * tipo guarda so parte da cor da foto; o restante vira modulacao de luminancia sobre a cor do autor.
 */
const CHROMA: Record<Kind, number> = {
  asphalt: 0.5, aggregate: 0.5, concrete: 0.25, red: 0.0, grass: 0.3, groundcover: 0.3, soil: 0.3,
  gravel: 0.4, brick: 0.85, tile: 0.6, wood: 0.7, plaster: 0.3,
};

const A04 = 'asphalt_04', A02 = 'asphalt_02', FUL = 'gravel_embedded_concrete', CLI = 'concrete_wall_008', GRA = 'granular_concrete';
const GRASS: Omit<Spec, 'kind'> = { asset: 'Grass004', size: 1.6, rough: 0.97, normal: 1.0, contrast: 1.2, antiTile: true, macro: 0.2, macroTint: [1.12, 1.03, 0.72], albedo: 0.72 };
const SOIL: Omit<Spec, 'kind'> = { asset: 'farm_soil', size: 2.0, rough: 1.0, normal: 1.0, contrast: 1.0, antiTile: true, macro: 0.1 };
const WOOD: Omit<Spec, 'kind'> = { asset: 'oak_veneer_01', size: 1.5, rough: 1.25, roughMap: true, normal: 0.5, contrast: 0.9 };
const PLASTER: Omit<Spec, 'kind'> = { asset: 'painted_plaster_wall', size: 3.0, rough: 0.92, normal: 0.35 };
const MAT_KIND: Record<string, Spec> = {
  'EP_ASFALTO': { kind: 'asphalt', asset: A04, size: 4.04, rough: 0.93, normal: 0.8, contrast: 1.0, antiTile: true, macro: 0.12 },
  'Cracked asphalt': { kind: 'asphalt', asset: A02, size: 3.0, rough: 1.15, roughMap: true, normal: 0.8, contrast: 0.9, antiTile: true, macro: 0.12 },
  'EP_CONCRETO_FULGET_CINZA': { kind: 'aggregate', asset: FUL, size: 2.0, rough: 0.86, normal: 1.0, contrast: 1.05, antiTile: true, macro: 0.07, tint: 1.04 },
  'EP_PERMANENCIA_FULGET_TERROSO': { kind: 'aggregate', asset: FUL, size: 2.0, rough: 0.86, normal: 1.0, contrast: 1.05, antiTile: true, macro: 0.07, tint: 1.03 },
  'R10_FULGET_TERROSO_PLACAS': { kind: 'aggregate', asset: FUL, size: 2.0, rough: 0.86, normal: 1.0, contrast: 1.05, antiTile: true, macro: 0.07 },
  'EP_GUIA_CONCRETO': { kind: 'concrete', asset: CLI, size: 2.71, rough: 0.8, normal: 0.7, contrast: 0.9 },
  'EP_R02_CONCRETO_BRANCO_FLOREIRA': { kind: 'concrete', asset: CLI, size: 2.71, rough: 0.8, normal: 0.7, contrast: 0.8 },
  'R06_CONCRETO_CLARO_FOSCO_MICROAGREGADO': { kind: 'concrete', asset: GRA, size: 2.4, rough: 0.82, normal: 0.7, contrast: 0.85 },
  'EP_FAIXA_ESPECIAL_CIMENTICIO': { kind: 'red', asset: GRA, size: 2.4, rough: 0.82, normal: 0.8, contrast: 1.0, antiTile: true, macro: 0.07 },
  'EP_CANTEIRO': { kind: 'grass', ...GRASS },
  'EP_VEGETACAO_BAIXA': { kind: 'grass', ...GRASS },
  'EP_R02_VEGETACAO_BAIXA_MASSA': { kind: 'groundcover', asset: 'Grass001', size: 1.4, rough: 0.95, normal: 1.1, contrast: 1.15, antiTile: true, macro: 0.2, macroTint: [0.85, 1.0, 0.8], albedo: 0.72 },
  'EP_R02_SOLO_ORGANICO_ESCUR0': { kind: 'soil', ...SOIL },
  'R03_SOLO_AERADO': { kind: 'soil', ...SOIL },
  'R15_SOLO_LOTE_VIZINHO_PRIVADO': { kind: 'soil', ...SOIL },
  'EP_LASTRO': { kind: 'gravel', asset: 'gray_rocks', size: 1.8, rough: 0.9, normal: 1.3, contrast: 1.0, antiTile: true, macro: 0.1 },
  'Brick Wall': { kind: 'brick', asset: 'red_brick', size: 1.4, rough: 0.9, normal: 1.0, contrast: 1.0 },
  'R03_TIJOLINHO_BASE_CAFE_BISTRO': { kind: 'brick', asset: 'red_brick', size: 1.4, rough: 0.9, normal: 1.0, contrast: 1.0 },
  'R13_TELHA_CERAMICA': { kind: 'tile', asset: 'clay_roof_tiles_02', size: 2.5, rough: 0.82, normal: 1.0, contrast: 1.0 },
  'WOOD': { kind: 'wood', ...WOOD, size: 1.83 },
  'EP_MADEIRA_BANCO': { kind: 'wood', ...WOOD },
  'R15_MADEIRA_RIPADO_SUAVE': { kind: 'wood', ...WOOD },
  'R10_MADEIRA_SUAVE': { kind: 'wood', ...WOOD },
  // ENTORNO / R10_BRANCO_QUENTE: apenas map/normalMap simples (sem onBeforeCompile proprio):
  // no layer 'entorno' o main.ts aplica depois a ortofoto via onBeforeCompile.
  'ENTORNO': { kind: 'plaster', ...PLASTER },
  'R10_BRANCO_QUENTE': { kind: 'plaster', ...PLASTER },
  'R15_FECHAMENTO_NEUTRO': { kind: 'plaster', ...PLASTER, contrast: 0.8 },
  'R15_MURETA_DIVISA': { kind: 'concrete', asset: CLI, size: 2.71, rough: 0.82, normal: 0.7, contrast: 0.9 },
  'R15_BALCAO_CLARO': { kind: 'concrete', asset: GRA, size: 2.4, rough: 0.7, normal: 0.4, contrast: 0.6 },
};
/** Materiais que o main.ts cobre com a ortofoto (onBeforeCompile proprio): nao instalar shader aqui. */
const NO_SHADER = new Set(['ENTORNO', 'R10_BRANCO_QUENTE']);
/** Materiais de biblioteca do Blender exportados sem imagem (cor branca 0,8): usar a cor natural da foto. */
const PHOTO_COLOR = new Set(['Cracked asphalt', 'Brick Wall']);

// ------------------------------------------------------------------ carregamento das fotos
interface TexSet { diff: THREE.Texture; nor: THREE.Texture; rough: THREE.Texture | null; mean: THREE.Color }
const BASE: string = (import.meta as any).env?.BASE_URL ?? '/';
const loader = new THREE.TextureLoader();
const setCache = new Map<string, Promise<TexSet>>();

const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

/** Cor media da foto em espaco linear (o mesmo espaco em que o shader multiplica as cores). */
function meanColor(img: CanvasImageSource): THREE.Color {
  const S = 32;
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0, S, S);
  const d = g.getImageData(0, 0, S, S).data;
  let r = 0, gg = 0, b = 0;
  for (let i = 0; i < d.length; i += 4) { r += srgbToLinear(d[i] / 255); gg += srgbToLinear(d[i + 1] / 255); b += srgbToLinear(d[i + 2] / 255); }
  const n = d.length / 4;
  return new THREE.Color(Math.max(r / n, 1e-3), Math.max(gg / n, 1e-3), Math.max(b / n, 1e-3));
}

function loadTex(url: string, srgb: boolean, aniso: number): Promise<THREE.Texture> {
  return new Promise((res, rej) => loader.load(url, (t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = aniso;
    res(t);
  }, undefined, rej));
}

/** Rugosidade em mapa apenas onde ha variacao real; nos demais usamos constante (menos bytes e memoria). */
const ROUGH_ASSETS = new Set(['asphalt_02', 'oak_veneer_01']);

function loadSet(asset: string, aniso: number): Promise<TexSet> {
  let p = setCache.get(asset);
  if (!p) {
    const dir = `${BASE}textures/${asset}/`;
    p = Promise.all([
      loadTex(dir + 'diff.webp', true, aniso),
      loadTex(dir + 'nor.webp', false, aniso),
      ROUGH_ASSETS.has(asset) ? loadTex(dir + 'rough.webp', false, aniso) : Promise.resolve(null),
    ]).then(([diff, nor, rough]) => ({ diff, nor, rough, mean: meanColor(diff.image as CanvasImageSource) }));
    setCache.set(asset, p);
  }
  return p;
}

// ------------------------------------------------------------------ UV em metros
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

/**
 * UV de telhado: nas aguas inclinadas, u segue a horizontal (beiral) e v desce pela inclinacao,
 * de modo que as fiadas de telha ficam paralelas ao beiral em qualquer orientacao da cobertura.
 * Faces verticais/horizontais caem no boxUV comum.
 */
function roofUV(geo: THREE.BufferGeometry, size: number) {
  boxUV(geo, size);
  const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv as THREE.BufferAttribute;
  const N = new THREE.Vector3(), T = new THREE.Vector3(), B = new THREE.Vector3(), P = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < p.count; i++) {
    N.set(n.getX(i), n.getY(i), n.getZ(i)).normalize();
    if (Math.abs(N.y) < 0.15 || Math.abs(N.y) > 0.985) continue;
    T.crossVectors(UP, N).normalize(); B.crossVectors(N, T).normalize();
    P.set(p.getX(i), p.getY(i), p.getZ(i));
    uv.setXY(i, P.dot(T) / size, P.dot(B) / size);
  }
  uv.needsUpdate = true;
}

// ------------------------------------------------------------------ shader: contraste + anti-repeticao
const CT_COMMON = /* glsl */ `
uniform vec3 uMean; uniform float uContrast; uniform float uMacro; uniform float uTile; uniform vec3 uMacroTint; uniform float uChroma;
float ctHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float ctNoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(ctHash(i), ctHash(i+vec2(1.0,0.0)), f.x), mix(ctHash(i+vec2(0.0,1.0)), ctHash(i+vec2(1.0,1.0)), f.x), f.y); }`;

const CT_MAP = /* glsl */ `
#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D( map, vMapUv );
  #ifdef CT_ANTITILE
  {
    vec2 wm = vMapUv * uTile;                       // coordenada em metros
    float n1 = ctNoise(wm / 6.0);
    float n2 = ctNoise(wm / 19.0 + 7.3);
    // a mesma foto em outra escala e rotacao, misturada por manchas: quebra o padrao em grade
    vec2 ruv = mat2(0.8, -0.6, 0.6, 0.8) * vMapUv * 0.43 + vec2(0.37, 0.71);
    vec4 s2 = texture2D( map, ruv );
    sampledDiffuseColor.rgb = mix(sampledDiffuseColor.rgb, s2.rgb, smoothstep(0.3, 0.75, n1) * 0.6);
    // variacao lenta de tom (desgaste, umidade, manchas de grama seca)
    float m = (n1 * 0.45 + n2 * 0.55 - 0.5) * 2.0;
    sampledDiffuseColor.rgb *= (1.0 + m * uMacro);
    sampledDiffuseColor.rgb *= mix(vec3(1.0), uMacroTint, smoothstep(0.55, 0.85, n2));
  }
  #endif
  // matiz: com uChroma = 0 so a LUMINANCIA da foto modula a cor do autor (sem manchas de outra cor);
  // com 1 a variacao de cor da foto e mantida. Nos dois casos a media continua igual a uMean.
  {
    const vec3 LW = vec3(0.2126, 0.7152, 0.0722);
    float lt = dot(sampledDiffuseColor.rgb, LW), lm = max(dot(uMean, LW), 1e-4);
    sampledDiffuseColor.rgb = mix(uMean * (lt / lm), sampledDiffuseColor.rgb, uChroma);
  }
  // contraste do grao: <=1 aproxima linearmente da media; >1 acentua de forma multiplicativa
  // (escurece frestas sem "estourar" os claros em branco)
  if (uContrast <= 1.0) sampledDiffuseColor.rgb = mix(uMean, sampledDiffuseColor.rgb, uContrast);
  else sampledDiffuseColor.rgb = uMean * pow(max(sampledDiffuseColor.rgb / uMean, vec3(1e-3)), vec3(uContrast));
  diffuseColor *= sampledDiffuseColor;
  diffuseColor.rgb = min(diffuseColor.rgb, vec3(0.9));   // albedo fisicamente plausivel
#endif`;

function installShader(m: THREE.MeshStandardMaterial, spec: Spec) {
  const u = {
    uMean: { value: new THREE.Color(0.5, 0.5, 0.5) },
    uContrast: { value: spec.contrast ?? 1 },
    uChroma: { value: spec.chroma ?? CHROMA[spec.kind] },
    uMacro: { value: spec.macro ?? 0 },
    uTile: { value: spec.size },
    uMacroTint: { value: new THREE.Vector3(...(spec.macroTint ?? [1, 1, 1])) },
  };
  m.userData.ctUniforms = u;
  const anti = !!spec.antiTile;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    if (anti) sh.defines = { ...(sh.defines || {}), CT_ANTITILE: '' };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + CT_COMMON)
      .replace('#include <map_fragment>', CT_MAP);
  };
  m.customProgramCacheKey = () => `ct${anti ? 1 : 0}`;
}

// ------------------------------------------------------------------ API publica
export function upgradeMaterial(mesh: THREE.Mesh, aniso: number) {
  const src = mesh.material as THREE.MeshStandardMaterial;
  const name = src.name;
  // Vidro dos anexos (cafes/bistro): transparente, reflexivo, com leve tom esverdeado de vidro float
  if (name.includes('VIDRO')) {
    mesh.material = new THREE.MeshPhysicalMaterial({
      name, color: new THREE.Color(0xd3e6e2), metalness: 0, roughness: 0.03, transparent: true, opacity: 0.2,
      envMapIntensity: 1.5, side: THREE.DoubleSide, depthWrite: false, ior: 1.52, specularIntensity: 1,
      specularColor: new THREE.Color(0xeaf6f4), clearcoat: 0.6, clearcoatRoughness: 0.02,
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
  if (/METAL|PERFIL|GRELHA|GRAFITE|GRADIL/.test(name)) { m.metalness = 0.6; m.roughness = 0.4; m.envMapIntensity = 1.1; }

  // Ajuste de percepcao (cor apenas, sem geometria):
  //  - entorno volumetrico em tom neutro mais baixo para o projeto se destacar
  //  - paredes da estacao (material ENTORNO no grupo estacao) em creme, conforme fotografia do local
  if (name === 'ENTORNO') {
    const layer = mesh.userData.layer;
    if (layer === 'estacao' || layer === 'cafes') m.color.setRGB(0.80, 0.72, 0.58);
    else m.color.setRGB(0.62, 0.61, 0.59);
  }
  if (spec?.tint) m.color.multiplyScalar(spec.tint);
  // Superficies muito claras estouram sob sol tropical: limita albedo maximo a ~0,8
  const mx = Math.max(m.color.r, m.color.g, m.color.b);
  if (mx > 0.8) m.color.multiplyScalar(0.8 / mx);

  if (spec) {
    if (spec.kind === 'tile') roofUV(mesh.geometry, spec.size); else boxUV(mesh.geometry, spec.size);
    m.metalness = 0;
    const author = m.color.clone();
    if (spec.albedo) author.multiplyScalar(spec.albedo);
    m.userData.authorColor = author;
    if (!NO_SHADER.has(name)) installShader(m, spec);
    // A foto chega de forma assincrona: ate la, a superficie mostra a cor lisa do autor.
    loadSet(spec.asset, aniso).then((t) => {
      if (PHOTO_COLOR.has(name)) author.copy(t.mean);
      m.map = t.diff; m.normalMap = t.nor;
      m.roughnessMap = spec.roughMap ? t.rough : null;
      const ns = spec.normal ?? 1; m.normalScale.set(ns, ns);
      m.roughness = spec.rough;
      // cor do material = cor do autor / media da foto  ->  albedo medio = cor do autor
      m.color.setRGB(
        THREE.MathUtils.clamp(author.r / t.mean.r, 0, 8),
        THREE.MathUtils.clamp(author.g / t.mean.g, 0, 8),
        THREE.MathUtils.clamp(author.b / t.mean.b, 0, 8),
      );
      if (m.userData.ctUniforms) m.userData.ctUniforms.uMean.value.copy(t.mean);
      m.needsUpdate = true;
    }).catch((err) => console.warn('textura indisponivel:', spec.asset, err));
  }
  m.needsUpdate = true;
  mesh.material = m;
}
