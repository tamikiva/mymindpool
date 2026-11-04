import { LABEL_MAX_FONT, LABEL_MIN_FONT, LABEL_SCALE, OCCLUSION } from "./constants";
import { placeLabelRotated } from "./labelPlacement";
import { visibleFloor, type Pt } from "./layout";
import type { LabelRect } from "./propsPlacement";

/** Dónde y cómo se dibuja el nombre de una pileta sobre su piso visible (unidades del mundo). */
export function fitName(poly: readonly Pt[], name: string): { lines: string[]; fontW: number; rect: LabelRect } {
  const scaled = visibleFloor(poly, OCCLUSION).map((p) => ({ x: p.x * LABEL_SCALE, y: p.y * LABEL_SCALE }));
  const { label, cx, cy, angle } = placeLabelRotated(scaled, name, LABEL_MAX_FONT, undefined, LABEL_MIN_FONT);
  const fontW = label.fontSize / LABEL_SCALE;
  const maxChars = Math.max(...label.lines.map((l) => l.length), 1);
  const w = maxChars * fontW * 0.62 * 1.1 + 0.1;
  const h = label.lines.length * fontW * 1.1 + 0.1;
  return { lines: label.lines, fontW, rect: { x: cx / LABEL_SCALE, y: cy / LABEL_SCALE, w, h, angle } };
}
