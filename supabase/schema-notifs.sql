-- ================================================================
-- CAPSULE — Tables notifications + device_tokens
-- À coller dans l'éditeur SQL de Supabase, puis "Run"
-- ================================================================


-- ----------------------------------------------------------------
-- 1. NOTIFICATIONS IN-APP
-- ----------------------------------------------------------------

create table if not exists notifications (
  id            uuid primary key default gen_random_uuid(),
  participant_id uuid references participants(id) on delete cascade,
  capsule_id    uuid references capsules(id) on delete cascade,
  texte         text not null,
  cible_ecran   text,   -- 'detail' | 'ouverture' | 'contribution'
  lue           boolean default false,
  created_at    timestamptz default now()
);

create index if not exists idx_notifications_participant on notifications(participant_id);
create index if not exists idx_notifications_lue        on notifications(lue) where lue = false;

alter table notifications enable row level security;

-- Lecture : uniquement ses propres notifications
create policy "Voir ses notifs" on notifications
  for select using (
    exists (
      select 1 from participants
      where participants.id = notifications.participant_id
        and participants.user_id = auth.uid()
    )
  );

-- Insertion : un participant peut notifier un autre participant de la même capsule
create policy "Notifier dans ses capsules" on notifications
  for insert with check (
    exists (
      select 1 from participants dest
      join participants moi on moi.capsule_id = dest.capsule_id
      where dest.id    = notifications.participant_id
        and moi.user_id = auth.uid()
    )
  );

-- Mise à jour : marquer comme lue uniquement ses propres notifs
create policy "Marquer ses notifs lues" on notifications
  for update using (
    exists (
      select 1 from participants
      where participants.id = notifications.participant_id
        and participants.user_id = auth.uid()
    )
  );

-- Admin : accès total (hérite de la policy admin schema)
drop policy if exists "Admin insertion notifications"  on notifications;
drop policy if exists "Admin lecture notifications"    on notifications;
create policy "Admin accès notifications" on notifications
  for all using (is_admin());


-- ----------------------------------------------------------------
-- 2. DEVICE TOKENS (push notifications Capacitor/FCM)
-- ----------------------------------------------------------------

create table if not exists device_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  token      text not null unique,
  platform   text check (platform in ('ios', 'android', 'web')) default 'android',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_device_tokens_user on device_tokens(user_id);

alter table device_tokens enable row level security;

-- Chaque utilisateur gère ses propres tokens
create policy "Gérer ses tokens" on device_tokens
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Admin : accès total
create policy "Admin accès tokens" on device_tokens
  for all using (is_admin());


-- ----------------------------------------------------------------
-- 3. TABLES AUXILIAIRES (déjà utilisées dans l'app)
-- ----------------------------------------------------------------

create table if not exists votes_favori (
  id              uuid primary key default gen_random_uuid(),
  capsule_id      uuid references capsules(id) on delete cascade,
  participant_id  uuid references participants(id) on delete cascade,
  contribution_id uuid references contributions(id) on delete cascade,
  created_at      timestamptz default now(),
  unique(participant_id, contribution_id)
);

alter table votes_favori enable row level security;

create policy "Voter dans ses capsules" on votes_favori
  for all using (
    exists (
      select 1 from participants
      where participants.id = votes_favori.participant_id
        and participants.user_id = auth.uid()
    )
  );

create table if not exists quiz_reponses (
  id             uuid primary key default gen_random_uuid(),
  capsule_id     uuid references capsules(id) on delete cascade,
  participant_id uuid references participants(id) on delete cascade,
  reponse        text,
  created_at     timestamptz default now()
);

alter table quiz_reponses enable row level security;

create policy "Quiz dans ses capsules" on quiz_reponses
  for all using (
    exists (
      select 1 from participants
      where participants.id = quiz_reponses.participant_id
        and participants.user_id = auth.uid()
    )
  );


-- ----------------------------------------------------------------
-- 4. STORAGE BUCKETS
-- ----------------------------------------------------------------

insert into storage.buckets (id, name, public)
values
  ('avatars',     'avatars',     true),
  ('couvertures', 'couvertures', true),
  ('medias',      'medias',      false)
on conflict (id) do nothing;

-- Avatars et couvertures : publics en lecture, authentifié pour upload
create policy "Avatar public"         on storage.objects for select using (bucket_id = 'avatars');
create policy "Avatar upload"         on storage.objects for insert with check (bucket_id = 'avatars' and auth.role() = 'authenticated');
create policy "Couverture publique"   on storage.objects for select using (bucket_id = 'couvertures');
create policy "Couverture upload"     on storage.objects for insert with check (bucket_id = 'couvertures' and auth.role() = 'authenticated');

-- Médias (photos/vidéos souvenirs) : visibles uniquement si participant
create policy "Media select participant" on storage.objects
  for select using (
    bucket_id = 'medias' and auth.role() = 'authenticated'
  );
create policy "Media upload" on storage.objects
  for insert with check (bucket_id = 'medias' and auth.role() = 'authenticated');
