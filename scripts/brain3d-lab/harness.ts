import { BrainScene, offsetPolygon } from "../../src/features/brain3d/scene";
import { buildBrainLayout, polygonArea, polygonCentroid, type BrainLayout } from "../../src/features/brain3d/layout";

const q = new URLSearchParams(location.search);
const wall = Number(q.get("wall") ?? 0.26);
const src = buildBrainLayout(4).pools[0].poly;
const c = polygonCentroid(src);
const poly = src.map((p) => ({ x: p.x - c.x, y: p.y - c.y }));
const outline = offsetPolygon(poly, wall);
const xs = outline.map((p) => p.x), ys = outline.map((p) => p.y);
const layout: BrainLayout = {
  count: 1, outline, pools: [{ index: 0, poly, area: Math.abs(polygonArea(poly)), centroid: { x: 0, y: 0 } }],
  bounds: { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) }, rimSpots: [],
};
const levels = (q.get("levels") ?? "0,0.5,1").split(",").map(Number);
const w = Number(q.get("w") ?? 420);
const root = document.getElementById("h")!;
root.style.cssText = `display:flex;gap:6px;justify-content:center`;
(window as any).ready = false;
let done = 0;
levels.forEach((lv) => {
  const box = document.createElement("div");
  box.style.cssText = `width:${w}px;aspect-ratio:${1 / BrainScene.aspectFor(1, layout)};position:relative;font:700 18px Nunito,sans-serif;color:#392747`;
  const cv = document.createElement("canvas");
  cv.style.cssText = "width:100%;height:100%;display:block";
  box.appendChild(cv);
  const tag = document.createElement("div");
  tag.textContent = `${Math.round(lv * 100)} %`;
  tag.style.cssText = "position:absolute;left:8px;top:4px";
  box.appendChild(tag);
  root.appendChild(box);
  const s = new BrainScene(cv, { props: false, layout });
  s.setReduceMotion(true);
  s.setAreas([{ id: "a0", name: "Casa", fill: "#B7A3EE", deep: "#5B43A0", level: lv }]);
  s.resize(box.clientWidth, box.clientHeight);
  const t = setInterval(() => { if (cv.dataset.ready === "1") { clearInterval(t); setTimeout(() => { if (++done === levels.length) (window as any).ready = true; }, 600); } }, 100);
});
