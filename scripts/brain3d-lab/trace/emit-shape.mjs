import fs from "node:fs";
const S = "/tmp/claude-0/-home-user-mymindpool/14395620-3b21-5c03-beb7-f412d6c0e08a/scratchpad/sil";
const t = JSON.parse(fs.readFileSync(`${S}/traced.json`, "utf8"));
const WIDTH = 10.3, FORESHORTEN = 0.85; // ancho del cerebro en el mundo; la cámara de la referencia mira ~58° → se estira y
const xs = t.outline.map((p) => p[0]), ys = t.outline.map((p) => p[1]);
const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
const s = WIDTH / (Math.max(...xs) - Math.min(...xs));
const conv = (l) => l.map(([x, y]) => ({ x: (x - cx) * s, y: ((y - cy) * s) / FORESHORTEN }));
function resample(poly, step) {
  const n = poly.length, cum = [0];
  for (let i = 0; i < n; i++) { const q = poly[(i + 1) % n]; cum.push(cum[i] + Math.hypot(q.x - poly[i].x, q.y - poly[i].y)); }
  const total = cum[n], count = Math.max(24, Math.round(total / step)), out = []; let seg = 0;
  for (let k = 0; k < count; k++) { const d = (k / count) * total; while (cum[seg + 1] < d) seg++; const a = poly[seg], b = poly[(seg + 1) % n]; const u = (d - cum[seg]) / Math.max(1e-9, cum[seg + 1] - cum[seg]); out.push({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u }); }
  return out.map((p, i) => { const a = out[(i + out.length - 1) % out.length], b = out[(i + 1) % out.length]; return { x: (a.x + 2 * p.x + b.x) / 4, y: (a.y + 2 * p.y + b.y) / 4 }; });
}
const fmt = (l) => "[" + l.map((p) => `[${p.x.toFixed(3)},${p.y.toFixed(3)}]`).join(",") + "]";
const order = ["casa", "trabajo", "salud", "vida"];
const outline = resample(conv(t.outline), 0.12);
const pools = order.map((k) => resample(conv(t.pools[k]), 0.12));
const all = outline.flatMap((p) => [p.x, p.y]);
const out = `/**
 * Contornos del cerebro-pileta de 4 áreas, trazados de la imagen de referencia de celular
 * (segmentación por color de las piletas; el borde exterior es la unión de piletas y paredes
 * engrosada por el espesor del borde). Se corrigió el acortamiento vertical de la perspectiva
 * (÷ ${FORESHORTEN}) y se escaló a ${WIDTH} unidades de ancho. Coordenadas del mundo, y hacia abajo en pantalla.
 * Orden de piletas: Casa (arriba izquierda), Trabajo (arriba derecha), Salud (abajo izquierda), Vida social (abajo derecha).
 * Son las piletas VISIBLES de la referencia (con las paredes de la referencia, ~0,5 de espesor): el
 * generador las ensancha para llegar al espesor de pared elegido (RIM y WALL en layout.ts).
 */
export const REFERENCE_4: { outline: [number, number][]; pools: [number, number][][] } = {
  outline: ${fmt(outline)},
  pools: [
${pools.map((p) => "    " + fmt(p)).join(",\n")},
  ],
};
`;
fs.writeFileSync("/home/user/mymindpool/src/features/brain3d/referenceShape.ts", out);
console.log("ancho", (Math.max(...outline.map(p=>p.x)) - Math.min(...outline.map(p=>p.x))).toFixed(2), "alto", (Math.max(...outline.map(p=>p.y)) - Math.min(...outline.map(p=>p.y))).toFixed(2), "puntos", outline.length, pools.map((p) => p.length));
