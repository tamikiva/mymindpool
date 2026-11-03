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

## Hito 2 — Tareas y cerebro dinámico · en curso (2026-11-03)
Hecho:
- Migraciones `0002_tasks.sql` (tareas con RLS, clave foránea compuesta `(area_id, user_id)`, `complete_task` / `undo_complete_task` idempotentes) y `0003_area_archive_guards.sql` (no se archiva un área con pendientes ni quedan menos de 2 áreas activas). El agua se deriva de las filas; no hay contador guardado.
- Dominio puro de filtros (`src/domain/taskFilters.ts`): Pendientes, Hoy, Vencidas, Futuras, Más adelante y Completadas; filtro por área y búsqueda sin tildes.
- Pantallas: **Equilibrio** (carga real, entrada rápida, completar/deshacer), **Tareas** (vistas, área, búsqueda, completar/deshacer, nueva), **Editar tarea** (título, nota, área, tamaño, prioridad, fecha con validación, más adelante, cancelar/reabrir, eliminar con confirmación), **Área** (banda de carga, excedente, pendientes, editar nombre/color/referencia, archivar moviendo pendientes). Navegación inferior Equilibrio / Tareas. Las pantallas recargan al volver a enfocarse.
- Un fallo de escritura muestra el error y conserva lo escrito.
- Pruebas: 54 (RLS entre usuarios, completar/deshacer una sola vez, cancelar/eliminar sin contar como realizada, tarea futura, archivado, filtros) más el typecheck y `export:web` en verde.
- Verificado en Chromium (390 px y 1200 px) con una **API simulada**: 21 recorridos (filtros, búsqueda, completar, deshacer, error de escritura con reintento, edición, eliminar con confirmación, cancelar, renombrar y archivar área) sin errores de consola. Capturas en `docs/capturas/`.
- Se corrigió que, con pestañas, las listas quedaban desactualizadas tras editar.

Limitaciones reales:
- **Nada se probó contra Supabase real** (faltan las variables; ver `docs/PENDIENTES_USUARIA.md`). La verificación de interfaz usó datos simulados.
- Sin pruebas automáticas de componentes ni de las pantallas: el recorrido de Chromium se corrió a mano y su script no está en el repo.
- No verificado: lector de pantalla, teclado, reducción de movimiento ni la onda breve al completar en el cerebro. Falta revisar el comportamiento con 2 y 8 áreas con datos.
- Sin tiempo registrado (hito 4): el área muestra «sin registro».
- Pospuestas del hito 2: ordenar por prioridad, recurrencias (hito 3), mover una tarea a otra área solo se hace desde Editar.
