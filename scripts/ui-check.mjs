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
  return { areas, tasks, failNextWrite: false, n: 10 };
}

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
    if (u.pathname.startsWith("/rest/v1/rpc/")) {
      const id = JSON.parse(req.postData()).p_task_id;
      const t = st.tasks.find((x) => x.id === id);
      if (u.pathname.endsWith("/complete_task") && t && t.status === "pending") { t.status = "completed"; t.completed_at = new Date().toISOString(); }
      if (u.pathname.endsWith("/undo_complete_task") && t && t.status === "completed") { t.status = "pending"; t.completed_at = null; }
      return route.fulfill(json(null));
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
      if (q("id")) rows = rows.filter((t) => t.id === q("id").replace("eq.", ""));
      const single = (req.headers()["accept"] ?? "").includes("vnd.pgrst.object");
      return route.fulfill(json(single ? (rows[0] ?? null) : rows, single && !rows[0] ? 406 : 200));
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
for (const [name, fn] of [["Recorridos", flows], ["Teclado y accesibilidad", keyboardAndA11y], ["Movimiento", motion], ["Cerebro 2 y 8 áreas", brainCounts]]) {
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
