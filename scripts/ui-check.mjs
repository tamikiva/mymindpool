/**
 * Verificación de interfaz en Chromium con una API SIMULADA (no toca Supabase).
 *
 * Qué prueba: recorridos de pantallas, teclado, accesibilidad (axe-core), reducción de
 * movimiento y el cerebro con 2 y 8 áreas.
 * Qué NO prueba: nada del servidor real (auth, RLS, migraciones). Eso se valida aparte
 * contra el proyecto Supabase (docs/VALIDACION_SUPABASE.md).
 *
 * Uso: npm run ui-check            (construye la web con una URL falsa y corre todo)
 *      SKIP_BUILD=1 npm run ui-check   (reutiliza el build anterior)
 * Variables: CHROMIUM_PATH (opcional), OUT_DIR (capturas; por defecto un directorio temporal).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { chromium } from "playwright-core";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const OUT = process.env.OUT_DIR ?? fs.mkdtempSync(path.join(os.tmpdir(), "mindpool-ui-"));
const DIST = path.join(os.tmpdir(), "mindpool-ui-dist");
const PORT = 8099;
const API = "http://localhost:54321";
fs.mkdirSync(OUT, { recursive: true });

// ---------- build ----------
if (!process.env.SKIP_BUILD) {
  fs.rmSync(DIST, { recursive: true, force: true });
  const r = spawnSync("npx", ["expo", "export", "--clear", "--platform", "web", "--output-dir", DIST], {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, EXPO_PUBLIC_SUPABASE_URL: API, EXPO_PUBLIC_SUPABASE_ANON_KEY: "fake-anon-key" },
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

// ---------- servidor estático con fallback de rutas ----------
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".ico": "image/x-icon", ".png": "image/png", ".ttf": "font/ttf" };
const server = http.createServer((req, res) => {
  let p = path.join(DIST, decodeURIComponent(req.url.split("?")[0]));
  if (!p.startsWith(DIST) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(DIST, "index.html");
  res.writeHead(200, { "content-type": types[path.extname(p)] ?? "application/octet-stream" });
  fs.createReadStream(p).pipe(res);
}).listen(PORT);
const BASE = `http://localhost:${PORT}`;

// ---------- API simulada ----------
const UID = "00000000-0000-0000-0000-0000000000aa";
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: UID, role: "authenticated", exp: 4102444800 })}.sig`;
const session = { access_token: jwt, refresh_token: "r", token_type: "bearer", expires_in: 999999, expires_at: 4102444800, user: { id: UID, email: "a@b.c", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" } };
const TODAY = new Date().toLocaleDateString("sv-SE");
const COLORS = ["lila", "celeste", "verde", "rosa", "durazno", "menta", "malva", "cielo"];

const mkTask = (id, area_id, title, over = {}) => ({ id, area_id, title, status: "pending", weight: 1, priority: "normal", scheduled_date: null, someday: false, note: null, completed_at: null, ...over });

function freshState(areaNames) {
  const names = areaNames ?? ["Casa", "Trabajo", "Salud", "Vida social"];
  const areas = names.map((name, i) => ({ id: "a" + (i + 1), name, color_key: COLORS[i % 8], position: i, capacity: 8 }));
  const tasks = [
    mkTask("t1", "a1", "Lavar los platos", { weight: 2, scheduled_date: TODAY }),
    mkTask("t2", "a1", "Ordenar el living", { scheduled_date: "2026-01-02", priority: "urgent" }),
    mkTask("t3", "a2", "Informe mensual", { weight: 3 }),
    mkTask("t4", "a3", "Turno con la médica", { scheduled_date: "2099-01-01" }),
    mkTask("t5", "a4", "Llamar a una amiga", { someday: true }),
    mkTask("t6", "a2", "Enviar factura", { status: "completed", completed_at: "2026-11-01T10:00:00Z" }),
  ].filter((t) => areas.some((a) => a.id === t.area_id));
  // Con muchas áreas, cargas variadas para ver distintos niveles de agua.
  areas.slice(4).forEach((a, i) => tasks.push(mkTask("x" + i, a.id, "Pendiente " + a.name, { weight: ((i % 3) + 1) })));
  return { areas, tasks, failNextWrite: false, n: 10, templates: [], tsteps: [], runs: [], rsteps: [], rid: 0, plans: {}, rules: [], rtasks: [], occs: [] };
}

const NO_ROWS = { code: "PGRST116", details: "The result contains 0 rows", message: "JSON object requested, multiple (or no) rows returned" };
const one = (rows) => (rows[0] ? { status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(rows[0]) } : { status: 406, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(NO_ROWS) });
const json = (body, status = 200) => ({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: status === 204 ? "" : JSON.stringify(body) });

async function installApi(ctx, st) {
  await ctx.route(`${API}/**`, async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const m = req.method();
    const q = (k) => u.searchParams.get(k);
    if (m === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
    if (u.pathname.startsWith("/auth/")) return route.fulfill(json({}));
    if (u.pathname === "/rest/v1/profiles") return route.fulfill(json({ id: UID, display_name: "Ana", onboarding_completed_at: "2026-11-01T00:00:00Z", reduce_motion: false }));
    if (u.pathname === "/rest/v1/areas") {
      if (m === "PATCH") {
        const id = q("id").replace("eq.", "");
        const patch = JSON.parse(req.postData());
        const i = st.areas.findIndex((a) => a.id === id);
        if (patch.archived_at) st.areas.splice(i, 1);
        else Object.assign(st.areas[i], patch);
        return route.fulfill(json([], 204));
      }
      return route.fulfill(json(st.areas));
    }
    if (u.pathname.startsWith("/rest/v1/rpc/") && /\/(complete_task|undo_complete_task)$/.test(u.pathname)) {
      const id = JSON.parse(req.postData()).p_task_id;
      const t = st.tasks.find((x) => x.id === id);
      if (u.pathname.endsWith("/complete_task") && t && t.status === "pending") { t.status = "completed"; t.completed_at = new Date().toISOString(); }
      if (u.pathname.endsWith("/undo_complete_task") && t && t.status === "completed") { t.status = "pending"; t.completed_at = null; }
      return route.fulfill(json(null));
    }
    if (u.pathname === "/rest/v1/recurring_tasks") return route.fulfill(json(st.rtasks.filter((t) => !t.archived).map(({ archived, ...t }) => t)));
    if (u.pathname === "/rest/v1/recurrence_rules") return route.fulfill(json(st.rules));
    if (u.pathname === "/rest/v1/task_occurrences") {
      const stt = q("status"); const od = q("occurrence_date");
      let rows = st.occs;
      if (stt?.startsWith("eq.")) rows = rows.filter((o) => o.status === stt.slice(3));
      if (stt?.startsWith("in.")) rows = rows.filter((o) => stt.slice(4, -1).split(",").includes(o.status));
      if (od?.startsWith("lte.")) rows = rows.filter((o) => o.occurrence_date <= od.slice(4));
      if (od?.startsWith("eq.")) rows = rows.filter((o) => o.occurrence_date === od.slice(3));
      return route.fulfill(json(rows));
    }
    if (/\/rpc\/(save_recurring_task|ensure_occurrences|set_occurrence_state|archive_recurring_task)$/.test(u.pathname)) {
      const b = JSON.parse(req.postData());
      const fn = u.pathname.split("/").pop();
      if (st.failNextWrite && fn !== "ensure_occurrences") { st.failNextWrite = false; return route.fulfill(json({ message: "boom", code: "XX000" }, 500)); }
      const day = (d) => new Date(d + "T00:00:00Z");
      if (fn === "save_recurring_task") {
        let id = b.p_id;
        const rule = { frequency: b.p_frequency, interval_count: b.p_interval, weekdays: b.p_weekdays, start_date: b.p_start, end_date: b.p_end };
        if (!id) { id = "rt" + ++st.rid; st.rules.push({ id: "r" + id, ...rule }); st.rtasks.push({ id, rule_id: "r" + id, area_id: b.p_area_id, title: b.p_title, note: b.p_note, weight: b.p_weight, priority: b.p_priority }); }
        else { Object.assign(st.rules.find((r) => r.id === "r" + id), rule); Object.assign(st.rtasks.find((t) => t.id === id), { area_id: b.p_area_id, title: b.p_title, weight: b.p_weight }); st.occs = st.occs.filter((o) => !(o.recurring_task_id === id && o.status === "pending" && o.occurrence_date >= b.p_today)); }
        return route.fulfill(json(id));
      }
      if (fn === "archive_recurring_task") { st.rtasks.find((t) => t.id === b.p_id).archived = true; st.occs = st.occs.filter((o) => !(o.recurring_task_id === b.p_id && o.status === "pending" && o.occurrence_date >= b.p_today)); return route.fulfill(json(null)); }
      if (fn === "set_occurrence_state") {
        const o = st.occs.find((x) => x.id === b.p_id);
        if (b.p_action === "complete" && o.status === "pending") o.status = "done";
        if (b.p_action === "skip" && o.status === "pending") o.status = "skipped";
        if (b.p_action === "undo") o.status = "pending";
        return route.fulfill(json(o.status));
      }
      let made = 0;
      for (const t of st.rtasks.filter((x) => !x.archived)) {
        const r = st.rules.find((x) => x.id === t.rule_id);
        for (let d = day(b.p_from); d <= day(b.p_to); d = new Date(d.getTime() + 86400000)) {
          const ds = d.toISOString().slice(0, 10);
          const dow = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
          const diff = Math.round((d - day(r.start_date)) / 86400000);
          const ok = ds >= r.start_date && (!r.end_date || ds <= r.end_date) && (r.frequency === "daily" ? diff % r.interval_count === 0 : r.weekdays.includes(dow));
          if (ok && !st.occs.some((o) => o.recurring_task_id === t.id && o.occurrence_date === ds)) { st.occs.push({ id: "oc" + ++st.rid, recurring_task_id: t.id, occurrence_date: ds, title: t.title, area_id: t.area_id, weight: t.weight, status: "pending" }); made++; }
        }
      }
      return route.fulfill(json(made));
    }
    if (u.pathname === "/rest/v1/day_plans") {
      const d = q("plan_date")?.replace("eq.", "");
      const pl = st.plans[d];
      const rows = pl ? [{ id: pl.id, plan_date: d, available_minutes: pl.available_minutes, closed_at: pl.closed_at }] : [];
      return route.fulfill((req.headers()["accept"] ?? "").includes("vnd.pgrst.object") ? one(rows) : json(rows));
    }
    if (u.pathname === "/rest/v1/day_plan_areas" || u.pathname === "/rest/v1/day_plan_items") {
      const pl = Object.values(st.plans).find((x) => x.id === q("plan_id")?.replace("eq.", ""));
      return route.fulfill(json(pl ? (u.pathname.endsWith("areas") ? pl.areas : pl.items) : []));
    }
    if (u.pathname.endsWith("/rpc/save_day_plan") || u.pathname.endsWith("/rpc/close_day_plan")) {
      const b = JSON.parse(req.postData());
      if (st.failNextWrite) { st.failNextWrite = false; return route.fulfill(json({ message: "boom", code: "XX000" }, 500)); }
      if (u.pathname.endsWith("save_day_plan")) {
        const pl = (st.plans[b.p_date] ??= { id: "plan" + ++st.rid, closed_at: null });
        Object.assign(pl, { available_minutes: b.p_available, areas: b.p_areas.map((a) => ({ area_id: a.area_id, moment: a.moment, planned_minutes: a.planned_minutes })), items: b.p_items.map((x, i) => ({ task_id: x.kind === "task" ? x.id : null, routine_template_id: x.kind === "routine" ? x.id : null, position: i })) });
        return route.fulfill(json(pl.id));
      }
      const pl = st.plans[b.p_date];
      pl.closed_at = new Date().toISOString();
      const tomorrow = new Date(new Date(b.p_date + "T00:00:00Z").getTime() + 86400000).toISOString().slice(0, 10);
      b.p_carry_task_ids.forEach((id) => { const t = st.tasks.find((x) => x.id === id); if (t && t.status === "pending") t.scheduled_date = tomorrow; });
      return route.fulfill(json(null));
    }
    if (u.pathname === "/rest/v1/routine_templates") return route.fulfill(json(st.templates.filter((t) => !t.archived)));
    if (u.pathname === "/rest/v1/routine_template_steps") return route.fulfill(json(st.tsteps));
    if (u.pathname === "/rest/v1/routine_runs") {
      const single = (req.headers()["accept"] ?? "").includes("vnd.pgrst.object");
      let rows = st.runs;
      const sv = q("status");
      if (sv?.startsWith("in.")) rows = rows.filter((r) => sv.slice(4, -1).split(",").includes(r.status));
      if (q("id")) rows = rows.filter((r) => r.id === q("id").replace("eq.", ""));
      return route.fulfill(single ? one(rows) : json(rows));
    }
    if (u.pathname === "/rest/v1/routine_run_steps") {
      let rows = st.rsteps;
      const rv = q("run_id");
      if (rv?.startsWith("in.")) rows = rows.filter((r) => rv.slice(4, -1).split(",").includes(r.run_id));
      if (q("status")?.startsWith("eq.")) rows = rows.filter((r) => r.status === q("status").slice(3));
      return route.fulfill(json(rows));
    }
    if (u.pathname.startsWith("/rest/v1/rpc/") && /save_routine_template|start_routine_run|advance_run_step|set_run_state|archive_routine_template/.test(u.pathname)) {
      const b = JSON.parse(req.postData());
      const fn = u.pathname.split("/").pop();
      if (st.failNextWrite && fn !== "start_routine_run") { st.failNextWrite = false; return route.fulfill(json({ message: "boom", code: "XX000" }, 500)); }
      if (fn === "save_routine_template") {
        let id = b.p_id;
        if (!id) { id = "tp" + ++st.rid; st.templates.push({ id, name: b.p_name, default_area_id: b.p_default_area, start_cue: b.p_cue }); }
        else Object.assign(st.templates.find((t) => t.id === id), { name: b.p_name, default_area_id: b.p_default_area, start_cue: b.p_cue });
        st.tsteps = st.tsteps.filter((x) => x.template_id !== id);
        b.p_steps.forEach((x, i) => st.tsteps.push({ id: id + "s" + i, template_id: id, position: i, title: x.title, area_id: x.area_id, weight: x.weight, duration_minutes: null, in_short: x.in_short }));
        return route.fulfill(json(id));
      }
      if (fn === "archive_routine_template") { st.templates.find((t) => t.id === b.p_id).archived = true; return route.fulfill(json(null)); }
      if (fn === "start_routine_run") {
        const open = st.runs.find((r) => r.template_id === b.p_template_id && ["active", "paused"].includes(r.status));
        if (open) return route.fulfill(json(open.id));
        const t = st.templates.find((x) => x.id === b.p_template_id);
        const id = "run" + ++st.rid;
        st.runs.push({ id, template_id: t.id, template_name: t.name, version: b.p_version, status: "active", run_date: b.p_run_date });
        st.tsteps.filter((x) => x.template_id === t.id && (b.p_version === "full" || x.position === 0 || x.in_short)).forEach((x, i) => st.rsteps.push({ id: id + "s" + i, run_id: id, position: i, title: x.title, area_id: x.area_id, weight: x.weight, duration_minutes: null, status: "pending" }));
        return route.fulfill(json(id));
      }
      if (fn === "advance_run_step") {
        const stp = st.rsteps.find((x) => x.id === b.p_step_id);
        const run = st.runs.find((r) => r.id === stp.run_id);
        const target = b.p_action === "complete" ? "done" : "skipped";
        if (stp.status === "pending" && run.status === "active" && !st.rsteps.some((x) => x.run_id === run.id && x.status === "pending" && x.position < stp.position)) stp.status = target;
        if (!st.rsteps.some((x) => x.run_id === run.id && x.status === "pending")) run.status = "completed";
        return route.fulfill(json(run.status));
      }
      if (fn === "set_run_state") {
        const run = st.runs.find((r) => r.id === b.p_run_id);
        if (b.p_action === "pause") run.status = "paused";
        if (b.p_action === "resume") run.status = "active";
        if (b.p_action === "cancel") { run.status = "cancelled"; st.rsteps.filter((x) => x.run_id === run.id && x.status === "pending").forEach((x) => (x.status = "cancelled")); }
        return route.fulfill(json(run.status));
      }
    }
    if (u.pathname === "/rest/v1/tasks") {
      if (m !== "GET" && st.failNextWrite) { st.failNextWrite = false; return route.fulfill(json({ message: "boom", code: "XX000" }, 500)); }
      if (m === "POST") {
        const b = JSON.parse(req.postData());
        st.tasks.push(mkTask("n" + ++st.n, b.area_id, b.title, { weight: b.weight, scheduled_date: b.scheduled_date }));
        return route.fulfill(json([], 201));
      }
      if (m === "PATCH") {
        const patch = JSON.parse(req.postData());
        const id = q("id")?.replace("eq.", "");
        const areaId = q("area_id")?.replace("eq.", "");
        st.tasks.filter((t) => (id ? t.id === id : t.area_id === areaId && t.status === "pending")).forEach((t) => Object.assign(t, patch));
        return route.fulfill(json([], 204));
      }
      if (m === "DELETE") { const id = q("id").replace("eq.", ""); st.tasks = st.tasks.filter((t) => t.id !== id); return route.fulfill(json([], 204)); }
      let rows = st.tasks;
      const sv = q("status");
      if (sv?.startsWith("in.")) rows = rows.filter((t) => sv.slice(4, -1).split(",").includes(t.status));
      if (sv?.startsWith("eq.")) rows = rows.filter((t) => t.status === sv.slice(3));
      const idv = q("id");
      if (idv?.startsWith("in.")) rows = rows.filter((t) => idv.slice(4, -1).split(",").includes(t.id));
      else if (idv) rows = rows.filter((t) => t.id === idv.replace("eq.", ""));
      const single = (req.headers()["accept"] ?? "").includes("vnd.pgrst.object");
      return route.fulfill(single ? one(rows) : json(rows));
    }
    return route.fulfill(json([]));
  });
}

// ---------- utilidades ----------
const results = [];
const errors = [];
const check = (name, cond, detail = "") => results.push({ ok: !!cond, name, detail });
const exe = () => {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH ?? "/opt/pw-browsers";
  if (fs.existsSync(base)) {
    const d = fs.readdirSync(base).filter((n) => /^chromium-\d+$/.test(n)).sort().pop();
    const p = d && path.join(base, d, "chrome-linux", "chrome");
    if (p && fs.existsSync(p)) return p;
  }
  return undefined; // Playwright usa su navegador por defecto
};
const browser = await chromium.launch({ executablePath: exe() });

async function newPage({ width = 390, height = 900, reducedMotion = "no-preference", st }) {
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion });
  await ctx.addInitScript((s) => localStorage.setItem("sb-localhost-auth-token", JSON.stringify(s)), session);
  await installApi(ctx, st);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push("console: " + m.text()); });
  return { ctx, page };
}
const shot = async (page, name) => { await page.waitForTimeout(500); await page.screenshot({ path: path.join(OUT, name + ".png"), fullPage: true }); };
const chip = (page, name) => page.getByRole("radio", { name, exact: true });
const body = (page) => page.locator("body").innerText();

async function axe(page, label) {
  await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
  const r = await page.evaluate(async () => {
    const res = await window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa"] });
    return res.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help, sample: v.nodes[0]?.html.slice(0, 120) }));
  });
  const bad = r.filter((v) => v.impact === "serious" || v.impact === "critical");
  check(`axe ${label}: sin violaciones serias/críticas`, bad.length === 0, bad.map((v) => `${v.id} (${v.nodes}): ${v.sample}`).join(" | "));
  const minor = r.filter((v) => !bad.includes(v));
  if (minor.length) console.log(`  axe ${label} (menores): ` + minor.map((v) => `${v.id}[${v.impact}]`).join(", "));
}

// ---------- 1. Recorridos de pantallas ----------
async function flows() {
  const st = freshState();
  const { ctx, page } = await newPage({ st });
  await page.goto(`${BASE}/equilibrio`);
  await page.getByText("Hola, Ana").waitFor({ timeout: 20000 });
  check("Equilibrio muestra carga real de Casa (3 de 8)", /Casa[\s\S]*3 de 8/.test(await body(page)));
  await shot(page, "1-equilibrio");

  await page.goto(`${BASE}/tareas`);
  await page.getByText("Lavar los platos").first().waitFor({ timeout: 15000 });
  let t = await body(page);
  check("Pendientes lista abiertas y excluye completadas", t.includes("Lavar los platos") && t.includes("Informe mensual") && !t.includes("Enviar factura"));
  await shot(page, "2-tareas");
  await chip(page, "Vencidas").click();
  t = await body(page);
  check("Vencidas solo muestra la vencida", t.includes("Ordenar el living") && !t.includes("Lavar los platos"));
  await chip(page, "Completadas").click();
  t = await body(page);
  check("Completadas tiene su vista", t.includes("Enviar factura") && !t.includes("Informe mensual"));
  await chip(page, "Futuras").click();
  check("Futuras solo la de 2099", (await body(page)).includes("Turno con la médica"));
  await chip(page, "Más adelante").click();
  check("Más adelante aparte", (await body(page)).includes("Llamar a una amiga"));
  await chip(page, "Pendientes").click();
  await page.getByLabel("Buscar").fill("informe");
  t = await body(page);
  check("Búsqueda filtra", t.includes("Informe mensual") && !t.includes("Lavar los platos"));
  await page.getByLabel("Buscar").fill("zzz");
  check("Búsqueda sin resultado muestra mensaje", (await body(page)).includes("No encontramos tareas"));
  await page.getByLabel("Buscar").fill("");

  await page.getByRole("button", { name: "Completar Informe mensual" }).click();
  await page.getByText("Completaste «Informe mensual»").waitFor({ timeout: 5000 });
  check("Completar muestra aviso y la saca de pendientes", st.tasks.find((x) => x.id === "t3").status === "completed");
  await page.getByRole("button", { name: "Deshacer", exact: true }).click();
  await page.getByText("Informe mensual").first().waitFor({ timeout: 5000 });
  check("Deshacer la repone", st.tasks.find((x) => x.id === "t3").status === "pending");

  st.failNextWrite = true;
  await page.getByLabel(/Nueva tarea/).fill("No se debe perder");
  await page.getByRole("button", { name: "Agregar" }).click();
  await page.getByText("Algo no salió como esperábamos").waitFor({ timeout: 5000 });
  check("Fallo de escritura: avisa y conserva lo escrito", (await page.getByLabel(/Nueva tarea/).inputValue()) === "No se debe perder");
  await page.getByRole("button", { name: "Agregar" }).click();
  await page.getByText("No se debe perder").first().waitFor({ timeout: 5000 });
  check("Reintento crea la tarea una sola vez", st.tasks.filter((x) => x.title === "No se debe perder").length === 1);
  await shot(page, "3-tareas-despues");

  await page.getByLabel("Editar Lavar los platos").click();
  await page.getByText("Editar tarea").waitFor({ timeout: 5000 });
  await page.getByLabel("Título").fill("Lavar platos y ollas");
  await page.getByLabel(/Fecha/).fill("2026-02-31");
  check("Fecha inválida muestra error", (await body(page)).includes("formato AAAA-MM-DD"));
  const saveOff = await page.getByRole("button", { name: "Guardar", exact: true }).evaluate((e) => (e.disabled || e.getAttribute("aria-disabled") === "true" ? "deshabilitado" : "habilitado"));
  check("Fecha inválida deshabilita Guardar", saveOff === "deshabilitado", saveOff);
  await shot(page, "4-editar");
  await page.getByLabel(/Fecha/).fill("");
  await chip(page, "Grande (3)").click();
  await chip(page, "Trabajo").click();
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await page.getByText("Lavar platos y ollas").first().waitFor({ timeout: 5000 });
  const e = st.tasks.find((x) => x.id === "t1");
  check("Edición guarda título, tamaño, área y fecha", e.title === "Lavar platos y ollas" && e.weight === 3 && e.area_id === "a2" && e.scheduled_date === null);

  await page.getByLabel("Editar Ordenar el living").click();
  await page.getByRole("button", { name: "Eliminar", exact: true }).click();
  check("Eliminar pide confirmación", (await body(page)).includes("no se puede deshacer"));
  await page.getByRole("button", { name: "No, conservar" }).click();
  check("«No, conservar» no elimina", st.tasks.some((x) => x.id === "t2"));
  await page.getByRole("button", { name: "Cancelar tarea" }).click();
  await chip(page, "Pendientes").waitFor();
  check("Cancelar tarea la saca de pendientes", st.tasks.find((x) => x.id === "t2").status === "cancelled");

  await page.goto(`${BASE}/area/a2`);
  await page.getByText("Informe mensual").first().waitFor({ timeout: 15000 });
  t = await body(page);
  check("Área: banda de carga y «sin registro» de tiempo", /Carga (alta|manejable|baja)/.test(t) && t.includes("sin registro"));
  await shot(page, "5-area");
  await page.getByLabel("Nombre").fill("Trabajo remoto");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await page.getByText("Trabajo remoto").first().waitFor({ timeout: 5000 });
  check("Renombrar área se refleja", st.areas.find((a) => a.id === "a2").name === "Trabajo remoto");

  await page.getByRole("button", { name: "Archivar área" }).first().click();
  const confirm = page.getByRole("button", { name: "Archivar área" }).last();
  const confOff = await confirm.evaluate((e) => (e.disabled || e.getAttribute("aria-disabled") === "true" ? "deshabilitado" : "habilitado"));
  check("Archivar con pendientes: confirmar está deshabilitado hasta elegir destino", confOff === "deshabilitado", confOff);
  await confirm.click({ force: true });
  check("Confirmar sin destino no archiva ni mueve nada", st.areas.some((a) => a.id === "a2") && st.tasks.some((x) => x.area_id === "a2" && x.status === "pending"));
  await chip(page, "Casa").click();
  check("Con destino elegido, confirmar se habilita", !/aria-disabled="true"/.test(await confirm.evaluate((e) => (e.disabled || e.getAttribute("aria-disabled") === "true" ? "deshabilitado" : "habilitado"))));
  await confirm.click();
  await page.getByText("Hola, Ana").waitFor({ timeout: 8000 });
  check("Archivar mueve los pendientes al destino", !st.areas.some((a) => a.id === "a2") && st.tasks.filter((x) => x.area_id === "a2" && x.status === "pending").length === 0);
  await ctx.close();

  // Con 2 áreas no se puede archivar.
  const two = freshState(["Casa", "Trabajo"]);
  const p2 = await newPage({ st: two });
  await p2.page.goto(`${BASE}/area/a1`);
  await p2.page.getByText("Necesitás al menos 2 áreas activas").waitFor({ timeout: 15000 });
  const archOff = await p2.page.getByRole("button", { name: "Archivar área" }).first().evaluate((e) => (e.disabled || e.getAttribute("aria-disabled") === "true" ? "deshabilitado" : "habilitado"));
  check("Con 2 áreas, archivar está bloqueado con explicación", archOff === "deshabilitado", archOff);
  await p2.ctx.close();

  const d = await newPage({ width: 1200, height: 800, st: freshState() });
  await d.page.goto(`${BASE}/tareas`);
  await d.page.getByText("Lavar los platos").first().waitFor({ timeout: 15000 });
  await shot(d.page, "6-tareas-desktop");
  await d.ctx.close();
}

// ---------- 1b. Rutinas ----------
async function routines() {
  const st = freshState();
  const { ctx, page } = await newPage({ st });
  await page.goto(`${BASE}/rutinas`);
  await page.getByText("Todavía no tenés rutinas").waitFor({ timeout: 20000 });
  check("Rutinas: estado vacío con acción clara", (await body(page)).includes("Nueva rutina"));
  await shot(page, "8-rutinas-vacio");

  // Crear desde la plantilla sugerida al escribir «limpiar la casa»
  await page.getByRole("button", { name: "Nueva rutina" }).click();
  await page.getByLabel("Nombre", { exact: true }).fill("limpiar la casa");
  await page.getByRole("button", { name: "Usar la plantilla Limpiar la casa" }).click();
  await page.getByLabel("Título del paso 7").waitFor({ timeout: 5000 });
  check("Plantilla local: 7 pasos y empieza por el canasto", (await page.getByLabel("Título del paso 1").inputValue()).includes("canasto de limpieza"));
  await shot(page, "9-editor-rutina");

  // Validación: un paso vacío bloquea el guardado y no se pierde nada
  await page.getByLabel("Título del paso 2").fill("");
  await page.getByRole("button", { name: "Guardar rutina" }).click();
  await page.getByText("Poné un título para este paso.").waitFor({ timeout: 3000 });
  check("Editor: paso sin título muestra error y no guarda", st.templates.length === 0);
  await page.getByLabel("Título del paso 2").fill("Juntar la basura");

  // Reordenar y quitar
  await page.getByRole("button", { name: "Bajar el paso 2" }).click();
  check("Editor: bajar un paso lo reordena", (await page.getByLabel("Título del paso 3").inputValue()) === "Juntar la basura");
  await page.getByRole("button", { name: "Subir el paso 3" }).click();
  await page.getByRole("button", { name: "Quitar el paso 7" }).click();
  check("Editor: quitar un paso lo elimina", await page.getByLabel("Título del paso 7").count() === 0);
  check("Editor: el primer paso no se puede subir y es la acción inicial", (await body(page)).includes("acción inicial"));

  // Fallo al guardar: el borrador se conserva
  st.failNextWrite = true;
  await page.getByRole("button", { name: "Guardar rutina" }).click();
  await page.getByText("Algo no salió como esperábamos").waitFor({ timeout: 5000 });
  check("Editor: un fallo al guardar conserva el borrador", (await page.getByLabel("Título del paso 1").inputValue()).includes("canasto") && st.templates.length === 0);
  await page.getByRole("button", { name: "Guardar rutina" }).click();
  await page.getByText("Mis rutinas").waitFor({ timeout: 8000 });
  check("Editor: reintentar guarda la rutina una sola vez con 6 pasos", st.templates.length === 1 && st.tsteps.length === 6);

  // Empezar versión corta
  await page.getByRole("button", { name: "Empezar versión corta de Limpiar la casa" }).waitFor();
  await shot(page, "10-rutinas-lista");
  await page.getByRole("button", { name: "Empezar versión corta de Limpiar la casa" }).click();
  await page.getByText("Paso actual").waitFor({ timeout: 8000 });
  let t = await body(page);
  check("Ejecución: muestra solo el paso actual (la acción inicial)", t.includes("canasto de limpieza") && !t.includes("Barrer"));
  check("Ejecución: la versión corta tiene menos pasos", /0 de 3 pasos resueltos/.test(t) && t.includes("Versión corta"));
  await shot(page, "11-ejecucion");

  // Equilibrio: la carga de los pasos abiertos cuenta (3 pasos de peso 1 en Casa)
  await page.goto(`${BASE}/equilibrio`);
  await page.getByText("Hola, Ana").waitFor({ timeout: 15000 });
  t = await body(page);
  check("Equilibrio: suma los pasos abiertos de la rutina a la carga de Casa (3 + 3 = 6 de 8)", /Casa[\s\S]*6 de 8/.test(t));
  check("Equilibrio: ofrece continuar la rutina en curso", t.includes("en curso"));
  await page.getByRole("button", { name: "Continuar Limpiar la casa" }).click();
  await page.getByText("Paso actual").waitFor({ timeout: 8000 });

  // Pausa: no se puede avanzar y se retoma
  await page.getByRole("button", { name: "Pausar" }).click();
  await page.getByText("La rutina está en pausa").waitFor({ timeout: 5000 });
  check("Pausa: desaparecen los botones de avanzar", await page.getByRole("button", { name: "Listo" }).count() === 0);
  await page.getByRole("button", { name: "Retomar" }).click();
  await page.getByRole("button", { name: "Listo" }).waitFor({ timeout: 5000 });

  // Completar, saltar, secuencia completa
  await page.getByRole("button", { name: "Listo" }).click();
  await page.getByText("Juntar la basura").first().waitFor({ timeout: 5000 });
  await page.getByRole("button", { name: "Saltar este paso" }).click();
  await page.getByRole("button", { name: "Ver la secuencia completa" }).click();
  t = await body(page);
  check("Secuencia: hecho y saltado se distinguen con texto, no solo con color", t.includes("✓ Hecho") && t.includes("↷ Saltado"));
  check("Saltar no cuenta como completar", st.rsteps.filter((x) => x.status === "done").length === 1 && st.rsteps.filter((x) => x.status === "skipped").length === 1);
  await shot(page, "12-secuencia");

  // Cerrar la última: cierre sin encadenar otra rutina
  await page.getByRole("button", { name: "Listo" }).click();
  await page.getByText("Terminaste «Limpiar la casa»").waitFor({ timeout: 8000 });
  t = await body(page);
  check("Cierre: resume lo hecho y vuelve al equilibrio, sin proponer otra rutina", t.includes("2 pasos hechos, 1 saltado") && t.includes("Volver a mi equilibrio") && !/Empezar/.test(t));
  await shot(page, "13-cierre");
  await page.getByRole("button", { name: "Volver a mi equilibrio" }).click();
  await page.getByText("Hola, Ana").waitFor({ timeout: 8000 });
  check("Terminada la rutina, su carga ya no cuenta (Casa vuelve a 3 de 8)", /Casa[\s\S]*3 de 8/.test(await body(page)));

  // Cancelar con confirmación
  await page.goto(`${BASE}/rutinas`);
  await page.getByRole("button", { name: "Empezar Limpiar la casa" }).click();
  await page.getByText("Paso actual").waitFor({ timeout: 8000 });
  await page.getByRole("button", { name: "Cancelar la rutina" }).click();
  check("Cancelar pide confirmación", (await body(page)).includes("libera los pasos pendientes"));
  await page.getByRole("button", { name: "No, seguir" }).click();
  check("«No, seguir» no cancela", st.runs.at(-1).status === "active");
  await page.getByRole("button", { name: "Cancelar la rutina" }).click();
  await page.getByRole("button", { name: "Sí, cancelar la rutina" }).click();
  await page.getByText("Cancelaste «Limpiar la casa»").waitFor({ timeout: 8000 });
  check("Cancelar libera los pasos pendientes", st.rsteps.filter((x) => x.run_id === st.runs.at(-1).id).every((x) => x.status === "cancelled"));

  // Accesibilidad de las pantallas nuevas
  await page.goto(`${BASE}/rutinas`);
  await page.getByText("Mis rutinas").waitFor({ timeout: 8000 });
  await axe(page, "Rutinas");
  await page.getByRole("link", { name: "Editar Limpiar la casa" }).click();
  await page.getByText("Editar rutina").waitFor({ timeout: 8000 });
  await axe(page, "Editor de rutina");
  await ctx.close();
}

// ---------- 1c. Mi día ----------
async function dayPlan() {
  const st = freshState();
  const { ctx, page } = await newPage({ st });
  await page.goto(`${BASE}/dia`);
  await page.getByText("¿Qué áreas querés atender hoy?").waitFor({ timeout: 20000 });
  check("Mi día sin plan: pregunta por las áreas y no impone ninguna", (await body(page)).includes("No hace falta atenderlas todas"));
  await shot(page, "14-dia-vacio");

  await page.getByRole("button", { name: "Guardar mi día" }).click();
  await page.getByText("Elegí al menos un área para hoy.").waitFor({ timeout: 3000 });
  check("Guardar sin áreas muestra el error y no guarda", Object.keys(st.plans).length === 0);

  await page.getByRole("checkbox", { name: "Casa" }).click();
  await page.getByRole("checkbox", { name: "Trabajo" }).click();
  check("Las áreas elegidas se marcan con texto (✓), no solo con color", (await page.getByRole("checkbox", { name: "Casa" }).getAttribute("aria-checked")) === "true");
  await page.getByLabel("Minutos para Casa (opcional)").fill("240");
  await page.getByLabel("Minutos para Trabajo (opcional)").fill("120");
  await page.getByLabel("Tiempo disponible hoy, en minutos (opcional)").fill("300");
  await page.getByText("supera lo que tenés disponible por 60 min").waitFor({ timeout: 3000 });
  check("Si el plan supera el tiempo declarado avisa, sin bloquear el guardado", (await body(page)).includes("es tu decisión") && (await page.getByRole("button", { name: "Guardar mi día" }).evaluate((e) => !e.disabled)));
  await page.getByLabel("Minutos para Trabajo (opcional)").fill("abc");
  await page.getByRole("button", { name: "Guardar mi día" }).click();
  await page.getByText("Usá minutos, con números enteros").first().waitFor({ timeout: 3000 });
  check("Minutos inválidos se marcan y no guardan", Object.keys(st.plans).length === 0);
  await page.getByLabel("Minutos para Trabajo (opcional)").fill("120");

  await page.getByRole("radio", { name: "Mañana", exact: true }).first().click();
  await page.getByRole("checkbox", { name: "Lavar los platos" }).click();
  await page.getByRole("checkbox", { name: "Informe mensual" }).click();
  check("Solo se ofrecen tareas de las áreas elegidas (no la de Salud)", (await page.getByRole("checkbox", { name: "Turno con la médica" }).count()) === 0);
  await shot(page, "15-dia-editar");

  st.failNextWrite = true;
  await page.getByRole("button", { name: "Guardar mi día" }).click();
  await page.getByText("Algo no salió como esperábamos").waitFor({ timeout: 5000 });
  check("Un fallo al guardar conserva lo elegido", (await page.getByLabel("Minutos para Casa (opcional)").inputValue()) === "240" && Object.keys(st.plans).length === 0);
  await page.getByRole("button", { name: "Guardar mi día" }).click();
  await page.getByRole("button", { name: "Completar Lavar los platos" }).waitFor({ timeout: 8000 });
  const plan = Object.values(st.plans)[0];
  check("Reintentar guarda un solo plan con 2 áreas y 2 tareas", Object.keys(st.plans).length === 1 && plan.areas.length === 2 && plan.items.length === 2);
  await shot(page, "16-dia-plan");

  let t = await body(page);
  check("El plan muestra áreas con momento y minutos", t.includes("Mañana") && t.includes("240 min"));
  await page.getByRole("button", { name: "Completar Lavar los platos" }).click();
  await page.getByRole("button", { name: "Deshacer Lavar los platos" }).waitFor({ timeout: 5000 });
  check("Completar una tarea del plan la marca con ✓", (await body(page)).includes("✓ Lavar los platos") && st.tasks.find((x) => x.id === "t1").status === "completed");

  // Editar: quitar un área quita sus tareas
  await page.getByRole("button", { name: "Editar mi plan" }).click();
  await page.getByRole("checkbox", { name: "Trabajo" }).click();
  await page.getByRole("button", { name: "Guardar mi día" }).click();
  await page.getByText("1 de 1 tareas del plan resueltas").waitFor({ timeout: 8000 }).catch(() => {});
  const plan2 = Object.values(st.plans)[0];
  check("Quitar un área del plan quita también sus tareas", plan2.areas.length === 1 && plan2.items.length === 1);

  // Volver a agregar Trabajo y su tarea para cerrar con algo pendiente
  await page.getByRole("button", { name: "Editar mi plan" }).click();
  await page.getByRole("checkbox", { name: "Trabajo" }).click();
  await page.getByRole("checkbox", { name: "Informe mensual" }).click();
  await page.getByRole("button", { name: "Guardar mi día" }).click();
  await page.getByRole("button", { name: "Completar Informe mensual" }).waitFor({ timeout: 8000 });

  // Cierre: solo se traslada lo elegido
  await page.getByRole("button", { name: "Cerrar el día", exact: true }).click();
  await page.getByText("no se mueve nada solo").waitFor({ timeout: 5000 });
  check("Cierre: ofrece solo las tareas sin resolver", await page.getByRole("checkbox", { name: "Lavar los platos" }).count() === 0 && await page.getByRole("checkbox", { name: "Informe mensual" }).count() === 1);
  await shot(page, "17-dia-cierre");
  await page.getByRole("button", { name: "Cerrar el día", exact: true }).click();
  await page.getByText("Cerraste este día").waitFor({ timeout: 8000 });
  check("Cerrar sin elegir no mueve ninguna tarea", st.tasks.find((x) => x.id === "t3").scheduled_date === null);
  check("Día cerrado: ya no se puede editar ni cerrar de nuevo", (await page.getByRole("button", { name: "Editar mi plan" }).count()) === 0);
  await axe(page, "Mi día (plan cerrado)");
  await ctx.close();

  // Cierre con traslado elegido
  const st2 = freshState();
  const b = await newPage({ st: st2 });
  await b.page.goto(`${BASE}/dia`);
  await b.page.getByText("¿Qué áreas querés atender hoy?").waitFor({ timeout: 20000 });
  await b.page.getByRole("checkbox", { name: "Trabajo" }).click();
  await b.page.getByRole("checkbox", { name: "Informe mensual" }).click();
  await axe(b.page, "Mi día (editar)");
  await b.page.getByRole("button", { name: "Guardar mi día" }).click();
  await b.page.getByRole("button", { name: "Completar Informe mensual" }).waitFor({ timeout: 8000 });
  await axe(b.page, "Mi día (plan)");
  await b.page.getByRole("button", { name: "Cerrar el día", exact: true }).click();
  await b.page.getByRole("checkbox", { name: "Informe mensual" }).click();
  await b.page.getByRole("button", { name: "Cerrar el día", exact: true }).click();
  await b.page.getByText("Cerraste este día").waitFor({ timeout: 8000 });
  const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString("sv-SE");
  check("Cierre: la tarea elegida pasa a mañana", st2.tasks.find((x) => x.id === "t3").scheduled_date === tomorrow);
  check("Cierre: las no elegidas quedan como estaban", st2.tasks.find((x) => x.id === "t1").scheduled_date === TODAY);
  await b.ctx.close();
}

// ---------- 1d. Tareas repetidas ----------
async function recurring() {
  const st = freshState();
  const { ctx, page } = await newPage({ st });
  await page.goto(`${BASE}/repetidas`);
  await page.getByText("Todavía no tenés tareas repetidas").waitFor({ timeout: 20000 });
  check("Repetidas: estado vacío con acción clara", (await body(page)).includes("Nueva tarea repetida"));
  await page.getByRole("button", { name: "Nueva tarea repetida" }).click();
  await page.getByText("Nueva tarea repetida").first().waitFor({ timeout: 5000 });

  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await page.getByText("Poné un título.").waitFor({ timeout: 3000 });
  check("Sin título no guarda", st.rtasks.length === 0);

  await page.getByLabel("Título").fill("Regar las plantas");
  await page.getByRole("radio", { name: "Días de la semana" }).click();
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await page.getByText("Elegí al menos un día de la semana.").waitFor({ timeout: 3000 });
  check("Semanal sin días elegidos muestra el error y no guarda", st.rtasks.length === 0);
  await page.getByRole("checkbox", { name: "lunes" }).click();
  await page.getByRole("checkbox", { name: "jueves" }).click();
  await page.getByLabel("Empieza (AAAA-MM-DD)").fill("2026-02-31");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await page.getByText("Usá el formato AAAA-MM-DD").first().waitFor({ timeout: 3000 });
  check("Fecha de comienzo imposible se marca y no guarda", st.rtasks.length === 0);
  await page.getByLabel("Empieza (AAAA-MM-DD)").fill(TODAY);
  check("La vista previa describe la regla y lista las próximas fechas", /Todas las semanas: lunes y jueves\. Próximas: \d{4}-\d{2}-\d{2}/.test(await body(page)));
  await shot(page, "18-repetida-editor");

  st.failNextWrite = true;
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await page.getByText("Algo no salió como esperábamos").waitFor({ timeout: 5000 });
  check("Un fallo al guardar conserva lo escrito", (await page.getByLabel("Título").inputValue()) === "Regar las plantas" && st.rtasks.length === 0);
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await page.getByText("Regar las plantas").first().waitFor({ timeout: 8000 });
  check("Reintentar guarda una sola tarea repetida", st.rtasks.length === 1 && st.rules.length === 1);
  await shot(page, "19-repetidas-lista");

  // Tareas: se generan las repeticiones y se resuelven de a una
  const daily = freshState();
  const d = await newPage({ st: daily });
  daily.rules.push({ id: "rr1", frequency: "daily", interval_count: 1, weekdays: [], start_date: "2026-10-01", end_date: null });
  daily.rtasks.push({ id: "rt1", rule_id: "rr1", area_id: "a1", title: "Tomar la medicación", note: null, weight: 2, priority: "normal" });
  // Dos repeticiones vencidas sin resolver (días anteriores)
  const dayBefore = (n) => new Date(Date.now() - n * 86400000).toLocaleDateString("sv-SE");
  daily.occs.push({ id: "old1", recurring_task_id: "rt1", occurrence_date: dayBefore(2), title: "Tomar la medicación", area_id: "a1", weight: 2, status: "pending" });
  daily.occs.push({ id: "old2", recurring_task_id: "rt1", occurrence_date: dayBefore(1), title: "Tomar la medicación", area_id: "a1", weight: 2, status: "pending" });
  await d.page.goto(`${BASE}/equilibrio`);
  await d.page.getByText("Hola, Ana").waitFor({ timeout: 20000 });
  let t = await body(d.page);
  check("Equilibrio: genera la repetición de hoy y solo ella suma (Casa 3 + 2 = 5 de 8; las 2 vencidas no acumulan)", /Casa[\s\S]*5 de 8/.test(t));
  check("Se generó una sola ocurrencia por día, hoy y los 7 días siguientes (8 fechas)", daily.occs.filter((o) => o.id.startsWith("oc")).length === 8 && new Set(daily.occs.map((o) => o.occurrence_date)).size === daily.occs.length);

  await d.page.goto(`${BASE}/tareas`);
  await d.page.getByText("Repeticiones").first().waitFor({ timeout: 15000 });
  t = await body(d.page);
  check("Tareas: muestra la de hoy y las vencidas como repeticiones aparte", t.includes("hoy") && (t.match(/vencida:/g) ?? []).length === 2);
  await shot(d.page, "20-tareas-repeticiones");
  await chip(d.page, "Vencidas").click();
  check("Vista Vencidas: solo las dos vencidas", (await d.page.getByRole("button", { name: /Completar Tomar la medicación/ }).count()) === 2);
  await chip(d.page, "Pendientes").click();
  await d.page.getByRole("button", { name: "Completar Tomar la medicación (repetición)" }).first().click();
  await d.page.waitForTimeout(600);
  const todayOcc = daily.occs.find((o) => o.occurrence_date === TODAY);
  check("Completar una repetición solo cambia esa ocurrencia", daily.occs.filter((o) => o.status === "done").length === 1 && daily.rtasks.length === 1 && daily.occs.filter((o) => o.status === "pending").length === daily.occs.length - 1);
  const first = daily.occs.find((o) => o.status === "done");
  await d.page.getByRole("button", { name: /Saltar Tomar la medicación/ }).first().click();
  await d.page.waitForTimeout(600);
  check("Saltar no cuenta como hecha", daily.occs.filter((o) => o.status === "done").length === 1 && daily.occs.filter((o) => o.status === "skipped").length === 1);
  await axe(d.page, "Tareas con repeticiones");
  await d.page.goto(`${BASE}/repetidas`);
  await d.page.getByRole("link", { name: "Editar Tomar la medicación" }).click();
  await d.page.getByText("Editar tarea repetida").waitFor({ timeout: 8000 });
  await axe(d.page, "Editor de tarea repetida");
  await d.page.getByRole("button", { name: "Archivar tarea repetida" }).click();
  check("Archivar pide confirmación", (await body(d.page)).includes("se descartan las repeticiones pendientes"));
  await d.page.getByRole("button", { name: "Sí, archivar" }).click();
  await d.page.getByText("Todavía no tenés tareas repetidas").waitFor({ timeout: 8000 });
  check("Archivar descarta las pendientes de hoy en adelante y conserva lo pasado y lo resuelto", daily.occs.every((o) => o.status !== "pending" || o.occurrence_date < TODAY));
  await d.ctx.close();
  await ctx.close();
}

// ---------- 2. Teclado y accesibilidad ----------
async function keyboardAndA11y() {
  const st = freshState();
  const { ctx, page } = await newPage({ st });
  await page.goto(`${BASE}/tareas`);
  await page.getByText("Lavar los platos").first().waitFor({ timeout: 15000 });

  // Se puede llegar con Tab a los controles principales («Agregar» solo se habilita con texto).
  await page.getByLabel(/Nueva tarea/).fill("borrador");
  const seen = new Set();
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press("Tab");
    const label = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") || document.activeElement?.textContent?.slice(0, 40) || "");
    if (label) seen.add(label);
  }
  for (const want of ["Pendientes", "Todas las áreas", "Buscar", "Completar Lavar los platos", "Agregar"]) {
    check(`Teclado: Tab alcanza «${want}»`, [...seen].some((l) => l.includes(want)), "");
  }

  // El foco es visible.
  await page.getByLabel("Completar Lavar los platos").focus();
  const focus = await page.evaluate(() => {
    const cs = getComputedStyle(document.activeElement);
    return { outline: cs.outlineStyle, width: parseFloat(cs.outlineWidth), shadow: cs.boxShadow };
  });
  check("Teclado: el foco se ve (contorno o sombra)", (focus.outline !== "none" && focus.width > 0) || focus.shadow !== "none", JSON.stringify(focus));

  // Enter activa el botón enfocado.
  await page.keyboard.press("Enter");
  await page.getByText("Completaste «Lavar los platos»").waitFor({ timeout: 5000 }).catch(() => {});
  check("Teclado: Enter completa la tarea enfocada", st.tasks.find((x) => x.id === "t1").status === "completed");
  await page.getByLabel("Deshacer", { exact: true }).first().focus();
  await page.keyboard.press("Space");
  await page.waitForTimeout(500);
  check("Teclado: Espacio deshace", st.tasks.find((x) => x.id === "t1").status === "pending");

  // Chips: estado seleccionado expuesto a lectores de pantalla.
  const sel = await chip(page, "Pendientes").getAttribute("aria-checked");
  check("Chips exponen su estado (radio con aria-checked)", sel === "true", `aria-checked=${sel}`);
  // El campo de búsqueda y los botones tienen nombre accesible.
  const unnamed = await page.evaluate(() => [...document.querySelectorAll("button,[role=button],input")].filter((e) => !(e.getAttribute("aria-label") || e.textContent?.trim())).length);
  check("Todos los botones y campos tienen nombre accesible", unnamed === 0, `${unnamed} sin nombre`);
  await axe(page, "Tareas");

  await page.goto(`${BASE}/equilibrio`);
  await page.getByText("Hola, Ana").waitFor({ timeout: 15000 });
  await axe(page, "Equilibrio");
  // El cerebro es operable con teclado: cada pileta es un radio enfocable y Enter la selecciona.
  const radios = page.getByRole("radio");
  check("Cerebro: una pileta enfocable por área", (await radios.count()) === 4, `radios=${await radios.count()}`);
  await radios.nth(1).focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  check("Cerebro: Enter selecciona la pileta y abre sus tareas", (await body(page)).includes("Abrir área"));
  await axe(page, "Equilibrio con área elegida");

  await page.goto(`${BASE}/tarea/t3`);
  await page.getByText("Editar tarea").waitFor({ timeout: 15000 });
  await axe(page, "Editar tarea");
  await page.goto(`${BASE}/area/a1`);
  await page.getByText("Pendientes").first().waitFor({ timeout: 15000 });
  await axe(page, "Área");

  // Zoom / texto grande: a 200 % (viewport 195 px de ancho CSS) no hay scroll horizontal de página.
  await page.setViewportSize({ width: 195, height: 800 });
  await page.goto(`${BASE}/tareas`);
  await page.getByText("Lavar los platos").first().waitFor({ timeout: 15000 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("Equivalente a zoom 200 %: sin desborde horizontal de la página", overflow <= 1, `desborde=${overflow}px`);
  await ctx.close();
}

// ---------- 3. Reducción de movimiento ----------
/** Cuenta cuántos estados distintos toma el dibujo del cerebro mientras se completa una tarea. */
async function distinctFrames(reducedMotion) {
  const st = freshState();
  const { ctx, page } = await newPage({ st, reducedMotion });
  await page.goto(`${BASE}/equilibrio`);
  await page.getByText("Hola, Ana").waitFor({ timeout: 15000 });
  await page.getByRole("radio").nth(1).focus();
  await page.keyboard.press("Enter"); // abre Trabajo
  await page.getByRole("button", { name: "Completar Informe mensual" }).waitFor();
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    window.__frames = new Set();
    const svg = document.querySelector("svg");
    const tick = () => {
      window.__frames.add([...svg.querySelectorAll("path[fill^='url(']")].map((p) => p.getAttribute("d")).join("|"));
      window.__raf = requestAnimationFrame(tick);
    };
    tick();
  });
  await page.getByRole("button", { name: "Completar Informe mensual" }).click();
  await page.waitForTimeout(1200);
  const n = await page.evaluate(() => { cancelAnimationFrame(window.__raf); return window.__frames.size; });
  await ctx.close();
  return n;
}
async function motion() {
  const normal = await distinctFrames("no-preference");
  const reduced = await distinctFrames("reduce");
  console.log(`  cuadros distintos del agua: normal=${normal}, reducido=${reduced}`);
  check("Movimiento normal: el nivel se anima en varios cuadros", normal > 3, `cuadros distintos=${normal}`);
  check("Movimiento reducido: el nivel cambia sin animación (≤ 2 estados)", reduced <= 2, `cuadros distintos=${reduced}`);
}

// ---------- 4. Cerebro con 2 y 8 áreas ----------
async function brainCounts() {
  const longName = "Nombre de área de cuarenta caracteres!!"; // 39–40 caracteres
  const sets = {
    2: ["Casa", "Trabajo"],
    8: ["Casa", "Trabajo", "Salud", "Vida social", longName, "Estudio", "Descanso", "Hobbies y juegos"],
  };
  for (const [n, names] of Object.entries(sets)) {
    for (const width of [390, 1200]) {
      const st = freshState(names);
      const { ctx, page } = await newPage({ st, width, height: 900 });
      await page.goto(`${BASE}/equilibrio`);
      await page.getByText("Hola, Ana").waitFor({ timeout: 20000 });
      await page.waitForTimeout(800);
      const info = await page.evaluate(() => {
        const svg = document.querySelector("svg");
        const box = svg.getBoundingClientRect();
        const texts = [...svg.querySelectorAll("text")].map((t) => ({ s: t.textContent, r: t.getBoundingClientRect(), p: t.parentElement }));
        const overlaps = [];
        for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
          if (texts[i].p === texts[j].p) continue; // líneas del mismo nombre
          // Cajas alineadas a los ejes de texto levemente rotado: se usa el 70 % central para no marcar
          // falsos positivos en esquinas vacías (la garantía exacta está en las pruebas unitarias).
          const shrink = (r) => ({ l: r.left + r.width * 0.15, rr: r.right - r.width * 0.15, t: r.top + r.height * 0.15, b: r.bottom - r.height * 0.15 });
          const a = shrink(texts[i].r), b = shrink(texts[j].r);
          if (a.l < b.rr && b.l < a.rr && a.t < b.b && b.t < a.b) overlaps.push(texts[i].s + " × " + texts[j].s);
        }
        const outside = texts.filter((t) => t.r.left < box.left - 1 || t.r.right > box.right + 1 || t.r.top < box.top - 1 || t.r.bottom > box.bottom + 1).map((t) => t.s);
        const smallest = Math.min(...texts.map((t) => parseFloat(getComputedStyle(svg.querySelector("text")).fontSize) * (box.width / 400)));
        return { labels: texts.map((t) => t.s), overlaps, outside, radios: svg.querySelectorAll("[role=radio]").length, smallest };
      });
      const tag = `${n} áreas, ${width}px`;
      check(`Cerebro ${tag}: un sector y una etiqueta por área`, info.radios === Number(n) && names.every((nm) => info.labels.join("").replace(/\s+/g, "").includes(nm.replace(/\s+/g, "").slice(0, 8))), `radios=${info.radios}, etiquetas=${info.labels.length}`);
      check(`Cerebro ${tag}: etiquetas sin superponerse`, info.overlaps.length === 0, info.overlaps.join("; "));
      check(`Cerebro ${tag}: etiquetas dentro del dibujo`, info.outside.length === 0, info.outside.join("; "));
      await shot(page, `7-cerebro-${n}-areas-${width}`);
      // La lista alternativa muestra todas las áreas con su carga.
      const listed = await page.evaluate((ns) => ns.filter((x) => document.body.innerText.includes(x)).length, names.map((x) => x.slice(0, 12)));
      check(`Cerebro ${tag}: la lista alternativa muestra todas`, listed === names.length, `${listed}/${names.length}`);
      await ctx.close();
    }
  }
}

// ---------- ejecución ----------
for (const [name, fn] of [["Recorridos", flows], ["Rutinas", routines], ["Mi día", dayPlan], ["Tareas repetidas", recurring], ["Teclado y accesibilidad", keyboardAndA11y], ["Movimiento", motion], ["Cerebro 2 y 8 áreas", brainCounts]]) {
  console.log(`\n== ${name}`);
  const before = results.length;
  try { await fn(); } catch (e) { check(`${name}: el recorrido terminó sin excepción`, false, String(e.message).split("\n")[0]); }
  for (const r of results.slice(before)) console.log(`${r.ok ? "OK   " : "FALLA"} ${r.name}${r.ok || !r.detail ? "" : "  → " + r.detail}`);
}
console.log("\nErrores de consola/página:", errors.length ? errors : "ninguno");
const failed = results.filter((r) => !r.ok).length + (errors.length ? 1 : 0);
console.log(`\n${results.length - results.filter((r) => !r.ok).length}/${results.length} comprobaciones OK · capturas en ${OUT}`);
console.log("Aviso: todo esto usa una API simulada; no valida nada contra Supabase real.");
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
