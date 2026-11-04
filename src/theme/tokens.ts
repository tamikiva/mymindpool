// Tokens iniciales del PRD §2. Sujetos a ajuste visual; no son una extracción exacta del boceto.
export const palette = {
  // Fondo verde menta muy claro, tipo pasto suave (pedido de la usuaria, 2026-11-04); antes crema #FCF8F2.
  background: "#EFF8F1",
  card: "#FFFFFF",
  border: "#EFE6DA",
  text: "#392747",
  textMuted: "#6B5B7B",
  // Más oscuro que el #8065C4 del PRD §2: ese no llega a 4,5:1 como texto sobre el fondo claro (PRD pide verificar contraste).
  primary: "#6A4FB3",
  wall: "#F1E9DC",
} as const;

/** Colores sugeridos para las áreas por defecto. `deep` es el tono oscuro para texto/etiquetas. */
export const areaColors = [
  { key: "lila", fill: "#B7A3EE", deep: "#5B43A0" },
  { key: "celeste", fill: "#8DC8F5", deep: "#2B6A9E" },
  { key: "verde", fill: "#8FD4B7", deep: "#2C7A5C" },
  { key: "rosa", fill: "#F3A2BE", deep: "#A8456A" },
  { key: "durazno", fill: "#F7C59F", deep: "#9A5A22" },
  { key: "menta", fill: "#B9E4A8", deep: "#3F7D2B" },
  { key: "malva", fill: "#D5B3E8", deep: "#7A3FA0" },
  { key: "cielo", fill: "#A9D8E8", deep: "#2A6F86" },
] as const;

/** Tarjetas de las referencias: blancas, esquinas amplias y sombra suave. */
export const card = {
  backgroundColor: palette.card,
  borderRadius: 24,
  borderWidth: 1,
  borderColor: palette.border,
  shadowColor: "#3a2a4d",
  shadowOpacity: 0.07,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 8 },
  elevation: 2,
} as const;
