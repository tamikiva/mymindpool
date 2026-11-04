/** Modo «adornos»: el cerebro de 4 áreas completo (nombres, agua y adornos) a tamaño de escritorio y de celular. */
import { BrainScene } from "../../src/features/brain3d/scene";

const q = new URLSearchParams(location.search);
const levels = (q.get("levels") ?? "0.1,0.55,0.9,0.4").split(",").map(Number);
const root = document.getElementById("h")!;
root.style.cssText = "display:flex;gap:16px;justify-content:center;align-items:flex-start;font:800 17px Nunito,sans-serif;color:#392747";
(window as any).ready = false;
const COLORS = [
  { fill: "#B7A3EE", deep: "#5B43A0" }, { fill: "#8DC8F5", deep: "#2B6A9E" }, { fill: "#8FD4B7", deep: "#2C7A5C" }, { fill: "#F3A2BE", deep: "#A8456A" },
];
const areas = COLORS.map((c, i) => ({ id: "a" + i, name: ["Casa", "Trabajo", "Salud", "Vida social"][i], ...c, level: levels[i] ?? 0.5 }));
const ratio = BrainScene.aspectFor(4);
let pending = 0;
for (const w of [Number(q.get("wd") ?? 760), Number(q.get("wm") ?? 350)]) {
  const box = document.createElement("div");
  box.style.cssText = `width:${w}px;height:${Math.round(w * ratio)}px;position:relative`;
  const cv = document.createElement("canvas");
  cv.style.cssText = "width:100%;height:100%;display:block";
  box.appendChild(cv);
  root.appendChild(box);
  const s = new BrainScene(cv, {});
  s.setReduceMotion(true);
  s.setAreas(areas);
  s.resize(box.clientWidth, box.clientHeight);
  pending++;
  const t = setInterval(() => { if (cv.dataset.ready === "1") { clearInterval(t); s.refreshLabels(); setTimeout(() => { s.renderNow(); if (--pending === 0) (window as any).ready = true; }, 700); } }, 100);
}
