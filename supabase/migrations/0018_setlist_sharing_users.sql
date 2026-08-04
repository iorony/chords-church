-- Gestión segura de colaboradores de listas por nombre o correo.
create or replace function public.search_shareable_users(search_term text)
returns table (user_id uuid, display_name text, email text)
language sql
stable
security definer
set search_path = public, auth
as $$
  select p.id, p.display_name, u.email::text
  from public.profiles p
  join auth.users u on u.id = p.id
  where auth.uid() is not null
    and p.is_active = true
    and p.id <> auth.uid()
    and length(trim(search_term)) >= 2
    and (
      p.display_name ilike '%' || trim(search_term) || '%'
      or u.email ilike '%' || trim(search_term) || '%'
    )
  order by p.display_name
  limit 10;
$$;

revoke all on function public.search_shareable_users(text) from public;
grant execute on function public.search_shareable_users(text) to authenticated;

drop policy if exists "setlist_members_managed_by_owner" on public.setlist_members;
create policy "setlist_members_managed_by_owner"
  on public.setlist_members for all
  using (public.is_setlist_owner(setlist_id))
  with check (
    public.is_setlist_owner(setlist_id)
    and user_id <> auth.uid()
  );
