-- =========================================================
-- 0003_seed.sql
-- Datos iniciales de ejemplo (categorías, artista, canción demo)
-- Nota: para crear el primer usuario administrador, registra una cuenta
-- normalmente desde la app y luego ejecuta el UPDATE al final de este
-- archivo con el correo de esa cuenta.
-- =========================================================

insert into categories (name, slug) values
  ('Adoración', 'adoracion'),
  ('Alabanza', 'alabanza'),
  ('Juvenil', 'juvenil'),
  ('Navidad', 'navidad')
on conflict (name) do nothing;

insert into artists (name, slug, normalized_name) values
  ('Equipo de Alabanza', 'equipo-de-alabanza', 'equipo de alabanza')
on conflict (slug) do nothing;

-- Canción demo (se inserta sin created_by porque las migraciones corren
-- antes de que existan usuarios; asígnala a un usuario real después si quieres editarla)
insert into songs (
  title, slug, normalized_title, artist_id, category_id,
  original_key, detected_key, key_confidence, language,
  content, original_content, visibility, status, source_type
)
select
  'Grande Eres Dios (demo)',
  'grande-eres-dios-demo',
  'grande eres dios demo',
  (select id from artists where slug = 'equipo-de-alabanza'),
  (select id from categories where slug = 'adoracion'),
  'G', 'G', 0.9, 'es',
  '[INTRO]
| G / / / | D/F# / / / | Em7 / / / | Cadd9 / / / |

[ESTROFA 1]
G
Grande eres Dios
D/F#
Tu amor nunca fallará
Em7
Siempre permaneces
Cadd9
Por la eternidad

[CORO]
G
Te adoramos
D
Te exaltamos
Em7
Cristo, eres digno
Cadd9
Por siempre reinarás',
  'G        D
Grande eres Dios
Em             C
Tu amor nunca fallará',
  'public', 'published', 'manual'
where not exists (select 1 from songs where slug = 'grande-eres-dios-demo');

-- ---------------------------------------------------------
-- Para convertir tu cuenta en administrador, después de registrarte
-- en la app, ejecuta (reemplazando el correo):
--
-- update profiles set role = 'admin'
-- where id = (select id from auth.users where email = 'tu-correo@ejemplo.com');
-- ---------------------------------------------------------
