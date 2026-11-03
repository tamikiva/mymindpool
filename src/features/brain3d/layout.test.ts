import { describe, expect, it } from "vitest";
import { MAX_POOLS, MIN_POOLS, buildBrainLayout, polygonArea, type Pt } from "./layout";
import { pointInPolygon } from "../brain/geometry";

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
function minGap(a: Pt[], b: Pt[]): number {
  let m = Infinity;
  for (const p of a) for (const q of b) m = Math.min(m, dist(p, q));
  return m;
}

describe("geometría orgánica del cerebro", () => {
  it("rechaza cantidades fuera de 2–8", () => {
    expect(() => buildBrainLayout(1)).toThrow(RangeError);
    expect(() => buildBrainLayout(9)).toThrow(RangeError);
  });

  for (let n = MIN_POOLS; n <= MAX_POOLS; n++) {
    describe(`${n} piletas`, () => {
      const L = buildBrainLayout(n);
      it("hay una pileta por área, con forma cerrada y superficie razonable", () => {
        expect(L.pools).toHaveLength(n);
        for (const p of L.pools) {
          expect(p.poly.length, `pileta ${p.index}`).toBeGreaterThan(30);
          expect(p.area, `pileta ${p.index}`).toBeGreaterThan(n === 8 ? 2 : 3);
        }
      });
      it("todas quedan dentro del contorno y no se tocan: hay pared entre ellas", () => {
        for (const p of L.pools) {
          for (const pt of p.poly) expect(pointInPolygon(pt, L.outline), `pileta ${p.index}`).toBe(true);
        }
        for (let a = 0; a < n; a++) {
          for (let b = a + 1; b < n; b++) {
            expect(minGap(L.pools[a].poly, L.pools[b].poly), `${a}-${b}`).toBeGreaterThan(0.25);
          }
        }
      });
      it("la pared exterior tiene espesor", () => {
        for (const p of L.pools) {
          for (const pt of p.poly) {
            const d = Math.min(...L.outline.map((o) => dist(o, pt)));
            expect(d).toBeGreaterThan(0.12);
          }
        }
      });
      it("el contorno es un solo lazo orgánico de tamaño de pantalla", () => {
        expect(Math.abs(polygonArea(L.outline))).toBeGreaterThan(40);
        expect(L.bounds.maxX - L.bounds.minX).toBeGreaterThan(9);
        expect(L.bounds.maxY - L.bounds.minY).toBeGreaterThan(6.5);
      });
    });
  }

  it("con 4 piletas el orden de lectura es: arriba izquierda, arriba derecha, abajo izquierda, abajo derecha", () => {
    const [c0, c1, c2, c3] = buildBrainLayout(4).pools.map((p) => p.centroid);
    expect(c0.x).toBeLessThan(0);
    expect(c1.x).toBeGreaterThan(0);
    expect(c2.x).toBeLessThan(0);
    expect(c3.x).toBeGreaterThan(0);
    expect(c0.y).toBeLessThan(c2.y);
    expect(c1.y).toBeLessThan(c3.y);
  });

  it("hay lugares libres en la pared para adornos", () => {
    expect(buildBrainLayout(4).rimSpots.length).toBeGreaterThanOrEqual(2);
  });
});
