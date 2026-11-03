/**
 * Validación contra un proyecto Supabase REAL (no simulado): migraciones aplicadas, RLS entre
 * dos usuarias, completar/deshacer idempotentes, onboarding idempotente y guardas de archivado.
 *
 * Requiere dos cuentas de PRUEBA ya registradas y con el email confirmado (crealas desde la app).
 * Usa solo la clave anon: nunca la service_role. Limpia lo que crea (las tareas de prueba).
 *
 *   EXPO_PUBLIC_SUPABASE_URL=... EXPO_PUBLIC_SUPABASE_ANON_KEY=... \
 *   TEST_A_EMAIL=... TEST_A_PASSWORD=... TEST_B_EMAIL=... TEST_B_PASSWORD=... \
 *   npm run validate:supabase
 *
 * Si la cuenta todavía no hizo el onboarding, este script lo hace con 4 áreas estándar.
 */
import { createClient } from "@supabase/supabase-js";

const need = ["EXPO_PUBLIC_SUPABASE_URL", "EXPO_PUBLIC_SUPABASE_ANON_KEY", "TEST_A_EMAIL", "TEST_A_PASSWORD", "TEST_B_EMAIL", "TEST_B_PASSWORD"];
const missing = need.filter((k) => !process.env[k]);
if (missing.length) {
  console.error("Faltan variables: " + missing.join(", ") + "\nVer docs/VALIDACION_SUPABASE.md");
  process.exit(2);
}
const { EXPO_PUBLIC_SUPABASE_URL: URL_, EXPO_PUBLIC_SUPABASE_ANON_KEY: KEY } = process.env;
if (/service_role/i.test(KEY) || (KEY.split(".")[1] && /"role"\s*:\s*"service_role"/.test(Buffer.from(KEY.split(".")[1], "base64url").toString()))) {
  console.error("Esa clave es la service_role. No la uses acá: pegá la anon/publishable.");
  process.exit(2);
}

const mk = () => createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ ok: !!ok, name });
  console.log(`${ok ? "OK   " : "FALLA"} ${name}${ok || !detail ? "" : "  → " + detail}`);
};
const msg = (e) => (e ? `${e.code ?? ""} ${e.message ?? e}`.trim() : "");

const FOUR = [
  { name: "Casa", color_key: "lila" },
  { name: "Trabajo", color_key: "celeste" },
  { name: "Salud", color_key: "verde" },
  { name: "Vida social", color_key: "rosa" },
];

async function login(label, email, password) {
  const c = mk();
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) {
    check(`Entrar como ${label}`, false, msg(error) + " (¿email confirmado y contraseña correcta?)");
    return null;
  }
  check(`Entrar como ${label}`, true);
  return { c, id: data.user.id };
}

async function ensureOnboarded(label, { c }) {
  const { data: p, error } = await c.from("profiles").select("onboarding_completed_at").single();
  if (error) {
    check(`${label}: existe su perfil (migración 0001 aplicada y trigger de alta)`, false, msg(error));
    return false;
  }
  check(`${label}: existe su perfil (migración 0001 aplicada y trigger de alta)`, true);
  if (!p.onboarding_completed_at) {
    const r = await c.rpc("complete_onboarding", { p_display_name: label, p_areas: FOUR });
    if (r.error) { check(`${label}: onboarding`, false, msg(r.error)); return false; }
  }
  return true;
}

const created = []; // { client, id } para limpiar al final

try {
  // 1. Alcance de red y clave
  const health = await fetch(`${URL_}/auth/v1/health`, { headers: { apikey: KEY } }).catch((e) => ({ ok: false, status: String(e.message) }));
  check("El servidor de Supabase responde", health.ok, `estado ${health.status}`);
  if (!health.ok) throw new Error("sin conexión");

  const A = await login("A", process.env.TEST_A_EMAIL, process.env.TEST_A_PASSWORD);
  const B = await login("B", process.env.TEST_B_EMAIL, process.env.TEST_B_PASSWORD);
  if (!A || !B) throw new Error("no se pudo entrar");
  if (A.id === B.id) { check("A y B son cuentas distintas", false, "usaste la misma cuenta dos veces"); throw new Error("misma cuenta"); }
  if (!(await ensureOnboarded("A", A)) || !(await ensureOnboarded("B", B))) throw new Error("onboarding");

  // 2. Tablas de tareas (migraciones 0002 y 0003)
  const probe = await A.c.from("tasks").select("id").limit(1);
  check("Existe la tabla tasks (migración 0002 aplicada)", !probe.error, msg(probe.error));
  if (probe.error) throw new Error("falta 0002");

  // 3. Onboarding idempotente: reintentar no duplica áreas
  const before = await A.c.from("areas").select("id").is("archived_at", null);
  const retry = await A.c.rpc("complete_onboarding", { p_display_name: "A", p_areas: FOUR });
  const after = await A.c.from("areas").select("id").is("archived_at", null);
  check("Reintentar el onboarding no duplica áreas", !retry.error && before.data.length === after.data.length, `${before.data?.length} → ${after.data?.length} ${msg(retry.error)}`);

  // 4. Aislamiento de lectura
  const aAreas = (await A.c.from("areas").select("id, user_id")).data ?? [];
  const bAreas = (await B.c.from("areas").select("id, user_id")).data ?? [];
  check("A solo ve áreas propias", aAreas.length > 0 && aAreas.every((r) => r.user_id === A.id), `${aAreas.length} áreas`);
  check("B solo ve áreas propias", bAreas.length > 0 && bAreas.every((r) => r.user_id === B.id));
  const aSeesB = await A.c.from("areas").select("id").eq("user_id", B.id);
  check("A no puede leer áreas de B ni filtrando por su id", (aSeesB.data ?? []).length === 0, msg(aSeesB.error));
  const aProfiles = (await A.c.from("profiles").select("id")).data ?? [];
  check("A solo ve su propio perfil", aProfiles.length === 1 && aProfiles[0].id === A.id, `${aProfiles.length} perfiles`);

  // 5. Aislamiento de escritura
  const areaA = aAreas[0].id;
  const areaB = bAreas[0].id;
  const crossArea = await A.c.from("tasks").insert({ user_id: A.id, area_id: areaB, title: "Cruzada" });
  check("A no puede crear una tarea en un área de B", !!crossArea.error, "se creó");
  const asB = await A.c.from("tasks").insert({ user_id: B.id, area_id: areaB, title: "A nombre de B" });
  check("A no puede crear una tarea a nombre de B", !!asB.error, "se creó");

  const mineIns = await A.c.from("tasks").insert({ user_id: A.id, area_id: areaA, title: "[validación] tarea de A", weight: 2 }).select("id").single();
  check("A puede crear una tarea propia", !mineIns.error, msg(mineIns.error));
  if (mineIns.error) throw new Error("no se pudo crear");
  const tid = mineIns.data.id;
  created.push({ c: A.c, id: tid });

  const bRead = await B.c.from("tasks").select("id").eq("id", tid);
  check("B no puede leer la tarea de A", (bRead.data ?? []).length === 0, msg(bRead.error));
  const bUpd = await B.c.from("tasks").update({ title: "hack" }).eq("id", tid).select("id");
  check("B no puede modificar la tarea de A (0 filas)", (bUpd.data ?? []).length === 0, msg(bUpd.error));
  const bDel = await B.c.from("tasks").delete().eq("id", tid).select("id");
  check("B no puede borrar la tarea de A (0 filas)", (bDel.data ?? []).length === 0, msg(bDel.error));
  const bComplete = await B.c.rpc("complete_task", { p_task_id: tid });
  check("B no puede completar la tarea de A", !!bComplete.error, "lo permitió");
  const moveToB = await A.c.from("tasks").update({ area_id: areaB }).eq("id", tid);
  check("A no puede mover su tarea al área de B", !!moveToB.error, "lo permitió");
  const reassign = await A.c.from("tasks").update({ user_id: B.id }).eq("id", tid);
  check("A no puede reasignar su tarea a B", !!reassign.error, "lo permitió");

  // 6. Completar / deshacer idempotentes
  const c1 = await A.c.rpc("complete_task", { p_task_id: tid });
  const t1 = (await A.c.from("tasks").select("status, completed_at").eq("id", tid).single()).data;
  const c2 = await A.c.rpc("complete_task", { p_task_id: tid });
  const t2 = (await A.c.from("tasks").select("status, completed_at").eq("id", tid).single()).data;
  check("Completar dos veces deja una sola marca de tiempo", !c1.error && !c2.error && t1.status === "completed" && t1.completed_at === t2.completed_at, msg(c1.error) || msg(c2.error));
  await A.c.rpc("undo_complete_task", { p_task_id: tid });
  await A.c.rpc("undo_complete_task", { p_task_id: tid });
  const t3 = (await A.c.from("tasks").select("status, completed_at").eq("id", tid).single()).data;
  check("Deshacer repone el estado (y repetirlo no rompe nada)", t3.status === "pending" && t3.completed_at === null);

  // 7. Guarda de archivado (0003)
  const arch = await A.c.from("areas").update({ archived_at: new Date().toISOString() }).eq("id", areaA);
  check("No se archiva un área con pendientes (migración 0003 aplicada)", !!arch.error, "se archivó: ¿corriste 0003?");
  if (!arch.error) await A.c.from("areas").update({ archived_at: null }).eq("id", areaA); // deshace el efecto

  // 8. Anónimo sin sesión
  const anon = mk();
  const anonRead = await anon.from("tasks").select("id");
  check("Sin sesión no se puede leer tasks", !!anonRead.error || (anonRead.data ?? []).length === 0, "devolvió datos");
  const anonRpc = await anon.rpc("complete_task", { p_task_id: tid });
  check("Sin sesión no se puede ejecutar complete_task", !!anonRpc.error, "lo permitió");
} catch (e) {
  console.log(`\nSe detuvo: ${e.message}`);
} finally {
  for (const t of created) await t.c.from("tasks").delete().eq("id", t.id);
}

const bad = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - bad}/${results.length} comprobaciones OK contra ${new URL(URL_).host}`);
process.exit(bad || results.length < 20 ? 1 : 0);
