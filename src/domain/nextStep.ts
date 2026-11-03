/**
 * Sugerencia del próximo paso (PRD §14, orden de la «recomendación de siguiente tarea»).
 * Reglas deterministas y explicables; el motivo solo dice cosas verificables con los datos.
 *
 * Esta es una versión inicial: usa urgencias, las áreas elegidas en el plan de hoy y la carga
 * pendiente. Todavía no mira tiempo registrado, metas, silencios ni excepciones (hito 5).
 */
import { isEligible, type AreaLoad, type TaskStatus, type TaskWeight } from "./load";

export interface StepTask {
  id: string;
  areaId: string;
  title: string;
  status: TaskStatus;
  weight: TaskWeight;
  priority: "normal" | "important" | "urgent";
  scheduledDate: string | null;
  someday: boolean;
  estimateMinutes: number | null;
}

export interface StepArea {
  id: string;
  name: string;
  capacity: number;
}

export interface NextStepInput {
  today: string;
  areas: readonly StepArea[];
  loads: readonly AreaLoad[];
  tasks: readonly StepTask[];
  /** Áreas elegidas en el plan de hoy. */
  plannedAreaIds: readonly string[];
  /** Tareas completadas hoy, por área. */
  completedToday: Readonly<Record<string, number>>;
}

export interface NextStep {
  kind: "urgent" | "planned" | "load";
  areaId: string;
  /** La tarea más chica del área (o la urgente); null si no hay. */
  taskId: string | null;
  headline: string;
  reason: string;
}

/** Tarea corta primero: menor peso, luego menor duración estimada, luego la más antigua. */
export function smallestTask(tasks: readonly StepTask[], areaId: string, today: string): StepTask | null {
  const open = tasks.filter((t) => t.areaId === areaId && isEligible(toLoad(t), today));
  return [...open].sort((a, b) => a.weight - b.weight || (a.estimateMinutes ?? 1e9) - (b.estimateMinutes ?? 1e9))[0] ?? null;
}

const toLoad = (t: StepTask) => ({ areaId: t.areaId, status: t.status, weight: t.weight, scheduledDate: t.scheduledDate, someday: t.someday });

/** «Ya avanzaste en X.» solo si hoy se completó algo en otra área. */
function progressNote(areas: readonly StepArea[], completedToday: Readonly<Record<string, number>>, exceptAreaId: string): string {
  let best: { name: string; n: number } | null = null;
  for (const a of areas) {
    const n = completedToday[a.id] ?? 0;
    if (a.id !== exceptAreaId && n > 0 && (!best || n > best.n)) best = { name: a.name, n };
  }
  return best ? ` Ya avanzaste en ${best.name}.` : "";
}

export function suggestNextStep(input: NextStepInput): NextStep | null {
  const { today, areas, loads, tasks, plannedAreaIds, completedToday } = input;
  const name = (id: string) => areas.find((a) => a.id === id)?.name ?? "";

  // 1. Urgencias relevantes: abiertas, sin fecha futura, marcadas urgentes.
  const urgent = tasks
    .filter((t) => t.priority === "urgent" && isEligible(toLoad(t), today))
    .sort((a, b) => (a.scheduledDate ?? "9999").localeCompare(b.scheduledDate ?? "9999") || a.weight - b.weight)[0];
  if (urgent) {
    return {
      kind: "urgent",
      areaId: urgent.areaId,
      taskId: urgent.id,
      headline: `Hay algo urgente en ${name(urgent.areaId)}`,
      reason: `Marcaste «${urgent.title}» como urgente.`,
    };
  }

  // 2. Áreas que elegiste para hoy y todavía no recibieron una tarea completada.
  const planned = loads
    .filter((l) => plannedAreaIds.includes(l.areaId) && l.pending > 0 && (completedToday[l.areaId] ?? 0) === 0)
    .sort((a, b) => b.level - a.level)[0];
  if (planned) {
    const a = name(planned.areaId);
    return {
      kind: "planned",
      areaId: planned.areaId,
      taskId: smallestTask(tasks, planned.areaId, today)?.id ?? null,
      headline: `¿Le damos un ratito a ${a}?`,
      reason: `Hoy elegiste ${a} y todavía no completaste tareas ahí.${progressNote(areas, completedToday, planned.areaId)}`,
    };
  }

  // 3. La mayor carga pendiente, solo si no es baja (no se declara descuido por una pileta vacía).
  const heaviest = loads.filter((l) => l.pending > 0 && l.band !== "low").sort((a, b) => b.level - a.level)[0];
  if (heaviest) {
    const a = name(heaviest.areaId);
    return {
      kind: "load",
      areaId: heaviest.areaId,
      taskId: smallestTask(tasks, heaviest.areaId, today)?.id ?? null,
      headline: `¿Le damos un ratito a ${a}?`,
      reason: `${a} tiene ${heaviest.pending} de ${heaviest.capacity} puntos pendientes.${progressNote(areas, completedToday, heaviest.areaId)}`,
    };
  }
  return null;
}
