# Pendientes que solo puede resolver la dueña del proyecto

Lista viva. Claude sigue con todo lo demás y la actualiza.

## Bloquean la validación con Supabase real
1. **Cargar las variables en el entorno de la sesión** (menú del entorno → Edit → Environment variables), y abrir una sesión nueva:
   - `EXPO_PUBLIC_SUPABASE_URL=https://fcgriqdzvjqeqblrclzp.supabase.co`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY=` clave anon/publishable (Project Settings → API). **Nunca la `service_role`.**
2. **Ejecutar en el SQL Editor de Supabase, en orden:** `supabase/migrations/0001_profiles_areas.sql`, `0002_tasks.sql` y `0003_area_archive_guards.sql`.
3. En Authentication: Email activado con «Confirm email», y las Redirect URLs `http://localhost:8081/**` y `mymindpool://**` (ver `docs/SETUP_SUPABASE.md`).

## Decisiones y materiales (PRD §25)
4. **Aprobar visualmente el cerebro** (el arte es provisorio) y compartir los **bocetos y el logo como archivos** para dejarlos en el repo.
5. Elegir **tipografía definitiva**; verificar y decidir sobre el **dominio** mymindpool.com (no se registró nada).
6. Probar en **un celular real y Safari iOS** (no se puede desde acá).
7. Confirmar el proveedor y las cuentas de despliegue.
