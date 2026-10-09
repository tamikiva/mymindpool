// Tokens iniciales del PRD §2. Sujetos a ajuste visual; no son una extracción exacta del boceto.
export const palette = {
  background: "#FAF9FC",
  text: "#392747",
  textMuted: "#6B5B7B",
  primary: "#8065C4",
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
