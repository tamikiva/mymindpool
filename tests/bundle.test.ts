import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { buildBundle, buildVerify, buildUndo } from "../scripts/sql-bundle.mjs";

async function bareDb(): Promise<PGlite> {
  const db = new PGlite();
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
  return db;
}
const tables = async (db: PGlite) =>
  (await db.query<{ n: string }>("select tablename n from pg_tables where schemaname='public'")).rows.length;
const problems = async (db: PGlite) => {
  const r = await db.query<{ comprobacion: string; estado: string }>(readFileSync("supabase/verify.sql", "utf8"));
  const bad = r.rows.filter((x) => !/^OK/.test(x.estado)).map((x) => `${x.comprobacion}: ${x.estado}`);
  return r.rows.length === 101 ? bad : [...bad, `se esperaban 101 filas y hay ${r.rows.length}`];
};

describe("paquete SQL único", () => {
  it("los archivos del repo están al día con el generador", () => {
    expect(readFileSync("supabase/all-migrations.sql", "utf8")).toBe(buildBundle());
    expect(readFileSync("supabase/verify.sql", "utf8")).toBe(buildVerify());
    expect(readFileSync("supabase/undo-all.sql", "utf8")).toBe(buildUndo());
  });

  it("se aplica entero y verify.sql no encuentra problemas", async () => {
    const db = await bareDb();
    await db.exec(buildBundle());
    expect(await tables(db)).toBe(13);
    expect(await problems(db)).toEqual([]);
  });

  it("si algo falla a mitad, no queda nada", async () => {
    const db = await bareDb();
    const broken = buildBundle().replace("create table public.tasks", "select 1/0;\ncreate table public.tasks");
    expect(broken).not.toBe(buildBundle());
    await expect(db.exec(broken)).rejects.toThrow();
    await db.exec("rollback").catch(() => {});
    expect(await tables(db)).toBe(0);
  });

  it("volver a pegarlo se frena antes de tocar nada", async () => {
    const db = await bareDb();
    await db.exec(buildBundle());
    await expect(db.exec(buildBundle())).rejects.toThrow(/ya existe/i);
    await db.exec("rollback").catch(() => {});
    expect(await tables(db)).toBe(13);
    expect(await problems(db)).toEqual([]);
  });

  it("deshacer y volver a aplicar funciona", async () => {
    const db = await bareDb();
    await db.exec(buildBundle());
    await db.exec(buildUndo());
    expect(await tables(db)).toBe(0);
    await db.exec(buildBundle());
    expect(await problems(db)).toEqual([]);
  });
});
