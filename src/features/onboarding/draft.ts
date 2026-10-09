import AsyncStorage from "@react-native-async-storage/async-storage";
import { areaColors } from "@/theme/tokens";

export interface DraftArea {
  name: string;
  color_key: string;
}
export interface Draft {
  displayName: string;
  areas: DraftArea[];
}

const KEY = "mindpool.onboarding.draft.v1";

export const defaultDraft = (): Draft => ({
  displayName: "",
  areas: ["Casa", "Trabajo", "Salud", "Vida social"].map((name, i) => ({
    name,
    color_key: areaColors[i].key,
  })),
});

/** El borrador se conserva en el dispositivo para no perder el onboarding al confirmar el email. */
export async function loadDraft(): Promise<Draft> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) return parseDraft(JSON.parse(raw)) ?? defaultDraft();
  } catch {
    /* sin borrador usable */
  }
  return defaultDraft();
}

export async function saveDraft(d: Draft): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    /* el borrador es una comodidad, no un requisito */
  }
}

export async function clearDraft(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    /* nada */
  }
}

export function parseDraft(v: unknown): Draft | null {
  const o = v as Partial<Draft> | null;
  if (!o || typeof o.displayName !== "string" || !Array.isArray(o.areas)) return null;
  const keys = new Set<string>(areaColors.map((c) => c.key));
  const areas = o.areas.filter(
    (a): a is DraftArea => typeof a?.name === "string" && keys.has(a?.color_key),
  );
  return areas.length >= 2 && areas.length <= 8 ? { displayName: o.displayName.slice(0, 60), areas } : null;
}

export function validateAreas(areas: readonly DraftArea[]): string | null {
  if (areas.length < 2) return "Necesitás al menos 2 áreas.";
  if (areas.length > 8) return "Podés tener hasta 8 áreas.";
  const seen = new Set<string>();
  for (const a of areas) {
    const n = a.name.trim().toLowerCase();
    if (!n) return "Todas las áreas necesitan un nombre.";
    if (a.name.trim().length > 40) return "Los nombres pueden tener hasta 40 caracteres.";
    if (seen.has(n)) return `Hay dos áreas llamadas «${a.name.trim()}». Cambiá una.`;
    seen.add(n);
  }
  return null;
}
