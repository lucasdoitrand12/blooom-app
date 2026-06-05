// ============================================================
// LOGIQUE ÉCONOMIQUE BLOOOM — source de vérité unique
// Toute décision de quota ou de paywall passe par ce fichier.
// Ne jamais dupliquer cette logique dans les composants.
// ============================================================

// Mettre à false avant de passer en production.
export const DEV_PREMIUM = false;

// --- QUOTAS PAR FORMULE ------------------------------------
// Chaque formule définit ce qu'une capsule peut contenir.
// Les quotas Naissance et Papy sont MENSUELS et se réinitialisent
// le 1er de chaque mois via une Edge Function schedulée.
// Les autres quotas sont TOTAUX sur toute la durée de la capsule.

export const QUOTAS = {
  gratuit: {
    photos: 30,
    videos: 0,
    vocaux: 0,
    participants: 9999,
    dureeVideo: 0,
    dureeVocal: 0,
    mensuel: false,
  },
  occasion: {
    // Packs Weekend, Soirée, Voyage, EVG/EVJF
    photos: 150,
    videos: 20,
    vocaux: 10,
    participants: 50,
    dureeVideo: 20,
    dureeVocal: 20,
    mensuel: false,
  },
  mariage: {
    // Pack Mariage — quota généreux car événement unique d'une vie
    photos: 500,
    videos: 50,
    vocaux: 30,
    participants: 9999,
    dureeVideo: 20,
    dureeVocal: 20,
    mensuel: false,
  },
  naissance: {
    // Quota MENSUEL — se renouvelle le 1er du mois
    photos: 40,
    videos: 4,
    vocaux: 4,
    participants: 9999,
    dureeVideo: 20,
    dureeVocal: 20,
    mensuel: true,
  },
  papy: {
    // Quota MENSUEL — se renouvelle le 1er du mois
    photos: 30,
    videos: 4,
    vocaux: 4,
    participants: 9999,
    dureeVideo: 20,
    dureeVocal: 20,
    mensuel: true,
  },
};

// --- VÉRIFICATION DE CONTRIBUTION --------------------------
// Vérifie si un type de contribution est encore disponible
// dans une capsule donnée.
//
// RÈGLE ABSOLUE : les invités ne sont JAMAIS limités.
// Seule la capsule porte les compteurs — pas l'utilisateur.
// Messages et questions : toujours illimités, jamais de quota.

export function peutContribuer(capsule, typeContribution) {
  if (DEV_PREMIUM) return { peut: true, restant: 999 };
  // Messages et questions : aucun quota, toujours possible
  if (['message', 'question'].includes(typeContribution)) {
    return { peut: true, restant: 999 };
  }

  const quotas = QUOTAS[capsule.formule] || QUOTAS.gratuit;

  const mapping = {
    photo:  { quota: quotas.photos, compte: capsule.compte_photos || 0 },
    video:  { quota: quotas.videos, compte: capsule.compte_videos || 0 },
    vocal:  { quota: quotas.vocaux, compte: capsule.compte_vocaux || 0 },
  };

  const info = mapping[typeContribution];
  if (!info) return { peut: true, restant: 999 };

  // Quota à 0 = type non disponible pour cette formule
  if (info.quota === 0) {
    return { peut: false, restant: 0, raison: 'type_non_disponible' };
  }

  const restant = info.quota - info.compte;
  return {
    peut: restant > 0,
    restant: Math.max(0, restant),
    quota: info.quota,
    raison: restant <= 0 ? 'quota_atteint' : null,
  };
}

// --- VÉRIFICATION DE CRÉATION DE CAPSULE ------------------
// Plan gratuit : 1 seule capsule active à la fois.
// Avec un pack payant : capsule créée au moment de l'achat.
// POURQUOI cette limite : incite à acheter un pack pour
// créer une deuxième capsule.

export function peutCreerCapsuleGratuite(nbCapsulesActives) {
  if (DEV_PREMIUM) return { peut: true };
  if (nbCapsulesActives < 1) return { peut: true };
  return { peut: false, raison: 'capsule_limite_gratuit' };
}

// --- QUOTAS À APPLIQUER À LA CRÉATION ---------------------
// Retourne les valeurs de quota à stocker dans la capsule
// au moment de sa création, selon le pack acheté.

export function getQuotasCapsule(formule) {
  const q = QUOTAS[formule] || QUOTAS.gratuit;
  return {
    formule,
    quota_photos: q.photos,
    quota_videos: q.videos,
    quota_vocaux: q.vocaux,
    quota_participants: q.participants,
    duree_video_max_s: q.dureeVideo,
    duree_vocal_max_s: q.dureeVocal,
    compte_photos: 0,
    compte_videos: 0,
    compte_vocaux: 0,
  };
}

// --- TEXTES DES PAYWALLS ----------------------------------
// POURQUOI centraliser : facilite les A/B tests futurs et
// garantit la cohérence du message dans toute l'app.

export function getPaywallContent(raison, options = {}) {
  const PAYWALLS = {
    capsule_limite_gratuit: {
      titre: 'Une capsule à la fois en gratuit',
      texte: 'Choisissez un pack pour créer une nouvelle capsule et débloquer plus de contenu.',
      cta: 'Voir les packs',
    },
    type_non_disponible: {
      titre: options.type === 'video'
        ? 'Les vidéos ne sont pas disponibles en gratuit'
        : 'Les vocaux ne sont pas disponibles en gratuit',
      texte: 'Choisissez un pack pour ajouter des vidéos et des messages vocaux à vos capsules.',
      cta: 'Voir les packs',
    },
    quota_atteint: {
      titre: `Quota de ${options.type || 'contenu'} atteint`,
      texte: `Cette capsule a atteint sa limite de ${options.type || 'contenu'}. Vous pouvez toujours ajouter des messages écrits.`,
      cta: null,
    },
    pack_occasion: {
      titre: `Pack ${options.nomPack || 'Inoubliable'} — 9,99€`,
      texte: '150 photos · 20 vidéos 20s · 10 vocaux 20s · 50 participants',
      cta: `Acheter ce pack — 9,99€`,
    },
    pack_mariage: {
      titre: 'Pack Mariage 💍 — 29,99€',
      texte: '500 photos · 50 vidéos 20s · 30 vocaux · participants illimités · QR code pour les tables',
      cta: 'Acheter le Pack Mariage — 29,99€',
    },
    pack_naissance: {
      titre: 'Pack Naissance 🍼',
      texte: '40 photos · 4 vidéos · 4 vocaux par mois · impression optionnelle · résiliable à tout moment',
      cta: 'Prendre le Pack Naissance — 4,99€/mois',
      ctaSecondaire: 'Ou 44,99€/an — économisez 15€',
    },
    pack_papy: {
      titre: 'Pack Mamie/Papy 👴',
      texte: '40 photos · 4 vidéos · 4 vocaux par mois · interface simplifiée · impression optionnelle',
      cta: 'Prendre le Pack Mamie/Papy — 4,99€/mois',
      ctaSecondaire: 'Ou 44,99€/an — économisez 15€',
    },
  };
  return PAYWALLS[raison] || PAYWALLS.capsule_limite_gratuit;
}
