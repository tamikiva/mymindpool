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

## D-004 · Cerebro del hito 0
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

