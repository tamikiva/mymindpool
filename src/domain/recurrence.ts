/**
 * Recurrencias de tareas (PRD §9 y §16). Fechas locales «YYYY-MM-DD», sin zona horaria:
 * la ocurrencia de un día es una fecha de calendario de la persona, no un instante.
 * Debe coincidir exactamente con la función SQL `rule_matches` (hay una prueba que las cruza).
 */

export type Frequency = "daily" | "weekly";

export interface RecurrenceRule {
  frequency: Frequency;
  /** Cada N días (daily) o cada N semanas (weekly). */
  interval: number;
  /** Días de la semana ISO (1 = lunes … 7 = domingo). Solo para weekly. */
  weekdays: number[];
  start: string;
  end: string | null;
}

const MS_DAY = 86_400_000;
const toTime = (d: string) => Date.parse(`${d}T00:00:00Z`);
export const toDate = (t: number) => new Date(t).toISOString().slice(0, 10);

export function isValidIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = toTime(s);
  return !Number.isNaN(t) && toDate(t) === s;
}

/** Día ISO: 1 = lunes … 7 = domingo. */
export function isoWeekday(d: string): number {
  const w = new Date(toTime(d)).getUTCDay();
  return w === 0 ? 7 : w;
}

const mondayOf = (d: string) => toTime(d) - (isoWeekday(d) - 1) * MS_DAY;

export function occursOn(rule: RecurrenceRule, date: string): boolean {
  if (date < rule.start) return false;
  if (rule.end !== null && date > rule.end) return false;
  if (rule.frequency === "daily") {
    return Math.round((toTime(date) - toTime(rule.start)) / MS_DAY) % rule.interval === 0;
  }
  if (!rule.weekdays.includes(isoWeekday(date))) return false;
  const weeks = Math.round((mondayOf(date) - mondayOf(rule.start)) / (7 * MS_DAY));
  return weeks % rule.interval === 0;
}

/** Fechas en las que ocurre, entre `from` y `to` inclusive. */
export function occurrencesBetween(rule: RecurrenceRule, from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = toTime(from); t <= toTime(to); t += MS_DAY) {
    const d = toDate(t);
    if (occursOn(rule, d)) out.push(d);
  }
  return out;
}

/** Próximas `n` fechas desde `from` (buscando hasta un año). */
export function nextOccurrences(rule: RecurrenceRule, from: string, n: number): string[] {
  const out: string[] = [];
  for (let t = toTime(from), i = 0; i < 366 && out.length < n; t += MS_DAY, i++) {
    const d = toDate(t);
    if (occursOn(rule, d)) out.push(d);
  }
  return out;
}

export interface RuleErrors {
  interval?: string;
  weekdays?: string;
  start?: string;
  end?: string;
}

export function validateRule(r: RecurrenceRule): RuleErrors {
  const e: RuleErrors = {};
  if (!Number.isInteger(r.interval) || r.interval < 1 || r.interval > 52) e.interval = "Usá un número entre 1 y 52.";
  if (r.frequency === "weekly" && (r.weekdays.length === 0 || r.weekdays.some((d) => !Number.isInteger(d) || d < 1 || d > 7))) {
    e.weekdays = "Elegí al menos un día de la semana.";
  }
  if (!isValidIsoDate(r.start)) e.start = "Usá el formato AAAA-MM-DD, por ejemplo 2026-11-20.";
  if (r.end !== null) {
    if (!isValidIsoDate(r.end)) e.end = "Usá el formato AAAA-MM-DD, por ejemplo 2026-12-31.";
    else if (!e.start && r.end < r.start) e.end = "El final no puede ser anterior al comienzo.";
  }
  return e;
}

export const ruleHasErrors = (e: RuleErrors) => Object.keys(e).length > 0;

export const WEEKDAY_LABELS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"] as const;

/** Descripción en español rioplatense. */
export function describeRule(r: RecurrenceRule): string {
  if (r.frequency === "daily") return r.interval === 1 ? "Todos los días" : `Cada ${r.interval} días`;
  const days = [...r.weekdays].sort((a, b) => a - b).map((d) => WEEKDAY_LABELS[d - 1]);
  const list = days.length > 1 ? `${days.slice(0, -1).join(", ")} y ${days[days.length - 1]}` : (days[0] ?? "");
  return r.interval === 1 ? `Todas las semanas: ${list}` : `Cada ${r.interval} semanas: ${list}`;
}

/** Solo la ocurrencia de hoy suma al agua: una repetición vencida no acumula deuda (PRD §8, §12). */
export function countsForLoad(occurrenceDate: string, status: string, today: string): boolean {
  return status === "pending" && occurrenceDate === today;
}
