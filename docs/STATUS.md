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
