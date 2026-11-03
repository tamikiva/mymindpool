# Pendientes que solo puede resolver la dueña del proyecto

Lista viva. Claude sigue con todo lo demás y la actualiza.

## Bloquean la validación con Supabase real
Guía completa, con dónde entrar y cómo verificar cada paso: **`docs/VALIDACION_SUPABASE.md`**. En resumen:
1. Revisar en el panel que el proyecto `mymindpool` esté **activo** (hoy el host da 502: probablemente pausado) y restaurarlo si hace falta.
2. Cargar en el entorno `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_ANON_KEY` (clave publishable/anon, **nunca** la secret/service_role), sin pegarlas en el chat.
3. Correr las migraciones `0001` a `0006` (`supabase/migrations/`) en el SQL Editor, en ese orden.
4. Activar Email con «Confirm email» y cargar las Redirect URLs.
5. Crear dos usuarios de prueba (Authentication → Users → Add user, con «Auto Confirm User») y cargar `TEST_A_EMAIL`, `TEST_A_PASSWORD`, `TEST_B_EMAIL`, `TEST_B_PASSWORD` en el entorno.
6. Abrir una sesión nueva y avisar a Claude, que corre `npm run validate:supabase`.

## Decisiones y materiales (PRD §25)
4. **Aprobar o ajustar la dirección visual del cerebro 3D** (`docs/capturas/1-equilibrio.png`, `1b-…`, `7-…`) y decidir: ¿alcanza este 3D estilizado o querés invertir en arte/modelado más cercano al render fotorrealista? Compartir además los **bocetos y el logo como archivos** para dejarlos en el repo.
4b. Decidir: nombre en pantalla (**My MindPool** del PRD vs. **En calma** de las referencias), pestañas (¿una pantalla «Áreas»?) y color del botón principal (más claro = menos contraste).
5. Elegir **tipografía definitiva**; verificar y decidir sobre el **dominio** mymindpool.com (no se registró nada).
6. Elegir **dónde publicar un ambiente de revisión** (hace falta para probar enlaces de confirmación/recuperación y para que veas la app sin instalar nada).
7. Probar en **un celular real y Safari iOS**: el 3D se midió solo con render por software; hace falta ver fluidez y consumo reales (no se puede desde acá).
