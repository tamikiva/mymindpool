import { describe, expect, it } from "vitest";
import { pointInPolygon } from "../src/features/brain/geometry";
import { OCCLUSION } from "../src/features/brain3d/constants";
import { fitName } from "../src/features/brain3d/labelFit";
import { buildBrainLayout, visibleFloor } from "../src/features/brain3d/layout";
import {
  FLOAT, LADDER, POT, STEPS, SHIFT, distToLabel, distToPolygon, planProps, rayDistance, stepsDepth, stepsDisc,
  type LabelRect,
} from "../src/features/brain3d/propsPlacement";

const NAMES = ["Casa", "Trabajo", "Salud", "Vida social"];
const L = buildBrainLayout(4);
const polys = L.pools.map((p) => p.poly);
const labels: LabelRect[] = polys.map((p, i) => fitName(p, NAMES[i]).rect);

const visible = polys.map((p) => visibleFloor(p, OCCLUSION));
const plan = planProps({ outline: L.outline, pools: polys, visible, labels, bounds: L.bounds });

describe("adornos de 4 áreas", () => {
  it("hay escalera, escalones, flotadores y macetas", () => {
    expect(plan.ladder?.pool).toBe(1);
    expect(plan.steps.length).toBe(2);
    expect(plan.floats.length).toBe(2);
    expect(plan.plants.length).toBe(3);
  });

  it("la escalera apoya en el borde de Trabajo, de frente, con lugar para las bridas", () => {
    const { p, n } = plan.ladder!.spot;
    expect(n.y).toBeLessThan(-0.5);
    for (const k of [-LADDER.half, 0, LADDER.half]) {
      const t = { x: -n.y, y: n.x };
      const q = { x: p.x + t.x * k, y: p.y + t.y * k };
      expect(rayDistance(q, n, L.outline)).toBeGreaterThanOrEqual(LADDER.need);
      const f = { x: q.x + n.x * LADDER.flangeV, y: q.y + n.y * LADDER.flangeV };
      expect(pointInPolygon(f, L.outline)).toBe(true);
      expect(polys.some((pl) => pointInPolygon(f, pl))).toBe(false);
    }
    const foot = { x: p.x - n.x * 0.12, y: p.y - n.y * 0.12 };
    expect(distToLabel(foot, labels[1])).toBeGreaterThan(0.3);
  });

  it("los escalones entran completos en la pileta y lejos del nombre", () => {
    const depth = stepsDepth();
    for (const { pool: i, spot } of plan.steps) {
      const { p, n, t } = spot;
      expect(n.y).toBeLessThanOrEqual(0.35);
      for (const a of [-STEPS.width / 2, 0, STEPS.width / 2]) {
        for (const v of [0.03, depth / 2, depth]) {
          const q = { x: p.x + t.x * a - n.x * v, y: p.y + t.y * a - n.y * v };
          expect(pointInPolygon(q, polys[i]), `pileta ${i}`).toBe(true);
        }
      }
      expect(distToLabel(stepsDisc(spot), labels[i])).toBeGreaterThan(spot.width / 2 * 0 + 0.1);
    }
  });

  it("las macetas quedan sobre el borde y no tapan ninguna pileta ni la escalera", () => {
    const f = plan.ladder!.spot;
    for (const p of plan.plants) {
      expect(pointInPolygon(p, L.outline)).toBe(true);
      expect(polys.some((pl) => pointInPolygon(p, pl))).toBe(false);
      expect(distToPolygon(p, L.outline)).toBeGreaterThanOrEqual(POT.baseR);
      for (const pl of polys) expect(distToPolygon(p, pl)).toBeGreaterThanOrEqual(POT.topR);
      for (let t = 0.1; t < 2.2; t += 0.15) expect(polys.some((pl) => pointInPolygon({ x: p.x, y: p.y - t }, pl))).toBe(false);
      expect(Math.hypot(p.x - f.p.x, p.y - f.p.y)).toBeGreaterThan(0.5);
    }
  });

  it("los flotadores están en el piso visible y su recorrido no toca el nombre ni los escalones", () => {
    const outer = FLOAT.R + FLOAT.tube;
    for (const { pool: i, at } of plan.floats) {
      expect(pointInPolygon(at, visible[i]), `pileta ${i}`).toBe(true);
      expect(distToPolygon(at, polys[i])).toBeGreaterThanOrEqual(outer);
      for (let k = 0; k <= 10; k++) {
        const q = { x: at.x, y: at.y - (FLOAT.maxLift * SHIFT * k) / 10 };
        expect(distToLabel(q, labels[i])).toBeGreaterThan(outer);
      }
      for (const st of plan.steps.filter((s) => s.pool === i)) {
        const d = stepsDisc(st.spot);
        expect(Math.hypot(d.x - at.x, d.y - at.y)).toBeGreaterThan(d.r + outer);
      }
    }
  });
});
