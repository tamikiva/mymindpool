import { describe, expect, it } from "vitest";
import { computeBrain, type TaskStatus, type TaskWeight } from "./load";
import { smallestTask, suggestNextStep, type StepArea, type StepTask } from "./nextStep";

const TODAY = "2026-11-03";
const areas: StepArea[] = [
  { id: "casa", name: "Casa", capacity: 8 },
  { id: "trabajo", name: "Trabajo", capacity: 8 },
  { id: "salud", name: "Salud", capacity: 8 },
  { id: "social", name: "Vida social", capacity: 8 },
];
let n = 0;
const t = (areaId: string, over: Partial<StepTask> = {}): StepTask => ({
  id: `t${++n}`, areaId, title: `Tarea ${n}`, status: "pending" as TaskStatus, weight: 1 as TaskWeight, priority: "normal",
  scheduledDate: null, someday: false, estimateMinutes: null, ...over,
});
const run = (tasks: StepTask[], extra: { planned?: string[]; done?: Record<string, number> } = {}) =>
  suggestNextStep({
    today: TODAY, areas, tasks, plannedAreaIds: extra.planned ?? [], completedToday: extra.done ?? {},
    loads: computeBrain(areas, tasks.map((x) => ({ areaId: x.areaId, status: x.status, weight: x.weight, scheduledDate: x.scheduledDate, someday: x.someday })), TODAY),
  });

describe("suggestNextStep", () => {
  it("sin nada pendiente no sugiere: todo despejado es un resultado válido", () => {
    expect(run([])).toBeNull();
    expect(run([t("casa", { status: "completed" }), t("salud", { status: "cancelled" })])).toBeNull();
  });

  it("primero lo urgente, con el motivo verificable", () => {
    const u = t("trabajo", { priority: "urgent", title: "Entregar informe" });
    const s = run([t("salud", { weight: 3 }), t("salud", { weight: 3 }), t("salud", { weight: 2 }), u], { planned: ["salud"] });
    expect(s).toMatchObject({ kind: "urgent", areaId: "trabajo", taskId: u.id });
    expect(s!.reason).toBe("Marcaste «Entregar informe» como urgente.");
  });

  it("una urgente futura, completada o en «Más adelante» no cuenta", () => {
    const tasks = [
      t("trabajo", { priority: "urgent", scheduledDate: "2026-12-01" }),
      t("trabajo", { priority: "urgent", status: "completed" }),
      t("trabajo", { priority: "urgent", someday: true }),
    ];
    expect(run(tasks)?.kind).not.toBe("urgent");
  });

  it("luego las áreas elegidas hoy que no tuvieron avance", () => {
    const tasks = [t("casa", { weight: 3 }), t("salud", { weight: 1 }), t("trabajo", { weight: 2 })];
    const s = run(tasks, { planned: ["salud"] });
    expect(s).toMatchObject({ kind: "planned", areaId: "salud" });
    expect(s!.headline).toBe("¿Le damos un ratito a Salud?");
    expect(s!.reason).toContain("Hoy elegiste Salud y todavía no completaste tareas ahí.");
  });

  it("«Ya avanzaste en Trabajo» solo aparece si hoy se completó algo en Trabajo", () => {
    const tasks = [t("salud", { weight: 2 })];
    expect(run(tasks, { planned: ["salud"], done: { trabajo: 3 } })!.reason).toContain("Ya avanzaste en Trabajo.");
    expect(run(tasks, { planned: ["salud"], done: {} })!.reason).not.toContain("Ya avanzaste");
    // No se cita el área sugerida como avance de otra.
    expect(run(tasks, { planned: ["salud"], done: { salud: 0 } })!.reason).not.toContain("Ya avanzaste");
  });

  it("un área elegida que ya recibió avance no se vuelve a sugerir por el plan", () => {
    const tasks = [t("salud", { weight: 2 }), t("casa", { weight: 3 })];
    const s = run(tasks, { planned: ["salud"], done: { salud: 1 } });
    expect(s).toMatchObject({ kind: "load", areaId: "casa" }); // cae a la regla de carga
  });

  it("sin plan ni urgencias sugiere la mayor carga, pero no una carga baja", () => {
    expect(run([t("casa", { weight: 3 }), t("trabajo", { weight: 3 }), t("trabajo", { weight: 3 })])).toMatchObject({ kind: "load", areaId: "trabajo" });
    expect(run([t("casa", { weight: 1 })])).toBeNull(); // 1 de 8 = carga baja: no se declara descuido
  });

  it("el motivo de carga cita números reales", () => {
    const s = run([t("trabajo", { weight: 3 }), t("trabajo", { weight: 3 })]);
    expect(s!.reason).toBe("Trabajo tiene 6 de 8 puntos pendientes.");
  });

  it("no sugiere un área sin pendientes aunque sea la elegida hoy", () => {
    expect(run([t("casa", { weight: 3 }), t("casa", { weight: 3 })], { planned: ["salud"] })).toMatchObject({ kind: "load", areaId: "casa" });
  });

  it("la tarea sugerida es la más chica del área, y la más corta entre iguales", () => {
    const big = t("salud", { weight: 3 });
    const small = t("salud", { weight: 1, estimateMinutes: 30 });
    const quick = t("salud", { weight: 1, estimateMinutes: 10 });
    expect(smallestTask([big, small, quick], "salud", TODAY)?.id).toBe(quick.id);
    expect(smallestTask([big], "casa", TODAY)).toBeNull();
    expect(smallestTask([t("salud", { scheduledDate: "2027-01-01" })], "salud", TODAY)).toBeNull(); // futura: no se ofrece
  });
});
