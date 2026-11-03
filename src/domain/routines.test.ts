import { describe, expect, it } from "vitest";
import {
  LOCAL_TEMPLATES, MAX_STEPS, currentStep, draftFromLocal, hasErrors, hasShortVersion, moveStep, runProgress,
  shortVersion, suggestTemplates, validateDraft, type DraftStep, type TemplateDraft,
} from "./routines";

const step = (over: Partial<DraftStep> = {}): DraftStep => ({ title: "Paso", areaId: "a1", weight: 1, durationMinutes: null, inShort: false, ...over });
const draft = (over: Partial<TemplateDraft> = {}): TemplateDraft => ({ name: "Rutina", defaultAreaId: "a1", startCue: "", steps: [step()], ...over });

describe("validateDraft", () => {
  it("un borrador correcto no tiene errores", () => expect(hasErrors(validateDraft(draft()))).toBe(false));
  it("exige nombre, al menos un paso y título y área en cada paso", () => {
    expect(validateDraft(draft({ name: "  " })).name).toBeTruthy();
    expect(validateDraft(draft({ steps: [] })).steps).toBeTruthy();
    expect(validateDraft(draft({ steps: [step({ title: " " })] })).step[0]).toBeTruthy();
    expect(validateDraft(draft({ steps: [step(), step({ areaId: "" })] })).step[1]).toBeTruthy();
  });
  it("limita pasos (anti «cien subpasos») y largo de nombre y títulos", () => {
    expect(validateDraft(draft({ steps: Array.from({ length: MAX_STEPS + 1 }, () => step()) })).steps).toMatch(/hasta 20/);
    expect(hasErrors(validateDraft(draft({ steps: Array.from({ length: MAX_STEPS }, () => step()) })))).toBe(false);
    expect(validateDraft(draft({ name: "x".repeat(61) })).name).toBeTruthy();
    expect(validateDraft(draft({ steps: [step({ title: "x".repeat(121) })] })).step[0]).toBeTruthy();
  });
});

describe("pasos", () => {
  it("moveStep reordena sin mutar y los límites no hacen nada", () => {
    const a = ["a", "b", "c"];
    expect(moveStep(a, 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveStep(a, 2, 0)).toEqual(["c", "a", "b"]);
    expect(moveStep(a, 0, -1)).toEqual(a);
    expect(moveStep(a, 1, 5)).toEqual(a);
    expect(a).toEqual(["a", "b", "c"]);
  });
  it("la versión corta siempre incluye la acción inicial, aunque no esté marcada", () => {
    const steps = [step({ title: "A" }), step({ title: "B", inShort: true }), step({ title: "C" })];
    expect(shortVersion(steps).map((s) => s.title)).toEqual(["A", "B"]);
    expect(hasShortVersion(steps)).toBe(true);
    // Marcar solo la acción inicial no alcanza para ofrecer una versión corta distinta.
    expect(hasShortVersion([step({ inShort: true }), step()])).toBe(false);
  });
});

describe("ejecución", () => {
  const run = [
    { id: "1", position: 0, status: "done", weight: 1 },
    { id: "2", position: 1, status: "skipped", weight: 2 },
    { id: "3", position: 2, status: "pending", weight: 3 },
    { id: "4", position: 3, status: "pending", weight: 1 },
    { id: "5", position: 4, status: "cancelled", weight: 1 },
  ] as const;
  it("el paso actual es el primer pendiente", () => {
    expect(currentStep(run)?.id).toBe("3");
    expect(currentStep([{ id: "x", position: 0, status: "done", weight: 1 }])).toBeNull();
  });
  it("el progreso no cuenta lo cancelado y lo saltado no es hecho", () => {
    expect(runProgress(run)).toEqual({ total: 4, done: 1, skipped: 1, pendingWeight: 4 });
  });
});

describe("plantillas locales", () => {
  it("escribir «limpiar la casa» ofrece la plantilla; textos cortos o ajenos, no", () => {
    expect(suggestTemplates("Limpiar la casa").map((t) => t.key)).toContain("limpiar-casa");
    expect(suggestTemplates("limpiar la casa los sábados").map((t) => t.key)).toContain("limpiar-casa");
    expect(suggestTemplates("abc")).toEqual([]);
    expect(suggestTemplates("estudiar para el examen")).toEqual([]);
  });
  it("la plantilla de limpieza empieza siempre por el canasto y tiene versión corta", () => {
    const t = LOCAL_TEMPLATES.find((x) => x.key === "limpiar-casa")!;
    expect(t.steps[0].title).toMatch(/canasto de limpieza/);
    expect(t.steps.filter((s) => s.inShort).length).toBeGreaterThan(0);
  });
  it("draftFromLocal asigna áreas por nombre y usa la predeterminada si no hay coincidencia", () => {
    const t = LOCAL_TEMPLATES.find((x) => x.key === "cerrar-y-caminar")!;
    const d = draftFromLocal(t, [{ id: "t", name: "Trabajo" }, { id: "c", name: "Casa" }], "c");
    expect(d.steps.map((s) => s.areaId)).toEqual(["t", "c", "c"]); // «Salud» no existe → Casa
    expect(d.startCue).toBeTruthy();
    expect(hasErrors(validateDraft(d))).toBe(false);
  });
  it("todas las plantillas son válidas y respetan el tope de pasos", () => {
    for (const t of LOCAL_TEMPLATES) {
      const d = draftFromLocal(t, [{ id: "a", name: "Casa" }], "a");
      expect(hasErrors(validateDraft(d)), t.key).toBe(false);
      expect(d.steps.length).toBeLessThanOrEqual(MAX_STEPS);
    }
  });
});
