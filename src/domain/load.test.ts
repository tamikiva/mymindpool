import { describe, expect, it } from "vitest";
import { computeAreaLoad, computeBrain, isAllClear, type LoadTask } from "./load";

const today = "2026-10-09";
const t = (o: Partial<LoadTask> = {}): LoadTask => ({
  areaId: "a",
  status: "pending",
  weight: 1,
  scheduledDate: null,
  ...o,
});

describe("carga del agua", () => {
  it("peso 2 en capacidad 8 agrega 25 puntos porcentuales", () => {
    expect(computeAreaLoad("a", 8, [t({ weight: 2 })], today).level).toBe(0.25);
  });
  it("excluye completadas, canceladas, archivadas, futuras y «más adelante»", () => {
    const tasks = [
      t({ status: "completed" }),
      t({ status: "cancelled" }),
      t({ status: "archived" }),
      t({ scheduledDate: "2026-10-16" }),
      t({ someday: true }),
      t(),
    ];
    expect(computeAreaLoad("a", 8, tasks, today).pending).toBe(1);
  });
  it("incluye vencidas, de hoy y en curso", () => {
    const tasks = [
      t({ scheduledDate: "2026-10-01" }),
      t({ scheduledDate: today }),
      t({ status: "in_progress" }),
    ];
    expect(computeAreaLoad("a", 8, tasks, today).pending).toBe(3);
  });
  it("completar resta exactamente su peso, una sola vez (derivado del estado)", () => {
    const open = [t({ weight: 3 }), t({ weight: 1 })];
    const done = [{ ...open[0], status: "completed" as const }, open[1]];
    expect(computeAreaLoad("a", 8, open, today).pending).toBe(4);
    expect(computeAreaLoad("a", 8, done, today).pending).toBe(1);
    expect(computeAreaLoad("a", 8, done, today).pending).toBe(1);
  });
  it("el excedente se informa aparte y el nivel no supera 1", () => {
    const tasks = Array.from({ length: 11 }, () => t());
    const l = computeAreaLoad("a", 8, tasks, today);
    expect(l.level).toBe(1);
    expect(l.excess).toBe(3);
    expect(l.band).toBe("high");
  });
  it("bandas: baja <25%, manejable 25–70%, alta >70%", () => {
    const at = (n: number) => computeAreaLoad("a", 10, Array.from({ length: n }, () => t()), today);
    expect(at(2).band).toBe("low");
    expect(at(3).band).toBe("manageable");
    expect(at(7).band).toBe("manageable");
    expect(at(8).band).toBe("high");
  });
  it("todo vacío es válido y no es descuido", () => {
    const loads = computeBrain([{ id: "a", capacity: 8 }, { id: "b", capacity: 8 }], [], today);
    expect(isAllClear(loads)).toBe(true);
  });
  it("rechaza capacidad no positiva", () => {
    expect(() => computeAreaLoad("a", 0, [], today)).toThrow(RangeError);
  });
});
