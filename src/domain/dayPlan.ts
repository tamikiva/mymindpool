/** Reglas puras de la planificación del día (PRD §10). Sin UI ni datos. */

export type Moment = "morning" | "midday" | "afternoon" | "night";

export const MOMENTS: { value: Moment | "none"; label: string }[] = [
  { value: "none", label: "Sin momento" },
  { value: "morning", label: "Mañana" },
  { value: "midday", label: "Mediodía" },
  { value: "afternoon", label: "Tarde" },
  { value: "night", label: "Noche" },
];

export interface PlanAreaDraft {
  areaId: string;
  moment: Moment | null;
  /** Texto tal como lo escribe la persona; vacío = sin estimar. */
  minutes: string;
}

export interface PlanDraft {
  /** Texto de minutos disponibles; vacío = no declarado. */
  available: string;
  areas: PlanAreaDraft[];
  taskIds: string[];
  routineIds: string[];
}

export const MAX_MINUTES = 1440;

/** Minutos de un texto: null si está vacío, NaN si no es un entero válido. */
export function parseMinutes(text: string): number | null {
  const t = text.trim();
  if (t === "") return null;
  if (!/^\d+$/.test(t)) return NaN;
  const n = Number(t);
  return n > MAX_MINUTES ? NaN : n;
}

export interface PlanErrors {
  areas?: string;
  available?: string;
  /** Por id de área. */
  area: Record<string, string>;
}

export function validatePlan(d: PlanDraft): PlanErrors {
  const e: PlanErrors = { area: {} };
  if (d.areas.length === 0) e.areas = "Elegí al menos un área para hoy.";
  if (Number.isNaN(parseMinutes(d.available))) e.available = "Usá minutos, con números enteros hasta 1440.";
  for (const a of d.areas) {
    if (Number.isNaN(parseMinutes(a.minutes))) e.area[a.areaId] = "Usá minutos, con números enteros hasta 1440.";
  }
  return e;
}

export const planHasErrors = (e: PlanErrors) => !!e.areas || !!e.available || Object.keys(e.area).length > 0;

export interface TimeSummary {
  planned: number;
  available: number | null;
  /** Minutos que el plan supera lo disponible (0 si no lo supera o no hay dato). */
  over: number;
  /** Cantidad de áreas sin minutos estimados: el total es un mínimo. */
  unestimated: number;
}

/** Carga temporal del plan frente al tiempo declarado. Solo informa: nunca bloquea un plan imperfecto. */
export function planTimeSummary(d: PlanDraft): TimeSummary {
  const mins = d.areas.map((a) => parseMinutes(a.minutes));
  const planned = mins.reduce<number>((s, m) => s + (m !== null && !Number.isNaN(m) ? m : 0), 0);
  const avail = parseMinutes(d.available);
  const available = avail !== null && !Number.isNaN(avail) ? avail : null;
  return {
    planned,
    available,
    over: available !== null ? Math.max(0, planned - available) : 0,
    unestimated: mins.filter((m) => m === null).length,
  };
}

/** Agrega o quita un área. Al quitarla también se quitan sus tareas y rutinas, que ya no tienen dónde estar. */
export function toggleArea(
  d: PlanDraft,
  areaId: string,
  taskArea: ReadonlyMap<string, string | null>,
  routineArea: ReadonlyMap<string, string | null>,
): PlanDraft {
  if (d.areas.some((a) => a.areaId === areaId)) {
    return {
      ...d,
      areas: d.areas.filter((a) => a.areaId !== areaId),
      taskIds: d.taskIds.filter((id) => taskArea.get(id) !== areaId),
      routineIds: d.routineIds.filter((id) => routineArea.get(id) !== areaId),
    };
  }
  return { ...d, areas: [...d.areas, { areaId, moment: null, minutes: "" }] };
}

export function toggleId(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

/** Tareas ofrecibles para el plan: abiertas, de las áreas elegidas, sin fecha futura y fuera de «Más adelante». */
export function plannableTasks<T extends { id: string; areaId: string; scheduledDate: string | null; someday: boolean }>(
  tasks: readonly T[],
  areaIds: readonly string[],
  today: string,
): T[] {
  return tasks.filter((t) => areaIds.includes(t.areaId) && !t.someday && (t.scheduledDate === null || t.scheduledDate <= today));
}
