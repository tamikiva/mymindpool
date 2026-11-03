import type { LoadTask } from "@/domain/load";
import type { Frequency, RecurrenceRule } from "@/domain/recurrence";
import { addDays } from "@/domain/taskFilters";
import { getSupabase } from "./supabase";

export interface RecurringTask {
  id: string;
  area_id: string;
  title: string;
  note: string | null;
  weight: 1 | 2 | 3;
  priority: "normal" | "important" | "urgent";
  rule: RecurrenceRule;
}

export interface Occurrence {
  id: string;
  recurring_task_id: string;
  occurrence_date: string;
  title: string;
  area_id: string;
  weight: 1 | 2 | 3;
  status: "pending" | "done" | "skipped";
}

export interface RecurringDraft {
  title: string;
  note: string;
  areaId: string;
  weight: 1 | 2 | 3;
  priority: "normal" | "important" | "urgent";
  rule: RecurrenceRule;
}

/** Ventana de generación hacia adelante: hoy y la semana próxima. Nunca se rellena el pasado. */
export const AHEAD_DAYS = 7;

export async function fetchRecurring(): Promise<RecurringTask[]> {
  const sb = getSupabase();
  const [t, r] = await Promise.all([
    sb.from("recurring_tasks").select("id, rule_id, area_id, title, note, weight, priority").is("archived_at", null).order("created_at"),
    sb.from("recurrence_rules").select("id, frequency, interval_count, weekdays, start_date, end_date"),
  ]);
  if (t.error) throw t.error;
  if (r.error) throw r.error;
  const rules = new Map(
    ((r.data ?? []) as { id: string; frequency: Frequency; interval_count: number; weekdays: number[]; start_date: string; end_date: string | null }[]).map((x) => [
      x.id,
      { frequency: x.frequency, interval: x.interval_count, weekdays: x.weekdays, start: x.start_date, end: x.end_date } as RecurrenceRule,
    ]),
  );
  return ((t.data ?? []) as (Omit<RecurringTask, "rule"> & { rule_id: string })[])
    .filter((x) => rules.has(x.rule_id))
    .map(({ rule_id, ...rest }) => ({ ...rest, rule: rules.get(rule_id)! }));
}

export async function saveRecurring(draft: RecurringDraft, id: string | null, today: string): Promise<string> {
  const { data, error } = await getSupabase().rpc("save_recurring_task", {
    p_id: id,
    p_area_id: draft.areaId,
    p_title: draft.title.trim(),
    p_note: draft.note.trim() || null,
    p_weight: draft.weight,
    p_priority: draft.priority,
    p_frequency: draft.rule.frequency,
    p_interval: draft.rule.interval,
    p_weekdays: draft.rule.frequency === "weekly" ? draft.rule.weekdays : [],
    p_start: draft.rule.start,
    p_end: draft.rule.end,
    p_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
    p_today: today,
  });
  if (error) throw error;
  return data as string;
}

export async function archiveRecurring(id: string, today: string): Promise<void> {
  const { error } = await getSupabase().rpc("archive_recurring_task", { p_id: id, p_today: today });
  if (error) throw error;
}

/**
 * Genera las ocurrencias que faltan (hoy y la semana próxima). Es idempotente y se llama al abrir
 * las pantallas. Si falla, no se bloquea nada: simplemente no habrá repeticiones nuevas hasta reintentar.
 */
export async function syncOccurrences(today: string): Promise<void> {
  try {
    await getSupabase().rpc("ensure_occurrences", { p_from: today, p_to: addDays(today, AHEAD_DAYS) });
  } catch {
    /* sin efecto visible: se reintenta en la próxima carga */
  }
}

/** Pendientes de hoy o anteriores, y lo resuelto hoy (para poder deshacer). */
export async function fetchActiveOccurrences(today: string): Promise<Occurrence[]> {
  const sb = getSupabase();
  const cols = "id, recurring_task_id, occurrence_date, title, area_id, weight, status";
  const [pending, resolved] = await Promise.all([
    sb.from("task_occurrences").select(cols).eq("status", "pending").lte("occurrence_date", today).order("occurrence_date"),
    sb.from("task_occurrences").select(cols).in("status", ["done", "skipped"]).eq("occurrence_date", today),
  ]);
  if (pending.error) throw pending.error;
  if (resolved.error) throw resolved.error;
  return [...((pending.data ?? []) as Occurrence[]), ...((resolved.data ?? []) as Occurrence[])];
}

export async function setOccurrence(id: string, action: "complete" | "skip" | "undo"): Promise<void> {
  const { error } = await getSupabase().rpc("set_occurrence_state", { p_id: id, p_action: action });
  if (error) throw error;
}

/** Solo la ocurrencia pendiente de HOY suma al agua (una vencida no acumula deuda). */
export async function fetchTodayOccurrenceLoad(today: string): Promise<LoadTask[]> {
  const { data, error } = await getSupabase()
    .from("task_occurrences")
    .select("area_id, weight")
    .eq("status", "pending")
    .eq("occurrence_date", today);
  if (error) throw error;
  return ((data ?? []) as { area_id: string; weight: 1 | 2 | 3 }[]).map((o) => ({
    areaId: o.area_id,
    status: "pending" as const,
    weight: o.weight,
    scheduledDate: today,
  }));
}
