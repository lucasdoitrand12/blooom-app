-- ============================================================
-- RPC : incrément atomique des compteurs photo/vidéo/vocal
-- security definer = contourne le RLS, accessible par tout utilisateur authentifié
-- Vérifie que l'appelant est participant de la capsule avant d'agir.
-- ============================================================

create or replace function incrementer_compte_media(
  p_capsule_id uuid,
  p_champ      text,
  p_delta      integer default 1
) returns void language plpgsql security definer as $$
begin
  -- Vérifie que l'appelant est participant (sécurité minimale)
  if not exists (
    select 1 from participants
    where capsule_id = p_capsule_id
      and user_id    = auth.uid()
  ) then
    raise exception 'Non autorisé';
  end if;

  if p_champ = 'compte_photos' then
    update capsules set compte_photos = greatest(0, compte_photos + p_delta) where id = p_capsule_id;
  elsif p_champ = 'compte_videos' then
    update capsules set compte_videos = greatest(0, compte_videos + p_delta) where id = p_capsule_id;
  elsif p_champ = 'compte_vocaux' then
    update capsules set compte_vocaux = greatest(0, compte_vocaux + p_delta) where id = p_capsule_id;
  end if;
end;
$$;
