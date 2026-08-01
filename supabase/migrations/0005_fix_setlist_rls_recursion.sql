-- =========================================================
-- 0005_fix_setlist_rls_recursion.sql
--
-- "No se pudo crear la lista: infinite recursion detected in policy for
-- relation setlists"
--
-- Causa: la política de SELECT de `setlists` consulta `setlist_members`
-- para saber si el usuario es colaborador, y las políticas de
-- `setlist_members` a su vez consultan `setlists` para saber si el
-- usuario es dueño. Postgres evalúa ambas políticas dentro de la misma
-- consulta y detecta el ciclo A -> B -> A, así que aborta con
-- "infinite recursion detected".
--
-- Solución: el mismo patrón que ya usa is_moderator_or_admin() en
-- 0002_rls.sql — mover la subconsulta "cruzada" a una función
-- SECURITY DEFINER. Como la función corre con los privilegios de su
-- dueño (el rol que aplicó las migraciones), Postgres no le aplica RLS
-- a ESE dueño sobre sus propias tablas, así que la subconsulta interna
-- ya no dispara la política de la otra tabla y el ciclo se rompe.
-- =========================================================

create or replace function is_setlist_owner(target_setlist_id uuid)
returns boolean as $$
  select exists (
    select 1 from setlists s where s.id = target_setlist_id and s.owner_id = auth.uid()
  );
$$ language sql stable security definer set search_path = public;

create or replace function setlist_visibility_of(target_setlist_id uuid)
returns setlist_visibility as $$
  select visibility from setlists where id = target_setlist_id;
$$ language sql stable security definer set search_path = public;

create or replace function is_setlist_member(target_setlist_id uuid, required_permission setlist_permission default null)
returns boolean as $$
  select exists (
    select 1 from setlist_members m
    where m.setlist_id = target_setlist_id
      and m.user_id = auth.uid()
      and (required_permission is null or m.permission = required_permission)
  );
$$ language sql stable security definer set search_path = public;

-- ---- setlists ----
drop policy if exists "setlists_select_own_or_member_or_public" on setlists;
create policy "setlists_select_own_or_member_or_public" on setlists for select
  using (
    owner_id = auth.uid()
    or visibility = 'public'
    or visibility = 'link_only'
    or is_setlist_member(id)
    or is_moderator_or_admin()
  );

drop policy if exists "setlists_update_owner_or_editor" on setlists;
create policy "setlists_update_owner_or_editor" on setlists for update
  using (
    owner_id = auth.uid()
    or is_setlist_member(id, 'edit')
  );

-- ---- setlist_members ----
drop policy if exists "setlist_members_visible_to_setlist_participants" on setlist_members;
create policy "setlist_members_visible_to_setlist_participants" on setlist_members for select
  using (
    user_id = auth.uid()
    or is_setlist_owner(setlist_id)
  );

drop policy if exists "setlist_members_managed_by_owner" on setlist_members;
create policy "setlist_members_managed_by_owner" on setlist_members for all
  using (is_setlist_owner(setlist_id));

-- ---- setlist_items ----
drop policy if exists "setlist_items_follow_setlist" on setlist_items;
create policy "setlist_items_follow_setlist" on setlist_items for select
  using (
    is_setlist_owner(setlist_id)
    or setlist_visibility_of(setlist_id) in ('public', 'link_only')
    or is_setlist_member(setlist_id)
  );

drop policy if exists "setlist_items_write_owner_or_editor" on setlist_items;
create policy "setlist_items_write_owner_or_editor" on setlist_items for all
  using (
    is_setlist_owner(setlist_id)
    or is_setlist_member(setlist_id, 'edit')
  );
