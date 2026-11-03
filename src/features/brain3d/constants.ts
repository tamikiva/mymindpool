/** Medidas de la escena 3D, compartidas por la escena (three.js) y por las pruebas de ubicación. */

/** Altura de la parte recta de la pared, bisel y alto total (unidades del mundo). */
export const DEPTH = 0.58;
export const BEVEL = 0.1;
export const TOTAL_H = DEPTH + 2 * BEVEL;
/** Espesor de la base bajo el piso de las piletas. */
export const BASE_H = 0.5;
/** Inclinación de la cámara respecto del plano horizontal (más alta = más desde arriba). */
export const TILT = (64 * Math.PI) / 180;
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
 * de cada cantidad de áreas (medido sobre la geometría real y verificado por una prueba). Los
 * nombres con espacios se parten en líneas y entran mejor; los más largos se acortan con «…».
 */
export const GUARANTEED_LETTERS: Readonly<Record<number, number>> = { 2: 11, 3: 11, 4: 11, 5: 11, 6: 10, 7: 6, 8: 5 };
