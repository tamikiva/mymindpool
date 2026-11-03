import { describe, expect, it } from "vitest";
import {
  countsForLoad, describeRule, isoWeekday, nextOccurrences, occursOn, occurrencesBetween, ruleHasErrors, validateRule,
  type RecurrenceRule,
} from "./recurrence";

const daily = (over: Partial<RecurrenceRule> = {}): RecurrenceRule => ({ frequency: "daily", interval: 1, weekdays: [], start: "2026-11-02", end: null, ...over });
const weekly = (weekdays: number[], over: Partial<RecurrenceRule> = {}): RecurrenceRule => ({ frequency: "weekly", interval: 1, weekdays, start: "2026-11-02", end: null, ...over });

describe("isoWeekday", () => {
  it("lunes es 1 y domingo es 7", () => {
    expect(isoWeekday("2026-11-02")).toBe(1); // lunes
    expect(isoWeekday("2026-11-08")).toBe(7); // domingo
    expect(isoWeekday("2026-11-03")).toBe(2);
  });
});

describe("occursOn", () => {
  it("diaria: cada día desde el comienzo, nunca antes", () => {
    expect(occursOn(daily(), "2026-11-01")).toBe(false);
    expect(occursOn(daily(), "2026-11-02")).toBe(true);
    expect(occursOn(daily(), "2027-03-01")).toBe(true);
  });
  it("cada 3 días", () => {
    const r = daily({ interval: 3 });
    expect(occurrencesBetween(r, "2026-11-02", "2026-11-12")).toEqual(["2026-11-02", "2026-11-05", "2026-11-08", "2026-11-11"]);
  });
  it("semanal: solo los días elegidos", () => {
    const r = weekly([1, 4]); // lunes y jueves
    expect(occurrencesBetween(r, "2026-11-02", "2026-11-15")).toEqual(["2026-11-02", "2026-11-05", "2026-11-09", "2026-11-12"]);
  });
  it("cada 2 semanas respeta la semana de comienzo", () => {
    const r = weekly([2], { interval: 2 }); // martes, semana por medio; comienza el lunes 2/11
    expect(occurrencesBetween(r, "2026-11-02", "2026-12-06")).toEqual(["2026-11-03", "2026-11-17", "2026-12-01"]);
  });
  it("si comienza a mitad de semana, esa semana cuenta como la primera", () => {
    const r = weekly([1, 5], { interval: 2, start: "2026-11-04" }); // miércoles 4/11; la semana de comienzo es la del 2/11
    expect(occurrencesBetween(r, "2026-11-02", "2026-11-22")).toEqual(["2026-11-06", "2026-11-16", "2026-11-20"]);
  });
  it("el final es inclusivo y después no ocurre más", () => {
    const r = daily({ end: "2026-11-04" });
    expect(occurrencesBetween(r, "2026-11-02", "2026-11-10")).toEqual(["2026-11-02", "2026-11-03", "2026-11-04"]);
  });
  it("cruza fin de mes, de año y años bisiestos sin saltear ni repetir días", () => {
    const r = daily({ start: "2027-12-30" });
    expect(occurrencesBetween(r, "2027-12-30", "2028-01-02")).toEqual(["2027-12-30", "2027-12-31", "2028-01-01", "2028-01-02"]);
    expect(occurrencesBetween(daily({ start: "2028-02-27" }), "2028-02-27", "2028-03-01")).toEqual(["2028-02-27", "2028-02-28", "2028-02-29", "2028-03-01"]);
  });
  it("no depende del cambio de horario ni de la zona del equipo (fechas de calendario)", () => {
    // Fechas alrededor de cambios de horario habituales: siempre una por día.
    for (const [from, to] of [["2026-03-07", "2026-03-10"], ["2026-10-24", "2026-10-28"], ["2026-11-01", "2026-11-03"]]) {
      expect(occurrencesBetween(daily({ start: from }), from, to).length).toBe(Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1);
    }
  });
});

describe("nextOccurrences y descripción", () => {
  it("devuelve las próximas n fechas", () => {
    expect(nextOccurrences(weekly([1]), "2026-11-03", 3)).toEqual(["2026-11-09", "2026-11-16", "2026-11-23"]);
  });
  it("describe en español", () => {
    expect(describeRule(daily())).toBe("Todos los días");
    expect(describeRule(daily({ interval: 2 }))).toBe("Cada 2 días");
    expect(describeRule(weekly([4, 1]))).toBe("Todas las semanas: lunes y jueves");
    expect(describeRule(weekly([1, 3, 5], { interval: 2 }))).toBe("Cada 2 semanas: lunes, miércoles y viernes");
  });
});

describe("validateRule", () => {
  it("una regla correcta no tiene errores", () => {
    expect(ruleHasErrors(validateRule(daily()))).toBe(false);
    expect(ruleHasErrors(validateRule(weekly([1])))).toBe(false);
  });
  it("marca intervalo, días, fechas y final anterior al comienzo", () => {
    expect(validateRule(daily({ interval: 0 })).interval).toBeTruthy();
    expect(validateRule(daily({ interval: 53 })).interval).toBeTruthy();
    expect(validateRule(weekly([])).weekdays).toBeTruthy();
    expect(validateRule(weekly([8])).weekdays).toBeTruthy();
    expect(validateRule(daily({ start: "2026-02-31" })).start).toBeTruthy();
    expect(validateRule(daily({ end: "2026-11-01" })).end).toMatch(/anterior/);
    expect(validateRule(daily({ end: "mañana" })).end).toBeTruthy();
  });
});

describe("carga", () => {
  it("solo la ocurrencia pendiente de hoy suma; las vencidas, hechas, saltadas y futuras no", () => {
    expect(countsForLoad("2026-11-03", "pending", "2026-11-03")).toBe(true);
    expect(countsForLoad("2026-11-02", "pending", "2026-11-03")).toBe(false); // vencida: no acumula deuda
    expect(countsForLoad("2026-11-04", "pending", "2026-11-03")).toBe(false);
    expect(countsForLoad("2026-11-03", "done", "2026-11-03")).toBe(false);
    expect(countsForLoad("2026-11-03", "skipped", "2026-11-03")).toBe(false);
  });
});
