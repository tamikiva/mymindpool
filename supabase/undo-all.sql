-- My MindPool · DESHACER TODO. ¡BORRA LOS DATOS de estas tablas! Solo para una base recién creada.
-- Úsalo únicamente si las migraciones quedaron a medias y querés empezar de cero.
begin;
drop trigger if exists on_auth_user_created on auth.users;
drop table if exists
  public.task_occurrences, public.recurring_tasks, public.recurrence_rules,
  public.day_plan_items, public.day_plan_areas, public.day_plans,
  public.routine_run_steps, public.routine_runs, public.routine_template_steps, public.routine_templates,
  public.tasks, public.areas, public.profiles
cascade;
drop function if exists public.touch_updated_at();
drop function if exists public.enforce_max_active_areas();
drop function if exists public.handle_new_user();
drop function if exists public.guard_area_archive();
drop function if exists public.complete_onboarding(text,jsonb);
drop function if exists public.complete_task(uuid);
drop function if exists public.undo_complete_task(uuid);
drop function if exists public.save_routine_template(uuid,text,uuid,text,jsonb);
drop function if exists public.archive_routine_template(uuid,boolean);
drop function if exists public.start_routine_run(uuid,text,date);
drop function if exists public.advance_run_step(uuid,text);
drop function if exists public.set_run_state(uuid,text);
drop function if exists public.save_day_plan(date,integer,jsonb,jsonb);
drop function if exists public.close_day_plan(date,uuid[]);
drop function if exists public.rule_matches(text,integer,smallint[],date,date);
drop function if exists public.save_recurring_task(uuid,uuid,text,text,integer,text,text,integer,integer[],date,date,text,date);
drop function if exists public.ensure_occurrences(date,date);
drop function if exists public.set_occurrence_state(uuid,text);
drop function if exists public.archive_recurring_task(uuid,date);
commit;
