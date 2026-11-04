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
