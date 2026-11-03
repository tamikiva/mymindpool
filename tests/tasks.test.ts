import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { computeAreaLoad, type LoadTask } from "../src/domain/load";

const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";
const TODAY = "2026-11-03";
let db: PGlite;
let areaA: string;
let areaB: string;

async function as<T>(uid: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(`select set_config('request.jwt.claim.sub', '${uid ?? ""}', false)`);
  await db.exec(`set role ${uid ? "authenticated" : "anon"}`);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}

const areas = JSON.stringify([
  { name: "Casa", color_key: "lila" },
  { name: "Trabajo", color_key: "celeste" },
]);

const addTask = (uid: string, area: string, title: string, weight = 1) =>
  as(uid, () =>
    db.query<{ id: string }>(
      "insert into public.tasks (user_id, area_id, title, weight) values ($1,$2,$3,$4) returning id",
      [uid, area, title, weight],
    ),
  ).then((r) => r.rows[0].id);

/** Carga del área calculada con la regla de dominio sobre las filas reales. */
async function pendingLoad(uid: string, area: string) {
  const r = await as(uid, () =>
    db.query<{ area_id: string; status: LoadTask["status"]; weight: 1 | 2 | 3; scheduled_date: string | null; someday: boolean }>(
      "select area_id, status, weight, to_char(scheduled_date,'YYYY-MM-DD') as scheduled_date, someday from public.tasks",
    ),
  );
  const tasks: LoadTask[] = r.rows.map((x) => ({
    areaId: x.area_id,
    status: x.status,
    weight: x.weight,
    scheduledDate: x.scheduled_date,
    someday: x.someday,
  }));
  return computeAreaLoad(area, 8, tasks, TODAY);
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    grant usage on schema public to anon, authenticated;
  `);
  await db.exec(readFileSync("supabase/migrations/0001_profiles_areas.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/0002_tasks.sql", "utf8"));
  await db.exec(`insert into auth.users values ('${A}'), ('${B}')`);
  await as(A, () => db.query("select public.complete_onboarding(null, $1::jsonb)", [areas]));
  await as(B, () => db.query("select public.complete_onboarding(null, $1::jsonb)", [areas]));
  areaA = (await as(A, () => db.query<{ id: string }>("select id from public.areas where name='Casa'"))).rows[0].id;
  areaB = (await as(B, () => db.query<{ id: string }>("select id from public.areas where name='Casa'"))).rows[0].id;
});

describe("RLS de tareas", () => {
  it("A no puede crear una tarea en un área de B, ni siquiera a nombre de A", async () => {
    await expect(addTask(A, areaB, "Cruzada")).rejects.toThrow();
  });

  it("A no puede crear una tarea a nombre de B", async () => {
    await expect(addTask(B, areaA, "Cruzada")).rejects.toThrow();
    await expect(
      as(A, () =>
        db.query("insert into public.tasks (user_id, area_id, title) values ($1,$2,'x')", [B, areaB]),
      ),
    ).rejects.toThrow();
  });

  it("A no lee, modifica ni borra tareas de B", async () => {
    const idB = await addTask(B, areaB, "Privada de B");
    const sel = await as(A, () => db.query("select id from public.tasks where id = $1", [idB]));
    expect(sel.rows).toHaveLength(0);
    const upd = await as(A, () => db.query("update public.tasks set title='Hack' where id = $1", [idB]));
    expect(upd.affectedRows).toBe(0);
    const del = await as(A, () => db.query("delete from public.tasks where id = $1", [idB]));
    expect(del.affectedRows).toBe(0);
  });

  it("A no puede mover su tarea al área de B ni reasignarla a B", async () => {
    const id = await addTask(A, areaA, "Mía");
    await expect(
      as(A, () => db.query("update public.tasks set area_id = $1 where id = $2", [areaB, id])),
    ).rejects.toThrow();
    await expect(
      as(A, () => db.query("update public.tasks set user_id = $1 where id = $2", [B, id])),
    ).rejects.toThrow();
  });

  it("A no puede completar ni deshacer tareas de B con las funciones", async () => {
    const idB = await addTask(B, areaB, "Otra de B");
    await expect(as(A, () => db.query("select public.complete_task($1)", [idB]))).rejects.toThrow();
    await expect(as(A, () => db.query("select public.undo_complete_task($1)", [idB]))).rejects.toThrow();
    const r = await as(B, () => db.query<{ status: string }>("select status from public.tasks where id = $1", [idB]));
    expect(r.rows[0].status).toBe("pending");
  });

  it("anónimo no accede a tareas ni a las funciones", async () => {
    await expect(as(null, () => db.query("select * from public.tasks"))).rejects.toThrow();
    await expect(
      as(null, () => db.query("select public.complete_task('00000000-0000-0000-0000-000000000001')")),
    ).rejects.toThrow();
  });
});

describe("validaciones", () => {
  it("rechaza título vacío, de más de 200 caracteres y pesos fuera de 1–3", async () => {
    await expect(addTask(A, areaA, "   ")).rejects.toThrow();
    await expect(addTask(A, areaA, "x".repeat(201))).rejects.toThrow();
    await expect(addTask(A, areaA, "ok", 4)).rejects.toThrow();
    await expect(addTask(A, areaA, "x".repeat(200))).resolves.toBeTruthy();
  });

  it("no se puede borrar un área con tareas (no se pierde historial en silencio)", async () => {
    await expect(
      as(A, () => db.query("delete from public.areas where id = $1", [areaA])),
    ).rejects.toThrow();
  });
});

describe("completar y deshacer", () => {
  it("peso 2 en capacidad 8 suma 25 puntos porcentuales", async () => {
    const C = "00000000-0000-0000-0000-00000000000c";
    await db.exec(`insert into auth.users values ('${C}')`);
    await as(C, () => db.query("select public.complete_onboarding(null, $1::jsonb)", [areas]));
    const areaC = (await as(C, () => db.query<{ id: string }>("select id from public.areas where name='Casa'"))).rows[0].id;
    await addTask(C, areaC, "Mediana", 2);
    expect((await pendingLoad(C, areaC)).level).toBeCloseTo(0.25);
  });

  it("completar dos veces resta el peso una sola vez", async () => {
    const D = "00000000-0000-0000-0000-00000000000d";
    await db.exec(`insert into auth.users values ('${D}')`);
    await as(D, () => db.query("select public.complete_onboarding(null, $1::jsonb)", [areas]));
    const areaD = (await as(D, () => db.query<{ id: string }>("select id from public.areas where name='Casa'"))).rows[0].id;
    const t1 = await addTask(D, areaD, "Una", 2);
    await addTask(D, areaD, "Dos", 3);
    expect((await pendingLoad(D, areaD)).pending).toBe(5);

    await as(D, () => db.query("select public.complete_task($1)", [t1]));
    await as(D, () => db.query("select public.complete_task($1)", [t1]));
    expect((await pendingLoad(D, areaD)).pending).toBe(3);

    const rows = await as(D, () =>
      db.query<{ completed_at: string }>("select completed_at from public.tasks where id = $1", [t1]),
    );
    const first = rows.rows[0].completed_at;
    await as(D, () => db.query("select public.complete_task($1)", [t1]));
    const again = await as(D, () =>
      db.query<{ completed_at: string }>("select completed_at from public.tasks where id = $1", [t1]),
    );
    expect(again.rows[0].completed_at).toEqual(first);

    // Deshacer repone el peso, y repetirlo no lo repone dos veces.
    await as(D, () => db.query("select public.undo_complete_task($1)", [t1]));
    await as(D, () => db.query("select public.undo_complete_task($1)", [t1]));
    expect((await pendingLoad(D, areaD)).pending).toBe(5);
    const back = await as(D, () =>
      db.query<{ status: string; completed_at: string | null }>(
        "select status, completed_at from public.tasks where id = $1",
        [t1],
      ),
    );
    expect(back.rows[0]).toEqual({ status: "pending", completed_at: null });
  });

  it("completar una tarea cancelada no la convierte en completada", async () => {
    const id = await addTask(A, areaA, "Cancelada");
    await as(A, () => db.query("update public.tasks set status='cancelled' where id = $1", [id]));
    await as(A, () => db.query("select public.complete_task($1)", [id]));
    const r = await as(A, () => db.query<{ status: string }>("select status from public.tasks where id = $1", [id]));
    expect(r.rows[0].status).toBe("cancelled");
  });

  it("eliminar o cancelar libera carga sin quedar como realizada", async () => {
    const E = "00000000-0000-0000-0000-00000000000e";
    await db.exec(`insert into auth.users values ('${E}')`);
    await as(E, () => db.query("select public.complete_onboarding(null, $1::jsonb)", [areas]));
    const areaE = (await as(E, () => db.query<{ id: string }>("select id from public.areas where name='Casa'"))).rows[0].id;
    const t1 = await addTask(E, areaE, "Cancelar", 3);
    const t2 = await addTask(E, areaE, "Borrar", 2);
    await as(E, () => db.query("update public.tasks set status='cancelled' where id = $1", [t1]));
    await as(E, () => db.query("delete from public.tasks where id = $1", [t2]));
    expect((await pendingLoad(E, areaE)).pending).toBe(0);
    const done = await as(E, () => db.query("select 1 from public.tasks where completed_at is not null"));
    expect(done.rows).toHaveLength(0);
  });

  it("una tarea para la semana próxima no llena los pendientes actuales", async () => {
    const F = "00000000-0000-0000-0000-00000000000f";
    await db.exec(`insert into auth.users values ('${F}')`);
    await as(F, () => db.query("select public.complete_onboarding(null, $1::jsonb)", [areas]));
    const areaF = (await as(F, () => db.query<{ id: string }>("select id from public.areas where name='Casa'"))).rows[0].id;
    await as(F, () =>
      db.query("insert into public.tasks (user_id, area_id, title, scheduled_date) values ($1,$2,'Futura','2026-11-10')", [F, areaF]),
    );
    expect((await pendingLoad(F, areaF)).pending).toBe(0);
  });
});
