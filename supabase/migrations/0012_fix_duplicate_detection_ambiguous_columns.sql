-- ============================================================
-- 0012: Corrige funciones de detección de duplicados privados.
-- - Elimina firmas antiguas con parámetros por defecto.
-- - Evita variables ambiguas como normalized_title.
-- - Conserva detección por título, artista y contenido.
-- ============================================================

create extension if not exists pg_trgm;

create or replace function public.normalize_song_lookup_text(value text)
returns text
language sql
immutable
as $$
  select trim(
    regexp_replace(
      translate(
        lower(coalesce(value, '')),
        'áéíóúüñ',
        'aeiouun'
      ),
      '[^a-z0-9]+',
      ' ',
      'g'
    )
  );
$$;

create or replace function public.normalize_song_lookup_content(value text)
returns text
language sql
immutable
as $$
  select trim(
    regexp_replace(
      regexp_replace(
        public.normalize_song_lookup_text(value),
        '\m(intro|estrofa|verso|verse|pre coro|precoro|coro|chorus|puente|bridge|final|outro|turn|instrumental)\M[ ]*[0-9ivx]*',
        ' ',
        'gi'
      ),
      '\s+',
      ' ',
      'g'
    )
  );
$$;

create or replace function public.song_lyrics_lookup_signature(value text)
returns text
language sql
immutable
as $$
  select trim(
    regexp_replace(
      regexp_replace(
        public.normalize_song_lookup_content(value),
        '\m[a-g](#|b)?(m|maj|min|dim|aug|sus|add)?[0-9]*(\/[a-g](#|b)?)?\M',
        ' ',
        'gi'
      ),
      '\s+',
      ' ',
      'g'
    )
  );
$$;

-- Resolver depende de preview; se elimina primero.
drop function if exists public.resolve_existing_song_for_creation(text, text, text);
drop function if exists public.resolve_existing_song_for_creation(text, text);
drop function if exists public.preview_existing_song_for_creation(text, text, text);
drop function if exists public.preview_existing_song_for_creation(text, text);

create function public.preview_existing_song_for_creation(
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
  left join public.artists as a
    on a.id = s.artist_id
  where coalesce(s.is_deleted, false) = false
    and s.created_by is distinct from v_requester
    and (
      (
        public.normalize_song_lookup_text(coalesce(s.normalized_title, s.title)) = v_normalized_title
        and public.normalize_song_lookup_text(coalesce(a.name, '')) = v_normalized_artist
      )
      or (
        similarity(
          public.normalize_song_lookup_text(coalesce(s.normalized_title, s.title)),
          v_normalized_title
        ) >= 0.88
        and similarity(
          public.normalize_song_lookup_text(coalesce(a.name, '')),
          v_normalized_artist
        ) >= 0.68
      )
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
       and public.normalize_song_lookup_text(coalesce(a.name, '')) = v_normalized_artist
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
      similarity(
        public.normalize_song_lookup_text(coalesce(a.name, '')),
        v_normalized_artist
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
    greatest(
      v_candidate.title_score,
      v_candidate.artist_score,
      v_candidate.content_score
    )::numeric,
    case
      when v_candidate.title_score = 1 and v_candidate.artist_score = 1
        then 'title_artist_exact'
      when v_candidate.content_score >= 0.62
        then 'content'
      else 'title_artist'
    end::text;
end;
$$;

create function public.resolve_existing_song_for_creation(
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
  v_found_row record;
  v_was_promoted boolean := false;
begin
  if v_requester is null then
    raise exception 'Debes iniciar sesión.' using errcode = '42501';
  end if;

  select p.*
  into v_found_row
  from public.preview_existing_song_for_creation(
    requested_title,
    requested_artist,
    requested_content
  ) as p
  limit 1;

  if v_found_row.id is null then
    return;
  end if;

  if v_found_row.visibility = 'private'
     and not v_found_row.shared_list_access then
    update public.songs as s
       set visibility = 'public',
           updated_at = now()
     where s.id = v_found_row.id
       and s.visibility = 'private';

    if found then
      v_was_promoted := true;
      v_found_row.visibility := 'public';
    end if;
  end if;

  return query
  select
    v_found_row.id::uuid,
    v_found_row.title::text,
    v_found_row.slug::text,
    v_found_row.artist::text,
    v_found_row.visibility::public.song_visibility,
    v_was_promoted,
    v_found_row.shared_list_access::boolean,
    v_found_row.match_score::numeric,
    v_found_row.match_reason::text;
end;
$$;

grant execute on function public.preview_existing_song_for_creation(text, text, text)
to authenticated;

grant execute on function public.resolve_existing_song_for_creation(text, text, text)
to authenticated;

notify pgrst, 'reload schema';
