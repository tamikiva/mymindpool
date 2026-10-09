import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";
let db: PGlite;

/** Ejecuta como usuario autenticado (RLS activo); `null` = anónimo. */
async function as<T>(uid: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(`select set_config('request.jwt.claim.sub', '${uid ?? ""}', false)`);
  await db.exec(`set role ${uid ? "authenticated" : "anon"}`);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}

const four = JSON.stringify([
  { name: "Casa", color_key: "lila" },
  { name: "Trabajo", color_key: "celeste" },
  { name: "Salud", color_key: "verde" },
  { name: "Vida social", color_key: "rosa" },
]);

beforeAll(async () => {
  db = new PGlite();
  // Simulación mínima del esquema auth de Supabase.
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
  await db.exec(`insert into auth.users values ('${A}'), ('${B}')`);
});

describe("RLS y onboarding", () => {
  it("crea el perfil al registrarse", async () => {
    const r = await db.query("select count(*)::int as n from public.profiles");
    expect((r.rows[0] as { n: number }).n).toBe(2);
  });

  it("onboarding crea las áreas una sola vez aunque se reintente", async () => {
    await as(A, () => db.query("select public.complete_onboarding($1, $2::jsonb)", ["Ana", four]));
    await as(A, () => db.query("select public.complete_onboarding($1, $2::jsonb)", ["Ana", four]));
    const r = await as(A, () => db.query("select name from public.areas order by position"));
    expect(r.rows.map((x) => (x as { name: string }).name)).toEqual([
      "Casa", "Trabajo", "Salud", "Vida social",
    ]);
  });

  it("A no puede leer las áreas ni el perfil de B", async () => {
    await as(B, () => db.query("select public.complete_onboarding(null, $1::jsonb)", [four]));
    const areas = await as(A, () => db.query("select user_id from public.areas"));
    expect(areas.rows.every((x) => (x as { user_id: string }).user_id === A)).toBe(true);
    const profiles = await as(A, () => db.query("select id from public.profiles"));
    expect(profiles.rows).toHaveLength(1);
  });

  it("A no puede crear un área a nombre de B", async () => {
    await expect(
      as(A, () =>
        db.query("insert into public.areas (user_id, name, color_key, position) values ($1,'X','lila',5)", [B]),
      ),
    ).rejects.toThrow();
  });

  it("A no puede modificar ni borrar áreas de B (0 filas afectadas)", async () => {
    const u = await as(A, () => db.query("update public.areas set name = 'Hack' where user_id = $1", [B]));
    expect(u.affectedRows).toBe(0);
    const d = await as(A, () => db.query("delete from public.areas where user_id = $1", [B]));
    expect(d.affectedRows).toBe(0);
    const p = await as(A, () => db.query("update public.profiles set display_name = 'x' where id = $1", [B]));
    expect(p.affectedRows).toBe(0);
  });

  it("A no puede reasignar su área a B", async () => {
    await expect(
      as(A, () => db.query("update public.areas set user_id = $1 where user_id = $2", [B, A])),
    ).rejects.toThrow();
  });

  it("anónimo no ve nada", async () => {
    await expect(as(null, () => db.query("select * from public.areas"))).rejects.toThrow();
  });

  it("rechaza nombres duplicados, vacíos y de más de 40 caracteres", async () => {
    const ins = (name: string, pos: number) =>
      as(A, () =>
        db.query("insert into public.areas (user_id, name, color_key, position) values ($1,$2,'lila',$3)", [A, name, pos]),
      );
    await expect(ins(" casa ", 4)).rejects.toThrow();
    await expect(ins("   ", 4)).rejects.toThrow();
    await expect(ins("x".repeat(41), 4)).rejects.toThrow();
    await expect(ins("x".repeat(40), 4)).resolves.toBeTruthy();
  });

  it("no permite más de 8 áreas activas, y archivar libera lugar", async () => {
    const ins = (name: string, pos: number) =>
      as(A, () =>
        db.query("insert into public.areas (user_id, name, color_key, position) values ($1,$2,'lila',$3)", [A, name, pos]),
      );
    for (let i = 5; i < 8; i++) await ins(`Extra ${i}`, i);
    await expect(ins("Novena", 7)).rejects.toThrow();
    await as(A, () => db.query("update public.areas set archived_at = now() where name = 'Extra 7'"));
    await expect(ins("Novena", 7)).resolves.toBeTruthy();
  });

  it("onboarding con 1 o 9 áreas falla sin crear nada", async () => {
    const C = "00000000-0000-0000-0000-00000000000c";
    await db.exec(`insert into auth.users values ('${C}')`);
    await expect(
      as(C, () => db.query("select public.complete_onboarding(null, $1::jsonb)", [JSON.stringify([{ name: "Sola", color_key: "lila" }])])),
    ).rejects.toThrow();
    const r = await as(C, () => db.query("select count(*)::int as n from public.areas"));
    expect((r.rows[0] as { n: number }).n).toBe(0);
  });

  it("anónimo no puede ejecutar el onboarding", async () => {
    await expect(as(null, () => db.query("select public.complete_onboarding(null, $1::jsonb)", [four]))).rejects.toThrow();
  });
});
