-- ============================================================
-- GAMIFICATION — Badges, niveaux et points Blooom
-- ============================================================

-- Table principale : une ligne par utilisateur
CREATE TABLE IF NOT EXISTS gamification (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                    uuid UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  points_total               integer NOT NULL DEFAULT 0,
  niveau                     integer NOT NULL DEFAULT 1,
  -- Compteurs par catégorie (base de calcul des badges)
  capsules_creees            integer NOT NULL DEFAULT 0,
  souvenirs_deposes          integer NOT NULL DEFAULT 0,
  parrainages_acceptes       integer NOT NULL DEFAULT 0,
  capsules_papy_ouvertes     integer NOT NULL DEFAULT 0,
  packs_inoubliables_achetes integer NOT NULL DEFAULT 0,
  updated_at                 timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gamification_user ON gamification(user_id);

-- RLS : chaque utilisateur ne voit et ne modifie que sa propre ligne
ALTER TABLE gamification ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gami_select_own" ON gamification
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "gami_insert_own" ON gamification
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "gami_update_own" ON gamification
  FOR UPDATE USING (auth.uid() = user_id);

-- ── Fonction principale ─────────────────────────────────────────────────────
-- Incrémente atomiquement les compteurs et recalcule le niveau.
-- SECURITY DEFINER : utilisable depuis le webhook (service_role) et les triggers.
-- Retourne les nouvelles valeurs points_total + niveau pour que l'appelant
-- puisse détecter un niveau supérieur ou un badge nouvellement débloqué.
CREATE OR REPLACE FUNCTION incrementer_gamification(
  p_user_id                    uuid,
  p_points                     integer DEFAULT 0,
  p_capsules_creees            integer DEFAULT 0,
  p_souvenirs_deposes          integer DEFAULT 0,
  p_parrainages_acceptes       integer DEFAULT 0,
  p_capsules_papy_ouvertes     integer DEFAULT 0,
  p_packs_inoubliables_achetes integer DEFAULT 0
) RETURNS TABLE(points_total integer, niveau integer)
  LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_points integer;
  v_niveau integer;
BEGIN
  INSERT INTO gamification (
    user_id, points_total,
    capsules_creees, souvenirs_deposes, parrainages_acceptes,
    capsules_papy_ouvertes, packs_inoubliables_achetes
  ) VALUES (
    p_user_id, p_points,
    p_capsules_creees, p_souvenirs_deposes, p_parrainages_acceptes,
    p_capsules_papy_ouvertes, p_packs_inoubliables_achetes
  )
  ON CONFLICT (user_id) DO UPDATE SET
    points_total               = gamification.points_total               + p_points,
    capsules_creees            = gamification.capsules_creees            + p_capsules_creees,
    souvenirs_deposes          = gamification.souvenirs_deposes          + p_souvenirs_deposes,
    parrainages_acceptes       = gamification.parrainages_acceptes       + p_parrainages_acceptes,
    capsules_papy_ouvertes     = gamification.capsules_papy_ouvertes     + p_capsules_papy_ouvertes,
    packs_inoubliables_achetes = gamification.packs_inoubliables_achetes + p_packs_inoubliables_achetes,
    updated_at                 = now();

  SELECT g.points_total INTO v_points FROM gamification g WHERE g.user_id = p_user_id;

  v_niveau := CASE
    WHEN v_points >= 300 THEN 6
    WHEN v_points >= 150 THEN 5
    WHEN v_points >= 80  THEN 4
    WHEN v_points >= 40  THEN 3
    WHEN v_points >= 15  THEN 2
    ELSE 1
  END;

  UPDATE gamification SET niveau = v_niveau WHERE user_id = p_user_id;

  RETURN QUERY SELECT v_points, v_niveau;
END;
$$;

-- ── Table parrainages (manquante dans les migrations précédentes) ───────────
CREATE TABLE IF NOT EXISTS parrainages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parrain_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  filleul_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  converti   boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE (parrain_id, filleul_id)
);

ALTER TABLE parrainages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "parrainages_select_own" ON parrainages
  FOR SELECT USING (auth.uid() = parrain_id OR auth.uid() = filleul_id);

CREATE POLICY "parrainages_insert_filleul" ON parrainages
  FOR INSERT WITH CHECK (auth.uid() = filleul_id);

-- ── Trigger parrainage ──────────────────────────────────────────────────────
-- Crédite automatiquement 3 points au parrain quand un filleul valide son inscription.
-- Utilise SECURITY DEFINER pour contourner le RLS (le filleul n'est pas le parrain).
CREATE OR REPLACE FUNCTION trigger_parrainage_gamification()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM incrementer_gamification(NEW.parrain_id, 3, 0, 0, 1, 0, 0);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_parrainage_insert ON parrainages;
CREATE TRIGGER on_parrainage_insert
  AFTER INSERT ON parrainages
  FOR EACH ROW EXECUTE FUNCTION trigger_parrainage_gamification();
