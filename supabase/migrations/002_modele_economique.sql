-- ============================================================
-- MODÈLE ÉCONOMIQUE BLOOOM v2 — Packs ciblés, sans abonnement général
-- À exécuter dans Supabase SQL Editor
-- ============================================================

-- Mise à jour des profils
alter table profiles
  add column if not exists stripe_customer_id text,
  add column if not exists streak_contributions integer default 0,
  add column if not exists derniere_contribution timestamptz,
  add column if not exists code_parrain text unique
    default upper(substring(gen_random_uuid()::text,1,8)),
  add column if not exists early_adopter boolean default false,
  add column if not exists early_adopter_numero integer;

-- Mise à jour des capsules avec quotas et formule
alter table capsules
  add column if not exists formule text default 'gratuit'
    check (formule in ('gratuit','occasion','mariage','naissance','papy')),
  add column if not exists quota_photos integer default 15,
  add column if not exists quota_videos integer default 0,
  add column if not exists quota_vocaux integer default 0,
  add column if not exists quota_participants integer default 10,
  add column if not exists duree_video_max_s integer default 0,
  add column if not exists duree_vocal_max_s integer default 0,
  add column if not exists compte_photos integer default 0,
  add column if not exists compte_videos integer default 0,
  add column if not exists compte_vocaux integer default 0,
  add column if not exists papy_reset_at timestamptz,
  add column if not exists pack_type text;

-- Table des achats (packs one-shot et abonnements récurrents)
create table if not exists achats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  type text not null,
  -- 'pack_occasion' (12,99€)
  -- 'pack_mariage' (29,99€)
  -- 'pack_naissance_mensuel' (4,99€/mois)
  -- 'pack_naissance_annuel' (44,99€/an)
  -- 'pack_papy_mensuel' (4,99€/mois)
  -- 'pack_papy_annuel' (44,99€/an)
  -- 'album_20p' (12,99€)
  -- 'album_40p' (19,99€)
  -- 'album_60p' (24,99€)
  stripe_session_id text unique,
  stripe_subscription_id text,
  montant_centimes integer,
  statut text default 'pending'
    check (statut in ('pending','complete','failed','refunded')),
  capsule_id uuid references capsules(id),
  created_at timestamptz default now()
);

-- Table des packs récurrents actifs (Naissance et Mamie/Papy)
create table if not exists packs_actifs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  capsule_id uuid references capsules(id) on delete cascade,
  type text not null check (type in ('naissance','papy')),
  stripe_subscription_id text unique,
  actif boolean default true,
  expire_at timestamptz,
  created_at timestamptz default now()
);

-- Table des impressions commandées (Naissance et Mamie/Papy)
create table if not exists impressions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  capsule_id uuid references capsules(id) on delete cascade,
  frequence text check (frequence in ('trimestrielle','semestrielle','annuelle')),
  statut text default 'en_attente',
  -- 'en_attente' : bientôt disponible
  -- 'commande' : envoyé au partenaire imprimeur
  -- 'expedie' : en route
  prochaine_impression date,
  created_at timestamptz default now()
);

-- Table des codes cadeaux
create table if not exists codes_cadeau (
  id uuid primary key default gen_random_uuid(),
  code text unique not null
    default upper(substring(gen_random_uuid()::text,1,12)),
  offert_par uuid references profiles(id),
  email_destinataire text not null,
  type text not null,
  utilise_par uuid references profiles(id),
  utilise_at timestamptz,
  created_at timestamptz default now()
);

-- Table des suppressions RGPD
create table if not exists suppressions (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  requested_at timestamptz default now(),
  completed_at timestamptz
);

-- Table des inscriptions liste d'attente impression
create table if not exists waitlist_impression (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),
  capsule_id uuid references capsules(id),
  frequence text,
  created_at timestamptz default now()
);

-- Index pour les performances
create index if not exists idx_capsules_formule on capsules(formule);
create index if not exists idx_achats_user on achats(user_id);
create index if not exists idx_achats_statut on achats(statut);
create index if not exists idx_packs_actifs_user on packs_actifs(user_id);
create index if not exists idx_packs_actifs_type on packs_actifs(type, actif);
