-- Búsqueda instantánea del catálogo, incluyendo canciones privadas.
-- La búsqueda no cambia la visibilidad. La promoción a pública ocurre únicamente
-- cuando un usuario sin acceso compartido decide abrir/reutilizar la canción.

create extension if not exists pg_trgm;

create or replace function public.search_song_catalog(
  search_query text,
  result_limit integer default 20
)
returns table (
  id uuid,
  title text,
  slug text,
  artist text,
  detected_key text,
  original_key text,
  visibility public.song_visibility,
  is_owner boolean,
  shared_list_access boolean,
  can_open_directly boolean,
  match_score real
)
language plpgsql
security definer
set search_path = public
as $$
declare
  requester uuid := auth.uid();
  v_query text := public.normalize_song_lookup_text(search_query);
begin
  if requester is null then
    raise exception 'Debes iniciar sesión.' using errcode = '42501';
  end if;

  if coalesce(v_query, '') = '' then
    return;
  end if;

  return query
  select
    s.id,
    s.title,
    s.slug,
    a.name as artist,
    s.detected_key,
    s.original_key,
    s.visibility,
    (s.created_by = requester) as is_owner,
    public.user_has_shared_setlist_song_access(s.id, requester) as shared_list_access,
    (
      s.visibility = 'public'
      or s.created_by = requester
      or public.user_has_shared_setlist_song_access(s.id, requester)
    ) as can_open_directly,
    greatest(
      similarity(public.normalize_song_lookup_text(coalesce(s.normalized_title, s.title)), v_query),
      similarity(public.normalize_song_lookup_text(coalesce(a.name, '')), v_query),
      case
        when public.normalize_song_lookup_text(coalesce(s.normalized_title, s.title)) like '%' || v_query || '%' then 1
        else 0
      end,
      case
        when public.normalize_song_lookup_text(coalesce(a.name, '')) like '%' || v_query || '%' then 0.95
        else 0
      end
    )::real as match_score
  from public.songs s
  left join public.artists a on a.id = s.artist_id
  where s.is_deleted = false
    and s.status = 'published'
    and (
      public.normalize_song_lookup_text(coalesce(s.normalized_title, s.title)) like '%' || v_query || '%'
      or public.normalize_song_lookup_text(coalesce(a.name, '')) like '%' || v_query || '%'
      or similarity(public.normalize_song_lookup_text(coalesce(s.normalized_title, s.title)), v_query) >= 0.30
      or similarity(public.normalize_song_lookup_text(coalesce(a.name, '')), v_query) >= 0.30
    )
  order by match_score desc, s.title asc
  limit greatest(1, least(coalesce(result_limit, 20), 50));
end;
$$;

grant execute on function public.search_song_catalog(text, integer) to authenticated;

notify pgrst, 'reload schema';
