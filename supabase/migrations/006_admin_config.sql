-- ============================================================
-- ADMIN CONFIG — Tables de configuration gamification
-- Permet de gérer tous les paramètres de gamification depuis
-- le back-office sans modifier le code source.
-- ============================================================

-- ── Fonction utilitaire : vérifie si l'utilisateur courant est admin ─────────
-- Vérifie la table admins (back-office) OU le champ profiles.is_admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM admins
    WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
  ) OR EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND is_admin = true
  );
$$;

-- ── Permet aux admins de lire les données gamification de tous les utilisateurs
DROP POLICY IF EXISTS "gami_select_admin" ON gamification;
CREATE POLICY "gami_select_admin" ON gamification
  FOR SELECT USING (is_admin());

DROP POLICY IF EXISTS "gami_update_admin" ON gamification;
CREATE POLICY "gami_update_admin" ON gamification
  FOR UPDATE USING (is_admin());

-- ── Table : points par action ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gami_actions (
  cle        text PRIMARY KEY,
  label      text NOT NULL,
  points     integer NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

INSERT INTO gami_actions (cle, label, points) VALUES
  ('capsule_creee',           'Créer une capsule',                     2),
  ('souvenir_depose',         'Déposer un souvenir',                   1),
  ('parrainage_accepte',      'Parrainage accepté',                    3),
  ('pack_inoubliable_achete', 'Acheter un Pack Inoubliable / Mariage', 4),
  ('capsule_papy_ouverte',    'Ouvrir une capsule Mamie/Papy',         5)
ON CONFLICT (cle) DO NOTHING;

ALTER TABLE gami_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gami_actions_select" ON gami_actions
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "gami_actions_admin_write" ON gami_actions
  FOR ALL USING (is_admin());

-- ── Table : niveaux ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gami_niveaux (
  niveau      integer PRIMARY KEY,
  nom         text NOT NULL,
  emoji       text NOT NULL DEFAULT '🌱',
  min_points  integer NOT NULL DEFAULT 0,
  recompense  text DEFAULT NULL,
  updated_at  timestamptz DEFAULT now()
);

INSERT INTO gami_niveaux (niveau, nom, emoji, min_points, recompense) VALUES
  (1, 'Graine',  '🌱',   0,   NULL),
  (2, 'Bourgeon','🌿',  15,   '1 mois Pack Papy/Mamie offert'),
  (3, 'Pousse',  '🪴',  40,   '1 Pack Inoubliable offert'),
  (4, 'Branche', '🌲',  80,   '2 mois Pack Papy/Mamie offerts'),
  (5, 'Arbre',   '🌳', 150,   '1 Pack Mariage offert'),
  (6, 'Forêt',   '🌿', 300,   '6 mois Pack Papy/Mamie offerts')
ON CONFLICT (niveau) DO NOTHING;

ALTER TABLE gami_niveaux ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gami_niveaux_select" ON gami_niveaux
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "gami_niveaux_admin_write" ON gami_niveaux
  FOR ALL USING (is_admin());

-- ── Table : catégories de badges ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gami_badges_categories (
  cle        text PRIMARY KEY,
  categorie  text NOT NULL,
  emoji      text NOT NULL,
  label      text NOT NULL,
  ordre      integer NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

INSERT INTO gami_badges_categories (cle, categorie, emoji, label, ordre) VALUES
  ('capsules_creees',            'Bâtisseur de liens',   '🏗️', 'capsule créée',   1),
  ('souvenirs_deposes',          'Gardien des instants', '📸', 'souvenir déposé', 2),
  ('parrainages_acceptes',       'Rassembleur',          '🤝', 'parrainage',       3),
  ('capsules_papy_ouvertes',     'Passeur de mémoire',   '👴', 'ouverture',        4),
  ('packs_inoubliables_achetes', 'Inoubliable',          '✨', 'pack acheté',      5)
ON CONFLICT (cle) DO NOTHING;

ALTER TABLE gami_badges_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gami_badges_cat_select" ON gami_badges_categories
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "gami_badges_cat_admin_write" ON gami_badges_categories
  FOR ALL USING (is_admin());

-- ── Table : paliers de badges ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gami_badges_paliers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  categorie_cle text NOT NULL REFERENCES gami_badges_categories(cle) ON DELETE CASCADE,
  slug          text UNIQUE NOT NULL,
  seuil         integer NOT NULL,
  nom           text NOT NULL,
  updated_at    timestamptz DEFAULT now()
);

INSERT INTO gami_badges_paliers (categorie_cle, slug, seuil, nom) VALUES
  ('capsules_creees', 'premier_souffle', 1,  'Premier souffle'),
  ('capsules_creees', 'semeur',          3,  'Semeur'),
  ('capsules_creees', 'architecte',      10, 'Architecte'),
  ('capsules_creees', 'batisseur',       25, 'Bâtisseur'),
  ('capsules_creees', 'legende',         50, 'Légende'),
  ('souvenirs_deposes', 'premier_eclat', 1,   'Premier éclat'),
  ('souvenirs_deposes', 'conteur',       10,  'Conteur'),
  ('souvenirs_deposes', 'archiviste',    50,  'Archiviste'),
  ('souvenirs_deposes', 'gardien_badge', 200, 'Gardien'),
  ('souvenirs_deposes', 'passeur_badge', 500, 'Passeur'),
  ('parrainages_acceptes', 'trait_union',       1,  'Trait d''union'),
  ('parrainages_acceptes', 'tisseur',            5,  'Tisseur'),
  ('parrainages_acceptes', 'rassembleur_badge', 15,  'Rassembleur'),
  ('parrainages_acceptes', 'pilier',            30,  'Pilier'),
  ('capsules_papy_ouvertes', 'premiere_page', 1,  'Première page'),
  ('capsules_papy_ouvertes', 'feuilleton',    6,  'Feuilleton'),
  ('capsules_papy_ouvertes', 'rituel',        12, 'Rituel'),
  ('capsules_papy_ouvertes', 'transmission',  24, 'Transmission'),
  ('packs_inoubliables_achetes', 'premiere_escapade', 1, 'Première escapade'),
  ('packs_inoubliables_achetes', 'collectionneur',    3, 'Collectionneur'),
  ('packs_inoubliables_achetes', 'epicurien',         7, 'Épicurien')
ON CONFLICT (slug) DO NOTHING;

ALTER TABLE gami_badges_paliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gami_badges_pal_select" ON gami_badges_paliers
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "gami_badges_pal_admin_write" ON gami_badges_paliers
  FOR ALL USING (is_admin());
