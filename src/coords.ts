import * as THREE from 'three';

/**
 * Referencial espacial unico do projeto.
 *
 * - "Blender/CAD local": metros, X = Leste, Y = Norte, Z = cota. Origem local = UTM E 700080 / N 7070350
 *   (SIRGAS 2000 / UTM 22S), conforme modelo_integral/LEIA_ME.md.
 * - "Three.js": Y para cima. Conversao (rotacao pura, sem escala): three(x, y, z) = blender(x, z, -y).
 *
 * Toda funcao 2D (planta, minimapa, ortofoto) usa estas duas funcoes; nao existe posicionamento manual.
 */
export const ORIGIN_UTM = { E: 700080, N: 7070350 };

export function b2t(x: number, y: number, z = 0): THREE.Vector3 {
  return new THREE.Vector3(x, z, -y);
}
export function t2b(v: THREE.Vector3): { x: number; y: number; z: number } {
  return { x: v.x, y: -v.z, z: v.y };
}
export function toUTM(x: number, y: number) {
  return { E: x + ORIGIN_UTM.E, N: y + ORIGIN_UTM.N };
}
export function fmtUTM(x: number, y: number) {
  const u = toUTM(x, y);
  return `E ${u.E.toFixed(1)} · N ${u.N.toFixed(1)}`;
}

export interface Extent { xmin: number; ymin: number; xmax: number; ymax: number }

/** coordenada local (x,y) -> fracao (u,v) de uma imagem cujo extent e conhecido (v cresce para baixo). */
export function worldToUV(x: number, y: number, e: Extent) {
  return { u: (x - e.xmin) / (e.xmax - e.xmin), v: (e.ymax - y) / (e.ymax - e.ymin) };
}
export function uvToWorld(u: number, v: number, e: Extent) {
  return { x: e.xmin + u * (e.xmax - e.xmin), y: e.ymax - v * (e.ymax - e.ymin) };
}
