# My MindPool — estado

## Hito 0 — Base y decisiones · completado (2026-10-09)
- App Expo (web + nativo) en `mindpool/`, con `typecheck`, `test` y `export:web` en verde.
- Dominio de carga del agua con 8 pruebas; geometría y etiquetas del cerebro con 5.
- Ensayo del cerebro en `/`: 2–8 áreas, niveles variables, nombre en el fondo, renombrar hasta 40 caracteres, lista accesible, movimiento reducido.
- Verificado en Chromium (390 px y 1200 px) sin errores de consola.

### Limitaciones reales
- No probado en dispositivo iOS/Android ni Safari iOS (PRD §18).
- El arte del cerebro es provisorio; falta aprobación visual.
- Logo vectorial, tipografía definitiva y dominio: pendientes (PRD §25). No se pidió ni registró ningún dominio.
- Los bocetos se vieron como imágenes en la conversación; no están como archivos en el repo.

## Siguiente: Hito 1 — acceso real y datos privados
Requiere un proyecto Supabase nuevo (URL + anon key) para probar contra uno real.

## Hito 1 — Acceso real y datos privados · en curso (código listo, falta probar contra Supabase real)
Hecho:
- Migración `supabase/migrations/0001_profiles_areas.sql`: `profiles`, `areas` (2–8 activas, nombre ≤ 40, único por usuario), trigger de perfil al registrarse, RLS en ambas tablas y RPC `complete_onboarding` atómica e idempotente (bloquea el perfil; reintentar no duplica áreas).
- 11 pruebas de RLS/onboarding con Postgres local (PGlite): A no lee, crea, modifica, borra ni reasigna datos de B; anónimo no accede; el onboarding con 1 o 9 áreas falla sin dejar nada.
- Pantallas: bienvenida, registro (con aviso de confirmar email), entrar, recuperar contraseña, nueva contraseña, onboarding (nombre opcional, áreas editables, color, orden, borrador local que sobrevive a la confirmación del email) y Mi equilibrio con las áreas reales.
- Verificado en Chromium con una URL falsa: redirige a bienvenida sin sesión y un fallo de red muestra un mensaje que permite reintentar, conservando lo escrito.

Pendiente / limitaciones:
- No se probó contra un proyecto Supabase real: registro, confirmación por email, recuperación y RLS en el servidor real dependen de crearlo (ver `docs/SETUP_SUPABASE.md`).
- Sesión en nativo: `expo-secure-store` limita cada valor a ~2 KB y una sesión de Supabase puede superarlo; hay que fragmentarla antes de la beta móvil (hito 7). Nativo no probado.
- Sin Google/Apple login, sin cambio de contraseña desde Ajustes ni cierre de sesión en todas partes.
- Exportación y eliminación de cuenta: esquema y contrato en hito 6 (las tablas ya usan `on delete cascade` desde `auth.users`).

## Hito 2 — Tareas y cerebro dinámico · código listo, sin validar con Supabase real (2026-11-03)
Hecho (migraciones 0002 y 0003):
- Tareas con RLS y clave foránea compuesta `(area_id, user_id)`; `complete_task` / `undo_complete_task` idempotentes; el agua se deriva de las filas.
- Pantallas: Equilibrio (carga real), Tareas (Pendientes, Hoy, Vencidas, Futuras, Más adelante, Completadas; área; búsqueda), Editar tarea, Área (carga, excedente, edición, archivado moviendo pendientes). Un fallo de escritura muestra el error y conserva lo escrito.
- Archivar un área valida en la base: sin pendientes y con al menos 2 áreas activas.
- Cerebro con 2 a 8 áreas: etiquetas dentro de su sector y legibles (ver D-011); nombres largos acortados con «…» en el dibujo.
- Accesibilidad: axe-core sin violaciones serias/críticas en todas las pantallas; foco visible; Tab/Enter/Espacio operan los controles y el cerebro; botones deshabilitados y selectores con ARIA correcto; sin desborde horizontal a 200 % de zoom; con movimiento reducido el agua cambia sin animar.

## Hito 3 — Día y rutinas · código listo, sin validar con Supabase real (2026-11-03)
Hecho (migraciones 0004, 0005 y 0006):
- **Rutinas**: plantillas editables (hasta 20 pasos), acción inicial estable, versión corta, señal opcional, plantillas locales sugeridas al escribir «limpiar la casa». Ejecución de a un paso (Listo / Saltar / Pausar / Retomar / Cancelar con confirmación), secuencia completa opcional, cierre sin encadenar otra rutina. Las instancias copian los pasos; su carga cuenta en el agua.
- **Mi día**: elegir áreas con momento y minutos, tiempo disponible (avisa si se supera, sin bloquear), tareas y rutinas del día, plan editable, cierre del día que traslada solo lo elegido.
- **Tareas repetidas**: diarias (cada N días) y semanales (días elegidos, cada N semanas), comienzo y final. Ocurrencias con identidad propia; solo la de hoy suma al agua (D-010). Se resuelven desde Tareas.
- Navegación: Equilibrio · Mi día · Tareas · Rutinas (Repetidas desde Tareas).

Pruebas:
- 147 pruebas (Vitest): reglas de dominio y Postgres local con RLS, atomicidad, idempotencia y la regla de recurrencia SQL cruzada con la de TypeScript día por día durante 2 años. Se comprobó con mutaciones que las pruebas detectan reglas rotas.
- `npm run ui-check`: 119 comprobaciones en Chromium (390 y 1200 px) **con una API simulada**, sin errores de consola.

Limitaciones reales (lo que NO está hecho):
- **Nada se validó contra Supabase real** (ver `docs/VALIDACION_SUPABASE.md` y `docs/PENDIENTES_USUARIA.md`). Los tres niveles —Postgres local, navegador con API simulada y Supabase real— se reportan por separado (D-013).
- Alcance del PRD §10–§12 que falta: frecuencia/recurrencia de **rutinas** (solo hay de tareas); las repeticiones **no entran** al plan del día; convertir una tarea en rutina; duración por paso en la interfaz (el esquema la guarda); «cuándo, dónde y después de qué acción» para hábitos más allá de la señal de la rutina; encadenar «Después de X, hago Y» entre rutinas; sugerencias de cambio de área entre pasos (hito 5).
- «Hoy» usa la fecha del dispositivo; falta usar la zona horaria del perfil (`profiles.timezone`) y documentar cómo afecta cambiar de zona.
- No se probó con lector de pantalla real ni con Safari iOS/dispositivos; solo axe-core, teclado y emulación de zoom/movimiento.
- Sin sincronización entre dispositivos probada (dos dispositivos a la vez): las funciones son idempotentes y hay pruebas secuenciales, pero no concurrentes.
- Para ver las pantallas hay que cargar las variables de Supabase y correr `npx expo start --web`; no hay ambiente de revisión publicado.

## Laboratorio de una pileta y paredes finas (2026-11-03, tercera pasada)
Ver D-019. Capturas: `laboratorio-una-pileta.png`, `1-equilibrio.png`, `1c-niveles-extremos*.png`. Sin aprobar visualmente: silueta de cerebro y 2–8 áreas pendientes.

## Volumen del cerebro 3D con 4 áreas (2026-11-03, segunda pasada)
Ver D-018. Cámara más baja, paredes más altas y gruesas, azulejos y sombra interior, agua con profundidad según el nivel. Capturas: `1-equilibrio.png`, `1b-…`, `1c-niveles-extremos*.png`. Pendiente: 2–8 áreas. Sin verificar en dispositivos reales.

## Revisión visual de Equilibrio — cerebro 3D (2026-11-03)
Pedido: acercar la pantalla a las referencias (cerebro con volumen, piletas, agua translúcida, fondo crema, celular con cerebro protagonista, leyenda, sugerencia y tareas).
Hecho (D-014 a D-017):
- Cerebro 3D procedural (web) con 2 a 8 áreas; agua con niveles que salen de los datos y se animan; nombres legibles a cualquier nivel; vista simplificada si no hay WebGL.
- Pantalla Equilibrio rehecha: encabezado, «Un paso a la vez», cerebro, leyenda accesible, tarjeta de próximo paso con motivo verificable, panel del área con tareas chicas primero, «Carga por área», pestañas con íconos; en escritorio, dos columnas.
- 198 pruebas y `npm run ui-check` (126 comprobaciones con API simulada): teclado, axe-core, movimiento reducido, 2 y 8 áreas, sin WebGL, escenario visual con los datos de la referencia.
Diferencias reales con la referencia (no están hechas):
- Es 3D estilizado, no un render fotorrealista: faltan circunvoluciones en el fondo de las piletas, refracción real, reflejos finos y arte de los adornos.
- El nombre de la app es My MindPool (PRD); las referencias dicen «En calma». Las pestañas son Equilibrio · Mi día · Tareas · Rutinas; las referencias muestran Equilibrio · Tareas · Áreas (no hay pantalla «Áreas»: se llega desde cada área).
- No hay botón «Empezar» en las tareas: depende del temporizador (hito 4). El botón principal es más oscuro que el lila de la referencia por contraste.
- Con 7–8 áreas en un celular los nombres largos se acortan dentro del dibujo (ver D-015).
Sin verificar: iPhone/Safari reales y rendimiento en celulares de gama media (todo se midió con render por software); versión nativa del cerebro; lector de pantalla real.

## Cómo se verifica
- `npm test` · `npm run typecheck` · `npm run export:web`
- `npm run ui-check` (navegador, API simulada; usa Chromium de `PLAYWRIGHT_BROWSERS_PATH` o `CHROMIUM_PATH`)
- `npm run validate:supabase` (real; requiere variables, ver `docs/VALIDACION_SUPABASE.md`)

## Siguiente
Validar contra Supabase real; después Hito 4 (tiempo y metas).
