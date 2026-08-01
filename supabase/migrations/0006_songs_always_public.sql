-- Todas las canciones del cancionero deben ser públicas.
-- Corrige registros existentes y establece el valor público como predeterminado.
update public.songs
set visibility = 'public'
where visibility is distinct from 'public';

alter table public.songs
  alter column visibility set default 'public';

-- Impide que clientes antiguos o futuras pantallas guarden canciones privadas.
create or replace function public.force_song_visibility_public()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.visibility := 'public';
  return new;
end;
$$;

drop trigger if exists songs_force_public_visibility on public.songs;
create trigger songs_force_public_visibility
before insert or update of visibility on public.songs
for each row
execute function public.force_song_visibility_public();
