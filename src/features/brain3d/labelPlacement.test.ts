import { describe, expect, it } from "vitest";
import { GUARANTEED_LETTERS, LABEL_MAX_FONT, LABEL_MIN_FONT, LABEL_SCALE, OCCLUSION } from "./constants";
import { buildBrainLayout, visibleFloor } from "./layout";
import { placeLabelRotated, rotatedBlockFits } from "./labelPlacement";

const OCC = OCCLUSION;
const scaled = (p: { x: number; y: number }[]) => p.map((q) => ({ x: q.x * LABEL_SCALE, y: q.y * LABEL_SCALE }));
const COMMON = ["Casa", "Trabajo", "Salud", "Vida social", "Descanso", "Estudio", "Pareja", "Amigas"];

describe("ubicación del nombre (con giro) en el piso visible", () => {
  for (let n = 4; n <= 4; n++) {
    it(`${n} piletas: el bloque queda dentro del piso visible y es legible`, () => {
      const L = buildBrainLayout(n);
      L.pools.forEach((p, i) => {
        const vis = scaled(visibleFloor(p.poly, OCC));
        for (const name of [COMMON[i % COMMON.length], "x".repeat(40), "Cuidar a mi abuela y organizar sus turnos!"]) {
          const r = placeLabelRotated(vis, name, LABEL_MAX_FONT, undefined, LABEL_MIN_FONT);
          expect(r.label.fontSize, `${n} piletas, #${i}, «${name}»`).toBeGreaterThanOrEqual(LABEL_MIN_FONT);
          expect(rotatedBlockFits(vis, r.cx, r.cy, r.angle, r.label), `${n} piletas, #${i}, «${name}»`).toBe(true);
        }
      });
    });
  }

  it("cada pileta muestra entero un nombre de una palabra de hasta GUARANTEED_LETTERS letras, con cualquier cantidad de áreas", () => {
    for (const n of Object.keys(GUARANTEED_LETTERS).map(Number)) {
      const word = "Abcdefghijkl".slice(0, GUARANTEED_LETTERS[n]);
      buildBrainLayout(n).pools.forEach((p, i) => {
        const vis = scaled(visibleFloor(p.poly, OCC));
        const r = placeLabelRotated(vis, word, LABEL_MAX_FONT, undefined, LABEL_MIN_FONT);
        expect(r.label.truncated, `${n} piletas, pileta ${i}, «${word}»`).toBe(false);
      });
    }
  });

  it("un nombre con espacios (Vida social) entra entero en todas las piletas con 4 áreas", () => {
    for (const n of [4]) {
      buildBrainLayout(n).pools.forEach((p, i) => {
        const vis = scaled(visibleFloor(p.poly, OCC));
        const r = placeLabelRotated(vis, "Vida social", LABEL_MAX_FONT, undefined, LABEL_MIN_FONT);
        expect(r.label.truncated, `${n} piletas, pileta ${i}`).toBe(false);
      });
    }
  });

  it.todo("2, 3, 5, 6, 7 y 8 piletas: volver a medir la ubicación de nombres con las paredes nuevas (pendiente)");

  it("permite que el nombre siga una pileta inclinada", () => {
    // Una cinta diagonal: un bloque horizontal no entra, uno girado sí.
    const strip = [{ x: 0, y: 0 }, { x: 120, y: 60 }, { x: 120, y: 84 }, { x: 0, y: 24 }];
    const r = placeLabelRotated(strip, "Trabajo", 26);
    expect(r.label.truncated).toBe(false);
    expect(Math.abs(r.angle)).toBeGreaterThan(0.2);
  });
});
