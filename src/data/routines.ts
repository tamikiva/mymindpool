import type { LoadTask } from "@/domain/load";
import type { RunStep, StepWeight, TemplateDraft } from "@/domain/routines";
import { getSupabase } from "./supabase";

export interface TemplateStep {
  id: string;
  position: number;
  title: string;
  area_id: string;
  weight: StepWeight;
  duration_minutes: number | null;
  in_short: boolean;
}

export interface Template {
  id: string;
  name: string;
  default_area_id: string | null;
  start_cue: string | null;
  steps: TemplateStep[];
}

export interface RunStepRow extends RunStep {
  title: string;
  area_id: string;
  duration_minutes: number | null;
}

export interface Run {
  id: string;
  template_id: string | null;
  template_name: string;
  version: "full" | "short";
  status: "active" | "paused" | "completed" | "cancelled";
  run_date: string;
  steps: RunStepRow[];
}

const TEMPLATE_COLS = "id, name, default_area_id, start_cue";
const STEP_COLS = "id, template_id, position, title, area_id, weight, duration_minutes, in_short";
const RUN_COLS = "id, template_id, template_name, version, status, run_date";
const RUN_STEP_COLS = "id, run_id, position, title, area_id, weight, duration_minutes, status";

function group<T>(rows: T[], key: keyof T): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = String(r[key]);
    m.set(k, [...(m.get(k) ?? []), r]);
  }
  return m;
}

export async function fetchTemplates(): Promise<Template[]> {
  const sb = getSupabase();
  const [t, s] = await Promise.all([
    sb.from("routine_templates").select(TEMPLATE_COLS).is("archived_at", null).order("created_at"),
    sb.from("routine_template_steps").select(STEP_COLS).order("position"),
  ]);
  if (t.error) throw t.error;
  if (s.error) throw s.error;
  const steps = group((s.data ?? []) as (TemplateStep & { template_id: string })[], "template_id");
  return ((t.data ?? []) as Omit<Template, "steps">[]).map((x) => ({ ...x, steps: steps.get(x.id) ?? [] }));
}

export async function fetchTemplate(id: string): Promise<Template | null> {
  return (await fetchTemplates()).find((t) => t.id === id) ?? null;
}

/** Guarda plantilla y pasos en una sola operación atómica en el servidor. */
export async function saveTemplate(draft: TemplateDraft, id: string | null): Promise<string> {
  const { data, error } = await getSupabase().rpc("save_routine_template", {
    p_id: id,
    p_name: draft.name.trim(),
    p_default_area: draft.defaultAreaId,
    p_cue: draft.startCue.trim() || null,
    p_steps: draft.steps.map((s) => ({
      title: s.title.trim(),
      area_id: s.areaId,
      weight: s.weight,
      duration_minutes: s.durationMinutes,
      in_short: s.inShort,
    })),
  });
  if (error) throw error;
  return data as string;
}

export async function archiveTemplate(id: string): Promise<void> {
  const { error } = await getSupabase().rpc("archive_routine_template", { p_id: id, p_archived: true });
  if (error) throw error;
}

export async function startRun(templateId: string, version: "full" | "short", runDate: string): Promise<string> {
  const { data, error } = await getSupabase().rpc("start_routine_run", {
    p_template_id: templateId,
    p_version: version,
    p_run_date: runDate,
  });
  if (error) throw error;
  return data as string;
}

async function withSteps(runs: Omit<Run, "steps">[]): Promise<Run[]> {
  if (runs.length === 0) return [];
  const { data, error } = await getSupabase()
    .from("routine_run_steps")
    .select(RUN_STEP_COLS)
    .in("run_id", runs.map((r) => r.id))
    .order("position");
  if (error) throw error;
  const steps = group((data ?? []) as (RunStepRow & { run_id: string })[], "run_id");
  return runs.map((r) => ({ ...r, steps: steps.get(r.id) ?? [] }));
}

/** Recorridos abiertos (activos o en pausa). */
export async function fetchOpenRuns(): Promise<Run[]> {
  const { data, error } = await getSupabase()
    .from("routine_runs")
    .select(RUN_COLS)
    .in("status", ["active", "paused"])
    .order("started_at");
  if (error) throw error;
  return withSteps((data ?? []) as Omit<Run, "steps">[]);
}

export async function fetchRun(id: string): Promise<Run | null> {
  const { data, error } = await getSupabase().from("routine_runs").select(RUN_COLS).eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return (await withSteps([data as Omit<Run, "steps">]))[0];
}

export async function advanceStep(stepId: string, action: "complete" | "skip"): Promise<"active" | "completed"> {
  const { data, error } = await getSupabase().rpc("advance_run_step", { p_step_id: stepId, p_action: action });
  if (error) throw error;
  return data as "active" | "completed";
}

export async function setRunState(runId: string, action: "pause" | "resume" | "cancel"): Promise<void> {
  const { error } = await getSupabase().rpc("set_run_state", { p_run_id: runId, p_action: action });
  if (error) throw error;
}

/** Pasos abiertos de rutinas: aportan al agua igual que las tareas (la rutina no cuenta además como tarea padre). */
export async function fetchRunStepLoad(): Promise<LoadTask[]> {
  const { data, error } = await getSupabase()
    .from("routine_run_steps")
    .select("area_id, weight, status")
    .eq("status", "pending");
  if (error) throw error;
  return ((data ?? []) as { area_id: string; weight: StepWeight }[]).map((s) => ({
    areaId: s.area_id,
    status: "pending" as const,
    weight: s.weight,
    scheduledDate: null,
  }));
}
