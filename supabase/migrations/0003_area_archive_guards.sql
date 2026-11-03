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
