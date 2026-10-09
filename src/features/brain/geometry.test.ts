import { describe, expect, it } from "vitest";
import { MAX_AREAS, MIN_AREAS, bounds, sectorPolygon, waterSurfaceY } from "./geometry";

describe("geometría del cerebro", () => {
  it("soporta de 2 a 8 sectores no degenerados", () => {
    for (let n = MIN_AREAS; n <= MAX_AREAS; n++) {
      for (let i = 0; i < n; i++) {
        const b = bounds(sectorPolygon(i, n, 0.05));
        expect(b.maxX - b.minX).toBeGreaterThan(20);
        expect(b.maxY - b.minY).toBeGreaterThan(20);
      }
    }
  });
  it("rechaza cantidades fuera de rango", () => {
    expect(() => sectorPolygon(0, 1)).toThrow(RangeError);
    expect(() => sectorPolygon(0, 9)).toThrow(RangeError);
  });
  it("la superficie sube con el nivel", () => {
    const p = sectorPolygon(0, 4, 0.05);
    expect(waterSurfaceY(p, 0)).toBeGreaterThan(waterSurfaceY(p, 0.5));
    expect(waterSurfaceY(p, 0.5)).toBeGreaterThan(waterSurfaceY(p, 1));
    expect(waterSurfaceY(p, 2)).toBe(waterSurfaceY(p, 1));
  });
});
