-- My MindPool · TODAS las migraciones en orden, en una sola transacción.
-- Generado por scripts/sql-bundle.mjs: no se edita a mano (npm run build:sql).
--
-- Cómo se ejecuta: BEGIN … COMMIT explícitos. Si CUALQUIER sentencia falla, Postgres aborta la
-- transacción: lo que sigue se ignora y el COMMIT final actúa como ROLLBACK. No queda nada a medias.
-- Pegá TODO el contenido en el SQL Editor y tocá Run UNA sola vez.
-- Contiene: 0001_profiles_areas, 0002_tasks, 0003_area_archive_guards, 0004_routines, 0005_day_plans, 0006_recurrences, 0007_lock_down_grants.

begin;

-- Verificación previa: si ya hay tablas de My MindPool no se aplica NADA (evita dejar la base a medias).
do $$
declare t text;
begin
  foreach t in array array['profiles', 'areas', 'tasks', 'routine_templates', 'routine_template_steps', 'routine_runs', 'routine_run_steps', 'day_plans', 'day_plan_areas', 'day_plan_items', 'recurrence_rules', 'recurring_tasks', 'task_occurrences'] loop
    if to_regclass('public.' || t) is not null then
      raise exception 'La tabla public.% ya existe: no se aplica nada. Corré supabase/verify.sql para ver el estado.', t;
    end if;
  end loop;
end $$;

-- ============================================================================
-- 0001_profiles_areas.sql
-- ============================================================================

-- My MindPool · hito 1: perfiles, áreas y onboarding idempotente, con RLS.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) <= 60),
  locale text not null default 'es-AR',
  timezone text not null default 'America/Argentina/Buenos_Aires',
  week_starts_on smallint not null default 1 check (week_starts_on between 0 and 6),
  reduce_motion boolean not null default false,
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.areas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  color_key text not null check (color_key in
    ('lila','celeste','verde','rosa','durazno','menta','malva','cielo')),
  position smallint not null check (position between 0 and 7),
  capacity smallint not null default 8 check (capacity between 1 and 100),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Permite que tablas futuras referencien (area_id, user_id) y así
  -- garanticen que tarea y área pertenecen al mismo usuario.
  unique (id, user_id)
);

create unique index areas_user_name_active on public.areas (user_id, lower(btrim(name)))
  where archived_at is null;
create unique index areas_user_position_active on public.areas (user_id, position)
  where archived_at is null;

create function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger areas_touch before update on public.areas
  for each row execute function public.touch_updated_at();

-- Máximo 8 áreas activas (PRD §7).
create function public.enforce_max_active_areas() returns trigger
language plpgsql as $$
begin
  if new.archived_at is null and (
    select count(*) from public.areas
    where user_id = new.user_id and archived_at is null and id <> new.id
  ) >= 8 then
    raise exception 'Máximo de 8 áreas activas' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger areas_max_active before insert or update on public.areas
  for each row execute function public.enforce_max_active_areas();

-- Perfil automático al registrarse.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.areas enable row level security;

create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
-- Sin insert/delete directos: el perfil lo crea el trigger y se borra en cascada
-- con la cuenta (proceso de servidor, hito 6).

create policy areas_select on public.areas for select to authenticated
  using (user_id = (select auth.uid()));
create policy areas_insert on public.areas for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy areas_update on public.areas for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy areas_delete on public.areas for delete to authenticated
  using (user_id = (select auth.uid()));

grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.areas to authenticated;

-- Onboarding atómico e idempotente: una sola configuración por usuario.
-- p_areas: [{"name": "Casa", "color_key": "lila"}, ...] (2 a 8, en orden).
create function public.complete_onboarding(p_display_name text, p_areas jsonb)
returns void
language plpgsql security invoker set search_path = public as $$
declare
  uid uuid := auth.uid();
  n int;
  i int;
begin
  if uid is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;
  -- Bloquea el perfil: dos reintentos simultáneos se serializan.
  perform 1 from public.profiles where id = uid for update;
  if not found then
    raise exception 'Perfil inexistente' using errcode = 'no_data_found';
  end if;
  if exists (select 1 from public.profiles where id = uid and onboarding_completed_at is not null) then
    return; -- ya configurado: reintentar o refrescar no duplica nada
  end if;
  if jsonb_typeof(p_areas) <> 'array' then
    raise exception 'Áreas inválidas' using errcode = 'invalid_parameter_value';
  end if;
  n := jsonb_array_length(p_areas);
  if n < 2 or n > 8 then
    raise exception 'Elegí entre 2 y 8 áreas' using errcode = 'invalid_parameter_value';
  end if;
  for i in 0 .. n - 1 loop
    insert into public.areas (user_id, name, color_key, position)
    values (uid, btrim(p_areas -> i ->> 'name'), p_areas -> i ->> 'color_key', i);
  end loop;
  update public.profiles
     set onboarding_completed_at = now(),
         display_name = nullif(btrim(p_display_name), '')
   where id = uid;
end $$;

revoke all on function public.complete_onboarding(text, jsonb) from public, anon;
grant execute on function public.complete_onboarding(text, jsonb) to authenticated;

-- ============================================================================
-- 0002_tasks.sql
-- ============================================================================

-- My MindPool · hito 2: tareas con RLS, completar/deshacer idempotentes.
-- El nivel del agua se deriva de estas filas; no se guarda ningún contador.

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  area_id uuid not null,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  note text check (note is null or char_length(note) <= 2000),
  status text not null default 'pending'
    check (status in ('pending','in_progress','completed','cancelled','archived')),
  weight smallint not null default 1 check (weight between 1 and 3),
  priority text not null default 'normal' check (priority in ('normal','important','urgent')),
  scheduled_date date,
  estimate_minutes integer check (estimate_minutes is null or estimate_minutes between 0 and 1440),
  someday boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- La tarea y su área deben pertenecer al mismo usuario aunque el cliente
  -- manipule los UUID (PRD §5 y §16).
  foreign key (area_id, user_id) references public.areas (id, user_id) on delete restrict,
  check ((status = 'completed') = (completed_at is not null))
);

create index tasks_user_area_status on public.tasks (user_id, area_id, status);
create index tasks_user_date on public.tasks (user_id, scheduled_date);

create trigger tasks_touch before update on public.tasks
  for each row execute function public.touch_updated_at();

alter table public.tasks enable row level security;

create policy tasks_select on public.tasks for select to authenticated
  using (user_id = (select auth.uid()));
create policy tasks_insert on public.tasks for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy tasks_update on public.tasks for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy tasks_delete on public.tasks for delete to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.tasks to authenticated;

-- Completar resta su peso una sola vez: si ya está completada, no hace nada.
create function public.complete_task(p_task_id uuid) returns void
language plpgsql security invoker set search_path = public as $$
begin
  update public.tasks
     set status = 'completed', completed_at = now()
   where id = p_task_id
     and user_id = auth.uid()
     and status in ('pending', 'in_progress');
  if not found and not exists (
    select 1 from public.tasks where id = p_task_id and user_id = auth.uid()
  ) then
    raise exception 'Tarea inexistente' using errcode = 'no_data_found';
  end if;
end $$;

-- Deshacer repone el peso: solo actúa sobre una tarea completada.
create function public.undo_complete_task(p_task_id uuid) returns void
language plpgsql security invoker set search_path = public as $$
begin
  update public.tasks
     set status = 'pending', completed_at = null
   where id = p_task_id
     and user_id = auth.uid()
     and status = 'completed';
  if not found and not exists (
    select 1 from public.tasks where id = p_task_id and user_id = auth.uid()
  ) then
    raise exception 'Tarea inexistente' using errcode = 'no_data_found';
  end if;
end $$;

revoke all on function public.complete_task(uuid) from public, anon;
revoke all on function public.undo_complete_task(uuid) from public, anon;
grant execute on function public.complete_task(uuid) to authenticated;
grant execute on function public.undo_complete_task(uuid) to authenticated;

-- ============================================================================
-- 0003_area_archive_guards.sql
-- ============================================================================

-- My MindPool · hito 2: archivar un área no puede perder pendientes ni dejar menos de 2 áreas (PRD §7).

create function public.guard_area_archive() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.archived_at is null and new.archived_at is not null then
    if exists (
      select 1 from public.tasks
      where area_id = new.id and status in ('pending', 'in_progress')
    ) then
      raise exception 'El área tiene pendientes: movelos a otra área antes de archivarla'
        using errcode = 'check_violation';
    end if;
    if (
      select count(*) from public.areas
      where user_id = new.user_id and archived_at is null and id <> new.id
    ) < 2 then
      raise exception 'Tienen que quedar al menos 2 áreas activas'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;

create trigger areas_guard_archive before update on public.areas
  for each row execute function public.guard_area_archive();

-- ============================================================================
-- 0004_routines.sql
-- ============================================================================

-- My MindPool · hito 3 (parte 1): rutinas, instancias de ejecución y pasos copiados.
--
-- Diseño (PRD §11 y §16):
--  * La plantilla y sus pasos se guardan de forma atómica (save_routine_template).
--  * Ejecutar una rutina crea una INSTANCIA con una copia de los pasos y pesos: editar la
--    plantilla después no reescribe ejecuciones en curso ni el historial.
--  * El primer paso de la plantilla es la «acción inicial» estable: siempre va primero y
--    también en la versión corta.
--  * La carga de una rutina es la suma de sus pasos abiertos; no hay «tarea padre» que cuente.
--  * Las tablas de rutinas se escriben SOLO con las funciones de abajo (sin grants de escritura
--    directos), para que no se pueda saltar el orden de los pasos ni marcar algo dos veces.

create table public.routine_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  default_area_id uuid,
  -- Señal opcional («Después de cerrar la computadora»). Es un texto de apoyo, no suma carga.
  start_cue text check (start_cue is null or char_length(btrim(start_cue)) between 1 and 200),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (default_area_id, user_id) references public.areas (id, user_id) on delete restrict
);
create unique index routine_templates_user_name_active
  on public.routine_templates (user_id, lower(btrim(name))) where archived_at is null;

create table public.routine_template_steps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  template_id uuid not null,
  position smallint not null check (position between 0 and 19),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  area_id uuid not null,
  weight smallint not null default 1 check (weight between 1 and 3),
  duration_minutes integer check (duration_minutes is null or duration_minutes between 0 and 1440),
  in_short boolean not null default false,
  unique (template_id, position),
  foreign key (template_id, user_id) references public.routine_templates (id, user_id) on delete cascade,
  foreign key (area_id, user_id) references public.areas (id, user_id) on delete restrict
);

create table public.routine_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  template_id uuid,
  -- Copias: el historial no cambia si la plantilla se renombra o se archiva.
  template_name text not null,
  version text not null check (version in ('full', 'short')),
  status text not null default 'active' check (status in ('active', 'paused', 'completed', 'cancelled')),
  run_date date not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (template_id, user_id) references public.routine_templates (id, user_id)
    on delete set null (template_id),
  check ((status in ('completed', 'cancelled')) = (ended_at is not null))
);
-- Un solo recorrido abierto por plantilla: tocar «Empezar» dos veces no lo duplica.
create unique index routine_runs_one_open
  on public.routine_runs (user_id, template_id) where status in ('active', 'paused') and template_id is not null;

create table public.routine_run_steps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  run_id uuid not null,
  position smallint not null check (position between 0 and 19),
  title text not null,
  area_id uuid not null,
  weight smallint not null check (weight between 1 and 3),
  duration_minutes integer,
  status text not null default 'pending' check (status in ('pending', 'done', 'skipped', 'cancelled')),
  done_at timestamptz,
  unique (run_id, position),
  foreign key (run_id, user_id) references public.routine_runs (id, user_id) on delete cascade,
  foreign key (area_id, user_id) references public.areas (id, user_id) on delete restrict,
  check ((status = 'done') = (done_at is not null))
);
create index routine_run_steps_open on public.routine_run_steps (user_id, area_id) where status = 'pending';

create trigger routine_templates_touch before update on public.routine_templates
  for each row execute function public.touch_updated_at();
create trigger routine_runs_touch before update on public.routine_runs
  for each row execute function public.touch_updated_at();

alter table public.routine_templates enable row level security;
alter table public.routine_template_steps enable row level security;
alter table public.routine_runs enable row level security;
alter table public.routine_run_steps enable row level security;

create policy routine_templates_select on public.routine_templates for select to authenticated
  using (user_id = (select auth.uid()));
create policy routine_template_steps_select on public.routine_template_steps for select to authenticated
  using (user_id = (select auth.uid()));
create policy routine_runs_select on public.routine_runs for select to authenticated
  using (user_id = (select auth.uid()));
create policy routine_run_steps_select on public.routine_run_steps for select to authenticated
  using (user_id = (select auth.uid()));

-- Solo lectura directa; todo lo demás pasa por las funciones.
grant select on public.routine_templates, public.routine_template_steps,
  public.routine_runs, public.routine_run_steps to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Guardar plantilla + pasos en una sola operación atómica.
-- p_steps: [{"title": "...", "area_id": "<uuid>", "weight": 1, "duration_minutes": 5, "in_short": true}, ...]
-- El primer paso es la acción inicial. Devuelve el id de la plantilla.
create function public.save_routine_template(
  p_id uuid, p_name text, p_default_area uuid, p_cue text, p_steps jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  tid uuid;
  n int;
  i int;
  s jsonb;
  s_area uuid;
begin
  if uid is null then raise exception 'No autenticado' using errcode = '28000'; end if;
  if jsonb_typeof(p_steps) <> 'array' then
    raise exception 'Pasos inválidos' using errcode = 'invalid_parameter_value';
  end if;
  n := jsonb_array_length(p_steps);
  if n < 1 or n > 20 then
    raise exception 'Una rutina tiene entre 1 y 20 pasos' using errcode = 'invalid_parameter_value';
  end if;
  if p_default_area is not null and not exists (
    select 1 from public.areas where id = p_default_area and user_id = uid and archived_at is null
  ) then
    raise exception 'Área inválida' using errcode = 'invalid_parameter_value';
  end if;

  if p_id is null then
    insert into public.routine_templates (user_id, name, default_area_id, start_cue)
    values (uid, btrim(p_name), p_default_area, nullif(btrim(coalesce(p_cue, '')), ''))
    returning id into tid;
  else
    select id into tid from public.routine_templates
     where id = p_id and user_id = uid and archived_at is null for update;
    if tid is null then raise exception 'Rutina inexistente' using errcode = 'no_data_found'; end if;
    update public.routine_templates
       set name = btrim(p_name), default_area_id = p_default_area,
           start_cue = nullif(btrim(coalesce(p_cue, '')), '')
     where id = tid;
    delete from public.routine_template_steps where template_id = tid;
  end if;

  for i in 0 .. n - 1 loop
    s := p_steps -> i;
    s_area := nullif(s ->> 'area_id', '')::uuid;
    if s_area is null or not exists (
      select 1 from public.areas where id = s_area and user_id = uid and archived_at is null
    ) then
      raise exception 'El paso % usa un área inválida', i + 1 using errcode = 'invalid_parameter_value';
    end if;
    insert into public.routine_template_steps
      (user_id, template_id, position, title, area_id, weight, duration_minutes, in_short)
    values (uid, tid, i, btrim(s ->> 'title'), s_area,
            coalesce((s ->> 'weight')::smallint, 1),
            nullif(s ->> 'duration_minutes', '')::integer,
            coalesce((s ->> 'in_short')::boolean, false));
  end loop;
  return tid;
end $$;

create function public.archive_routine_template(p_id uuid, p_archived boolean) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'No autenticado' using errcode = '28000'; end if;
  update public.routine_templates
     set archived_at = case when p_archived then coalesce(archived_at, now()) else null end
   where id = p_id and user_id = uid;
  if not found then raise exception 'Rutina inexistente' using errcode = 'no_data_found'; end if;
end $$;

-- Empezar una rutina: copia los pasos. Idempotente: si ya hay una abierta, devuelve esa.
-- p_version 'short' = acción inicial + pasos marcados como cortos.
create function public.start_routine_run(p_template_id uuid, p_version text, p_run_date date)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  t public.routine_templates%rowtype;
  rid uuid;
  copied int;
begin
  if uid is null then raise exception 'No autenticado' using errcode = '28000'; end if;
  if p_version not in ('full', 'short') then
    raise exception 'Versión inválida' using errcode = 'invalid_parameter_value';
  end if;
  select * into t from public.routine_templates
   where id = p_template_id and user_id = uid and archived_at is null for update;
  if not found then raise exception 'Rutina inexistente' using errcode = 'no_data_found'; end if;

  select id into rid from public.routine_runs
   where user_id = uid and template_id = t.id and status in ('active', 'paused');
  if rid is not null then return rid; end if;

  if p_version = 'short' and not exists (
    select 1 from public.routine_template_steps where template_id = t.id and position > 0 and in_short
  ) then
    raise exception 'Esta rutina no tiene versión corta' using errcode = 'invalid_parameter_value';
  end if;
  if exists (
    select 1 from public.routine_template_steps s join public.areas a on a.id = s.area_id
     where s.template_id = t.id and a.archived_at is not null
  ) then
    raise exception 'La rutina usa un área archivada: editala antes de empezar' using errcode = 'check_violation';
  end if;

  insert into public.routine_runs (user_id, template_id, template_name, version, run_date)
  values (uid, t.id, t.name, p_version, p_run_date) returning id into rid;

  insert into public.routine_run_steps (user_id, run_id, position, title, area_id, weight, duration_minutes)
  select uid, rid, (row_number() over (order by s.position) - 1)::smallint,
         s.title, s.area_id, s.weight, s.duration_minutes
    from public.routine_template_steps s
   where s.template_id = t.id and (p_version = 'full' or s.position = 0 or s.in_short)
   order by s.position;
  get diagnostics copied = row_count;
  if copied = 0 then raise exception 'La rutina no tiene pasos' using errcode = 'invalid_parameter_value'; end if;
  return rid;
end $$;

-- Completa o salta el paso ACTUAL (el primero pendiente). Repetir la misma acción no hace nada.
-- Devuelve el estado de la rutina: 'active' o 'completed' (si era el último).
create function public.advance_run_step(p_step_id uuid, p_action text) returns text
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  st public.routine_run_steps%rowtype;
  r public.routine_runs%rowtype;
  target text;
begin
  if uid is null then raise exception 'No autenticado' using errcode = '28000'; end if;
  if p_action not in ('complete', 'skip') then
    raise exception 'Acción inválida' using errcode = 'invalid_parameter_value';
  end if;
  target := case p_action when 'complete' then 'done' else 'skipped' end;

  select * into st from public.routine_run_steps where id = p_step_id and user_id = uid;
  if not found then raise exception 'Paso inexistente' using errcode = 'no_data_found'; end if;
  select * into r from public.routine_runs where id = st.run_id and user_id = uid for update;

  if st.status = target then return r.status; end if; -- ya aplicado: sin doble efecto
  if st.status <> 'pending' then
    raise exception 'Este paso ya está resuelto' using errcode = 'check_violation';
  end if;
  if r.status = 'paused' then
    raise exception 'La rutina está en pausa: retomala primero' using errcode = 'check_violation';
  end if;
  if r.status <> 'active' then
    raise exception 'La rutina ya terminó' using errcode = 'check_violation';
  end if;
  if exists (
    select 1 from public.routine_run_steps
     where run_id = r.id and status = 'pending' and position < st.position
  ) then
    raise exception 'No es el paso actual' using errcode = 'check_violation';
  end if;

  update public.routine_run_steps
     set status = target, done_at = case when target = 'done' then now() else null end
   where id = st.id;
  if not exists (select 1 from public.routine_run_steps where run_id = r.id and status = 'pending') then
    update public.routine_runs set status = 'completed', ended_at = now() where id = r.id;
    return 'completed';
  end if;
  return 'active';
end $$;

-- Pausar, retomar o cancelar el recorrido. Cancelar libera la carga de los pasos pendientes
-- sin marcarlos como hechos.
create function public.set_run_state(p_run_id uuid, p_action text) returns text
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  r public.routine_runs%rowtype;
begin
  if uid is null then raise exception 'No autenticado' using errcode = '28000'; end if;
  if p_action not in ('pause', 'resume', 'cancel') then
    raise exception 'Acción inválida' using errcode = 'invalid_parameter_value';
  end if;
  select * into r from public.routine_runs where id = p_run_id and user_id = uid for update;
  if not found then raise exception 'Rutina inexistente' using errcode = 'no_data_found'; end if;

  if p_action = 'cancel' then
    if r.status = 'cancelled' then return r.status; end if;
    if r.status = 'completed' then raise exception 'La rutina ya terminó' using errcode = 'check_violation'; end if;
    update public.routine_run_steps set status = 'cancelled' where run_id = r.id and status = 'pending';
    update public.routine_runs set status = 'cancelled', ended_at = now() where id = r.id;
    return 'cancelled';
  end if;
  if r.status in ('completed', 'cancelled') then
    raise exception 'La rutina ya terminó' using errcode = 'check_violation';
  end if;
  update public.routine_runs set status = case p_action when 'pause' then 'paused' else 'active' end
   where id = r.id;
  return case p_action when 'pause' then 'paused' else 'active' end;
end $$;

revoke all on function public.save_routine_template(uuid, text, uuid, text, jsonb) from public, anon;
revoke all on function public.archive_routine_template(uuid, boolean) from public, anon;
revoke all on function public.start_routine_run(uuid, text, date) from public, anon;
revoke all on function public.advance_run_step(uuid, text) from public, anon;
revoke all on function public.set_run_state(uuid, text) from public, anon;
grant execute on function public.save_routine_template(uuid, text, uuid, text, jsonb) to authenticated;
grant execute on function public.archive_routine_template(uuid, boolean) to authenticated;
grant execute on function public.start_routine_run(uuid, text, date) to authenticated;
grant execute on function public.advance_run_step(uuid, text) to authenticated;
grant execute on function public.set_run_state(uuid, text) to authenticated;

-- Archivar un área tampoco puede dejar pasos de rutina abiertos (amplía la guarda de 0003).
create or replace function public.guard_area_archive() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.archived_at is null and new.archived_at is not null then
    if exists (
      select 1 from public.tasks
      where area_id = new.id and status in ('pending', 'in_progress')
    ) or exists (
      select 1 from public.routine_run_steps
      where area_id = new.id and status = 'pending'
    ) then
      raise exception 'El área tiene pendientes: movelos a otra área antes de archivarla'
        using errcode = 'check_violation';
    end if;
    if (
      select count(*) from public.areas
      where user_id = new.user_id and archived_at is null and id <> new.id
    ) < 2 then
      raise exception 'Tienen que quedar al menos 2 áreas activas'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;

-- ============================================================================
-- 0005_day_plans.sql
-- ============================================================================

-- My MindPool · hito 3 (parte 2): planificación del día por áreas (PRD §10).
--
--  * Un plan por usuaria y fecha local. Se guarda de forma atómica y se puede editar durante el día.
--  * Las áreas elegidas llevan un momento aproximado y minutos previstos (opcionales).
--  * Los ítems referencian tareas o plantillas de rutina propias; no copian su estado: completar
--    sigue siendo de la tarea o del recorrido, así no hay doble conteo.
--  * Cerrar el día traslada SOLO las tareas elegidas, sin duplicar pendientes al cambiar de día.
--  * Lectura directa con RLS; escritura solo con funciones.

-- Permite referencias (task_id, user_id): una tarea y su plan pertenecen a la misma usuaria.
alter table public.tasks add constraint tasks_id_user_unique unique (id, user_id);

create table public.day_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  plan_date date not null,
  available_minutes integer check (available_minutes is null or available_minutes between 0 and 1440),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, plan_date),
  unique (id, user_id)
);

create table public.day_plan_areas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  plan_id uuid not null,
  area_id uuid not null,
  moment text check (moment is null or moment in ('morning', 'midday', 'afternoon', 'night')),
  planned_minutes integer check (planned_minutes is null or planned_minutes between 0 and 1440),
  unique (plan_id, area_id),
  foreign key (plan_id, user_id) references public.day_plans (id, user_id) on delete cascade,
  foreign key (area_id, user_id) references public.areas (id, user_id) on delete restrict
);

create table public.day_plan_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  plan_id uuid not null,
  task_id uuid,
  routine_template_id uuid,
  position smallint not null default 0,
  unique (plan_id, task_id),
  unique (plan_id, routine_template_id),
  check ((task_id is not null)::int + (routine_template_id is not null)::int = 1),
  foreign key (plan_id, user_id) references public.day_plans (id, user_id) on delete cascade,
  foreign key (task_id, user_id) references public.tasks (id, user_id) on delete cascade,
  foreign key (routine_template_id, user_id) references public.routine_templates (id, user_id) on delete cascade
);

create trigger day_plans_touch before update on public.day_plans
  for each row execute function public.touch_updated_at();

alter table public.day_plans enable row level security;
alter table public.day_plan_areas enable row level security;
alter table public.day_plan_items enable row level security;

create policy day_plans_select on public.day_plans for select to authenticated
  using (user_id = (select auth.uid()));
create policy day_plan_areas_select on public.day_plan_areas for select to authenticated
  using (user_id = (select auth.uid()));
create policy day_plan_items_select on public.day_plan_items for select to authenticated
  using (user_id = (select auth.uid()));
grant select on public.day_plans, public.day_plan_areas, public.day_plan_items to authenticated;

-- Guarda (o reemplaza) el plan de una fecha, con sus áreas e ítems, en una sola operación.
-- p_areas: [{"area_id": "<uuid>", "moment": "morning", "planned_minutes": 120}, ...]
-- p_items: [{"kind": "task"|"routine", "id": "<uuid>"}, ...]
create function public.save_day_plan(p_date date, p_available integer, p_areas jsonb, p_items jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  pid uuid;
  closed timestamptz;
  na int;
  ni int;
  i int;
  a jsonb;
  it jsonb;
  aid uuid;
  iid uuid;
  area_of uuid;
begin
  if uid is null then raise exception 'No autenticado' using errcode = '28000'; end if;
  if p_date is null then raise exception 'Falta la fecha' using errcode = 'invalid_parameter_value'; end if;
  if jsonb_typeof(p_areas) <> 'array' or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Plan inválido' using errcode = 'invalid_parameter_value';
  end if;
  na := jsonb_array_length(p_areas);
  ni := jsonb_array_length(p_items);
  if na < 1 or na > 8 then raise exception 'Elegí entre 1 y 8 áreas' using errcode = 'invalid_parameter_value'; end if;
  if ni > 60 then raise exception 'Demasiados ítems en un día' using errcode = 'invalid_parameter_value'; end if;

  insert into public.day_plans (user_id, plan_date, available_minutes)
  values (uid, p_date, p_available)
  on conflict (user_id, plan_date) do nothing;
  select id, closed_at into pid, closed from public.day_plans
   where user_id = uid and plan_date = p_date for update;
  if closed is not null then
    raise exception 'El día ya está cerrado' using errcode = 'check_violation';
  end if;
  update public.day_plans set available_minutes = p_available where id = pid;
  delete from public.day_plan_items where plan_id = pid;
  delete from public.day_plan_areas where plan_id = pid;

  for i in 0 .. na - 1 loop
    a := p_areas -> i;
    aid := nullif(a ->> 'area_id', '')::uuid;
    if aid is null or not exists (
      select 1 from public.areas where id = aid and user_id = uid and archived_at is null
    ) then
      raise exception 'Área inválida en el plan' using errcode = 'invalid_parameter_value';
    end if;
    insert into public.day_plan_areas (user_id, plan_id, area_id, moment, planned_minutes)
    values (uid, pid, aid, nullif(a ->> 'moment', ''), nullif(a ->> 'planned_minutes', '')::integer);
  end loop;

  for i in 0 .. ni - 1 loop
    it := p_items -> i;
    iid := nullif(it ->> 'id', '')::uuid;
    if it ->> 'kind' = 'task' then
      select area_id into area_of from public.tasks
       where id = iid and user_id = uid and status in ('pending', 'in_progress');
      if area_of is null then
        raise exception 'Una tarea del plan no existe o ya no está pendiente' using errcode = 'invalid_parameter_value';
      end if;
      if not exists (select 1 from public.day_plan_areas where plan_id = pid and area_id = area_of) then
        raise exception 'Una tarea del plan es de un área que no elegiste para hoy' using errcode = 'invalid_parameter_value';
      end if;
      insert into public.day_plan_items (user_id, plan_id, task_id, position) values (uid, pid, iid, i);
    elsif it ->> 'kind' = 'routine' then
      select default_area_id into area_of from public.routine_templates
       where id = iid and user_id = uid and archived_at is null;
      if not found then
        raise exception 'Una rutina del plan no existe' using errcode = 'invalid_parameter_value';
      end if;
      if area_of is not null and not exists (
        select 1 from public.day_plan_areas where plan_id = pid and area_id = area_of
      ) then
        raise exception 'Una rutina del plan es de un área que no elegiste para hoy' using errcode = 'invalid_parameter_value';
      end if;
      insert into public.day_plan_items (user_id, plan_id, routine_template_id, position) values (uid, pid, iid, i);
    else
      raise exception 'Tipo de ítem inválido' using errcode = 'invalid_parameter_value';
    end if;
  end loop;
  return pid;
end $$;

-- Cierre del día. Traslada a mañana SOLO las tareas elegidas (p_carry_task_ids) y no duplica nada
-- si se repite. Las no elegidas quedan como estaban. Devuelve el id del plan de mañana (o null).
create function public.close_day_plan(p_date date, p_carry_task_ids uuid[]) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  pid uuid;
  tomorrow date := p_date + 1;
  tid uuid;
  t_area uuid;
  next_pid uuid;
  next_closed timestamptz;
begin
  if uid is null then raise exception 'No autenticado' using errcode = '28000'; end if;
  select id into pid from public.day_plans where user_id = uid and plan_date = p_date for update;
  if pid is null then raise exception 'No hay un plan para ese día' using errcode = 'no_data_found'; end if;

  -- Validar todo antes de cambiar nada (el cierre es todo o nada).
  foreach tid in array coalesce(p_carry_task_ids, '{}') loop
    if not exists (select 1 from public.tasks where id = tid and user_id = uid) then
      raise exception 'Tarea inexistente' using errcode = 'no_data_found';
    end if;
  end loop;

  update public.day_plans set closed_at = coalesce(closed_at, now()) where id = pid;

  if coalesce(array_length(p_carry_task_ids, 1), 0) = 0 then return null; end if;

  insert into public.day_plans (user_id, plan_date) values (uid, tomorrow) on conflict (user_id, plan_date) do nothing;
  select id, closed_at into next_pid, next_closed from public.day_plans where user_id = uid and plan_date = tomorrow for update;

  foreach tid in array p_carry_task_ids loop
    select area_id into t_area from public.tasks
     where id = tid and user_id = uid and status in ('pending', 'in_progress');
    if t_area is null then continue; end if; -- ya no está pendiente: no se traslada
    update public.tasks set scheduled_date = tomorrow, someday = false where id = tid;
    if next_closed is null then
      insert into public.day_plan_areas (user_id, plan_id, area_id) values (uid, next_pid, t_area)
        on conflict (plan_id, area_id) do nothing;
      insert into public.day_plan_items (user_id, plan_id, task_id, position)
        select uid, next_pid, tid, coalesce(max(position), -1) + 1 from public.day_plan_items where plan_id = next_pid
        on conflict (plan_id, task_id) do nothing;
    end if;
  end loop;
  return next_pid;
end $$;

revoke all on function public.save_day_plan(date, integer, jsonb, jsonb) from public, anon;
revoke all on function public.close_day_plan(date, uuid[]) from public, anon;
grant execute on function public.save_day_plan(date, integer, jsonb, jsonb) to authenticated;
grant execute on function public.close_day_plan(date, uuid[]) to authenticated;

-- ============================================================================
-- 0006_recurrences.sql
-- ============================================================================

-- My MindPool · hito 3 (parte 3): tareas repetidas con ocurrencias de identidad propia (PRD §9, §16).
--
--  * Una tarea repetida es una PLANTILLA (recurring_tasks + recurrence_rules) que NO es una tarea
--    abierta: no suma al agua ni aparece en las listas de pendientes (sin doble conteo).
--  * Cada repetición es una OCURRENCIA con su propia fila, fecha y estado: completar una no
--    completa la plantilla ni las futuras. Hay una sola por plantilla y fecha (clave única).
--  * La ocurrencia copia título, área, peso y prioridad al generarse: editar la plantilla no
--    reescribe lo ya generado (historial estable).
--  * Las fechas son de calendario local (sin zona): no hay saltos por cambio de horario.
--  * Se generan solo hacia adelante (desde hoy): no se «rellenan» días pasados.

create table public.recurrence_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  frequency text not null check (frequency in ('daily', 'weekly')),
  interval_count smallint not null default 1 check (interval_count between 1 and 52),
  -- Días ISO: 1 = lunes … 7 = domingo. Vacío para frecuencia diaria.
  weekdays smallint[] not null default '{}',
  start_date date not null,
  end_date date,
  timezone text not null default 'America/Argentina/Buenos_Aires',
  created_at timestamptz not null default now(),
  unique (id, user_id),
  check (end_date is null or end_date >= start_date),
  check (
    (frequency = 'daily' and cardinality(weekdays) = 0) or
    (frequency = 'weekly' and cardinality(weekdays) between 1 and 7 and weekdays <@ array[1,2,3,4,5,6,7]::smallint[])
  )
);

create table public.recurring_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  rule_id uuid not null,
  area_id uuid not null,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  note text check (note is null or char_length(note) <= 2000),
  weight smallint not null default 1 check (weight between 1 and 3),
  priority text not null default 'normal' check (priority in ('normal', 'important', 'urgent')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (rule_id),
  foreign key (rule_id, user_id) references public.recurrence_rules (id, user_id) on delete cascade,
  foreign key (area_id, user_id) references public.areas (id, user_id) on delete restrict
);

create table public.task_occurrences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  recurring_task_id uuid not null,
  occurrence_date date not null,
  title text not null,
  area_id uuid not null,
  weight smallint not null check (weight between 1 and 3),
  priority text not null check (priority in ('normal', 'important', 'urgent')),
  status text not null default 'pending' check (status in ('pending', 'done', 'skipped')),
  done_at timestamptz,
  created_at timestamptz not null default now(),
  unique (recurring_task_id, occurrence_date),
  check ((status = 'done') = (done_at is not null)),
  foreign key (recurring_task_id, user_id) references public.recurring_tasks (id, user_id) on delete cascade,
  foreign key (area_id, user_id) references public.areas (id, user_id) on delete restrict
);
create index task_occurrences_user_date on public.task_occurrences (user_id, occurrence_date);

create trigger recurring_tasks_touch before update on public.recurring_tasks
  for each row execute function public.touch_updated_at();

alter table public.recurrence_rules enable row level security;
alter table public.recurring_tasks enable row level security;
alter table public.task_occurrences enable row level security;
create policy recurrence_rules_select on public.recurrence_rules for select to authenticated
  using (user_id = (select auth.uid()));
create policy recurring_tasks_select on public.recurring_tasks for select to authenticated
  using (user_id = (select auth.uid()));
create policy task_occurrences_select on public.task_occurrences for select to authenticated
  using (user_id = (select auth.uid()));
grant select on public.recurrence_rules, public.recurring_tasks, public.task_occurrences to authenticated;

-- ¿Ocurre la regla ese día? Espejo exacto de src/domain/recurrence.ts (hay una prueba que las cruza).
create function public.rule_matches(
  p_freq text, p_interval int, p_weekdays smallint[], p_start date, d date
) returns boolean
language sql immutable as $$
  select d >= p_start and case p_freq
    when 'daily' then (d - p_start) % p_interval = 0
    when 'weekly' then
      extract(isodow from d)::smallint = any (p_weekdays)
      and (((d - (extract(isodow from d)::int - 1)) - (p_start - (extract(isodow from p_start)::int - 1))) / 7) % p_interval = 0
    else false
  end
$$;

-- Crea o edita una tarea repetida. Al editar se descartan las ocurrencias PENDIENTES desde hoy en
-- adelante (se regeneran con los datos nuevos); lo pasado y lo ya resuelto no se toca.
create function public.save_recurring_task(
  p_id uuid, p_area_id uuid, p_title text, p_note text, p_weight int, p_priority text,
  p_frequency text, p_interval int, p_weekdays int[], p_start date, p_end date,
  p_timezone text, p_today date
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  rid uuid;
  tid uuid;
  wd smallint[] := coalesce(
    (select array_agg(distinct x::smallint order by x::smallint) from unnest(p_weekdays) x), '{}');
begin
  if uid is null then raise exception 'No autenticado' using errcode = '28000'; end if;
  if p_today is null then raise exception 'Falta la fecha de hoy' using errcode = 'invalid_parameter_value'; end if;
  if not exists (select 1 from public.areas where id = p_area_id and user_id = uid and archived_at is null) then
    raise exception 'Área inválida' using errcode = 'invalid_parameter_value';
  end if;
  if p_frequency = 'daily' then wd := '{}'; end if;

  if p_id is null then
    insert into public.recurrence_rules (user_id, frequency, interval_count, weekdays, start_date, end_date, timezone)
    values (uid, p_frequency, p_interval, wd, p_start, p_end, coalesce(p_timezone, 'America/Argentina/Buenos_Aires'))
    returning id into rid;
    insert into public.recurring_tasks (user_id, rule_id, area_id, title, note, weight, priority)
    values (uid, rid, p_area_id, btrim(p_title), nullif(btrim(coalesce(p_note, '')), ''), p_weight, p_priority)
    returning id into tid;
  else
    select id, rule_id into tid, rid from public.recurring_tasks
     where id = p_id and user_id = uid and archived_at is null for update;
    if tid is null then raise exception 'Tarea repetida inexistente' using errcode = 'no_data_found'; end if;
    update public.recurrence_rules
       set frequency = p_frequency, interval_count = p_interval, weekdays = wd,
           start_date = p_start, end_date = p_end, timezone = coalesce(p_timezone, timezone)
     where id = rid;
    update public.recurring_tasks
       set area_id = p_area_id, title = btrim(p_title), note = nullif(btrim(coalesce(p_note, '')), ''),
           weight = p_weight, priority = p_priority
     where id = tid;
    delete from public.task_occurrences
     where recurring_task_id = tid and status = 'pending' and occurrence_date >= p_today;
  end if;
  return tid;
end $$;

-- Genera las ocurrencias que faltan entre dos fechas (máx. 62 días). Idempotente: repetirla, o
-- hacerla desde dos dispositivos a la vez, no duplica nada. Devuelve cuántas creó.
create function public.ensure_occurrences(p_from date, p_to date) returns int
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  made int := 0;
  got int;
  rt record;
begin
  if uid is null then raise exception 'No autenticado' using errcode = '28000'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 62 then
    raise exception 'Rango de fechas inválido' using errcode = 'invalid_parameter_value';
  end if;
  for rt in
    select t.id, t.area_id, t.title, t.weight, t.priority, r.frequency, r.interval_count, r.weekdays, r.start_date, r.end_date
      from public.recurring_tasks t
      join public.recurrence_rules r on r.id = t.rule_id
      join public.areas a on a.id = t.area_id
     where t.user_id = uid and t.archived_at is null and a.archived_at is null
     order by t.id
  loop
    insert into public.task_occurrences (user_id, recurring_task_id, occurrence_date, title, area_id, weight, priority)
    select uid, rt.id, d::date, rt.title, rt.area_id, rt.weight, rt.priority
      from generate_series(p_from, p_to, interval '1 day') d
     where public.rule_matches(rt.frequency, rt.interval_count, rt.weekdays, rt.start_date, d::date)
       and (rt.end_date is null or d::date <= rt.end_date)
    on conflict (recurring_task_id, occurrence_date) do nothing;
    get diagnostics got = row_count;
    made := made + got;
  end loop;
  return made;
end $$;

-- Resolver UNA ocurrencia. complete/skip solo actúan sobre una pendiente; undo repone una resuelta.
-- Repetir la misma acción no cambia nada.
create function public.set_occurrence_state(p_id uuid, p_action text) returns text
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  o public.task_occurrences%rowtype;
begin
  if uid is null then raise exception 'No autenticado' using errcode = '28000'; end if;
  if p_action not in ('complete', 'skip', 'undo') then
    raise exception 'Acción inválida' using errcode = 'invalid_parameter_value';
  end if;
  select * into o from public.task_occurrences where id = p_id and user_id = uid for update;
  if not found then raise exception 'Repetición inexistente' using errcode = 'no_data_found'; end if;

  if p_action = 'complete' then
    if o.status = 'pending' then update public.task_occurrences set status = 'done', done_at = now() where id = o.id; end if;
    if o.status = 'skipped' then raise exception 'Esta repetición ya se saltó' using errcode = 'check_violation'; end if;
  elsif p_action = 'skip' then
    if o.status = 'pending' then update public.task_occurrences set status = 'skipped' where id = o.id; end if;
    if o.status = 'done' then raise exception 'Esta repetición ya se completó' using errcode = 'check_violation'; end if;
  else
    update public.task_occurrences set status = 'pending', done_at = null where id = o.id and status <> 'pending';
  end if;
  select status into o.status from public.task_occurrences where id = p_id;
  return o.status;
end $$;

-- Archivar la tarea repetida: no genera más. Se descartan las pendientes desde hoy; lo pasado queda.
create function public.archive_recurring_task(p_id uuid, p_today date) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'No autenticado' using errcode = '28000'; end if;
  update public.recurring_tasks set archived_at = coalesce(archived_at, now())
   where id = p_id and user_id = uid;
  if not found then raise exception 'Tarea repetida inexistente' using errcode = 'no_data_found'; end if;
  delete from public.task_occurrences
   where recurring_task_id = p_id and user_id = uid and status = 'pending' and occurrence_date >= p_today;
end $$;

revoke all on function public.save_recurring_task(uuid, uuid, text, text, int, text, text, int, int[], date, date, text, date) from public, anon;
revoke all on function public.ensure_occurrences(date, date) from public, anon;
revoke all on function public.set_occurrence_state(uuid, text) from public, anon;
revoke all on function public.archive_recurring_task(uuid, date) from public, anon;
grant execute on function public.save_recurring_task(uuid, uuid, text, text, int, text, text, int, int[], date, date, text, date) to authenticated;
grant execute on function public.ensure_occurrences(date, date) to authenticated;
grant execute on function public.set_occurrence_state(uuid, text) to authenticated;
grant execute on function public.archive_recurring_task(uuid, date) to authenticated;
-- rule_matches es una función pura: se usa desde ensure_occurrences y desde las pruebas.
grant execute on function public.rule_matches(text, int, smallint[], date, date) to authenticated;

-- Archivar un área tampoco puede dejar tareas repetidas activas ni repeticiones pendientes (amplía 0003/0004).
create or replace function public.guard_area_archive() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.archived_at is null and new.archived_at is not null then
    if exists (
      select 1 from public.tasks where area_id = new.id and status in ('pending', 'in_progress')
    ) or exists (
      select 1 from public.routine_run_steps where area_id = new.id and status = 'pending'
    ) or exists (
      select 1 from public.recurring_tasks where area_id = new.id and archived_at is null
    ) or exists (
      select 1 from public.task_occurrences where area_id = new.id and status = 'pending'
    ) then
      raise exception 'El área tiene pendientes: movelos a otra área antes de archivarla'
        using errcode = 'check_violation';
    end if;
    if (
      select count(*) from public.areas
      where user_id = new.user_id and archived_at is null and id <> new.id
    ) < 2 then
      raise exception 'Tienen que quedar al menos 2 áreas activas'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;

-- ============================================================================
-- 0007_lock_down_grants.sql
-- ============================================================================

-- My MindPool · cierre de permisos por defecto (defensa en profundidad).
--
-- Supabase otorga por defecto permisos amplios a los roles `anon` y `authenticated` sobre las tablas
-- nuevas de `public`. La seguridad ya descansa en RLS (que bloquea todo lo no permitido), pero acá se
-- quitan además los permisos que la app no usa, para que un error de políticas no exponga datos:
--  * `anon` (sin sesión) no necesita nada: el registro y el login pasan por Auth, no por estas tablas.
--  * `authenticated` solo puede LEER las tablas que se escriben con funciones (rutinas, plan del día y
--    tareas repetidas) y no puede vaciar ninguna tabla (TRUNCATE no pasa por RLS).

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;

alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;

revoke truncate, references, trigger on all tables in schema public from authenticated;

revoke insert, update, delete on
  public.routine_templates, public.routine_template_steps, public.routine_runs, public.routine_run_steps,
  public.day_plans, public.day_plan_areas, public.day_plan_items,
  public.recurrence_rules, public.recurring_tasks, public.task_occurrences
from authenticated;

-- El perfil lo crea el trigger de alta y se borra con la cuenta: la persona solo lo lee y lo actualiza.
revoke insert, delete on public.profiles from authenticated;

-- Las funciones de disparador no se llaman desde afuera: quitarles el permiso general (PUBLIC).
-- (Un disparador no necesita que quien lo activa tenga EXECUTE: solo se comprueba al crearlo.)
revoke all on function public.touch_updated_at() from public;
revoke all on function public.enforce_max_active_areas() from public;
revoke all on function public.handle_new_user() from public;
revoke all on function public.guard_area_archive() from public;
revoke all on function public.rule_matches(text, int, smallint[], date, date) from public;
grant execute on function public.rule_matches(text, int, smallint[], date, date) to authenticated;

-- ============================================================================
-- Verificación final y confirmación
-- ============================================================================

-- Verificación final DENTRO de la transacción: si algo quedó mal, se cancela todo antes de confirmar.
do $$
declare t text; f text; n int;
begin
  foreach t in array array['profiles', 'areas', 'tasks', 'routine_templates', 'routine_template_steps', 'routine_runs', 'routine_run_steps', 'day_plans', 'day_plan_areas', 'day_plan_items', 'recurrence_rules', 'recurring_tasks', 'task_occurrences'] loop
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
  foreach t in array array['routine_templates', 'routine_template_steps', 'routine_runs', 'routine_run_steps', 'day_plans', 'day_plan_areas', 'day_plan_items', 'recurrence_rules', 'recurring_tasks', 'task_occurrences'] loop
    if has_table_privilege('authenticated', to_regclass('public.' || t), 'insert') or
       has_table_privilege('authenticated', to_regclass('public.' || t), 'update') or
       has_table_privilege('authenticated', to_regclass('public.' || t), 'delete') then
      raise exception 'authenticated puede escribir directo en public.% (debe ser solo lectura)', t;
    end if;
  end loop;
  foreach f in array array['touch_updated_at()', 'enforce_max_active_areas()', 'handle_new_user()', 'guard_area_archive()', 'complete_onboarding(text,jsonb)', 'complete_task(uuid)', 'undo_complete_task(uuid)', 'save_routine_template(uuid,text,uuid,text,jsonb)', 'archive_routine_template(uuid,boolean)', 'start_routine_run(uuid,text,date)', 'advance_run_step(uuid,text)', 'set_run_state(uuid,text)', 'save_day_plan(date,integer,jsonb,jsonb)', 'close_day_plan(date,uuid[])', 'rule_matches(text,integer,smallint[],date,date)', 'save_recurring_task(uuid,uuid,text,text,integer,text,text,integer,integer[],date,date,text,date)', 'ensure_occurrences(date,date)', 'set_occurrence_state(uuid,text)', 'archive_recurring_task(uuid,date)'] loop
    if to_regprocedure('public.' || f) is null then raise exception 'Falta la función public.%', f; end if;
    if has_function_privilege('anon', to_regprocedure('public.' || f), 'execute') then
      raise exception 'El rol anon puede ejecutar public.%', f;
    end if;
  end loop;
  if not exists (select 1 from pg_trigger where tgname = 'on_auth_user_created' and not tgisinternal) then
    raise exception 'Falta el disparador de alta de perfil en auth.users';
  end if;
end $$;

commit;
