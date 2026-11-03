import { describe, expect, it } from "vitest";
import { MAX_AREAS, MIN_AREAS, pointInPolygon, sectorPolygon } from "./geometry";
import { LINE_H, MIN_FONT, layoutLabel } from "./labels";
import { blockFits, placeLabel } from "./placement";

describe("etiquetas de pileta", () => {
  it("un nombre corto queda en una línea y grande", () => {
    const l = layoutLabel("Casa", 120);
    expect(l.lines).toEqual(["Casa"]);
    expect(l.fontSize).toBeGreaterThan(20);
    expect(l.truncated).toBe(false);
  });
  it("un nombre de 40 caracteres se parte en varias líneas y sigue legible", () => {
    const l = layoutLabel("Cuidar a mi abuela y organizar sus turnos!", 120);
    expect(l.lines.length).toBeGreaterThanOrEqual(2);
    expect(l.lines.length).toBeLessThanOrEqual(3);
    expect(l.fontSize).toBeGreaterThanOrEqual(MIN_FONT);
  });
  it("nunca baja del tamaño mínimo: si no entra, se acorta con «…»", () => {
    const l = layoutLabel("Cuidar a mi abuela y organizar sus turnos!", 60, 40);
    expect(l.fontSize).toBe(MIN_FONT);
    expect(l.truncated).toBe(true);
    expect(l.lines.join(" ")).toContain("…");
  });
  it("una palabra larguísima se corta con «…»", () => {
    const l = layoutLabel("x".repeat(40), 60, 60);
    expect(l.lines.length).toBeGreaterThanOrEqual(1);
    expect(l.lines.join("")).toContain("…");
    expect(l.fontSize).toBe(MIN_FONT);
  });
  it("respeta el alto disponible", () => {
    const l = layoutLabel("Vida social", 200, 20);
    expect(l.lines.length * l.fontSize * LINE_H).toBeLessThanOrEqual(20 + 1e-6);
  });
});

describe("ubicación de etiquetas en todos los sectores (2 a 8 áreas)", () => {
  const names = ["Casa", "Vida social", "Nombre de área de cuarenta caracteres!!", "x".repeat(40), "Cuidar a mi abuela y organizar sus turnos!"];
  for (let n = MIN_AREAS; n <= MAX_AREAS; n++) {
    it(`${n} áreas: el bloque de texto queda dentro de su sector y es legible`, () => {
      for (let i = 0; i < n; i++) {
        const poly = sectorPolygon(i, n, 0.07);
        for (const name of names) {
          const { label, cx, cy } = placeLabel(poly, name);
          expect(label.fontSize).toBeGreaterThanOrEqual(MIN_FONT);
          expect(label.lines.length).toBeLessThanOrEqual(3);
          expect(blockFits(poly, cx, cy, label), `${n} áreas, sector ${i}, «${name}»`).toBe(true);
        }
      }
    });
  }

  it("los nombres comunes nunca se acortan, con ninguna cantidad de áreas", () => {
    for (let n = MIN_AREAS; n <= MAX_AREAS; n++) {
      for (let i = 0; i < n; i++) {
        for (const name of ["Casa", "Trabajo", "Salud", "Vida social", "Descanso", "Hobbies y juegos"]) {
          const { label } = placeLabel(sectorPolygon(i, n, 0.07), name);
          expect(label.truncated, `${n} áreas, sector ${i}, «${name}»`).toBe(false);
        }
      }
    }
  });
});
