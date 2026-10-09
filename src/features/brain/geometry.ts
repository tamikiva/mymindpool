/** Geometría pura del cerebro: silueta festoneada dividida en N sectores (2–8). */

export interface Pt {
  x: number;
  y: number;
}

export const MIN_AREAS = 2;
export const MAX_AREAS = 8;
export const VIEW = { w: 400, h: 320 } as const;
const CX = VIEW.w / 2;
const CY = VIEW.h / 2 + 4;
const RX = 178;
const RY = 136;
const STEPS_PER_SECTOR = 36;

/** Radio relativo con lóbulos suaves, para que la silueta no sea una elipse lisa. */
function lobe(theta: number): number {
  return 1 + 0.045 * Math.cos(theta * 6) + 0.025 * Math.cos(theta * 3 + 1);
}

function outline(theta: number): Pt {
  const k = lobe(theta);
  return { x: CX + Math.cos(theta) * RX * k, y: CY + Math.sin(theta) * RY * k };
}

export function sectorAngles(index: number, count: number): [number, number] {
  if (count < MIN_AREAS || count > MAX_AREAS) throw new RangeError("Entre 2 y 8 áreas");
  const start = -Math.PI / 2;
  const span = (Math.PI * 2) / count;
  return [start + index * span, start + (index + 1) * span];
}

export function sectorPolygon(index: number, count: number, inset = 0): Pt[] {
  const [a0, a1] = sectorAngles(index, count);
  const pts: Pt[] = [{ x: CX, y: CY }];
  for (let i = 0; i <= STEPS_PER_SECTOR; i++) {
    pts.push(outline(a0 + ((a1 - a0) * i) / STEPS_PER_SECTOR));
  }
  if (inset === 0) return pts;
  // Se achica hacia el centroide: el hueco entre sectores forma la pared.
  const c = centroid(pts);
  const s = 1 - inset;
  return pts.map((p) => ({ x: c.x + (p.x - c.x) * s, y: c.y + (p.y - c.y) * s }));
}

export function centroid(pts: readonly Pt[]): Pt {
  const n = pts.length;
  return { x: pts.reduce((s, p) => s + p.x, 0) / n, y: pts.reduce((s, p) => s + p.y, 0) / n };
}

export function bounds(pts: readonly Pt[]) {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

export function polygonPath(pts: readonly Pt[]): string {
  return pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ") + " Z";
}

export function silhouettePath(): string {
  const pts: Pt[] = [];
  const n = 180;
  for (let i = 0; i < n; i++) pts.push(outline((i / n) * Math.PI * 2));
  return polygonPath(pts);
}

/** Altura (y) de la superficie del agua en un sector para un nivel 0..1. */
export function waterSurfaceY(pts: readonly Pt[], level: number): number {
  const b = bounds(pts);
  const clamped = Math.min(1, Math.max(0, level));
  return b.maxY - (b.maxY - b.minY) * clamped;
}

/** Superficie con una onda baja y fija (sin animación continua). */
export function wavePath(pts: readonly Pt[], level: number): string {
  const b = bounds(pts);
  const y = waterSurfaceY(pts, level);
  const w = b.maxX - b.minX;
  const amp = level <= 0 ? 0 : Math.min(3, (b.maxY - b.minY) * 0.03);
  const x0 = b.minX - 2;
  const segs = 4;
  let d = `M${x0} ${(b.maxY + 2).toFixed(1)} L${x0} ${y.toFixed(1)}`;
  for (let i = 0; i < segs; i++) {
    const xa = x0 + ((w + 4) * (i + 0.5)) / segs;
    const xb = x0 + ((w + 4) * (i + 1)) / segs;
    const dir = i % 2 === 0 ? -1 : 1;
    d += ` Q${xa.toFixed(1)} ${(y + dir * amp * 2).toFixed(1)} ${xb.toFixed(1)} ${y.toFixed(1)}`;
  }
  return d + ` L${(b.maxX + 2).toFixed(1)} ${(b.maxY + 2).toFixed(1)} Z`;
}
