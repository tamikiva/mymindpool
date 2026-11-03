import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { as, createDb, newUser, type TestUser } from "./db";

const TODAY = "2026-11-03";
const TOMORROW = "2026-11-04";
let db: PGlite;
let A: TestUser;
let B: TestUser;

const q = <T extends object>(u: TestUser | null, sql: string, params: unknown[] = []) =>
  as(db, u?.id ?? null, () => db.query<T>(sql, params));

const task = (u: TestUser, area: string, title: string, extra = "") =>
  q<{ id: string }>(u, `insert into public.tasks (user_id, area_id, title ${extra ? ", " + extra.split("=")[0] : ""}) values ($1,$2,$3 ${extra ? ", " + extra.split("=")[1] : ""}) returning id`, [u.id, area, title]).then((r) => r.rows[0].id);

type PArea = { area_id: string; moment?: string; planned_minutes?: number };
type PItem = { kind: "task" | "routine"; id: string };
const save = (u: TestUser, date: string, areas: PArea[], items: PItem[] = [], available: number | null = 480) =>
  q<{ save_day_plan: string }>(u, "select public.save_day_plan($1,$2,$3::jsonb,$4::jsonb)", [date, available, JSON.stringify(areas), JSON.stringify(items)]).then((r) => r.rows[0].save_day_plan);
const close = (u: TestUser, date: string, carry: string[]) =>
  q<{ close_day_plan: string | null }>(u, "select public.close_day_plan($1,$2::uuid[])", [date, carry]).then((r) => r.rows[0].close_day_plan);
const count = async (u: TestUser, table: string, where = "true") =>
  (await q<{ n: number }>(u, `select count(*)::int as n from public.${table} where ${where}`)).rows[0].n;

beforeAll(async () => {
  db = await createDb();
  A = await newUser(db);
  B = await newUser(db);
});

describe("guardar el plan", () => {
  it("guarda áreas con momento y minutos, y los ítems elegidos", async () => {
    const t1 = await task(A, A.areas.Trabajo, "Informe");
    const pid = await save(A, TODAY, [
      { area_id: A.areas.Trabajo, moment: "morning", planned_minutes: 180 },
      { area_id: A.areas.Casa, moment: "midday", planned_minutes: 60 },
    ], [{ kind: "task", id: t1 }]);
    const areas = await q<{ moment: string; planned_minutes: number }>(A, "select moment, planned_minutes from public.day_plan_areas where plan_id = $1 order by moment", [pid]);
    expect(areas.rows).toEqual([{ moment: "midday", planned_minutes: 60 }, { moment: "morning", planned_minutes: 180 }]);
    expect(await count(A, "day_plan_items", `plan_id = '${pid}'`)).toBe(1);
  });

  it("guardar de nuevo reemplaza el plan sin duplicar: un solo plan por fecha", async () => {
    const U = await newUser(db);
    const t = await task(U, U.areas.Casa, "Lavar");
    const p1 = await save(U, TODAY, [{ area_id: U.areas.Casa }], [{ kind: "task", id: t }]);
    const p2 = await save(U, TODAY, [{ area_id: U.areas.Salud, moment: "night" }], []);
    expect(p2).toBe(p1);
    expect(await count(U, "day_plans")).toBe(1);
    expect(await count(U, "day_plan_items")).toBe(0); // el plan anterior quedó reemplazado
    const areas = await q<{ area_id: string }>(U, "select area_id from public.day_plan_areas");
    expect(areas.rows.map((r) => r.area_id)).toEqual([U.areas.Salud]);
  });

  it("es todo o nada: un ítem inválido no deja nada guardado", async () => {
    const U = await newUser(db);
    const ajena = await task(B, B.areas.Casa, "De B");
    await expect(save(U, TODAY, [{ area_id: U.areas.Casa }], [{ kind: "task", id: ajena }])).rejects.toThrow(/no existe|pendiente/);
    expect(await count(U, "day_plans", `plan_date = '${TODAY}' and available_minutes is not null`)).toBe(0);
    expect(await count(U, "day_plan_areas")).toBe(0);
  });

  it("no admite áreas ajenas, repetidas, tareas de un área no elegida, completadas ni minutos absurdos", async () => {
    const U = await newUser(db);
    await expect(save(U, TODAY, [{ area_id: B.areas.Casa }])).rejects.toThrow(/Área inválida/);
    await expect(save(U, TODAY, [{ area_id: U.areas.Casa }, { area_id: U.areas.Casa }])).rejects.toThrow();
    await expect(save(U, TODAY, [])).rejects.toThrow(/entre 1 y 8/);
    await expect(save(U, TODAY, [{ area_id: U.areas.Casa, planned_minutes: 2000 }])).rejects.toThrow();
    await expect(save(U, TODAY, [{ area_id: U.areas.Casa, moment: "madrugada" }])).rejects.toThrow();
    const trabajo = await task(U, U.areas.Trabajo, "Otra área");
    await expect(save(U, TODAY, [{ area_id: U.areas.Casa }], [{ kind: "task", id: trabajo }])).rejects.toThrow(/área que no elegiste/);
    const hecha = await task(U, U.areas.Casa, "Hecha");
    await q(U, "select public.complete_task($1)", [hecha]);
    await expect(save(U, TODAY, [{ area_id: U.areas.Casa }], [{ kind: "task", id: hecha }])).rejects.toThrow(/ya no está pendiente/);
    await expect(save(U, TODAY, [{ area_id: U.areas.Casa }], [{ kind: "task", id: trabajo }, { kind: "task", id: trabajo }])).rejects.toThrow();
  });

  it("admite rutinas cuya área predeterminada está en el plan, y rechaza las de otra área", async () => {
    const U = await newUser(db);
    const tid = (await q<{ save_routine_template: string }>(U, "select public.save_routine_template(null,'Rutina de casa',$1,null,$2::jsonb)", [U.areas.Casa, JSON.stringify([{ title: "x", area_id: U.areas.Casa }])])).rows[0].save_routine_template;
    await expect(save(U, TODAY, [{ area_id: U.areas.Salud }], [{ kind: "routine", id: tid }])).rejects.toThrow(/área que no elegiste/);
    await expect(save(U, TODAY, [{ area_id: U.areas.Casa }], [{ kind: "routine", id: tid }])).resolves.toBeTruthy();
  });

  it("borrar una tarea la saca del plan", async () => {
    const U = await newUser(db);
    const t = await task(U, U.areas.Casa, "Efímera");
    await save(U, TODAY, [{ area_id: U.areas.Casa }], [{ kind: "task", id: t }]);
    await q(U, "delete from public.tasks where id = $1", [t]);
    expect(await count(U, "day_plan_items")).toBe(0);
  });
});

describe("aislamiento", () => {
  it("A no ve los planes de B ni puede escribir directo", async () => {
    const U = await newUser(db);
    await save(U, TODAY, [{ area_id: U.areas.Casa }]);
    expect(await count(A, "day_plans", `user_id = '${U.id}'`)).toBe(0);
    expect(await count(A, "day_plan_areas", `user_id = '${U.id}'`)).toBe(0);
    await expect(q(A, "insert into public.day_plans (user_id, plan_date) values ($1, $2)", [A.id, "2026-12-01"])).rejects.toThrow();
    await expect(q(A, "update public.day_plans set available_minutes = 1")).rejects.toThrow();
    await expect(q(A, "delete from public.day_plan_items")).rejects.toThrow();
  });
  it("anónimo no accede ni ejecuta", async () => {
    await expect(q(null, "select * from public.day_plans")).rejects.toThrow();
    await expect(q(null, "select public.save_day_plan($1,null,'[]'::jsonb,'[]'::jsonb)", [TODAY])).rejects.toThrow();
  });
  it("A no puede cerrar el día de B ni trasladar tareas ajenas", async () => {
    const U = await newUser(db);
    await save(U, "2026-11-20", [{ area_id: U.areas.Casa }]);
    await expect(close(A, "2026-11-20", [])).rejects.toThrow(/No hay un plan/); // solo U tiene plan ese día
    expect(await count(U, "day_plans", "plan_date = '2026-11-20' and closed_at is not null")).toBe(0);
    const mia = await task(A, A.areas.Casa, "Mía");
    await save(A, "2026-11-10", [{ area_id: A.areas.Casa }]);
    const deB = await task(B, B.areas.Casa, "Ajena");
    await expect(close(A, "2026-11-10", [mia, deB])).rejects.toThrow(/Tarea inexistente/);
    // Todo o nada: ni siquiera se cerró el día ni se movió la tarea propia.
    expect(await count(A, "day_plans", "plan_date = '2026-11-10' and closed_at is not null")).toBe(0);
    expect((await q<{ scheduled_date: string | null }>(A, "select scheduled_date from public.tasks where id = $1", [mia])).rows[0].scheduled_date).toBeNull();
  });
});

describe("cierre del día", () => {
  it("traslada solo las tareas elegidas, sin duplicar, y deja las demás como estaban", async () => {
    const U = await newUser(db);
    const quedan = await task(U, U.areas.Casa, "Pasa a mañana");
    const noPasa = await task(U, U.areas.Casa, "No pasa", "scheduled_date='2026-11-03'");
    await save(U, TODAY, [{ area_id: U.areas.Casa }], [{ kind: "task", id: quedan }, { kind: "task", id: noPasa }]);
    const next = await close(U, TODAY, [quedan]);
    expect(next).toBeTruthy();
    const dates = await q<{ id: string; scheduled_date: string }>(U, "select id, to_char(scheduled_date,'YYYY-MM-DD') as scheduled_date from public.tasks");
    expect(dates.rows.find((r) => r.id === quedan)!.scheduled_date).toBe(TOMORROW);
    expect(dates.rows.find((r) => r.id === noPasa)!.scheduled_date).toBe(TODAY);
    expect(await count(U, "day_plan_items", `plan_id = '${next}'`)).toBe(1);
    // Cerrar otra vez con la misma selección no duplica el ítem ni el área de mañana.
    await close(U, TODAY, [quedan]);
    await close(U, TODAY, [quedan]);
    expect(await count(U, "day_plan_items", `plan_id = '${next}'`)).toBe(1);
    expect(await count(U, "day_plan_areas", `plan_id = '${next}'`)).toBe(1);
    expect(await count(U, "day_plans")).toBe(2);
    expect(await count(U, "day_plans", `plan_date = '${TODAY}' and closed_at is not null`)).toBe(1);
  });

  it("sin selección solo cierra el día; una tarea ya completada no se traslada", async () => {
    const U = await newUser(db);
    const t = await task(U, U.areas.Casa, "Se completó");
    await save(U, TODAY, [{ area_id: U.areas.Casa }], [{ kind: "task", id: t }]);
    await q(U, "select public.complete_task($1)", [t]);
    expect(await close(U, TODAY, [])).toBeNull();
    expect(await count(U, "day_plans")).toBe(1);
    await close(U, TODAY, [t]);
    expect((await q<{ s: string | null }>(U, "select scheduled_date::text as s from public.tasks where id = $1", [t])).rows[0].s).toBeNull();
    expect(await count(U, "day_plan_items", `plan_id in (select id from public.day_plans where plan_date = '${TOMORROW}')`)).toBe(0);
  });

  it("un día cerrado no se edita; el traslado respeta un plan de mañana ya existente", async () => {
    const U = await newUser(db);
    const t = await task(U, U.areas.Casa, "Sigue");
    const ya = await task(U, U.areas.Salud, "Ya planeada para mañana");
    await save(U, TODAY, [{ area_id: U.areas.Casa }], [{ kind: "task", id: t }]);
    await save(U, TOMORROW, [{ area_id: U.areas.Salud }], [{ kind: "task", id: ya }]);
    await close(U, TODAY, [t]);
    await expect(save(U, TODAY, [{ area_id: U.areas.Casa }])).rejects.toThrow(/ya está cerrado/);
    const items = await q<{ n: number }>(U, "select count(*)::int as n from public.day_plan_items i join public.day_plans p on p.id = i.plan_id where p.plan_date = $1", [TOMORROW]);
    expect(items.rows[0].n).toBe(2); // la ya planeada y la trasladada
    expect(await count(U, "day_plan_areas", `plan_id in (select id from public.day_plans where plan_date = '${TOMORROW}')`)).toBe(2);
  });
});
