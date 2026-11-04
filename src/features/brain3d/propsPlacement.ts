/**
 * Dónde van los adornos (escalera, escalones, macetas y flotadores). Funciones puras, sin three.js:
 * se prueban con datos y garantizan que cada adorno quede completo, apoyado donde corresponde,
 * sin atravesar paredes ni tapar los nombres.
 *
 * Convenciones: coordenadas del mundo (x, y = z de la escena, hacia el frente = y positiva).
 * La cámara mira desde el frente y desde arriba: un punto a altura h se ve como el suelo ubicado
 * h·SHIFT más atrás (hacia y negativa).
 */
import { pointInPolygon } from "../brain/geometry";
import { BEVEL, TILT, TOTAL_H } from "./constants";
import type { Pt } from "./layout";

/** Cuánto se corre hacia atrás, en el suelo, lo que está elevado una unidad (por la inclinación de la cámara). */
export const SHIFT = 1 / Math.tan(TILT);

export interface LabelRect {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Giro del nombre sobre el piso (radianes); el eje largo apunta a (cos, sin). */
  angle: number;
}

export interface Disc {
  x: number;
  y: number;
  r: number;
}

// ---------- geometría básica ----------

export function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

export function distToPolygon(p: Pt, poly: readonly Pt[]): number {
  let m = Infinity;
  for (let i = 0; i < poly.length; i++) m = Math.min(m, distToSegment(p, poly[i], poly[(i + 1) % poly.length]));
  return m;
}

/** Distancia desde un punto hasta el rectángulo (girado) de un nombre; 0 si está adentro. */
export function distToLabel(p: Pt, r: LabelRect): number {
  const c = Math.cos(r.angle);
  const s = Math.sin(r.angle);
  const dx = p.x - r.x;
  const dy = p.y - r.y;
  const lx = Math.abs(dx * c + dy * s) - r.w / 2;
  const ly = Math.abs(-dx * s + dy * c) - r.h / 2;
  return Math.hypot(Math.max(lx, 0), Math.max(ly, 0));
}

/** Distancia desde el centro de un adorno (con su radio) al nombre, a lo largo de una barrida vertical de `sweep`. */
function clearOfLabel(p: Pt, radius: number, label: LabelRect | undefined, margin: number, sweep = 0): boolean {
  if (!label) return true;
  const n = sweep > 0 ? 8 : 0;
  for (let k = 0; k <= n; k++) {
    const q = { x: p.x, y: p.y - (n ? (sweep * k) / n : 0) };
    if (distToLabel(q, label) < radius + margin) return false;
  }
  return n > 0 || distToLabel(p, label) >= radius + margin;
}

/** Distancia desde p, siguiendo la dirección d, hasta el primer cruce con el polígono (o Infinity). */
export function rayDistance(p: Pt, d: Pt, poly: readonly Pt[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const den = d.x * ey - d.y * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((a.x - p.x) * ey - (a.y - p.y) * ex) / den;
    const u = ((a.x - p.x) * d.y - (a.y - p.y) * d.x) / den;
    if (t > 1e-6 && u >= 0 && u <= 1 && t < best) best = t;
  }
  return best;
}

export interface EdgeSample {
  /** Punto sobre el borde de la pileta (la cara interior de la pared). */
  p: Pt;
  /** Normal hacia afuera de la pileta (hacia la pared). */
  n: Pt;
  /** Tangente. */
  t: Pt;
}

/** Puntos equiespaciados sobre el borde de una pileta, con su normal hacia afuera. */
export function edgeSamples(poly: readonly Pt[], step = 0.1): EdgeSample[] {
  const out: EdgeSample[] = [];
  let next = 0; // distancia que falta, desde el inicio del tramo actual, hasta la próxima muestra
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-9) continue;
    const t = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    let n = { x: t.y, y: -t.x };
    let s = next;
    for (; s < len; s += step) {
      const p = { x: a.x + t.x * s, y: a.y + t.y * s };
      if (pointInPolygon({ x: p.x + n.x * 0.03, y: p.y + n.y * 0.03 }, poly as Pt[])) n = { x: -n.x, y: -n.y };
      out.push({ p, n, t });
    }
    next = s - len;
  }
  return out;
}

const EDGE_TOL = 0.06;

/** Tramo recto: la normal casi no cambia a ±half a lo largo del borde. */
function isFlat(poly: readonly Pt[], s: EdgeSample, half: number, minDot: number): boolean {
  for (const k of [-half, half]) {
    const q = { x: s.p.x + s.t.x * k, y: s.p.y + s.t.y * k };
    // el punto debe seguir sobre el borde (a menos de 2 cm) y con normal casi igual
    if (distToPolygon(q, poly) > EDGE_TOL) return false;
    const near = edgeNormalAt(poly, q);
    if (!near || near.x * s.n.x + near.y * s.n.y < minDot) return false;
  }
  return true;
}

function edgeNormalAt(poly: readonly Pt[], q: Pt): Pt | null {
  let best = Infinity;
  let res: Pt | null = null;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const d = distToSegment(q, a, b);
    if (d < best) {
      best = d;
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      let n = { x: (b.y - a.y) / len, y: -(b.x - a.x) / len };
      if (pointInPolygon({ x: q.x + n.x * 0.03, y: q.y + n.y * 0.03 }, poly as Pt[])) n = { x: -n.x, y: -n.y };
      res = n;
    }
  }
  return res;
}

const inAnyPool = (p: Pt, pools: readonly (readonly Pt[])[]) => pools.some((q) => pointInPolygon(p, q as Pt[]));

// ---------- escalera ----------

export interface LadderSpot {
  /** Punto sobre la pared interior donde apoyan los rieles. */
  p: Pt;
  /** Normal hacia afuera de la pileta (hacia el borde). */
  n: Pt;
  /** Giro sobre el eje vertical que lleva +z local a la normal. */
  rotY: number;
}

export const LADDER = { half: 0.2, flangeV: 0.15, flangeR: 0.05, need: 0.26 };

/**
 * Escalera de acero apoyada en el borde: los rieles bajan por la pared interior y las bridas
 * descansan sobre la cara plana del borde. Pide un tramo recto de pared, de frente a la cámara
 * (se ve la escalera y no su espalda), con borde ancho de sobra detrás, lejos del nombre.
 */
export function placeLadder(
  pool: readonly Pt[],
  outline: readonly Pt[],
  allPools: readonly (readonly Pt[])[],
  label?: LabelRect,
): LadderSpot | null {
  let best: { s: EdgeSample; score: number } | null = null;
  for (const s of edgeSamples(pool, 0.1)) {
    if (s.n.y > -0.7) continue; // solo la pared del fondo (la cámara ve su cara interior)
    if (!isFlat(pool, s, LADDER.half + 0.02, 0.95)) continue;
    let ok = true;
    for (const k of [-LADDER.half, 0, LADDER.half]) {
      const q = { x: s.p.x + s.t.x * k, y: s.p.y + s.t.y * k };
      const w = rayDistance(q, s.n, outline);
      if (w < LADDER.need) ok = false;
      // el espesor tiene que ser el del borde (no cruzar otra pileta)
      const f = { x: q.x + s.n.x * LADDER.flangeV, y: q.y + s.n.y * LADDER.flangeV };
      if (inAnyPool(f, allPools) || !pointInPolygon(f, outline as Pt[]) || distToPolygon(f, outline) < LADDER.flangeR + 0.03) ok = false;
    }
    if (!ok) continue;
    const foot = { x: s.p.x - s.n.x * 0.12, y: s.p.y - s.n.y * 0.12 };
    if (!clearOfLabel(foot, 0.32, label, 0.15)) continue;
    const away = label ? distToLabel(foot, label) : 5;
    const score = Math.min(away, 3) - Math.abs(s.n.x) * 0.5;
    if (!best || score > best.score) best = { s, score };
  }
  if (!best) return null;
  const { p, n } = best.s;
  return { p, n, rotY: Math.atan2(n.x, n.y) };
}

// ---------- escalones interiores ----------

export interface StepsSpot {
  p: Pt;
  n: Pt;
  t: Pt;
  rotY: number;
  width: number;
}

/** `back` = cuánto se hunde el bloque dentro de la pared (queda tapado) para que no asome ninguna rendija. */
export const STEPS = { width: 0.7, treads: [0.22, 0.22, 0.22], heights: [0.3, 0.2, 0.1], back: 0.08 };

/**
 * Escalones pegados a una pared interior que se ve (fondo o costados), completos dentro de la
 * pileta y lejos del nombre. Devuelve el punto de apoyo sobre la pared, su normal y su ancho.
 */
export function placeSteps(
  pool: readonly Pt[],
  label?: LabelRect,
  avoid: readonly Disc[] = [],
): StepsSpot | null {
  const depth = STEPS.treads.reduce((a, b) => a + b, 0);
  const half = STEPS.width / 2;
  let best: { s: EdgeSample; score: number } | null = null;
  for (const s of edgeSamples(pool, 0.1)) {
    if (s.n.y > 0.35) continue; // la pared del frente tapa el rincón: no se vería
    if (!isFlat(pool, s, half, 0.9)) continue;
    // El bloque entero (con 3 cm de holgura contra la pared lateral) debe caer dentro de la pileta.
    let inside = true;
    for (let a = -half; a <= half && inside; a += half / 2) {
      for (const v of [0.03, depth * 0.5, depth]) {
        const q = { x: s.p.x + s.t.x * a - s.n.x * v, y: s.p.y + s.t.y * a - s.n.y * v };
        if (!pointInPolygon(q, pool as Pt[]) || (v > 0.05 && distToPolygon(q, pool) < 0.02)) inside = false;
      }
    }
    if (!inside) continue;
    const c = { x: s.p.x - s.n.x * (depth / 2), y: s.p.y - s.n.y * (depth / 2) };
    const r = Math.hypot(half, depth / 2);
    if (!clearOfLabel(c, r, label, 0.12)) continue;
    if (avoid.some((d) => Math.hypot(d.x - c.x, d.y - c.y) < d.r + r)) continue;
    const away = label ? distToLabel(c, label) : 5;
    const score = Math.min(away, 3) + (s.n.y < -0.5 ? 0.6 : 0);
    if (!best || score > best.score) best = { s, score };
  }
  if (!best) return null;
  const { p, n, t } = best.s;
  return { p, n, t, rotY: Math.atan2(n.x, n.y), width: STEPS.width };
}

// ---------- macetas ----------

export const POT = { baseR: 0.08, topR: 0.11, height: 0.18, plant: 0.95 };

/**
 * Macetas sobre la cara plana del borde. Una maceta va solo donde (1) el borde tiene lugar para su
 * base, y (2) nada de la escena queda detrás de ella: la planta tapa lo que está más atrás en la
 * pantalla, así que no se ponen delante de una pileta ni de su nombre.
 */
export function placePlants(
  outline: readonly Pt[],
  pools: readonly (readonly Pt[])[],
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
  count: number,
  avoid: readonly Disc[] = [],
): Pt[] {
  const cands: { p: Pt; score: number }[] = [];
  const reach = (TOTAL_H + POT.plant) * SHIFT + 0.1;
  for (let x = bounds.minX; x <= bounds.maxX; x += 0.1) {
    for (let y = bounds.minY; y <= bounds.maxY; y += 0.1) {
      const p = { x, y };
      if (!pointInPolygon(p, outline as Pt[]) || inAnyPool(p, pools)) continue;
      const dOut = distToPolygon(p, outline);
      const dPool = Math.min(...pools.map((q) => distToPolygon(p, q)));
      if (dOut < POT.baseR + 0.02 || dPool < POT.topR + 0.01) continue;
      // Nada (pileta) detrás, en la franja que la planta tapa.
      let blocked = false;
      for (let t = 0.1; t <= reach && !blocked; t += 0.15) {
        for (const dx of [-0.3, 0, 0.3]) if (inAnyPool({ x: x + dx, y: y - t }, pools)) blocked = true;
      }
      if (blocked) continue;
      if (avoid.some((d) => Math.hypot(d.x - x, d.y - y) < d.r + POT.topR)) continue;
      cands.push({ p, score: Math.min(dOut, 0.5) + Math.min(dPool, 0.5) });
    }
  }
  // Se eligen separadas entre sí, repartidas de izquierda a derecha.
  cands.sort((a, b) => b.score - a.score);
  const out: Pt[] = [];
  const minGap = Math.max(1.6, (bounds.maxX - bounds.minX) / (count + 1.5));
  for (const c of cands) {
    if (out.every((q) => Math.hypot(q.x - c.p.x, q.y - c.p.y) >= minGap)) out.push(c.p);
    if (out.length >= count) break;
  }
  return out.sort((a, b) => a.x - b.x);
}

// ---------- flotadores ----------

export const FLOAT = { R: 0.21, tube: 0.085, draft: 0.055, maxLift: 0.9 };

/**
 * Lugar para un flotador: dentro del piso que se ve, con holgura a las paredes, y de modo que ni él
 * ni su recorrido al subir el agua (se corre hacia atrás en pantalla) toquen el nombre, los
 * escalones o la escalera.
 */
export function placeFloat(
  pool: readonly Pt[],
  visible: readonly Pt[],
  label?: LabelRect,
  avoid: readonly Disc[] = [],
): Pt | null {
  const outer = FLOAT.R + FLOAT.tube;
  const xs = visible.map((p) => p.x);
  const ys = visible.map((p) => p.y);
  let best: { p: Pt; score: number } | null = null;
  for (let x = Math.min(...xs); x <= Math.max(...xs); x += 0.1) {
    for (let y = Math.min(...ys); y <= Math.max(...ys); y += 0.1) {
      const p = { x, y };
      if (!pointInPolygon(p, visible as Pt[])) continue;
      const edge = Math.min(distToPolygon(p, pool), distToPolygon(p, visible));
      if (edge < outer + 0.05) continue;
      if (!clearOfLabel(p, outer, label, 0.06, FLOAT.maxLift * SHIFT)) continue;
      if (avoid.some((d) => Math.hypot(d.x - x, d.y - y) < d.r + outer + 0.05)) continue;
      const away = label ? distToLabel(p, label) : 3;
      const score = Math.min(edge, 1.2) + Math.min(away, 2);
      if (!best || score > best.score) best = { p, score };
    }
  }
  return best?.p ?? null;
}

/** Altura del centro del flotador para un nivel de agua h: flota con su calado, o apoya en el fondo. */
export const floatCenterY = (h: number): number => Math.max(h - FLOAT.draft + FLOAT.tube, FLOAT.tube + 0.004);

// ---------- plan completo ----------

export interface PropsPlan {
  ladder: { pool: number; spot: LadderSpot } | null;
  steps: { pool: number; spot: StepsSpot }[];
  floats: { pool: number; at: Pt }[];
  plants: Pt[];
}

export interface PlanInput {
  outline: readonly Pt[];
  pools: readonly (readonly Pt[])[];
  /** Piso que se ve de cada pileta (sin la franja que tapa la pared cercana). */
  visible: readonly (readonly Pt[])[];
  /** Rectángulo del nombre de cada pileta (si ya se ubicó). */
  labels: readonly (LabelRect | undefined)[];
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
}

export const stepsDepth = (): number => STEPS.treads.reduce((a, b) => a + b, 0);
export const stepsDisc = (s: StepsSpot): Disc => {
  const depth = stepsDepth();
  return { x: s.p.x - s.n.x * (depth / 2), y: s.p.y - s.n.y * (depth / 2), r: Math.hypot(s.width / 2, depth / 2) };
};

/**
 * Reparte los adornos: una escalera en el borde de la segunda pileta (Trabajo, en 4 áreas), escalones
 * en hasta dos piletas, flotadores en hasta dos y tres macetas sobre el borde. Cada adorno evita a los
 * anteriores y a los nombres; si en una pileta no hay lugar completo, ese adorno se omite (no se achica ni se fuerza).
 */
export function planProps(input: PlanInput): PropsPlan {
  const { outline, pools, visible, labels, bounds } = input;
  const plan: PropsPlan = { ladder: null, steps: [], floats: [], plants: [] };
  const discs: Disc[][] = pools.map(() => []);
  const rimDiscs: Disc[] = [];

  const ladderPool = pools.length > 1 ? 1 : 0;
  const ladder = placeLadder(pools[ladderPool], outline, pools, labels[ladderPool]);
  if (ladder) {
    plan.ladder = { pool: ladderPool, spot: ladder };
    discs[ladderPool].push({ x: ladder.p.x - ladder.n.x * 0.15, y: ladder.p.y - ladder.n.y * 0.15, r: 0.4 });
    rimDiscs.push({ x: ladder.p.x + ladder.n.x * LADDER.flangeV, y: ladder.p.y + ladder.n.y * LADDER.flangeV, r: 0.45 });
  }

  const order = pools.map((_, i) => i);
  const stepOrder = [...order.filter((i) => i % 4 === 0 || i % 4 === 2), ...order.filter((i) => i % 4 === 3), ...order.filter((i) => i % 4 === 1)];
  for (const i of stepOrder) {
    if (plan.steps.length >= 2) break;
    if (plan.ladder?.pool === i) continue;
    const s = placeSteps(pools[i], labels[i], discs[i]);
    if (!s) continue;
    plan.steps.push({ pool: i, spot: s });
    discs[i].push(stepsDisc(s));
  }

  const floatOrder = [...order.filter((i) => i % 4 === 1 || i % 4 === 2), ...order.filter((i) => i % 4 === 0), ...order.filter((i) => i % 4 === 3)];
  for (const i of floatOrder) {
    if (plan.floats.length >= 2) break;
    const at = placeFloat(pools[i], visible[i], labels[i], discs[i]);
    if (!at) continue;
    plan.floats.push({ pool: i, at });
    discs[i].push({ x: at.x, y: at.y, r: FLOAT.R + FLOAT.tube + 0.1 });
  }

  plan.plants = placePlants(outline, pools, bounds, 3, rimDiscs);
  return plan;
}
