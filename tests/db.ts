import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

/** Base local con un esquema `auth` mínimo y TODAS las migraciones, en orden. */
export async function createDb(): Promise<PGlite> {
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
  for (const f of readdirSync("supabase/migrations").filter((n) => n.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(`supabase/migrations/${f}`, "utf8"));
  }
  return db;
}

/** Ejecuta como usuario autenticado (RLS activo); `null` = anónimo. */
export async function as<T>(db: PGlite, uid: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(`select set_config('request.jwt.claim.sub', '${uid ?? ""}', false)`);
  await db.exec(`set role ${uid ? "authenticated" : "anon"}`);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}

let counter = 0x100;
export interface TestUser {
  id: string;
  areas: Record<string, string>;
}

/** Crea un usuario con 4 áreas (Casa, Trabajo, Salud, Vida social) y devuelve sus ids. */
export async function newUser(db: PGlite): Promise<TestUser> {
  const id = `00000000-0000-0000-0000-${(counter++).toString(16).padStart(12, "0")}`;
  await db.exec(`insert into auth.users values ('${id}')`);
  const names = ["Casa", "Trabajo", "Salud", "Vida social"];
  await as(db, id, () =>
    db.query("select public.complete_onboarding(null, $1::jsonb)", [
      JSON.stringify(names.map((name, i) => ({ name, color_key: ["lila", "celeste", "verde", "rosa"][i] }))),
    ]),
  );
  const rows = await as(db, id, () => db.query<{ id: string; name: string }>("select id, name from public.areas"));
  return { id, areas: Object.fromEntries(rows.rows.map((r) => [r.name, r.id])) };
}
