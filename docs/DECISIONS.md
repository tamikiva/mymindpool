# My MindPool — registro de decisiones

## D-001 · Ubicación (2026-10-09) — reemplazada
> Desde el 2026-11 My MindPool tiene su **propio repositorio** (esta raíz). Lo que sigue es el contexto original.

My MindPool vivía en `mindpool/`, aislado del resto del repositorio (otra app, "Jaime", con otro dominio y datos sensibles). Tiene su propio `package.json`, lockfile, `supabase/` y docs. Nada se importa entre ambas.

## D-002 · Stack
Expo SDK 57 + React Native 0.86 + TypeScript 6 + Expo Router, con soporte web (`react-native-web`), y Supabase (Auth + Postgres + RLS), tal como propone el PRD §4. Una sola base para web, iOS y Android.
- No se instala Next.js. Las versiones salen de `expo/bundledNativeModules.json` del SDK 57 (`expo install` no puede consultar `api.expo.dev` desde este entorno) y quedan fijadas en `package-lock.json`.
- Reglas de negocio puras en `src/domain` (sin React ni Supabase), probadas con Vitest.

## D-003 · Supabase propio
Se usará un proyecto Supabase **nuevo y exclusivo** de My MindPool (pedido de la usuaria: no mezclar con el de Jaime). Aún no existe; el código no lo necesita hasta el hito 1. Variables: ver `.env.example`.

## D-004 · Cerebro del hito 0 — ahora es la vista simplificada
> Desde D-014 el cerebro principal es 3D (web). Este dibujo plano en SVG queda como **vista simplificada**: se usa en iOS/Android hasta tener una versión nativa, y en web si WebGL no está disponible o se pierde el contexto.

Render 2.5D con SVG (`react-native-svg`): silueta festoneada dividida en 2–8 sectores por ángulo, piso translúcido, nombre del área escrito **en el piso** y agua semitransparente encima (el nombre se ve a través del agua en cualquier nivel), onda baja fija, transición breve del nivel desactivable. Selección por toque/teclado y vista de lista equivalente.
- Web: los grupos usan `role="radio"` + `aria-checked` + `tabIndex`. `role="button"`/`onPress` en `<G>` hacen que react-native-web emita un `<button>` dentro del SVG y la pileta no se dibuja.
- Pendiente de aprobación visual: la silueta actual es abstracta (no cerebro reconocible) y falta profundidad (paredes con espesor, brillo). Es un ensayo del motor, no el arte final.

## D-005 · Agua
Implementada en `src/domain/load.ts` según PRD §8: pesos 1–3, capacidad 8, `nivel = clamp(pendiente/capacidad, 0, 1)`, excedente aparte, elegibilidad por estado y fecha, bandas 25 % / 70 %. El nivel siempre se deriva de los datos.

## D-006 · Las tablas con invariantes se escriben solo por funciones (2026-11-03)
Rutinas, plan del día y tareas repetidas tienen **lectura directa con RLS** pero **ninguna escritura directa** para `authenticated`: se escribe con funciones SQL (`save_routine_template`, `start_routine_run`, `advance_run_step`, `set_run_state`, `save_day_plan`, `close_day_plan`, `save_recurring_task`, `ensure_occurrences`, `set_occurrence_state`…). Son `security definer` con `search_path` fijo y filtran siempre por `auth.uid()`.
- Por qué: así no se puede saltar el orden de los pasos, dejar una rutina a medias, completar dos veces ni tocar datos ajenos aunque el cliente manipule UUID. Cada operación es atómica e idempotente.
- Costo: más SQL. Se compensa con pruebas contra Postgres (PGlite) y pruebas de mutación (romper una regla y comprobar que alguna prueba falla).
- `tasks` y `areas` conservan CRUD directo con RLS (hito 1–2).

## D-007 · Archivar áreas no pierde pendientes (2026-11-03)
Un área no se archiva si tiene tareas abiertas, pasos de rutina pendientes, tareas repetidas activas o repeticiones pendientes, ni si dejaría menos de 2 áreas activas (PRD §7). Lo valida la base (trigger), no solo la pantalla. La pantalla ofrece mover los pendientes a otra área.

## D-008 · Rutinas (2026-11-03)
- El **primer paso** de la plantilla es la acción inicial estable: siempre va primero y está también en la versión corta (PRD §11). La «señal» (`start_cue`) es un texto de apoyo y no suma carga.
- Ejecutar copia los pasos y pesos en una **instancia**; editar o archivar la plantilla no reescribe lo ya empezado ni el historial.
- La carga de una rutina es la de sus pasos abiertos (una rutina de 4 pasos de peso 1 suma 4; no hay tarea padre). Una rutina en pausa sigue sumando; cancelar libera la carga sin marcar nada como hecho.
- Solo se resuelve el paso actual, en orden. Saltar no cuenta como completar. Máximo 20 pasos (evita «cien subpasos»). Una sola ejecución abierta por plantilla (tocar «Empezar» dos veces no la duplica).
- V1: plantillas locales de texto (Limpiar la casa, Almuerzo, Cerrar el trabajo y caminar), siempre editables. No hay IA.

## D-009 · Plan del día (2026-11-03)
- Un plan por fecha local. Los ítems **referencian** tareas y plantillas de rutina; no copian su estado, así completar sigue siendo de la tarea y no hay doble conteo.
- El tiempo previsto contra el disponible **solo informa**; nunca bloquea un plan imperfecto (PRD §10).
- Un día cerrado no se edita. Cerrar traslada **únicamente** las tareas elegidas a mañana (fecha + ítem en el plan de mañana), es idempotente y todo-o-nada.
- «Hoy» sale de la fecha del dispositivo; falta usar `profiles.timezone` (ver STATUS).

## D-010 · Tareas repetidas (2026-11-03)
- Una tarea repetida es una **plantilla** (no suma al agua ni aparece como pendiente) más **ocurrencias** con fila, fecha y estado propios; clave única por plantilla y fecha. Completar una no completa la plantilla ni las futuras.
- Las ocurrencias copian título, área, peso y prioridad al generarse. Editar descarta solo las pendientes de hoy en adelante, que se regeneran; lo pasado y lo resuelto no se toca.
- Se generan **hacia adelante** (hoy y 7 días); nunca se rellenan días pasados.
- **Solo la ocurrencia de hoy suma al agua.** Una repetición vencida se puede resolver o saltar desde Tareas, pero no acumula deuda (PRD §8 y §12: no mantener pendientes que llenen la pileta solos). Es una decisión propia: se puede revisar con uso real.
- Las fechas son de calendario (sin zona horaria), así que no hay saltos por cambio de horario. La regla existe en SQL y en TypeScript y una prueba las cruza día por día durante 2 años.

## D-011 · Etiquetas del cerebro (2026-11-03)
Las etiquetas se ubican buscando, dentro de cada sector, el punto donde el nombre se lee más grande sin salirse de las paredes (hasta 3 líneas, tamaño mínimo 11). Si un nombre largo no cabe legible (p. ej. 40 caracteres en un sector de 8), el dibujo lo **acorta con «…»**; el nombre completo queda en la lista de áreas y en la etiqueta accesible. Es una concesión de legibilidad frente a «nombres en el fondo»: queda para la revisión visual.

## D-012 · Contraste (2026-11-03)
La acción primaria pasa de `#8065C4` (PRD §2) a `#6A4FB3`: el original da 4,37:1 como texto sobre el fondo y 3,87:1 sobre el chip seleccionado (< 4,5:1). Con `#6A4FB3`: 5,9–6,2:1 con blanco y con los fondos. El PRD ya pedía oscurecer texto y acciones si hacía falta.

## D-013 · Cómo se verifica (2026-11-03)
- **Postgres local (PGlite)**: migraciones, RLS entre usuarias, idempotencia y atomicidad (`tests/*.test.ts`).
- **Navegador con API simulada** (`npm run ui-check`): recorridos, teclado, axe-core (WCAG 2.1 AA), movimiento reducido y cerebro con 2 y 8 áreas. **No** valida nada del servidor real.
- **Supabase real** (`npm run validate:supabase`, guía en `docs/VALIDACION_SUPABASE.md`): todavía **no se corrió**. Son tres niveles distintos y se reportan por separado.

## D-014 · Cerebro 3D procedural con three.js (2026-11-03)
Las referencias visuales (piletas con volumen, borde cerámico, agua translúcida) no se logran con el dibujo plano del hito 0, y una imagen fija no sirve porque los niveles responden a los datos. Se evaluaron tres técnicas:
- **Imagen estática o capas pre-dibujadas:** descartadas. Harían falta cientos de imágenes (cada cantidad de áreas, 2–8, por cada nivel de agua) y arte que no se puede producir por código.
- **3D procedural con three.js (elegida):** todo se genera desde las áreas. Silueta de cerebro y piletas por campos de distancia (`brain3d/layout.ts`), borde y base extruidos con bisel, paredes interiores, piso con baldosas, agua translúcida con reflejos, ondas y cáusticas, flotadores, escalera y plantas. El nivel del agua es una altura que se anima hacia el dato.
- Solo web por ahora (primera entrega del PRD). Se carga three.js (~0,8 MB más de JavaScript: 1,5 → 2,3 MB sin comprimir).
Accesibilidad: el lienzo es `role="img"` con la descripción de cada área y su carga; la **leyenda** (radios enfocables) es la forma accesible de elegir una pileta, y la lista «Carga por área» da la misma información en texto. Con «reducir movimiento» no hay animación (ni siquiera al cargar). Se dibuja ~20 veces por segundo en reposo y se pausa fuera de pantalla.
**Limitaciones reales:** (1) las referencias son renders fotorrealistas; esto es 3D estilizado: sin textura de circunvoluciones en el fondo, sin refracción real y con adornos simples. (2) Solo se midió con render por software; falta probar en un iPhone real y Safari. (3) En nativo todavía se ve el dibujo plano.

## D-015 · Nombres dentro del dibujo 3D (reemplaza D-011 para el 3D) (2026-11-03)
El nombre se ubica en la parte del piso que realmente se ve desde la cámara (la pared cercana tapa una franja), con el ángulo que mejor sigue la forma de la pileta, y se repite sobre la superficie del agua para mantener el contraste a cualquier nivel. Tamaño mínimo 12,5 (≈ 12 px en un celular). Si un nombre no entra entero se acorta con «…» **y el nombre completo está siempre en la leyenda y en la lista**.
Garantía medida y probada (`GUARANTEED_LETTERS`): un nombre de una palabra entra entero en la pileta más chica hasta **11 letras con 2–5 áreas, 10 con 6, 6 con 7 y 5 con 8**. Es un límite físico de 8 piletas en una pantalla de celular.

## D-016 · Fondo crema, tipografía y tarjetas (2026-11-03)
Fondo `#FCF8F2` (el `#FAF9FC` del PRD §2 era más frío), tarjetas blancas de esquinas amplias con sombra suave, pestañas con íconos. Tipografía **Nunito** (sans redondeada, licencia OFL; archivos y licencia en `public/fonts`), cargada por CSS en web. Es **provisoria**: falta la aprobación definitiva (PRD §25) y la carga por peso en nativo (hito 7). El botón principal conserva `#6A4FB3` (D-012) y no el lila más claro de las referencias, porque con texto blanco no llega a 4,5:1.

## D-017 · Sugerencia del próximo paso, versión inicial (2026-11-03)
`src/domain/nextStep.ts`, determinista y con motivo verificable. Orden: (1) tarea urgente abierta, (2) área elegida hoy en el plan que todavía no completó tareas, (3) mayor carga pendiente si no es baja. «Ya avanzaste en X» solo aparece si hoy se completó algo en X. No dice «descuido» por una pileta vacía. Se puede rechazar con «Ahora no» sin cambiar datos. Falta (hito 5): tiempo registrado, metas, silencios, excepciones y «caber en el tiempo disponible».

## D-018 · Volumen del cerebro 3D, caso de 4 áreas (2026-11-03)
Tras comparar con la referencia (ver `docs/ESPECIFICACION_MODELO_3D.md` §2) se rehízo la proporción y la luz **solo para 4 áreas**:
- Cámara a 52° (antes 64°); pared de 0,6 + bisel (antes 0,5), base de 0,6; borde y paredes entre piletas más gruesos.
- Interior: paredes con **azulejos** y oscurecimiento hacia el fondo; piso con baldosas y **oclusión ambiental dibujada** (oscuro en el borde, claro al centro); sombra proyectada por las paredes (luz principal baja, sombras suaves) y degradado de color de vértice en el borde cerámico.
- Agua: la **profundidad la da el agua**: un fondo vacío es azulejo pálido con las juntas a la vista y sin ondas ni cáusticas; el color, la opacidad y las ondas crecen con el nivel (opacidad 0,14 → 0,86). Se dibuja también la cara trasera del volumen, que tiñe la pared lejana por debajo de la línea de agua, y una **línea de flotación** clara sobre la pared.
- Los adornos no cambian, salvo que las plantas van solo en el borde trasero.
**Pendiente:** adaptar esto a 2–8 áreas (los garantías de nombres y las pruebas de ubicación de nombres solo están medidas para 4; ver `it.todo`). **Sigue faltando respecto de la referencia:** silueta con lóbulos finos, escalones, texturas de azulejo con relieve, refracción real y cáusticas de luz con detalle.

## D-019 · Laboratorio de una pileta y paredes finas (2026-11-03)
Tras la devolución («bordes demasiado anchos respecto del agua, falta profundidad interior») se evaluó la geometría con **una sola pileta, sin adornos, al 0 %, 50 % y 100 %, con la misma cámara y encuadre** (`npm run brain-lab`, `scripts/brain3d-lab`; la escena acepta `layout` y `props: false`). Cambios, ya aplicados al cerebro de 4 áreas:
- **Una sola pared continua** desde la base hasta el borde (antes «base» + «borde» con una junta que se leía como un escalón ancho); placas de fondo dentro de cada hueco.
- Paredes más finas (≈ 0,2–0,3 de espesor: borde exterior `RIM` 0,17, entre piletas `WALL` 0,30) y más profundas (0,82 + bisel 0,08); cámara a 46°.
- **El nivel se lee contra la pared:** el agua tiñe la pared interior hasta el nivel con un corte limpio (además de la línea de flotación, el color y las ondas). Pared interior con azulejos más marcados y más oscura hacia el fondo.
- Las plantas desaparecen por ahora (con paredes finas no hay lugar en el borde); quedan flotadores y escalera.
**Sigue pendiente:** la silueta no se reconoce como cerebro (lóbulos finos; no se tocó en esta pasada), 2–8 áreas, y evaluar si hace falta el recurso externo. Móvil: tarjeta de sugerencia y leyenda compactas; se ven 3 tareas sin desplazarse en 390×844 (verificado por `ui-check`).

## D-020 · Silueta de cerebro trazada de la referencia (4 áreas) (2026-11-03)
La silueta procedural (superelipse con lóbulos) no se reconocía como cerebro. Para 4 áreas se usa ahora el **contorno real de la referencia de celular**: las 4 piletas se segmentaron por color y el borde exterior es la unión de piletas y paredes engrosada (`referenceShape.ts`, ÷ 0,85 por el acortamiento de la perspectiva, 10,3 unidades de ancho). Las divisiones interiores son las **curvas en S de la referencia** (Casa se extiende arriba a la izquierda, Trabajo baja por el centro, Salud en diagonal hacia abajo a la derecha, Vida social abajo a la derecha), no una cruz. Cada celda de pared se reparte entre las piletas vecinas por cercanía y el generador talla paredes del espesor elegido (RIM 0,17 y WALL 0,30), así que las piletas quedan algo más anchas que las visibles en la referencia.
- Se corrigió un defecto real: el plano del nombre se veía como un cuadrado blanco de 1×1 hasta tener su texto (ahora está oculto).
- La escena acepta `water: false`, `labels: false` y `tilt` (vista cenital) para evaluar solo la forma: `MODE=shape REFERENCE_IMAGE=… npm run brain-lab`.
**Diferencias con la referencia:** los lóbulos finos del borde (sobre todo abajo a la izquierda) salen más suaves por el suavizado; la referencia tiene escalones y detalles que no se modelan.
**Pendiente:** integrar y revisar el agua con esta forma; 2–8 áreas (siguen con la forma procedural anterior).

## D-021 · Agua sobre la silueta de la referencia (4 áreas) (2026-11-03)
Con la forma aprobada se revisó el agua en la cámara final con niveles variados y extremos (3 % y 97 %): el nivel se lee contra la pared y por el color. Cambios: **un solo nombre** por pileta, dibujado después del agua y sin escribir profundidad (antes había una copia sobre la superficie que se veía doble por la perspectiva); los flotadores se alejan más del nombre; **la escalera se apagó** (con las paredes nuevas quedaba flotando fuera del borde). Siguen apagadas las plantas.
**Pendiente:** 2–8 áreas (hoy usan la forma procedural anterior; hace falta decidir cómo derivar una silueta de cerebro para otras cantidades) y los detalles finos de la referencia (lóbulos del borde más marcados, escalones).

## D-022 · Adornos del cerebro y fondo verde menta (2026-11-04)
- **Fondo:** `#EFF8F1` (verde menta muy claro, pedido de la usuaria) en `palette.background` y en el `html/body` de la web; las tarjetas siguen blancas. El lienzo 3D es transparente y la sombra es translúcida: se verificó por píxeles que el fondo de la escena es idéntico al de la página (sin rectángulo).
- **Adornos:** escalera de acero en el borde de Trabajo (rieles pegados a la pared, pasamanos y bridas apoyadas en el borde), escalones de 3 peldaños en dos piletas, dos flotadores con volumen y tres macetas sobre el borde. Dónde va cada uno lo decide `propsPlacement.ts` (código puro, con pruebas en `tests/props.test.ts`): cada adorno debe entrar completo, apoyado donde corresponde, sin atravesar paredes y sin tapar nombres. Si en una pileta no hay lugar, ese adorno se omite (no se achica ni se fuerza).
- **Flotadores:** su altura sale del nivel de agua (flotan con su calado y descansan en el fondo si no hay agua), con un anillo de contacto sobre la superficie. Para elegir su lugar se tiene en cuenta que al subir el agua se corren hacia atrás en pantalla, para que nunca pasen sobre el nombre.
- **Límite conocido:** el borde del cerebro de 4 áreas es fino (≈0,26–0,35), por eso las macetas son chicas y la escalera solo entra en un tramo del borde de Trabajo. Para 2–8 áreas el reparto se calcula con la misma lógica, pero la adaptación del diseño sigue pendiente.
