-- =========================================================
-- 0002_rls.sql
-- Row Level Security para todas las tablas con datos privados
-- =========================================================

-- ---------- Función auxiliar: rol del usuario actual ----------
create or replace function current_user_role()
returns user_role as $$
  select role from profiles where id = auth.uid();
$$ language sql stable security definer set search_path = public;

create or replace function is_moderator_or_admin()
returns boolean as $$
  select coalesce(current_user_role() in ('moderator', 'admin'), false);
$$ language sql stable security definer set search_path = public;

-- ================= PROFILES =================
alter table profiles enable row level security;

create policy "profiles_select_own_or_public_fields"
  on profiles for select
  using (true); -- el listado de campos sensibles se controla en la capa de aplicación / vistas

create policy "profiles_update_own"
  on profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "profiles_admin_manage"
  on profiles for update
  using (is_moderator_or_admin());

-- ================= ARTISTS / CATEGORIES / TAGS (lectura pública) =================
alter table artists enable row level security;
alter table categories enable row level security;
alter table tags enable row level security;
alter table song_tags enable row level security;

create policy "artists_public_read" on artists for select using (true);
create policy "artists_authenticated_insert" on artists for insert with check (auth.uid() is not null);
create policy "artists_moderator_update" on artists for update using (is_moderator_or_admin());

create policy "categories_public_read" on categories for select using (true);
create policy "categories_moderator_write" on categories for all using (is_moderator_or_admin());

create policy "tags_public_read" on tags for select using (true);
create policy "tags_authenticated_insert" on tags for insert with check (auth.uid() is not null);

create policy "song_tags_public_read" on song_tags for select using (true);
create policy "song_tags_owner_write" on song_tags for all
  using (exists (select 1 from songs s where s.id = song_id and s.created_by = auth.uid()) or is_moderator_or_admin());

-- ================= SONGS =================
alter table songs enable row level security;

-- Lectura: canciones públicas para todos; privadas solo el dueño; link_only requiere conocer el id (se filtra en la app)
create policy "songs_select_public"
  on songs for select
  using (
    is_deleted = false and (
      visibility = 'public'
      or visibility = 'link_only'
      or (visibility = 'private' and created_by = auth.uid())
      or is_moderator_or_admin()
    )
  );

create policy "songs_insert_authenticated"
  on songs for insert
  with check (auth.uid() is not null and created_by = auth.uid());

-- Un usuario solo puede editar directamente sus propios borradores/canciones; canciones ajenas requieren propuesta
create policy "songs_update_own_or_moderator"
  on songs for update
  using (created_by = auth.uid() or is_moderator_or_admin())
  with check (created_by = auth.uid() or is_moderator_or_admin());

create policy "songs_delete_own_or_moderator"
  on songs for update -- eliminación lógica vía update de is_deleted
  using (created_by = auth.uid() or is_moderator_or_admin());

-- ================= SONG SECTIONS / VERSIONS / CHORDS / SOURCES =================
alter table song_sections enable row level security;
alter table song_versions enable row level security;
alter table song_chords enable row level security;
alter table song_sources enable row level security;

create policy "song_sections_follow_song" on song_sections for select
  using (exists (
    select 1 from songs s where s.id = song_id
    and (s.visibility = 'public' or s.visibility = 'link_only' or s.created_by = auth.uid() or is_moderator_or_admin())
    and s.is_deleted = false
  ));
create policy "song_sections_write_owner" on song_sections for all
  using (exists (select 1 from songs s where s.id = song_id and (s.created_by = auth.uid() or is_moderator_or_admin())));

create policy "song_versions_follow_song" on song_versions for select
  using (exists (
    select 1 from songs s where s.id = song_id
    and (s.visibility = 'public' or s.visibility = 'link_only' or s.created_by = auth.uid() or is_moderator_or_admin())
    and s.is_deleted = false
  ));
create policy "song_versions_write_owner" on song_versions for insert
  with check (exists (select 1 from songs s where s.id = song_id and (s.created_by = auth.uid() or is_moderator_or_admin())));

create policy "song_chords_follow_song" on song_chords for select
  using (exists (select 1 from songs s where s.id = song_id and (s.visibility = 'public' or s.created_by = auth.uid() or is_moderator_or_admin())));
create policy "song_chords_write_owner" on song_chords for all
  using (exists (select 1 from songs s where s.id = song_id and (s.created_by = auth.uid() or is_moderator_or_admin())));

create policy "song_sources_follow_song" on song_sources for select
  using (exists (select 1 from songs s where s.id = song_id and (s.visibility = 'public' or s.created_by = auth.uid() or is_moderator_or_admin())));
create policy "song_sources_write_owner" on song_sources for all
  using (exists (select 1 from songs s where s.id = song_id and (s.created_by = auth.uid() or is_moderator_or_admin())));

-- ================= AI REVIEWS =================
alter table song_ai_reviews enable row level security;

create policy "ai_reviews_owner_read" on song_ai_reviews for select
  using (requested_by = auth.uid() or is_moderator_or_admin());
create policy "ai_reviews_owner_insert" on song_ai_reviews for insert
  with check (requested_by = auth.uid());

-- ================= EDIT PROPOSALS =================
alter table song_edit_proposals enable row level security;

create policy "proposals_visible_to_proposer_owner_moderator" on song_edit_proposals for select
  using (
    proposed_by = auth.uid()
    or is_moderator_or_admin()
    or exists (select 1 from songs s where s.id = song_id and s.created_by = auth.uid())
  );
create policy "proposals_insert_authenticated" on song_edit_proposals for insert
  with check (auth.uid() is not null and proposed_by = auth.uid());
create policy "proposals_review_by_moderator_or_owner" on song_edit_proposals for update
  using (is_moderator_or_admin() or exists (select 1 from songs s where s.id = song_id and s.created_by = auth.uid()));

-- ================= REPORTS =================
alter table song_reports enable row level security;

create policy "reports_insert_authenticated" on song_reports for insert
  with check (auth.uid() is not null and reported_by = auth.uid());
create policy "reports_read_owner_or_moderator" on song_reports for select
  using (reported_by = auth.uid() or is_moderator_or_admin());
create policy "reports_update_moderator" on song_reports for update
  using (is_moderator_or_admin());

-- ================= FAVORITES =================
alter table song_favorites enable row level security;

create policy "favorites_owner_all" on song_favorites for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ================= SETLISTS =================
alter table setlists enable row level security;
alter table setlist_members enable row level security;
alter table setlist_items enable row level security;

create policy "setlists_select_own_or_member_or_public" on setlists for select
  using (
    owner_id = auth.uid()
    or visibility = 'public'
    or visibility = 'link_only'
    or exists (select 1 from setlist_members m where m.setlist_id = id and m.user_id = auth.uid())
    or is_moderator_or_admin()
  );
create policy "setlists_insert_authenticated" on setlists for insert
  with check (auth.uid() is not null and owner_id = auth.uid());
create policy "setlists_update_owner_or_editor" on setlists for update
  using (
    owner_id = auth.uid()
    or exists (select 1 from setlist_members m where m.setlist_id = id and m.user_id = auth.uid() and m.permission = 'edit')
  );
create policy "setlists_delete_owner" on setlists for delete
  using (owner_id = auth.uid());

create policy "setlist_members_visible_to_setlist_participants" on setlist_members for select
  using (
    user_id = auth.uid()
    or exists (select 1 from setlists s where s.id = setlist_id and s.owner_id = auth.uid())
  );
create policy "setlist_members_managed_by_owner" on setlist_members for all
  using (exists (select 1 from setlists s where s.id = setlist_id and s.owner_id = auth.uid()));

create policy "setlist_items_follow_setlist" on setlist_items for select
  using (
    exists (
      select 1 from setlists s
      left join setlist_members m on m.setlist_id = s.id and m.user_id = auth.uid()
      where s.id = setlist_id
      and (s.owner_id = auth.uid() or s.visibility in ('public', 'link_only') or m.user_id is not null)
    )
  );
create policy "setlist_items_write_owner_or_editor" on setlist_items for all
  using (
    exists (
      select 1 from setlists s
      left join setlist_members m on m.setlist_id = s.id and m.user_id = auth.uid() and m.permission = 'edit'
      where s.id = setlist_id and (s.owner_id = auth.uid() or m.user_id is not null)
    )
  );

-- ================= EXTERNAL SEARCH =================
alter table external_sources enable row level security;
alter table external_search_cache enable row level security;

create policy "external_sources_public_read" on external_sources for select using (true);
create policy "external_sources_admin_write" on external_sources for all using (is_moderator_or_admin());

create policy "external_cache_read_all" on external_search_cache for select using (true);
create policy "external_cache_service_write" on external_search_cache for insert with check (auth.uid() is not null);

-- ================= EXPORTS =================
alter table exports enable row level security;

create policy "exports_owner_read" on exports for select using (requested_by = auth.uid() or is_moderator_or_admin());
create policy "exports_owner_insert" on exports for insert with check (requested_by = auth.uid());

-- ================= AUDIT LOGS (solo admin) =================
alter table audit_logs enable row level security;

create policy "audit_logs_admin_read" on audit_logs for select using (current_user_role() = 'admin');
create policy "audit_logs_system_insert" on audit_logs for insert with check (auth.uid() is not null);

-- ================= APP SETTINGS (solo admin) =================
alter table app_settings enable row level security;

create policy "app_settings_admin_read" on app_settings for select using (is_moderator_or_admin());
create policy "app_settings_admin_write" on app_settings for update using (current_user_role() = 'admin');

-- NOTA IMPORTANTE:
-- El service_role de Supabase (SUPABASE_SERVICE_ROLE_KEY) omite RLS por diseño.
-- Esa clave NUNCA debe usarse en componentes de cliente/navegador; solo en
-- Route Handlers y Server Actions ejecutados en el servidor (ver lib/supabase/admin.ts).
