-- Regla de visibilidad al reutilizar canciones existentes:
-- 1) La canción privada permanece privada cuando el propietario comparte una lista
--    que la contiene con otro usuario.
-- 2) Si un usuario sin acceso por lista compartida intenta agregar una canción ya
--    existente, la canción pasa automáticamente a pública.
-- 3) El usuario podrá abrir la canción pública y proponer una corrección.

create or replace function public.normalize_song_lookup_text(value text)
returns text
language sql
immutable
as $$
  select trim(
    regexp_replace(
      translate(lower(coalesce(value, '')),
        'áéíóúüñÁÉÍÓÚÜÑ',
        'aeiouunAEIOUUN'),
      '[^a-z0-9]+', ' ', 'g'
    )
  );
$$;

-- Comprueba exclusivamente si el usuario recibió acceso mediante setlist_members.
-- Que una lista sea pública o link_only no equivale a haber sido compartida
-- directamente con ese usuario para esta regla de privacidad.
create or replace function public.user_has_shared_setlist_song_access(
  target_song_id uuid,
  target_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.setlist_items si
    join public.setlist_members sm on sm.setlist_id = si.setlist_id
    where si.song_id = target_song_id
      and sm.user_id = target_user_id
  );
$$;

grant execute on function public.user_has_shared_setlist_song_access(uuid, uuid) to authenticated;

-- Busca una coincidencia exacta por título y artista, incluso si la canción privada
-- todavía no es visible por RLS para el usuario que intenta agregarla.
-- Si el usuario no es el propietario ni miembro de una lista compartida que la
-- contiene, la convierte en pública de forma atómica.
create or replace function public.resolve_existing_song_for_creation(
  requested_title text,
  requested_artist text default null
)
returns table (
  id uuid,
  title text,
  slug text,
  artist text,
  visibility public.song_visibility,
  promoted_to_public boolean,
  shared_list_access boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  requester uuid := auth.uid();
  matched_song public.songs%rowtype;
  matched_artist text;
  has_shared_access boolean := false;
  was_promoted boolean := false;
begin
  if requester is null then
    raise exception 'Debes iniciar sesión.' using errcode = '42501';
  end if;

  select s.*
    into matched_song
  from public.songs s
  left join public.artists a on a.id = s.artist_id
  where coalesce(s.is_deleted, false) = false
    and public.normalize_song_lookup_text(coalesce(s.normalized_title, s.title)) =
        public.normalize_song_lookup_text(requested_title)
    and (
      (nullif(public.normalize_song_lookup_text(requested_artist), '') is null
        and nullif(public.normalize_song_lookup_text(a.name), '') is null)
      or public.normalize_song_lookup_text(a.name) =
         public.normalize_song_lookup_text(requested_artist)
    )
  order by s.created_at asc
  limit 1;

  if not found or matched_song.id is null then
    return;
  end if;

  if matched_song.artist_id is not null then
    select a.name
      into matched_artist
    from public.artists a
    where a.id = matched_song.artist_id
    limit 1;
  else
    matched_artist := null;
  end if;

  has_shared_access := public.user_has_shared_setlist_song_access(matched_song.id, requester);

  if matched_song.visibility = 'private'
     and matched_song.created_by <> requester
     and not has_shared_access then
    update public.songs
       set visibility = 'public', updated_at = now()
     where public.songs.id = matched_song.id;
    matched_song.visibility := 'public';
    was_promoted := true;
  end if;

  return query
  select matched_song.id,
         matched_song.title,
         matched_song.slug,
         matched_artist,
         matched_song.visibility,
         was_promoted,
         has_shared_access;
end;
$$;

grant execute on function public.resolve_existing_song_for_creation(text, text) to authenticated;

-- Una canción puede seguir/volver privada mientras todos los propietarios externos
-- que la usan hayan recibido acceso previo mediante una lista compartida.
create or replace function public.song_can_be_private(target_song_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1
    from public.setlist_items si
    join public.setlists sl on sl.id = si.setlist_id
    join public.songs s on s.id = si.song_id
    where si.song_id = target_song_id
      and sl.owner_id <> s.created_by
      and not public.user_has_shared_setlist_song_access(target_song_id, sl.owner_id)
  );
$$;

grant execute on function public.song_can_be_private(uuid) to authenticated;

-- Ajusta el disparador de reutilización: si el propietario de la lista ya recibió
-- la canción mediante una lista compartida, no se publica. Solo se publica cuando
-- un usuario completamente nuevo la reutiliza.
create or replace function public.publish_song_when_reused_by_another_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  list_owner uuid;
  song_owner uuid;
  has_shared_access boolean := false;
begin
  select owner_id into list_owner from public.setlists where id = new.setlist_id;
  select created_by into song_owner from public.songs where id = new.song_id;

  if list_owner is not null and song_owner is not null then
    has_shared_access := public.user_has_shared_setlist_song_access(new.song_id, list_owner);
  end if;

  if list_owner is not null
     and song_owner is not null
     and list_owner <> song_owner
     and not has_shared_access then
    update public.songs
       set visibility = 'public', updated_at = now()
     where id = new.song_id and visibility = 'private';
  end if;

  return new;
end;
$$;
