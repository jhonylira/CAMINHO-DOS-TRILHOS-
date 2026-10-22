import * as THREE from 'three';

/**
 * CONTEXTO FOTOGRAFICO (v0.2)
 * ---------------------------------------------------------------------------
 * O entorno do R07 e volumetrico simplificado (caixas brancas). Para dar realismo
 * sem inventar nada, "projetamos de cima" a ORTOFOTO REAL de 5 cm (SIRGAS 2000 /
 * UTM 22S, mesmo referencial do CAD) sobre as faces HORIZONTAIS do entorno: chao,
 * quadras e telhados. Paredes continuam neutras (reboco).
 *
 * Nenhuma geometria e alterada: so a cor do pixel muda (shader). A projecao usa a
 * propria coordenada do mundo, entao o alinhamento e o mesmo da planta 2D.
 *   u = (x - xmin) / W      v = (ymax - y) / H      (x, y = coordenadas Blender/CAD)
 */
export interface OrthoDrape {
  texture: THREE.Texture;
  extent: { xmin: number; xmax: number; ymin: number; ymax: number };
  uniforms: { uOrtho: { value: THREE.Texture }; uOrthoBox: { value: THREE.Vector4 }; uOrthoOn: { value: number } };
}

/** Monta uma textura unica a partir dos tiles do nivel 1 (0,4 m/px) ja gerados pelo pipeline. */
export async function buildOrthoDrape(orthoMeta: any, base: string, maxTex: number): Promise<OrthoDrape> {
  const lvIdx = orthoMeta.levels.length > 1 ? 1 : 0;
  const lv = orthoMeta.levels[lvIdx];
  const T = orthoMeta.tile_px;
  // limita ao tamanho maximo de textura da placa de video (celulares costumam ter 4096)
  const k = Math.min(1, Math.min(maxTex, 8192) / lv.width_px);
  const W = Math.round(lv.width_px * k), H = Math.round(lv.height_px * k);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d')!;
  await Promise.all(lv.tiles.map(([tx, ty]: [number, number]) => new Promise<void>((res) => {
    const im = new Image();
    im.onload = () => { g.drawImage(im, tx * T * k, ty * T * k, T * k, T * k); res(); };
    im.onerror = () => res();
    im.src = `${base}ortho/${lvIdx}/${tx}_${ty}.webp`;
  })));
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  const e = orthoMeta.extent_local;
  // extensao real coberta pelos pixels (largura_px * m/px a partir de xmin / ymax)
  const extent = { xmin: e.xmin, xmax: e.xmin + lv.width_px * lv.meters_per_px, ymax: e.ymax, ymin: e.ymax - lv.height_px * lv.meters_per_px };
  return {
    texture: tex, extent,
    uniforms: {
      uOrtho: { value: tex },
      uOrthoBox: { value: new THREE.Vector4(extent.xmin, extent.ymax, extent.xmax - extent.xmin, extent.ymax - extent.ymin) },
      uOrthoOn: { value: 1 },
    },
  };
}

/**
 * Aplica a ortofoto em um material (entorno ou chao de fundo).
 * - faces com normal para cima  -> cor da ortofoto (onde houver cobertura)
 * - paredes                     -> reboco com leve variacao por edificio e escurecimento junto ao chao
 * - fora da cobertura da foto   -> cor de fallback (verde-acinzentado discreto)
 */
export function applyOrthoDrape(mat: THREE.MeshStandardMaterial, drape: OrthoDrape, opts: { walls?: boolean; fallback?: THREE.Color } = {}) {
  const fb = opts.fallback ?? new THREE.Color(0x8c917c);
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, drape.uniforms, { uFallback: { value: fb } });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWP; varying vec3 vWN;
uniform sampler2D uOrtho; uniform vec4 uOrthoBox; uniform float uOrthoOn; uniform vec3 uFallback;
float hash21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
{
  // three (x, y, z) -> CAD (x, -z): u a partir de xmin, v a partir de ymax (topo da imagem)
  vec2 cad = vec2(vWP.x, -vWP.z);
  vec2 uv = vec2((cad.x - uOrthoBox.x) / uOrthoBox.z, (uOrthoBox.y - cad.y) / uOrthoBox.w);
  float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  float up = smoothstep(0.55, 0.85, abs(vWN.y));
  vec2 tuv = vec2(uv.x, 1.0 - uv.y);
  vec4 o = texture2D(uOrtho, tuv);
  // de perto (< ~35 m) a foto de 0,4 m/px fica borrada: trocamos pela MEDIA de cor da regiao
  // (mipmap bem baixo) com o microdetalhe procedural do material -> superficie neutra, sem "borrao"
  float camD = distance(cameraPosition, vWP);
  float nearK = 1.0 - smoothstep(14.0, 40.0, camD);
  vec4 oAvg = texture2D(uOrtho, tuv, 5.0);
  vec3 photo = mix(o.rgb, oAvg.rgb * (0.85 + 0.3 * diffuseColor.g), nearK);
  // a foto ja traz luz e sombra do voo: compensamos levemente para nao "dobrar" a sombra
  photo = pow(photo, vec3(0.95)) * 1.08;
  float a = mix(o.a, oAvg.a, nearK) * inside * uOrthoOn;
  float hcell = hash21(floor(cad / 9.0));
  // fora da cobertura da foto: chao neutro; telhados (acima de 1,5 m) em fibrocimento/ceramica variados
  vec3 roofFb = mix(vec3(0.50, 0.50, 0.48), vec3(0.50, 0.27, 0.18), step(0.62, hcell)) * (0.85 + 0.25 * fract(hcell * 7.31));
  vec3 fb = mix(uFallback, roofFb, step(1.5, vWP.y));
  vec3 ground = mix(fb, photo, a);
  ${opts.walls === false ? '' : `
  // paredes: variacao suave de tom por edificio (celula de 9 m) e "pe" mais escuro (oclusao falsa)
  float h = hcell;
  vec3 wall = diffuseColor.rgb * (0.9 + 0.16 * h) * vec3(1.0, 0.985 - 0.03*h, 0.95 + 0.02*h);
  wall *= mix(0.75, 1.0, smoothstep(0.0, 2.5, vWP.y + 0.9));
  diffuseColor.rgb = mix(wall, ground, up);`}
  ${opts.walls === false ? 'diffuseColor.rgb = ground;' : ''}
}`);
  };
  mat.customProgramCacheKey = () => `ortho_${opts.walls === false ? 0 : 1}`;
  mat.needsUpdate = true;
}
