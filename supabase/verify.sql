-- My MindPool · verificación de solo lectura. No cambia nada. Cada fila es una comprobación: OK o un problema.
-- Corrélo DESPUÉS de las migraciones. Resultado esperado: 101 filas, todas empezando con «OK».
select * from (
  select 1 as o, 'Tabla ' || t as comprobacion,
         case when to_regclass('public.' || t) is not null then 'OK' else 'FALTA la tabla' end as estado
    from (values ('profiles'), ('areas'), ('tasks'), ('routine_templates'), ('routine_template_steps'), ('routine_runs'), ('routine_run_steps'), ('day_plans'), ('day_plan_areas'), ('day_plan_items'), ('recurrence_rules'), ('recurring_tasks'), ('task_occurrences')) as e(t)
  union all
  select 2, 'RLS activo en ' || t,
         case when coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.' || t)), false) then 'OK' else 'FALTA activar RLS' end
    from (values ('profiles'), ('areas'), ('tasks'), ('routine_templates'), ('routine_template_steps'), ('routine_runs'), ('routine_run_steps'), ('day_plans'), ('day_plan_areas'), ('day_plan_items'), ('recurrence_rules'), ('recurring_tasks'), ('task_occurrences')) as e(t)
  union all
  select 3, 'Políticas RLS en ' || t,
         case when (select count(*) from pg_policies where schemaname = 'public' and tablename = t) >= 1
              then 'OK (' || (select count(*) from pg_policies where schemaname = 'public' and tablename = t) || ' políticas)' else 'FALTAN políticas' end
    from (values ('profiles'), ('areas'), ('tasks'), ('routine_templates'), ('routine_template_steps'), ('routine_runs'), ('routine_run_steps'), ('day_plans'), ('day_plan_areas'), ('day_plan_items'), ('recurrence_rules'), ('recurring_tasks'), ('task_occurrences')) as e(t)
  union all
  select 4, 'Sin acceso para anon (sin sesión) en ' || t,
         case when to_regclass('public.' || t) is null then 'FALTA la tabla'
              when has_table_privilege('anon', to_regclass('public.' || t), 'select') then 'EXPUESTO: anon puede leer' else 'OK' end
    from (values ('profiles'), ('areas'), ('tasks'), ('routine_templates'), ('routine_template_steps'), ('routine_runs'), ('routine_run_steps'), ('day_plans'), ('day_plan_areas'), ('day_plan_items'), ('recurrence_rules'), ('recurring_tasks'), ('task_occurrences')) as e(t)
  union all
  select 5, 'authenticated solo lee (escribe con funciones) en ' || t,
         case when to_regclass('public.' || t) is null then 'FALTA la tabla'
              when has_table_privilege('authenticated', to_regclass('public.' || t), 'insert') or has_table_privilege('authenticated', to_regclass('public.' || t), 'update') or has_table_privilege('authenticated', to_regclass('public.' || t), 'delete')
              then 'EXPUESTO: puede escribir directo' else 'OK' end
    from (values ('routine_templates'), ('routine_template_steps'), ('routine_runs'), ('routine_run_steps'), ('day_plans'), ('day_plan_areas'), ('day_plan_items'), ('recurrence_rules'), ('recurring_tasks'), ('task_occurrences')) as e(t)
  union all
  select 6, 'Función ' || f,
         case when to_regprocedure('public.' || f) is not null then 'OK' else 'FALTA la función' end
    from (values ('touch_updated_at()'), ('enforce_max_active_areas()'), ('handle_new_user()'), ('guard_area_archive()'), ('complete_onboarding(text,jsonb)'), ('complete_task(uuid)'), ('undo_complete_task(uuid)'), ('save_routine_template(uuid,text,uuid,text,jsonb)'), ('archive_routine_template(uuid,boolean)'), ('start_routine_run(uuid,text,date)'), ('advance_run_step(uuid,text)'), ('set_run_state(uuid,text)'), ('save_day_plan(date,integer,jsonb,jsonb)'), ('close_day_plan(date,uuid[])'), ('rule_matches(text,integer,smallint[],date,date)'), ('save_recurring_task(uuid,uuid,text,text,integer,text,text,integer,integer[],date,date,text,date)'), ('ensure_occurrences(date,date)'), ('set_occurrence_state(uuid,text)'), ('archive_recurring_task(uuid,date)')) as e(f)
  union all
  select 7, 'anon no puede ejecutar ' || f,
         case when to_regprocedure('public.' || f) is null then 'FALTA la función'
              when has_function_privilege('anon', to_regprocedure('public.' || f), 'execute') then 'EXPUESTO' else 'OK' end
    from (values ('touch_updated_at()'), ('enforce_max_active_areas()'), ('handle_new_user()'), ('guard_area_archive()'), ('complete_onboarding(text,jsonb)'), ('complete_task(uuid)'), ('undo_complete_task(uuid)'), ('save_routine_template(uuid,text,uuid,text,jsonb)'), ('archive_routine_template(uuid,boolean)'), ('start_routine_run(uuid,text,date)'), ('advance_run_step(uuid,text)'), ('set_run_state(uuid,text)'), ('save_day_plan(date,integer,jsonb,jsonb)'), ('close_day_plan(date,uuid[])'), ('rule_matches(text,integer,smallint[],date,date)'), ('save_recurring_task(uuid,uuid,text,text,integer,text,text,integer,integer[],date,date,text,date)'), ('ensure_occurrences(date,date)'), ('set_occurrence_state(uuid,text)'), ('archive_recurring_task(uuid,date)')) as e(f)
  union all
  select 8, 'Disparador que crea el perfil al registrarse',
         case when exists (select 1 from pg_trigger where tgname = 'on_auth_user_created' and not tgisinternal) then 'OK' else 'FALTA' end
) r
order by (case when estado like 'OK%' then 1 else 0 end), o, comprobacion;
