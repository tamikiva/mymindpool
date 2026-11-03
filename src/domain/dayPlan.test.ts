import { describe, expect, it } from "vitest";
import {
  parseMinutes, plannableTasks, planHasErrors, planTimeSummary, toggleArea, toggleId, validatePlan, type PlanDraft,
} from "./dayPlan";

const draft = (over: Partial<PlanDraft> = {}): PlanDraft => ({
  available: "", areas: [{ areaId: "casa", moment: null, minutes: "" }], taskIds: [], routineIds: [], ...over,
});

describe("minutos", () => {
  it("vacío es «sin dato»; enteros válidos pasan; lo demás es inválido", () => {
    expect(parseMinutes("")).toBeNull();
    expect(parseMinutes(" 90 ")).toBe(90);
    expect(parseMinutes("0")).toBe(0);
    expect(parseMinutes("1440")).toBe(1440);
    for (const bad of ["1441", "-5", "1.5", "dos horas", "90m"]) expect(parseMinutes(bad), bad).toBeNaN();
  });
});

describe("validatePlan", () => {
  it("exige al menos un área, pero no tiempos ni tareas", () => {
    expect(validatePlan(draft()).areas).toBeUndefined();
    expect(validatePlan(draft({ areas: [] })).areas).toMatch(/al menos un área/);
    expect(planHasErrors(validatePlan(draft()))).toBe(false);
  });
  it("marca minutos inválidos, del día o de un área", () => {
    expect(validatePlan(draft({ available: "mucho" })).available).toBeTruthy();
    const e = validatePlan(draft({ areas: [{ areaId: "casa", moment: null, minutes: "-1" }] }));
    expect(e.area.casa).toBeTruthy();
    expect(planHasErrors(e)).toBe(true);
  });
});

describe("planTimeSummary", () => {
  const areas = (...m: string[]) => m.map((minutes, i) => ({ areaId: `a${i}`, moment: null, minutes }));
  it("suma los minutos previstos y compara con lo disponible", () => {
    const s = planTimeSummary(draft({ available: "480", areas: areas("240", "120", "60") }));
    expect(s).toMatchObject({ planned: 420, available: 480, over: 0, unestimated: 0 });
  });
  it("avisa cuando se supera lo disponible, sin bloquear", () => {
    const d = draft({ available: "240", areas: areas("180", "120") });
    expect(planTimeSummary(d).over).toBe(60);
    expect(planHasErrors(validatePlan(d))).toBe(false); // un plan imperfecto se puede guardar
  });
  it("sin tiempo declarado no hay exceso; las áreas sin minutos se informan", () => {
    const s = planTimeSummary(draft({ areas: areas("60", "") }));
    expect(s).toMatchObject({ planned: 60, available: null, over: 0, unestimated: 1 });
  });
  it("ignora valores inválidos en el resumen", () => {
    expect(planTimeSummary(draft({ available: "x", areas: areas("60", "abc") }))).toMatchObject({ planned: 60, available: null });
  });
});

describe("áreas, tareas y rutinas elegidas", () => {
  const taskArea = new Map<string, string | null>([["t1", "casa"], ["t2", "trabajo"]]);
  const routineArea = new Map<string, string | null>([["r1", "casa"], ["r2", null]]);
  it("al quitar un área se quitan sus tareas y rutinas, y no las de otras", () => {
    const d = draft({
      areas: [{ areaId: "casa", moment: null, minutes: "" }, { areaId: "trabajo", moment: null, minutes: "" }],
      taskIds: ["t1", "t2"], routineIds: ["r1", "r2"],
    });
    const out = toggleArea(d, "casa", taskArea, routineArea);
    expect(out.areas.map((a) => a.areaId)).toEqual(["trabajo"]);
    expect(out.taskIds).toEqual(["t2"]);
    expect(out.routineIds).toEqual(["r2"]); // la rutina sin área predeterminada no depende de un área
  });
  it("agregar un área la suma sin momento ni minutos", () => {
    expect(toggleArea(draft({ areas: [] }), "salud", taskArea, routineArea).areas).toEqual([{ areaId: "salud", moment: null, minutes: "" }]);
  });
  it("toggleId agrega y quita sin duplicar", () => {
    expect(toggleId(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleId(["a", "b"], "a")).toEqual(["b"]);
  });
  it("plannableTasks ofrece abiertas de las áreas elegidas, sin futuras ni «Más adelante»", () => {
    const t = (id: string, areaId: string, scheduledDate: string | null, someday = false) => ({ id, areaId, scheduledDate, someday });
    const out = plannableTasks(
      [t("1", "casa", null), t("2", "casa", "2026-11-03"), t("3", "casa", "2026-11-10"), t("4", "casa", null, true), t("5", "trabajo", null), t("6", "casa", "2026-10-01")],
      ["casa"], "2026-11-03",
    );
    expect(out.map((x) => x.id)).toEqual(["1", "2", "6"]);
  });
});
