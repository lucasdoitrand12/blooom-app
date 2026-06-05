-- =============================================================================
--  TABLE SUPPRESSIONS — traçabilité RGPD des demandes de suppression de compte
--  Exécuter dans Supabase SQL Editor (une seule fois).
-- =============================================================================

-- Table de traçabilité : chaque ligne = une demande de suppression complète.
-- requested_at et completed_at sont identiques car la suppression est immédiate.
CREATE TABLE IF NOT EXISTS suppressions (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email         TEXT NOT NULL,
  user_id       UUID,                           -- NULL si le profil est déjà supprimé
  requested_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS : seuls les admins peuvent lire la table. L'app ne lit jamais cette table côté client.
ALTER TABLE suppressions ENABLE ROW LEVEL SECURITY;

-- Politique INSERT : n'importe quel utilisateur authentifié peut insérer SA propre ligne.
-- Cela permet à l'app d'enregistrer la demande avant de supprimer le profil.
CREATE POLICY "utilisateur_peut_inserer_sa_suppression"
  ON suppressions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Politique SELECT : lecture réservée aux admins (via la table admins).
CREATE POLICY "admin_peut_lire_suppressions"
  ON suppressions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admins WHERE admins.email = auth.email()
    )
  );

-- Index pour les recherches d'audit par email
CREATE INDEX IF NOT EXISTS idx_suppressions_email ON suppressions (email);
CREATE INDEX IF NOT EXISTS idx_suppressions_requested_at ON suppressions (requested_at DESC);
