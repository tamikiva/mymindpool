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
