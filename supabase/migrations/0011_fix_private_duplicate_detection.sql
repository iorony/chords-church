-- ============================================================
-- 0011: Corrección consolidada de detección de canciones privadas
-- antes de analizar, tanto por título/artista como por contenido.
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

-- Elimina firmas antiguas para evitar ambigüedad en PostgREST.
drop function if exists public.preview_existing_song_for_creation(text, text);
drop function if exists public.resolve_existing_song_for_creation(text, text);

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
    similarity(public.normalize_song_lookup_text(coalesce(s.normalized_title, s.title)), normalized_title) as title_score,
    similarity(public.normalize_song_lookup_text(coalesce(a.name, '')), normalized_artist) as artist_score,
    case
      when length(normalized_content) >= 40
      then similarity(public.song_lyrics_lookup_signature(coalesce(s.content, '')), normalized_content)
      else 0
    end as content_score
  into candidate
  from public.songs s
  left join public.artists a on a.id = s.artist_id
  where coalesce(s.is_deleted, false) = false
    and s.created_by is distinct from requester
    and (
      (
        public.normalize_song_lookup_text(coalesce(s.normalized_title, s.title)) = normalized_title
        and public.normalize_song_lookup_text(coalesce(a.name, '')) = normalized_artist
      )
      or (
        similarity(public.normalize_song_lookup_text(coalesce(s.normalized_title, s.title)), normalized_title) >= 0.88
        and similarity(public.normalize_song_lookup_text(coalesce(a.name, '')), normalized_artist) >= 0.68
      )
      or (
        length(normalized_content) >= 40
        and similarity(public.song_lyrics_lookup_signature(coalesce(s.content, '')), normalized_content) >= 0.62
      )
    )
  order by
    case
      when public.normalize_song_lookup_text(coalesce(s.normalized_title, s.title)) = normalized_title
       and public.normalize_song_lookup_text(coalesce(a.name, '')) = normalized_artist
      then 0
      when length(normalized_content) >= 40
       and similarity(public.song_lyrics_lookup_signature(coalesce(s.content, '')), normalized_content) >= 0.62
      then 1
      else 2
    end,
    greatest(
      similarity(public.normalize_song_lookup_text(coalesce(s.normalized_title, s.title)), normalized_title),
      similarity(public.normalize_song_lookup_text(coalesce(a.name, '')), normalized_artist),
      case when length(normalized_content) >= 40 then similarity(public.song_lyrics_lookup_signature(coalesce(s.content, '')), normalized_content) else 0 end
    ) desc,
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
    greatest(candidate.title_score, candidate.artist_score, candidate.content_score)::numeric,
    case
      when candidate.title_score = 1 and candidate.artist_score = 1 then 'title_artist_exact'
      when candidate.content_score >= 0.62 then 'content'
      else 'title_artist'
    end;
end;
$$;

create or replace function public.resolve_existing_song_for_creation(
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
  found_row record;
  was_promoted boolean := false;
begin
  if requester is null then
    raise exception 'Debes iniciar sesión.' using errcode = '42501';
  end if;

  select * into found_row
  from public.preview_existing_song_for_creation(requested_title, requested_artist, requested_content)
  limit 1;

  if found_row.id is null then
    return;
  end if;

  if found_row.visibility = 'private'
     and not found_row.shared_list_access then
    update public.songs
       set visibility = 'public', updated_at = now()
     where public.songs.id = found_row.id
       and public.songs.visibility = 'private';

    if found then
      was_promoted := true;
      found_row.visibility := 'public';
    end if;
  end if;

  return query
  select
    found_row.id,
    found_row.title,
    found_row.slug,
    found_row.artist,
    found_row.visibility,
    was_promoted,
    found_row.shared_list_access,
    found_row.match_score,
    found_row.match_reason;
end;
$$;

grant execute on function public.preview_existing_song_for_creation(text, text, text) to authenticated;
grant execute on function public.resolve_existing_song_for_creation(text, text, text) to authenticated;

-- Solicita a PostgREST refrescar su caché de esquema.
notify pgrst, 'reload schema';
