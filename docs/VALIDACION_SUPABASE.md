# Validar My MindPool contra Supabase real — paso a paso

**Estado al 2026-11-03 (revisado por Claude):**
- Variables `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` en la sesión: **no están cargadas**.
- Conexión a `fcgriqdzvjqeqblrclzp.supabase.co`: antes respondía (HTTP 401 = «llegué, falta la clave»); ahora el túnel devuelve **502**. Un 403 significa «la política de red lo bloquea»; un 502 significa «la conexión salió pero el servidor de destino no contestó». Lo más probable es que el **proyecto esté pausado** (los proyectos gratuitos de Supabase se pausan tras una semana sin actividad) o que el host no sea correcto. Eso solo se ve en el panel (paso 1).
- Nada de lo que sigue se ejecutó todavía contra Supabase real. Lo probado hasta hoy usa Postgres local (RLS, migraciones) y una API simulada (pantallas).

Los pasos 1 a 6 los hacés vos; el 7 lo corro yo (o lo corrés con un comando).

---

## 1. Ver que el proyecto esté activo
1. Entrá a https://supabase.com/dashboard e iniciá sesión.
2. Abrí el proyecto **mymindpool** (el de `fcgriqdzvjqeqblrclzp`). Si no aparece, avisame: el host del chat podría ser de otro proyecto.
3. Si arriba dice **Paused** / «Project paused», tocá **Restore project** y esperá unos minutos hasta que diga **Active**.
4. **Verificación:** el proyecto figura como activo y la barra superior no muestra avisos rojos.

## 2. Permitir el host en el entorno de Claude (solo si hace falta)
Hoy no es el bloqueo, pero si después ves errores 403:
1. En la barra de título de la sesión, abrí el menú del entorno en la nube → **Edit**.
2. En **Network access**, elegí **Limited** y en **Allowed domains** agregá `fcgriqdzvjqeqblrclzp.supabase.co`. Dejá tildado **Allow package managers**.
3. Guardá.

## 3. Copiar la URL y la clave pública
1. En el panel: **Project Settings** (engranaje, abajo a la izquierda) → **API Keys** (en algunas versiones se llama **API**).
2. Copiá la **Project URL**: tiene la forma `https://fcgriqdzvjqeqblrclzp.supabase.co`.
3. Copiá la clave **publishable** (empieza con `sb_publishable_…`) o, si tu panel solo muestra claves antiguas, la **anon / public** (empieza con `eyJ…`).
4. ⚠️ **No uses** la clave **secret** ni la **service_role**: dan acceso total a los datos y saltan la seguridad. El script de validación las rechaza.

## 4. Cargar las variables en el entorno (nunca pegarlas en el chat)
1. Menú del entorno → **Edit** → sección **Environment variables**.
2. Agregá:
   | Nombre | Valor |
   | --- | --- |
   | `EXPO_PUBLIC_SUPABASE_URL` | la Project URL del paso 3 |
   | `EXPO_PUBLIC_SUPABASE_ANON_KEY` | la clave publishable / anon del paso 3 |
3. Guardá. **Las variables se aplican en una sesión nueva**: abrí una y avisame.

## 5. Crear las tablas (migraciones), en orden
En el panel: **SQL Editor** → **New query**. Para cada archivo: abrilo en el repo, copiá **todo** el contenido, pegalo y tocá **Run** (o Ctrl/Cmd + Enter).

| Orden | Archivo | Qué crea |
| --- | --- | --- |
| 1 | `supabase/migrations/0001_profiles_areas.sql` | perfiles, áreas, onboarding y RLS |
| 2 | `supabase/migrations/0002_tasks.sql` | tareas, completar/deshacer |
| 3 | `supabase/migrations/0003_area_archive_guards.sql` | reglas de archivado |
| 4 | `supabase/migrations/0004_routines.sql` | rutinas, ejecuciones y pasos |
| 5 | `supabase/migrations/0005_day_plans.sql` | plan del día y cierre |
| 6 | `supabase/migrations/0006_recurrences.sql` | tareas repetidas y ocurrencias |

- **Verificación de cada una:** debe decir «Success. No rows returned». Si dice `already exists`, esa migración ya se había corrido: **no la repitas**, pasá a la siguiente y avisame.
- **Verificación final:** pegá esta consulta y correla. Deben aparecer `areas`, `profiles` y `tasks`, las tres con `rowsecurity = true`:
  ```sql
  select tablename, rowsecurity from pg_tables where schemaname = 'public' order by 1;
  ```

## 6. Configurar el acceso por email
1. **Authentication** → **Sign In / Providers** → **Email**: activado, con **Confirm email** encendido.
2. **Authentication** → **URL Configuration**:
   - **Site URL**: por ahora `http://localhost:8081`. Cuando haya un sitio publicado, se cambia por su URL.
   - **Redirect URLs**: agregá `http://localhost:8081/**` y `mymindpool://**`.
3. **Verificación:** las dos pantallas muestran lo que cargaste tras guardar.

> Los enlaces de confirmación de email y de recuperación de contraseña apuntan a esa Site URL. Probarlos de punta a punta requiere una web publicada (ambiente de revisión), que todavía no existe: falta decidir el proveedor de despliegue. Esa parte queda **sin validar** hasta entonces.

## 7. Crear dos cuentas de prueba (sin abrir la app ni recibir emails)
1. **Authentication** → **Users** → **Add user** → **Create new user**.
2. Cargá un email y una contraseña, y **tildá «Auto Confirm User»**. Con Gmail podés usar alias: `tunombre+mp-a@gmail.com` y `tunombre+mp-b@gmail.com` llegan a tu misma casilla.
3. Repetí para una segunda cuenta (B).
4. En el entorno (como en el paso 4) agregá estas cuatro variables con los datos de esas cuentas de prueba: `TEST_A_EMAIL`, `TEST_A_PASSWORD`, `TEST_B_EMAIL`, `TEST_B_PASSWORD`. Usá contraseñas que no uses en ningún otro lado.
5. Abrí una sesión nueva y avisame.

## 8. Correr la validación
Yo la corro; si preferís hacerlo vos en tu computadora con el repo clonado: `npm install && npm run validate:supabase` con las seis variables definidas.

El script hace, contra el proyecto real y con la clave pública:
- entra como A y como B; verifica que existan los perfiles (migración 0001 y su trigger);
- reintenta el onboarding y comprueba que no duplica áreas;
- prueba que A no puede leer, crear, modificar, borrar, mover ni completar nada de B, ni al revés, y que sin sesión no se accede a nada;
- completa y deshace una tarea dos veces y comprueba que no se aplica doble;
- comprueba que no se puede archivar un área con pendientes;
- borra al final las tareas de prueba que creó.

**Cómo leer el resultado:** cada línea dice `OK` o `FALLA → motivo`. Un `FALLA` en una regla de aislamiento es grave: avisame y no compartas la app con nadie hasta resolverlo.

## Qué queda sin validar aunque todo pase
- Confirmación de email y recuperación de contraseña por enlace (necesitan sitio publicado y una casilla real).
- Entrega de emails (el proveedor de correo de Supabase por defecto tiene límites bajos).
- Sesión en iOS/Android (almacén seguro, enlaces profundos).
