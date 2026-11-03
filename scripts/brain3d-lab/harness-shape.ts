/** Modo «forma»: la referencia, el cerebro de 4 áreas SIN agua, nombres ni adornos visto desde arriba, y desde la cámara final. */
import { BrainScene } from "../../src/features/brain3d/scene";
import { TILT } from "../../src/features/brain3d/constants";

const q = new URLSearchParams(location.search);
const w = Number(q.get("w") ?? 620);
const root = document.getElementById("h")!;
root.style.cssText = "display:flex;gap:8px;justify-content:center;align-items:flex-start;font:800 17px Nunito,sans-serif;color:#392747";
(window as any).ready = false;

const COLORS = [
  { fill: "#B7A3EE", deep: "#5B43A0" }, { fill: "#8DC8F5", deep: "#2B6A9E" }, { fill: "#8FD4B7", deep: "#2C7A5C" }, { fill: "#F3A2BE", deep: "#A8456A" },
];
const areas = COLORS.map((c, i) => ({ id: "a" + i, name: ["Casa", "Trabajo", "Salud", "Vida social"][i], ...c, level: 0 }));

const panel = (title: string, node: HTMLElement) => {
  const box = document.createElement("div");
  box.style.cssText = `width:${w}px`;
  const t = document.createElement("div");
  t.textContent = title;
  t.style.cssText = "padding:4px 8px";
  box.append(t, node);
  root.appendChild(box);
};

const ref = q.get("ref");
if (ref) {
  // Recorte de la referencia: el cerebro, sin el título ni la leyenda.
  const crop = document.createElement("div");
  crop.style.cssText = `width:${w}px;height:${Math.round(w * 0.72)}px;overflow:hidden;position:relative`;
  const img = document.createElement("img");
  img.src = "file://" + ref;
  const k = w / 700;
  img.style.cssText = `position:absolute;left:${-40 * k}px;top:${-165 * k}px;width:${768 * k}px`;
  crop.appendChild(img);
  panel("REFERENCIA", crop);
}

let pending = 2;
const done = () => { if (--pending === 0) setTimeout(() => ((window as any).ready = true), 800); };
for (const [title, tilt] of [["VISTA DESDE ARRIBA (sin agua ni adornos)", (89.5 * Math.PI) / 180], ["CÁMARA FINAL (sin agua ni adornos)", TILT]] as const) {
  const box = document.createElement("div");
  box.style.cssText = `width:${w}px;aspect-ratio:${1 / BrainScene.aspectFor(4, undefined, tilt)}`;
  const cv = document.createElement("canvas");
  cv.style.cssText = "width:100%;height:100%;display:block";
  box.appendChild(cv);
  panel(title, box);
  const s = new BrainScene(cv, { props: false, water: false, labels: false, tilt });
  s.setReduceMotion(true);
  s.setAreas(areas);
  s.resize(box.clientWidth, box.clientHeight);
  const t = setInterval(() => { if (cv.dataset.ready === "1") { clearInterval(t); done(); } }, 100);
}
