/**
 * Adornos de la escena 3D (three.js): escalera metálica, escalones interiores, macetas y flotadores.
 * Solo dibujan; dónde va cada uno lo decide `propsPlacement.ts` (que garantiza que entren completos).
 *
 * Convención de cada grupo: +y arriba, +x a lo largo de la pared, +z hacia afuera de la pileta
 * (hacia el borde). El grupo se gira con `rotation.y` para llevar +z a la normal de la pared.
 */
import * as THREE from "three";
import { TOTAL_H } from "./constants";
import { FLOAT, LADDER, POT, STEPS, type LadderSpot, type StepsSpot } from "./propsPlacement";

const glossy = (color: number, extra: Partial<THREE.MeshPhysicalMaterialParameters> = {}) =>
  new THREE.MeshPhysicalMaterial({ color, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.2, ...extra });

/** Números repetibles (sin Math.random): la misma escena se dibuja siempre igual. */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const shadowy = <T extends THREE.Object3D>(o: T): T => {
  o.traverse((m) => {
    if ((m as THREE.Mesh).isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  return o;
};

// ---------- escalera ----------

/**
 * Escalera de acero de piscina: dos rieles que bajan pegados a la pared interior, se curvan sobre el borde
 * como pasamanos y terminan en bridas apoyadas sobre la cara plana del borde. Peldaños bajo el pasamanos.
 */
export function buildLadder(spot: LadderSpot): THREE.Group {
  const steel = new THREE.MeshStandardMaterial({ color: 0xe9eef2, metalness: 0.9, roughness: 0.18, envMapIntensity: 1.5 });
  const g = new THREE.Group();
  const vIn = -0.12; // los rieles bajan a 12 cm de la pared
  const top = TOTAL_H;
  for (const x of [-LADDER.half, LADDER.half]) {
    const pts = [
      [vIn, 0.1], [vIn, top - 0.28], [vIn, top - 0.04], [vIn + 0.04, top + 0.16], [0.0, top + 0.3],
      [0.08, top + 0.35], [0.15, top + 0.26], [LADDER.flangeV, top + 0.07], [LADDER.flangeV, top + 0.012],
    ].map(([v, y]) => new THREE.Vector3(x, y, v));
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.4), 48, 0.036, 10), steel));
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), steel);
    foot.position.set(x, 0.1, vIn);
    g.add(foot);
    // brida: disco apoyado en el borde
    const flange = new THREE.Mesh(new THREE.CylinderGeometry(LADDER.flangeR, LADDER.flangeR * 1.06, 0.02, 20), steel);
    flange.position.set(x, top + 0.008, LADDER.flangeV);
    g.add(flange);
  }
  for (const y of [top - 0.2, top - 0.42, top - 0.64]) {
    const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, LADDER.half * 2, 10).rotateZ(Math.PI / 2), steel);
    rung.position.set(0, y, vIn);
    g.add(rung);
  }
  g.position.set(spot.p.x, 0, spot.p.y);
  g.rotation.y = spot.rotY;
  return shadowy(g);
}

// ---------- escalones ----------

/** Tres peldaños de cerámica pegados a la pared: el más alto contra la pared, el más bajo hacia el centro. */
export function buildSteps(spot: StepsSpot, tint: THREE.Color, tiles: THREE.Texture): THREE.Group {
  const side = new THREE.MeshStandardMaterial({ color: tint, map: tiles, roughness: 0.45, envMapIntensity: 0.4 });
  const top = new THREE.MeshStandardMaterial({ color: tint.clone().lerp(new THREE.Color(1, 1, 1), 0.35), map: tiles, roughness: 0.4, envMapIntensity: 0.5 });
  const g = new THREE.Group();
  let z = STEPS.back; // el primer bloque se hunde un poco en la pared: no queda rendija
  STEPS.treads.forEach((depth, i) => {
    const h = STEPS.heights[i];
    const near = z;
    const far = z - depth - (i === 0 ? STEPS.back : 0);
    const box = new THREE.Mesh(new THREE.BoxGeometry(spot.width, h, near - far), [side, side, top, side, side, side]);
    box.position.set(0, h / 2 + 0.004, (near + far) / 2);
    g.add(box);
    z = far;
  });
  g.position.set(spot.p.x, 0, spot.p.y);
  g.rotation.y = spot.rotY;
  return shadowy(g);
}

// ---------- macetas ----------

/** Hoja arqueada: ancha en el medio y fina en la punta, curvada hacia afuera. Base en el origen, apunta a +y. */
function blade(len: number, wid: number, bend: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(wid, len, 2, 8);
  const pos = g.attributes.position;
  for (let k = 0; k < pos.count; k++) {
    const t = (pos.getY(k) + len / 2) / len;
    const w = Math.pow(Math.sin(Math.PI * Math.min(1, 0.12 + t * 0.88)), 0.85);
    pos.setXYZ(k, pos.getX(k) * w, t * len, bend * t * t * len);
  }
  g.computeVertexNormals();
  return g;
}

export type PlantKind = "fern" | "succulent" | "bush";

/** Planta en una maceta chica de cerámica; la base apoya en y = 0 del grupo. */
export function buildPlant(kind: PlantKind, seed: number): THREE.Group {
  const rand = rng(seed * 7919 + 13);
  const g = new THREE.Group();
  const pot = new THREE.Mesh(
    new THREE.LatheGeometry(
      [[0, 0], [POT.baseR, 0], [POT.baseR + 0.012, 0.02], [POT.topR - 0.012, POT.height - 0.03], [POT.topR, POT.height - 0.02], [POT.topR + 0.012, POT.height], [POT.topR - 0.012, POT.height]]
        .map(([r, y]) => new THREE.Vector2(r, y)),
      28,
    ),
    glossy(0xf7efe3, { roughness: 0.42, clearcoat: 0.5, side: THREE.DoubleSide }),
  );
  g.add(pot);
  const soil = new THREE.Mesh(new THREE.CylinderGeometry(POT.topR - 0.015, POT.topR - 0.015, 0.01, 20), new THREE.MeshStandardMaterial({ color: 0x5a4a3c, roughness: 1 }));
  soil.position.y = POT.height - 0.025;
  g.add(soil);

  const greens = [0x4fae7d, 0x62c08f, 0x3f9a6e];
  const mat = (i: number) => new THREE.MeshStandardMaterial({ color: greens[i % greens.length], roughness: 0.55, side: THREE.DoubleSide });
  const y0 = POT.height - 0.03;
  if (kind === "fern") {
    for (let k = 0; k < 10; k++) {
      const len = 0.46 + rand() * 0.18;
      const m = new THREE.Mesh(blade(len, 0.15, 0.5 + rand() * 0.35), mat(k));
      m.rotation.order = "YXZ";
      m.rotation.y = k * 2.399963 + rand() * 0.3; // ángulo áureo: reparte las hojas sin que se amontonen
      m.rotation.x = 0.1 + (k % 3) * 0.2 + rand() * 0.12;
      m.position.y = y0;
      g.add(m);
    }
  } else if (kind === "succulent") {
    for (let layer = 0; layer < 3; layer++) {
      const n = 6 + layer * 2;
      for (let k = 0; k < n; k++) {
        const m = new THREE.Mesh(blade(0.27 - layer * 0.04, 0.12 - layer * 0.012, 0.35), mat(layer + k));
        m.rotation.order = "YXZ";
        m.rotation.y = (k / n) * Math.PI * 2 + layer * 0.5;
        m.rotation.x = 0.35 + layer * 0.42;
        m.position.y = y0 + layer * 0.02;
        g.add(m);
      }
    }
  } else {
    for (let k = 0; k < 6; k++) {
      const r = 0.105 + rand() * 0.05;
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), mat(k));
      const a = k * 1.047 + rand() * 0.4;
      const rad = k === 5 ? 0 : 0.1;
      m.position.set(Math.cos(a) * rad, y0 + 0.16 + (k === 5 ? 0.2 : (k % 2) * 0.1) + rand() * 0.05, Math.sin(a) * rad);
      g.add(m);
    }
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, 0.26, 6), new THREE.MeshStandardMaterial({ color: 0x6b5a45, roughness: 0.9 }));
    stem.position.y = y0 + 0.11;
    g.add(stem);
  }
  return shadowy(g);
}

// ---------- flotadores ----------

export interface FloatParts {
  group: THREE.Group;
  /** Anillo claro sobre la superficie del agua alrededor del flotador (se apoya aparte, a la altura del agua). */
  ripple: THREE.Mesh;
}

/** Flotador en aro con rayas: cuerpo claro y ocho tramos, uno por medio de color. Centro en el origen. */
export function buildFloat(stripe: number): FloatParts {
  const ring = new THREE.Group();
  ring.add(new THREE.Mesh(new THREE.TorusGeometry(FLOAT.R, FLOAT.tube, 20, 40), glossy(0xfff6f1, { roughness: 0.28 })));
  const col = glossy(stripe, { roughness: 0.28 });
  for (let k = 0; k < 8; k += 2) {
    const arc = new THREE.Mesh(new THREE.TorusGeometry(FLOAT.R, FLOAT.tube * 1.03, 20, 10, Math.PI / 4), col);
    arc.rotation.z = (k * Math.PI) / 4;
    ring.add(arc);
  }
  // Tapita de la válvula, como detalle.
  const cap = new THREE.Mesh(new THREE.SphereGeometry(FLOAT.tube * 0.45, 10, 8), glossy(0xffffff));
  cap.position.set(FLOAT.R, 0, FLOAT.tube * 0.85);
  ring.add(cap);
  ring.rotation.x = Math.PI / 2; // el aro queda acostado sobre el agua
  const group = new THREE.Group();
  group.add(ring);
  shadowy(group);
  const ripple = new THREE.Mesh(
    new THREE.RingGeometry(FLOAT.R + FLOAT.tube * 0.7, FLOAT.R + FLOAT.tube * 1.7, 48).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }),
  );
  ripple.renderOrder = 6;
  return { group, ripple };
}
