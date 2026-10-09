import { describe, expect, it } from "vitest";
import { layoutLabel } from "./labels";

describe("etiquetas de pileta", () => {
  it("un nombre corto queda en una línea y grande", () => {
    const l = layoutLabel("Casa", 120);
    expect(l.lines).toEqual(["Casa"]);
    expect(l.fontSize).toBeGreaterThan(20);
  });
  it("un nombre de 40 caracteres se parte y se achica pero sigue legible", () => {
    const l = layoutLabel("Cuidar a mi abuela y organizar sus turnos!", 120);
    expect(l.lines.length).toBe(2);
    expect(l.fontSize).toBeGreaterThanOrEqual(9);
  });
});
