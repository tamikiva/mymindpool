# My MindPool — pendientes por revisar

Resumen consolidado de `STATUS.md`, `DECISIONS.md`, `SETUP_SUPABASE.md` y PRD §25 (al 2026-11-06).

## 1. Necesito de vos (bloquean pruebas o avance)
- [ ] **Crear el proyecto Supabase nuevo** `mymindpool` y pasar URL + anon key (nunca la `service_role`). Pasos en `docs/SETUP_SUPABASE.md`. Sin esto, el hito 1 no se puede probar contra un servidor real.
- [ ] **Ejecutar la migración** `supabase/migrations/0001_profiles_areas.sql` en el SQL Editor.
- [ ] Activar Email con "Confirm email" y configurar Site URL / Redirect URLs (`http://localhost:8081/**` y `mymindpool://**`).
- [ ] **Aprobar visualmente el cerebro** (D-004): la silueta actual es abstracta, no reconocible como cerebro, y falta profundidad (paredes con espesor, brillo). El arte es provisorio.
- [ ] Confirmar proveedor y cuentas de despliegue.

## 2. Identidad y marca (PRD §25)
- [ ] Verificar y adquirir dominio (candidato: mymindpool.com). No se pidió ni registró ninguno.
- [ ] Logo vectorial fiel (plano y frontal).
- [ ] Tipografía definitiva.
- [ ] Bocetos: solo se vieron como imágenes en la conversación; **no están como archivos en el repo**. Convendría subirlos.

## 3. Hito 1 — por probar con Supabase real
- [ ] Registro, confirmación por email y recuperación de contraseña.
- [ ] RLS en el servidor real (en local pasan 11 pruebas con PGlite).
- [ ] Onboarding completo (2–8 áreas, idempotencia).

## 4. Limitaciones técnicas conocidas
- [ ] **Nativo no probado**: ni iOS/Android ni Safari iOS (PRD §18).
- [ ] **Sesión en nativo**: `expo-secure-store` limita cada valor a ~2 KB y la sesión de Supabase puede superarlo → fragmentar antes de la beta móvil (hito 7).
- [ ] Sin login con Google/Apple.
- [ ] Sin cambio de contraseña desde Ajustes ni cierre de sesión en todos los dispositivos.
- [ ] Exportación y eliminación de cuenta: esquema y contrato en hito 6 (ya hay `on delete cascade` desde `auth.users`).

## 5. Decisiones de producto a validar (PRD §25)
Valores iniciales propuestos, no preferencias ya expresadas:
- [ ] Pesos de tareas (1–3), capacidad 8, bandas 25 % / 70 %.
- [ ] Rango de 2–8 áreas.
- [ ] Tiempos y límites de avisos de equilibrio (60 min por sesión, máx. 1 por hora y 3 por día).
- [ ] Validar umbrales con usuarios reales.
- [ ] Redactar política de privacidad real antes del lanzamiento.

## 6. Siguiente en el plan
- Cerrar hito 1 (probar contra Supabase real) y actualizar `STATUS.md` / `DECISIONS.md`.
- Luego seguir con los hitos siguientes del PRD (tareas, rutinas, tiempo, avisos, etc.).
