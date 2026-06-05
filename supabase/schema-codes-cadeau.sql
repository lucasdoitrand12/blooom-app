-- =============================================================================
--  TABLE CODES_CADEAU — stocke les codes cadeaux générés après achat Stripe.
--  Exécuter dans Supabase SQL Editor (une seule fois).
-- =============================================================================

-- Colonnes stripe_customer_id et packs_achetes sur profiles — si absentes
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS abonnement           TEXT    NOT NULL DEFAULT 'gratuit',
  ADD COLUMN IF NOT EXISTS abonnement_debut_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS abonnement_expire_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS packs_achetes        JSONB   NOT NULL DEFAULT '[]';

-- Table des codes cadeaux générés par la Edge Function stripe-webhook
CREATE TABLE IF NOT EXISTS codes_cadeau (
  id                   UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code                 TEXT UNIQUE NOT NULL,
  plan                 TEXT NOT NULL CHECK (plan IN ('plus', 'rituel')),
  mois                 INTEGER NOT NULL,             -- durée en mois : 6 ou 12
  acheteur_user_id     UUID REFERENCES profiles(id),
  destinataire_email   TEXT,
  destinataire_prenom  TEXT,
  stripe_payment_intent TEXT,
  actif                BOOLEAN NOT NULL DEFAULT true, -- false une fois activé
  active_par           UUID REFERENCES profiles(id),
  active_at            TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS : les utilisateurs ne peuvent lire que leurs propres codes achetés
ALTER TABLE codes_cadeau ENABLE ROW LEVEL SECURITY;

CREATE POLICY "acheteur_peut_voir_ses_codes"
  ON codes_cadeau FOR SELECT
  USING (acheteur_user_id = auth.uid());

-- Un utilisateur peut lire un code par son contenu (pour l'activation)
CREATE POLICY "utilisateur_peut_lire_par_code"
  ON codes_cadeau FOR SELECT
  USING (actif = true);

-- Seul le webhook (service role) peut insérer des codes
-- Pas de policy INSERT utilisateur intentionnellement.

-- =============================================================================
--  FONCTION ACTIVER_CODE_CADEAU — RPC appelée depuis l'app pour activer un code
-- =============================================================================
CREATE OR REPLACE FUNCTION activer_code_cadeau(p_code TEXT, p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER  -- s'exécute avec les droits du propriétaire, bypass RLS
AS $$
DECLARE
  v_cadeau  codes_cadeau%ROWTYPE;
  v_expiry  TIMESTAMPTZ;
BEGIN
  -- Cherche le code actif
  SELECT * INTO v_cadeau FROM codes_cadeau
  WHERE code = UPPER(TRIM(p_code)) AND actif = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Code invalide ou déjà utilisé.');
  END IF;

  -- Calcule la nouvelle date d'expiration (à partir de maintenant ou de l'expiration actuelle)
  SELECT GREATEST(now(), COALESCE(abonnement_expire_at, now()))
  INTO v_expiry
  FROM profiles WHERE id = p_user_id;

  -- Ajoute la durée du code à la date d'expiration existante
  v_expiry := v_expiry + (v_cadeau.mois || ' months')::INTERVAL;

  -- Met à jour le profil avec le nouveau plan et la nouvelle date
  UPDATE profiles SET
    abonnement           = v_cadeau.plan,
    abonnement_debut_at  = COALESCE(abonnement_debut_at, now()),
    abonnement_expire_at = v_expiry
  WHERE id = p_user_id;

  -- Marque le code comme utilisé
  UPDATE codes_cadeau SET
    actif      = false,
    active_par = p_user_id,
    active_at  = now()
  WHERE code = UPPER(TRIM(p_code));

  RETURN jsonb_build_object(
    'success', true,
    'plan',    v_cadeau.plan,
    'mois',    v_cadeau.mois,
    'expire_at', v_expiry
  );
END;
$$;

-- Indexes pour les recherches fréquentes
CREATE INDEX IF NOT EXISTS idx_codes_cadeau_code        ON codes_cadeau (code);
CREATE INDEX IF NOT EXISTS idx_codes_cadeau_destinataire ON codes_cadeau (destinataire_email);
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer  ON profiles (stripe_customer_id);
