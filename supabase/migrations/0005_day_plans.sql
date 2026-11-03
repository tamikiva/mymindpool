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
