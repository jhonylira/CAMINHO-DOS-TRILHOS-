/**
 * EIXO CENTRAL DA FERROVIA (v0.3)
 * ---------------------------------------------------------------------------
 * Polilinha extraida da propria geometria dos trilhos do R07 (pipeline/eixo_ferroviario.mjs):
 * media transversal dos dois trilhos EP_METAL. Coordenadas CAD locais (x Leste, y Norte).
 *
 * "Estaca" = distancia em metros medida AO LONGO do eixo, a partir da ponta oeste (estaca 0).
 * As tags dos trechos sao definidas por estaca -> ficam SEMPRE exatamente sobre o eixo,
 * em vez de coordenadas digitadas a mao (que podem ficar deslocadas).
 */
export interface RailAxis { pts: [number, number][]; cum: number[]; length: number }

export async function loadAxis(base: string): Promise<RailAxis> {
  const r = await fetch(base + 'data/rail_axis.json');
  const j = await r.json();
  const pts = j.points as [number, number][];
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, cum, length: cum[cum.length - 1] };
}

/** Ponto do eixo na estaca s (m) + direcao tangente unitaria. */
export function pointAt(ax: RailAxis, s: number): { x: number; y: number; tx: number; ty: number } {
  s = Math.max(0, Math.min(ax.length, s));
  let i = 1; while (i < ax.cum.length - 1 && ax.cum[i] < s) i++;
  const [x0, y0] = ax.pts[i - 1], [x1, y1] = ax.pts[i];
  const L = ax.cum[i] - ax.cum[i - 1] || 1, t = (s - ax.cum[i - 1]) / L;
  return { x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, tx: (x1 - x0) / L, ty: (y1 - y0) / L };
}

/** Projecao de um ponto qualquer no eixo: estaca e afastamento lateral (m). */
export function nearest(ax: RailAxis, x: number, y: number): { s: number; d: number } {
  let best = { s: 0, d: Infinity };
  for (let i = 1; i < ax.pts.length; i++) {
    const [ax0, ay0] = ax.pts[i - 1], [bx, by] = ax.pts[i];
    const vx = bx - ax0, vy = by - ay0, l2 = vx * vx + vy * vy || 1;
    const t = Math.max(0, Math.min(1, ((x - ax0) * vx + (y - ay0) * vy) / l2));
    const d = Math.hypot(x - ax0 - t * vx, y - ay0 - t * vy);
    if (d < best.d) best = { s: ax.cum[i - 1] + t * Math.sqrt(l2), d };
  }
  return best;
}
