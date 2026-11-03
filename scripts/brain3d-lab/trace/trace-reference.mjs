import { chromium } from "/home/user/mymindpool/node_modules/playwright-core/index.mjs";
import fs from "node:fs";
const S = "/tmp/claude-0/-home-user-mymindpool/14395620-3b21-5c03-beb7-f412d6c0e08a/scratchpad/sil";
const X0 = 40, Y0 = 170, W = 700, H = 480;

// ---- píxeles de la referencia
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--allow-file-access-from-files"] });
const p = await b.newPage({ viewport: { width: 900, height: 700 } });
await p.goto(`file://${S}/i.html`);
await p.waitForFunction("document.getElementById('i').complete && document.getElementById('i').naturalWidth>0");
const b64 = await p.evaluate(([x0, y0, w, h]) => {
  const img = document.getElementById("i");
  const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext("2d"); g.drawImage(img, 0, 0);
  const d = g.getImageData(x0, y0, w, h).data;
  let s = ""; for (let i = 0; i < d.length; i += 4096) s += String.fromCharCode(...d.subarray(i, i + 4096));
  return btoa(s);
}, [X0, Y0, W, H]);
await b.close();
const rgba = Buffer.from(b64, "base64");

// ---- morfología con distancia euclídea
const idx = (x, y) => y * W + x;
function edt(isSource) {
  const INF = 1e12, f = new Float64Array(W * H);
  for (let k = 0; k < f.length; k++) f[k] = isSource[k] ? 0 : INF;
  const n = Math.max(W, H), tmp = new Float64Array(n), out = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  const pass = (len) => {
    let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < len; q++) {
      let s;
      for (;;) { const pp = v[k]; s = (tmp[q] + q * q - (tmp[pp] + pp * pp)) / (2 * q - 2 * pp); if (s <= z[k] && k > 0) k--; else break; }
      k++; v[k] = q; z[k] = s; z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < len; q++) { while (z[k + 1] < q) k++; const pp = v[k]; out[q] = (q - pp) * (q - pp) + tmp[pp]; }
  };
  for (let x = 0; x < W; x++) { for (let y = 0; y < H; y++) tmp[y] = f[idx(x, y)]; pass(H); for (let y = 0; y < H; y++) f[idx(x, y)] = out[y]; }
  for (let y = 0; y < H; y++) { for (let x = 0; x < W; x++) tmp[x] = f[idx(x, y)]; pass(W); for (let x = 0; x < W; x++) f[idx(x, y)] = out[x]; }
  for (let k = 0; k < f.length; k++) f[k] = Math.sqrt(f[k]);
  return f;
}
const dilate = (m, r) => { const d = edt(m); const o = new Uint8Array(m.length); for (let k = 0; k < m.length; k++) o[k] = d[k] <= r ? 1 : 0; return o; };
const inv = (m) => m.map((v) => (v ? 0 : 1));
const erode = (m, r) => inv(dilate(inv(m), r));
const close = (m, r) => erode(dilate(m, r), r);
const open = (m, r) => dilate(erode(m, r), r);
function fillHoles(m) {
  const seen = new Uint8Array(m.length), q = [];
  for (let x = 0; x < W; x++) for (const y of [0, H - 1]) if (!m[idx(x, y)] && !seen[idx(x, y)]) { seen[idx(x, y)] = 1; q.push(idx(x, y)); }
  for (let y = 0; y < H; y++) for (const x of [0, W - 1]) if (!m[idx(x, y)] && !seen[idx(x, y)]) { seen[idx(x, y)] = 1; q.push(idx(x, y)); }
  while (q.length) { const k = q.pop(), x = k % W, y = (k / W) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const j = idx(nx, ny); if (!m[j] && !seen[j]) { seen[j] = 1; q.push(j); } } }
  return m.map((v, k) => (v || !seen[k] ? 1 : 0));
}
function component(m, sx, sy) {
  const o = new Uint8Array(m.length), q = [idx(sx, sy)]; if (!m[q[0]]) throw new Error(`semilla fuera de la máscara ${sx},${sy}`);
  o[q[0]] = 1;
  while (q.length) { const k = q.pop(), x = k % W, y = (k / W) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const j = idx(nx, ny); if (m[j] && !o[j]) { o[j] = 1; q.push(j); } } }
  return o;
}
function blur(a, sigma) {
  const r = Math.ceil(sigma * 3), w = []; let s = 0;
  for (let k = -r; k <= r; k++) { const v = Math.exp(-(k * k) / (2 * sigma * sigma)); w.push(v); s += v; }
  const t = new Float64Array(a.length), o = new Float64Array(a.length);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let acc = 0; for (let k = -r; k <= r; k++) acc += w[k + r] * a[idx(Math.min(W - 1, Math.max(0, x + k)), y)]; t[idx(x, y)] = acc / s; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let acc = 0; for (let k = -r; k <= r; k++) acc += w[k + r] * t[idx(x, Math.min(H - 1, Math.max(0, y + k)))]; o[idx(x, y)] = acc / s; }
  return o;
}
function contour(field) { // nivel 0.5, devuelve el lazo de mayor área
  const segs = [], pos = new Map();
  const e = (kind, i, j, fa, fb) => { const key = `${kind}${i},${j}`; if (!pos.has(key)) { const t = (0.5 - fa) / (fb - fa); pos.set(key, kind === "h" ? [i + t, j] : [i, j + t]); } return key; };
  for (let j = 0; j < H - 1; j++) for (let i = 0; i < W - 1; i++) {
    const a = field[idx(i, j)], bb = field[idx(i + 1, j)], c = field[idx(i + 1, j + 1)], d = field[idx(i, j + 1)];
    const code = (a > .5 ? 1 : 0) | (bb > .5 ? 2 : 0) | (c > .5 ? 4 : 0) | (d > .5 ? 8 : 0); if (code === 0 || code === 15) continue;
    const T = () => e("h", i, j, a, bb), R = () => e("v", i + 1, j, bb, c), B = () => e("h", i, j + 1, d, c), L = () => e("v", i, j, a, d), ci = a + bb + c + d > 2;
    switch (code) { case 1: case 14: segs.push([L(), T()]); break; case 2: case 13: segs.push([T(), R()]); break; case 3: case 12: segs.push([L(), R()]); break; case 4: case 11: segs.push([R(), B()]); break; case 6: case 9: segs.push([T(), B()]); break; case 7: case 8: segs.push([L(), B()]); break;
      case 5: if (ci) { segs.push([T(), R()]); segs.push([L(), B()]); } else { segs.push([L(), T()]); segs.push([R(), B()]); } break;
      case 10: if (ci) { segs.push([L(), T()]); segs.push([R(), B()]); } else { segs.push([T(), R()]); segs.push([L(), B()]); } break; }
  }
  const adj = new Map(); segs.forEach(([p1, q1], s) => { (adj.get(p1) ?? adj.set(p1, []).get(p1)).push(s); (adj.get(q1) ?? adj.set(q1, []).get(q1)).push(s); });
  const used = new Uint8Array(segs.length), loops = [];
  for (let s0 = 0; s0 < segs.length; s0++) { if (used[s0]) continue; used[s0] = 1; const keys = [segs[s0][0], segs[s0][1]];
    for (;;) { const last = keys[keys.length - 1]; const nx = (adj.get(last) ?? []).find((s) => !used[s]); if (nx === undefined) break; used[nx] = 1; const [p1, q1] = segs[nx]; keys.push(p1 === last ? q1 : p1); }
    if (keys.length > 12) loops.push(keys.map((k) => pos.get(k))); }
  const area = (l) => { let s = 0; for (let i = 0; i < l.length; i++) { const q = l[(i + 1) % l.length]; s += l[i][0] * q[1] - q[0] * l[i][1]; } return Math.abs(s / 2); };
  loops.sort((x, y) => area(y) - area(x)); return loops[0];
}

// ---- máscara «de color» = agua, baldosas y fondo de las piletas
const colored = new Uint8Array(W * H);
for (let i = 0; i < W * H; i++) { const r = rgba[i * 4], g = rgba[i * 4 + 1], bl = rgba[i * 4 + 2]; const mx = Math.max(r, g, bl), mn = Math.min(r, g, bl);
  colored[i] = r >= g - 1 && g >= bl - 2 && mx - mn < 40 && mx > 205 ? 0 : 1; }
const clean = open(colored, 2); // corta conexiones finas
const seeds = { casa: [200, 100], trabajo: [480, 120], salud: [250, 260], vida: [520, 310] };
const pools = {};
for (const [k, [sx, sy]] of Object.entries(seeds)) {
  let m = component(clean, sx, sy);
  m = fillHoles(close(m, 12)); // tapa plantas, flotador y escalera
  pools[k] = m;
  console.log(k, "área px:", m.reduce((a, v) => a + v, 0));
}
// ---- contorno exterior: unión de piletas, cerrada sobre las paredes y engrosada por el borde
const union = new Uint8Array(W * H); for (const m of Object.values(pools)) for (let k = 0; k < m.length; k++) if (m[k]) union[k] = 1;
const WALLPX = Number(process.env.WALLPX ?? 30), RIMPX = Number(process.env.RIMPX ?? 16);
const outline = fillHoles(dilate(close(union, WALLPX / 2 + 4), RIMPX));
const toLoop = (m, s) => { const f = blur(Float64Array.from(m), s); return contour(f); };
const res = { W, H, X0, Y0, outline: toLoop(outline, 3), pools: Object.fromEntries(Object.entries(pools).map(([k, m]) => [k, toLoop(m, 2.5)])) };
fs.writeFileSync(`${S}/traced.json`, JSON.stringify(res));
// ---- imagen de control
const colors = { casa: "#9b87e8", trabajo: "#6db3ee", salud: "#5cc9a0", vida: "#ee86a8" };
const path = (l) => "M" + l.map((q) => q[0].toFixed(1) + " " + q[1].toFixed(1)).join(" L") + "Z";
fs.writeFileSync(`${S}/trace.svg`, `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" style="background:#fcf8f2"><path d="${path(res.outline)}" fill="#f1e6d3" stroke="#b9a98f" stroke-width="2"/>${Object.entries(res.pools).map(([k, l]) => `<path d="${path(l)}" fill="${colors[k]}"/>`).join("")}</svg>`);
console.log("contornos:", res.outline.length, Object.fromEntries(Object.entries(res.pools).map(([k, l]) => [k, l.length])));
