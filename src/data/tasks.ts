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
}

const COLUMNS = "id, area_id, title, status, weight, priority, scheduled_date, someday";

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

export interface NewTask {
  areaId: string;
  title: string;
  weight?: TaskWeight;
}

export async function createTask(userId: string, t: NewTask): Promise<void> {
  const { error } = await getSupabase().from("tasks").insert({
    user_id: userId,
    area_id: t.areaId,
    title: t.title.trim(),
    weight: t.weight ?? 1,
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
