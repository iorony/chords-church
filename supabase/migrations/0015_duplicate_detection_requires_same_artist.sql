-- ============================================================
-- 0015: Los duplicados requieren el mismo artista
-- ============================================================
-- Una canción con el mismo título o letra similar, pero atribuida a un
-- artista diferente, se considera una versión distinta y puede crearse.
-- La coincidencia de artista se compara sin mayúsculas, tildes ni espacios
-- adicionales mediante normalize_song_lookup_text().
-- ============================================================

create or replace function public.preview_existing_song_for_creation(
  requested_title text,
  requested_artist text,
  requested_content text
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
  v_requester uuid := auth.uid();
  v_candidate record;
  v_has_shared_access boolean := false;
  v_normalized_title text := public.normalize_song_lookup_text(requested_title);
  v_normalized_artist text := public.normalize_song_lookup_text(requested_artist);
  v_normalized_content text := public.song_lyrics_lookup_signature(requested_content);
begin
  if v_requester is null then
    raise exception 'Debes iniciar sesión.' using errcode = '42501';
  end if;

  if v_normalized_title = '' or v_normalized_artist = '' then
    return;
  end if;

  select
    s.id as song_id,
    s.title as song_title,
    s.slug as song_slug,
    s.visibility as song_visibility,
    s.created_by as song_owner,
    a.name as artist_name,
    similarity(
      public.normalize_song_lookup_text(coalesce(s.normalized_title, s.title)),
      v_normalized_title
    ) as title_score,
    similarity(
      public.normalize_song_lookup_text(coalesce(a.name, '')),
      v_normalized_artist
    ) as artist_score,
    case
      when length(v_normalized_content) >= 40 then
        similarity(
          public.song_lyrics_lookup_signature(coalesce(s.content, '')),
          v_normalized_content
        )
      else 0
    end as content_score
  into v_candidate
  from public.songs as s
  inner join public.artists as a
    on a.id = s.artist_id
  where coalesce(s.is_deleted, false) = false
    and s.created_by is distinct from v_requester

    -- REGLA OBLIGATORIA: el artista debe coincidir exactamente después
    -- de normalizar mayúsculas, tildes, signos y espacios.
    and public.normalize_song_lookup_text(coalesce(a.name, '')) = v_normalized_artist

    and (
      public.normalize_song_lookup_text(coalesce(s.normalized_title, s.title)) = v_normalized_title
      or similarity(
        public.normalize_song_lookup_text(coalesce(s.normalized_title, s.title)),
        v_normalized_title
      ) >= 0.88
      or (
        length(v_normalized_content) >= 40
        and similarity(
          public.song_lyrics_lookup_signature(coalesce(s.content, '')),
          v_normalized_content
        ) >= 0.62
      )
    )
  order by
    case
      when public.normalize_song_lookup_text(coalesce(s.normalized_title, s.title)) = v_normalized_title
        then 0
      when length(v_normalized_content) >= 40
       and similarity(
         public.song_lyrics_lookup_signature(coalesce(s.content, '')),
         v_normalized_content
       ) >= 0.62
        then 1
      else 2
    end,
    greatest(
      similarity(
        public.normalize_song_lookup_text(coalesce(s.normalized_title, s.title)),
        v_normalized_title
      ),
      case
        when length(v_normalized_content) >= 40 then
          similarity(
            public.song_lyrics_lookup_signature(coalesce(s.content, '')),
            v_normalized_content
          )
        else 0
      end
    ) desc,
    s.created_at asc
  limit 1;

  if v_candidate.song_id is null then
    return;
  end if;

  v_has_shared_access := public.user_has_shared_setlist_song_access(
    v_candidate.song_id,
    v_requester
  );

  return query
  select
    v_candidate.song_id::uuid,
    v_candidate.song_title::text,
    v_candidate.song_slug::text,
    v_candidate.artist_name::text,
    v_candidate.song_visibility::public.song_visibility,
    false,
    v_has_shared_access,
    greatest(v_candidate.title_score, v_candidate.content_score)::numeric,
    case
      when v_candidate.title_score = 1 then 'title_artist_exact'
      when v_candidate.content_score >= 0.62 then 'content_same_artist'
      else 'title_artist'
    end::text;
end;
$$;

-- resolve_existing_song_for_creation usa la función preview anterior,
-- por lo que hereda automáticamente la regla de mismo artista.

grant execute on function public.preview_existing_song_for_creation(text, text, text)
to authenticated;

grant execute on function public.resolve_existing_song_for_creation(text, text, text)
to authenticated;

notify pgrst, 'reload schema';
