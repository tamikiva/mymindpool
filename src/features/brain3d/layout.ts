/**
 * Geometría orgánica del cerebro-pileta (2 a 8 áreas). Código puro, sin React ni three.js.
 *
 * Se parte de una silueta de cerebro (superelipse con lóbulos y un surco arriba y abajo), se divide
 * en dos hemisferios y cada hemisferio en filas, y se talla cada pileta con campos de distancia:
 * paredes de espesor parejo entre piletas y borde, y esquinas redondeadas. Las curvas salen de
 * «marching squares» sobre el campo suavizado.
 *
 * Coordenadas del mundo: x hacia la derecha, y hacia ABAJO en pantalla (hacia quien mira).
 */

export interface Pt {
  x: number;
  y: number;
}

export interface PoolLayout {
  index: number;
  poly: Pt[];
  area: number;
  centroid: Pt;
}

export interface BrainLayout {
  count: number;
  /** Borde exterior del cerebro (cara externa de la pared). */
  outline: Pt[];
  pools: PoolLayout[];
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  /** Puntos de la pared con espacio de sobra, buenos para apoyar adornos. */
  rimSpots: Pt[];
}

import { pointInPolygon } from "../brain/geometry";

export const MIN_POOLS = 2;
export const MAX_POOLS = 8;

const CELL = 0.05;
const X0 = -6.2;
const Y0 = -4.9;
const NX = Math.round(12.4 / CELL);
const NY = Math.round(9.8 / CELL);
/** Espesor de la pared exterior (aprox.) y de la pared entre piletas. */
export const RIM = 0.17;
export const WALL = 0.3;

const idx = (i: number, j: number) => j * NX + i;
const px = (i: number) => X0 + (i + 0.5) * CELL;
const py = (j: number) => Y0 + (j + 0.5) * CELL;
const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** ¿Está (x, y) dentro de la silueta del cerebro? */
function insideBrain(x: number, y: number): boolean {
  const u = x / 5.0;
  const v = y / 3.62;
  const p = 2.5;
  const rho = (Math.abs(u) ** p + Math.abs(v) ** p) ** (1 / p);
  const th = Math.atan2(v, u);
  // Lóbulos (como las circunvoluciones vistas de arriba) y un surco entre hemisferios, más hondo arriba.
  let allowed = 1 + 0.06 * Math.cos(9 * th + 0.6) + 0.035 * Math.cos(5 * th - 0.4) + 0.03 * Math.cos(3 * th + 0.2);
  const cleft = Math.exp(-(u * u) / 0.022);
  allowed -= (v < 0 ? 0.3 : 0.16) * cleft * smoothstep(0.3, 0.92, Math.abs(v));
  return rho <= allowed;
}

const fissureWiggle = (y: number) => 0.2 * Math.sin(y * 0.95 + 0.5) + 0.06 * Math.sin(y * 2.4);

/**
 * Cortes horizontales de un hemisferio con la MISMA superficie por fila: como el cerebro es más
 * angosto arriba y abajo, esas filas resultan más altas y no quedan como astillas.
 */
function rowCuts(inside: Uint8Array, rows: number, left: boolean, fx: number): number[] {
  const perRow = new Float64Array(NY);
  let total = 0;
  for (let j = 0; j < NY; j++) {
    for (let i = 0; i < NX; i++) {
      if (inside[idx(i, j)] && px(i) < fx + fissureWiggle(py(j)) === left) {
        perRow[j]++;
        total++;
      }
    }
  }
  const cuts: number[] = [];
  let acc = 0;
  for (let j = 0; j < NY && cuts.length < rows - 1; j++) {
    acc += perRow[j];
    if (acc >= (total * (cuts.length + 1)) / rows) cuts.push(py(j));
  }
  return cuts;
}

interface Partition {
  n: number;
  /** Posición del surco central: se corre hacia el hemisferio con más filas para equilibrar las superficies. */
  fx: number;
  left: number[];
  right: number[];
}

/** Índice de pileta de un punto. Dos hemisferios, cada uno dividido en filas con paredes onduladas. */
function poolOf(x: number, y: number, part: Partition): number {
  const nL = Math.ceil(part.n / 2);
  const nR = part.n - nL;
  const left = x < part.fx + fissureWiggle(y);
  const cuts = left ? part.left : part.right;
  const phase = left ? 0 : 2.1;
  let row = 0;
  for (let i = 0; i < cuts.length; i++) {
    const boundary = cuts[i] + 0.2 * Math.sin(x * 1.0 + (i + 1) * 1.7 + phase) + 0.07 * Math.sin(x * 2.6 + (i + 1) * 0.9 + phase);
    if (y > boundary) row = i + 1;
  }
  // Orden de lectura: fila por fila, izquierda y luego derecha.
  if (row < nR) return row * 2 + (left ? 0 : 1);
  return nR * 2; // fila extra del hemisferio izquierdo cuando hay cantidad impar
}

/** Distancia euclídea (en unidades del mundo) de cada celda a la fuente más cercana (isSource = 1). */
function distanceToSource(isSource: Uint8Array): Float32Array {
  const INF = 1e12;
  const f = new Float32Array(NX * NY);
  for (let k = 0; k < f.length; k++) f[k] = isSource[k] ? 0 : INF;
  const tmp = new Float32Array(Math.max(NX, NY));
  const out = new Float32Array(Math.max(NX, NY));
  const v = new Int32Array(Math.max(NX, NY));
  const z = new Float32Array(Math.max(NX, NY) + 1);
  const pass = (len: number) => {
    let k = 0;
    v[0] = 0;
    z[0] = -INF;
    z[1] = INF;
    for (let q = 1; q < len; q++) {
      let s: number;
      for (;;) {
        const p = v[k];
        s = (tmp[q] + q * q - (tmp[p] + p * p)) / (2 * q - 2 * p);
        if (s <= z[k] && k > 0) k--;
        else break;
      }
      k++;
      v[k] = q;
      z[k] = s;
      z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < len; q++) {
      while (z[k + 1] < q) k++;
      const p = v[k];
      out[q] = (q - p) * (q - p) + tmp[p];
    }
  };
  for (let i = 0; i < NX; i++) {
    for (let j = 0; j < NY; j++) tmp[j] = f[idx(i, j)];
    pass(NY);
    for (let j = 0; j < NY; j++) f[idx(i, j)] = out[j];
  }
  for (let j = 0; j < NY; j++) {
    for (let i = 0; i < NX; i++) tmp[i] = f[idx(i, j)];
    pass(NX);
    for (let i = 0; i < NX; i++) f[idx(i, j)] = out[i];
  }
  for (let k = 0; k < f.length; k++) f[k] = Math.sqrt(f[k]) * CELL;
  return f;
}

/** Distancia con signo: positiva dentro de la máscara, negativa fuera. */
function signedDistance(mask: Uint8Array): Float32Array {
  const outside = new Uint8Array(mask.length);
  for (let k = 0; k < mask.length; k++) outside[k] = mask[k] ? 0 : 1;
  const dOut = distanceToSource(outside); // dentro: distancia al borde
  const dIn = distanceToSource(mask); // fuera: distancia a la máscara
  const sd = new Float32Array(mask.length);
  for (let k = 0; k < mask.length; k++) sd[k] = mask[k] ? dOut[k] - CELL / 2 : -(dIn[k] - CELL / 2);
  return sd;
}

function gaussianBlur(src: Float32Array, sigma: number): Float32Array {
  const r = Math.ceil(sigma * 3);
  const w: number[] = [];
  let sum = 0;
  for (let k = -r; k <= r; k++) {
    const val = Math.exp(-(k * k) / (2 * sigma * sigma));
    w.push(val);
    sum += val;
  }
  for (let k = 0; k < w.length; k++) w[k] /= sum;
  const tmp = new Float32Array(src.length);
  const dst = new Float32Array(src.length);
  for (let j = 0; j < NY; j++) {
    for (let i = 0; i < NX; i++) {
      let a = 0;
      for (let k = -r; k <= r; k++) a += w[k + r] * src[idx(Math.min(NX - 1, Math.max(0, i + k)), j)];
      tmp[idx(i, j)] = a;
    }
  }
  for (let j = 0; j < NY; j++) {
    for (let i = 0; i < NX; i++) {
      let a = 0;
      for (let k = -r; k <= r; k++) a += w[k + r] * tmp[idx(i, Math.min(NY - 1, Math.max(0, j + k)))];
      dst[idx(i, j)] = a;
    }
  }
  return dst;
}

/** Contornos cerrados del nivel 0 del campo (valores > 0 = dentro). */
function contours(field: Float32Array): Pt[][] {
  type Seg = [string, string];
  const segs: Seg[] = [];
  const pos = new Map<string, Pt>();
  const edge = (kind: "h" | "v", i: number, j: number, fa: number, fb: number): string => {
    const key = `${kind}${i},${j}`;
    if (!pos.has(key)) {
      const t = fa / (fa - fb);
      pos.set(key, kind === "h" ? { x: X0 + (i + 0.5 + t) * CELL, y: Y0 + (j + 0.5) * CELL } : { x: X0 + (i + 0.5) * CELL, y: Y0 + (j + 0.5 + t) * CELL });
    }
    return key;
  };
  for (let j = 0; j < NY - 1; j++) {
    for (let i = 0; i < NX - 1; i++) {
      const a = field[idx(i, j)];
      const b = field[idx(i + 1, j)];
      const c = field[idx(i + 1, j + 1)];
      const d = field[idx(i, j + 1)];
      const code = (a > 0 ? 1 : 0) | (b > 0 ? 2 : 0) | (c > 0 ? 4 : 0) | (d > 0 ? 8 : 0);
      if (code === 0 || code === 15) continue;
      const T = () => edge("h", i, j, a, b);
      const R = () => edge("v", i + 1, j, b, c);
      const B = () => edge("h", i, j + 1, d, c);
      const L = () => edge("v", i, j, a, d);
      const centerIn = a + b + c + d > 0;
      switch (code) {
        case 1: case 14: segs.push([L(), T()]); break;
        case 2: case 13: segs.push([T(), R()]); break;
        case 3: case 12: segs.push([L(), R()]); break;
        case 4: case 11: segs.push([R(), B()]); break;
        case 6: case 9: segs.push([T(), B()]); break;
        case 7: case 8: segs.push([L(), B()]); break;
        case 5:
          if (centerIn) { segs.push([T(), R()]); segs.push([L(), B()]); } else { segs.push([L(), T()]); segs.push([R(), B()]); }
          break;
        case 10:
          if (centerIn) { segs.push([L(), T()]); segs.push([R(), B()]); } else { segs.push([T(), R()]); segs.push([L(), B()]); }
          break;
      }
    }
  }
  const adj = new Map<string, number[]>();
  segs.forEach(([p, q], s) => {
    (adj.get(p) ?? adj.set(p, []).get(p)!).push(s);
    (adj.get(q) ?? adj.set(q, []).get(q)!).push(s);
  });
  const used = new Uint8Array(segs.length);
  const loops: Pt[][] = [];
  for (let s0 = 0; s0 < segs.length; s0++) {
    if (used[s0]) continue;
    used[s0] = 1;
    const keys = [segs[s0][0], segs[s0][1]];
    for (;;) {
      const last = keys[keys.length - 1];
      const next = (adj.get(last) ?? []).find((s) => !used[s]);
      if (next === undefined) break;
      used[next] = 1;
      const [p, q] = segs[next];
      keys.push(p === last ? q : p);
    }
    if (keys.length > 8) loops.push(keys.map((k) => pos.get(k)!));
  }
  return loops;
}

export function polygonArea(p: readonly Pt[]): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[(i + 1) % p.length];
    a += p[i].x * q.y - q.x * p[i].y;
  }
  return a / 2;
}

export function polygonCentroid(p: readonly Pt[]): Pt {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[(i + 1) % p.length];
    const k = p[i].x * q.y - q.x * p[i].y;
    a += k;
    cx += (p[i].x + q.x) * k;
    cy += (p[i].y + q.y) * k;
  }
  return Math.abs(a) < 1e-9 ? p[0] : { x: cx / (3 * a), y: cy / (3 * a) };
}

/** Remuestrea a paso parejo y suaviza apenas (la curva ya viene suave del campo). */
function resample(poly: Pt[], step: number): Pt[] {
  const n = poly.length;
  const cum = [0];
  for (let i = 0; i < n; i++) {
    const q = poly[(i + 1) % n];
    cum.push(cum[i] + Math.hypot(q.x - poly[i].x, q.y - poly[i].y));
  }
  const total = cum[n];
  const count = Math.max(24, Math.round(total / step));
  const out: Pt[] = [];
  let seg = 0;
  for (let k = 0; k < count; k++) {
    const d = (k / count) * total;
    while (cum[seg + 1] < d) seg++;
    const a = poly[seg];
    const b = poly[(seg + 1) % n];
    const t = (d - cum[seg]) / Math.max(1e-9, cum[seg + 1] - cum[seg]);
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  // Un pase de promedio de vecinos quita el temblor de la cuadrícula.
  return out.map((p, i) => {
    const a = out[(i + out.length - 1) % out.length];
    const b = out[(i + 1) % out.length];
    return { x: (a.x + 2 * p.x + b.x) / 4, y: (a.y + 2 * p.y + b.y) / 4 };
  });
}

/** Contorno de mayor área de un campo, ya remuestreado. */
function largestLoop(field: Float32Array, step: number): Pt[] {
  const loops = contours(field);
  if (loops.length === 0) return [];
  loops.sort((a, b) => Math.abs(polygonArea(b)) - Math.abs(polygonArea(a)));
  return resample(loops[0], step);
}

/**
 * Parte del piso de una pileta que se ve desde la cámara: la pared cercana tapa una franja de
 * `occlusion` unidades (pared alta / tangente de la inclinación). Un punto se ve si el punto que
 * está `occlusion` más cerca de la cámara sigue dentro de la pileta.
 */
export function visibleFloor(poly: readonly Pt[], occlusion: number): Pt[] {
  const mask = new Uint8Array(NX * NY);
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  const i0 = Math.max(0, Math.floor((Math.min(...xs) - X0) / CELL) - 1);
  const i1 = Math.min(NX - 1, Math.ceil((Math.max(...xs) - X0) / CELL) + 1);
  const j0 = Math.max(0, Math.floor((Math.min(...ys) - Y0) / CELL) - 1);
  const j1 = Math.min(NY - 1, Math.ceil((Math.max(...ys) - Y0) / CELL) + 1);
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const x = px(i);
      const y = py(j);
      if (pointInPolygon({ x, y }, poly) && pointInPolygon({ x, y: y + occlusion }, poly)) mask[idx(i, j)] = 1;
    }
  }
  const loop = largestLoop(gaussianBlur(signedDistance(mask), 0.08), 0.09);
  return loop.length >= 8 ? loop : [...poly];
}

const cache = new Map<number, BrainLayout>();

export function buildBrainLayout(count: number): BrainLayout {
  if (!Number.isInteger(count) || count < MIN_POOLS || count > MAX_POOLS) throw new RangeError("Entre 2 y 8 áreas");
  const hit = cache.get(count);
  if (hit) return hit;

  const N = NX * NY;
  const inside = new Uint8Array(N);
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) if (insideBrain(px(i), py(j))) inside[idx(i, j)] = 1;
  const nL = Math.ceil(count / 2);
  // Con cantidad impar el hemisferio izquierdo lleva una fila más: se le da proporcionalmente más lugar
  // (a medias, para que siga pareciendo un cerebro) y así las piletas quedan de tamaño parecido.
  const share = 0.5 + 0.7 * (nL / count - 0.5);
  const colArea = new Float64Array(NX);
  let total = 0;
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) if (inside[idx(i, j)]) { colArea[i]++; total++; }
  let fx = 0;
  for (let i = 0, acc = 0; i < NX; i++) {
    acc += colArea[i];
    if (acc >= total * share) { fx = px(i); break; }
  }
  const part: Partition = { n: count, fx, left: rowCuts(inside, nL, true, fx), right: rowCuts(inside, count - nL, false, fx) };
  const cell = new Int8Array(N).fill(-1);
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) if (inside[idx(i, j)]) cell[idx(i, j)] = poolOf(px(i), py(j), part);
  const dSil = distanceToSource(inside.map((v) => (v ? 0 : 1)) as Uint8Array);

  const outline = largestLoop(gaussianBlur(signedDistance(inside), 0.1), 0.09);

  const pools: PoolLayout[] = [];
  const poolUnion = new Uint8Array(N);
  for (let k = 0; k < count; k++) {
    const cand = new Uint8Array(N);
    for (let n = 0; n < N; n++) cand[n] = inside[n] && cell[n] === k && dSil[n] >= RIM ? 1 : 0;
    // Pared pareja: se aleja WALL/2 de cualquier celda que no sea de esta pileta.
    const notCand = cand.map((v) => (v ? 0 : 1)) as Uint8Array;
    const dEdge = distanceToSource(notCand);
    const eroded = new Uint8Array(N);
    for (let n = 0; n < N; n++) eroded[n] = cand[n] && dEdge[n] >= WALL / 2 ? 1 : 0;
    const smooth = gaussianBlur(signedDistance(eroded), 0.2);
    const poly = largestLoop(smooth, 0.09);
    for (let n = 0; n < N; n++) if (smooth[n] > 0) poolUnion[n] = 1;
    pools.push({ index: k, poly, area: Math.abs(polygonArea(poly)), centroid: polygonCentroid(poly) });
  }

  // Lugares de la pared con espacio de sobra (para plantas y otros adornos).
  const dPool = distanceToSource(poolUnion);
  const spots: { p: Pt; score: number }[] = [];
  for (let j = 4; j < NY - 4; j += 2) {
    for (let i = 4; i < NX - 4; i += 2) {
      const n = idx(i, j);
      if (!inside[n] || poolUnion[n]) continue;
      const score = Math.min(dPool[n], dSil[n] + 0.05);
      if (score >= 0.2) spots.push({ p: { x: px(i), y: py(j) }, score });
    }
  }
  spots.sort((a, b) => b.score - a.score);
  const rimSpots: Pt[] = [];
  for (const s of spots) {
    if (rimSpots.every((q) => Math.hypot(q.x - s.p.x, q.y - s.p.y) > 1.6)) rimSpots.push(s.p);
    if (rimSpots.length >= 6) break;
  }

  const xs = outline.map((p) => p.x);
  const ys = outline.map((p) => p.y);
  const layout: BrainLayout = {
    count,
    outline,
    pools,
    bounds: { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) },
    rimSpots,
  };
  cache.set(count, layout);
  return layout;
}
