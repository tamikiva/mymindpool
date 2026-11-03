export const MIN_FONT = 11;
export const MAX_FONT = 26;
export const CHAR_W = 0.62; // ancho medio de un carácter, en em
export const LINE_H = 1.1;
const MAX_LINES = 3;

export interface LabelLayout {
  lines: string[];
  fontSize: number;
  /** true si hubo que acortar el nombre con «…» para que quepa legible. */
  truncated: boolean;
}

/** Reparte las palabras en k líneas minimizando la más larga. */
function partition(words: string[], k: number): string[] {
  if (k === 1 || words.length === 1) return [words.join(" ")];
  const kk = Math.min(k, words.length);
  let best: string[] = [words.join(" ")];
  let bestMax = Infinity;
  const go = (from: number, left: number, acc: string[]) => {
    if (left === 1) {
      const lines = [...acc, words.slice(from).join(" ")];
      const m = Math.max(...lines.map((l) => l.length));
      if (m < bestMax) {
        bestMax = m;
        best = lines;
      }
      return;
    }
    for (let cut = from + 1; cut <= words.length - (left - 1); cut++) go(cut, left - 1, [...acc, words.slice(from, cut).join(" ")]);
  };
  go(0, kk, []);
  return best;
}

function truncateToFit(words: string[], capacity: number, maxLines: number): string[] {
  const lines: string[] = [];
  let cur = "";
  const rest = [...words];
  while (rest.length) {
    const w = rest[0];
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= capacity) {
      cur = next;
      rest.shift();
    } else if (!cur) {
      // Una sola palabra más larga que la línea: se corta.
      cur = w.slice(0, Math.max(1, capacity - 1));
      rest.shift();
      cur += "…";
      lines.push(cur);
      cur = "";
      if (lines.length === maxLines) return lines;
    } else {
      lines.push(cur);
      cur = "";
      if (lines.length === maxLines - 1 && rest.length) break;
    }
  }
  if (cur) lines.push(cur);
  if (rest.length > 0 || lines.length > maxLines) {
    const last = lines.slice(0, maxLines);
    const tail = last[last.length - 1] ?? "";
    last[last.length - 1] = (tail.length >= capacity ? tail.slice(0, capacity - 1) : tail).replace(/…$/, "") + "…";
    return last;
  }
  return lines;
}

/**
 * Elige líneas (hasta 3) y tamaño de letra para que el nombre entre en `maxWidth` × `maxHeight`.
 * Nunca baja de MIN_FONT: si no entra, se acorta con «…» (el nombre completo queda en la lista
 * y en la etiqueta accesible).
 */
export function layoutLabel(name: string, maxWidth: number, maxHeight = Infinity, maxFont = MAX_FONT, minFont = MIN_FONT): LabelLayout {
  const clean = name.trim().replace(/\s+/g, " ") || " ";
  const words = clean.split(" ");
  let best: { lines: string[]; font: number } | null = null;
  for (let k = 1; k <= Math.min(MAX_LINES, words.length); k++) {
    const lines = partition(words, k);
    const longest = Math.max(...lines.map((l) => l.length), 1);
    const font = Math.min(maxFont, maxWidth / (longest * CHAR_W), maxHeight / (lines.length * LINE_H));
    if (!best || font > best.font + 1e-9) best = { lines, font };
  }
  if (best && best.font >= minFont) return { lines: best.lines, fontSize: best.font, truncated: false };

  const capacity = Math.max(3, Math.floor(maxWidth / (minFont * CHAR_W)));
  const maxLines = Math.max(1, Math.min(MAX_LINES, Math.floor(maxHeight / (minFont * LINE_H))));
  return truncatedLayout(clean, capacity, maxLines, minFont);
}

/** El nombre acortado con «…» para que entre en `maxLines` líneas de `capacity` caracteres, a tamaño mínimo. */
export function truncatedLayout(name: string, capacity: number, maxLines: number, minFont = MIN_FONT): LabelLayout {
  const clean = name.trim().replace(/\s+/g, " ") || " ";
  const lines = truncateToFit(clean.split(" "), Math.max(3, capacity), Math.max(1, Math.min(MAX_LINES, maxLines)));
  return { lines, fontSize: minFont, truncated: lines.join(" ").replace(/…/g, "") !== clean };
}

/** Tamaño aproximado del bloque de texto ya resuelto, en unidades del dibujo. */
export function blockSize(label: LabelLayout): { w: number; h: number } {
  return {
    w: Math.max(...label.lines.map((l) => l.length), 1) * label.fontSize * CHAR_W,
    h: label.lines.length * label.fontSize * LINE_H,
  };
}
