/**
 * Arma los archivos SQL para pegar en el SQL Editor de Supabase:
 *   supabase/all-migrations.sql  las migraciones en orden, en UNA transacción, con verificación antes y después
 *   supabase/verify.sql          comprobaciones de solo lectura (una fila por comprobación: OK o FALTA)
 *   supabase/undo-all.sql        deshace todo (BORRA DATOS: solo para una base recién creada)
 *   supabase/tx-test.sql         prueba de 1 minuto de cómo trata el editor las transacciones (sin riesgo)
 * Uso: npm run build:sql
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const DIR = path.join(ROOT, "supabase");

export const TABLES = [
  "profiles", "areas", "tasks",
  "routine_templates", "routine_template_steps", "routine_runs", "routine_run_steps",
  "day_plans", "day_plan_areas", "day_plan_items",
  "recurrence_rules", "recurring_tasks", "task_occurrences",
];
/** Tablas que se escriben solo con funciones: la persona autenticada no puede insertar/modificar/borrar directo. */
const READ_ONLY_FOR_USERS = TABLES.filter((t) => !["profiles", "areas", "tasks"].includes(t));
export const FUNCTIONS = [
  "touch_updated_at()", "enforce_max_active_areas()", "handle_new_user()", "guard_area_archive()",
  "complete_onboarding(text,jsonb)", "complete_task(uuid)", "undo_complete_task(uuid)",
  "save_routine_template(uuid,text,uuid,text,jsonb)", "archive_routine_template(uuid,boolean)", "start_routine_run(uuid,text,date)",
  "advance_run_step(uuid,text)", "set_run_state(uuid,text)",
  "save_day_plan(date,integer,jsonb,jsonb)", "close_day_plan(date,uuid[])",
  "rule_matches(text,integer,smallint[],date,date)",
  "save_recurring_task(uuid,uuid,text,text,integer,text,text,integer,integer[],date,date,text,date)",
  "ensure_occurrences(date,date)", "set_occurrence_state(uuid,text)", "archive_recurring_task(uuid,date)",
];
const list = (xs) => xs.map((x) => `'${x}'`).join(", ");

function migrations() {
  return fs.readdirSync(path.join(DIR, "migrations")).filter((f) => f.endsWith(".sql")).sort()
    .map((f) => ({ name: f, sql: fs.readFileSync(path.join(DIR, "migrations", f), "utf8").trim() }));
}

const PREFLIGHT = `-- Verificación previa: si ya hay tablas de My MindPool no se aplica NADA (evita dejar la base a medias).
do $$
declare t text;
begin
  foreach t in array array[${list(TABLES)}] loop
    if to_regclass('public.' || t) is not null then
      raise exception 'La tabla public.% ya existe: no se aplica nada. Corré supabase/verify.sql para ver el estado.', t;
    end if;
  end loop;
end $$;`;

const POSTFLIGHT = `-- Verificación final DENTRO de la transacción: si algo quedó mal, se cancela todo antes de confirmar.
do $$
declare t text; f text; n int;
begin
  foreach t in array array[${list(TABLES)}] loop
    if to_regclass('public.' || t) is null then raise exception 'Falta la tabla public.%', t; end if;
    if not (select relrowsecurity from pg_class where oid = to_regclass('public.' || t)) then
      raise exception 'RLS no está activo en public.%', t;
    end if;
    select count(*) into n from pg_policies where schemaname = 'public' and tablename = t;
    if n < 1 then raise exception 'public.% no tiene políticas RLS', t; end if;
    if has_table_privilege('anon', to_regclass('public.' || t), 'select, insert, update, delete') or
       has_table_privilege('anon', to_regclass('public.' || t), 'select') then
      raise exception 'El rol anon tiene acceso a public.%', t;
    end if;
  end loop;
  foreach t in array array[${list(READ_ONLY_FOR_USERS)}] loop
    if has_table_privilege('authenticated', to_regclass('public.' || t), 'insert') or
       has_table_privilege('authenticated', to_regclass('public.' || t), 'update') or
       has_table_privilege('authenticated', to_regclass('public.' || t), 'delete') then
      raise exception 'authenticated puede escribir directo en public.% (debe ser solo lectura)', t;
    end if;
  end loop;
  foreach f in array array[${list(FUNCTIONS)}] loop
    if to_regprocedure('public.' || f) is null then raise exception 'Falta la función public.%', f; end if;
    if has_function_privilege('anon', to_regprocedure('public.' || f), 'execute') then
      raise exception 'El rol anon puede ejecutar public.%', f;
    end if;
  end loop;
  if not exists (select 1 from pg_trigger where tgname = 'on_auth_user_created' and not tgisinternal) then
    raise exception 'Falta el disparador de alta de perfil en auth.users';
  end if;
end $$;`;

export function buildBundle() {
  const ms = migrations();
  const parts = [
    `-- My MindPool · TODAS las migraciones en orden, en una sola transacción.
-- Generado por scripts/sql-bundle.mjs: no se edita a mano (npm run build:sql).
--
-- Cómo se ejecuta: BEGIN … COMMIT explícitos. Si CUALQUIER sentencia falla, Postgres aborta la
-- transacción: lo que sigue se ignora y el COMMIT final actúa como ROLLBACK. No queda nada a medias.
-- Pegá TODO el contenido en el SQL Editor y tocá Run UNA sola vez.
-- Contiene: ${ms.map((m) => m.name.replace(".sql", "")).join(", ")}.

begin;

${PREFLIGHT}
`,
    ...ms.map((m) => `-- ============================================================================\n-- ${m.name}\n-- ============================================================================\n\n${m.sql}\n`),
    `-- ============================================================================\n-- Verificación final y confirmación\n-- ============================================================================\n\n${POSTFLIGHT}\n\ncommit;\n`,
  ];
  return parts.join("\n");
}

export function buildVerify() {
  const tbl = `(values ${TABLES.map((t) => `('${t}')`).join(", ")}) as e(t)`;
  const ro = `(values ${READ_ONLY_FOR_USERS.map((t) => `('${t}')`).join(", ")}) as e(t)`;
  const fn = `(values ${FUNCTIONS.map((f) => `('${f}')`).join(", ")}) as e(f)`;
  return `-- My MindPool · verificación de solo lectura. No cambia nada. Cada fila es una comprobación: OK o un problema.
-- Corrélo DESPUÉS de las migraciones. Resultado esperado: ${TABLES.length * 4 + READ_ONLY_FOR_USERS.length + FUNCTIONS.length * 2 + 1} filas, todas empezando con «OK».
select * from (
  select 1 as o, 'Tabla ' || t as comprobacion,
         case when to_regclass('public.' || t) is not null then 'OK' else 'FALTA la tabla' end as estado
    from ${tbl}
  union all
  select 2, 'RLS activo en ' || t,
         case when coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.' || t)), false) then 'OK' else 'FALTA activar RLS' end
    from ${tbl}
  union all
  select 3, 'Políticas RLS en ' || t,
         case when (select count(*) from pg_policies where schemaname = 'public' and tablename = t) >= 1
              then 'OK (' || (select count(*) from pg_policies where schemaname = 'public' and tablename = t) || ' políticas)' else 'FALTAN políticas' end
    from ${tbl}
  union all
  select 4, 'Sin acceso para anon (sin sesión) en ' || t,
         case when to_regclass('public.' || t) is null then 'FALTA la tabla'
              when has_table_privilege('anon', to_regclass('public.' || t), 'select') then 'EXPUESTO: anon puede leer' else 'OK' end
    from ${tbl}
  union all
  select 5, 'authenticated solo lee (escribe con funciones) en ' || t,
         case when to_regclass('public.' || t) is null then 'FALTA la tabla'
              when has_table_privilege('authenticated', to_regclass('public.' || t), 'insert') or has_table_privilege('authenticated', to_regclass('public.' || t), 'update') or has_table_privilege('authenticated', to_regclass('public.' || t), 'delete')
              then 'EXPUESTO: puede escribir directo' else 'OK' end
    from ${ro}
  union all
  select 6, 'Función ' || f,
         case when to_regprocedure('public.' || f) is not null then 'OK' else 'FALTA la función' end
    from ${fn}
  union all
  select 7, 'anon no puede ejecutar ' || f,
         case when to_regprocedure('public.' || f) is null then 'FALTA la función'
              when has_function_privilege('anon', to_regprocedure('public.' || f), 'execute') then 'EXPUESTO' else 'OK' end
    from ${fn}
  union all
  select 8, 'Disparador que crea el perfil al registrarse',
         case when exists (select 1 from pg_trigger where tgname = 'on_auth_user_created' and not tgisinternal) then 'OK' else 'FALTA' end
) r
order by (case when estado like 'OK%' then 1 else 0 end), o, comprobacion;
`;
}

export function buildUndo() {
  return `-- My MindPool · DESHACER TODO. ¡BORRA LOS DATOS de estas tablas! Solo para una base recién creada.
-- Úsalo únicamente si las migraciones quedaron a medias y querés empezar de cero.
begin;
drop trigger if exists on_auth_user_created on auth.users;
drop table if exists
  public.task_occurrences, public.recurring_tasks, public.recurrence_rules,
  public.day_plan_items, public.day_plan_areas, public.day_plans,
  public.routine_run_steps, public.routine_runs, public.routine_template_steps, public.routine_templates,
  public.tasks, public.areas, public.profiles
cascade;
${FUNCTIONS.map((f) => `drop function if exists public.${f};`).join("\n")}
commit;
`;
}

export const TX_TEST = `-- Prueba de transacciones del SQL Editor (1 minuto, sin riesgo: usa una tabla temporal de prueba).
-- PASO 1: pegá SOLO este bloque y tocá Run. DEBE fallar con «division by zero»; es lo esperado.
begin;
create table public._mp_tx_test (x int);
select 1 / 0;
commit;

-- PASO 2: borrá el editor, pegá SOLO la línea siguiente y tocá Run:
--   select to_regclass('public._mp_tx_test') as quedo_la_tabla;
--   · Si devuelve vacío (null): la transacción se canceló entera. El archivo grande es seguro.
--   · Si devuelve public._mp_tx_test: el editor NO respeta la transacción. No corras el archivo grande: avisame.
--   · Si da «current transaction is aborted»: corré primero  rollback;  y repetí este paso 2.
-- PASO 3 (limpieza, solo si en el paso 2 quedó la tabla):  drop table public._mp_tx_test;
`;

if (process.argv[1] === new URL(import.meta.url).pathname) {
  fs.writeFileSync(path.join(DIR, "all-migrations.sql"), buildBundle());
  fs.writeFileSync(path.join(DIR, "verify.sql"), buildVerify());
  fs.writeFileSync(path.join(DIR, "undo-all.sql"), buildUndo());
  fs.writeFileSync(path.join(DIR, "tx-test.sql"), TX_TEST);
  console.log("OK · supabase/all-migrations.sql, verify.sql, undo-all.sql, tx-test.sql");
}
