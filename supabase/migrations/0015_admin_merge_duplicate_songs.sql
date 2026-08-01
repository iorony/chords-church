-- =========================================================
-- 0015_admin_merge_duplicate_songs.sql
--
-- Completa la función "Fusionar" que el panel de administración ya
-- prometía en /admin (sección "Canciones": "Buscar, editar, desactivar,
-- fusionar") pero que todavía no existía. Reutiliza toda la
-- infraestructura de detección de duplicados de las migraciones 0008-0012.
--
-- merge_duplicate_songs(canonical_song_id, duplicate_song_id):
--   - Solo puede ejecutarla un moderador o administrador.
--   - Reasigna a la canción canónica todo lo que referenciaba a la
--     duplicada: canciones en repertorios, favoritos, etiquetas,
--     propuestas de edición, reportes, secciones, acordes, fuentes,
--     revisiones de IA e historial de versiones.
--   - Resuelve los conflictos de llave única que puedan surgir (p.ej. un
--     mismo usuario tenía ambas canciones en favoritos, o ambas tienen
--     una versión "1").
--   - Marca la duplicada como eliminada lógicamente y guarda hacia
--     dónde se fusionó (columna merged_into), sin borrar el registro
--     para conservar el historial.
-- =========================================================

alter table songs add column if not exists merged_into uuid references songs(id);

create or replace function public.merge_duplicate_songs(canonical_song_id uuid, duplicate_song_id uuid)
returns void as $$
declare
  max_version int;
begin
  if not is_moderator_or_admin() then
    raise exception 'Solo un moderador o administrador puede fusionar canciones.';
  end if;

  if canonical_song_id = duplicate_song_id then
    raise exception 'No se puede fusionar una canción consigo misma.';
  end if;

  if not exists (select 1 from songs where id = canonical_song_id and is_deleted = false) then
    raise exception 'La canción canónica no existe o ya fue eliminada.';
  end if;

  if not exists (select 1 from songs where id = duplicate_song_id and is_deleted = false) then
    raise exception 'La canción duplicada no existe o ya fue eliminada.';
  end if;

  -- setlist_items: sin restricción de unicidad, reasignar directamente
  update setlist_items set song_id = canonical_song_id where song_id = duplicate_song_id;

  -- song_favorites: PK (user_id, song_id) — si el mismo usuario ya tenía
  -- ambas canciones en favoritos, se conserva la de la canónica.
  insert into song_favorites (user_id, song_id, preferred_key, created_at)
  select user_id, canonical_song_id, preferred_key, created_at
  from song_favorites
  where song_id = duplicate_song_id
  on conflict (user_id, song_id) do nothing;
  delete from song_favorites where song_id = duplicate_song_id;

  -- song_tags: PK (song_id, tag_id)
  insert into song_tags (song_id, tag_id)
  select canonical_song_id, tag_id from song_tags where song_id = duplicate_song_id
  on conflict (song_id, tag_id) do nothing;
  delete from song_tags where song_id = duplicate_song_id;

  -- Referencias simples por song_id, sin restricción de unicidad
  update song_edit_proposals set song_id = canonical_song_id where song_id = duplicate_song_id;
  update song_reports set song_id = canonical_song_id where song_id = duplicate_song_id;
  update song_sections set song_id = canonical_song_id where song_id = duplicate_song_id;
  update song_chords set song_id = canonical_song_id where song_id = duplicate_song_id;
  update song_sources set song_id = canonical_song_id where song_id = duplicate_song_id;
  update song_ai_reviews set song_id = canonical_song_id where song_id = duplicate_song_id;

  -- song_versions: UNIQUE(song_id, version_number) — renumerar las
  -- versiones de la duplicada para que continúen después de las de la
  -- canónica, y dejarlas todas como no vigentes (is_current = false).
  select coalesce(max(version_number), 0) into max_version
  from song_versions where song_id = canonical_song_id;

  update song_versions sv
  set song_id = canonical_song_id,
      version_number = max_version + numbered.row_number,
      is_current = false
  from (
    select id, row_number() over (order by version_number) as row_number
    from song_versions where song_id = duplicate_song_id
  ) numbered
  where sv.id = numbered.id;

  -- Marcar la duplicada como eliminada lógicamente, conservando el
  -- registro y hacia dónde se fusionó.
  update songs
  set is_deleted = true,
      status = 'archived',
      merged_into = canonical_song_id
  where id = duplicate_song_id;

  insert into audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(),
    'merge_songs',
    'songs',
    canonical_song_id,
    jsonb_build_object('duplicate_song_id', duplicate_song_id)
  );
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function public.merge_duplicate_songs(uuid, uuid) to authenticated;
