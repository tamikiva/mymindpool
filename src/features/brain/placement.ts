import { areaCentroid, bounds, chord, pointInPolygon, type Pt } from "./geometry";
import { MIN_FONT, blockSize, layoutLabel, type LabelLayout } from "./labels";

/** Margen extra del bloque: cubre la leve rotación del texto y evita que toque las paredes. */
export const FIT_MARGIN = 1.06;

/** ¿Las cuatro esquinas del bloque (con margen) caen dentro del sector? */
export function blockFits(poly: readonly Pt[], cx: number, cy: number, label: LabelLayout): boolean {
  const { w, h } = blockSize(label);
  const hw = (w * FIT_MARGIN) / 2;
  const hh = (h * FIT_MARGIN) / 2;
  return [-1, 1].every((sx) => [-1, 1].every((sy) => pointInPolygon({ x: cx + sx * hw, y: cy + sy * hh }, poly)));
}

/**
 * Busca, dentro del sector, el punto donde el nombre se lee más grande sin salirse de las
 * paredes. Es costoso: memorizar el resultado por (sector, cantidad, nombre).
 */
export function placeLabel(poly: Pt[], name: string): { label: LabelLayout; cx: number; cy: number } {
  const c = areaCentroid(poly);
  const b = bounds(poly);
  let best: { label: LabelLayout; cx: number; cy: number; score: number } | null = null;
  const STEP = 5;
  for (let y = b.minY + STEP; y < b.maxY; y += STEP) {
    const h = chord(poly, "y", y);
    if (!h) continue;
    for (let x = Math.max(b.minX + STEP, h[0]); x < Math.min(b.maxX, h[1]); x += STEP) {
      const v = chord(poly, "x", x);
      if (!v) continue;
      const halfW = Math.min(x - h[0], h[1] - x);
      const halfH = Math.min(y - v[0], v[1] - y);
      if (halfW < 8 || halfH < 5) continue;
      let k = 0.95;
      let label = layoutLabel(name, 2 * halfW * k, 2 * halfH * k);
      for (let tries = 0; tries < 8 && !blockFits(poly, x, y, label); tries++) {
        k *= 0.88;
        label = layoutLabel(name, 2 * halfW * k, 2 * halfH * k);
      }
      if (!blockFits(poly, x, y, label)) continue;
      // Más grande es mejor; entre iguales, el más cercano al centro del sector; sin acortar si se puede.
      const score = label.fontSize - 0.002 * Math.hypot(x - c.x, y - c.y) - (label.truncated ? 8 : 0);
      if (!best || score > best.score) best = { label, cx: x, cy: y, score };
    }
  }
  if (best) return best;
  // Sector diminuto: se usa el centroide con el tamaño mínimo y el nombre acortado.
  return { label: { ...layoutLabel(name, 40, 24), fontSize: MIN_FONT }, cx: c.x, cy: c.y };
}
