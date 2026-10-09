/** Reglas puras del agua (PRD §8). Sin dependencias de UI ni de datos. */

export type TaskWeight = 1 | 2 | 3;
export type TaskStatus = "pending" | "in_progress" | "completed" | "cancelled" | "archived";

export interface LoadTask {
  areaId: string;
  status: TaskStatus;
  weight: TaskWeight;
  /** Fecha local YYYY-MM-DD; null = sin fecha. */
  scheduledDate: string | null;
  /** Lista «Más adelante»: nunca elegible. */
  someday?: boolean;
}

export const DEFAULT_CAPACITY = 8;
export const LOW_THRESHOLD = 0.25;
export const HIGH_THRESHOLD = 0.7;

export type LoadBand = "low" | "manageable" | "high";

export function isEligible(task: LoadTask, today: string): boolean {
  if (task.someday) return false;
  if (task.status !== "pending" && task.status !== "in_progress") return false;
  if (task.scheduledDate !== null && task.scheduledDate > today) return false;
  return true;
}

export interface AreaLoad {
  areaId: string;
  pending: number;
  capacity: number;
  /** clamp(pending / capacity, 0, 1) */
  level: number;
  /** Puntos por encima de la referencia (0 si no supera). */
  excess: number;
  band: LoadBand;
}

export function bandFor(level: number): LoadBand {
  if (level < LOW_THRESHOLD) return "low";
  if (level > HIGH_THRESHOLD) return "high";
  return "manageable";
}

export function computeAreaLoad(
  areaId: string,
  capacity: number,
  tasks: readonly LoadTask[],
  today: string,
): AreaLoad {
  if (!(capacity > 0)) throw new RangeError("La capacidad debe ser mayor que cero");
  const pending = tasks
    .filter((t) => t.areaId === areaId && isEligible(t, today))
    .reduce((sum, t) => sum + t.weight, 0);
  const level = Math.min(1, Math.max(0, pending / capacity));
  return {
    areaId,
    pending,
    capacity,
    level,
    excess: Math.max(0, pending - capacity),
    band: bandFor(level),
  };
}

export function computeBrain(
  areas: readonly { id: string; capacity: number }[],
  tasks: readonly LoadTask[],
  today: string,
): AreaLoad[] {
  return areas.map((a) => computeAreaLoad(a.id, a.capacity, tasks, today));
}

/** Todo vacío es un resultado válido: se muestra descanso, no obligaciones. */
export function isAllClear(loads: readonly AreaLoad[]): boolean {
  return loads.length > 0 && loads.every((l) => l.pending === 0);
}
