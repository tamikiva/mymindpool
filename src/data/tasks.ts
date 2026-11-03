import type { LoadTask, TaskStatus, TaskWeight } from "@/domain/load";
import { getSupabase } from "./supabase";

export interface Task {
  id: string;
  area_id: string;
  title: string;
  status: TaskStatus;
  weight: TaskWeight;
  priority: "normal" | "important" | "urgent";
  scheduled_date: string | null;
  someday: boolean;
  note: string | null;
  estimate_minutes: number | null;
}

const COLUMNS = "id, area_id, title, status, weight, priority, scheduled_date, someday, note, estimate_minutes";

/** Tareas abiertas (el resto no cuenta para el agua ni para la lista de pendientes). */
export async function fetchOpenTasks(): Promise<Task[]> {
  const { data, error } = await getSupabase()
    .from("tasks")
    .select(COLUMNS)
    .in("status", ["pending", "in_progress"])
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as Task[];
}

/** Abiertas más las últimas completadas, para la vista «Completadas». */
export async function fetchTasks(): Promise<Task[]> {
  const sb = getSupabase();
  const [open, done] = await Promise.all([
    sb.from("tasks").select(COLUMNS).in("status", ["pending", "in_progress"]).order("created_at"),
    sb.from("tasks").select(COLUMNS).eq("status", "completed").order("completed_at", { ascending: false }).limit(200),
  ]);
  if (open.error) throw open.error;
  if (done.error) throw done.error;
  return [...((open.data ?? []) as Task[]), ...((done.data ?? []) as Task[])];
}

export async function fetchTask(id: string): Promise<Task | null> {
  const { data, error } = await getSupabase().from("tasks").select(COLUMNS).eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as Task | null) ?? null;
}

export interface TaskPatch {
  title?: string;
  note?: string | null;
  area_id?: string;
  weight?: TaskWeight;
  priority?: Task["priority"];
  scheduled_date?: string | null;
  someday?: boolean;
  status?: "pending" | "cancelled";
}

export async function updateTask(id: string, patch: TaskPatch): Promise<void> {
  const { error } = await getSupabase().from("tasks").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await getSupabase().from("tasks").delete().eq("id", id);
  if (error) throw error;
}

export interface NewTask {
  areaId: string;
  title: string;
  weight?: TaskWeight;
  scheduledDate?: string | null;
}

export async function createTask(userId: string, t: NewTask): Promise<void> {
  const { error } = await getSupabase().from("tasks").insert({
    user_id: userId,
    area_id: t.areaId,
    title: t.title.trim(),
    weight: t.weight ?? 1,
    scheduled_date: t.scheduledDate ?? null,
  });
  if (error) throw error;
}

export async function completeTask(id: string): Promise<void> {
  const { error } = await getSupabase().rpc("complete_task", { p_task_id: id });
  if (error) throw error;
}

export async function undoCompleteTask(id: string): Promise<void> {
  const { error } = await getSupabase().rpc("undo_complete_task", { p_task_id: id });
  if (error) throw error;
}

export const toLoadTask = (t: Task): LoadTask => ({
  areaId: t.area_id,
  status: t.status,
  weight: t.weight,
  scheduledDate: t.scheduled_date,
  someday: t.someday,
});

/** Mueve las tareas abiertas de un área a otra, para poder archivar la primera sin perderlas. */
export async function moveOpenTasks(fromAreaId: string, toAreaId: string): Promise<void> {
  const { error } = await getSupabase()
    .from("tasks")
    .update({ area_id: toAreaId })
    .eq("area_id", fromAreaId)
    .in("status", ["pending", "in_progress"]);
  if (error) throw error;
}

/** Cuántas tareas se completaron hoy en cada área (desde la medianoche local). */
export async function fetchCompletedToday(): Promise<Record<string, number>> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const { data, error } = await getSupabase()
    .from("tasks")
    .select("area_id")
    .eq("status", "completed")
    .gte("completed_at", start.toISOString());
  if (error) throw error;
  const out: Record<string, number> = {};
  for (const r of (data ?? []) as { area_id: string }[]) out[r.area_id] = (out[r.area_id] ?? 0) + 1;
  return out;
}
