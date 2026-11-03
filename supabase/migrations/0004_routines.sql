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
