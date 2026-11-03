import type { PlanDraft } from "@/domain/dayPlan";
import { parseMinutes, type Moment } from "@/domain/dayPlan";
import { getSupabase } from "./supabase";

export interface PlanArea {
  area_id: string;
  moment: Moment | null;
  planned_minutes: number | null;
}

export interface PlanTask {
  id: string;
  title: string;
  status: string;
  area_id: string;
  weight: number;
}

export interface Plan {
  id: string;
  plan_date: string;
  available_minutes: number | null;
  closed_at: string | null;
  areas: PlanArea[];
  tasks: PlanTask[];
  routines: { id: string; name: string }[];
}

/** El plan de una fecha con sus áreas, tareas y rutinas; null si no hay plan. */
export async function fetchPlan(date: string): Promise<Plan | null> {
  const sb = getSupabase();
  const { data: plan, error } = await sb
    .from("day_plans")
    .select("id, plan_date, available_minutes, closed_at")
    .eq("plan_date", date)
    .maybeSingle();
  if (error) throw error;
  if (!plan) return null;
  const [areas, items] = await Promise.all([
    sb.from("day_plan_areas").select("area_id, moment, planned_minutes").eq("plan_id", plan.id),
    sb.from("day_plan_items").select("task_id, routine_template_id, position").eq("plan_id", plan.id).order("position"),
  ]);
  if (areas.error) throw areas.error;
  if (items.error) throw items.error;
  const rows = (items.data ?? []) as { task_id: string | null; routine_template_id: string | null }[];
  const taskIds = rows.map((r) => r.task_id).filter((x): x is string => !!x);
  const routineIds = rows.map((r) => r.routine_template_id).filter((x): x is string => !!x);
  const [tasks, routines] = await Promise.all([
    taskIds.length ? sb.from("tasks").select("id, title, status, area_id, weight").in("id", taskIds) : Promise.resolve({ data: [], error: null }),
    routineIds.length ? sb.from("routine_templates").select("id, name").in("id", routineIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (tasks.error) throw tasks.error;
  if (routines.error) throw routines.error;
  const byId = new Map(((tasks.data ?? []) as PlanTask[]).map((t) => [t.id, t]));
  const rById = new Map(((routines.data ?? []) as { id: string; name: string }[]).map((r) => [r.id, r]));
  return {
    ...(plan as Omit<Plan, "areas" | "tasks" | "routines">),
    areas: (areas.data ?? []) as PlanArea[],
    // Se conserva el orden en que se eligieron.
    tasks: taskIds.map((id) => byId.get(id)).filter((t): t is PlanTask => !!t),
    routines: routineIds.map((id) => rById.get(id)).filter((r): r is { id: string; name: string } => !!r),
  };
}

export async function savePlan(date: string, d: PlanDraft): Promise<string> {
  const { data, error } = await getSupabase().rpc("save_day_plan", {
    p_date: date,
    p_available: parseMinutes(d.available),
    p_areas: d.areas.map((a) => ({ area_id: a.areaId, moment: a.moment, planned_minutes: parseMinutes(a.minutes) })),
    p_items: [
      ...d.taskIds.map((id) => ({ kind: "task", id })),
      ...d.routineIds.map((id) => ({ kind: "routine", id })),
    ],
  });
  if (error) throw error;
  return data as string;
}

export async function closeDay(date: string, carryTaskIds: string[]): Promise<void> {
  const { error } = await getSupabase().rpc("close_day_plan", { p_date: date, p_carry_task_ids: carryTaskIds });
  if (error) throw error;
}
