-- ============================================================
-- 0009: Detectar canciones privadas existentes por título,
-- artista Y contenido, incluso cuando RLS no las muestra.
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
        'áéíóúüñÁÉÍÓÚÜÑ',
        'aeiouunAEIOUUN'
      ),
      '[^a-z0-9]+',
      ' ',
      'g'
    )
  );
$$;

-- Normalización más tolerante para comparar letra y acordes.
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

-- Se crea una firma de palabras de letra eliminando tokens que parecen acordes.
create or replace function public.song_lyrics_lookup_signature(value text)
returns text
language sql
immutable
as $$
  select trim(regexp_replace(
    regexp_replace(
      public.normalize_song_lookup_content(value),
      '\m[a-g](#|b)?(m|maj|min|dim|aug|sus|add)?[0-9]*(\/[a-g](#|b)?)?\M',
      ' ',
      'gi'
    ),
    '\s+',
    ' ',
    'g'
  ));
$$;

-- Firma nueva con contenido. Se conserva el nombre del RPC, pero ahora recibe
-- también el contenido para encontrar coincidencias privadas aunque el artista
-- tenga una escritura diferente o el título no sea idéntico al 100 %.
create or replace function public.resolve_existing_song_for_creation(
  requested_title text,
  requested_artist text default null,
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
  was_promoted boolean := false;
  normalized_title text := public.normalize_song_lookup_text(requested_title);
  normalized_artist text := public.normalize_song_lookup_text(requested_artist);
  normalized_content text := public.song_lyrics_lookup_signature(requested_content);
begin
  if requester is null then
    raise exception 'Debes iniciar sesión.' using errcode = '42501';
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
    case
      when normalized_artist = '' then 0
      else similarity(public.normalize_song_lookup_text(a.name), normalized_artist)
    end as artist_score,
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
      -- Mismo título y artista razonablemente parecido.
      (
        similarity(
          public.normalize_song_lookup_text(coalesce(s.normalized_title, s.title)),
          normalized_title
        ) >= 0.92
        and (
          normalized_artist = ''
          or similarity(public.normalize_song_lookup_text(a.name), normalized_artist) >= 0.72
          or (
            length(normalized_content) >= 40
            and similarity(public.song_lyrics_lookup_signature(s.content), normalized_content) >= 0.28
          )
        )
      )
      -- O letra prácticamente igual, aunque título/artista difieran.
      or (
        length(normalized_content) >= 40
        and similarity(public.song_lyrics_lookup_signature(s.content), normalized_content) >= 0.70
      )
    )
  order by
    case
      when similarity(public.song_lyrics_lookup_signature(s.content), normalized_content) >= 0.70 then 0
      else 1
    end,
    score desc,
    s.created_at asc
  limit 1;

  if candidate.id is null then
    return;
  end if;

  has_shared_access := public.user_has_shared_setlist_song_access(candidate.id, requester);

  if candidate.visibility = 'private'
     and candidate.created_by <> requester
     and not has_shared_access then
    update public.songs
       set visibility = 'public', updated_at = now()
     where public.songs.id = candidate.id
       and public.songs.visibility = 'private';

    candidate.visibility := 'public';
    was_promoted := true;
  end if;

  return query
  select
    candidate.id,
    candidate.title,
    candidate.slug,
    candidate.artist_name,
    candidate.visibility,
    was_promoted,
    has_shared_access,
    candidate.score::numeric,
    case
      when candidate.content_score >= 0.70 then 'content'
      else 'title_artist'
    end;
end;
$$;

grant execute on function public.resolve_existing_song_for_creation(text, text, text)
to authenticated;
