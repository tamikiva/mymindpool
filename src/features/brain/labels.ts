/** Parte un nombre en hasta 2 líneas y elige un tamaño de letra que entre en el sector. */
export function layoutLabel(name: string, maxWidth: number): { lines: string[]; fontSize: number } {
  const clean = name.trim().replace(/\s+/g, " ");
  const words = clean.split(" ");
  let lines = [clean];
  if (clean.length > 10 && words.length > 1) {
    let best = clean.length;
    for (let i = 1; i < words.length; i++) {
      const a = words.slice(0, i).join(" ");
      const b = words.slice(i).join(" ");
      const m = Math.max(a.length, b.length);
      if (m < best) {
        best = m;
        lines = [a, b];
      }
    }
  }
  const longest = Math.max(...lines.map((l) => l.length), 1);
  const fontSize = Math.max(9, Math.min(26, maxWidth / (longest * 0.62)));
  return { lines, fontSize };
}
