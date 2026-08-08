-- Permite que administradores y moderadores gestionen el estado de contacto.
drop policy if exists "Admins can update legal contact messages" on public.legal_contact_messages;
create policy "Admins can update legal contact messages"
  on public.legal_contact_messages for update to authenticated
  using (exists(select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','moderator')))
  with check (exists(select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','moderator')));

notify pgrst, 'reload schema';

-- Los moderadores y administradores deben poder ver canciones desactivadas
-- para restaurarlas desde el panel.
drop policy if exists "songs_admin_read_all" on public.songs;
create policy "songs_admin_read_all" on public.songs for select to authenticated
  using (public.is_moderator_or_admin());

-- Corrige la escalación de privilegios de la política inicial: un usuario
-- puede editar su perfil, pero no cambiar su propio rol ni su estado.
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id and role = public.current_user_role() and is_active = true);

drop policy if exists "profiles_admin_manage" on public.profiles;
create policy "profiles_admin_manage" on public.profiles for update to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- El backend soporta estos proveedores en el código actual.
alter type public.ai_provider_name add value if not exists 'groq';
alter type public.ai_provider_name add value if not exists 'openrouter';

-- Aprobar una propuesta y crear la nueva versión debe ser una sola operación:
-- evita contenido actualizado con una propuesta todavía pendiente.
create or replace function public.approve_song_edit_proposal(target_proposal_id uuid)
returns uuid as $$
declare
  proposal_record record;
  song_key text;
  version_id uuid;
begin
  select * into proposal_record
  from public.song_edit_proposals
  where id = target_proposal_id and status = 'pending'
  for update;

  if proposal_record.id is null then
    raise exception 'Propuesta pendiente no encontrada.';
  end if;

  if not (
    public.is_moderator_or_admin()
    or exists(select 1 from public.songs where id = proposal_record.song_id and created_by = auth.uid())
  ) then
    raise exception 'No tienes permiso para aprobar esta propuesta.';
  end if;

  select coalesce(detected_key, original_key) into song_key
  from public.songs where id = proposal_record.song_id;

  version_id := public.save_song_version(
    proposal_record.song_id,
    proposal_record.proposed_content,
    song_key,
    coalesce(proposal_record.change_summary, 'Propuesta de edición aprobada')
  );

  update public.song_edit_proposals
  set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
  where id = target_proposal_id;

  return version_id;
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function public.approve_song_edit_proposal(uuid) to authenticated;

notify pgrst, 'reload schema';
