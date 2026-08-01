-- ============================================================
-- 0010: Vista previa de duplicados antes del análisis.
-- No cambia la visibilidad de la canción; solo informa si existe.
-- ============================================================

create or replace function public.preview_existing_song_for_creation(
  requested_title text,
  requested_artist text,
  requested_content text default null
)
returns table (
  id uuid,
  title text,
  slug text,
  artist text,
  visibility public.song_visibility,
  promoted_to_public boolean,
  shared_list_access boolean,
  match_score numeric,
  match_reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  requester uuid := auth.uid();
  candidate record;
  has_shared_access boolean := false;
  normalized_title text := public.normalize_song_lookup_text(requested_title);
  normalized_artist text := public.normalize_song_lookup_text(requested_artist);
  normalized_content text := public.song_lyrics_lookup_signature(requested_content);
begin
  if requester is null then
    raise exception 'Debes iniciar sesión.' using errcode = '42501';
  end if;

  if normalized_title = '' or normalized_artist = '' then
    return;
  end if;

  select
    s.id,
    s.title,
    s.slug,
    s.visibility,
    s.created_by,
    a.name as artist_name,
    greatest(
      similarity(
        public.normalize_song_lookup_text(coalesce(s.normalized_title, s.title)),
        normalized_title
      ),
      case
        when length(normalized_content) >= 40 then
          similarity(public.song_lyrics_lookup_signature(s.content), normalized_content)
        else 0
      end
    ) as score,
    similarity(
      public.normalize_song_lookup_text(coalesce(s.normalized_title, s.title)),
      normalized_title
    ) as title_score,
    similarity(public.normalize_song_lookup_text(a.name), normalized_artist) as artist_score,
    case
      when length(normalized_content) >= 40 then
        similarity(public.song_lyrics_lookup_signature(s.content), normalized_content)
      else 0
    end as content_score
  into candidate
  from public.songs s
  left join public.artists a on a.id = s.artist_id
  where coalesce(s.is_deleted, false) = false
    and s.created_by is distinct from requester
    and (
      (
        similarity(
          public.normalize_song_lookup_text(coalesce(s.normalized_title, s.title)),
          normalized_title
        ) >= 0.92
        and similarity(public.normalize_song_lookup_text(a.name), normalized_artist) >= 0.72
      )
      or (
        length(normalized_content) >= 40
        and similarity(public.song_lyrics_lookup_signature(s.content), normalized_content) >= 0.70
      )
    )
  order by
    case
      when length(normalized_content) >= 40
       and similarity(public.song_lyrics_lookup_signature(s.content), normalized_content) >= 0.70
      then 0 else 1
    end,
    score desc,
    s.created_at asc
  limit 1;

  if candidate.id is null then
    return;
  end if;

  has_shared_access := public.user_has_shared_setlist_song_access(candidate.id, requester);

  return query
  select
    candidate.id,
    candidate.title,
    candidate.slug,
    candidate.artist_name,
    candidate.visibility,
    false,
    has_shared_access,
    candidate.score::numeric,
    case
      when candidate.content_score >= 0.70 then 'content'
      else 'title_artist'
    end;
end;
$$;

grant execute on function public.preview_existing_song_for_creation(text, text, text)
to authenticated;
