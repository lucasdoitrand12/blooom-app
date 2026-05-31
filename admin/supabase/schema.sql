-- ============================================================
-- SCHEMA SQL — Backoffice Blooom Admin
-- À exécuter dans Supabase SQL Editor
-- ============================================================

-- ── 1. Table des administrateurs autorisés ────────────────────────────────────
CREATE TABLE IF NOT EXISTS admins (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- ── 2. Journal des actions admin (audit trail) ───────────────────────────────
CREATE TABLE IF NOT EXISTS admin_logs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action     text NOT NULL,
  cible      text,
  details    jsonb,
  created_at timestamptz DEFAULT now()
);

-- ── 3. Paramètres globaux de l'app ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_settings (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key        text UNIQUE NOT NULL,
  value      text NOT NULL DEFAULT '',
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES admins(id) ON DELETE SET NULL
);

-- Valeurs par défaut
INSERT INTO app_settings (key, value) VALUES
  ('maintenance_mode',          'false'),
  ('maintenance_message',       'L''application est en maintenance. Revenez bientôt !'),
  ('max_participants',          '20'),
  ('max_contributions',         '100'),
  ('max_file_size_mb',          '50'),
  ('inscriptions_ouvertes',     'true'),
  ('creation_capsules',         'true'),
  ('stats_sociales',            '[]'),
  ('questions_inspiration',     '[]'),
  ('types_capsules_overrides',  '{}'),
  ('textes_app',                '{}')
ON CONFLICT (key) DO NOTHING;

-- ── 4. Fonction is_admin() ────────────────────────────────────────────────────
-- Utilisée dans les RLS policies pour vérifier le rôle admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM admins
    WHERE email = (auth.jwt() ->> 'email')
  );
$$;

-- ── 5. RLS sur les 3 nouvelles tables admin ───────────────────────────────────
ALTER TABLE admins       ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_logs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- Seuls les admins peuvent accéder à ces tables
DROP POLICY IF EXISTS "Admin accès admins"    ON admins;
DROP POLICY IF EXISTS "Admin accès logs"      ON admin_logs;
DROP POLICY IF EXISTS "Admin accès settings"  ON app_settings;

CREATE POLICY "Admin accès admins"   ON admins       FOR ALL USING (is_admin());
CREATE POLICY "Admin accès logs"     ON admin_logs   FOR ALL USING (is_admin());
CREATE POLICY "Admin accès settings" ON app_settings FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- ── 6. RLS sur les tables existantes de l'app (si elles existent) ────────────
-- Ces blocs s'exécutent sans erreur même si la table n'existe pas encore.
DO $$ BEGIN
  ALTER TABLE capsules ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "Admin lecture capsules"     ON capsules;
  DROP POLICY IF EXISTS "Admin modif capsules"       ON capsules;
  DROP POLICY IF EXISTS "Admin suppression capsules" ON capsules;
  CREATE POLICY "Admin lecture capsules"     ON capsules FOR SELECT USING (is_admin());
  CREATE POLICY "Admin modif capsules"       ON capsules FOR UPDATE USING (is_admin());
  CREATE POLICY "Admin suppression capsules" ON capsules FOR DELETE USING (is_admin());
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Table capsules non trouvée — RLS ignorée';
END $$;

DO $$ BEGIN
  ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "Admin lecture participants" ON participants;
  CREATE POLICY "Admin lecture participants" ON participants FOR SELECT USING (is_admin());
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Table participants non trouvée — RLS ignorée';
END $$;

DO $$ BEGIN
  ALTER TABLE contributions ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "Admin lecture contributions"     ON contributions;
  DROP POLICY IF EXISTS "Admin suppression contributions" ON contributions;
  CREATE POLICY "Admin lecture contributions"     ON contributions FOR SELECT USING (is_admin());
  CREATE POLICY "Admin suppression contributions" ON contributions FOR DELETE USING (is_admin());
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Table contributions non trouvée — RLS ignorée';
END $$;

DO $$ BEGIN
  ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "Admin lecture notifications"    ON notifications;
  DROP POLICY IF EXISTS "Admin insertion notifications"  ON notifications;
  CREATE POLICY "Admin lecture notifications"   ON notifications FOR SELECT USING (is_admin());
  CREATE POLICY "Admin insertion notifications" ON notifications FOR INSERT WITH CHECK (is_admin());
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Table notifications non trouvée — RLS ignorée';
END $$;

-- ── 7. Index pour les performances ───────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_admin_logs_action     ON admin_logs(action);
CREATE INDEX IF NOT EXISTS idx_admin_logs_created_at ON admin_logs(created_at DESC);

-- ── 8. Premier admin ─────────────────────────────────────────────────────────
-- Décommentez et remplacez par votre email :
-- INSERT INTO admins (email) VALUES ('votre@email.com');
