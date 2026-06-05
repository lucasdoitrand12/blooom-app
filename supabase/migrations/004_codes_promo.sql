-- ============================================================
-- CODES PROMO — back office Blooom
-- Réductions de 5% à 100% (gratuit) applicables à l'achat de n'importe quel pack.
-- ============================================================

-- Colonne is_admin sur les profils (accès back office)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

-- Table des codes promo
CREATE TABLE IF NOT EXISTS codes_promo (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code                   text UNIQUE NOT NULL,
  pourcentage            integer NOT NULL
    CHECK (pourcentage >= 5 AND pourcentage <= 100),
  utilisations_max       integer DEFAULT NULL,   -- NULL = illimité
  utilisations_actuelles integer NOT NULL DEFAULT 0,
  actif                  boolean NOT NULL DEFAULT true,
  expire_at              timestamptz DEFAULT NULL, -- NULL = pas d'expiration
  created_at             timestamptz DEFAULT now()
);

-- Index pour les lookups rapides par code
CREATE INDEX IF NOT EXISTS idx_codes_promo_code  ON codes_promo(code);
CREATE INDEX IF NOT EXISTS idx_codes_promo_actif ON codes_promo(actif);

-- Fonction appelée par le webhook pour incrémenter les utilisations de manière atomique
CREATE OR REPLACE FUNCTION incrementer_utilisation_promo(p_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE codes_promo
  SET utilisations_actuelles = utilisations_actuelles + 1
  WHERE id = p_id;
$$;

-- RLS : lecture publique (la validation se fait côté client/edge function)
ALTER TABLE codes_promo ENABLE ROW LEVEL SECURITY;

-- Les utilisateurs connectés peuvent lire les codes (pour validation)
CREATE POLICY "codes_promo_select" ON codes_promo
  FOR SELECT USING (auth.role() = 'authenticated');

-- Seuls les admins peuvent écrire (insert/update/delete via service_role ou Edge Function)
CREATE POLICY "codes_promo_admin_write" ON codes_promo
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.is_admin = true
    )
  );
