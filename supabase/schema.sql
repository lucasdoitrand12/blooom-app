-- ================================================================
-- CAPSULE — Schéma de base de données
-- À coller en entier dans l'éditeur SQL de Supabase, puis "Run"
-- ================================================================


-- ----------------------------------------------------------------
-- 1. TABLES
-- ----------------------------------------------------------------

-- Profil : l'identité d'un utilisateur connecté (le « moi »).
create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  prenom      text not null,
  description text,
  photo_url   text,
  couleur     text default '#FF6B5E',
  created_at  timestamptz default now()
);

-- Capsule : l'unité de base de l'application.
create table capsules (
  id             uuid primary key default gen_random_uuid(),
  nom            text not null,
  type           text not null,
  date_ouverture date,
  couverture_url text,
  code           text unique not null,
  ouverte        boolean default false,
  created_by     uuid references profiles(id),
  created_at     timestamptz default now()
);

-- Participant : rattaché à UNE capsule précise.
-- user_id peut être null pour les personnes ajoutées manuellement.
create table participants (
  id          uuid primary key default gen_random_uuid(),
  capsule_id  uuid not null references capsules(id) on delete cascade,
  user_id     uuid references profiles(id),
  prenom      text not null,
  description text,
  photo_url   text,
  couleur     text default '#FF6B5E',
  created_at  timestamptz default now()
);

-- Contribution : un souvenir déposé dans une capsule.
create table contributions (
  id            uuid primary key default gen_random_uuid(),
  capsule_id    uuid not null references capsules(id) on delete cascade,
  auteur_id     uuid not null references participants(id) on delete cascade,
  type          text not null,   -- 'message', 'question', 'photo', 'video'
  texte         text,
  question      text,
  media_url     text,            -- URL Supabase Storage (plus de base64)
  filtre        text,
  ambiance      text,
  created_at    timestamptz default now()
);

-- Réaction : une par type, par participant, par contribution.
create table reactions (
  id              uuid primary key default gen_random_uuid(),
  contribution_id uuid not null references contributions(id) on delete cascade,
  participant_id  uuid not null references participants(id) on delete cascade,
  type            text not null,  -- 'emouvant', 'drole', 'precieux'
  created_at      timestamptz default now(),
  unique(contribution_id, participant_id, type)
);


-- ----------------------------------------------------------------
-- 2. SÉCURITÉ — Row Level Security (RLS)
-- Chaque règle s'applique côté serveur : impossible à contourner
-- depuis l'app, même en inspectant le réseau.
-- ----------------------------------------------------------------

alter table profiles      enable row level security;
alter table capsules       enable row level security;
alter table participants   enable row level security;
alter table contributions  enable row level security;
alter table reactions      enable row level security;

-- profiles : chacun voit et modifie uniquement son propre profil
create policy "Voir son propre profil" on profiles
  for select using (auth.uid() = id);

create policy "Créer son profil" on profiles
  for insert with check (auth.uid() = id);

create policy "Modifier son profil" on profiles
  for update using (auth.uid() = id);

-- capsules : visible seulement si on est participant
create policy "Lire ses capsules" on capsules
  for select using (
    exists (
      select 1 from participants
      where participants.capsule_id = capsules.id
        and participants.user_id = auth.uid()
    )
  );

create policy "Créer une capsule" on capsules
  for insert with check (auth.uid() = created_by);

create policy "Modifier sa capsule" on capsules
  for update using (created_by = auth.uid());

-- participants : visibles par les autres participants de la même capsule
create policy "Voir les participants" on participants
  for select using (
    exists (
      select 1 from participants p2
      where p2.capsule_id = participants.capsule_id
        and p2.user_id = auth.uid()
    )
  );

create policy "Rejoindre une capsule" on participants
  for insert with check (
    auth.uid() = participants.user_id
    or exists (
      select 1 from capsules
      where capsules.id = participants.capsule_id
        and capsules.created_by = auth.uid()
    )
  );

-- contributions — LA RÈGLE DU SECRET
-- Une contribution n'est lisible que si :
--   (a) la capsule est déjà ouverte, OU
--   (b) l'utilisateur connecté en est lui-même l'auteur
-- Cette règle est vérifiée côté serveur : aucune triche possible.
create policy "Lire les contributions (règle du secret)" on contributions
  for select using (
    exists (
      select 1 from capsules c
      join participants p on p.capsule_id = c.id
      where c.id = contributions.capsule_id
        and p.user_id = auth.uid()
        and (
          c.ouverte = true
          or exists (
            select 1 from participants auteur
            where auteur.id = contributions.auteur_id
              and auteur.user_id = auth.uid()
          )
        )
    )
  );

create policy "Déposer une contribution" on contributions
  for insert with check (
    exists (
      select 1 from participants
      where participants.id = contributions.auteur_id
        and participants.user_id = auth.uid()
    )
  );

-- réactions : lisibles seulement si la capsule est ouverte
create policy "Lire les réactions" on reactions
  for select using (
    exists (
      select 1 from contributions c
      join capsules cap on cap.id = c.capsule_id
      join participants p on p.capsule_id = cap.id
      where c.id = reactions.contribution_id
        and p.user_id = auth.uid()
        and cap.ouverte = true
    )
  );

create policy "Réagir à une contribution" on reactions
  for insert with check (
    exists (
      select 1 from participants
      where participants.id = reactions.participant_id
        and participants.user_id = auth.uid()
    )
  );


-- ----------------------------------------------------------------
-- 3. FONCTION : rejoindre une capsule par son code
-- "security definer" = s'exécute avec les droits du serveur,
-- pas ceux de l'utilisateur. On ne lui montre jamais la liste
-- complète des capsules : il donne un code, il reçoit un accès.
-- ----------------------------------------------------------------

create or replace function rejoindre_capsule(
  p_code      text,
  p_prenom    text,
  p_photo_url text default null
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_capsule_id     uuid;
  v_participant_id uuid;
begin
  select id into v_capsule_id
  from capsules
  where code = upper(p_code);

  if v_capsule_id is null then
    raise exception 'Code invalide : aucune capsule trouvée.';
  end if;

  -- Si l'utilisateur est déjà participant, retourner son id
  select id into v_participant_id
  from participants
  where capsule_id = v_capsule_id
    and user_id = auth.uid();

  if v_participant_id is not null then
    return v_participant_id;
  end if;

  -- Sinon, l'ajouter comme nouveau participant
  insert into participants (capsule_id, user_id, prenom, photo_url)
  values (v_capsule_id, auth.uid(), p_prenom, p_photo_url)
  returning id into v_participant_id;

  return v_participant_id;
end;
$$;
