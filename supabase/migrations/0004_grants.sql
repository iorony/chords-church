-- =========================================================
-- 0004_grants.sql
-- Otorga los privilegios base de PostgreSQL que los roles anon/authenticated
-- de Supabase necesitan para poder leer/escribir en las tablas.
--
-- Row Level Security (0002_rls.sql) sigue siendo quien decide qué FILAS
-- puede ver o modificar cada usuario. Pero antes de que RLS entre a jugar,
-- Postgres exige que el rol tenga permiso a nivel de TABLA — sin este
-- GRANT, cualquier consulta falla con "permission denied for table X",
-- sin importar qué tan bien estén escritas las políticas RLS.
--
-- Los proyectos nuevos de Supabase suelen traer esto preconfigurado por
-- defecto para el esquema public, pero puede faltar según cómo se haya
-- creado el proyecto o aplicado las migraciones. Este script lo deja
-- explícito y es seguro de ejecutar aunque ya existan los permisos
-- (GRANT es idempotente).
-- =========================================================

grant usage on schema public to anon, authenticated;

-- authenticated: acceso CRUD a nivel de tabla; RLS sigue filtrando filas
grant select, insert, update, delete on all tables in schema public to authenticated;

-- anon (visitantes sin sesión): solo lectura; RLS limita a contenido público
grant select on all tables in schema public to anon;

grant usage, select on all sequences in schema public to anon, authenticated;

-- Para que las tablas que se creen en migraciones futuras también reciban
-- estos privilegios automáticamente, sin tener que repetir este script:
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant select on tables to anon;
alter default privileges in schema public grant usage, select on sequences to anon, authenticated;
