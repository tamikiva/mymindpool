-- Prueba de transacciones del SQL Editor (1 minuto, sin riesgo: usa una tabla temporal de prueba).
-- PASO 1: pegá SOLO este bloque y tocá Run. DEBE fallar con «division by zero»; es lo esperado.
begin;
create table public._mp_tx_test (x int);
select 1 / 0;
commit;

-- PASO 2: borrá el editor, pegá SOLO la línea siguiente y tocá Run:
--   select to_regclass('public._mp_tx_test') as quedo_la_tabla;
--   · Si devuelve vacío (null): la transacción se canceló entera. El archivo grande es seguro.
--   · Si devuelve public._mp_tx_test: el editor NO respeta la transacción. No corras el archivo grande: avisame.
--   · Si da «current transaction is aborted»: corré primero  rollback;  y repetí este paso 2.
-- PASO 3 (limpieza, solo si en el paso 2 quedó la tabla):  drop table public._mp_tx_test;
