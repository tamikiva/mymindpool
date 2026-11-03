/** Filtros de la lista de tareas (PRD §9). Reglas puras, sin UI ni datos. */
import type { TaskStatus } from "./load";

export type TaskView = "open" | "today" | "overdue" | "upcoming" | "someday" | "completed";

export interface FilterableTask {
  areaId: string;
  title: string;
  status: TaskStatus;
  /** Fecha local YYYY-MM-DD; null = sin fecha. */
  scheduledDate: string | null;
  someday: boolean;
}

export interface TaskFilter {
  view: TaskView;
  /** null = todas las áreas. */
  areaId: string | null;
  search: string;
}

const isOpen = (t: FilterableTask) => t.status === "pending" || t.status === "in_progress";

/** Minúsculas y sin tildes, para que «cafe» encuentre «Café». */
export function normalize(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

export function matchesView(t: FilterableTask, view: TaskView, today: string): boolean {
  switch (view) {
    case "completed":
      return t.status === "completed";
    case "someday":
      return isOpen(t) && t.someday;
    case "overdue":
      return isOpen(t) && !t.someday && t.scheduledDate !== null && t.scheduledDate < today;
    case "today":
      return isOpen(t) && !t.someday && t.scheduledDate === today;
    case "upcoming":
      return isOpen(t) && !t.someday && t.scheduledDate !== null && t.scheduledDate > today;
    case "open":
      return isOpen(t);
  }
}

export function filterTasks<T extends FilterableTask>(tasks: readonly T[], f: TaskFilter, today: string): T[] {
  const q = normalize(f.search);
  return tasks.filter(
    (t) =>
      matchesView(t, f.view, today) &&
      (f.areaId === null || t.areaId === f.areaId) &&
      (q === "" || normalize(t.title).includes(q)),
  );
}

/** Fecha local YYYY-MM-DD válida (rechaza 2026-02-31). */
export function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Suma días a una fecha local YYYY-MM-DD sin depender de la zona horaria del equipo. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
