/** Reglas puras de rutinas (PRD §11). Sin UI ni datos. */
import { normalize } from "./taskFilters";

export const MAX_STEPS = 20;
export const MAX_NAME = 60;
export const MAX_STEP_TITLE = 120;

export type StepWeight = 1 | 2 | 3;

export interface DraftStep {
  title: string;
  areaId: string;
  weight: StepWeight;
  durationMinutes: number | null;
  inShort: boolean;
}

export interface TemplateDraft {
  name: string;
  defaultAreaId: string | null;
  startCue: string;
  steps: DraftStep[];
}

export interface DraftErrors {
  name?: string;
  steps?: string;
  /** Errores por índice de paso. */
  step: Record<number, string>;
}

export function validateDraft(d: TemplateDraft): DraftErrors {
  const e: DraftErrors = { step: {} };
  const name = d.name.trim();
  if (!name) e.name = "Poné un nombre para la rutina.";
  else if (name.length > MAX_NAME) e.name = `El nombre admite hasta ${MAX_NAME} caracteres.`;
  if (d.steps.length < 1) e.steps = "Agregá al menos un paso.";
  else if (d.steps.length > MAX_STEPS) e.steps = `Una rutina admite hasta ${MAX_STEPS} pasos. Mejor dividila en dos.`;
  d.steps.forEach((s, i) => {
    const t = s.title.trim();
    if (!t) e.step[i] = "Poné un título para este paso.";
    else if (t.length > MAX_STEP_TITLE) e.step[i] = `El título admite hasta ${MAX_STEP_TITLE} caracteres.`;
    else if (!s.areaId) e.step[i] = "Elegí un área para este paso.";
  });
  return e;
}

export const hasErrors = (e: DraftErrors) => !!e.name || !!e.steps || Object.keys(e.step).length > 0;

/** Mueve un paso de lugar sin mutar el arreglo; los límites no hacen nada. */
export function moveStep<T>(steps: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= steps.length || to >= steps.length) return [...steps];
  const next = [...steps];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Pasos que se harían en la versión corta: la acción inicial (siempre) más los marcados. */
export function shortVersion<T extends { inShort: boolean }>(steps: readonly T[]): T[] {
  return steps.filter((s, i) => i === 0 || s.inShort);
}

/** La versión corta existe si hay al menos un paso, además de la acción inicial, marcado como corto. */
export const hasShortVersion = (steps: readonly { inShort: boolean }[]) => steps.some((s, i) => i > 0 && s.inShort);

export interface RunStep {
  id: string;
  position: number;
  status: "pending" | "done" | "skipped" | "cancelled";
  weight: number;
}

/** Paso actual: el primero pendiente, por posición. */
export function currentStep<T extends RunStep>(steps: readonly T[]): T | null {
  return [...steps].filter((s) => s.status === "pending").sort((a, b) => a.position - b.position)[0] ?? null;
}

export interface RunProgress {
  total: number;
  done: number;
  skipped: number;
  /** Carga que todavía aporta al agua (pasos pendientes). */
  pendingWeight: number;
}

export function runProgress(steps: readonly RunStep[]): RunProgress {
  const live = steps.filter((s) => s.status !== "cancelled");
  return {
    total: live.length,
    done: live.filter((s) => s.status === "done").length,
    skipped: live.filter((s) => s.status === "skipped").length,
    pendingWeight: live.filter((s) => s.status === "pending").reduce((n, s) => n + s.weight, 0),
  };
}

// ---- Plantillas locales (V1: sin IA; solo texto sugerido y editable) ----

export interface LocalTemplate {
  key: string;
  name: string;
  /** Frases que, al escribirse en el nombre, hacen que se ofrezca esta plantilla. */
  keywords: string[];
  startCue?: string;
  steps: { title: string; areaHint?: string; weight?: StepWeight; inShort?: boolean }[];
}

export const LOCAL_TEMPLATES: readonly LocalTemplate[] = [
  {
    key: "limpiar-casa",
    name: "Limpiar la casa",
    keywords: ["limpiar la casa", "limpieza de la casa", "limpiar casa", "limpieza"],
    steps: [
      { title: "Sacar el canasto de limpieza y dejarlo en la cocina", areaHint: "Casa" },
      { title: "Juntar la basura", areaHint: "Casa", inShort: true },
      { title: "Recoger objetos que están fuera de lugar", areaHint: "Casa" },
      { title: "Lavar los platos", areaHint: "Casa", inShort: true },
      { title: "Limpiar las superficies", areaHint: "Casa" },
      { title: "Barrer", areaHint: "Casa" },
      { title: "Guardar los elementos de limpieza", areaHint: "Casa" },
    ],
  },
  {
    key: "almuerzo",
    name: "Almuerzo",
    keywords: ["almuerzo", "almorzar", "preparar el almuerzo"],
    steps: [
      { title: "Preparar el almuerzo", areaHint: "Casa" },
      { title: "Almorzar", areaHint: "Salud", inShort: true },
      { title: "Lavar los platos", areaHint: "Casa", inShort: true },
      { title: "Limpiar la mesada", areaHint: "Casa" },
    ],
  },
  {
    key: "cerrar-y-caminar",
    name: "Cerrar el trabajo y salir a caminar",
    keywords: ["caminar", "salir a caminar", "cerrar la computadora", "cerrar el trabajo"],
    startCue: "Cuando termine mi horario de trabajo",
    steps: [
      { title: "Cerrar la computadora", areaHint: "Trabajo" },
      { title: "Ponerme las zapatillas", areaHint: "Salud", inShort: true },
      { title: "Caminar 15 minutos", areaHint: "Salud", inShort: true },
    ],
  },
];

/** Plantillas que coinciden con lo que la persona va escribiendo (sin fingir comprensión por IA). */
export function suggestTemplates(typed: string): LocalTemplate[] {
  const q = normalize(typed);
  if (q.length < 4) return [];
  return LOCAL_TEMPLATES.filter((t) => t.keywords.some((k) => normalize(k).includes(q) || q.includes(normalize(k))));
}

/** Convierte una plantilla local en un borrador editable. Un área sin coincidencia usa la predeterminada. */
export function draftFromLocal(
  t: LocalTemplate,
  areas: readonly { id: string; name: string }[],
  defaultAreaId: string,
): TemplateDraft {
  const byName = new Map(areas.map((a) => [normalize(a.name), a.id]));
  return {
    name: t.name,
    defaultAreaId,
    startCue: t.startCue ?? "",
    steps: t.steps.map((s) => ({
      title: s.title,
      areaId: (s.areaHint && byName.get(normalize(s.areaHint))) || defaultAreaId,
      weight: s.weight ?? 1,
      durationMinutes: null,
      inShort: !!s.inShort,
    })),
  };
}
