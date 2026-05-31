-- ============================================================
-- SCHEMA PARRAINAGE — Blooom
-- À exécuter dans Supabase SQL Editor après schema.sql
-- et schema-notifs.sql
-- ============================================================

-- Colonnes supplémentaires sur profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS code_parrain    TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS plus_expires_at TIMESTAMPTZ;

-- ──────────────────────────────────────────────────────────
-- Génère un code parrain unique de 8 caractères alphanumériques
-- ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION generer_code_parrain()
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  new_code TEXT;
BEGIN
  LOOP
    -- 8 caractères hexadécimaux en majuscules (ex. : A3F7C2D1)
    new_code := upper(substring(md5(gen_random_uuid()::text) FROM 1 FOR 8));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM profiles WHERE code_parrain = new_code);
  END LOOP;
  RETURN new_code;
END;
$$;

-- Trigger : attribue automatiquement un code_parrain à chaque nouveau profil
CREATE OR REPLACE FUNCTION trigger_auto_code_parrain()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.code_parrain IS NULL THEN
    NEW.code_parrain := generer_code_parrain();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_code_parrain ON profiles;
CREATE TRIGGER set_code_parrain
  BEFORE INSERT ON profiles
  FOR EACH ROW EXECUTE FUNCTION trigger_auto_code_parrain();

-- Génère un code pour les profils existants qui n'en ont pas encore
UPDATE profiles SET code_parrain = generer_code_parrain() WHERE code_parrain IS NULL;

-- ──────────────────────────────────────────────────────────
-- Table parrainages
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS parrainages (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  parrain_id   UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  filleul_id   UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  converti     BOOLEAN     NOT NULL DEFAULT false,
  converti_at  TIMESTAMPTZ,
  UNIQUE (parrain_id, filleul_id)
);

ALTER TABLE parrainages ENABLE ROW LEVEL SECURITY;

-- Un utilisateur peut lire ses propres parrainages (parrain ou filleul)
CREATE POLICY "Lecture parrainages personnels" ON parrainages
  FOR SELECT USING (parrain_id = auth.uid() OR filleul_id = auth.uid());

-- Un filleul peut créer son propre enregistrement de parrainage
CREATE POLICY "Créer un parrainage" ON parrainages
  FOR INSERT WITH CHECK (filleul_id = auth.uid());

-- Un filleul peut marquer son parrainage comme converti (via la fonction RPC)
CREATE POLICY "Mettre à jour conversion" ON parrainages
  FOR UPDATE USING (filleul_id = auth.uid());

-- Les admins peuvent tout voir et modifier
CREATE POLICY "Admin full access parrainages" ON parrainages
  FOR ALL USING (is_admin());

-- ──────────────────────────────────────────────────────────
-- RPC : ajoute 30 jours de Blooom Plus au parrain
-- SECURITY DEFINER = s'exécute avec les droits du créateur
-- de la fonction (contourne le RLS pour mettre à jour le profil
-- du parrain depuis le compte du filleul)
-- ───────────────────────────────────────────────���──────────
CREATE OR REPLACE FUNCTION ajouter_plus_parrain(p_parrain_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE profiles
  SET plus_expires_at = GREATEST(COALESCE(plus_expires_at, now()), now())
                        + INTERVAL '30 days'
  WHERE id = p_parrain_id;
END;
$$;
