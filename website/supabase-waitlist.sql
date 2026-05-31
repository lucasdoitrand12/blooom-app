-- Waitlist pour le site marketing Blooom
-- À exécuter dans Supabase SQL Editor

create table if not exists waitlist (
  id         uuid primary key default gen_random_uuid(),
  email      text unique not null,
  created_at timestamptz default now()
);

alter table waitlist enable row level security;

-- Inscription depuis le site (clé anon)
create policy "Inscription liste attente" on waitlist
  for insert with check (true);

-- Admin peut lire et exporter la liste
create policy "Admin lecture waitlist" on waitlist
  for select using (is_admin());
