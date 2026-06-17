-- ============================================================
-- POLITIQUES RLS DELETE — manquantes dans le schéma initial
-- À exécuter dans Supabase SQL Editor
-- ============================================================

-- Créateur peut supprimer sa capsule
create policy "Supprimer sa capsule" on capsules
  for delete using (created_by = auth.uid());

-- Participant peut se retirer d'une capsule,
-- ou le créateur peut retirer n'importe quel participant
create policy "Quitter ou gérer participants" on participants
  for delete using (
    user_id = auth.uid()
    or exists (
      select 1 from capsules
      where capsules.id = participants.capsule_id
        and capsules.created_by = auth.uid()
    )
  );

-- Auteur peut supprimer sa propre contribution
create policy "Supprimer sa contribution" on contributions
  for delete using (
    exists (
      select 1 from participants
      where participants.id = contributions.auteur_id
        and participants.user_id = auth.uid()
    )
  );
