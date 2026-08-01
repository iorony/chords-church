-- =========================================================
-- 0016_song_version_history.sql
--
-- Completa "Versiones e Historial" (sección 12 del prompt original).
-- La tabla song_versions ya existía desde 0001_schema.sql, pero nada en
-- la aplicación la usaba: editar una canción sobrescribía songs.content
-- directamente sin dejar rastro. Esta migración agrega dos funciones
-- transaccionales para que cada guardado quede versionado de forma
-- atómica (evita condiciones de carrera entre "leer último número de
-- versión" y "marcar la anterior como no vigente").
--
-- save_song_version: crea una versión nueva, la marca como vigente,
--   desmarca la anterior, y actualiza songs.content/detected_key para
--   que el resto de la app (transposición, exportación, presentación)
--   siga leyendo siempre la versión vigente sin cambios adicionales.
-- restore_song_version: no borra ni sobrescribe nada — restaurar una
--   versión antigua crea una versión NUEVA con ese contenido, así el
--   historial completo se conserva siempre.
-- =========================================================

-- Falta la política de UPDATE (0002_rls.sql solo tenía select/insert)
create policy "song_versions_update_owner" on song_versions for update
  using (exists (select 1 from songs s where s.id = song_id and (s.created_by = auth.uid() or is_moderator_or_admin())));

create or replace function public.save_song_version(
  target_song_id uuid,
  new_content text,
  new_key text default null,
  summary text default null
)
returns uuid as $$
declare
  next_version int;
  new_version_id uuid;
begin
  if not exists (
    select 1 from songs s where s.id = target_song_id
    and (s.created_by = auth.uid() or is_moderator_or_admin())
  ) then
    raise exception 'No tienes permiso para editar esta canción.';
  end if;

  select coalesce(max(version_number), 0) + 1 into next_version
  from song_versions where song_id = target_song_id;

  update song_versions
  set is_current = false
  where song_id = target_song_id and is_current = true;

  insert into song_versions (song_id, version_number, content, key, change_summary, created_by, is_current)
  values (target_song_id, next_version, new_content, new_key, summary, auth.uid(), true)
  returning id into new_version_id;

  update songs
  set content = new_content,
      detected_key = coalesce(new_key, detected_key)
  where id = target_song_id;

  return new_version_id;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function public.restore_song_version(target_version_id uuid)
returns uuid as $$
declare
  v_song_id uuid;
  v_content text;
  v_key text;
  v_version_number int;
begin
  select song_id, content, key, version_number
  into v_song_id, v_content, v_key, v_version_number
  from song_versions where id = target_version_id;

  if v_song_id is null then
    raise exception 'Versión no encontrada.';
  end if;

  return public.save_song_version(
    v_song_id,
    v_content,
    v_key,
    'Restaurada desde la versión ' || v_version_number
  );
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function public.save_song_version(uuid, text, text, text) to authenticated;
grant execute on function public.restore_song_version(uuid) to authenticated;
