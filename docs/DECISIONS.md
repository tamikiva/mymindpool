# My MindPool — registro de decisiones

## D-001 · Ubicación (2026-10-09)
My MindPool vive en `mindpool/`, aislado del resto del repositorio (otra app, "Jaime", con otro dominio y datos sensibles). Tiene su propio `package.json`, lockfile, `supabase/` y docs. Nada se importa entre ambas.

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
