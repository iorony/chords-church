-- Permite canciones públicas o privadas.
-- Una canción privada sigue accesible cuando forma parte de una lista compartida.
-- Si otro usuario la agrega a una lista propia, se vuelve pública automáticamente.

-- Retirar la regla anterior que forzaba todas las canciones a públicas.
drop trigger if exists songs_force_public_visibility on public.songs;
drop function if exists public.force_song_visibility_public();

alter table public.songs
  alter column visibility set default 'private';

-- Indica si la canción puede permanecer o volver a ser privada.
-- Solo se impide cuando existe una lista cuyo propietario no es el creador de la canción.
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
  );
$$;

grant execute on function public.song_can_be_private(uuid) to authenticated;

-- Impide volver privada una canción que ya es utilizada en una lista propia de otro usuario.
create or replace function public.enforce_song_private_eligibility()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.visibility = 'private'
     and not public.song_can_be_private(new.id) then
    raise exception 'La canción no puede ser privada porque otro usuario ya la agregó a una lista propia.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists songs_enforce_private_eligibility on public.songs;
create trigger songs_enforce_private_eligibility
before update of visibility on public.songs
for each row execute function public.enforce_song_private_eligibility();

-- Cuando un usuario agrega una canción privada a una lista de la que es propietario,
-- y dicho usuario no es el creador de la canción, la canción pasa a ser pública.
-- Agregarla o verla dentro de una lista compartida del creador no la publica.
create or replace function public.publish_song_when_reused_by_another_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  list_owner uuid;
  song_owner uuid;
begin
  select owner_id into list_owner from public.setlists where id = new.setlist_id;
  select created_by into song_owner from public.songs where id = new.song_id;

  if list_owner is not null
     and song_owner is not null
     and list_owner <> song_owner then
    update public.songs
      set visibility = 'public', updated_at = now()
      where id = new.song_id and visibility <> 'public';
  end if;

  return new;
end;
$$;

drop trigger if exists setlist_items_publish_reused_song on public.setlist_items;
create trigger setlist_items_publish_reused_song
after insert or update of song_id, setlist_id on public.setlist_items
for each row execute function public.publish_song_when_reused_by_another_owner();

-- Comprobación segura para RLS: dueño, moderador, canción pública/link-only,
-- o acceso derivado de una lista visible/compartida que contiene la canción.
create or replace function public.can_read_song_through_setlist(target_song_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.setlist_items si
    join public.setlists sl on sl.id = si.setlist_id
    left join public.setlist_members sm
      on sm.setlist_id = sl.id and sm.user_id = auth.uid()
    where si.song_id = target_song_id
      and (
        sl.owner_id = auth.uid()
        or sl.visibility in ('public', 'link_only')
        or sm.user_id is not null
      )
  );
$$;

grant execute on function public.can_read_song_through_setlist(uuid) to anon, authenticated;

-- Reemplazar la política de lectura de canciones para incluir listas compartidas.
drop policy if exists "songs_select_public" on public.songs;
create policy "songs_select_public_or_shared"
on public.songs for select
using (
  is_deleted = false and (
    visibility = 'public'
    or visibility = 'link_only'
    or created_by = auth.uid()
    or public.can_read_song_through_setlist(id)
    or public.is_moderator_or_admin()
  )
);
