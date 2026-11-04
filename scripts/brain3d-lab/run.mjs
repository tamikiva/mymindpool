/**
 * Laboratorio del cerebro 3D: UNA pileta, sin adornos, al 0 %, 50 % y 100 %, con exactamente la misma
 * cámara y encuadre (tres escenas del mismo tamaño). Sirve para evaluar la geometría: altura y espesor
 * de las paredes, profundidad interior y cómo se lee el nivel del agua contra la pared.
 *
 *   npm run brain-lab            → escribe brain-lab.png en OUT_DIR (o en un directorio temporal)
 *   LEVELS=0,0.25,0.5,0.75,1 WALL=0.26 npm run brain-lab
 *
 * Modo forma: el cerebro de 4 áreas SIN agua, nombres ni adornos, desde arriba y desde la cámara final,
 * junto a la referencia si se indica su ruta (la imagen de referencia no está en el repositorio):
 *   MODE=shape REFERENCE_IMAGE=/ruta/a/referencia.png npm run brain-lab
 *
 * Modo adornos: el cerebro de 4 áreas completo (nombres, agua y adornos), en tamaño de escritorio y de celular:
 *   MODE=props LEVELS=0.1,0.55,0.9,0.4 npm run brain-lab
 *
 * Usa el Chromium de PLAYWRIGHT_BROWSERS_PATH o CHROMIUM_PATH, como ui-check.
 */
import { build } from "esbuild";
import { chromium } from "playwright-core";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname);
const out = process.env.OUT_DIR ?? fs.mkdtempSync(path.join(os.tmpdir(), "brain-lab-"));
fs.mkdirSync(out, { recursive: true });
const js = path.join(out, "brain-lab.js");
await build({ entryPoints: [path.join(here, process.env.MODE === "shape" ? "harness-shape.ts" : process.env.MODE === "props" ? "harness-props.ts" : "harness.ts")], bundle: true, format: "iife", outfile: js, platform: "browser", logLevel: "error" });

const exe = () => {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH ?? "/opt/pw-browsers";
  if (fs.existsSync(base)) {
    const d = fs.readdirSync(base).filter((n) => /^chromium-\d+$/.test(n)).sort().pop();
    const p = d && path.join(base, d, "chrome-linux", "chrome");
    if (p && fs.existsSync(p)) return p;
  }
  return undefined;
};
const fontDir = path.resolve(here, "../../public/fonts");
const html = `<!doctype html><meta charset=utf-8><style>@font-face{font-family:Nunito;src:url(file://${fontDir}/Nunito-800.ttf);font-weight:800}body{margin:0;background:#EFF8F1}</style><div id=h></div><script src="file://${js}"></script>`;
fs.writeFileSync(path.join(out, "brain-lab.html"), html);
const levels = process.env.LEVELS ?? "0,0.5,1";
const wall = process.env.WALL ?? "0.26";
const shape = process.env.MODE === "shape";
const props = process.env.MODE === "props";
const n = levels.split(",").length;
const width = shape ? 640 * (process.env.REFERENCE_IMAGE ? 3 : 2) : 440 * n;
const browser = await chromium.launch({ executablePath: exe(), args: ["--allow-file-access-from-files"] });
const page = await browser.newPage({ viewport: props ? { width: 1180, height: 640 } : { width, height: shape ? 560 : 520 }, deviceScaleFactor: 2 });
const errs = [];
page.on("pageerror", (e) => errs.push(e.message));
const ref = process.env.REFERENCE_IMAGE ? `&ref=${encodeURIComponent(process.env.REFERENCE_IMAGE)}` : "";
await page.goto(`file://${path.join(out, "brain-lab.html")}?levels=${levels}&wall=${wall}&w=${shape ? 620 : 420}${ref}`);
await page.waitForFunction("window.ready === true", null, { timeout: 60000 }).catch(() => errs.push("la escena no terminó de armarse"));
await page.screenshot({ path: path.join(out, props ? "brain-lab-adornos.png" : shape ? "brain-lab-forma.png" : "brain-lab.png") });
await browser.close();
console.log(errs.length ? errs : `OK · ${path.join(out, props ? "brain-lab-adornos.png" : shape ? "brain-lab-forma.png" : "brain-lab.png")}`);
process.exit(errs.length ? 1 : 0);
