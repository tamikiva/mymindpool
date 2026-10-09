# Crear el proyecto Supabase de My MindPool

Proyecto nuevo y exclusivo (no usar el de Jaime ni otro existente).

1. En supabase.com → New project. Nombre: `mymindpool`. Región cercana (São Paulo). Guardá la contraseña de la base.
2. SQL Editor → pegá y ejecutá `supabase/migrations/0001_profiles_areas.sql`.
3. Authentication → Providers → Email: activado, con "Confirm email" activo.
4. Authentication → URL Configuration:
   - Site URL: la URL donde publiques la web (en desarrollo, `http://localhost:8081`).
   - Redirect URLs: agregá `http://localhost:8081/**` y `mymindpool://**`.
5. Project Settings → API: copiá **Project URL** y la clave **anon / publishable**.
6. `cp .env.example .env` y completá `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
   **No uses ni pegues la `service_role`** en este proyecto cliente.
7. `npm install && npx expo start --web`.
