create table if not exists public.legal_contact_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references auth.users(id) on delete set null,
  name text not null check (char_length(name) between 2 and 120),
  email text not null check (char_length(email) <= 180),
  subject text not null check (char_length(subject) between 2 and 120),
  message text not null check (char_length(message) between 10 and 5000),
  status text not null default 'new' check (status in ('new','in_progress','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.legal_contact_messages enable row level security;
drop policy if exists "Anyone can send legal contact messages" on public.legal_contact_messages;
create policy "Anyone can send legal contact messages" on public.legal_contact_messages for insert to anon, authenticated with check (user_id is null or user_id = auth.uid());
drop policy if exists "Admins can read legal contact messages" on public.legal_contact_messages;
create policy "Admins can read legal contact messages" on public.legal_contact_messages for select to authenticated using (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role in ('admin','moderator')));
grant insert on public.legal_contact_messages to anon, authenticated;
grant select, update on public.legal_contact_messages to authenticated;
notify pgrst, 'reload schema';
