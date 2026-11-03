# Cerebro-pileta: diagnóstico y especificación del modelo 3D

Para entregar a quien vaya a modelarlo. Es la especificación completa: con esto se puede producir el recurso sin más reuniones.

## 1. Cómo está hecho hoy
Un **modelo 3D real generado por código** (three.js sobre WebGL): borde y base extruidos con bisel, paredes interiores, piso, agua y adornos como mallas separadas, cámara en perspectiva y luces. El SVG plano (hito 0) es solo un respaldo si no hay WebGL. Por eso el problema **no es la técnica** (no es plano por ser SVG) sino el modelado y la iluminación.

## 2. Comparación con la referencia (medidas aproximadas, a ojo sobre las dos imágenes)
| Aspecto | Referencia | Implementación actual | Causa |
| --- | --- | --- | --- |
| Inclinación de cámara | ≈ 40–50° sobre el plano | 64° | Más cenital: la altura de las paredes se acorta (cos 64° ≈ 0,44) y todo se lee chato |
| Alto visible de la pared exterior | ≈ 7 % del ancho del cerebro | ≈ 2–3 % | Paredes bajas **y** cámara muy alta |
| Espesor del borde y de las paredes entre piletas | ≈ 5–6 % del ancho | ≈ 2,5–3,5 % | Parámetros del generador, limitados por tener que dejar lugar a los nombres |
| Profundidad interior | Se ven las **caras interiores** de la pared (azulejos), escalones y fondo | Piso casi plano; la pared interior apenas se ve | Poca altura + cámara alta; sin escalones |
| Agua | Translúcida **con profundidad**: se ve el fondo y los azulejos a través, con línea de flotación sobre la pared y cáusticas | Una lámina de color poco transparente; el fondo no se ve a través | Un solo material con opacidad fija. Falta absorción/refracción según el espesor de agua |
| Niveles independientes | Trabajo casi vacío (se ve la línea de agua contra el azulejo); Casa llena | Cambia la altura, pero sin línea de agua visible en la pared | Paredes interiores sin textura y agua sin profundidad |
| Iluminación | Sombras suaves en rincones y bajo el borde (oclusión ambiental) | Casi sin sombras internas | Sin sombra propia ni AO horneada |
| Silueta | Cerebro reconocible: 2 hemisferios, borde festoneado con lóbulos, piletas que se entrelazan | Forma suave tipo «piedra» | Campo de distancia suavizado: elimina los lóbulos finos |
| Detalle | Escalones, plantas reales, escalera, flotadores con volumen | Adornos mínimos | Geometría simple generada |

**Qué se puede mejorar solo con código** (sin recursos): bajar la inclinación a ~48°, paredes más altas y gruesas, agua con refracción/absorción (`transmission`) para ver el fondo, sombras proyectadas y oclusión ambiental calculada por pileta, más lóbulos en la silueta. Estimo que llevaría el resultado a «claramente 3D con volumen», pero **no** a la calidad de la referencia: silueta de cerebro con escalones, azulejos en paredes y detalle fino necesitan modelado. Para llegar a la referencia se necesita el recurso de abajo.

## 3. Recurso que hace falta: modelo `.glb`
**Formato:** glTF 2.0 binario (`.glb`), con texturas incrustadas. Se admite compresión Draco o Meshopt, y texturas KTX2/Basis (opcional). Entregar también el archivo fuente (`.blend` o equivalente).

**Qué modelar (la variante de 4 áreas, igual a la referencia):**
- Cerebro-pileta con 4 piletas: **Pool_01 arriba izquierda (Casa), Pool_02 arriba derecha (Trabajo), Pool_03 abajo izquierda (Salud), Pool_04 abajo derecha (Vida social)**.
- Silueta: dos hemisferios con borde festoneado (6–9 lóbulos por hemisferio) y un surco central, como en la referencia.
- Piletas hundidas, cada una con su propio borde redondeado; escalones interiores permitidos (máx. 3 por pileta).

**Ejes y escala:** +Y hacia arriba, +Z hacia quien mira (el frente), derecha = +X. El ancho total del cerebro = **10 unidades** (±0,5). Origen en el centro, a la altura del **piso de las piletas (y = 0)**.

**Proporciones objetivo** (con ancho = 10): alto de la pared (piso a borde) **0,7–0,9**; espesor del borde exterior y de las paredes entre piletas **≥ 0,5**; radio del bisel del borde **≥ 0,08**; espesor de la base bajo el piso **≥ 0,4**.

**Nodos con estos nombres exactos:**
| Nodo | Contenido |
| --- | --- |
| `Body` | Cuerpo cerámico: base, pared exterior, paredes entre piletas y bordes superiores. Una sola malla |
| `Pool_01` … `Pool_04` | Cara **interior** de cada pileta: paredes, escalones y piso. Hermética con `Body` (sin huecos). Material propio por pileta |
| `Cavity_01` … `Cavity_04` | **Volumen cerrado** del hueco de cada pileta, desde el piso hasta el borde. Malla hermética (manifold), sin caras internas, invisible en el render final. Sirve para recortar el agua a cualquier nivel, también con escalones |
| `LabelPlane_01` … `LabelPlane_04` | Un rectángulo plano apoyado sobre el piso visible de cada pileta (normal +Y), con el tamaño máximo del nombre y la rotación que mejor siga la forma. Sin material (se reemplaza por el texto) |
| `Prop_*` | Adornos como mallas separadas (palmeras, escalera, flotadores). Cada una con su origen en su base. Opcionales pero deseables |

**Texturas y materiales (PBR metal-rough):**
- Cerámica del `Body`: color base crema `#F4EBDC`, rugosidad 0,35–0,5; mapa de normales opcional.
- **Oclusión ambiental horneada** (segundo juego de UV, mapa `aoMap` de 2048²) en `Body` y `Pool_*`: es lo que da el volumen en rincones y bajo los bordes. Es el punto más importante.
- Azulejos de `Pool_*`: textura **neutra (escala de grises)** con juntas visibles, para poder teñirla con el color de cada área (lila, celeste, verde agua, rosa, o el que elija la persona). No hornear color de área ni agua.
- **No** hornear agua, texto ni iluminación direccional (solo AO).

**Presupuesto:** ≤ 150 000 triángulos en total (≤ 60 000 en `Body`); archivo ≤ 8 MB; ≤ 3 texturas de 2048².

**Qué entregar además:** vistas de verificación (frente, 45° y cenital); el `.blend` (u otro fuente editable); lista de adornos incluidos.

## 4. Qué haría yo con el recurso (integración)
Cargar el `.glb` en lugar de las mallas generadas del borde y las paredes; el **agua sigue siendo dinámica**: un plano de recorte a la altura del dato dentro de cada `Cavity_*` (con tapa), con material translúcido que muestra el fondo y las cáusticas, y línea de flotación sobre la pared. El nombre de cada área se dibuja sobre `LabelPlane_*`. Se mantiene el respaldo plano y la lista accesible. Criterios de aceptación: nodos con los nombres pedidos; `Cavity_*` hermético; triángulos y peso dentro del presupuesto; comparación visual con la referencia a 390 px y a 1200 px; niveles independientes de 0 a 100 % por pileta; sin bajar de 30 cuadros por segundo en un celular de gama media (hay que medirlo en un dispositivo real).

## 5. Otras cantidades de áreas (2 a 8)
Un modelo fijo sirve solo para esa cantidad. Opciones, a decidir:
1. **Modelo de 4 áreas** (el de la referencia) y, para las demás cantidades, seguir con el generador por código mejorado (§2). Es lo más barato y cubre el caso por defecto.
2. Un modelo por cantidad (2, 3, 5, 6, 7, 8): máxima calidad, 6 modelos más.
3. Un kit modular (borde y piletas intercambiables): más trabajo de modelado, resuelve todas las cantidades.

## 6. Cómo producirlo
- Un/a artista 3D en Blender con esta especificación y las 3 imágenes de referencia: es la vía recomendada.
- Los generadores de «imagen a 3D» entregan **una sola malla fusionada**, sin separar paredes, piletas ni volúmenes de agua: no sirven como recurso final, aunque pueden servir de base para modelar.
- No puedo producir ni descargar este tipo de recurso desde acá.
