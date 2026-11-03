import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { computeAreaLoad, type LoadTask } from "../src/domain/load";
import { countsForLoad, occursOn, type RecurrenceRule } from "../src/domain/recurrence";
import { as, createDb, newUser, type TestUser } from "./db";

const TODAY = "2026-11-03";
let db: PGlite;
let A: TestUser;
let B: TestUser;

const q = <T extends object>(u: TestUser | null, sql: string, params: unknown[] = []) =>
  as(db, u?.id ?? null, () => db.query<T>(sql, params));

interface Opts { freq?: string; interval?: number; weekdays?: number[]; start?: string; end?: string | null; weight?: number; id?: string | null; area?: string; title?: string; today?: string }
const save = (u: TestUser, o: Opts = {}) =>
  q<{ save_recurring_task: string }>(u, "select public.save_recurring_task($1,$2,$3,null,$4,'normal',$5,$6,$7::int[],$8,$9,'America/Argentina/Buenos_Aires',$10)", [
    o.id ?? null, o.area ?? u.areas.Casa, o.title ?? "Regar las plantas", o.weight ?? 1, o.freq ?? "daily", o.interval ?? 1,
    o.weekdays ?? [], o.start ?? "2026-11-01", o.end ?? null, o.today ?? TODAY,
  ]).then((r) => r.rows[0].save_recurring_task);
const ensure = (u: TestUser, from = TODAY, to = "2026-11-09") =>
  q<{ ensure_occurrences: number }>(u, "select public.ensure_occurrences($1,$2)", [from, to]).then((r) => r.rows[0].ensure_occurrences);
const occ = (u: TestUser, where = "true") =>
  q<{ id: string; d: string; status: string; title: string; weight: number }>(
    u, `select id, to_char(occurrence_date,'YYYY-MM-DD') as d, status, title, weight from public.task_occurrences where ${where} order by occurrence_date`).then((r) => r.rows);
const act = (u: TestUser, id: string, a: "complete" | "skip" | "undo") =>
  q<{ set_occurrence_state: string }>(u, "select public.set_occurrence_state($1,$2)", [id, a]).then((r) => r.rows[0].set_occurrence_state);

/** Carga del área con la regla de dominio sobre las ocurrencias reales (solo cuenta la de hoy). */
async function load(u: TestUser, area: string) {
  const rows = await occ(u);
  const tasks: LoadTask[] = rows.filter((r) => countsForLoad(r.d, r.status, TODAY)).map((r) => ({ areaId: area, status: "pending", weight: r.weight as 1 | 2 | 3, scheduledDate: TODAY }));
  return computeAreaLoad(area, 8, tasks, TODAY).pending;
}

beforeAll(async () => {
  db = await createDb();
  A = await newUser(db);
  B = await newUser(db);
});

describe("la regla SQL coincide con la de TypeScript", () => {
  const rules: RecurrenceRule[] = [
    { frequency: "daily", interval: 1, weekdays: [], start: "2026-11-02", end: null },
    { frequency: "daily", interval: 3, weekdays: [], start: "2026-10-30", end: null },
    { frequency: "daily", interval: 7, weekdays: [], start: "2027-12-20", end: null },
    { frequency: "weekly", interval: 1, weekdays: [1, 4], start: "2026-11-02", end: null },
    { frequency: "weekly", interval: 2, weekdays: [2], start: "2026-11-02", end: null },
    { frequency: "weekly", interval: 2, weekdays: [1, 5, 7], start: "2026-11-04", end: null }, // comienza a mitad de semana
    { frequency: "weekly", interval: 3, weekdays: [3, 6], start: "2028-02-20", end: null }, // cruza año bisiesto
    { frequency: "weekly", interval: 1, weekdays: [7], start: "2026-12-27", end: null },
  ];
  it("coinciden día por día durante 2 años, incluidos fines de mes, de año y cambios de horario", async () => {
    for (const r of rules) {
      const rows = await db.query<{ d: string; m: boolean }>(
        `select to_char(d::date,'YYYY-MM-DD') as d,
                public.rule_matches($1,$2,$3::smallint[],$4::date,d::date) as m
           from generate_series('2026-10-01'::date, '2028-12-31'::date, interval '1 day') d`,
        [r.frequency, r.interval, r.weekdays, r.start],
      );
      const wrong = rows.rows.filter((x) => x.m !== occursOn(r, x.d));
      expect(wrong.slice(0, 3), JSON.stringify(r)).toEqual([]);
    }
  });
});

describe("tareas repetidas: validación y aislamiento", () => {
  it("rechaza reglas inválidas", async () => {
    await expect(save(A, { freq: "weekly", weekdays: [] })).rejects.toThrow();
    await expect(save(A, { freq: "weekly", weekdays: [8] })).rejects.toThrow();
    await expect(save(A, { interval: 0 })).rejects.toThrow();
    await expect(save(A, { interval: 53 })).rejects.toThrow();
    await expect(save(A, { start: "2026-11-10", end: "2026-11-01" })).rejects.toThrow();
    await expect(save(A, { weight: 4 })).rejects.toThrow();
    await expect(save(A, { title: "  " })).rejects.toThrow();
    await expect(save(A, { area: B.areas.Casa })).rejects.toThrow(/Área inválida/);
  });
  it("A no ve ni toca lo de B, ni genera ni resuelve sus ocurrencias", async () => {
    const tid = await save(B, { title: "Privada de B" });
    await ensure(B);
    const idB = (await occ(B))[0].id;
    expect((await q(A, "select 1 from public.recurring_tasks where id = $1", [tid])).rows).toHaveLength(0);
    expect((await q(A, "select 1 from public.task_occurrences where id = $1", [idB])).rows).toHaveLength(0);
    await expect(act(A, idB, "complete")).rejects.toThrow(/inexistente/);
    await expect(save(A, { id: tid, title: "Pisada" })).rejects.toThrow(/inexistente/);
    await expect(q(A, "insert into public.task_occurrences (user_id, recurring_task_id, occurrence_date, title, area_id, weight, priority) values ($1,$2,$3,'x',$4,1,'normal')", [A.id, tid, TODAY, A.areas.Casa])).rejects.toThrow();
    await expect(q(A, "update public.task_occurrences set status = 'done'")).rejects.toThrow();
    await expect(q(A, "delete from public.recurring_tasks")).rejects.toThrow();
    expect((await occ(B))[0].status).toBe("pending");
  });
  it("anónimo no accede ni ejecuta", async () => {
    await expect(q(null, "select * from public.task_occurrences")).rejects.toThrow();
    await expect(q(null, "select public.ensure_occurrences($1,$2)", [TODAY, TODAY])).rejects.toThrow();
  });
});

describe("ocurrencias", () => {
  it("se generan solo en el rango pedido y una por fecha, aunque se repita o lo hagan dos dispositivos", async () => {
    const U = await newUser(db);
    await save(U, { start: "2026-10-01" }); // empezó hace semanas: no se rellena el pasado
    expect(await ensure(U, TODAY, "2026-11-09")).toBe(7);
    expect(await ensure(U, TODAY, "2026-11-09")).toBe(0); // idempotente
    expect(await ensure(U, "2026-11-05", "2026-11-12")).toBe(3); // solo faltaban 10, 11 y 12
    const rows = await occ(U);
    expect(rows.map((r) => r.d)).toEqual(["2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12"]);
    await expect(ensure(U, TODAY, "2027-03-01")).rejects.toThrow(/Rango/);
    await expect(ensure(U, "2026-11-09", TODAY)).rejects.toThrow(/Rango/);
  });

  it("respeta el comienzo, el final y los días de la semana", async () => {
    const U = await newUser(db);
    await save(U, { title: "Gimnasio", freq: "weekly", weekdays: [1, 3, 5], start: "2026-11-05", end: "2026-11-13" });
    await ensure(U, TODAY, "2026-11-30");
    expect((await occ(U)).map((r) => r.d)).toEqual(["2026-11-06", "2026-11-09", "2026-11-11", "2026-11-13"]);
  });

  it("completar una no completa la plantilla ni las demás; repetir no hace nada", async () => {
    const U = await newUser(db);
    const tid = await save(U);
    await ensure(U);
    const [o1, o2] = await occ(U);
    expect(await act(U, o1.id, "complete")).toBe("done");
    const done1 = (await q<{ done_at: string }>(U, "select done_at from public.task_occurrences where id = $1", [o1.id])).rows[0].done_at;
    expect(await act(U, o1.id, "complete")).toBe("done");
    expect((await q<{ done_at: string }>(U, "select done_at from public.task_occurrences where id = $1", [o1.id])).rows[0].done_at).toEqual(done1);
    expect((await occ(U, "status = 'done'")).length).toBe(1);
    expect((await occ(U)).find((r) => r.id === o2.id)!.status).toBe("pending");
    expect((await q<{ archived_at: string | null }>(U, "select archived_at from public.recurring_tasks where id = $1", [tid])).rows[0].archived_at).toBeNull();
    // Deshacer repone; repetirlo no rompe nada.
    expect(await act(U, o1.id, "undo")).toBe("pending");
    expect(await act(U, o1.id, "undo")).toBe("pending");
    expect((await occ(U, "status <> 'pending'")).length).toBe(0);
  });

  it("saltar no cuenta como hecho y no se puede completar después sin deshacer", async () => {
    const U = await newUser(db);
    await save(U);
    await ensure(U);
    const [o1] = await occ(U);
    expect(await act(U, o1.id, "skip")).toBe("skipped");
    expect(await act(U, o1.id, "skip")).toBe("skipped");
    expect((await occ(U, "status = 'done'")).length).toBe(0);
    await expect(act(U, o1.id, "complete")).rejects.toThrow(/ya se saltó/);
    await act(U, o1.id, "undo");
    expect(await act(U, o1.id, "complete")).toBe("done");
    await expect(act(U, o1.id, "skip")).rejects.toThrow(/ya se completó/);
  });
});

describe("carga y sin doble conteo", () => {
  it("la plantilla no suma: solo la ocurrencia de hoy, con su peso", async () => {
    const U = await newUser(db);
    await save(U, { weight: 2 });
    expect(await load(U, U.areas.Casa)).toBe(0); // sin ocurrencias generadas aún: la plantilla sola no pesa
    await ensure(U);
    expect(await load(U, U.areas.Casa)).toBe(2); // 7 ocurrencias en la semana, pero solo la de hoy cuenta
    const [today] = await occ(U, `occurrence_date = '${TODAY}'`);
    await act(U, today.id, "complete");
    expect(await load(U, U.areas.Casa)).toBe(0);
    await act(U, today.id, "undo");
    expect(await load(U, U.areas.Casa)).toBe(2);
  });
  it("una repetición vencida no acumula deuda en el agua", async () => {
    const U = await newUser(db);
    await save(U, { start: "2026-10-01" });
    await ensure(U, "2026-10-20", "2026-11-03"); // quedaron 15 sin resolver, hasta hoy
    expect((await occ(U, "status = 'pending'")).length).toBe(15);
    expect(await load(U, U.areas.Casa)).toBe(1);
  });
  it("no hay tarea abierta en la tabla de tareas: no aparece en pendientes ni cuenta dos veces", async () => {
    const U = await newUser(db);
    await save(U);
    await ensure(U);
    expect((await q(U, "select 1 from public.tasks")).rows).toHaveLength(0);
  });
});

describe("editar y archivar", () => {
  it("editar descarta las pendientes de hoy en adelante y respeta lo pasado y lo resuelto", async () => {
    const U = await newUser(db);
    const tid = await save(U, { title: "Original", start: "2026-10-28" });
    await ensure(U, "2026-10-30", "2026-11-06");
    const rows = await occ(U);
    const resolvedToday = rows.find((r) => r.d === TODAY)!;
    await act(U, resolvedToday.id, "complete");
    await save(U, { id: tid, title: "Renombrada", weight: 3, start: "2026-10-28" });
    const after = await occ(U);
    expect(after.filter((r) => r.d < TODAY).every((r) => r.title === "Original")).toBe(true); // el pasado no se reescribe
    expect(after.find((r) => r.d === TODAY)).toMatchObject({ status: "done", title: "Original" }); // lo resuelto queda
    expect(after.filter((r) => r.d > TODAY)).toEqual([]); // futuras pendientes descartadas: se regeneran
    await ensure(U);
    const regen = await occ(U, `occurrence_date > '${TODAY}'`);
    expect(regen.length).toBe(6);
    expect(regen.every((r) => r.title === "Renombrada" && r.weight === 3)).toBe(true);
  });
  it("archivar deja de generar, descarta las futuras pendientes y conserva el historial", async () => {
    const U = await newUser(db);
    const tid = await save(U, { start: "2026-11-01" });
    await ensure(U, "2026-11-01", "2026-11-07");
    await q(U, "select public.archive_recurring_task($1,$2)", [tid, TODAY]);
    await q(U, "select public.archive_recurring_task($1,$2)", [tid, TODAY]); // repetir es inocuo
    expect((await occ(U)).map((r) => r.d)).toEqual(["2026-11-01", "2026-11-02"]);
    expect(await ensure(U, TODAY, "2026-11-20")).toBe(0);
    await expect(save(U, { id: tid, title: "No se puede editar archivada" })).rejects.toThrow(/inexistente/);
  });
  it("no se archiva un área con tareas repetidas activas ni con repeticiones pendientes", async () => {
    const U = await newUser(db);
    const tid = await save(U, { area: U.areas.Salud, title: "Estirar" });
    await expect(q(U, "update public.areas set archived_at = now() where id = $1", [U.areas.Salud])).rejects.toThrow(/pendientes/);
    await ensure(U, "2026-11-01", "2026-11-02");
    await q(U, "select public.archive_recurring_task($1,$2)", [tid, "2026-11-01"]); // descarta las pendientes desde 11-01
    await expect(q(U, "update public.areas set archived_at = now() where id = $1", [U.areas.Salud])).resolves.toBeTruthy();
  });
});
