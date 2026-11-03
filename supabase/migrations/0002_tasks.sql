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
