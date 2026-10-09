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
