/**
 * Ubica el nombre de una pileta dentro de su piso visible, con el ángulo que mejor siga su forma.
 * Código puro. Coordenadas del mundo escaladas por LABEL_SCALE (las mismas del dibujo plano).
 */
import { pointInPolygon, type Pt } from "../brain/geometry";
import { CHAR_W, LINE_H, MIN_FONT, blockSize, layoutLabel, truncatedLayout, type LabelLayout } from "../brain/labels";

export interface RotatedLabel {
  label: LabelLayout;
  cx: number;
  cy: number;
  /** Ángulo de la línea de base respecto del eje x, en radianes (eje y hacia abajo). */
  angle: number;
}

const MARGIN = 1.08;
const ANGLES = [-0.6, -0.5, -0.4, -0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6];

/** El polígono rasterizado a 1 unidad: consultar «¿está adentro?» pasa a ser una lectura de tabla. */
class Mask {
  private readonly w: number;
  private readonly h: number;
  private readonly data: Uint8Array;
  constructor(poly: readonly Pt[], private readonly x0: number, private readonly y0: number, x1: number, y1: number) {
    this.w = Math.ceil(x1 - x0) + 3;
    this.h = Math.ceil(y1 - y0) + 3;
    this.data = new Uint8Array(this.w * this.h);
    for (let j = 0; j < this.h; j++) for (let i = 0; i < this.w; i++) this.data[j * this.w + i] = pointInPolygon({ x: x0 + i, y: y0 + j }, poly) ? 1 : 0;
  }
  has(x: number, y: number): boolean {
    const i = Math.round(x - this.x0);
    const j = Math.round(y - this.y0);
    return i >= 0 && j >= 0 && i < this.w && j < this.h && this.data[j * this.w + i] === 1;
  }
}

function extent(m: Mask, x: number, y: number, dx: number, dy: number, max: number): number {
  let d = 0;
  while (d < max && m.has(x + dx * (d + 1), y + dy * (d + 1))) d++;
  return d;
}

function fitsMask(m: Mask, cx: number, cy: number, angle: number, label: LabelLayout): boolean {
  const { w, h } = blockSize(label);
  const hw = (w * MARGIN) / 2;
  const hh = (h * MARGIN) / 2;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  for (const a of [-1, -0.5, 0, 0.5, 1]) {
    for (const b of [-1, 0, 1]) {
      const u = a * hw;
      const v = b * hh;
      if (!m.has(cx + u * c - v * s, cy + u * s + v * c)) return false;
    }
  }
  return true;
}

/** ¿El bloque girado `angle` (con margen) queda por completo dentro del polígono? */
export function rotatedBlockFits(poly: readonly Pt[], cx: number, cy: number, angle: number, label: LabelLayout): boolean {
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  return fitsMask(new Mask(poly, Math.min(...xs) - 1, Math.min(...ys) - 1, Math.max(...xs), Math.max(...ys)), cx, cy, angle, label);
}

export function placeLabelRotated(poly: Pt[], name: string, maxFont: number, angles: readonly number[] = ANGLES, minFont: number = MIN_FONT): RotatedLabel {
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  const mask = new Mask(poly, x0 - 1, y0 - 1, x1, y1);
  // Búsqueda de grueso a fino: la pasada rápida resuelve casi todo; la fina solo si el nombre no entró entero.
  const search = (STEP: number) => {
    let found: (RotatedLabel & { score: number }) | null = null;
    for (let y = y0 + STEP; y < y1; y += STEP) {
      for (let x = x0 + STEP; x < x1; x += STEP) {
        if (!mask.has(x, y)) continue;
        for (const angle of angles) {
          const ux = Math.cos(angle);
          const uy = Math.sin(angle);
          const halfW = Math.min(extent(mask, x, y, ux, uy, 90), extent(mask, x, y, -ux, -uy, 90));
          const halfH = Math.min(extent(mask, x, y, -uy, ux, 40), extent(mask, x, y, uy, -ux, 40));
          if (halfW < 8 || halfH < 4.5) continue;
          let k = 1;
          let label = layoutLabel(name, 2 * halfW * k, 2 * halfH * k, maxFont, minFont);
          for (let t = 0; t < 8 && !fitsMask(mask, x, y, angle, label); t++) {
            k *= 0.9;
            label = layoutLabel(name, 2 * halfW * k, 2 * halfH * k, maxFont, minFont);
          }
          if (!fitsMask(mask, x, y, angle, label)) continue;
          // Más grande es mejor; sin acortar el nombre; y poco giro entre iguales.
          const score = label.fontSize - (label.truncated ? 8 : 0) - Math.abs(angle - 0.1) * 1.5;
          if (!found || score > found.score) found = { label, cx: x, cy: y, angle, score };
        }
      }
    }
    return found;
  };
  let best = search(6);
  // Un nombre largo se va a acortar de todos modos: no vale la pena el barrido fino.
  if ((!best || best.label.truncated) && name.trim().length <= 14) {
    const fine = search(3);
    if (fine && (!best || fine.score > best.score)) best = fine;
  }

  if (best && !best.label.truncated) return { label: best.label, cx: best.cx, cy: best.cy, angle: best.angle };

  // El nombre no entra entero a tamaño cómodo: se busca dónde se puede mostrar la mayor parte, en
  // 1 a 3 líneas a tamaño mínimo, acortado con «…» (el nombre completo queda en la leyenda y la lista).
  const shown = (l: LabelLayout) => l.lines.join("").replace(/…/g, "").length;
  let rescue: (RotatedLabel & { score: number }) | null = null;
  const charW = CHAR_W * minFont * MARGIN;
  const lineH = LINE_H * minFont * MARGIN;
  const RSTEP = 4;
  for (let y = y0 + RSTEP; y < y1; y += RSTEP) {
    for (let x = x0 + RSTEP; x < x1; x += RSTEP) {
      if (!mask.has(x, y)) continue;
      for (const angle of angles) {
        const ux = Math.cos(angle);
        const uy = Math.sin(angle);
        const halfW = Math.min(extent(mask, x, y, ux, uy, 90), extent(mask, x, y, -ux, -uy, 90));
        const halfH = Math.min(extent(mask, x, y, -uy, ux, 40), extent(mask, x, y, uy, -ux, 40));
        const maxCap = Math.min(26, Math.floor((2 * halfW) / charW));
        const maxLines = Math.min(3, Math.floor((2 * halfH) / lineH));
        if (maxCap < 4 || maxLines < 1) continue;
        for (let lines = maxLines; lines >= 1; lines--) {
          // El espacio disponible da un tope; se verifica contra el piso y se achica de a un carácter.
          for (let cap = maxCap, t = 0; cap >= 4 && t < 5; cap--, t++) {
            const label = truncatedLayout(name, cap, lines, minFont);
            if (!fitsMask(mask, x, y, angle, label)) continue;
            const score = shown(label) * 10 - Math.abs(angle - 0.1);
            if (!rescue || score > rescue.score) rescue = { label, cx: x, cy: y, angle, score };
            break;
          }
        }
      }
    }
  }
  if (rescue && (!best || shown(rescue.label) > shown(best.label))) return { label: rescue.label, cx: rescue.cx, cy: rescue.cy, angle: rescue.angle };
  if (best) return { label: best.label, cx: best.cx, cy: best.cy, angle: best.angle };
  return { label: layoutLabel(name, 40, 24, maxFont, minFont), cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, angle: 0 };
}

export { LINE_H, MIN_FONT };
