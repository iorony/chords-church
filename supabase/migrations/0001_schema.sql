-- =========================================================
-- 0001_schema.sql
-- Esquema base de la plataforma de canciones y acordes
-- =========================================================

create extension if not exists "uuid-ossp";
create extension if not exists pg_trgm;

-- ---------- ENUMS ----------
create type user_role as enum ('visitor', 'user', 'moderator', 'admin');
create type song_visibility as enum ('public', 'private', 'link_only');
create type song_status as enum ('draft', 'pending_review', 'published', 'reported', 'archived');
create type setlist_status as enum ('draft', 'confirmed', 'finished', 'archived');
create type setlist_visibility as enum ('private', 'link_only', 'public');
create type report_status as enum ('open', 'reviewing', 'resolved', 'dismissed');
create type proposal_status as enum ('pending', 'approved', 'rejected');
create type ai_provider_name as enum ('openai', 'gemini', 'anthropic');

-- ---------- PROFILES ----------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  full_name text,
  avatar_url text,
  church_name text,
  main_instrument text,
  role user_role not null default 'user',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  last_active_at timestamptz not null default now()
);

-- ---------- ARTISTS ----------
create table artists (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text not null unique,
  normalized_name text not null,
  bio text,
  image_url text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index idx_artists_normalized_name on artists using gin (normalized_name gin_trgm_ops);

-- ---------- CATEGORIES / TAGS ----------
create table categories (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table tags (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  created_at timestamptz not null default now()
);

-- ---------- SONGS ----------
create table songs (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  slug text not null unique,
  normalized_title text not null,
  artist_id uuid references artists(id),
  category_id uuid references categories(id),
  original_key text,
  detected_key text,
  key_confidence numeric(4,3),
  language text not null default 'es',
  album text,
  release_year int,
  tempo_bpm int,
  time_signature text,
  default_capo int not null default 0,
  content text not null,           -- contenido actual (aprobado/publicado)
  original_content text not null,  -- contenido tal como lo pegó el usuario, nunca se sobreescribe silenciosamente
  visibility song_visibility not null default 'private',
  status song_status not null default 'draft',
  source_type text,               -- 'manual' | 'web_import' | 'ai_structured'
  source_url text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  is_deleted boolean not null default false
);
create index idx_songs_normalized_title on songs using gin (normalized_title gin_trgm_ops);
create index idx_songs_content_fts on songs using gin (to_tsvector('spanish', coalesce(content, '')));
create index idx_songs_status on songs (status);
create index idx_songs_visibility on songs (visibility);

create table song_tags (
  song_id uuid references songs(id) on delete cascade,
  tag_id uuid references tags(id) on delete cascade,
  primary key (song_id, tag_id)
);

-- ---------- SONG SECTIONS (estructura de la versión vigente) ----------
create table song_sections (
  id uuid primary key default uuid_generate_v4(),
  song_id uuid not null references songs(id) on delete cascade,
  version_id uuid,
  section_type text not null,
  section_label text not null,
  position int not null,
  content text not null,
  repeat_count int not null default 1,
  created_at timestamptz not null default now()
);
create index idx_song_sections_song_id on song_sections (song_id);

-- ---------- SONG VERSIONS (historial) ----------
create table song_versions (
  id uuid primary key default uuid_generate_v4(),
  song_id uuid not null references songs(id) on delete cascade,
  version_number int not null,
  content text not null,
  key text,
  change_summary text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  is_current boolean not null default false,
  unique (song_id, version_number)
);
create index idx_song_versions_song_id on song_versions (song_id);

-- ---------- SONG CHORDS (catálogo de acordes detectados, opcional para analítica/búsqueda) ----------
create table song_chords (
  id uuid primary key default uuid_generate_v4(),
  song_id uuid not null references songs(id) on delete cascade,
  chord text not null,
  is_recognized boolean not null default true,
  occurrences int not null default 1
);
create index idx_song_chords_song_id on song_chords (song_id);

-- ---------- SONG SOURCES (procedencia / atribución) ----------
create table song_sources (
  id uuid primary key default uuid_generate_v4(),
  song_id uuid not null references songs(id) on delete cascade,
  source_name text not null,
  source_url text,
  license_note text,
  imported boolean not null default false,
  retrieved_at timestamptz not null default now()
);

-- ---------- SONG AI REVIEWS ----------
create table song_ai_reviews (
  id uuid primary key default uuid_generate_v4(),
  song_id uuid references songs(id) on delete cascade,
  requested_by uuid references profiles(id),
  provider ai_provider_name not null,
  model text not null,
  input_content text not null,
  output_json jsonb not null,
  warnings jsonb not null default '[]'::jsonb,
  applied boolean not null default false,
  created_at timestamptz not null default now()
);
create index idx_song_ai_reviews_song_id on song_ai_reviews (song_id);

-- ---------- EDIT PROPOSALS ----------
create table song_edit_proposals (
  id uuid primary key default uuid_generate_v4(),
  song_id uuid not null references songs(id) on delete cascade,
  proposed_by uuid not null references profiles(id),
  proposed_content text not null,
  change_summary text,
  status proposal_status not null default 'pending',
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------- REPORTS ----------
create table song_reports (
  id uuid primary key default uuid_generate_v4(),
  song_id uuid not null references songs(id) on delete cascade,
  reported_by uuid references profiles(id),
  reason text not null,
  details text,
  status report_status not null default 'open',
  resolved_by uuid references profiles(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------- FAVORITES ----------
create table song_favorites (
  user_id uuid references profiles(id) on delete cascade,
  song_id uuid references songs(id) on delete cascade,
  preferred_key text,       -- tono preferido personal, sin afectar la canción pública
  created_at timestamptz not null default now(),
  primary key (user_id, song_id)
);

-- ---------- SETLISTS (repertorios) ----------
create table setlists (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references profiles(id),
  name text not null,
  description text,
  event_date date,
  location text,
  team_name text,
  visibility setlist_visibility not null default 'private',
  status setlist_status not null default 'draft',
  leader_name text,
  estimated_duration_minutes int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create type setlist_permission as enum ('read', 'edit');

create table setlist_members (
  setlist_id uuid references setlists(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  permission setlist_permission not null default 'read',
  added_at timestamptz not null default now(),
  primary key (setlist_id, user_id)
);

create table setlist_items (
  id uuid primary key default uuid_generate_v4(),
  setlist_id uuid not null references setlists(id) on delete cascade,
  song_id uuid not null references songs(id),
  song_version_id uuid references song_versions(id),
  position int not null,
  selected_key text,
  capo int not null default 0,
  prefer_flats boolean not null default false,
  private_notes text,
  created_at timestamptz not null default now()
);
create index idx_setlist_items_setlist_id on setlist_items (setlist_id);

-- ---------- EXTERNAL SEARCH (búsqueda web) ----------
create table external_sources (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  base_url text,
  can_import boolean not null default false,
  is_enabled boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);

create table external_search_cache (
  id uuid primary key default uuid_generate_v4(),
  query text not null,
  provider text not null,
  results jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days')
);
create index idx_external_search_cache_query on external_search_cache (query, provider);

-- ---------- EXPORTS ----------
create table exports (
  id uuid primary key default uuid_generate_v4(),
  requested_by uuid references profiles(id),
  export_type text not null,        -- 'pdf' | 'docx'
  scope text not null,              -- 'song' | 'setlist'
  scope_id uuid not null,
  storage_path text,
  status text not null default 'processing', -- 'processing' | 'ready' | 'failed'
  created_at timestamptz not null default now()
);

-- ---------- AUDIT LOG ----------
create table audit_logs (
  id uuid primary key default uuid_generate_v4(),
  actor_id uuid references profiles(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index idx_audit_logs_entity on audit_logs (entity_type, entity_id);

-- ---------- APP SETTINGS ----------
create table app_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references profiles(id),
  updated_at timestamptz not null default now()
);

insert into app_settings (key, value) values
  ('ai_provider', '{"provider": "anthropic", "daily_limit_per_user": 30}'),
  ('search_provider', '{"provider": null, "enabled": false}');

-- ---------- updated_at triggers ----------
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_songs_updated_at before update on songs
  for each row execute function set_updated_at();

create trigger trg_setlists_updated_at before update on setlists
  for each row execute function set_updated_at();

-- ---------- perfil automático al registrarse ----------
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)), 'user');
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
