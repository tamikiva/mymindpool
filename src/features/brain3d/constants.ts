/** Medidas de la escena 3D, compartidas por la escena (three.js) y por las pruebas de ubicación. */

/** Altura de la parte recta de la pared, bisel y alto total (unidades del mundo). */
export const DEPTH = 0.82;
export const BEVEL = 0.08;
export const TOTAL_H = DEPTH + 2 * BEVEL;
/** Espesor de la base bajo el piso de las piletas. */
export const BASE_H = 0.3;
/** Inclinación de la cámara respecto del plano horizontal (más alta = más desde arriba). */
export const TILT = (46 * Math.PI) / 180;
export const FOV = 28;
/** Franja del piso que tapa la pared cercana: alto de la pared / tan(inclinación), con un poco de aire. */
export const OCCLUSION = TOTAL_H / Math.tan(TILT) + 0.06;
/** Los nombres se ubican con el algoritmo del dibujo plano: se escalan a esas unidades. */
export const LABEL_SCALE = 30;
export const LABEL_MAX_FONT = 26;
/**
 * Tamaño mínimo del nombre dentro del dibujo (en las unidades escaladas de LABEL_SCALE): unos 13 px
 * en un celular. Si un nombre largo no entra a este tamaño se acorta con «…»; el nombre completo
 * está siempre en la leyenda y en la lista de carga.
 */
export const LABEL_MIN_FONT = 12.5;

/**
 * Letras de un nombre de una sola palabra que entran ENTERAS, a ese tamaño, en la pileta más chica
 * (medido sobre la geometría real y verificado por una prueba). Por ahora solo está resuelto el caso
 * de 4 áreas; el ajuste a 2–8 queda pendiente (con las paredes nuevas hay que volver a medirlo).
 */
export const GUARANTEED_LETTERS: Readonly<Record<number, number>> = { 4: 12 };
