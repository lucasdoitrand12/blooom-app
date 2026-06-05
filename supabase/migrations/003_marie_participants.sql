-- Colonne "marie" sur la table participants
-- Permet d'identifier les 2 mariés dans une capsule mariage.
-- Seuls les participants avec marie=true peuvent ouvrir et voir le contenu.

ALTER TABLE participants
  ADD COLUMN IF NOT EXISTS marie BOOLEAN NOT NULL DEFAULT false;
