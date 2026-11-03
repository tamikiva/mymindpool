/**
 * Escena 3D procedural del cerebro-pileta (solo navegador; usa three.js).
 *
 * Todo se genera por código a partir de las áreas: el borde cerámico con volumen, las paredes
 * interiores, el piso con baldosas, el agua translúcida y los adornos. Nada es una imagen fija:
 * el nivel del agua de cada pileta sale de los datos y se anima hacia su nuevo valor.
 */
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { pointInPolygon } from "../brain/geometry";
import { BASE_H, BEVEL, DEPTH, FOV, LABEL_MAX_FONT, LABEL_MIN_FONT, LABEL_SCALE, OCCLUSION, TILT, TOTAL_H } from "./constants";
import { placeLabelRotated } from "./labelPlacement";
import { buildBrainLayout, polygonArea, visibleFloor, type BrainLayout, type Pt } from "./layout";

export interface SceneArea {
  id: string;
  name: string;
  fill: string;
  deep: string;
  /** Carga pendiente 0..1 (ya calculada por el dominio). */
  level: number;
}

const MAX_WATER = TOTAL_H * 0.88;
const CREAM = "#F4EBDC";

/** Oscurece la parte baja de una malla (sombra de contacto simple): color de vértice según la altura. */
function shade(g: THREE.BufferGeometry, bottom: number, top: number): void {
  g.computeBoundingBox();
  const bb = g.boundingBox!;
  const pos = g.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let k = 0; k < pos.count; k++) {
    const t = (pos.getY(k) - bb.min.y) / Math.max(1e-6, bb.max.y - bb.min.y);
    const v = bottom + (top - bottom) * t;
    colors.set([v, v, v], k * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

const mix = (a: string, b: string, t: number) => new THREE.Color(a).lerp(new THREE.Color(b), t);

const toShape = (poly: readonly Pt[]) => {
  const s = new THREE.Shape();
  poly.forEach((p, i) => (i ? s.lineTo(p.x, -p.y) : s.moveTo(p.x, -p.y)));
  s.closePath();
  return s;
};
const toPath = (poly: readonly Pt[]) => {
  const s = new THREE.Path();
  poly.forEach((p, i) => (i ? s.lineTo(p.x, -p.y) : s.moveTo(p.x, -p.y)));
  s.closePath();
  return s;
};

/** Desplaza el polígono hacia afuera (d > 0) o hacia adentro (d < 0). */
export function offsetPolygon(poly: readonly Pt[], d: number): Pt[] {
  const ccw = polygonArea(poly) > 0;
  return poly.map((p, i) => {
    const a = poly[(i + poly.length - 1) % poly.length];
    const b = poly[(i + 1) % poly.length];
    let tx = b.x - a.x;
    let ty = b.y - a.y;
    const len = Math.hypot(tx, ty) || 1;
    tx /= len;
    ty /= len;
    const [nx, ny] = ccw ? [ty, -tx] : [-ty, tx];
    return { x: p.x + nx * d, y: p.y + ny * d };
  });
}

const canvasOf = (w: number, h: number) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
};

function tileTexture(): THREE.CanvasTexture {
  const c = canvasOf(256, 256);
  const g = c.getContext("2d")!;
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      const v = 246 + ((i * 7 + j * 13) % 9);
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(i * 64 + 2, j * 64 + 2, 60, 60);
    }
  }
  g.strokeStyle = "rgba(60,40,90,0.16)";
  g.lineWidth = 3;
  for (let k = 0; k <= 256; k += 64) {
    g.beginPath(); g.moveTo(k, 0); g.lineTo(k, 256); g.stroke();
    g.beginPath(); g.moveTo(0, k); g.lineTo(256, k); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.repeat.set(1 / 1.0, 1 / 1.0);
  return t;
}

/** Red de luz del fondo de una pileta: líneas finas y brillantes que se desplazan. Repite sin costuras. */
function causticTexture(): THREE.CanvasTexture {
  const n = 256;
  const c = canvasOf(n, n);
  const g = c.getContext("2d")!;
  const img = g.createImageData(n, n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const a = Math.abs(Math.sin(2 * Math.PI * (x / n * 3 + 0.35 * Math.sin(2 * Math.PI * (y / n * 2)))));
      const b = Math.abs(Math.sin(2 * Math.PI * (y / n * 3 + 0.35 * Math.sin(2 * Math.PI * (x / n * 2) + 1.3))));
      const v = Math.pow(1 - a * b, 9);
      const k = Math.min(255, Math.round(v * 255 * 1.2));
      const o = (y * n + x) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = k;
      img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(0.38, 0.38);
  return t;
}

/** Mapa de normales para las ondas de la superficie (altura = suma de senos de frecuencia entera). */
function rippleNormalTexture(): THREE.CanvasTexture {
  const n = 128;
  const h = (x: number, y: number) =>
    Math.sin(2 * Math.PI * (2 * x / n) + 1.1 * Math.sin(2 * Math.PI * (3 * y / n))) +
    0.6 * Math.sin(2 * Math.PI * (4 * y / n + 3 * x / n)) +
    0.35 * Math.sin(2 * Math.PI * (7 * x / n - 5 * y / n));
  const c = canvasOf(n, n);
  const g = c.getContext("2d")!;
  const img = g.createImageData(n, n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = h((x + 1) % n, y) - h((x - 1 + n) % n, y);
      const dy = h(x, (y + 1) % n) - h(x, (y - 1 + n) % n);
      const len = Math.hypot(dx * 0.6, dy * 0.6, 1);
      const o = (y * n + x) * 4;
      img.data[o] = Math.round((0.5 - (dx * 0.6) / len / 2) * 255);
      img.data[o + 1] = Math.round((0.5 - (dy * 0.6) / len / 2) * 255);
      img.data[o + 2] = Math.round((0.5 + 1 / len / 2) * 255);
      img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(0.35, 0.35);
  return t;
}

/** Sombra suave bajo el cerebro: varias siluetas apiladas, sin depender de `ctx.filter` (Safari). */
function shadowTexture(outline: readonly Pt[], b: BrainLayout["bounds"]): { tex: THREE.CanvasTexture; w: number; h: number; cx: number; cy: number } {
  const pad = 1.1;
  const w = b.maxX - b.minX + pad * 2;
  const h = b.maxY - b.minY + pad * 2;
  const px = 70;
  const c = canvasOf(Math.round(w * px), Math.round(h * px));
  const g = c.getContext("2d")!;
  const steps = 18;
  for (let k = steps; k >= 0; k--) {
    const poly = offsetPolygon(outline, (k / steps) * 0.62 - 0.1);
    g.beginPath();
    poly.forEach((p, i) => {
      const x = (p.x - b.minX + pad) * px;
      const y = (p.y - b.minY + pad) * px;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    });
    g.closePath();
    g.fillStyle = "rgba(80,52,110,0.028)";
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return { tex, w, h, cx: (b.minX + b.maxX) / 2, cy: (b.minY + b.maxY) / 2 };
}

/** Tira plana entre dos contornos con el mismo número de puntos (sin triangular áreas: evita rellenos erróneos en esquinas cerradas). */
function stripGeometry(a: readonly Pt[], b: readonly Pt[]): THREE.BufferGeometry {
  const n = a.length;
  const pos: number[] = [];
  for (let i = 0; i < n; i++) pos.push(a[i].x, 0, a[i].y, b[i].x, 0, b[i].y);
  const idx: number[] = [];
  for (let i = 0; i < n; i++) {
    const p = i * 2;
    const q = ((i + 1) % n) * 2;
    idx.push(p, q, p + 1, p + 1, q, q + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

/** Tira de pared interior (sin tapas): UV en unidades de azulejo, color de vértice más oscuro abajo. */
function linerGeometry(poly: readonly Pt[], height: number, tint: THREE.Color, floorShade: number): THREE.BufferGeometry {
  const n = poly.length;
  const pos: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  let run = 0;
  for (let i = 0; i <= n; i++) {
    const p = poly[i % n];
    if (i > 0) run += Math.hypot(p.x - poly[i - 1].x, p.y - poly[i - 1].y);
    for (const y of [0, height]) {
      pos.push(p.x, y, p.y);
      uv.push(run / 0.9, y / 0.9);
      const k = floorShade + (1 - floorShade) * Math.pow(y / height, 0.8);
      col.push(tint.r * k, tint.g * k, tint.b * k);
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = i * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Piso de una pileta: baldosas más oscurecimiento progresivo hacia el borde, dibujado en un lienzo propio. */
function floorTexture(poly: readonly Pt[], geo: THREE.BufferGeometry, tint: THREE.Color): THREE.CanvasTexture {
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  const x0 = Math.min(...xs) - 0.1;
  const y0 = Math.min(...ys) - 0.1;
  const w = Math.max(...xs) + 0.1 - x0;
  const h = Math.max(...ys) + 0.1 - y0;
  const ppu = 90;
  const c = canvasOf(Math.ceil(w * ppu), Math.ceil(h * ppu));
  const g = c.getContext("2d")!;
  const trace = (pts: readonly Pt[]) => {
    g.beginPath();
    pts.forEach((p, i) => (i ? g.lineTo((p.x - x0) * ppu, (p.y - y0) * ppu) : g.moveTo((p.x - x0) * ppu, (p.y - y0) * ppu)));
    g.closePath();
  };
  const base = `rgb(${Math.round(tint.r * 255)},${Math.round(tint.g * 255)},${Math.round(tint.b * 255)})`;
  g.fillStyle = base;
  trace(poly);
  g.fill();
  // Baldosas.
  g.save();
  trace(poly);
  g.clip();
  g.strokeStyle = "rgba(40,30,70,0.17)";
  g.lineWidth = 1.5;
  const step = 0.3 * ppu;
  for (let x = 0; x < c.width; x += step) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, c.height); g.stroke(); }
  for (let y = 0; y < c.height; y += step) { g.beginPath(); g.moveTo(0, y); g.lineTo(c.width, y); g.stroke(); }
  g.restore();
  // Oclusión ambiental: una capa oscura en todo el piso a la que se le «borra» el centro de a poco,
  // de modo que el borde queda oscuro y el interior claro (degradado suave).
  const ao = canvasOf(c.width, c.height);
  const a = ao.getContext("2d")!;
  const traceOn = (ctx: CanvasRenderingContext2D, pts: readonly Pt[]) => {
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo((p.x - x0) * ppu, (p.y - y0) * ppu) : ctx.moveTo((p.x - x0) * ppu, (p.y - y0) * ppu)));
    ctx.closePath();
  };
  a.fillStyle = "rgba(35,22,60,0.62)";
  traceOn(a, poly);
  a.fill();
  a.globalCompositeOperation = "destination-out";
  const steps = 18;
  for (let k = 1; k <= steps; k++) {
    a.fillStyle = "rgba(0,0,0,0.17)";
    traceOn(a, offsetPolygon(poly, -k * 0.06));
    a.fill();
  }
  g.drawImage(ao, 0, 0);
  // UV normalizadas al lienzo.
  const pos = geo.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let k = 0; k < pos.count; k++) {
    uv[k * 2] = (pos.getX(k) - x0) / w;
    uv[k * 2 + 1] = 1 - (pos.getZ(k) - y0) / h;
  }
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function labelTexture(lines: string[], fontWorld: number, deep: string, wWorld: number, hWorld: number): THREE.CanvasTexture {
  const ppu = 150;
  const c = canvasOf(Math.max(8, Math.ceil(wWorld * ppu)), Math.max(8, Math.ceil(hWorld * ppu)));
  const g = c.getContext("2d")!;
  const px = fontWorld * ppu;
  g.font = `800 ${px}px Nunito, system-ui, -apple-system, "Segoe UI", sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = deep;
  g.shadowColor = "rgba(255,255,255,0.55)";
  g.shadowBlur = px * 0.18;
  const lineH = px * 1.1;
  lines.forEach((l, i) => g.fillText(l, c.width / 2, c.height / 2 + (i - (lines.length - 1) / 2) * lineH));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

interface Pool {
  id: string;
  name: string;
  poly: Pt[];
  group: THREE.Group;
  water: THREE.Mesh;
  surface: THREE.Mesh;
  waterline: THREE.Mesh;
  caustics: THREE.Mesh;
  label: THREE.Mesh;
  /** Copia del nombre sobre la superficie: mantiene el contraste cuando el agua está alta. */
  labelTop: THREE.Mesh;
  hit: THREE.Mesh;
  ring: THREE.Mesh;
  deep: string;
  floating?: THREE.Object3D;
  current: number;
  target: number;
}

export class BrainScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 200);
  private readonly raycaster = new THREE.Raycaster();
  private readonly caustic = causticTexture();
  private readonly ripple = rippleNormalTexture();
  private readonly tiles = tileTexture();
  private root = new THREE.Group();
  private layout: BrainLayout | null = null;
  private pools: Pool[] = [];
  private areas: SceneArea[] = [];
  private selected: string | null = null;
  private reduce = false;
  private active = true;
  private raf = 0;
  private last = 0;
  private dirty = true;
  private width = 1;
  private height = 1;
  private disposed = false;
  /** Los nombres se ubican de a una pileta por vez, cediendo el control entre cada una. */
  private gen = 0;
  private queue: { pool: Pool; area: SceneArea }[] = [];
  private draining = false;
  private propsAdded = false;
  private idleClock = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xe3d3bf, 0.32));
    // Luz principal baja y desde atrás a la izquierda: las paredes proyectan sombra hacia adentro de las piletas.
    const key = new THREE.DirectionalLight(0xfff3e2, 2.3);
    key.position.set(-6.5, 8.5, -3.5);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    const sc = key.shadow.camera;
    sc.left = -9; sc.right = 9; sc.top = 9; sc.bottom = -9; sc.near = 1; sc.far = 30;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.03;
    this.scene.add(key);
    this.scene.add(key.target);
    const fill = new THREE.DirectionalLight(0xe9eeff, 0.45);
    fill.position.set(5, 6, 8);
    this.scene.add(fill);
    this.scene.add(this.root);
  }

  // ---------- API pública ----------

  setAreas(areas: readonly SceneArea[]): void {
    const sameShape = this.areas.length === areas.length && this.areas.every((a, i) => a.id === areas[i].id && a.fill === areas[i].fill);
    this.areas = areas.map((a) => ({ ...a }));
    if (!sameShape || !this.layout) {
      this.rebuild();
    } else {
      this.pools.forEach((p, i) => {
        p.target = clamp01(areas[i].level);
        if (p.name !== areas[i].name || p.deep !== areas[i].deep) this.enqueueLabel(p, areas[i]);
      });
    }
    this.requestRender();
  }

  setSelected(id: string | null): void {
    this.selected = id;
    this.pools.forEach((p) => (p.ring.visible = p.id === id));
    this.requestRender();
  }

  setReduceMotion(v: boolean): void {
    this.reduce = v;
    if (v) this.pools.forEach((p) => { p.current = p.target; this.applyLevel(p); });
    this.requestRender();
  }

  /** Pausa el dibujo cuando no se ve (fuera de pantalla o pestaña en segundo plano). */
  setActive(v: boolean): void {
    this.active = v;
    if (v) this.requestRender();
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, Math.round(width));
    this.height = Math.max(1, Math.round(height));
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;
    this.fit();
    this.requestRender();
  }

  /** Devuelve el id de la pileta bajo un punto de pantalla, o null. */
  pick(clientX: number, clientY: number): string | null {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -(((clientY - r.top) / r.height) * 2 - 1));
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObjects(this.pools.map((p) => p.hit), false)[0];
    return hit ? (hit.object.userData.poolId as string) : null;
  }

  /** Relación alto/ancho que encuadra la escena con la cámara real (perspectiva, inclinada). */
  static aspectFor(count: number): number {
    const b = buildBrainLayout(count).bounds;
    const cam = new THREE.PerspectiveCamera(FOV, 1, 0.1, 400);
    const target = new THREE.Vector3((b.minX + b.maxX) / 2, 0.1, (b.minY + b.maxY) / 2 + 0.15);
    cam.position.copy(target).add(new THREE.Vector3(0, Math.sin(TILT), Math.cos(TILT)).multiplyScalar(40));
    cam.lookAt(target);
    cam.updateMatrixWorld(true);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [x, y, z] of frameCorners(b)) {
      const p = new THREE.Vector3(x, y, z).project(cam);
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
    return ((maxY - minY) / (maxX - minX)) * 1.03;
  }

  dispose(): void {
    this.disposed = true;
    this.gen++;
    cancelAnimationFrame(this.raf);
    this.clearRoot();
    [this.caustic, this.ripple, this.tiles].forEach((t) => t.dispose());
    this.scene.environment?.dispose();
    this.renderer.dispose();
  }

  // ---------- construcción ----------

  private clearRoot(): void {
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      const list = Array.isArray(mat) ? mat : mat ? [mat] : [];
      list.forEach((x) => {
        const mm = x as THREE.MeshBasicMaterial;
        if (mm.map && mm.map !== this.tiles && mm.map !== this.caustic && mm.map !== this.ripple) mm.map.dispose();
        x.dispose();
      });
    });
    this.scene.remove(this.root);
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.pools = [];
  }

  private rebuild(): void {
    this.gen++;
    this.queue = [];
    this.draining = false;
    this.propsAdded = false;
    delete this.canvas.dataset.ready;
    this.clearRoot();
    const layout = buildBrainLayout(this.areas.length);
    this.layout = layout;
    const root = this.root;

    // Sombra suave en el piso.
    const sh = shadowTexture(layout.outline, layout.bounds);
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(sh.w, sh.h).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: sh.tex, transparent: true, depthWrite: false, toneMapped: false }),
    );
    shadow.position.set(sh.cx + 0.3, -BASE_H - 0.02, sh.cy + 0.38);
    shadow.renderOrder = -1;
    root.add(shadow);

    const ceramic = new THREE.MeshPhysicalMaterial({
      color: CREAM, roughness: 0.4, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.25, envMapIntensity: 0.55, vertexColors: true,
    });

    // Base: toda la silueta, de BASE_H de espesor, con el piso de las piletas arriba (y = 0).
    const slab = new THREE.Mesh(
      new THREE.ExtrudeGeometry(toShape(layout.outline), { depth: BASE_H, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelOffset: -0.06, bevelSegments: 4, curveSegments: 1 }).rotateX(-Math.PI / 2),
      ceramic,
    );
    slab.position.y = -(BASE_H + 0.06); // la cara superior queda en y = 0
    shade(slab.geometry, 0.62, 0.9);
    slab.castShadow = true;
    slab.receiveShadow = true;
    root.add(slab);

    // Pared (borde): la silueta con un hueco por pileta, con el borde superior redondeado.
    const rimShape = toShape(layout.outline);
    layout.pools.forEach((p) => rimShape.holes.push(toPath(p.poly)));
    const rim = new THREE.Mesh(
      new THREE.ExtrudeGeometry(rimShape, { depth: DEPTH, bevelEnabled: true, bevelThickness: BEVEL, bevelSize: BEVEL, bevelOffset: -BEVEL, bevelSegments: 6, curveSegments: 1 }).rotateX(-Math.PI / 2),
      ceramic,
    );
    rim.position.y = BEVEL;
    shade(rim.geometry, 0.8, 1.0);
    rim.castShadow = true;
    rim.receiveShadow = true;
    root.add(rim);

    this.areas.forEach((area, i) => this.buildPool(layout, i, area));
    this.fit();
  }

  private buildPool(layout: BrainLayout, i: number, area: SceneArea): void {
    const poly = layout.pools[i].poly;
    const group = new THREE.Group();
    this.root.add(group);
    const tint = mix(area.fill, "#ffffff", 0.08);

    // Paredes interiores con azulejos: una tira de caras por cada tramo del contorno, más oscura abajo
    // (rincón del fondo) y más clara arriba. Se ven desde adentro de la pileta.
    const liner = new THREE.Mesh(
      linerGeometry(offsetPolygon(poly, 0.004), TOTAL_H, mix(area.fill, "#ffffff", 0.66), 0.62),
      new THREE.MeshStandardMaterial({ map: this.tiles, vertexColors: true, side: THREE.DoubleSide, roughness: 0.45, envMapIntensity: 0.4 }),
    );
    liner.receiveShadow = true;
    group.add(liner);

    // Piso: baldosas y oscurecimiento hacia los bordes (oclusión ambiental dibujada).
    const floorGeo = new THREE.ShapeGeometry(toShape(poly), 1).rotateX(-Math.PI / 2);
    const fl = floorTexture(poly, floorGeo, mix(area.fill, "#ffffff", 0.7));
    const floor = new THREE.Mesh(floorGeo, new THREE.MeshStandardMaterial({ map: fl, roughness: 0.5, envMapIntensity: 0.35 }));
    floor.position.y = 0.004;
    floor.receiveShadow = true;
    group.add(floor);

    // Red de luz sobre el piso (solo con agua).
    const caustics = new THREE.Mesh(
      new THREE.ShapeGeometry(toShape(poly), 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: this.caustic, color: 0xffffff, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.32, depthWrite: false, toneMapped: false }),
    );
    caustics.position.y = 0.008;
    caustics.renderOrder = 1;
    group.add(caustics);

    // Nombre en el fondo, visible a través del agua.
    const label = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false }));
    label.position.y = 0.012;
    label.renderOrder = 2;
    group.add(label);
    const labelTop = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false, opacity: 0 }));
    labelTop.renderOrder = 5;
    group.add(labelTop);

    // Agua: volumen (de piso a superficie) escalado en altura, más una hoja con ondas arriba.
    const inset = offsetPolygon(poly, -0.012);
    const waterMat = new THREE.MeshPhysicalMaterial({
      color: mix(area.fill, area.deep, 0.55), transparent: true, opacity: 0.5, roughness: 0.08, metalness: 0,
      clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 0.7, depthWrite: false, side: THREE.DoubleSide,
      normalMap: this.ripple, normalScale: new THREE.Vector2(0.18, 0.18),
    });
    const water = new THREE.Mesh(new THREE.ExtrudeGeometry(toShape(inset), { depth: 1, bevelEnabled: false, curveSegments: 1 }).rotateX(-Math.PI / 2), waterMat);
    water.renderOrder = 3;
    group.add(water);
    const surface = new THREE.Mesh(
      new THREE.ShapeGeometry(toShape(inset), 1).rotateX(-Math.PI / 2),
      new THREE.MeshPhysicalMaterial({ color: mix(area.fill, "#ffffff", 0.15), transparent: true, opacity: 0.14, roughness: 0.04, clearcoat: 1, envMapIntensity: 1.5, depthWrite: false, normalMap: this.ripple, normalScale: new THREE.Vector2(0.35, 0.35) }),
    );
    surface.renderOrder = 4;
    group.add(surface);
    // Línea de flotación: un fino borde claro donde el agua toca la pared; hace visible el nivel.
    const waterline = new THREE.Mesh(
      stripGeometry(inset, offsetPolygon(inset, -0.07)),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }),
    );
    waterline.renderOrder = 6;
    group.add(waterline);

    // Zona de toque.
    const hit = new THREE.Mesh(new THREE.ShapeGeometry(toShape(poly), 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = TOTAL_H * 0.5;
    hit.userData.poolId = area.id;
    group.add(hit);

    // Contorno de selección sobre la cara plana del borde.
    const ringShape = toShape(offsetPolygon(poly, BEVEL + 0.06));
    ringShape.holes.push(toPath(offsetPolygon(poly, BEVEL + 0.025)));
    const ring = new THREE.Mesh(new THREE.ShapeGeometry(ringShape, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x8a70d4, toneMapped: false }));
    ring.position.y = TOTAL_H + BEVEL * 0.02 + 0.004;
    ring.visible = area.id === this.selected;
    group.add(ring);

    const pool: Pool = { id: area.id, name: "", deep: "", poly, group, water, surface, waterline, caustics, label, labelTop, hit, ring, current: this.reduce ? clamp01(area.level) : 0, target: clamp01(area.level) };
    this.pools.push(pool);
    this.enqueueLabel(pool, area);
    this.applyLevel(pool);
  }

  private enqueueLabel(pool: Pool, area: SceneArea): void {
    this.queue = this.queue.filter((j) => j.pool !== pool);
    this.queue.push({ pool, area });
    if (this.draining) return;
    this.draining = true;
    const gen = this.gen;
    const step = () => {
      if (this.disposed || gen !== this.gen) return;
      const job = this.queue.shift();
      if (!job) {
        this.draining = false;
        // Con todos los nombres ubicados se apoyan los adornos, lejos de ellos.
        if (!this.propsAdded && this.layout) {
          this.propsAdded = true;
          this.addProps(this.layout);
          this.canvas.dataset.ready = "1";
          this.requestRender();
        }
        return;
      }
      this.updateLabel(job.pool, job.area);
      this.requestRender();
      setTimeout(step, 0);
    };
    setTimeout(step, 0);
  }

  private updateLabel(pool: Pool, area: SceneArea): void {
    pool.name = area.name;
    pool.deep = area.deep;
    // Solo se usa la parte del piso que se ve (la pared cercana tapa una franja).
    const scaled = visibleFloor(pool.poly, OCCLUSION).map((p) => ({ x: p.x * LABEL_SCALE, y: p.y * LABEL_SCALE }));
    const { label, cx, cy, angle } = placeLabelRotated(scaled, area.name, LABEL_MAX_FONT, undefined, LABEL_MIN_FONT);
    const fontW = label.fontSize / LABEL_SCALE;
    const maxChars = Math.max(...label.lines.map((l) => l.length), 1);
    const w = maxChars * fontW * 0.62 * 1.1 + 0.1;
    const h = label.lines.length * fontW * 1.1 + 0.1;
    const mat = pool.label.material as THREE.MeshBasicMaterial;
    mat.map?.dispose();
    mat.map = labelTexture(label.lines, fontW, mix(area.deep, "#1b1030", 0.25).getStyle(), w, h);
    mat.needsUpdate = true;
    pool.label.geometry.dispose();
    pool.label.geometry = new THREE.PlaneGeometry(w, h).rotateX(-Math.PI / 2);
    pool.label.position.set(cx / LABEL_SCALE, 0.012, cy / LABEL_SCALE);
    // En el plano del piso (x, z = y del dibujo) girar «angle» hacia abajo equivale a rotar -angle sobre y.
    pool.label.rotation.y = -angle;
    pool.label.userData.center = { x: cx / LABEL_SCALE, y: cy / LABEL_SCALE, w, h };
    const top = pool.labelTop.material as THREE.MeshBasicMaterial;
    top.map = mat.map;
    top.needsUpdate = true;
    pool.labelTop.geometry.dispose();
    pool.labelTop.geometry = new THREE.PlaneGeometry(w, h).rotateX(-Math.PI / 2);
    pool.labelTop.position.set(cx / LABEL_SCALE, 0.02, cy / LABEL_SCALE);
    pool.labelTop.rotation.y = -angle;
    pool.labelTop.userData.baseZ = cy / LABEL_SCALE;
  }

  /** Altura del agua, opacidad según profundidad y visibilidad del brillo del fondo. */
  private applyLevel(p: Pool): void {
    const h = p.current * MAX_WATER;
    const has = p.current > 0.004;
    p.water.visible = has;
    p.surface.visible = has;
    p.waterline.visible = has;
    p.waterline.position.y = h + 0.006;
    p.caustics.visible = has;
    p.water.scale.y = Math.max(h, 1e-4);
    p.surface.position.y = h + 0.003;
    p.labelTop.position.y = h + 0.012;
    // Más alto y más cerca de la cámara: así se proyecta justo sobre el nombre del fondo (sin verse doble).
    p.labelTop.position.z = ((p.labelTop.userData.baseZ as number | undefined) ?? 0) + h / Math.tan(TILT);
    (p.labelTop.material as THREE.MeshBasicMaterial).opacity = has ? 0.82 * Math.min(1, Math.max(0, (p.current - 0.15) / 0.5)) : 0;
    (p.water.material as THREE.MeshPhysicalMaterial).opacity = 0.14 + 0.72 * p.current;
    // Las cáusticas y la hoja de ondas solo existen con agua: casi sin agua, el fondo se ve limpio.
    const wet = Math.min(1, Math.max(0, (p.current - 0.04) / 0.3));
    (p.caustics.material as THREE.MeshBasicMaterial).opacity = 0.34 * wet;
    (p.surface.material as THREE.MeshPhysicalMaterial).opacity = 0.14 * wet;
    if (p.floating) p.floating.position.y = h + 0.02;
  }

  // ---------- adornos ----------

  private addProps(layout: BrainLayout): void {
    const glossy = (color: number) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.2 });

    // Flotadores en algunas piletas, lejos del nombre.
    this.pools.forEach((pool, i) => {
      if (i % 3 !== 0 || layout.pools[i].area < 4) return;
      const spot = this.freeSpot(pool, 0.55);
      if (!spot) return;
      const ring = new THREE.Group();
      const body = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.12, 14, 36).rotateX(Math.PI / 2), glossy(0xfff4f1));
      const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.125, 14, 36, Math.PI / 2).rotateX(Math.PI / 2), glossy(0xf4a6c0));
      const stripe2 = stripe.clone();
      stripe2.rotation.y = Math.PI;
      ring.add(body, stripe, stripe2);
      ring.position.set(spot.x, 0, spot.y);
      this.root.add(ring);
      pool.floating = ring;
      this.applyLevel(pool);
    });

    // Escalera en el borde trasero de una pileta.
    const ladderPool = this.pools.find((_, i) => i % 4 === 1 && layout.pools[i].area >= 4);
    if (ladderPool) {
      const back = ladderPool.poly.reduce((m, p) => (p.y < m.y ? p : m), ladderPool.poly[0]);
      const steel = new THREE.MeshStandardMaterial({ color: 0xe9eef2, metalness: 0.85, roughness: 0.22, envMapIntensity: 1.2 });
      const g = new THREE.Group();
      for (const dx of [-0.2, 0.2]) {
        const curve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(dx, 0.05, 0.55),
          new THREE.Vector3(dx, TOTAL_H + 0.45, 0.1),
          new THREE.Vector3(dx, TOTAL_H + 0.38, -0.12),
          new THREE.Vector3(dx, 0.12, -0.5),
        ]);
        g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.028, 8), steel));
      }
      for (const t of [0.12, 0.3, 0.48]) {
        const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 8).rotateZ(Math.PI / 2), steel);
        rung.position.set(0, TOTAL_H * (1 - t) - 0.05, -0.12 - t * 0.9 + 0.4);
        g.add(rung);
      }
      g.position.set(back.x, 0, back.y + 0.3);
      this.root.add(g);
    }

    // Plantas sobre el borde, donde la pared tiene espacio.
    const leaf = new THREE.MeshStandardMaterial({ color: 0x5fb98a, roughness: 0.55, side: THREE.DoubleSide });
    const leaf2 = new THREE.MeshStandardMaterial({ color: 0x3f9a6e, roughness: 0.55, side: THREE.DoubleSide });
    // Solo en el borde trasero: así ningún adorno tapa una pileta.
    const midY = (layout.bounds.minY + layout.bounds.maxY) / 2;
    layout.rimSpots.filter((r) => r.y < midY).slice(0, 3).forEach((s, i) => {
      const g = new THREE.Group();
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.22, 16), new THREE.MeshStandardMaterial({ color: 0xf2e7d5, roughness: 0.5 }));
      pot.position.y = 0.11;
      g.add(pot);
      for (let k = 0; k < 7; k++) {
        const l = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.62, 5, 1).translate(0, 0.31, 0), k % 2 ? leaf : leaf2);
        const a = (k / 7) * Math.PI * 2 + i;
        l.rotation.set(0.55 * Math.cos(a), 0, -0.55 * Math.sin(a));
        l.scale.set(1, 1, 0.45);
        l.position.y = 0.2;
        g.add(l);
      }
      g.position.set(s.x, TOTAL_H, s.y);
      this.root.add(g);
    });
  }

  /** Punto de la pileta lo más lejos posible del nombre, con holgura al borde. */
  private freeSpot(pool: Pool, clearance: number): Pt | null {
    const c = pool.label.userData.center as { x: number; y: number; w: number; h: number } | undefined;
    const xs = pool.poly.map((p) => p.x);
    const ys = pool.poly.map((p) => p.y);
    let best: { p: Pt; score: number } | null = null;
    for (let x = Math.min(...xs); x <= Math.max(...xs); x += 0.2) {
      for (let y = Math.min(...ys); y <= Math.max(...ys); y += 0.2) {
        const p = { x, y };
        if (!pointInPolygon(p, pool.poly)) continue;
        const edge = Math.min(...pool.poly.map((q) => Math.hypot(q.x - x, q.y - y)));
        if (edge < clearance) continue;
        const away = c ? Math.hypot((x - c.x) / (c.w / 2 + 0.5), (y - c.y) / (c.h / 2 + 0.5)) : 1;
        if (away < 1.1) continue;
        const score = edge + away;
        if (!best || score > best.score) best = { p, score };
      }
    }
    return best?.p ?? null;
  }

  // ---------- cámara y dibujo ----------

  private fit(): void {
    if (!this.layout) return;
    const b = this.layout.bounds;
    const tilt = TILT;
    const target = new THREE.Vector3((b.minX + b.maxX) / 2, 0.1, (b.minY + b.maxY) / 2 + 0.15);
    const dir = new THREE.Vector3(0, Math.sin(tilt), Math.cos(tilt));
    const corners = frameCorners(b).map(([x, y, z]) => new THREE.Vector3(x, y, z));
    const fits = (d: number) => {
      this.camera.position.copy(target).addScaledVector(dir, d);
      this.camera.lookAt(target);
      this.camera.updateProjectionMatrix();
      this.camera.updateMatrixWorld(true);
      return corners.every((c) => {
        const p = c.clone().project(this.camera);
        return Math.abs(p.x) <= 0.99 && Math.abs(p.y) <= 0.985;
      });
    };
    let lo = 6;
    let hi = 90;
    for (let k = 0; k < 24; k++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) hi = mid;
      else lo = mid;
    }
    fits(hi);
  }

  private requestRender(): void {
    this.dirty = true;
    if (!this.raf && !this.disposed) this.raf = requestAnimationFrame(this.frame);
  }

  private readonly frame = (now: number): void => {
    this.raf = 0;
    if (this.disposed) return;
    const dt = Math.min(0.1, this.last ? (now - this.last) / 1000 : 0.016);
    this.last = now;
    let moving = false;
    let levelsChanged = false;
    for (const p of this.pools) {
      const d = p.target - p.current;
      if (Math.abs(d) > 0.0004) {
        p.current = this.reduce ? p.target : p.current + d * (1 - Math.exp(-dt * 7));
        this.applyLevel(p);
        moving = true;
        levelsChanged = true;
        this.dirty = true;
      } else if (p.current !== p.target) {
        p.current = p.target;
        this.applyLevel(p);
        levelsChanged = true;
        this.dirty = true;
      }
    }
    // Ondas y brillos del fondo: avanzan con el tiempo real pero se dibujan ~20 veces por segundo
    // (no hace falta más y se cuida la batería).
    const idle = !this.reduce && this.active && this.pools.length > 0;
    this.idleClock += dt;
    if (idle && this.idleClock >= 0.05) {
      const t = this.idleClock;
      this.idleClock = 0;
      this.caustic.offset.x = (this.caustic.offset.x + t * 0.022) % 1;
      this.caustic.offset.y = (this.caustic.offset.y + t * 0.014) % 1;
      this.ripple.offset.x = (this.ripple.offset.x + t * 0.012) % 1;
      this.ripple.offset.y = (this.ripple.offset.y - t * 0.009) % 1;
      this.dirty = true;
    }
    if (levelsChanged || !this.canvas.dataset.water) this.canvas.dataset.water = this.pools.map((p) => p.current.toFixed(3)).join(",");
    if (this.dirty && this.active) {
      this.renderer.render(this.scene, this.camera);
      this.dirty = false;
    }
    if (moving || idle) this.raf = requestAnimationFrame(this.frame);
  };

  /** Vuelve a dibujar los nombres (p. ej. cuando termina de cargar la tipografía). */
  refreshLabels(): void {
    this.areas.forEach((a, i) => this.pools[i] && this.updateLabel(this.pools[i], a));
    this.requestRender();
  }

  /** Fuerza un cuadro ya (útil para capturas y pruebas). */
  renderNow(): void {
    this.renderer.render(this.scene, this.camera);
  }

  /** Cantidad de cuadros distintos de agua observables: para pruebas de movimiento reducido. */
  levels(): number[] {
    return this.pools.map((p) => p.current);
  }
}

/** Puntos que deben quedar dentro del cuadro: el cerebro con sus adornos y su sombra. */
function frameCorners(b: BrainLayout["bounds"]): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (const x of [b.minX, b.maxX]) for (const z of [b.minY, b.maxY]) for (const y of [-BASE_H, TOTAL_H + 0.7]) out.push([x, y, z]);
  // Sombra: corrida hacia la derecha y adelante, con su difuminado.
  for (const x of [b.minX - 0.15, b.maxX + 0.7]) for (const z of [b.minY - 0.1, b.maxY + 0.75]) out.push([x, -BASE_H, z]);
  return out;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
