import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { computeAreaLoad, type LoadTask } from "../src/domain/load";
import { as, createDb, newUser, type TestUser } from "./db";

const TODAY = "2026-11-03";
let db: PGlite;
let A: TestUser;
let B: TestUser;

type Step = { title: string; area_id: string; weight?: number; in_short?: boolean; duration_minutes?: number };
const q = <T extends object>(u: TestUser | null, sql: string, params: unknown[] = []) =>
  as(db, u?.id ?? null, () => db.query<T>(sql, params));

const save = (u: TestUser, name: string, steps: Step[], opts: { id?: string | null; area?: string | null; cue?: string | null } = {}) =>
  q<{ save_routine_template: string }>(u, "select public.save_routine_template($1,$2,$3,$4,$5::jsonb)", [
    opts.id ?? null, name, opts.area ?? null, opts.cue ?? null, JSON.stringify(steps),
  ]).then((r) => r.rows[0].save_routine_template);

const start = (u: TestUser, tid: string, version = "full") =>
  q<{ start_routine_run: string }>(u, "select public.start_routine_run($1,$2,$3)", [tid, version, TODAY]).then((r) => r.rows[0].start_routine_run);

const steps = (u: TestUser, rid: string) =>
  q<{ id: string; position: number; title: string; status: string; weight: number }>(
    u, "select id, position, title, status, weight from public.routine_run_steps where run_id = $1 order by position", [rid]).then((r) => r.rows);
const advance = (u: TestUser, sid: string, action: "complete" | "skip") =>
  q<{ advance_run_step: string }>(u, "select public.advance_run_step($1,$2)", [sid, action]).then((r) => r.rows[0].advance_run_step);
const state = (u: TestUser, rid: string, action: "pause" | "resume" | "cancel") =>
  q<{ set_run_state: string }>(u, "select public.set_run_state($1,$2)", [rid, action]).then((r) => r.rows[0].set_run_state);

/** Carga del área calculada con la regla de dominio sobre los pasos abiertos reales. */
async function routineLoad(u: TestUser, area: string) {
  const r = await q<{ area_id: string; status: string; weight: 1 | 2 | 3 }>(
    u, "select area_id, status, weight from public.routine_run_steps");
  const tasks: LoadTask[] = r.rows.map((x) => ({ areaId: x.area_id, status: x.status === "pending" ? "pending" : "completed", weight: x.weight, scheduledDate: null }));
  return computeAreaLoad(area, 8, tasks, TODAY).pending;
}

const four = (u: TestUser): Step[] => [
  { title: "Sacar el canasto de limpieza y dejarlo en la cocina", area_id: u.areas.Casa },
  { title: "Juntar la basura", area_id: u.areas.Casa, in_short: true },
  { title: "Lavar los platos", area_id: u.areas.Casa },
  { title: "Barrer", area_id: u.areas.Casa, in_short: true },
];

beforeAll(async () => {
  db = await createDb();
  A = await newUser(db);
  B = await newUser(db);
});

describe("plantillas", () => {
  it("guarda plantilla y pasos juntos, en orden", async () => {
    const id = await save(A, "Limpiar la casa", four(A), { area: A.areas.Casa, cue: "Después de tomar el café" });
    const r = await q<{ title: string; position: number }>(A, "select title, position from public.routine_template_steps where template_id = $1 order by position", [id]);
    expect(r.rows.map((x) => x.title)).toEqual(four(A).map((s) => s.title));
    expect(r.rows.map((x) => x.position)).toEqual([0, 1, 2, 3]);
  });

  it("si un paso es inválido no queda nada guardado (atomicidad)", async () => {
    const before = (await q<{ n: number }>(A, "select count(*)::int as n from public.routine_templates")).rows[0].n;
    // El segundo paso usa un área de B.
    await expect(save(A, "Rota", [
      { title: "Uno", area_id: A.areas.Casa },
      { title: "Dos", area_id: B.areas.Casa },
    ])).rejects.toThrow(/área inválida/);
    const after = (await q<{ n: number }>(A, "select count(*)::int as n from public.routine_templates")).rows[0].n;
    expect(after).toBe(before);
    const orphan = await db.query("select 1 from public.routine_template_steps s left join public.routine_templates t on t.id = s.template_id where t.id is null");
    expect(orphan.rows).toHaveLength(0);
  });

  it("editar una plantilla reemplaza sus pasos sin duplicarlos", async () => {
    const id = await save(A, "Rutina editable", [{ title: "a", area_id: A.areas.Casa }, { title: "b", area_id: A.areas.Casa }]);
    await save(A, "Rutina editable v2", [{ title: "solo uno", area_id: A.areas.Salud }], { id });
    const r = await q<{ title: string }>(A, "select title from public.routine_template_steps where template_id = $1", [id]);
    expect(r.rows.map((x) => x.title)).toEqual(["solo uno"]);
  });

  it("rechaza 0 pasos, más de 20, pesos fuera de 1–3 y nombres vacíos o repetidos", async () => {
    await expect(save(A, "Vacía", [])).rejects.toThrow();
    const many = Array.from({ length: 21 }, (_, i) => ({ title: `p${i}`, area_id: A.areas.Casa }));
    await expect(save(A, "Muchos pasos", many)).rejects.toThrow(/entre 1 y 20/);
    await expect(save(A, "Peso 4", [{ title: "x", area_id: A.areas.Casa, weight: 4 }])).rejects.toThrow();
    await expect(save(A, "   ", [{ title: "x", area_id: A.areas.Casa }])).rejects.toThrow();
    await expect(save(A, "limpiar la casa", [{ title: "x", area_id: A.areas.Casa }])).rejects.toThrow();
    await expect(save(A, "20 pasos", many.slice(0, 20))).resolves.toBeTruthy();
  });
});

describe("aislamiento entre usuarias", () => {
  it("A no ve ni usa las rutinas de B; no puede escribir directo ni con áreas ajenas", async () => {
    const idB = await save(B, "Rutina privada de B", [{ title: "secreto", area_id: B.areas.Casa }]);
    expect((await q(A, "select 1 from public.routine_templates where id = $1", [idB])).rows).toHaveLength(0);
    expect((await q(A, "select 1 from public.routine_template_steps where template_id = $1", [idB])).rows).toHaveLength(0);
    await expect(start(A, idB)).rejects.toThrow(/inexistente/);
    await expect(save(A, "Pisada", [{ title: "x", area_id: A.areas.Casa }], { id: idB })).rejects.toThrow(/inexistente/);
    await expect(save(A, "Con área ajena", [{ title: "x", area_id: A.areas.Casa }], { area: B.areas.Casa })).rejects.toThrow(/Área inválida/);
    await expect(q(A, "insert into public.routine_runs (user_id, template_name, version, run_date) values ($1,'x','full',$2)", [A.id, TODAY])).rejects.toThrow();
    await expect(q(A, "update public.routine_template_steps set title = 'hack'")).rejects.toThrow();
    await expect(q(A, "delete from public.routine_templates")).rejects.toThrow();
  });

  it("A no puede avanzar, pausar ni cancelar el recorrido de B", async () => {
    const tid = await save(B, "De B para correr", [{ title: "p1", area_id: B.areas.Casa }, { title: "p2", area_id: B.areas.Casa }]);
    const rid = await start(B, tid);
    const [s1] = await steps(B, rid);
    await expect(advance(A, s1.id, "complete")).rejects.toThrow(/inexistente/);
    await expect(state(A, rid, "pause")).rejects.toThrow(/inexistente/);
    await expect(state(A, rid, "cancel")).rejects.toThrow(/inexistente/);
    expect((await q(A, "select 1 from public.routine_runs where id = $1", [rid])).rows).toHaveLength(0);
    expect((await steps(B, rid)).map((s) => s.status)).toEqual(["pending", "pending"]);
  });

  it("anónimo no ejecuta ninguna función de rutinas", async () => {
    await expect(q(null, "select public.save_routine_template(null,'x',null,null,'[]'::jsonb)")).rejects.toThrow();
    await expect(q(null, "select public.start_routine_run('00000000-0000-0000-0000-000000000001','full',$1)", [TODAY])).rejects.toThrow();
    await expect(q(null, "select * from public.routine_runs")).rejects.toThrow();
  });
});

describe("ejecución", () => {
  it("rutina de cuatro pasos de peso 1: carga 4, no 5", async () => {
    const U = await newUser(db);
    const tid = await save(U, "Cuatro pasos", four(U));
    const rid = await start(U, tid);
    expect(await routineLoad(U, U.areas.Casa)).toBe(4);
    expect((await steps(U, rid)).map((s) => s.position)).toEqual([0, 1, 2, 3]);
  });

  it("empezar dos veces no duplica la ejecución ni los pasos", async () => {
    const U = await newUser(db);
    const tid = await save(U, "Idempotente", four(U));
    const r1 = await start(U, tid);
    const r2 = await start(U, tid);
    expect(r2).toBe(r1);
    expect((await steps(U, r1)).length).toBe(4);
    expect(await routineLoad(U, U.areas.Casa)).toBe(4);
  });

  it("la versión corta conserva la acción inicial y usa menos pasos", async () => {
    const U = await newUser(db);
    const tid = await save(U, "Con versión corta", four(U));
    const rid = await start(U, tid, "short");
    const s = await steps(U, rid);
    expect(s.map((x) => x.title)).toEqual([four(U)[0].title, "Juntar la basura", "Barrer"]);
    expect(s.map((x) => x.position)).toEqual([0, 1, 2]);
    // Sin pasos marcados como cortos no hay versión corta.
    const none = await save(U, "Sin corta", [{ title: "a", area_id: U.areas.Casa }, { title: "b", area_id: U.areas.Casa }]);
    await expect(start(U, none, "short")).rejects.toThrow(/no tiene versión corta/);
  });

  it("solo se resuelve el paso actual, en orden; repetir no suma", async () => {
    const U = await newUser(db);
    const rid = await start(U, await save(U, "En orden", four(U)));
    const s = await steps(U, rid);
    await expect(advance(U, s[2].id, "complete")).rejects.toThrow(/No es el paso actual/);
    expect(await advance(U, s[0].id, "complete")).toBe("active");
    expect(await advance(U, s[0].id, "complete")).toBe("active"); // doble toque
    expect(await routineLoad(U, U.areas.Casa)).toBe(3);
    const done = await q<{ n: number }>(U, "select count(*)::int as n from public.routine_run_steps where status = 'done'");
    expect(done.rows[0].n).toBe(1);
  });

  it("saltar no cuenta como completar, libera carga y la secuencia avanza", async () => {
    const U = await newUser(db);
    const rid = await start(U, await save(U, "Con salto", four(U)));
    const s = await steps(U, rid);
    await advance(U, s[0].id, "skip");
    const after = await steps(U, rid);
    expect(after[0].status).toBe("skipped");
    expect((await q(U, "select 1 from public.routine_run_steps where status = 'done'")).rows).toHaveLength(0);
    expect(await routineLoad(U, U.areas.Casa)).toBe(3);
    await expect(advance(U, s[0].id, "complete")).rejects.toThrow(/ya está resuelto/); // no se «completa» lo saltado
    await expect(advance(U, s[2].id, "complete")).rejects.toThrow(/No es el paso actual/);
    await advance(U, s[1].id, "complete"); // el siguiente es el 2.º
  });

  it("al resolver el último paso la rutina termina una sola vez", async () => {
    const U = await newUser(db);
    const rid = await start(U, await save(U, "Corta", [{ title: "a", area_id: U.areas.Casa }, { title: "b", area_id: U.areas.Casa }]));
    const [s1, s2] = await steps(U, rid);
    await advance(U, s1.id, "complete");
    expect(await advance(U, s2.id, "skip")).toBe("completed");
    expect(await advance(U, s2.id, "skip")).toBe("completed");
    const r = await q<{ status: string; ended_at: string | null }>(U, "select status, ended_at from public.routine_runs where id = $1", [rid]);
    expect(r.rows[0].status).toBe("completed");
    expect(r.rows[0].ended_at).not.toBeNull();
    await expect(state(U, rid, "pause")).rejects.toThrow(/ya terminó/);
    // Terminada: se puede empezar de nuevo (nueva instancia).
    const again = await start(U, (await q<{ id: string }>(U, "select id from public.routine_templates where name = 'Corta'")).rows[0].id);
    expect(again).not.toBe(rid);
  });

  it("en pausa no se avanza; retomar permite seguir; pausar/retomar repetidos son inocuos", async () => {
    const U = await newUser(db);
    const rid = await start(U, await save(U, "Pausable", four(U)));
    const [s1] = await steps(U, rid);
    expect(await state(U, rid, "pause")).toBe("paused");
    expect(await state(U, rid, "pause")).toBe("paused");
    await expect(advance(U, s1.id, "complete")).rejects.toThrow(/pausa/);
    expect(await routineLoad(U, U.areas.Casa)).toBe(4); // la carga sigue ahí mientras está en pausa
    expect(await state(U, rid, "resume")).toBe("active");
    expect(await state(U, rid, "resume")).toBe("active");
    await expect(advance(U, s1.id, "complete")).resolves.toBe("active");
  });

  it("cancelar libera toda la carga sin marcar nada como hecho; repetir es inocuo", async () => {
    const U = await newUser(db);
    const rid = await start(U, await save(U, "Cancelable", four(U)));
    const [s1] = await steps(U, rid);
    await advance(U, s1.id, "complete");
    expect(await state(U, rid, "cancel")).toBe("cancelled");
    expect(await state(U, rid, "cancel")).toBe("cancelled");
    expect(await routineLoad(U, U.areas.Casa)).toBe(0);
    const st = (await steps(U, rid)).map((s) => s.status);
    expect(st).toEqual(["done", "cancelled", "cancelled", "cancelled"]); // el hecho se conserva
  });
});

describe("historial independiente de la plantilla", () => {
  it("editar o archivar la plantilla no reescribe una ejecución en curso", async () => {
    const U = await newUser(db);
    const tid = await save(U, "Original", four(U));
    const rid = await start(U, tid);
    await save(U, "Renombrada", [{ title: "otro paso", area_id: U.areas.Salud, weight: 3 }], { id: tid });
    const s = await steps(U, rid);
    expect(s.map((x) => x.title)).toEqual(four(U).map((x) => x.title));
    expect(s.every((x) => x.weight === 1)).toBe(true);
    expect((await q<{ template_name: string }>(U, "select template_name from public.routine_runs where id = $1", [rid])).rows[0].template_name).toBe("Original");
    await q(U, "select public.archive_routine_template($1, true)", [tid]);
    expect((await steps(U, rid)).length).toBe(4);
    await expect(start(U, tid)).rejects.toThrow(/inexistente/); // archivada: no se empieza otra
  });

  it("no se archiva un área con pasos de rutina pendientes", async () => {
    const U = await newUser(db);
    await start(U, await save(U, "Bloquea área", [{ title: "x", area_id: U.areas.Salud }]));
    await expect(q(U, "update public.areas set archived_at = now() where id = $1", [U.areas.Salud])).rejects.toThrow(/pendientes/);
  });

  it("no se empieza una rutina que usa un área archivada", async () => {
    const U = await newUser(db);
    const tid = await save(U, "Usa Vida social", [{ title: "x", area_id: U.areas["Vida social"] }]);
    await q(U, "update public.areas set archived_at = now() where id = $1", [U.areas["Vida social"]]);
    await expect(start(U, tid)).rejects.toThrow(/área archivada/);
  });
});
