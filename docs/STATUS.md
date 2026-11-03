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
- Migración `supabase/migrations/0002_tasks.sql`: tabla `tasks` con RLS, clave foránea compuesta `(area_id, user_id)` (una tarea no puede apuntar al área de otro usuario) y `complete_task` / `undo_complete_task` idempotentes. El nivel del agua se deriva de las filas; no hay contador guardado.
- 13 pruebas nuevas con Postgres local (`tests/tasks.test.ts`): aislamiento entre usuarios, completar dos veces resta una sola vez, deshacer repone una sola vez, cancelar/eliminar libera carga sin contar como realizada, tarea futura no llena el agua, peso 2 en capacidad 8 = 25 %.
- Mi equilibrio usa tareas reales: carga por área, tocar una pileta muestra sus tareas, entrada rápida, completar y deshacer. Un fallo de escritura muestra el error y conserva lo escrito.
- `package-lock.json` resincronizado (`npm ci` fallaba).
- `typecheck`, 43 pruebas y `export:web` en verde.

Pendiente:
- Nada de esto se probó contra el Supabase real: requiere `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_ANON_KEY` en el entorno y correr `0001` y `0002` en el SQL Editor. La red al host ya está habilitada.
- Pantalla de Tareas con filtros, completadas, futuras y vencidas; edición, mover de área, pospone, eliminar con deshacer; peso/fecha en el formulario; pantalla de área; mover pendientes al archivar un área.
- La interfaz de tareas no se verificó visualmente en navegador.
