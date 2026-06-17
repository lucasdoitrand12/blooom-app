// ============================================================================
//  CAPSULE TEMPORELLE — Application mobile (prototype React) — v4
// ============================================================================
//  CHANGEMENT D'ARCHITECTURE MAJEUR (v4) :
//  La CAPSULE est désormais l'unité de base. Les PARTICIPANTS ne sont plus une
//  famille globale partagée : chaque capsule possède SA PROPRE liste de
//  participants. On rejoint une capsule précise via un LIEN + un CODE.
//
//  MODÈLE DE DONNÉES :
//   moi (global)   = l'identité de l'utilisateur de cet appareil
//                    { id, prenom, description, photo, couleur }
//   capsules       = tableau ; CHAQUE capsule contient :
//     { id, nom, type, dateOuverture, couverture, dateCreation, ouverte,
//       code,                         // code de partage unique de la capsule
//       participants: [ {id, prenom, description, photo, couleur} ],
//       contributions: [ {id, auteurId -> participant, type, ...} ] }
//
//  POURQUOI ce modèle : il colle à l'usage réel — on crée une capsule pour une
//  occasion, puis on invite UNIQUEMENT les bonnes personnes pour CETTE occasion
//  (les invités d'un mariage ne sont pas les mêmes que la famille proche, etc.).
//
//  PUBLICATION STORES : code React "web", emballable avec Capacitor. Pour qu'un
//  lien partagé OUVRE l'app, configurer Universal Links (iOS) / App Links
//  (Android) côté Capacitor. Le code de partage, lui, fonctionne sans cela.
//  PERSISTANCE : isolée dans `Stockage` (à remplacer par localStorage/backend).
// ============================================================================

import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "./lib/supabase";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { App as CapApp } from "@capacitor/app";
import {
  peutContribuer,
  peutCreerCapsuleGratuite,
  getQuotasCapsule,
  getPaywallContent,
  QUOTAS,
  DEV_PREMIUM,
} from "./utils/abonnement.js";

// ============================================================================
//  2. DONNÉES DE RÉFÉRENCE
// ============================================================================
const TYPES_CAPSULES = [
  // --- Types originaux ---
  { id: "naissance", nom: "Naissance",        icone: "🍼", dureeAns: 18, teinte: "#4D7CFF" },
  { id: "mariage",   nom: "Mariage",          icone: "💍", dureeAns: 10, teinte: "#FF5C9D" },
  { id: "anniv",     nom: "Anniversaire",     icone: "🎂", dureeAns: 1,  teinte: "#FFC436" },
  { id: "noel",      nom: "Noël",             icone: "🎄", dureeAns: 1,  teinte: "#22C7B8" },
  { id: "evjf",      nom: "EVJF / EVG",       icone: "🎉", dureeAns: 1,  teinte: "#9B5DE5" },
  { id: "rentree",   nom: "Rentrée scolaire", icone: "🎒", dureeAns: 12, teinte: "#FF8A3D" },
  { id: "amis",      nom: "Entre amis",       icone: "🤝", dureeAns: 5,  teinte: "#00BBF9" },
  { id: "libre",     nom: "Capsule libre",    icone: "✨", dureeAns: 1,  teinte: "#FF6B5E" },

  // --- Nouveaux types : études & carrière ---
  { id: "diplome",   nom: "Diplôme",          icone: "🎓", dureeAns: 1,   teinte: "#FFB347" },
  { id: "job",       nom: "Nouveau job",      icone: "💼", dureeAns: 1,   teinte: "#4D7CFF" },
  { id: "lancement", nom: "Lancement",        icone: "🚀", dureeAns: 1,   teinte: "#4D7CFF" },
  { id: "victoire",  nom: "Victoire",         icone: "🏆", dureeAns: 1,   teinte: "#FFC436" },

  // --- Nouveaux types : vie quotidienne ---
  { id: "logement",  nom: "Nouveau chez-soi", icone: "🏠", dureeAns: 1,   teinte: "#22C7B8" },
  { id: "voyage",    nom: "Grand voyage",     icone: "✈️", dureeAns: 1,   teinte: "#00BBF9" },
  { id: "vacances",  nom: "Vacances",         icone: "🏕️", dureeAns: 1,   teinte: "#00BBF9" },
  { id: "festival",  nom: "Festival",         icone: "🎪", dureeAns: 1,   teinte: "#FF8A3D" },
  { id: "soiree",    nom: "Soirée mémorable", icone: "🍾", dureeAns: 1,   teinte: "#FF5C9D" },
  { id: "weekend",   nom: "Week-end",         icone: "🏖️", dureeAns: 1,   teinte: "#00BBF9" },
  { id: "defi_sport",nom: "Défi sportif",     icone: "🏃", dureeAns: 1,   teinte: "#FF6B5E" },

  // --- Nouveaux types : famille & transmission ---
  { id: "grossesse",        nom: "Grossesse",         icone: "🤰", dureeAns: 1,   teinte: "#FF5C9D" },
  { id: "premiers_pas",     nom: "Premiers pas",      icone: "👶", dureeAns: 3,   teinte: "#FFC436" },
  { id: "rentree_maternelle",nom: "Première rentrée", icone: "🎒", dureeAns: 12,  teinte: "#9B5DE5" },
  { id: "retraite",         nom: "Retraite",          icone: "👴", dureeAns: 5,   teinte: "#22C7B8" },
  { id: "memoire",          nom: "Mémoire",           icone: "🕯️", dureeAns: 999, teinte: "#9B8AA0" },
];


// ── Gamification ────────────────────────────────────────────────────────────
const NIVEAUX = [
  { niveau: 1, nom: "Graine",  emoji: "🌱", min: 0,   recompense: null },
  { niveau: 2, nom: "Bourgeon",emoji: "🌿", min: 15,  recompense: "1 mois Pack Papy/Mamie offert" },
  { niveau: 3, nom: "Pousse",  emoji: "🪴", min: 40,  recompense: "1 Pack Inoubliable offert" },
  { niveau: 4, nom: "Branche", emoji: "🌲", min: 80,  recompense: "2 mois Pack Papy/Mamie offerts" },
  { niveau: 5, nom: "Arbre",   emoji: "🌳", min: 150, recompense: "1 Pack Mariage offert" },
  { niveau: 6, nom: "Forêt",   emoji: "🌲🌿", min: 300, recompense: "6 mois Pack Papy/Mamie offerts" },
];

const BADGES_DEF = [
  {
    categorie: "Bâtisseur de liens", emoji: "🏗️", cle: "capsules_creees",
    label: "capsule créée",
    paliers: [
      { slug: "premier_souffle",  seuil: 1,  nom: "Premier souffle" },
      { slug: "semeur",           seuil: 3,  nom: "Semeur" },
      { slug: "architecte",       seuil: 10, nom: "Architecte" },
      { slug: "batisseur",        seuil: 25, nom: "Bâtisseur" },
      { slug: "legende",          seuil: 50, nom: "Légende" },
    ],
  },
  {
    categorie: "Gardien des instants", emoji: "📸", cle: "souvenirs_deposes",
    label: "souvenir déposé",
    paliers: [
      { slug: "premier_eclat",    seuil: 1,   nom: "Premier éclat" },
      { slug: "conteur",          seuil: 10,  nom: "Conteur" },
      { slug: "archiviste",       seuil: 50,  nom: "Archiviste" },
      { slug: "gardien_badge",    seuil: 200, nom: "Gardien" },
      { slug: "passeur_badge",    seuil: 500, nom: "Passeur" },
    ],
  },
  {
    categorie: "Rassembleur", emoji: "🤝", cle: "parrainages_acceptes",
    label: "parrainage",
    paliers: [
      { slug: "trait_union",       seuil: 1,  nom: "Trait d'union" },
      { slug: "tisseur",           seuil: 5,  nom: "Tisseur" },
      { slug: "rassembleur_badge", seuil: 15, nom: "Rassembleur" },
      { slug: "pilier",            seuil: 30, nom: "Pilier" },
    ],
  },
  {
    categorie: "Passeur de mémoire", emoji: "👴", cle: "capsules_papy_ouvertes",
    label: "ouverture",
    paliers: [
      { slug: "premiere_page",  seuil: 1,  nom: "Première page" },
      { slug: "feuilleton",     seuil: 6,  nom: "Feuilleton" },
      { slug: "rituel",         seuil: 12, nom: "Rituel" },
      { slug: "transmission",   seuil: 24, nom: "Transmission" },
    ],
  },
  {
    categorie: "Inoubliable", emoji: "✨", cle: "packs_inoubliables_achetes",
    label: "pack acheté",
    paliers: [
      { slug: "premiere_escapade", seuil: 1, nom: "Première escapade" },
      { slug: "collectionneur",    seuil: 3, nom: "Collectionneur" },
      { slug: "epicurien",         seuil: 7, nom: "Épicurien" },
    ],
  },
];

const GAMI_VIDE = {
  points_total: 0, niveau: 1,
  capsules_creees: 0, souvenirs_deposes: 0,
  parrainages_acceptes: 0, capsules_papy_ouvertes: 0, packs_inoubliables_achetes: 0,
};

function niveauDepuisPoints(points) {
  return [...NIVEAUX].reverse().find(n => points >= n.min) || NIVEAUX[0];
}

function badgesDebloques(gami) {
  if (!gami) return [];
  return BADGES_DEF.flatMap(cat =>
    cat.paliers
      .filter(p => (gami[cat.cle] || 0) >= p.seuil)
      .map(p => ({ ...p, categorie: cat.categorie, emoji: cat.emoji }))
  );
}

// 100 statistiques fictives mais crédibles — servent à créer un sentiment de communauté
// et à inciter à l'action (preuve sociale). Valeurs fixes dans le code, jamais appelées
// depuis une API, pour éviter toute dépendance externe et garder un contrôle total du message.
const STATS_SOCIALES = [
  // Bébés et naissance
  "127 bébés ont déjà une capsule qui les attend à 18 ans 👶",
  "Ce matin, un bébé est né. Ses parents ont déjà scellé ses premiers souvenirs 🍼",
  "43 capsules ont été créées le jour même d'une naissance 🌸",
  "Une maman a déposé 12 souvenirs pour son enfant à naître 💛",
  "38 capsules de naissance s'ouvriront dans plus de 15 ans ⏳",
  "La plus jeune capsule créée ? Pour un bébé de 2 jours 🍼",
  "92 futures mamans ont scellé des souvenirs pendant leur grossesse 🤰",
  "Un père a écrit une lettre à son fils qui s'ouvrira dans 18 ans ✉️",
  // Mariages
  "312 capsules s'ouvriront le jour d'un anniversaire de mariage 💍",
  "Le record ? Une capsule de mariage contenant 67 souvenirs 💛",
  "48 témoins ont déposé un souvenir dans une capsule de mariage cette semaine 🥂",
  "23 capsules ont été créées le soir d'un EVJF 🎉",
  "Une capsule de mariage s'ouvrira dans exactement 10 ans 💍",
  "Des mariés ont reçu 34 souvenirs de leurs invités sans en avoir lu un seul 🤫",
  // Études et bac
  "19 capsules s'ouvriront le jour du bac 🎓",
  "54 élèves ont scellé leurs souvenirs de terminale 📚",
  "Une capsule créée en 6ème s'ouvrira le jour du baccalauréat ⏳",
  "37 étudiants ont déposé leurs rêves dans une capsule avant d'entrer en fac 🎓",
  "12 classes entières ont créé une capsule de fin d'année 🏫",
  "Un prof a créé une capsule pour ses élèves qui s'ouvrira dans 10 ans 📖",
  // Amis et groupes
  "La capsule la plus remplie contient 47 souvenirs déposés par 12 amis 💛",
  "89 groupes d'amis ont scellé leurs souvenirs avant de se séparer 🤝",
  "Une capsule créée lors d'un festival s'ouvrira dans un an 🎪",
  "31 colocations ont créé une capsule le jour de leur emménagement 🏠",
  "Des amis d'enfance ont retrouvé leurs souvenirs 20 ans plus tard ✨",
  "17 équipes sportives ont scellé leur saison dans une capsule 🏆",
  "4 amis ont parié sur leur avenir dans une capsule. L'un d'eux avait raison. 🎲",
  "Une capsule entre amis contient 8 paris, 3 secrets et 12 photos 🤫",
  // Retraite et travail
  "50 capsules attendent la retraite de quelqu'un 👴",
  "Une équipe entière a scellé 5 ans de souvenirs pour leur collègue partant à la retraite 🥂",
  "38 capsules ont été créées le premier jour d'un nouveau job 💼",
  "22 startups ont scellé leurs débuts dans une capsule 🚀",
  "Un manager a laissé un message à son équipe à ouvrir dans 2 ans 💌",
  "14 entrepreneurs ont scellé leurs rêves le jour du lancement de leur projet 🚀",
  // Voyages
  "38 capsules ont été créées avant un grand voyage ✈️",
  "Un tour du monde entier a été scellé souvenir par souvenir 🌍",
  "12 familles ont créé une capsule avant d'émigrer dans un nouveau pays 🌏",
  "Une capsule créée à Tokyo s'ouvrira à Paris dans 5 ans ✈️",
  "29 voyageurs solitaires ont déposé leurs plus beaux souvenirs dans Blooom 🌅",
  // Contributions créatives
  "Le souvenir le plus rare déposé dans Blooom ? Un secret. 🤫",
  "Ce matin, 23 souvenirs ont été scellés dans Blooom ✨",
  "4 personnes ont déposé un souvenir dans la dernière heure 🌸",
  "Plus de 1 200 souvenirs scellés cette semaine 🎉",
  "347 dessins ont été créés directement dans Blooom 🎨",
  "La chanson la plus déposée cette semaine ? Une que personne n'oubliera 🎵",
  "89 messages vocaux attendent d'être entendus dans des années 🎙️",
  "12 personnes ont déposé la météo du jour de la naissance de leur enfant 🌤️",
  "Un utilisateur a déposé la une du journal le jour de son mariage 📰",
  "203 lettres au futur ont été scellées ce mois-ci ✉️",
  "Le message vocal le plus long ? 4 minutes et 32 secondes 🎙️",
  "67 défis ont été lancés dans des capsules. 43 ont été relevés. 🏆",
  // Émotion et ouverture
  "3 capsules se sont ouvertes aujourd'hui. Quelqu'un a souri. 😊",
  "Certaines capsules ne s'ouvriront que dans 20 ans. Elles existent déjà. ⏳",
  "Une capsule créée aujourd'hui s'ouvrira dans 14 ans ⌛",
  "847 capsules attendent que quelqu'un ait 18 ans 🍼",
  "La capsule ouverte hier contenait des souvenirs vieux de 8 ans 💛",
  "Quelqu'un a pleuré en ouvrant sa capsule ce matin. De joie. 🥹",
  "Une grand-mère a découvert les souvenirs de ses petits-enfants aujourd'hui 👴",
  "La plus longue attente avant ouverture ? 12 ans et 3 mois ⏳",
  "37 capsules se sont ouvertes un jour d'anniversaire cette année 🎂",
  "Une capsule ouverte hier contenait une chanson que tout le monde avait oubliée 🎵",
  "Quelqu'un a retrouvé la voix de son père dans une capsule ouverte ce matin 🥹",
  // Chiffres globaux
  "Plus de 8 400 souvenirs ont déjà été scellés dans Blooom ✨",
  "En moyenne, une capsule Blooom contient 6 souvenirs 💛",
  "La capsule avec le plus de participants ? 23 personnes 🎉",
  "Blooom est utilisé dans 14 pays différents 🌍",
  "Ce weekend, 89 nouvelles capsules ont été créées 🌸",
  "1 capsule sur 3 contient au moins un secret 🤫",
  "La moyenne d'attente avant ouverture est de 2 ans et 4 mois ⏳",
  "47% des capsules sont créées pour des occasions familiales 💛",
  // Occasions spéciales
  "14 capsules ont été créées pour un départ à l'étranger ce mois-ci ✈️",
  "Une capsule a été créée le soir du réveillon pour s'ouvrir 10 ans plus tard 🎄",
  "33 personnes ont scellé leurs résolutions du Nouvel An dans Blooom 🎉",
  "Une capsule de Noël contient 18 souvenirs déposés par toute une famille 🎄",
  "12 capsules ont été créées le soir d'un concert inoubliable 🎪",
  "Un groupe d'amis a scellé leur premier festival ensemble. Ils avaient 17 ans. 🎵",
  // Encouragement à contribuer
  "Les capsules avec 5 souvenirs ou plus génèrent 3x plus d'émotion à l'ouverture 💛",
  "Chaque souvenir déposé maintenant sera une surprise dans le futur ✨",
  "Les capsules les plus touchantes ? Celles où chaque participant a contribué 💭",
  "Un souvenir déposé aujourd'hui peut faire pleurer de joie dans 10 ans 🥹",
  "Plus une capsule est remplie, plus l'ouverture est mémorable 🌸",
  "Le premier souvenir est toujours le plus difficile à déposer. Et le plus précieux. ✨",
  "Chaque photo scellée aujourd'hui sera un trésor demain 📷",
  "Les capsules avec des messages vocaux sont les plus émouvantes à ouvrir 🎙️",
  // Anecdotes touchantes
  "Un fils a retrouvé un dessin de son père dans une capsule ouverte à ses 18 ans 🎨",
  "Deux sœurs ont déposé le même souvenir sans se concerter 🥹",
  "Un papi a laissé une blague dans une capsule. Sa famille rit encore. 😂",
  "Une capsule contenait une recette de famille transmise pour la première fois ✨",
  "Trois générations ont contribué à la même capsule 💛",
  "Un enfant de 6 ans a dessiné dans une capsule. Il aura 24 ans à l'ouverture. 🎨",
  "Une capsule créée le jour d'une rupture s'est ouverte le jour d'un mariage 💍",
  "Le plus jeune contributeur de Blooom ? 4 ans. Le plus âgé ? 91 ans. 💛",
];

// Pioche un index aléatoire différent du précédent, pour éviter deux fois la même stat
function piocherStat(excluIdx = -1) {
  let idx;
  do { idx = Math.floor(Math.random() * STATS_SOCIALES.length); } while (idx === excluIdx && STATS_SOCIALES.length > 1);
  return idx;
}

// Carte tournante (EcranCapsules) : affiche une stat qui change toutes les 5 secondes
// avec une transition en fondu. Crée un sentiment de communauté vivante.
function CarteStatRotative() {
  const [idx, setIdx]         = React.useState(() => piocherStat());
  const [visible, setVisible] = React.useState(true);
  React.useEffect(() => {
    const interval = setInterval(() => {
      // Fondu sortant → change la stat → fondu entrant
      setVisible(false);
      setTimeout(() => {
        setIdx(prev => piocherStat(prev));
        setVisible(true);
      }, 350);
    }, 12000);
    return () => clearInterval(interval);
  }, []);
  return (
    <div style={{ textAlign: "center", marginTop: 12, padding: "0 8px" }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: COULEURS.doux + "80",
        letterSpacing: 0.5, marginBottom: 4, textTransform: "uppercase" }}>
        En ce moment sur Blooom
      </div>
      <div style={{ fontSize: 12, color: COULEURS.doux, lineHeight: 1.5,
        opacity: visible ? 0.7 : 0, transition: "opacity 0.35s ease", fontStyle: "italic" }}>
        {STATS_SOCIALES[idx]}
      </div>
    </div>
  );
}

// Ligne discrète (EcranContribution) : tirage unique à la visite, sans carte,
// juste assez visible pour renforcer la motivation sans distraire du formulaire.
function LigneStatDiscrète() {
  const [idx] = React.useState(() => piocherStat());
  return (
    <p style={{ textAlign: "center", fontSize: 11, color: COULEURS.doux,
      opacity: 0.55, fontStyle: "italic", margin: "0 0 10px", lineHeight: 1.5 }}>
      {STATS_SOCIALES[idx]}
    </p>
  );
}

// Carte statique (EcranDetail sans souvenirs, EcranConnexion) : tirage unique,
// plus sobre que la carte rotative — pas d'animation pour ne pas surcharger.
function CarteStatStatique() {
  const [idx] = React.useState(() => piocherStat());
  return (
    <div style={{ textAlign: "center", marginTop: 12, padding: "0 8px" }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: COULEURS.doux + "80",
        letterSpacing: 0.5, marginBottom: 4, textTransform: "uppercase" }}>
        En ce moment sur Blooom
      </div>
      <div style={{ fontSize: 12, color: COULEURS.doux, lineHeight: 1.5,
        opacity: 0.7, fontStyle: "italic" }}>
        {STATS_SOCIALES[idx]}
      </div>
    </div>
  );
}

const REACTIONS = [
  // Toujours visibles
  { id: "coeur",   icone: "❤️",  nom: "Coeur",          visible: true  },
  { id: "drole",   icone: "😂",  nom: "Mort de rire",   visible: true  },
  { id: "touche",  icone: "🥹",  nom: "Touché",         visible: true  },
  // Accessibles via le bouton "+"
  { id: "colere",  icone: "😡",  nom: "En colère",      visible: false },
  { id: "confetti",icone: "🎉",  nom: "Confetti",       visible: false },
  { id: "sourire", icone: "😁",  nom: "Grand sourire",  visible: false },
  { id: "pleure",  icone: "😢",  nom: "Je pleure",      visible: false },
];

const TYPES_CONTRIBUTION = [
  { id: "message",          nom: "Un message",              icone: "✍️" },
  { id: "photo",            nom: "Une photo",               icone: "📷" },
  { id: "video",            nom: "Une vidéo",               icone: "🎬" },
  { id: "vocal",            nom: "Un message vocal",        icone: "🎙️" },
  { id: "dessin",           nom: "Un dessin",               icone: "🎨" },
  { id: "secret",           nom: "Un secret",               icone: "🤫" },
  { id: "pari",             nom: "Un pari",                 icone: "🎲" },
  { id: "vote",             nom: "Un vote",                 icone: "🗳️" },
  { id: "une_du_jour",      nom: "La une du jour",          icone: "📰" },
  { id: "meteo",            nom: "La météo du jour",        icone: "🌤️" },
  { id: "chanson",          nom: "La chanson du moment",    icone: "🎵" },
  { id: "document",         nom: "Un document PDF",         icone: "📄" },
];

// Filtres colorimétriques (CSS). PAS de filtres de visage en réalité augmentée
// (qui exigeraient un SDK de détection faciale en production).
const FILTRES = [
  { id: "original", nom: "Original",     css: "none" },
  { id: "nb",       nom: "Noir & blanc", css: "grayscale(1)" },
  { id: "sepia",    nom: "Sépia",        css: "sepia(0.7)" },
  { id: "vintage",  nom: "Vintage",      css: "sepia(0.35) contrast(1.1) saturate(1.3) hue-rotate(-10deg)" },
  { id: "froid",    nom: "Froid",        css: "saturate(1.2) hue-rotate(15deg) brightness(1.05)" },
  { id: "chaud",    nom: "Chaud",        css: "sepia(0.2) saturate(1.4) brightness(1.05)" },
  { id: "eclat",    nom: "Éclat",        css: "contrast(1.2) saturate(1.5) brightness(1.1)" },
  { id: "pop",      nom: "Pop",          css: "saturate(1.8) contrast(1.15) brightness(1.05)" },
];

const AMBIANCES = [
  { id: "soleil", nom: "Soleil", fond: "linear-gradient(135deg,#FF8A3D,#FFC436)", texte: "#FFFFFF" },
  { id: "rose",   nom: "Rose",   fond: "linear-gradient(135deg,#FF5C9D,#FF6B5E)", texte: "#FFFFFF" },
  { id: "menthe", nom: "Menthe", fond: "linear-gradient(135deg,#22C7B8,#00BBF9)", texte: "#FFFFFF" },
  { id: "nuit",   nom: "Nuit",   fond: "#2E2230", texte: "#FFE9D6" },
  { id: "clair",  nom: "Clair",  fond: "#FFFFFF", texte: "#2E2230" },
];

const COULEURS_AVATAR = ["#FF6B5E", "#22C7B8", "#4D7CFF", "#FF5C9D", "#FFC436", "#9B5DE5", "#00BBF9", "#FF8A3D"];

// Noms des formules — utilisés dans les badges du profil et les détails de capsule
const NOM_FORMULE = {
  gratuit:  "Gratuit",
  occasion: "Pack Inoubliable",
  mariage:  "Pack Mariage 💍",
  naissance:"Pack Naissance 🍼",
  papy:     "Pack Mamie/Papy 👴",
};


// ============================================================================
//  3. FONCTIONS UTILITAIRES
// ============================================================================
function genererId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// Génère un CODE de partage de 6 caractères. On exclut les lettres/chiffres
// ambigus (I, L, O, 0, 1) pour éviter les erreurs de saisie à la main.
function genererCode() {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

function lienPartage(code) {
  return `${window.location.origin}?code=${code}`;
}

function formaterDate(iso) {
  if (!iso) return "Quand je déciderai";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}
function formaterDateHeure(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const date = d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  const heure = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return `${date} · ${heure}`;
}
function joursRestants(iso) {
  if (!iso) return null;
  return Math.ceil((new Date(iso) - new Date()) / (1000 * 60 * 60 * 24));
}
function estOuvrable(capsule) {
  if (capsule.ouverte) return false;
  if (!capsule.dateOuverture) return true;
  return joursRestants(capsule.dateOuverture) <= 0;
}
function initiales(prenom) {
  return (prenom || "?").trim().slice(0, 1).toUpperCase();
}
// Lecture locale en base64 — utilisée uniquement pour la prévisualisation immédiate.
function lireFichierEnBase64(evenement, callback) {
  const fichier = evenement.target.files[0];
  if (!fichier) return;
  const lecteur = new FileReader();
  lecteur.onload = () => callback(lecteur.result);
  lecteur.readAsDataURL(fichier);
}

// Lit DateTimeOriginal depuis les métadonnées EXIF d'un JPEG sans dépendance externe.
// Retourne une ISO string (heure locale) ou null si absent/non-JPEG.
async function lireExifDate(file) {
  try {
    const buf = await file.arrayBuffer();
    const v = new DataView(buf);
    if (v.getUint16(0) !== 0xFFD8) return null;
    let off = 2;
    while (off < v.byteLength - 4) {
      const marker = v.getUint16(off); off += 2;
      if (marker === 0xFFE1) {
        off += 2; // segLen
        const hdr = String.fromCharCode(v.getUint8(off), v.getUint8(off+1), v.getUint8(off+2), v.getUint8(off+3));
        if (hdr !== "Exif") return null;
        const t = off + 6;
        const le = v.getUint16(t) === 0x4949;
        const u16 = (o) => v.getUint16(t + o, le);
        const u32 = (o) => v.getUint32(t + o, le);
        const ifd0 = u32(4);
        const n0 = u16(ifd0);
        let subOff = null;
        for (let i = 0; i < n0; i++) {
          const e = ifd0 + 2 + i * 12;
          if (u16(e) === 0x8769) { subOff = u32(e + 8); break; }
        }
        if (!subOff) return null;
        const n1 = u16(subOff);
        for (let i = 0; i < n1; i++) {
          const e = subOff + 2 + i * 12;
          if (u16(e) === 0x9003) {
            const vOff = u32(e + 8);
            let str = "";
            for (let j = 0; j < 19 && (t + vOff + j) < v.byteLength; j++) {
              const ch = v.getUint8(t + vOff + j);
              if (ch === 0) break;
              str += String.fromCharCode(ch);
            }
            const m = str.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
            if (m) return new Date(+m[1], +m[2]-1, +m[3], +m[4], +m[5], +m[6]).toISOString();
          }
        }
        return null;
      } else if ((marker & 0xFF00) === 0xFF00 && marker !== 0xFFD9) {
        off += v.getUint16(off);
      } else break;
    }
  } catch {}
  return null;
}

function isoToDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const z = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}`;
}

function isoToTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const z = n => String(n).padStart(2, "0");
  return `${z(d.getHours())}:${z(d.getMinutes())}`;
}

// Envoie un fichier (base64, Blob, ou URL existante) vers Supabase Storage.
// Retourne l'URL publique définitive.
async function uploaderFichier(bucket, fichier, chemin) {
  if (!fichier) return null;
  let blob;
  if (fichier instanceof Blob) {
    blob = fichier;
  } else if (typeof fichier === "string" && fichier.startsWith("data:")) {
    const res = await fetch(fichier);
    blob = await res.blob();
  } else {
    return fichier; // déjà une URL publique
  }
  const ext = blob.type.split("/")[1]?.split(";")[0] || "bin";
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(`${chemin}.${ext}`, blob, { upsert: true });
  if (error) { console.error("Échec upload :", error); return null; }
  const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(data.path);
  return `${publicUrl}?t=${Date.now()}`;
}

// ============================================================================
//  4. NORMALISATION — convertit le format BDD vers le format UI
// ============================================================================
function normaliserProfil(p) {
  return {
    id:                   p.id,
    prenom:               p.prenom,
    description:          p.description          || "",
    photo:                p.photo_url             || null,
    couleur:              p.couleur               || COULEURS_AVATAR[0],
    // Parrainage
    codeParrain:          p.code_parrain          || null,
    // Abonnement
    abonnement:           p.abonnement            || "gratuit",
    abonnementDebutAt:    p.abonnement_debut_at   || null,
    abonnementExpireAt:   p.abonnement_expire_at  || null,
    // Early adopter
    earlyAdopter:         p.early_adopter         || false,
    earlyAdopteurNumero:  p.early_adopter_numero  || null,
    // Gamification
    streakContributions:  p.streak_contributions  || 0,
    derniereContribution: p.derniere_contribution || null,
    // Stockage
    stockageUtiliseMo:    p.stockage_utilise_mo   || 0,
    // Rétrocompat avec l'ancien champ parrainage Plus
    plusExpiresAt: p.abonnement_expire_at || p.plus_expires_at || null,
    // Back office
    isAdmin: p.is_admin || false,
  };
}

function normaliserParticipant(p) {
  return {
    id: p.id,
    userId: p.user_id || null,
    prenom: p.prenom,
    description: p.description || "",
    photo: p.photo_url || null,
    couleur: p.couleur || COULEURS_AVATAR[0],
    marie: p.marie || false,
  };
}

function normaliserContribution(c) {
  const reactions = (c.reactions || []).reduce(
    (acc, r) => ({ ...acc, [r.type]: (acc[r.type] || 0) + 1 }), {}
  );
  const reactionsDétail = (c.reactions || []).reduce(
    (acc, r) => ({ ...acc, [r.participant_id]: r.type }), {}
  );
  return {
    id: c.id,
    auteurId: c.auteur_id,
    type: c.type,
    texte: c.texte || "",
    question: c.question || null,
    media: c.media_url || null,
    filtre: c.filtre || "original",
    ambiance: c.ambiance || null,
    date: c.created_at,
    reactions,
    reactionsDétail,
  };
}

function normaliserCapsule(c) {
  return {
    id:            c.id,
    nom:           c.nom,
    type:          c.type,
    dateOuverture: c.date_ouverture || null,
    couverture:    c.couverture_url || null,
    dateCreation:  c.created_at,
    ouverte:       c.ouverte,
    code:          c.code,
    createurId:    c.created_by || null,
    // Formule et quotas — source unique pour les restrictions de contenu
    formule:            c.formule || "gratuit",
    quota_photos:       c.quota_photos       ?? 30,
    quota_videos:       c.quota_videos       ?? 0,
    quota_vocaux:       c.quota_vocaux       ?? 0,
    quota_participants: c.quota_participants ?? 9999,
    compte_photos:      c.compte_photos      ?? 0,
    compte_videos:      c.compte_videos      ?? 0,
    compte_vocaux:      c.compte_vocaux      ?? 0,
    participants:  (c.participants  || []).map(normaliserParticipant),
    contributions: (c.contributions || []).map(normaliserContribution),
  };
}

function normaliserNotification(n) {
  return {
    id: n.id,
    texte: n.texte,
    lue: n.lue,
    cibleEcran: n.cible_ecran || null,
    capsuleId: n.capsule_id || null,
    createdAt: n.created_at,
  };
}

// ============================================================================
//  5. PETITS COMPOSANTS RÉUTILISABLES
// ============================================================================

// Logo Blooom : trois cercles de taille croissante (ooo) représentant la
// floraison dans le temps. Chaque cercle est légèrement plus grand que le
// précédent et progresse du chaud (orange) vers le profond (violet).
function LogoBlooom({ taille = 44 }) {
  const ep = Math.max(2.5, taille * 0.07);
  const r1 = taille * 0.28, r2 = taille * 0.36, r3 = taille * 0.44;
  const gap = taille * 0.10;
  const cy = r3 + ep;
  const cx1 = r1 + ep;
  const cx2 = cx1 + r1 + gap + r2;
  const cx3 = cx2 + r2 + gap + r3;
  const w = cx3 + r3 + ep;
  const h = cy + r3 + ep;
  const uid = React.useId().replace(/:/g, "");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none">
      <defs>
        <linearGradient id={`${uid}a`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FF8A3D"/><stop offset="100%" stopColor="#FF5C9D"/>
        </linearGradient>
        <linearGradient id={`${uid}b`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FF5C9D"/><stop offset="100%" stopColor="#C65CE8"/>
        </linearGradient>
        <linearGradient id={`${uid}c`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#C65CE8"/><stop offset="100%" stopColor="#4D7CFF"/>
        </linearGradient>
      </defs>
      <circle cx={cx1} cy={cy} r={r1} stroke={`url(#${uid}a)`} strokeWidth={ep}/>
      <circle cx={cx2} cy={cy} r={r2} stroke={`url(#${uid}b)`} strokeWidth={ep * 1.1}/>
      <circle cx={cx3} cy={cy} r={r3} stroke={`url(#${uid}c)`} strokeWidth={ep * 1.2}/>
    </svg>
  );
}
function Avatar({ membre, taille = 38 }) {
  const base = { width: taille, height: taille, borderRadius: "50%", flexShrink: 0, objectFit: "cover" };
  if (membre?.photo) return <img src={membre.photo} alt={membre.prenom} style={base} />;
  return (
    <div style={{ ...base, background: membre?.couleur || "#FF6B5E", color: "#fff",
      display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: taille * 0.42 }}>
      {initiales(membre?.prenom)}
    </div>
  );
}

function RecadreurPhoto({ src, onValider, onAnnuler }) {
  const PREVIEW = 260;
  const OUT = 400;
  const [zoom, setZoom] = React.useState(1);
  const [offset, setOffset] = React.useState({ x: 0, y: 0 });
  const [dragStart, setDragStart] = React.useState(null);
  const [natSize, setNatSize] = React.useState(null);
  const imgRef = React.useRef(null);
  const canvasRef = React.useRef(null);

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function maxOff(z) {
    if (!natSize) return { x: 0, y: 0 };
    const ts = (PREVIEW / Math.min(natSize.w, natSize.h)) * z;
    return {
      x: Math.max(0, (natSize.w * ts - PREVIEW) / 2),
      y: Math.max(0, (natSize.h * ts - PREVIEW) / 2),
    };
  }

  function onImgLoad() {
    const img = imgRef.current;
    setNatSize({ w: img.naturalWidth, h: img.naturalHeight });
  }

  const baseScale = natSize ? PREVIEW / Math.min(natSize.w, natSize.h) : 1;
  const totalScale = baseScale * zoom;
  const dispW = natSize ? natSize.w * totalScale : PREVIEW;
  const dispH = natSize ? natSize.h * totalScale : PREVIEW;
  const imgLeft = PREVIEW / 2 + offset.x - dispW / 2;
  const imgTop  = PREVIEW / 2 + offset.y - dispH / 2;

  function getPoint(e) {
    return e.touches ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
                     : { x: e.clientX, y: e.clientY };
  }

  function onPointerDown(e) {
    e.preventDefault();
    const pt = getPoint(e);
    setDragStart({ px: pt.x, py: pt.y, ox: offset.x, oy: offset.y });
  }

  function onPointerMove(e) {
    if (!dragStart || !natSize) return;
    e.preventDefault();
    const pt = getPoint(e);
    const mo = maxOff(zoom);
    setOffset({
      x: clamp(dragStart.ox + pt.x - dragStart.px, -mo.x, mo.x),
      y: clamp(dragStart.oy + pt.y - dragStart.py, -mo.y, mo.y),
    });
  }

  function onPointerUp() { setDragStart(null); }

  function onZoomChange(newZoom) {
    setZoom(newZoom);
    const mo = maxOff(newZoom);
    setOffset(prev => ({
      x: clamp(prev.x, -mo.x, mo.x),
      y: clamp(prev.y, -mo.y, mo.y),
    }));
  }

  function valider() {
    if (!natSize) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    canvas.width = OUT;
    canvas.height = OUT;
    ctx.clearRect(0, 0, OUT, OUT);
    const ts = (PREVIEW / Math.min(natSize.w, natSize.h)) * zoom;
    const windowNat = PREVIEW / ts;
    const sx = natSize.w / 2 - offset.x / ts - windowNat / 2;
    const sy = natSize.h / 2 - offset.y / ts - windowNat / 2;
    ctx.drawImage(imgRef.current, sx, sy, windowNat, windowNat, 0, 0, OUT, OUT);
    onValider(canvas.toDataURL("image/jpeg", 0.85));
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", zIndex: 9999, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ color: "#fff", fontWeight: 700, fontSize: 17, marginBottom: 24 }}>Ajuster la photo</div>
      <div
        style={{ width: PREVIEW, height: PREVIEW, borderRadius: "50%", overflow: "hidden", position: "relative", cursor: dragStart ? "grabbing" : "grab", background: "#222", touchAction: "none", flexShrink: 0 }}
        onMouseDown={onPointerDown}
        onMouseMove={onPointerMove}
        onMouseUp={onPointerUp}
        onMouseLeave={onPointerUp}
        onTouchStart={onPointerDown}
        onTouchMove={onPointerMove}
        onTouchEnd={onPointerUp}
      >
        <img
          ref={imgRef}
          src={src}
          onLoad={onImgLoad}
          draggable={false}
          alt=""
          style={{ position: "absolute", width: dispW, height: dispH, left: imgLeft, top: imgTop, pointerEvents: "none", userSelect: "none" }}
        />
      </div>
      <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 13, margin: "12px 0 4px", textAlign: "center" }}>Glisse pour recentrer</p>
      <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#fff", marginTop: 8 }}>
        <span style={{ fontSize: 20, opacity: 0.6 }}>−</span>
        <input type="range" min={1} max={4} step={0.02} value={zoom}
          onChange={(e) => onZoomChange(parseFloat(e.target.value))}
          style={{ width: 180, accentColor: "#C65CE8" }} />
        <span style={{ fontSize: 20, opacity: 0.6 }}>+</span>
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 28 }}>
        <button onClick={onAnnuler}
          style={{ padding: "11px 26px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.25)", background: "transparent", color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: 15 }}>
          Annuler
        </button>
        <button onClick={valider}
          style={{ padding: "11px 26px", borderRadius: 999, background: "linear-gradient(135deg,#FF8A3D,#C65CE8)", color: "#fff", border: "none", fontWeight: 700, cursor: "pointer", fontSize: 15 }}>
          Valider
        </button>
      </div>
      <canvas ref={canvasRef} style={{ display: "none" }} />
    </div>
  );
}

// Recadrage photo de couverture (bannière rectangulaire)
function RecadreurCouverture({ src, onValider, onAnnuler }) {
  const PW = 320; // largeur preview
  const PH = 150; // hauteur preview — identique à S.detailCouverture
  const OW = 800; // largeur sortie canvas
  const OH = 375; // hauteur sortie canvas (ratio PW/PH)

  const [zoom, setZoom]           = React.useState(1);
  const [offset, setOffset]       = React.useState({ x: 0, y: 0 });
  const [dragStart, setDragStart] = React.useState(null);
  const [natSize, setNatSize]     = React.useState(null);
  const imgRef    = React.useRef(null);
  const canvasRef = React.useRef(null);

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function baseScale() {
    if (!natSize) return 1;
    return Math.max(PW / natSize.w, PH / natSize.h);
  }

  function maxOff(z) {
    if (!natSize) return { x: 0, y: 0 };
    const ts = baseScale() * z;
    return {
      x: Math.max(0, (natSize.w * ts - PW) / 2),
      y: Math.max(0, (natSize.h * ts - PH) / 2),
    };
  }

  const bs       = baseScale();
  const ts       = bs * zoom;
  const dispW    = natSize ? natSize.w * ts : PW;
  const dispH    = natSize ? natSize.h * ts : PH;
  const imgLeft  = PW / 2 + offset.x - dispW / 2;
  const imgTop   = PH / 2 + offset.y - dispH / 2;

  function getPoint(e) {
    return e.touches ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
                     : { x: e.clientX, y: e.clientY };
  }
  function onPointerDown(e) {
    e.preventDefault();
    const pt = getPoint(e);
    setDragStart({ px: pt.x, py: pt.y, ox: offset.x, oy: offset.y });
  }
  function onPointerMove(e) {
    if (!dragStart || !natSize) return;
    e.preventDefault();
    const pt = getPoint(e);
    const mo = maxOff(zoom);
    setOffset({
      x: clamp(dragStart.ox + pt.x - dragStart.px, -mo.x, mo.x),
      y: clamp(dragStart.oy + pt.y - dragStart.py, -mo.y, mo.y),
    });
  }
  function onPointerUp() { setDragStart(null); }
  function onZoomChange(v) {
    const z = parseFloat(v);
    setZoom(z);
    const mo = maxOff(z);
    setOffset(prev => ({ x: clamp(prev.x, -mo.x, mo.x), y: clamp(prev.y, -mo.y, mo.y) }));
  }

  function valider() {
    if (!natSize) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    canvas.width = OW; canvas.height = OH;
    ctx.clearRect(0, 0, OW, OH);
    const scale = baseScale() * zoom;
    const cx = natSize.w / 2 - offset.x / scale;
    const cy = natSize.h / 2 - offset.y / scale;
    const vw = PW / scale;
    const vh = PH / scale;
    try {
      ctx.drawImage(imgRef.current, cx - vw / 2, cy - vh / 2, vw, vh, 0, 0, OW, OH);
      onValider(canvas.toDataURL("image/jpeg", 0.88));
    } catch {
      alert("Impossible de recadrer depuis cette URL. Re-sélectionnez la photo via le bouton 📷 Changer.");
      onAnnuler();
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", zIndex: 9999,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 360 }}>
        <div style={{ color: "#fff", fontWeight: 700, fontSize: 16, marginBottom: 16, textAlign: "center" }}>
          Recadrer la photo de couverture
        </div>
        <div
          style={{ width: "100%", height: PH, borderRadius: 16, overflow: "hidden", position: "relative",
            cursor: dragStart ? "grabbing" : "grab", background: "#222", touchAction: "none" }}
          onMouseDown={onPointerDown} onMouseMove={onPointerMove}
          onMouseUp={onPointerUp} onMouseLeave={onPointerUp}
          onTouchStart={onPointerDown} onTouchMove={onPointerMove} onTouchEnd={onPointerUp}
        >
          <img ref={imgRef} src={src} onLoad={e => setNatSize({ w: e.target.naturalWidth, h: e.target.naturalHeight })}
            crossOrigin="anonymous" draggable={false} alt=""
            style={{ position: "absolute", width: dispW, height: dispH, left: imgLeft, top: imgTop,
              pointerEvents: "none", userSelect: "none" }} />
        </div>
        <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, margin: "8px 0 4px", textAlign: "center" }}>
          Glisse pour recadrer
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#fff", marginTop: 4 }}>
          <span style={{ fontSize: 16, opacity: 0.5 }}>−</span>
          <input type="range" min={1} max={3} step={0.02} value={zoom}
            onChange={e => onZoomChange(e.target.value)}
            style={{ flex: 1, accentColor: "#C65CE8" }} />
          <span style={{ fontSize: 16, opacity: 0.5 }}>+</span>
        </div>
        <div style={{ display: "flex", gap: 12, marginTop: 22 }}>
          <button onClick={onAnnuler}
            style={{ flex: 1, padding: "11px 0", borderRadius: 999, border: "1px solid rgba(255,255,255,0.25)",
              background: "transparent", color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: 14, fontFamily: "inherit" }}>
            Annuler
          </button>
          <button onClick={valider}
            style={{ flex: 2, padding: "11px 0", borderRadius: 999,
              background: "linear-gradient(135deg,#FF8A3D,#C65CE8)", color: "#fff",
              border: "none", fontWeight: 700, cursor: "pointer", fontSize: 14, fontFamily: "inherit" }}>
            Valider
          </button>
        </div>
        <canvas ref={canvasRef} style={{ display: "none" }} />
      </div>
    </div>
  );
}

function SelecteurPhotoProfil({ photo, couleur, prenom, onChange, taille = 96 }) {
  const [srcBrut, setSrcBrut] = React.useState(null);

  function onFichier(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setSrcBrut(ev.target.result);
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  return (
    <>
      <label style={{ position: "relative", cursor: "pointer", width: taille, height: taille }}>
        <Avatar membre={{ photo, couleur, prenom }} taille={taille} />
        <span style={{ position: "absolute", bottom: -2, right: -2, background: "#fff", borderRadius: "50%",
          width: taille * 0.34, height: taille * 0.34, display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 2px 8px rgba(0,0,0,0.2)", fontSize: taille * 0.18 }}>📷</span>
        <input type="file" accept="image/*" style={{ display: "none" }} onChange={onFichier} />
      </label>
      {srcBrut && (
        <RecadreurPhoto
          src={srcBrut}
          onValider={(cropped) => { onChange(cropped); setSrcBrut(null); }}
          onAnnuler={() => setSrcBrut(null)}
        />
      )}
    </>
  );
}

function EnTeteRetour({ titre, onRetour }) {
  return (
    <div style={S.enteteRetour}>
      <button style={S.fleche} onClick={onRetour}>←</button>
      <span style={S.enteteTitre}>{titre}</span>
    </div>
  );
}

function EcranParametres({ palette, mode, onPalette, onMode, allerVers, ecranPrecedent }) {
  return (
    <div style={S.ecran}>
      <EnTeteRetour titre="Paramètres" onRetour={() => allerVers(ecranPrecedent || "profil")} />
      <div style={S.enteteAccueil}>
        <p style={S.surtitre}>Personnalisation</p>
        <h1 style={S.titrePage}>Paramètres</h1>
      </div>

      <label style={S.label}>Thème</label>
      <div style={{ display: "flex", gap: 10 }}>
        {[{ id: "clair", nom: "Clair", icone: "☀️" }, { id: "sombre", nom: "Sombre", icone: "🌙" }].map(t => (
          <button key={t.id} onClick={() => onMode(t.id)}
            style={{ flex: 1, padding: "16px 10px", borderRadius: 16, border: `2px solid ${mode === t.id ? "var(--a2)" : "var(--bordure)"}`, background: mode === t.id ? "linear-gradient(135deg,var(--a1),var(--a2))" : "var(--carte-bg)", color: mode === t.id ? "#fff" : "var(--encre)", fontWeight: 700, cursor: "pointer", fontSize: 14, display: "flex", flexDirection: "column", alignItems: "center", gap: 7, fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
            <span style={{ fontSize: 28 }}>{t.icone}</span>
            {t.nom}
          </button>
        ))}
      </div>

      <label style={S.label}>Palette de couleurs</label>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {PALETTES_THEME.map(p => {
          const actif = palette === p.id;
          return (
            <button key={p.id} onClick={() => onPalette(p.id)}
              style={{ display: "flex", alignItems: "center", gap: 14, background: "var(--carte-bg)", border: `2px solid ${actif ? "var(--a2)" : "var(--bordure)"}`, borderRadius: 16, padding: "13px 16px", cursor: "pointer", width: "100%", fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
              <div style={{ display: "flex", gap: 5 }}>
                <div style={{ width: 20, height: 20, borderRadius: "50%", background: p.a1, boxShadow: "0 1px 4px rgba(0,0,0,0.2)" }} />
                <div style={{ width: 20, height: 20, borderRadius: "50%", background: p.a2, boxShadow: "0 1px 4px rgba(0,0,0,0.2)" }} />
                <div style={{ width: 20, height: 20, borderRadius: "50%", background: p.a3, boxShadow: "0 1px 4px rgba(0,0,0,0.2)" }} />
              </div>
              <span style={{ flex: 1, fontWeight: 700, fontSize: 15, color: "var(--encre)", textAlign: "left" }}>{p.icone} {p.nom}</span>
              {actif && <span style={{ background: "linear-gradient(135deg,var(--a1),var(--a2))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", fontSize: 18, fontWeight: 800 }}>✓</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
//  ÉCRAN CRÉER — point d'entrée principal pour tous les packs et la capsule gratuite.
//  Remplace l'ancien EcranCreation et EcranPacks.
// ============================================================================

// ── Données des 4 packs occasion ─────────────────────────────────────────────
// Chaque pack a un dégradé doux (pas saturé) pour les cards carrousel.
const PACKS_OCCASION = [
  { id: "weekend", icone: "🏕️", nom: "Weekend",    gradient: "linear-gradient(145deg,#3D7A5E,#1DAB8A)", nomDefault: () => `Weekend du ${new Date().toLocaleDateString("fr-FR",{day:"numeric",month:"long"})}`, type: "amis"   },
  { id: "soiree",  icone: "🍾", nom: "Soirée",     gradient: "linear-gradient(145deg,#5B2D8E,#8B5CF6)", nomDefault: () => `Soirée du ${new Date().toLocaleDateString("fr-FR",{day:"numeric",month:"long"})}`, type: "soiree" },
  { id: "voyage",  icone: "✈️", nom: "Voyage",     gradient: "linear-gradient(145deg,#1A5276,#2E86C1)", nomDefault: () => "Mon voyage", champDestination: true, type: "voyage" },
  { id: "evg",     icone: "🎉", nom: "EVG / EVJF", gradient: "linear-gradient(145deg,#B7770D,#E67E22)", nomDefault: () => `EVG du ${new Date().toLocaleDateString("fr-FR",{day:"numeric",month:"long"})}`, type: "amis"   },
];

// ── Contenu des drawers "En savoir +" — une liste par type de pack ───────────
const INCLUS_PAR_PACK = {
  // Formule gratuite — aperçu des inclus
  gratuit: [
    "1 capsule active",
    "30 photos",
    "Participants illimités",
    "Tous les autres souvenirs illimités (messages, secrets, paris…)",
    "Vidéos et vocaux disponibles si le créateur achète un pack",
  ],
  // Packs one-shot (Weekend, Soirée, Voyage, EVG partagent les mêmes inclus)
  occasion: [
    "150 photos",
    "20 vidéos de 20 secondes",
    "10 messages vocaux de 20 secondes",
    "50 participants",
    "Messages illimités",
    "Ouverture avec animations premium",
    "Lien cliquable + code à partager aux invités",
  ],
  // Pack Mariage — quota plus généreux, participants illimités
  mariage: [
    "500 photos",
    "50 vidéos de 20 secondes",
    "30 messages vocaux de 20 secondes",
    "Participants illimités",
    "QR codes invités imprimables pour les tables",
    "Messages illimités",
    "Ouverture avec animations premium",
  ],
  // Pack Naissance — quotas mensuels renouvelés le 1er du mois
  naissance: [
    "40 photos par mois",
    "4 vidéos de 20 secondes par mois",
    "4 messages vocaux de 20 secondes par mois",
    "Participants illimités",
    "Messages illimités",
    "Impression optionnelle",
    "Résiliable à tout moment",
  ],
  // Pack Mamie/Papy — mêmes quotas + interface simplifiée
  papy: [
    "30 photos par mois",
    "4 vidéos de 20 secondes par mois",
    "4 messages vocaux de 20 secondes par mois",
    "Interface ultra-simplifiée pour vos proches",
    "Participants illimités",
    "Messages illimités",
    "Impression optionnelle",
    "Résiliable à tout moment",
  ],
};

// ============================================================================
//  BLOC CODE PROMO — réutilisé dans tous les drawers d'achat
// ============================================================================
function BlocCodePromo({ showPromo, setShowPromo, codePromo, setCodePromo,
  promoValide, remisePromo, promoChargement, onAppliquer }) {
  return (
    <div style={{ marginBottom: 10 }}>
      {!showPromo ? (
        <button onClick={() => setShowPromo(true)}
          style={{ background: "none", border: "none", color: COULEURS.doux,
            fontSize: 12, cursor: "pointer", padding: 0,
            fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
          🏷️ J'ai un code promo
        </button>
      ) : (
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={codePromo}
            onChange={e => setCodePromo(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === "Enter" && onAppliquer()}
            placeholder="CODE PROMO"
            style={{ flex: 1, padding: "8px 12px", borderRadius: 10,
              border: `1.5px solid ${promoValide === true ? "#22C55E" : promoValide === false ? "#EF4444" : COULEURS.bordure}`,
              background: "var(--input-bg)", fontSize: 13, fontWeight: 600,
              textTransform: "uppercase", outline: "none", color: COULEURS.encre }}
          />
          <button onClick={onAppliquer} disabled={!codePromo.trim() || promoChargement}
            style={{ flexShrink: 0, padding: "8px 14px", borderRadius: 10,
              background: DEGRADE, border: "none", color: "#fff",
              fontWeight: 700, fontSize: 12, cursor: "pointer", opacity: promoChargement ? 0.6 : 1 }}>
            {promoChargement ? "…" : "Appliquer"}
          </button>
        </div>
      )}
      {promoValide === true && remisePromo > 0 && (
        <div style={{ fontSize: 12, color: "#22C55E", fontWeight: 700, marginTop: 5 }}>
          ✓ Code valide — {remisePromo === 100 ? "100% de réduction (gratuit 🎉)" : `${remisePromo}% de réduction`}
        </div>
      )}
      {promoValide === false && (
        <div style={{ fontSize: 12, color: "#EF4444", marginTop: 5 }}>
          Code invalide ou expiré
        </div>
      )}
    </div>
  );
}

// ============================================================================
//  BACK OFFICE — gestion des codes promo
// ============================================================================
function EcranAdmin({ allerVers }) {
  const [codes,        setCodes]        = useState([]);
  const [chargement,   setChargement]   = useState(true);
  const [nouveau,      setNouveau]      = useState({ code: "", pourcentage: 20, max: "", expire: "" });
  const [creation,     setCreation]     = useState(false);
  const [erreur,       setErreur]       = useState(null);

  React.useEffect(() => { chargerCodes(); }, []);

  async function chargerCodes() {
    setChargement(true);
    const { data } = await supabase
      .from("codes_promo")
      .select("*")
      .order("created_at", { ascending: false });
    setCodes(data || []);
    setChargement(false);
  }

  async function creerCode() {
    const code = nouveau.code.trim().toUpperCase();
    if (!code) { setErreur("Le code ne peut pas être vide."); return; }
    const pct = parseInt(nouveau.pourcentage, 10);
    if (isNaN(pct) || pct < 5 || pct > 100) { setErreur("Le pourcentage doit être entre 5 et 100."); return; }
    setCreation(true); setErreur(null);
    const body = {
      code,
      pourcentage: pct,
      utilisations_max: nouveau.max ? parseInt(nouveau.max, 10) : null,
      expire_at:        nouveau.expire ? new Date(nouveau.expire).toISOString() : null,
      actif:            true,
    };
    const { error } = await supabase.from("codes_promo").insert(body);
    if (error) { setErreur(error.message); setCreation(false); return; }
    setNouveau({ code: "", pourcentage: 20, max: "", expire: "" });
    await chargerCodes();
    setCreation(false);
  }

  async function toggleActif(c) {
    await supabase.from("codes_promo").update({ actif: !c.actif }).eq("id", c.id);
    chargerCodes();
  }

  async function supprimerCode(id) {
    if (!confirm("Supprimer ce code ?")) return;
    await supabase.from("codes_promo").delete().eq("id", id);
    chargerCodes();
  }

  const S2 = {
    label: { fontSize: 12, fontWeight: 700, color: COULEURS.doux, marginBottom: 4, display: "block", textTransform: "uppercase", letterSpacing: ".05em" },
    input: { width: "100%", padding: "9px 12px", borderRadius: 10, border: `1.5px solid ${COULEURS.bordure}`, background: "var(--input-bg)", fontSize: 13, color: COULEURS.encre, outline: "none", boxSizing: "border-box" },
  };

  return (
    <div style={S.ecran}>
      <EnTeteRetour titre="Back office — Codes promo" onRetour={() => allerVers("profil")} />

      {/* Formulaire création */}
      <div style={{ background: "var(--carte-bg)", borderRadius: 18, padding: "16px 16px",
        boxShadow: "0 4px 14px rgba(46,34,48,.07)", marginBottom: 18 }}>
        <div style={{ fontWeight: 800, fontSize: 15, color: COULEURS.encre, marginBottom: 12 }}>
          ➕ Nouveau code
        </div>

        <label style={S2.label}>Code</label>
        <input style={{ ...S2.input, marginBottom: 10, textTransform: "uppercase", fontWeight: 700 }}
          value={nouveau.code} placeholder="EX : BLOOOM50"
          onChange={e => setNouveau(n => ({ ...n, code: e.target.value.toUpperCase() }))} />

        <label style={S2.label}>Réduction (%)</label>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
          <input type="range" min="5" max="100" step="5"
            value={nouveau.pourcentage}
            onChange={e => setNouveau(n => ({ ...n, pourcentage: e.target.value }))}
            style={{ flex: 1 }} />
          <div style={{ fontWeight: 900, fontSize: 18, color: COULEURS.corail, minWidth: 50, textAlign: "right" }}>
            {nouveau.pourcentage}%{parseInt(nouveau.pourcentage) === 100 ? " 🎉" : ""}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={S2.label}>Utilisations max</label>
            <input style={S2.input} type="number" min="1" placeholder="Illimité"
              value={nouveau.max}
              onChange={e => setNouveau(n => ({ ...n, max: e.target.value }))} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={S2.label}>Expiration</label>
            <input style={S2.input} type="date"
              value={nouveau.expire}
              onChange={e => setNouveau(n => ({ ...n, expire: e.target.value }))} />
          </div>
        </div>

        {erreur && <div style={{ fontSize: 12, color: "#EF4444", marginBottom: 8 }}>{erreur}</div>}

        <button onClick={creerCode} disabled={creation || !nouveau.code.trim()}
          style={{ ...S.boutonPrincipal, marginTop: 0, opacity: creation || !nouveau.code.trim() ? 0.6 : 1 }}>
          {creation ? "Création…" : "Créer le code"}
        </button>
      </div>

      {/* Liste des codes */}
      <div style={{ fontSize: 12, fontWeight: 800, color: COULEURS.doux,
        letterSpacing: ".04em", textTransform: "uppercase", marginBottom: 10 }}>
        {chargement ? "Chargement…" : `${codes.length} code${codes.length !== 1 ? "s" : ""}`}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {codes.map(c => (
          <div key={c.id} style={{ background: "var(--carte-bg)", borderRadius: 16, padding: "12px 14px",
            boxShadow: "0 2px 8px rgba(46,34,48,.05)",
            border: c.actif ? "none" : `1.5px solid ${COULEURS.bordure}`,
            opacity: c.actif ? 1 : 0.55 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: COULEURS.encre,
                fontFamily: "monospace", letterSpacing: ".05em" }}>
                {c.code}
              </div>
              <div style={{ fontWeight: 900, fontSize: 16, color: COULEURS.corail }}>
                {c.pourcentage}%{c.pourcentage === 100 ? " 🎉" : ""}
              </div>
            </div>
            <div style={{ fontSize: 11, color: COULEURS.doux, marginBottom: 8 }}>
              {c.utilisations_actuelles || 0} utilisation{(c.utilisations_actuelles || 0) !== 1 ? "s" : ""}
              {c.utilisations_max ? ` / ${c.utilisations_max}` : " (illimité)"}
              {c.expire_at ? ` · expire le ${new Date(c.expire_at).toLocaleDateString("fr-FR")}` : ""}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => toggleActif(c)}
                style={{ flex: 1, padding: "6px 0", borderRadius: 10, border: "none",
                  background: c.actif ? "#ECFDF5" : "#FEF2F2",
                  color: c.actif ? "#059669" : "#DC2626",
                  fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                {c.actif ? "✓ Actif" : "✗ Inactif"}
              </button>
              <button onClick={() => supprimerCode(c.id)}
                style={{ padding: "6px 14px", borderRadius: 10, border: "none",
                  background: "#FEF2F2", color: "#DC2626",
                  fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                🗑
              </button>
            </div>
          </div>
        ))}
        {!chargement && codes.length === 0 && (
          <div style={{ textAlign: "center", color: COULEURS.doux, fontSize: 13, padding: "20px 0" }}>
            Aucun code promo pour l'instant
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
//  BADGES & NIVEAUX — affichage du profil de gamification
// ============================================================================
function EcranBadges({ gami, allerVers }) {
  const g = gami || GAMI_VIDE;
  const niveauActuel   = NIVEAUX.find(n => n.niveau === g.niveau) || NIVEAUX[0];
  const niveauSuivant  = NIVEAUX.find(n => n.niveau === g.niveau + 1) || null;
  const progression    = niveauSuivant
    ? Math.min(100, ((g.points_total - niveauActuel.min) / (niveauSuivant.min - niveauActuel.min)) * 100)
    : 100;

  return (
    <div style={{ ...S.ecran, padding: "0 0 96px", gap: 0 }}>
      <EnTeteRetour titre="Mes badges &amp; niveau" onRetour={() => allerVers("profil")} />

      <div style={{ padding: "0 20px" }}>
        {/* ── Carte niveau ─────────────────────────────────────── */}
        <div style={{ background: "linear-gradient(135deg,#667eea,#764ba2)", borderRadius: 20,
          padding: "20px 20px 18px", marginBottom: 16, color: "#fff" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
            <span style={{ fontSize: 44, lineHeight: 1 }}>{niveauActuel.emoji}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, opacity: 0.75, textTransform: "uppercase", letterSpacing: 1 }}>
                Niveau {niveauActuel.niveau}
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'Bricolage Grotesque',sans-serif",
                lineHeight: 1.2 }}>
                {niveauActuel.nom}
              </div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontSize: 32, fontWeight: 800, lineHeight: 1 }}>{g.points_total}</div>
              <div style={{ fontSize: 11, opacity: 0.75 }}>points</div>
            </div>
          </div>

          {niveauSuivant ? (
            <>
              <div style={{ background: "rgba(255,255,255,0.25)", borderRadius: 100, height: 7,
                overflow: "hidden", marginBottom: 6 }}>
                <div style={{ background: "#fff", height: "100%", borderRadius: 100,
                  width: `${progression}%`, transition: "width 0.8s cubic-bezier(.25,.46,.45,.94)" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, opacity: 0.8 }}>
                <span>{g.points_total} pts</span>
                <span>{niveauSuivant.min} pts → {niveauSuivant.emoji} {niveauSuivant.nom}</span>
              </div>
            </>
          ) : (
            <div style={{ textAlign: "center", fontSize: 13, fontWeight: 700, marginTop: 4 }}>
              🏆 Niveau maximum atteint !
            </div>
          )}
        </div>

        {/* ── Récompense du niveau actuel ───────────────────────── */}
        {niveauActuel.recompense && (
          <div style={{ background: "var(--carte-bg)", borderRadius: 16, padding: "13px 16px",
            marginBottom: 20, display: "flex", gap: 12, alignItems: "center",
            boxShadow: "0 2px 10px rgba(46,34,48,0.07)" }}>
            <span style={{ fontSize: 26, flexShrink: 0 }}>🎁</span>
            <div>
              <div style={{ fontSize: 11, color: COULEURS.doux, marginBottom: 2 }}>Récompense débloquée</div>
              <div style={{ fontWeight: 700, color: COULEURS.encre, fontSize: 14 }}>
                {niveauActuel.recompense}
              </div>
            </div>
          </div>
        )}

        {/* ── Badges par catégorie ──────────────────────────────── */}
        {BADGES_DEF.map(cat => {
          const valeur = g[cat.cle] || 0;
          return (
            <div key={cat.cle} style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: COULEURS.doux,
                marginBottom: 10, display: "flex", alignItems: "center", gap: 6,
                textTransform: "uppercase", letterSpacing: 0.5 }}>
                <span>{cat.emoji}</span> {cat.categorie}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {cat.paliers.map(palier => {
                  const ok = valeur >= palier.seuil;
                  return (
                    <div key={palier.slug} style={{
                      background: "var(--carte-bg)", borderRadius: 14,
                      padding: "12px 14px", display: "flex", alignItems: "center", gap: 12,
                      opacity: ok ? 1 : 0.45,
                      border: `1.5px solid ${ok ? COULEURS.corail + "35" : "transparent"}`,
                      boxShadow: ok ? "0 2px 8px rgba(255,107,94,0.10)" : "none",
                    }}>
                      <div style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                        background: ok
                          ? `linear-gradient(135deg,${COULEURS.corail},#ff9a7b)`
                          : "rgba(150,150,150,0.15)",
                        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>
                        {ok ? cat.emoji : "🔒"}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 14,
                          color: ok ? COULEURS.encre : COULEURS.doux }}>
                          {palier.nom}
                        </div>
                        <div style={{ fontSize: 12, color: COULEURS.doux, marginTop: 2 }}>
                          {ok
                            ? `✓ Débloqué — ${palier.seuil} ${cat.label}${palier.seuil > 1 ? "s" : ""}`
                            : `Il te manque ${palier.seuil - valeur} ${cat.label}${palier.seuil - valeur > 1 ? "s" : ""}`}
                        </div>
                      </div>
                      {ok && <span style={{ fontSize: 18, flexShrink: 0 }}>✅</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Toast affiché quand un niveau ou un badge est débloqué
function GamiToast({ unlock, onFermer }) {
  React.useEffect(() => {
    const t = setTimeout(onFermer, 4500);
    return () => clearTimeout(t);
  }, [onFermer]);

  const infosNiveau = unlock?.type === "niveau" ? NIVEAUX.find(n => n.niveau === unlock.niveau) : null;
  const premierBadge = unlock?.type === "badge" ? unlock.badges[0] : null;

  return (
    <div style={{ position: "absolute", top: 60, left: 12, right: 12, zIndex: 450,
      animation: "fadeSlideUp 0.4s cubic-bezier(0.34,1.56,0.64,1) both" }}>
      <div style={{ background: "linear-gradient(135deg,#667eea,#764ba2)", borderRadius: 18,
        padding: "14px 14px 14px 16px", color: "#fff",
        display: "flex", alignItems: "center", gap: 12,
        boxShadow: "0 8px 32px rgba(102,126,234,0.45)" }}>
        <span style={{ fontSize: 34, flexShrink: 0, lineHeight: 1 }}>
          {unlock?.type === "niveau" ? (infosNiveau?.emoji || "🌟") : (premierBadge?.emoji || "🏅")}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          {unlock?.type === "niveau" ? (
            <>
              <div style={{ fontWeight: 800, fontSize: 15 }}>Niveau supérieur !</div>
              <div style={{ fontSize: 13, opacity: 0.9, marginTop: 2 }}>
                Tu es maintenant {infosNiveau?.nom} {infosNiveau?.emoji}
                {infosNiveau?.recompense && ` — ${infosNiveau.recompense}`}
              </div>
            </>
          ) : (
            <>
              <div style={{ fontWeight: 800, fontSize: 15 }}>Nouveau badge débloqué !</div>
              <div style={{ fontSize: 13, opacity: 0.9, marginTop: 2 }}>
                {premierBadge?.nom}
                {unlock.badges.length > 1 && ` +${unlock.badges.length - 1} autre${unlock.badges.length > 2 ? "s" : ""}`}
              </div>
            </>
          )}
        </div>
        <button onClick={onFermer} style={{ background: "rgba(255,255,255,0.22)", border: "none",
          borderRadius: 8, padding: "5px 9px", color: "#fff", cursor: "pointer", fontSize: 13,
          flexShrink: 0 }}>
          ✕
        </button>
      </div>
    </div>
  );
}

function EcranCreer({ moi, capsules, allerVers, creerCapsule, onPaywall, ecranPrecedent }) {
  // Pack ouvert dans le drawer (null = drawer fermé)
  const [drawerPack,  setDrawerPack]  = useState(null);
  // Champs de personnalisation dans le drawer
  const [nomCapsule,       setNomCapsule]       = useState("");
  const [destination,      setDestination]      = useState("");
  const [prenomBebe,       setPrenomBebe]       = useState("");
  const [prenom,           setPrenom]           = useState("");
  const [chargement,       setChargement]       = useState(false);
  const [showPromo,        setShowPromo]        = useState(false);
  const [codePromo,        setCodePromo]        = useState("");
  const [promoValide,      setPromoValide]      = useState(null); // null | true | false
  const [remisePromo,      setRemisePromo]      = useState(0);
  const [promoChargement,  setPromoChargement]  = useState(false);

  // Compte uniquement les capsules gratuites actives — les packs payants n'entrent pas dans ce quota
  const nbActives = capsules.filter(c => c.createurId === moi?.id && !c.ouverte && c.formule === "gratuit").length;
  const { peut: peutGratuit } = peutCreerCapsuleGratuite(nbActives);

  // Ouvre le drawer pour un pack donné et pré-remplit le nom par défaut
  function ouvrirDrawer(pack) {
    setDrawerPack(pack);
    setNomCapsule(pack.nomDefault ? pack.nomDefault("") : "");
    setDestination(""); setPrenomBebe(""); setPrenom("");
  }
  // Ferme le drawer sans agir
  function fermerDrawer() {
    setDrawerPack(null); setNomCapsule("");
    setShowPromo(false); setCodePromo(""); setPromoValide(null); setRemisePromo(0);
  }

  // Valide un code promo contre la table codes_promo
  async function appliquerPromo() {
    const code = codePromo.trim().toUpperCase();
    if (!code) return;
    setPromoChargement(true);
    setPromoValide(null);
    try {
      const { data } = await supabase
        .from("codes_promo")
        .select("pourcentage, actif, expire_at, utilisations_max, utilisations_actuelles")
        .eq("code", code)
        .single();
      if (!data || !data.actif) { setPromoValide(false); return; }
      if (data.expire_at && new Date(data.expire_at) < new Date()) { setPromoValide(false); return; }
      if (data.utilisations_max !== null && data.utilisations_actuelles >= data.utilisations_max) {
        setPromoValide(false); return;
      }
      setRemisePromo(data.pourcentage);
      setPromoValide(true);
    } catch { setPromoValide(false); }
    finally { setPromoChargement(false); }
  }

  function prixReduit(centimes, remise) {
    if (!remise) return null;
    return ((centimes / 100) * (1 - remise / 100)).toFixed(2) + "€";
  }

  // Redirige vers Stripe Checkout via l'Edge Function
  async function acheterPack(stripeType, formule) {
    if (!drawerPack) return;
    setChargement(true);
    const nomFinal = destination.trim()
      ? `Voyage à ${destination.trim()}`
      : prenomBebe.trim()
        ? prenomBebe.trim()
        : prenom.trim()
          ? drawerPack.nomDefault?.(prenom.trim()) || prenom.trim()
          : nomCapsule.trim() || drawerPack.nomDefault?.("") || "Ma capsule";
    try {
      const body = {
        type:         stripeType,
        user_id:      moi?.id,
        capsule_data: { nom: nomFinal, type: drawerPack.type || "amis", formule },
        success_url:  `${window.location.origin}?checkout=success&pack=${formule}`,
        cancel_url:   `${window.location.origin}?checkout=cancelled`,
      };
      if (promoValide && codePromo.trim()) body.promo_code = codePromo.trim().toUpperCase();
      const { data, error } = await supabase.functions.invoke("create-checkout-session", { body });
      if (error || !data?.url) throw new Error(error?.message || "Erreur");
      window.location.href = data.url;
    } catch (e) {
      alert("Impossible d'accéder au paiement : " + e.message);
      setChargement(false);
    }
  }

  // Ouvre le drawer Gratuit — la création se fait depuis le CTA dans le drawer
  function ouvrirDrawerGratuit() {
    if (!peutGratuit) { onPaywall?.("capsule_limite_gratuit"); return; }
    ouvrirDrawer({
      id: "gratuit", icone: "🌱", nom: "Capsule gratuite",
      categorie: "gratuit", nomDefault: () => "Ma capsule",
    });
  }

  return (
    <div style={{ ...S.ecran, position: "relative", overflow: "hidden" }}>
      {/* Contenu principal — assombri quand le drawer est ouvert */}
      <div style={{
        overflowY: "auto", height: "100%", paddingBottom: 24,
        filter: drawerPack ? "brightness(0.55)" : "none",
        transition: "filter 0.25s ease",
        pointerEvents: drawerPack ? "none" : "auto",
      }}>
        {/* En-tête compact */}
        <div style={{ padding: "10px 20px 6px" }}>
          {ecranPrecedent && !["capsules", "profil"].includes(ecranPrecedent) && (
            <button onClick={() => allerVers(ecranPrecedent)}
              style={{ background: "none", border: "none", cursor: "pointer", padding: "0 0 6px",
                display: "flex", alignItems: "center", gap: 6,
                color: COULEURS.doux, fontSize: 13, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              ← Retour
            </button>
          )}
          <h1 style={{ ...S.titrePage, margin: 0, fontSize: 17 }}>Profitez de plus de souvenirs ✨</h1>
        </div>

        {/* ── Section "Pour toi" ── */}
        <div style={{ padding: "0 20px", marginBottom: 8 }}>
          <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700,
            fontSize: 13, color: COULEURS.encre, marginBottom: 6 }}>Pour toi 🎉</div>

          {/* Pack Inoubliable */}
          <button
            onClick={() => ouvrirDrawer({
              id: "occasion", icone: "🎉", nom: "Pack Inoubliable",
              gradient: "linear-gradient(135deg,#3730a3,#7c3aed)",
              nomDefault: () => "Notre moment",
              categorie: "occasion", type: "amis",
            })}
            style={{
              position: "relative", width: "100%", borderRadius: 16,
              background: "linear-gradient(135deg, #3730a3 0%, #7c3aed 100%)",
              border: "none", cursor: "pointer",
              padding: "11px 16px", marginBottom: 8,
              display: "flex", alignItems: "center", gap: 14,
              boxShadow: "0 6px 20px rgba(109,40,217,0.40)",
              boxSizing: "border-box",
            }}>
            <div style={{ fontSize: 32, lineHeight: 1, flexShrink: 0 }}>🎉</div>
            <div style={{ flex: 1, textAlign: "left" }}>
              <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 800,
                fontSize: 15, color: "#fff" }}>Pack Inoubliable</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.80)", marginTop: 3 }}>
                Weekend · Soirée · Voyage · EVJF · EVG
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", marginTop: 3 }}>
                150 photos · 20 vidéos · 10 vocaux
              </div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 900,
                fontSize: 20, color: "#fff" }}>9,99€</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.65)" }}>one-shot</div>
            </div>
          </button>

          {/* Pack Mariage */}
          <button
            onClick={() => ouvrirDrawer({
              id: "mariage", icone: "💍", nom: "Pack Mariage", type: "mariage",
              gradient: "linear-gradient(135deg,#FF5C9D,#FFC436)",
              nomDefault: () => "Notre mariage", categorie: "mariage",
              pleinePage: true,
            })}
            style={{
              position: "relative", width: "100%",
              background: "linear-gradient(135deg,#FF5C9D 0%,#FF8A3D 50%,#FFC436 100%)",
              borderRadius: 16, padding: "11px 16px",
              border: "none", cursor: "pointer",
              display: "flex", alignItems: "center", gap: 14,
              boxShadow: "0 6px 20px rgba(255,92,157,0.35)",
              boxSizing: "border-box",
            }}>
            <div style={{ position: "absolute", top: -8, right: 14,
              background: "#fff", color: "#FF5C9D", borderRadius: 999,
              padding: "2px 10px", fontSize: 10, fontWeight: 800,
              boxShadow: "0 2px 6px rgba(0,0,0,0.12)" }}>
              Le plus complet ✨
            </div>
            <div style={{ fontSize: 32, lineHeight: 1, flexShrink: 0 }}>💍</div>
            <div style={{ flex: 1, textAlign: "left" }}>
              <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 800,
                fontSize: 15, color: "#fff" }}>Pack Mariage</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.85)", marginTop: 3 }}>
                500 photos · 50 vidéos · 30 vocaux
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.60)", marginTop: 3 }}>
                Participants illimités · QR codes invités
              </div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 900,
                fontSize: 20, color: "#fff" }}>29,99€</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.65)" }}>one-shot</div>
            </div>
          </button>
        </div>

        {/* ── Section "À offrir" ── */}
        <div style={{ padding: "0 20px", marginBottom: 16 }}>
          <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700,
            fontSize: 13, color: COULEURS.encre, marginBottom: 6 }}>À offrir 💛</div>

          {/* Pack Mamie/Papy */}
          <button
            onClick={() => ouvrirDrawer({
              id: "papy", icone: "👴", nom: "Mamie / Papy", type: "papy",
              champPrenom: true, nomDefault: (p) => p ? `Capsule de ${p}` : "Mamie & Papy",
              categorie: "recurrent", pleinePage: true,
              gradient: "linear-gradient(135deg,#FFFBEB,#FDE68A)",
            })}
            style={{
              width: "100%",
              background: "linear-gradient(135deg,#FFFBEB 0%,#FEF3C7 60%,#FDE68A 100%)",
              borderRadius: 18, border: "1.5px solid #FDE68A",
              cursor: "pointer", padding: "14px 16px",
              display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8,
              boxSizing: "border-box", textAlign: "left",
              boxShadow: "0 4px 16px rgba(251,191,36,0.22)",
            }}>
            <div style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 24 }}>👵👴</span>
                <div>
                  <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 800,
                    fontSize: 15, color: "#92400E" }}>Pack Mamie / Papy</div>
                  <div style={{ fontSize: 11, color: "#B45309",
                    fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                    Abonnement mensuel · résiliable
                  </div>
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 900,
                  fontSize: 19, color: "#92400E" }}>4,99€</div>
                <div style={{ fontSize: 10, color: "#B45309" }}>/mois</div>
              </div>
            </div>
            <div style={{ fontSize: 11, color: "#B45309", lineHeight: 1.45,
              fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              Une fenêtre sur votre vie pour que Mamie et Papy ne ratent rien — interface ultra-simplifiée.
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {["30 photos/mois", "4 vidéos/mois", "4 vocaux/mois", "Interface simplifiée"].map((t, i) => (
                <span key={i} style={{ background: "rgba(146,64,14,0.1)", color: "#92400E",
                  borderRadius: 99, padding: "2px 8px", fontSize: 10, fontWeight: 600,
                  fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{t}</span>
              ))}
            </div>
            <div style={{ width: "100%", background: "#92400E", borderRadius: 10,
              padding: "9px 0", textAlign: "center",
              fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700,
              fontSize: 13, color: "#fff" }}>
              Découvrir ce pack →
            </div>
          </button>
        </div>
      </div>

      {/* ── Plein écran pour Papy/Naissance ── */}
      {drawerPack?.pleinePage && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 400,
          background: "var(--carte-bg)",
          display: "flex", flexDirection: "column",
          animation: "slideUp 0.28s ease",
        }}>
          {/* ── MARIAGE : bandeau pleine largeur rose/doré ── */}
          {drawerPack.id === "mariage" ? (<>
            <div style={{
              background: "linear-gradient(160deg,#4a0020 0%,#9d1a4e 40%,#c2185b 70%,#e91e8c 100%)",
              padding: "44px 20px 24px", position: "relative", overflow: "hidden",
            }}>
              <button onClick={fermerDrawer} style={{
                position: "absolute", top: 12, left: 16,
                background: "rgba(255,255,255,0.2)", border: "none", borderRadius: 999,
                padding: "5px 13px", fontSize: 12, fontWeight: 700,
                color: "#fff", cursor: "pointer",
              }}>← Retour</button>
              <div style={{ position: "absolute", top: -10, right: -10, fontSize: 80, opacity: 0.07, lineHeight: 1 }}>💍</div>

              {/* Ligne emoji + prix côte à côte */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ fontSize: 42, lineHeight: 1 }}>💍</div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 900,
                    fontSize: 26, color: "#FFD700", lineHeight: 1 }}>29,99€</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.60)", marginTop: 2 }}>paiement unique</div>
                </div>
              </div>
              {/* Titre + tagline */}
              <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 800,
                fontSize: 22, color: "#fff", letterSpacing: "-0.3px", marginBottom: 6 }}>Pack Mariage</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.72)",
                fontFamily: "'Plus Jakarta Sans', sans-serif", lineHeight: 1.5 }}>
                Immortalisez le plus beau jour de votre vie — chaque photo, chaque émotion, scellées pour toujours.
              </div>
            </div>

            <div className="scrollbar-pack" style={{ flex: 1, overflowY: "auto", padding: "20px 20px 0" }}>

              {/* Badge "Le plus complet" */}
              <div style={{ display: "flex", alignItems: "center", gap: 10,
                background: "linear-gradient(135deg,#fff0f5,#ffe4ef)", borderRadius: 14,
                padding: "10px 14px", marginBottom: 18, border: "1.5px solid #ffb3d0" }}>
                <span style={{ fontSize: 20 }}>✨</span>
                <div>
                  <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700,
                    fontSize: 13, color: "#9d1a4e" }}>Le pack le plus complet de Blooom</div>
                  <div style={{ fontSize: 11, color: "#c2185b", marginTop: 1,
                    fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                    Conçu pour les grands moments d'une vie
                  </div>
                </div>
              </div>

              {/* Ce qui est inclus */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700,
                  fontSize: 15, color: COULEURS.encre, marginBottom: 12 }}>Ce qui est inclus</div>
                {(INCLUS_PAR_PACK.mariage || []).map((item, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 10 }}>
                    <span style={{ fontSize: 15, color: "#c2185b", flexShrink: 0 }}>✓</span>
                    <span style={{ fontSize: 13, color: COULEURS.encre, lineHeight: "20px",
                      fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{item}</span>
                  </div>
                ))}
              </div>

              {/* Comment ça fonctionne */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700,
                  fontSize: 15, color: COULEURS.encre, marginBottom: 12 }}>Comment ça fonctionne</div>
                {[
                  { emoji: "💳", texte: "Vous achetez le pack une seule fois — la capsule est créée instantanément." },
                  { emoji: "💌", texte: "Partagez le lien ou le QR code à vos invités : ils déposent photos, vidéos et vocaux depuis leur téléphone." },
                  { emoji: "📸", texte: "500 photos, 50 vidéos, 30 messages vocaux — de quoi capturer chaque instant de la journée." },
                  { emoji: "🔒", texte: "La capsule reste scellée aussi longtemps que vous le souhaitez — ouvrez-la à votre anniversaire, dans 1 an, 10 ans…" },
                  { emoji: "💝", texte: "À l'ouverture, revivez ensemble chaque émotion, chaque surprise, chaque discours." },
                ].map((etape, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
                    <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{etape.emoji}</span>
                    <span style={{ fontSize: 13, color: COULEURS.encre, lineHeight: 1.5,
                      fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{etape.texte}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ padding: "12px 20px 20px", borderTop: `1px solid ${COULEURS.bordure}` }}>
              <BlocCodePromo
                showPromo={showPromo} setShowPromo={setShowPromo}
                codePromo={codePromo} setCodePromo={v => { setCodePromo(v); setPromoValide(null); }}
                promoValide={promoValide} remisePromo={remisePromo}
                promoChargement={promoChargement} onAppliquer={appliquerPromo} />
              <button disabled={chargement}
                onClick={() => acheterPack("pack_mariage", "mariage")}
                style={{ width: "100%", padding: "14px 0", borderRadius: 16, border: "none",
                  background: "linear-gradient(135deg,#9d1a4e,#c2185b)",
                  color: "#fff", fontWeight: 800, fontSize: 15, cursor: chargement ? "default" : "pointer",
                  fontFamily: "'Bricolage Grotesque', sans-serif", opacity: chargement ? 0.6 : 1,
                  boxShadow: "0 4px 16px rgba(157,26,78,0.4)" }}>
                {chargement ? "Redirection…"
                  : promoValide && remisePromo === 100 ? "💍 Pack Mariage — Gratuit 🎉"
                  : promoValide && remisePromo > 0 ? `💍 Acheter le Pack Mariage — ${prixReduit(2999, remisePromo)}`
                  : "💍 Acheter le Pack Mariage — 29,99€"}
              </button>
              <p style={{ textAlign: "center", fontSize: 10, color: COULEURS.doux, margin: "8px 0 0" }}>
                🔐 Stripe · Paiement unique · Accès immédiat
              </p>
            </div>
          </>) : (<>

          {/* ── PAPY / autres : bandeau coloré ── */}
          <div style={{
            background: drawerPack.gradient || DEGRADE,
            padding: "36px 20px 12px",
            display: "flex", flexDirection: "column", alignItems: "center",
            position: "relative",
          }}>
            <button onClick={fermerDrawer} style={{
              position: "absolute", top: 10, left: 14,
              background: "rgba(255,255,255,0.3)", border: "none", borderRadius: 999,
              padding: "5px 12px", fontSize: 12, fontWeight: 700,
              color: COULEURS.encre, cursor: "pointer",
            }}>← Retour</button>

            <div style={{ fontSize: 36, marginBottom: 4 }}>{drawerPack.icone}</div>
            <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 800,
              fontSize: 18, color: COULEURS.encre, textAlign: "center" }}>{drawerPack.nom}</div>
            <div style={{ fontSize: 11, color: COULEURS.doux, textAlign: "center",
              marginTop: 3, fontFamily: "'Plus Jakarta Sans', sans-serif",
              lineHeight: 1.4, maxWidth: 260 }}>
              Une fenêtre sur votre vie pour que Mamie et Papy ne ratent rien 👵👴
            </div>
            <div style={{ marginTop: 4, fontFamily: "'Bricolage Grotesque', sans-serif",
              fontWeight: 900, fontSize: 22, color: COULEURS.encre }}>
              4,99€<span style={{ fontSize: 12, fontWeight: 600 }}>/mois</span>
            </div>
            <div style={{ fontSize: 10, color: COULEURS.doux, marginTop: 1 }}>
              ou 44,99€/an — économisez 15€
            </div>
          </div>

          <div className="scrollbar-pack" style={{ flex: 1, overflowY: "auto", padding: "20px 20px 0" }}>

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700,
                fontSize: 15, color: COULEURS.encre, marginBottom: 12 }}>Ce qui est inclus</div>
              {(INCLUS_PAR_PACK[drawerPack.id] || []).map((item, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
                  <span style={{ fontSize: 16, color: "#22C55E", flexShrink: 0 }}>✓</span>
                  <span style={{ fontSize: 14, color: COULEURS.encre, lineHeight: "22px",
                    fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{item}</span>
                </div>
              ))}
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700,
                fontSize: 15, color: COULEURS.encre, marginBottom: 12 }}>Comment ça fonctionne</div>
              {[
                { emoji: "📲", texte: "Vous souscrivez — une capsule est créée instantanément pour vos proches." },
                { emoji: "🖼️", texte: "Toute la famille y dépose photos, vidéos et messages vocaux tout au long du mois." },
                { emoji: "🔄", texte: "Le 1er de chaque mois, les quotas se renouvellent automatiquement." },
                { emoji: "👵👴", texte: "Mamie et Papy consultent les souvenirs depuis une interface ultra-simplifiée, sans rien à installer." },
                { emoji: "🔓", texte: "Résiliez à tout moment — vos souvenirs restent accessibles." },
              ].map((etape, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
                  <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{etape.emoji}</span>
                  <span style={{ fontSize: 13, color: COULEURS.encre, lineHeight: 1.5,
                    fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{etape.texte}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ padding: "10px 20px 18px", borderTop: `1px solid ${COULEURS.bordure}` }}>
            {/* Code promo */}
            <BlocCodePromo
              showPromo={showPromo} setShowPromo={setShowPromo}
              codePromo={codePromo} setCodePromo={v => { setCodePromo(v); setPromoValide(null); }}
              promoValide={promoValide} remisePromo={remisePromo}
              promoChargement={promoChargement} onAppliquer={appliquerPromo} />
            <button disabled={chargement}
              onClick={() => acheterPack(`pack_${drawerPack.id}_mensuel`, drawerPack.id)}
              style={{ ...S.boutonPrincipal, fontSize: 13, padding: "10px 16px", marginTop: 0, opacity: chargement ? 0.6 : 1 }}>
              {chargement ? "Redirection…" : promoValide && remisePromo === 100
                ? "Gratuit 🎉 — résiliable à tout moment"
                : promoValide && remisePromo > 0
                  ? `${prixReduit(499, remisePromo)}/mois — résiliable à tout moment`
                  : "4,99€/mois — résiliable à tout moment"}
            </button>
            <button disabled={chargement}
              onClick={() => acheterPack(`pack_${drawerPack.id}_annuel`, drawerPack.id)}
              style={{ ...S.boutonSecondaire, fontSize: 12, padding: "9px 16px", marginTop: 7 }}>
              {promoValide && remisePromo > 0
                ? `${prixReduit(4499, remisePromo)}/an — code appliqué`
                : "44,99€/an — économisez 15€"}
            </button>
            <p style={{ textAlign: "center", fontSize: 9, color: COULEURS.doux, margin: "7px 0 0" }}>
              🔐 Stripe · 🇪🇺 Europe · Annulation à tout moment
            </p>
          </div>
          </>)}
        </div>
      )}

      {/* ── Drawer 62% pour les autres packs (occasion, mariage, gratuit) ── */}
      {drawerPack && !drawerPack.pleinePage && (
        <div
          style={{ position: "absolute", inset: 0, zIndex: 400, background: "transparent" }}
          onClick={fermerDrawer}>
          <div
            style={{
              position: "absolute", bottom: 0, left: 0, right: 0,
              height: "62%",
              background: "var(--carte-bg)",
              borderRadius: "24px 24px 0 0",
              display: "flex", flexDirection: "column",
              boxShadow: "0 -12px 40px rgba(46,34,48,0.22)",
              animation: "slideUp 0.28s ease",
            }}
            onClick={e => e.stopPropagation()}>

            {/* Drag handle */}
            <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 4px" }}>
              <div style={{ width: 38, height: 4, borderRadius: 99, background: COULEURS.bordure }} />
            </div>

            {/* En-tête : icône + nom */}
            <div style={{ textAlign: "center", padding: "6px 20px 0" }}>
              <div style={{ fontSize: 36, marginBottom: 4 }}>{drawerPack.icone}</div>
              <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 800,
                fontSize: 18, color: COULEURS.encre }}>{drawerPack.nom}</div>
            </div>

            {/* Zone scrollable */}
            <div className="scrollbar-pack" style={{ flex: 1, overflowY: "auto", padding: "12px 20px 0" }}>
              <div style={{ marginBottom: 16 }}>
                {(INCLUS_PAR_PACK[
                  drawerPack.id === "gratuit" ? "gratuit"
                  : drawerPack.id === "mariage" ? "mariage"
                  : "occasion"
                ] || INCLUS_PAR_PACK.occasion).map((item, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
                    <span style={{ fontSize: 13, color: "#22C55E", flexShrink: 0, lineHeight: "20px" }}>✓</span>
                    <span style={{ fontSize: 13, color: COULEURS.encre, lineHeight: "20px",
                      fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{item}</span>
                  </div>
                ))}
              </div>

            </div>

            {/* CTAs */}
            <div style={{ padding: "12px 20px 22px", flexShrink: 0, borderTop: `1px solid ${COULEURS.bordure}` }}>
              {drawerPack.categorie !== "gratuit" && (
                <BlocCodePromo
                  showPromo={showPromo} setShowPromo={setShowPromo}
                  codePromo={codePromo} setCodePromo={v => { setCodePromo(v); setPromoValide(null); }}
                  promoValide={promoValide} remisePromo={remisePromo}
                  promoChargement={promoChargement} onAppliquer={appliquerPromo} />
              )}
              {drawerPack.categorie === "gratuit" ? (
                <button disabled={chargement}
                  onClick={async () => {
                    setChargement(true);
                    try {
                      const nom = nomCapsule.trim() || "Ma capsule";
                      await creerCapsule({ nom, type: "amis", dateOuverture: null, couverture: null });
                      fermerDrawer();
                    } catch (e) {
                      alert("Erreur : " + e.message);
                    } finally { setChargement(false); }
                  }}
                  style={{ ...S.boutonPrincipal, opacity: chargement ? 0.6 : 1 }}>
                  {chargement ? "Création…" : "Créer ma capsule →"}
                </button>
              ) : (
                <button disabled={chargement}
                  onClick={() => acheterPack(
                    drawerPack.id === "mariage" ? "pack_mariage" : "pack_occasion",
                    drawerPack.id === "mariage" ? "mariage" : "occasion"
                  )}
                  style={{ ...S.boutonPrincipal, opacity: chargement ? 0.6 : 1 }}>
                  {chargement ? "Redirection…"
                    : promoValide && remisePromo === 100 ? "Gratuit 🎉 →"
                    : promoValide && remisePromo > 0
                      ? `Payer ${prixReduit(drawerPack.id === "mariage" ? 2999 : 999, remisePromo)} →`
                      : `Payer ${drawerPack.id === "mariage" ? "29,99€" : "9,99€"} →`}
                </button>
              )}
              {drawerPack.categorie !== "gratuit" && (
                <p style={{ textAlign: "center", fontSize: 11, color: COULEURS.doux, margin: "10px 0 0" }}>
                  🔐 Stripe · 🇪🇺 Europe · Annulation à tout moment
                </p>
              )}
              <button onClick={fermerDrawer}
                style={{ display: "block", width: "100%", background: "none", border: "none",
                  color: COULEURS.doux, fontSize: 13, cursor: "pointer", marginTop: 8,
                  fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                Pas maintenant
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// !! Ancienne fonction EcranPacks conservée pour compat — renvoie null, plus utilisée
function EcranPacks({ moi, capsules, allerVers, creerCapsule, onPaywall }) {
  const [packChoisi,    setPackChoisi]    = useState(null);
  const [modalType,     setModalType]     = useState(null);
  const [nomCapsule,    setNomCapsule]    = useState("");
  const [destination,   setDestination]  = useState("");
  const [chargement,    setChargement]   = useState(false);

  function packInclus(pack) {
    return false;
  }

  // Gère le clic sur "Créer ce pack →"
  function cliquerPack(pack) {
    setPackChoisi(pack);
    setDestination("");

    // Pack Mamie/Papy réservé à Rituel — si abonné Plus mais pas Rituel
    if (pack.inclus === "rituel" && estPlus(moi) && !estRituel(moi)) {
      setModalType("achat");
      return;
    }

    if (estPlus(moi) || estRituel(moi)) {
      // Vérifie la limite de capsules actives avant d'ouvrir la modal de perso
      const actives = capsules.filter(c => c.createurId === moi?.id && !c.ouverte).length;
      if (!peutCreerCapsule(moi, actives)) {
        onPaywall && onPaywall("capsule_limite");
        setPackChoisi(null);
        return;
      }
      // Pré-remplit le nom selon le pack
      setNomCapsule(pack.nomDefault(""));
      setModalType("perso");
    } else {
      // Non abonné → modal d'achat
      setModalType("achat");
    }
  }

  // Crée la capsule et navigue vers l'écran d'invitation
  async function validerCreation() {
    if (!packChoisi || !nomCapsule.trim()) return;
    setChargement(true);
    try {
      const nom  = packChoisi.champDestination && destination.trim()
        ? packChoisi.nomDefault(destination.trim())
        : nomCapsule.trim();
      const capsuleId = await creerCapsule({
        nom,
        type:          packChoisi.typeCapsule,
        dateOuverture: packChoisi.dateOuverture(),
        couverture:    null,
      });
      fermerModals();
      // Redirige directement vers l'écran d'invitation pour partager le QR code immédiatement
      if (capsuleId) allerVers("inviter", capsuleId);
    } finally {
      setChargement(false);
    }
  }

  function fermerModals() { setModalType(null); setPackChoisi(null); setNomCapsule(""); setDestination(""); }

  // Lance une session Stripe Checkout pour l'achat one-shot d'un pack
  async function acheterPack(pack) {
    setChargement(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout-session", {
        body: {
          plan_id:     pack.stripeId,
          user_id:     moi?.id,
          success_url: `${window.location.origin}?checkout=success`,
          cancel_url:  `${window.location.origin}?checkout=cancelled`,
        },
      });
      if (error || !data?.url) throw new Error(error?.message || "Erreur");
      window.location.href = data.url;
    } catch (e) {
      alert("Impossible d'accéder au paiement : " + e.message);
      setChargement(false);
    }
  }

  return (
    <div style={S.ecran}>
      {/* ── En-tête ── */}
      <div style={S.enteteAccueil}>
        <p style={S.surtitre}>Catalogue</p>
        <h1 style={S.titrePage}>Packs prêts à l'emploi ✨</h1>
        <p style={{ fontSize: 13, color: COULEURS.doux, margin: "4px 0 0" }}>
          Tout est configuré. Créez en 30 secondes.
        </p>
      </div>

      {/* ── Bandeau abonnement ── */}
      {estPlus(moi) ? (
        <div style={{ background: "#E8F5E9", borderRadius: 14, padding: "10px 14px",
          display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <span style={{ fontSize: 18 }}>✅</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#2E7D32" }}>
            Ces packs sont inclus dans votre abonnement
          </span>
        </div>
      ) : (
        <div style={{ background: "linear-gradient(120deg,#FF8A3D18,#FF5C9D18)",
          border: `1px solid ${COULEURS.corail}28`, borderRadius: 14,
          padding: "12px 14px", marginBottom: 20 }}>
          <p style={{ fontSize: 12, color: COULEURS.encre, fontWeight: 600, margin: "0 0 8px" }}>
            🎁 Tous ces packs sont inclus avec Blooom Plus à 2,08€/mois
          </p>
          <button onClick={() => allerVers("abonnement")}
            style={{ background: DEGRADE, color: "#fff", border: "none", borderRadius: 10,
              padding: "8px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer",
              fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            Passer à Plus — 24,99€/an →
          </button>
        </div>
      )}

      {/* ── Cards des packs ── */}
      {PACKS_ECRAN.map(pack => {
        const inclus = packInclus(pack);
        return (
          <div key={pack.id} style={{ background: "var(--carte-bg)", borderRadius: 22,
            overflow: "hidden", marginBottom: 16,
            boxShadow: "0 6px 20px rgba(46,34,48,0.1)" }}>

            {/* Bandeau coloré en haut */}
            <div style={{ height: 120, background: pack.couleur,
              display: "flex", alignItems: "center", justifyContent: "center",
              position: "relative" }}>
              <span style={{ fontSize: 56, filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.2))" }}>
                {pack.icone}
              </span>
              {/* Badge spécial (ex. Rituel) */}
              {pack.badgeSpecial && (
                <div style={{ position: "absolute", top: 10, right: 12,
                  background: "rgba(255,255,255,0.22)", backdropFilter: "blur(6px)",
                  borderRadius: 999, padding: "3px 10px",
                  fontSize: 10, fontWeight: 800, color: "#fff" }}>
                  {pack.badgeSpecial}
                </div>
              )}
              {/* Badge "Inclus" si abonné */}
              {inclus && (
                <div style={{ position: "absolute", top: 10, left: 12,
                  background: "rgba(34,199,184,0.9)", borderRadius: 999,
                  padding: "3px 10px", fontSize: 10, fontWeight: 800, color: "#fff" }}>
                  ✓ Inclus
                </div>
              )}
            </div>

            {/* Corps de la card */}
            <div style={{ padding: "16px 16px 18px" }}>
              <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 800,
                fontSize: 18, color: COULEURS.encre, marginBottom: 4 }}>{pack.nom}</div>
              <p style={{ fontSize: 13, color: COULEURS.doux, margin: "0 0 14px",
                lineHeight: 1.4 }}>{pack.description}</p>

              {/* Avantages */}
              {pack.avantages.map((a, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 13, color: pack.couleur, fontWeight: 800, flexShrink: 0, marginTop: 1 }}>✓</span>
                  <span style={{ fontSize: 13, color: COULEURS.encre, lineHeight: 1.4 }}>{a}</span>
                </div>
              ))}

              {/* Ligne prix */}
              <div style={{ marginTop: 14, marginBottom: 12 }}>
                {inclus ? (
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#2E7D32" }}>
                    ✓ Inclus dans votre abonnement
                  </span>
                ) : (
                  <span style={{ fontSize: 12, color: COULEURS.doux }}>
                    <span style={{ fontWeight: 800, color: COULEURS.encre }}>{pack.prixLabel}</span>
                    {" · ou inclus avec "}
                    <span style={{ fontWeight: 700, color: COULEURS.corail }}>
                      {pack.inclus === "rituel" ? "Rituel à 49,99€/an" : "Plus à 24,99€/an"}
                    </span>
                  </span>
                )}
              </div>

              {/* CTA */}
              <button
                onClick={() => cliquerPack(pack)}
                style={{
                  width: "100%", padding: "13px 0", borderRadius: 14,
                  fontSize: 14, fontWeight: 700, cursor: "pointer",
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  ...(inclus
                    ? { background: DEGRADE, color: "#fff", border: "none",
                        boxShadow: "0 6px 18px rgba(255,92,157,0.35)" }
                    : { background: "transparent", color: pack.couleur,
                        border: `2px solid ${pack.couleur}` }),
                }}>
                Créer ce pack →
              </button>
            </div>
          </div>
        );
      })}

      {/* ── Modal achat (non abonné ou pack Rituel sans Rituel) ── */}
      {modalType === "achat" && packChoisi && (
        <div style={{ position: "absolute", inset: 0, zIndex: 400,
          background: "rgba(46,34,48,0.85)", backdropFilter: "blur(6px)",
          display: "flex", alignItems: "flex-end",
          animation: "fadeSlideUp 0.3s ease both" }}
          onClick={fermerModals}>
          <div style={{ background: "var(--carte-bg)", borderRadius: "28px 28px 20px 20px",
            padding: "28px 22px 28px", width: "100%",
            boxShadow: "0 -10px 40px rgba(46,34,48,0.25)" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div style={{ fontSize: 48, marginBottom: 8 }}>{packChoisi.icone}</div>
              <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 800,
                fontSize: 18, color: COULEURS.encre, marginBottom: 6 }}>
                {packChoisi.nom}
              </div>
              <p style={{ fontSize: 13, color: COULEURS.doux, margin: 0, lineHeight: 1.5 }}>
                {packChoisi.inclus === "rituel" && estPlus(moi)
                  ? "Ce pack est réservé à Blooom Rituel. Passez à Rituel pour en profiter."
                  : "Achetez ce pack à l'unité ou profitez de tous les packs avec Plus."}
              </p>
            </div>

            {/* Option 1 : acheter le pack seul */}
            <button onClick={() => acheterPack(packChoisi)} disabled={chargement}
              style={{ ...S.boutonPrincipal, marginTop: 0, opacity: chargement ? 0.6 : 1 }}>
              {chargement ? "Redirection…" : `Acheter ce pack — ${packChoisi.prixLabel}`}
            </button>

            {/* Option 2 : passer à Plus (ou Rituel si nécessaire) */}
            <button onClick={() => { fermerModals(); allerVers("abonnement"); }}
              style={{ ...S.boutonSecondaire, marginTop: 10, fontSize: 13 }}>
              {packChoisi.inclus === "rituel"
                ? "Passer à Blooom Rituel — 49,99€/an"
                : "Passer à Blooom Plus — 24,99€/an"}
            </button>

            <button onClick={fermerModals}
              style={{ display: "block", width: "100%", background: "none", border: "none",
                color: COULEURS.doux, fontSize: 13, cursor: "pointer", marginTop: 10,
                fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              Pas maintenant
            </button>
          </div>
        </div>
      )}

      {/* ── Modal personnalisation (abonné) ── */}
      {modalType === "perso" && packChoisi && (
        <div style={{ position: "absolute", inset: 0, zIndex: 400,
          background: "rgba(46,34,48,0.85)", backdropFilter: "blur(6px)",
          display: "flex", alignItems: "flex-end",
          animation: "fadeSlideUp 0.3s ease both" }}
          onClick={fermerModals}>
          <div style={{ background: "var(--carte-bg)", borderRadius: "28px 28px 20px 20px",
            padding: "24px 20px 28px", width: "100%",
            boxShadow: "0 -10px 40px rgba(46,34,48,0.25)" }}
            onClick={e => e.stopPropagation()}>

            {/* En-tête de la modal */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
              <div style={{ width: 48, height: 48, borderRadius: 14,
                background: packChoisi.couleur, display: "flex", alignItems: "center",
                justifyContent: "center", fontSize: 24, flexShrink: 0 }}>
                {packChoisi.icone}
              </div>
              <div>
                <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 800,
                  fontSize: 16, color: COULEURS.encre }}>Personnaliser le pack</div>
                <div style={{ fontSize: 12, color: COULEURS.doux, marginTop: 2 }}>{packChoisi.nom}</div>
              </div>
            </div>

            {/* Champ destination (Pack Voyage uniquement) */}
            {packChoisi.champDestination && (
              <>
                <label style={S.label}>Destination (optionnel)</label>
                <input style={S.input} placeholder="Ex. Barcelone, Japon…"
                  value={destination} onChange={e => {
                    setDestination(e.target.value);
                    setNomCapsule(packChoisi.nomDefault(e.target.value));
                  }} />
              </>
            )}

            {/* Nom de la capsule pré-rempli */}
            <label style={S.label}>Nom de la capsule</label>
            <input style={S.input} value={nomCapsule}
              onChange={e => setNomCapsule(e.target.value)} />
            <p style={{ ...S.aide, marginTop: 4 }}>
              Ouverture prévue le {new Date(packChoisi.dateOuverture()).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
            </p>

            <button onClick={validerCreation}
              disabled={!nomCapsule.trim() || chargement}
              style={{ ...S.boutonPrincipal, ...(!nomCapsule.trim() || chargement ? S.boutonDesactive : {}), marginTop: 14 }}>
              {chargement ? "Création…" : "Créer et inviter →"}
            </button>
            <button onClick={fermerModals}
              style={{ display: "block", width: "100%", background: "none", border: "none",
                color: COULEURS.doux, fontSize: 13, cursor: "pointer", marginTop: 10,
                fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Barre de navigation principale — 3 onglets uniquement : Capsules · Créer · Profil.
// Paramètres est accessible depuis l'écran Profil.
function BarreOnglets({ actif, allerVers, hasPapy }) {
  return (
    <div style={S.barreOnglets}>

      {/* Onglet Capsules */}
      <button style={{ ...S.onglet, ...(actif === "capsules" ? S.ongletActif : {}) }}
        onClick={() => allerVers("capsules")}>
        <div style={{ fontSize: 20 }}>⏳</div>
        <div style={S.ongletNom}>Capsules</div>
      </button>

      {/* Onglet Packs */}
      <button style={{ ...S.onglet, ...(actif === "creer" ? S.ongletActif : {}) }}
        onClick={() => allerVers("creer")}>
        <div style={{ fontSize: 20, transition: "transform 0.15s ease", transform: actif === "creer" ? "scale(1.15)" : "scale(1)" }}>🎁</div>
        <div style={S.ongletNom}>Packs</div>
      </button>

      {/* Onglet Papy/Mamie — visible uniquement si le pack est activé */}
      {hasPapy && (
        <button style={{ ...S.onglet, ...(actif === "papy" ? S.ongletActif : {}) }}
          onClick={() => allerVers("papy")}>
          <div style={{ fontSize: 20 }}>👴</div>
          <div style={S.ongletNom}>Papy/Mamie</div>
        </button>
      )}

      {/* Onglet Profil */}
      <button style={{ ...S.onglet, ...(actif === "profil" ? S.ongletActif : {}) }}
        onClick={() => allerVers("profil")}>
        <div style={{ fontSize: 20 }}>👤</div>
        <div style={S.ongletNom}>Profil</div>
      </button>

    </div>
  );
}

// ============================================================================
//  SÉLECTEUR DE DATE — colonnes "tambour" (drum-roll), style iOS.
// ============================================================================

function ColonnePicker({ items, selected, onSelect, renderItem, flex = 1 }) {
  const ITEM_H = 28;
  const VISIBLE = 3;
  const selectedIdx = Math.max(0, items.indexOf(selected));
  const [offset, setOffset] = React.useState(0);
  const [snap, setSnap]     = React.useState(false);
  const drag  = React.useRef({ active: false, startY: 0, last: 0 });
  const elRef = React.useRef(null);

  const baseY = (1 - selectedIdx) * ITEM_H;

  function start(y) { drag.current = { active: true, startY: y, last: 0 }; setSnap(false); setOffset(0); }
  function move(y)  { if (!drag.current.active) return; const v = y - drag.current.startY; drag.current.last = v; setOffset(v); }
  function end()    {
    if (!drag.current.active) return;
    drag.current.active = false;
    const moved   = -Math.round(drag.current.last / ITEM_H);
    const newIdx  = Math.max(0, Math.min(items.length - 1, selectedIdx + moved));
    onSelect(items[newIdx]);
    setOffset(0);
    setSnap(true);
  }

  // touchmove passif désactivé pour éviter le scroll de la page
  React.useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const fn = (e) => { if (drag.current.active) { e.preventDefault(); move(e.touches[0].clientY); } };
    el.addEventListener("touchmove", fn, { passive: false });
    return () => el.removeEventListener("touchmove", fn);
  }, []);

  return (
    <div ref={elRef}
      style={{ flex, height: ITEM_H * VISIBLE, minHeight: ITEM_H * VISIBLE, overflow: "hidden", position: "relative", userSelect: "none", touchAction: "none", cursor: "ns-resize" }}
      onMouseDown={e => start(e.clientY)}
      onMouseMove={e => move(e.clientY)}
      onMouseUp={end} onMouseLeave={end}
      onTouchStart={e => start(e.touches[0].clientY)}
      onTouchEnd={end}
    >
      {/* Bande de sélection centrale */}
      <div style={{ position: "absolute", top: ITEM_H * 1, left: 8, right: 8, height: ITEM_H, background: COULEURS.bordure, borderRadius: 10, pointerEvents: "none", zIndex: 0 }} />

      {/* Items */}
      <div style={{ transform: `translateY(${baseY + offset}px)`, transition: snap ? "transform 0.2s cubic-bezier(0.25,0.46,0.45,0.94)" : "none", willChange: "transform" }}>
        {items.map((item, i) => {
          const dist = Math.abs(i - selectedIdx);
          return (
            <div key={String(item)} style={{ height: ITEM_H, display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: dist === 0 ? 13 : 11, fontWeight: dist === 0 ? 700 : 400,
              color: COULEURS.encre, opacity: dist === 0 ? 1 : dist === 1 ? 0.45 : 0.15,
              fontFamily: "'Plus Jakarta Sans', sans-serif", position: "relative", zIndex: 1 }}>
              {renderItem(item)}
            </div>
          );
        })}
      </div>

      {/* Masques de fondu haut / bas */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: ITEM_H, background: "linear-gradient(to bottom,rgba(255,255,255,1),rgba(255,255,255,0))", pointerEvents: "none", zIndex: 2 }} />
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: ITEM_H, background: "linear-gradient(to top,rgba(255,255,255,1),rgba(255,255,255,0))", pointerEvents: "none", zIndex: 2 }} />
    </div>
  );
}

function SelecteurDate({ valeur, onChange }) {
  const MOIS = ["Jan","Fév","Mar","Avr","Mai","Jun","Jul","Aoû","Sep","Oct","Nov","Déc"];

  function parse(v) {
    if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
      const [a, m, j] = v.split("-").map(Number);
      return { jour: j, mois: m, annee: a };
    }
    const d = new Date(); d.setFullYear(d.getFullYear() + 1);
    return { jour: d.getDate(), mois: d.getMonth() + 1, annee: d.getFullYear() };
  }

  const init = parse(valeur);
  const [jour,  setJour]  = React.useState(init.jour);
  const [mois,  setMois]  = React.useState(init.mois);
  const [annee, setAnnee] = React.useState(init.annee);
  const emitRef = React.useRef(false);

  // Synchronise si le parent change valeur (ex : type sélectionné dans EcranCreation)
  React.useEffect(() => {
    if (!valeur) return;
    const { jour: j, mois: m, annee: a } = parse(valeur);
    setJour(j); setMois(m); setAnnee(a);
  }, [valeur]);

  const maxJours = new Date(annee, mois, 0).getDate();
  const jourSur  = Math.min(jour, maxJours);

  // Corrige le jour si le mois change et qu'il a moins de jours
  React.useEffect(() => { if (jour > maxJours) setJour(maxJours); }, [mois, annee]);

  // Émet la date ISO à chaque changement (pas au montage initial)
  React.useEffect(() => {
    if (!emitRef.current) { emitRef.current = true; return; }
    const iso = `${annee}-${String(mois).padStart(2,"0")}-${String(jourSur).padStart(2,"0")}`;
    onChange(iso);
  }, [jourSur, mois, annee]);

  const anneeMin = new Date().getFullYear();
  const jours    = Array.from({ length: maxJours }, (_, i) => i + 1);
  const moisList = Array.from({ length: 12 },       (_, i) => i + 1);
  const annees   = Array.from({ length: 31 },        (_, i) => anneeMin + i);

  return (
    <div style={{ background: "#fff", borderRadius: 20, overflow: "hidden", boxShadow: "0 4px 14px rgba(46,34,48,0.07)", marginTop: 8, flexShrink: 0 }}>
      {/* En-têtes de colonnes */}
      <div style={{ display: "flex", borderBottom: `1px solid ${COULEURS.bordure}`, padding: "5px 0 4px" }}>
        {["JOUR","MOIS","ANNÉE"].map(l => (
          <div key={l} style={{ flex: 1, textAlign: "center", fontSize: 10, fontWeight: 700, color: COULEURS.doux, letterSpacing: 1 }}>{l}</div>
        ))}
      </div>
      <div style={{ display: "flex" }}>
        <ColonnePicker items={jours}    selected={jourSur} onSelect={setJour}  renderItem={v => v} />
        <div style={{ width: 1, background: COULEURS.bordure }} />
        <ColonnePicker items={moisList} selected={mois}    onSelect={setMois}  renderItem={v => MOIS[v-1]} />
        <div style={{ width: 1, background: COULEURS.bordure }} />
        <ColonnePicker items={annees}   selected={annee}   onSelect={setAnnee} renderItem={v => v} />
      </div>
    </div>
  );
}

// ============================================================================
//  ÉCRAN BIENVENUE : crée l'identité "moi" (prénom + description + photo).
// ============================================================================
function EcranBienvenue({ creerMoi }) {
  const [prenom, setPrenom] = useState("");
  const [description, setDescription] = useState("");
  const [photo, setPhoto] = useState(null);
  return (
    <div style={{ ...S.ecran, justifyContent: "center" }}>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
        <LogoBlooom taille={52} />
      </div>
      <h1 style={{ ...S.titrePage, textAlign: "center" }}>Blooom</h1>
      <p style={{ ...S.aide, textAlign: "center", marginBottom: 20 }}>
        Créez une capsule, invitez qui vous voulez, scellez vos souvenirs ensemble.
      </p>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
        <SelecteurPhotoProfil photo={photo} couleur={COULEURS_AVATAR[0]} prenom={prenom} onChange={setPhoto} />
      </div>
      <label style={S.label}>Votre prénom</label>
      <input style={S.input} placeholder="Ex. Lucas" value={prenom} onChange={(e) => setPrenom(e.target.value)} />
      <label style={S.label}>Une courte description</label>
      <input style={S.input} placeholder="Ex. Photographe du dimanche" value={description} onChange={(e) => setDescription(e.target.value)} />
      <button style={{ ...S.boutonPrincipal, ...(prenom.trim() ? {} : S.boutonDesactive) }} disabled={!prenom.trim()}
        onClick={() => creerMoi({ prenom: prenom.trim(), description: description.trim(), photo })}>
        Commencer
      </button>
    </div>
  );
}

// ============================================================================
//  ÉCRAN CAPSULES : liste + créer + REJOINDRE via code.
// ============================================================================
// ============================================================================
//  CLOCHE NOTIFICATIONS — icône avec badge du nombre de non-lues
// ============================================================================
function ClocheNotifications({ notifications, onClick }) {
  const nonLues = notifications.filter(n => !n.lue).length;
  return (
    <button onClick={onClick} style={{ background: "none", border: "none", cursor: "pointer", position: "relative", padding: 8, lineHeight: 1 }}>
      <span style={{ fontSize: 22 }}>🔔</span>
      {nonLues > 0 && (
        <span style={{ position: "absolute", top: 2, right: 2, background: "#FF6B5E", color: "#fff", fontSize: 10, fontWeight: 800, borderRadius: 99, minWidth: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px" }}>
          {nonLues > 9 ? "9+" : nonLues}
        </span>
      )}
    </button>
  );
}

// ============================================================================
//  PANNEAU NOTIFICATIONS — slide-up du bas de l'écran
// ============================================================================
function PanneauNotifications({ notifications, onMarquerLue, onFermer, allerVers }) {
  const iconeNotif = (texte) => {
    if (texte.includes("souvenirs") || texte.includes("souvenir")) return "🎉";
    if (texte.includes("rejoint")) return "👋";
    if (texte.includes("ouvrir") || texte.includes("capsule")) return "🕰️";
    return "🔔";
  };
  return (
    <div style={{ position: "absolute", inset: 0, background: "rgba(28,16,20,0.65)", zIndex: 400, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}
      onClick={onFermer}>
      <div style={{ background: "#fff", borderRadius: "24px 24px 0 0", maxHeight: "72%", display: "flex", flexDirection: "column", animation: "fadeSlideUp 0.35s cubic-bezier(0.34,1.56,0.64,1) both" }}
        onClick={e => e.stopPropagation()}>
        <div style={{ padding: "16px 20px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #f0ecf1", flexShrink: 0 }}>
          <h3 style={{ margin: 0, fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 18, fontWeight: 700, color: "#2E2230" }}>Notifications</h3>
          <button onClick={onFermer} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#9B8AA0", padding: 4 }}>✕</button>
        </div>
        <div style={{ overflowY: "auto", flex: 1 }}>
          {notifications.length === 0 && (
            <p style={{ textAlign: "center", padding: "40px 20px", color: "#9B8AA0", fontSize: 14 }}>Aucune notification pour l'instant</p>
          )}
          {notifications.map(n => (
            <div key={n.id} onClick={() => {
              if (!n.lue) onMarquerLue(n.id);
              if (n.cibleEcran && n.capsuleId) { allerVers(n.cibleEcran, n.capsuleId); onFermer(); }
            }} style={{ padding: "14px 20px", borderBottom: "1px solid #f8f5f9", display: "flex", gap: 12, alignItems: "flex-start", cursor: (n.cibleEcran && n.capsuleId) ? "pointer" : "default", background: n.lue ? "transparent" : "#fdf8ff" }}>
              <span style={{ fontSize: 20, flexShrink: 0, marginTop: 2 }}>{iconeNotif(n.texte)}</span>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: "#2E2230", fontWeight: n.lue ? 400 : 600 }}>{n.texte}</p>
                <p style={{ margin: "4px 0 0", fontSize: 11, color: "#9B8AA0" }}>{formaterDateHeure(n.createdAt)}</p>
              </div>
              {!n.lue && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#FF6B5E", flexShrink: 0, marginTop: 5 }} />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
//  ÉCRAN QUIZ D'OUVERTURE — mini jeu avant l'animation
// ============================================================================

// ============================================================================
//  RÉACTION FLOTTANTE — emoji qui monte et disparaît (Realtime broadcast)
// ============================================================================
function ReactionFlottante({ emoji, id, onDone }) {
  const left = React.useMemo(() => 15 + Math.random() * 60, [id]);
  React.useEffect(() => {
    const t = setTimeout(onDone, 1300);
    return () => clearTimeout(t);
  }, []);
  return (
    <div style={{ position: "absolute", bottom: 90, left: `${left}%`, fontSize: 28, zIndex: 50,
      animation: "flotterReaction 1.3s ease-out forwards", pointerEvents: "none" }}>
      {emoji}
    </div>
  );
}

// ============================================================================
//  SECTION VOTE FAVORI — page finale de l'écran d'ouverture
// ============================================================================
function SectionVoteFavori({ capsule, moisParticipantId, voterFavori }) {
  const [vote, setVote] = React.useState(null);
  const [loading, setLoading] = React.useState(false);

  async function voter(contribId) {
    if (loading || vote) return;
    setLoading(true);
    await voterFavori(capsule.id, contribId);
    setVote(contribId);
    setLoading(false);
  }

  const candidats = (capsule?.contributions || []).filter(c => c.type !== "pari");
  if (candidats.length === 0) return null;

  return (
    <div style={{ marginTop: 28, paddingBottom: 12 }}>
      <h3 style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 17, fontWeight: 800, color: "#2E2230", margin: "0 0 4px" }}>
        ⭐ Votre souvenir préféré ?
      </h3>
      <p style={{ fontSize: 13, color: "#9B8AA0", margin: "0 0 14px" }}>Un vote par personne — définitif.</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {candidats.map(c => {
          const auteur = capsule.participants.find(p => p.id === c.auteurId);
          const estChoisi = vote === c.id;
          const label = c.texte
            ? (c.texte.length > 55 ? c.texte.slice(0, 52) + "…" : c.texte)
            : (c.type === "photo" ? "📷 Photo" : c.type === "video" ? "🎬 Vidéo" : c.type === "vocal" ? "🎙 Message vocal" : c.type === "dessin" ? "🎨 Dessin" : c.type);
          return (
            <button key={c.id} disabled={!!vote || loading} onClick={() => voter(c.id)}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: estChoisi ? "#fff8f0" : "#fff", border: `2px solid ${estChoisi ? "#FF8A3D" : "#f0ecf1"}`, borderRadius: 14, cursor: (vote && !estChoisi) ? "default" : "pointer", textAlign: "left", transition: "all 0.3s", width: "100%" }}>
              <Avatar membre={auteur} taille={32} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#2E2230", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
                <div style={{ fontSize: 11, color: "#9B8AA0", marginTop: 2 }}>{auteur?.prenom || "?"}</div>
              </div>
              {estChoisi && <span style={{ fontSize: 20, flexShrink: 0 }}>⭐</span>}
            </button>
          );
        })}
      </div>
      {vote && <p style={{ fontSize: 13, color: "#1a7a4b", fontWeight: 700, textAlign: "center", marginTop: 12 }}>Merci pour votre vote ! ✓</p>}
    </div>
  );
}

function EcranCapsules({ capsules, moi, allerVers, notifications = [], onOuvrirNotifs }) {
  const aucuneCapsuleActive = capsules.filter(c => !c.ouverte).length === 0;

  return (
    <div style={S.ecran}>
      <div style={{ ...S.enteteAccueil, display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <p style={S.surtitre}>Bonjour {moi?.prenom} 👋</p>
          <h1 style={{ ...S.titrePage, margin: 0 }}>Vos capsules</h1>
        </div>
        {onOuvrirNotifs && <ClocheNotifications notifications={notifications} onClick={onOuvrirNotifs} />}
      </div>


      {/* Bannière plan gratuit — visible uniquement si aucune capsule active */}
      {aucuneCapsuleActive && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "#fff", borderRadius: 16, padding: "12px 16px",
          boxShadow: "0 2px 10px rgba(46,34,48,0.06)", marginBottom: 14, gap: 10 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: COULEURS.encre, marginBottom: 3 }}>
              ✨ Gratuit pour toujours
            </div>
            <div style={{ fontSize: 11, color: COULEURS.doux, lineHeight: 1.4 }}>
              1 capsule · 30 photos · Participants illimités
            </div>
          </div>
          <div style={{ flexShrink: 0, background: "#dcfce7", color: "#16a34a",
            fontSize: 10, fontWeight: 700, borderRadius: 20, padding: "4px 10px", whiteSpace: "nowrap" }}>
            Gratuit
          </div>
        </div>
      )}

      <button style={S.boutonPrincipal} onClick={() => allerVers("creation")}>+ Nouvelle capsule</button>
      {/* NOUVEAU : rejoindre une capsule existante avec un code reçu. */}
      <button style={S.boutonSecondaire} onClick={() => allerVers("rejoindre")}>🔗 Rejoindre avec un code</button>

      {/* Preuve sociale : montre que Blooom est vivant et utilisé, incite à créer */}
      <CarteStatRotative />

      {capsules.length === 0 && (
        <div style={S.videAccueil}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🌅</div>
          <p style={S.videTexte}>Aucune capsule. Créez-en une, ou rejoignez celle d'un proche avec son code.</p>
        </div>
      )}

      <div style={{ marginTop: 18 }}>
        {capsules.map((c) => {
          const jours = joursRestants(c.dateOuverture);
          const ouvrable = estOuvrable(c);
          const typeInfo = TYPES_CAPSULES.find((t) => t.id === c.type);
          const teinte = typeInfo?.teinte || "#FF6B5E";

          // Progression temporelle : % du chemin parcouru entre création et ouverture
          const progression = (() => {
            if (!c.dateOuverture || !c.dateCreation) return null;
            const debut = new Date(c.dateCreation).getTime();
            const fin   = new Date(c.dateOuverture).getTime();
            if (fin <= debut) return null;
            return Math.min(100, Math.max(0, (Date.now() - debut) / (fin - debut) * 100));
          })();

          const estMariage = c.formule === "mariage";
          const estPapy    = c.formule === "papy";
          const styleCarteMariage = estMariage ? {
            border: "2px solid #C9A84C",
            boxShadow: "0 8px 32px rgba(201,168,76,0.35), 0 2px 8px rgba(131,24,67,0.15)",
            background: "#FFFBF0",
          } : {};
          const styleCartePapy = estPapy ? {
            border: "2px solid #FF8C5A",
            boxShadow: "0 8px 28px rgba(255,140,90,0.30), 0 2px 8px rgba(194,90,32,0.12)",
            background: "#FFF8F4",
          } : {};

          return (
            <button key={c.id} style={{ ...S.carteCapsule, ...styleCarteMariage, ...styleCartePapy }} onClick={() => allerVers("detail", c.id)}>
              <div style={{ ...S.carteCouverture,
                background: estMariage && !c.couverture
                  ? "linear-gradient(135deg,#3D0C11 0%,#831843 45%,#BE185D 75%,#C9A84C 100%)"
                  : estPapy && !c.couverture
                    ? "linear-gradient(135deg,#C25A20 0%,#FF8C5A 60%,#FFB37A 100%)"
                    : c.couverture ? `url(${c.couverture}) center/cover` : teinte,
                position: "relative", overflow: "hidden" }}>
                {!c.couverture && <span style={{ fontSize: 34 }}>{estMariage ? "💍" : estPapy ? "👴" : typeInfo?.icone || "✨"}</span>}
                {estMariage && (
                  <>
                    <span style={{ position:"absolute", top:6,  left:10,  fontSize:16, opacity:0.85 }}>✨</span>
                    <span style={{ position:"absolute", top:8,  right:14, fontSize:13, opacity:0.75 }}>💫</span>
                    <span style={{ position:"absolute", bottom:8, left:18, fontSize:11, opacity:0.70 }}>✨</span>
                    <span style={{ position:"absolute", bottom:6, right:10, fontSize:14, opacity:0.80 }}>⭐</span>
                    <span style={{ position:"absolute", top:22, left:"45%",fontSize:10, opacity:0.65 }}>💫</span>
                  </>
                )}
                {estPapy && (
                  <div style={{ position:"absolute", top:8, left:10,
                    background:"rgba(255,255,255,.85)", borderRadius:10,
                    padding:"3px 9px", fontSize:10, fontWeight:700, color:"#C25A20" }}>
                    📅 Mensuel
                  </div>
                )}
                <span style={S.cartePastille}>{c.contributions.length}</span>
              </div>
              <div style={{ padding: "12px 14px", textAlign: "left" }}>
                <div style={S.carteNom}>{c.nom}</div>
                <div style={S.carteSous}>
                  {c.ouverte ? "Ouverte ✓" : ouvrable ? "Prête à ouvrir !"
                    : jours != null ? `Ouverture dans ${jours} jour${jours > 1 ? "s" : ""}` : "Ouverture libre"}
                </div>

                {/* Barre de progression temporelle */}
                {progression !== null && (
                  <div style={{ marginTop: 10, marginBottom: 2 }}>
                    <div style={{ height: 5, borderRadius: 3, background: teinte + "22", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${progression}%`, borderRadius: 3, background: teinte, opacity: 0.85 }} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 11, color: COULEURS.doux, fontWeight: 600 }}>
                      <span>{new Date(c.dateCreation).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}</span>
                      <span>{new Date(c.dateOuverture).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}</span>
                    </div>
                  </div>
                )}

                {/* Stockage — affiché uniquement sur les capsules non encore ouvertes */}
                {!c.ouverte && <IndicateurStockage capsule={c} compact />}

                {/* Bandeau upgrade — visible uniquement pour les capsules gratuites non ouvertes */}
                {!c.ouverte && (c.formule === "gratuit" || !c.formule) && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                    marginTop: 10, padding: "7px 10px", borderRadius: 10,
                    background: COULEURS.corail + "12", gap: 8 }}>
                    <span style={{ fontSize: 11, color: COULEURS.doux,
                      fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                      Max : 30 photos
                    </span>
                    <button
                      onClick={e => { e.stopPropagation(); allerVers("upgrade_media", c.id); }}
                      style={{ fontSize: 11, fontWeight: 700, color: COULEURS.corail,
                        background: "none", border: "none", cursor: "pointer", whiteSpace: "nowrap",
                        fontFamily: "'Plus Jakarta Sans', sans-serif", padding: 0 }}>
                      Ajouter des souvenirs →
                    </button>
                  </div>
                )}

                {/* Avatars des participants de CETTE capsule (per-capsule). */}
                <div style={{ display: "flex", marginTop: 3, alignItems: "center" }}>
                  {c.participants.slice(0, 5).map((p, i) => (
                    <div key={p.id} style={{ marginLeft: i === 0 ? 0 : -2, border: "1px solid #fff", borderRadius: "50%" }}>
                      <Avatar membre={p} taille={7} />
                    </div>
                  ))}
                  <span style={{ marginLeft: 4, fontSize: 9, color: COULEURS.doux, fontWeight: 600 }}>
                    {c.participants.length} participant{c.participants.length > 1 ? "s" : ""}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
//  ÉCRAN PROFIL : votre identité globale (réutilisée comme participant).
// ============================================================================
function EcranModifierProfil({ moi, modifierMoi, allerVers }) {
  const [prenom, setPrenom]           = useState(moi.prenom);
  const [description, setDescription] = useState(moi.description || "");
  const [photo, setPhoto]             = useState(moi.photo || null);
  const [enregistre, setEnregistre]   = useState(false);

  async function enregistrer() {
    await modifierMoi({ prenom: prenom.trim(), description: description.trim(), photo });
    setEnregistre(true);
    setTimeout(() => { setEnregistre(false); allerVers("profil"); }, 1200);
  }

  return (
    <div style={S.ecran}>
      <EnTeteRetour titre="Modifier mon profil" onRetour={() => allerVers("profil")} />
      <div style={{ display: "flex", justifyContent: "center", margin: "8px 0 18px" }}>
        <SelecteurPhotoProfil photo={photo} couleur={moi.couleur} prenom={prenom} onChange={setPhoto} />
      </div>
      <label style={S.label}>Prénom</label>
      <input style={S.input} value={prenom} onChange={e => setPrenom(e.target.value)} />
      <label style={S.label}>Description</label>
      <input style={S.input} placeholder="Ex. Papa de Léo et Emma…" value={description} onChange={e => setDescription(e.target.value)} />
      <button style={{ ...S.boutonPrincipal, ...(!prenom.trim() ? S.boutonDesactive : {}) }} disabled={!prenom.trim()} onClick={enregistrer}>
        {enregistre ? "✓ Enregistré !" : "Enregistrer"}
      </button>
      <p style={S.aide}>Ces informations vous représentent quand vous créez ou rejoignez une capsule.</p>
    </div>
  );
}

function EcranProfil({ moi, capsules, gami, modifierMoi, allerVers, seDeconnecter }) {
  // Stats parrainage chargées depuis Supabase
  const [statsParrainage, setStatsParrainage] = useState(null);
  const [copie, setCopie] = useState(false);

  const lienParrainage = moi.codeParrain
    ? `${window.location.origin}?parrain=${moi.codeParrain}`
    : null;

  // Charge les statistiques de parrainage de l'utilisateur
  React.useEffect(() => {
    if (!moi.id) return;
    supabase
      .from("parrainages")
      .select("id, converti")
      .eq("parrain_id", moi.id)
      .then(({ data }) => {
        if (!data) return;
        const total     = data.length;
        const convertis = data.filter(p => p.converti).length;
        setStatsParrainage({ total, convertis });
      });
  }, [moi.id]);

  // Partage via Web Share API (mobile) ou copie dans le presse-papiers
  function partagerLienParrainage() {
    if (!lienParrainage) return;
    const message = `Crée une capsule temporelle avec moi. Tu recevras 1 mois d'abonnement OFFERT !\n${lienParrainage}`;
    if (navigator.share) {
      navigator.share({
        title: "Rejoins-moi sur Blooom 🌸",
        text: message,
      }).catch(() => {});
    } else {
      copierLienParrainage();
    }
  }

  function copierLienParrainage() {
    if (!lienParrainage) return;
    const message = `Crée une capsule temporelle avec moi. Tu recevras 1 mois d'abonnement OFFERT !\n${lienParrainage}`;
    navigator.clipboard.writeText(message).then(() => {
      setCopie(true);
      setTimeout(() => setCopie(false), 2000);
    }).catch(() => {});
  }

  return (
    <div style={S.ecran}>
      <div style={S.enteteAccueil}>
        <p style={S.surtitre}>Votre fiche</p>
        <h1 style={S.titrePage}>Profil</h1>
      </div>

      {/* Aperçu profil */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, background: "var(--carte-bg)",
        borderRadius: 20, padding: "14px 16px", boxShadow: "0 4px 14px rgba(46,34,48,0.07)", marginBottom: 4 }}>
        <div style={{ width: 56, height: 56, borderRadius: "50%", flexShrink: 0, overflow: "hidden",
          background: moi.couleur || COULEURS.corail, display: "flex", alignItems: "center",
          justifyContent: "center", fontSize: 22, fontWeight: 800, color: "#fff" }}>
          {moi.photo
            ? <img src={moi.photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : initiales(moi.prenom)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700,
            fontSize: 17, color: COULEURS.encre }}>{moi.prenom}</div>
          {moi.description && (
            <div style={{ fontSize: 13, color: COULEURS.doux, marginTop: 2,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {moi.description}
            </div>
          )}
        </div>
      </div>

      <button onClick={() => allerVers("modifier_profil")} style={{ ...S.boutonSecondaire, marginTop: 10 }}>
        ✏️ Modifier mon profil
      </button>

      {/* ── Niveau & badges ── */}
      {(() => {
        const g = gami || GAMI_VIDE;
        const niv = NIVEAUX.find(n => n.niveau === g.niveau) || NIVEAUX[0];
        const suivant = NIVEAUX.find(n => n.niveau === g.niveau + 1) || null;
        const prog = suivant
          ? Math.min(100, ((g.points_total - niv.min) / (suivant.min - niv.min)) * 100)
          : 100;
        const nb = badgesDebloques(g).length;
        const total = BADGES_DEF.reduce((s, c) => s + c.paliers.length, 0);
        return (
          <div onClick={() => allerVers("badges")}
            style={{ marginTop: 14, background: "linear-gradient(135deg,#667eea22,#764ba218)",
              border: "1.5px solid #667eea40", borderRadius: 18, padding: "14px 16px",
              cursor: "pointer", userSelect: "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 28 }}>{niv.emoji}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: "#764ba2", fontWeight: 700 }}>
                  Niveau {niv.niveau} — {niv.nom}
                </div>
                <div style={{ fontSize: 11, color: COULEURS.doux, marginTop: 1 }}>
                  {g.points_total} pts · {nb}/{total} badge{nb > 1 ? "s" : ""}
                </div>
              </div>
              <span style={{ fontSize: 13, color: "#764ba2", fontWeight: 700 }}>Voir →</span>
            </div>
            {suivant && (
              <div style={{ background: "rgba(118,75,162,0.15)", borderRadius: 100, height: 5,
                overflow: "hidden" }}>
                <div style={{ background: "linear-gradient(90deg,#667eea,#764ba2)",
                  height: "100%", borderRadius: 100, width: `${prog}%`,
                  transition: "width 0.6s ease" }} />
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Section parrainage ── */}
      {moi.abonnement === "papy" ? (
        <div style={{ marginTop: 16, background: "var(--carte-bg)", borderRadius: 16,
          padding: "12px 14px", boxShadow: "0 2px 10px rgba(46,34,48,0.06)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: COULEURS.encre }}>🎁 Parrainer un ami</span>
            {statsParrainage && (
              <span style={{ fontSize: 11, color: COULEURS.doux, fontWeight: 600 }}>
                {statsParrainage.total} parrainé{statsParrainage.total > 1 ? "s" : ""} · {statsParrainage.convertis} mois gagnés
              </span>
            )}
          </div>
          <p style={{ fontSize: 11, color: COULEURS.doux, margin: "0 0 6px", lineHeight: 1.4 }}>
            Invitez un ami — s'il crée une capsule dans les 7 jours, vous recevez tous les deux 1 mois offert.
          </p>
          <p style={{ fontSize: 10, color: COULEURS.doux, margin: "0 0 10px", lineHeight: 1.4, opacity: 0.7, fontStyle: "italic" }}>
            Valable uniquement sur le pack Mamie/Papy.
          </p>
          {moi.codeParrain && (
            <div style={{ background: "var(--input-bg)", borderRadius: 10, padding: "7px 10px",
              marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: COULEURS.encre,
                letterSpacing: 2, fontFamily: "'Bricolage Grotesque', sans-serif" }}>{moi.codeParrain}</span>
              <button onClick={copierLienParrainage}
                style={{ fontSize: 11, fontWeight: 700, color: COULEURS.corail, background: "none",
                  border: "none", cursor: "pointer", padding: 0, whiteSpace: "nowrap" }}>
                {copie ? "✓ Copié" : "📋 Copier"}
              </button>
            </div>
          )}
          <button style={{ ...S.boutonPrincipal, marginTop: 0, fontSize: 13, padding: "10px 0" }}
            onClick={partagerLienParrainage}>
            📤 Partager mon lien
          </button>
        </div>
      ) : (
        <div style={{ marginTop: 16, background: "var(--carte-bg)", borderRadius: 16,
          padding: "12px 14px", boxShadow: "0 2px 10px rgba(46,34,48,0.06)" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: COULEURS.encre }}>🤝 Faites-vous parrainer</span>
          <p style={{ fontSize: 11, color: COULEURS.doux, margin: "8px 0 0", lineHeight: 1.5 }}>
            Un ami abonné au pack Mamie/Papy peut vous inviter. Si vous souscrivez dans les 7 jours, vous recevez tous les deux <strong>1 mois offert</strong>.
          </p>
          <p style={{ fontSize: 10, color: COULEURS.doux, margin: "6px 0 0", lineHeight: 1.4, opacity: 0.7, fontStyle: "italic" }}>
            Demandez à votre ami de partager son lien de parrainage depuis son profil Blooom.
          </p>
        </div>
      )}

      {/* Liens secondaires — code cadeau + confidentialité */}
      <div style={{ marginTop: 28, paddingTop: 18, borderTop: `1px solid ${COULEURS.bordure}` }}>
        <button
          onClick={() => allerVers("activer_code")}
          style={{
            background: "none", border: "none", color: COULEURS.doux,
            fontSize: 14, cursor: "pointer", padding: "8px 0",
            display: "flex", alignItems: "center", gap: 8,
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontWeight: 600, width: "100%",
          }}
        >
          <span>🎁</span>
          <span>J'ai un code cadeau</span>
          <span style={{ marginLeft: "auto" }}>→</span>
        </button>
        {/* Accès aux paramètres (thème, langue, notifications) — retiré de la barre principale */}
        <button
          onClick={() => allerVers("parametres")}
          style={{
            background: "none", border: "none", color: COULEURS.doux,
            fontSize: 14, cursor: "pointer", padding: "8px 0",
            display: "flex", alignItems: "center", gap: 8,
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontWeight: 600, width: "100%",
          }}
        >
          <span>⚙️</span>
          <span>Paramètres</span>
          <span style={{ marginLeft: "auto" }}>→</span>
        </button>
        <button
          onClick={() => allerVers("confidentialite")}
          style={{
            background: "none", border: "none", color: COULEURS.doux,
            fontSize: 14, cursor: "pointer", padding: "8px 0",
            display: "flex", alignItems: "center", gap: 8,
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontWeight: 600, width: "100%",
          }}
        >
          <span>🔐</span>
          <span>Confidentialité &amp; sécurité</span>
          <span style={{ marginLeft: "auto" }}>→</span>
        </button>
      </div>

      <button
        onClick={seDeconnecter}
        style={{
          width: "100%", marginTop: 8,
          background: "none", border: `1.5px solid ${COULEURS.corail}40`,
          borderRadius: 14, padding: "13px 0",
          color: COULEURS.corail, fontSize: 14, fontWeight: 700,
          cursor: "pointer", fontFamily: "'Plus Jakarta Sans', sans-serif",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}
      >
        <span>🚪</span>
        <span>Se déconnecter</span>
      </button>
    </div>
  );
}

// ============================================================================
//  ÉCRAN CRÉATION : nom + type + date + couverture. Crée aussi le CODE et
//  ajoute "moi" comme premier participant.
// ============================================================================
function EcranCreation({ allerVers, creerCapsule }) {
  const [nom, setNom] = useState("");
  const [type, setType] = useState(null);
  const [date, setDate] = useState("");
  const [couverture, setCouverture] = useState(null);
  const [enCours, setEnCours] = useState(false);

  function choisirType(t) { setType(t.id); }
  const peutCreer = nom.trim().length > 0 && type !== null;

  return (
    <div style={S.ecran}>
      <EnTeteRetour titre="Nouvelle capsule" onRetour={() => allerVers("capsules")} />

      {/* Inclus dans la capsule gratuite */}
      <div style={{ background: "#F0FDF4", border: "1.5px solid #BBF7D0", borderRadius: 16,
        padding: "12px 16px", marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: "#15803D", marginBottom: 8, letterSpacing: 0.3 }}>
          ✅ Inclus dans votre capsule gratuite
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 12px" }}>
          {["📷 30 photos", "👥 Participants illimités"].map((item, i) => (
            <div key={i} style={{ fontSize: 12, color: "#166534", fontWeight: 600,
              fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              {item}
            </div>
          ))}
        </div>
      </div>

      <label style={S.label}>Nom de la capsule</label>
      <input style={S.input} placeholder="Ex. Mariage de Léa & Tom" value={nom} onChange={(e) => setNom(e.target.value)} />

      <label style={S.label}>Quel type ?</label>
      <div style={S.grilleTypes}>
        {TYPES_CAPSULES.map((t) => (
          <button
            key={t.id}
            onMouseDown={e => e.preventDefault()}
            onClick={() => choisirType(t)}
            style={{
              ...S.tuileType,
              border: type === t.id ? `2px solid ${t.teinte}` : "2px solid transparent",
              background: type === t.id ? t.teinte + "18" : "#fff",
              transform: type === t.id ? "scale(1.04)" : "scale(1)",
              boxShadow: type === t.id ? `0 4px 14px ${t.teinte}44` : "0 3px 10px rgba(46,34,48,0.06)",
              transition: "transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease",
            }}>
            <div style={{ ...S.tuileIcone, background: t.teinte + "22" }}>{t.icone}</div>
            <div style={S.tuileTypeNom}>{t.nom}</div>
          </button>
        ))}
      </div>

      <label style={{ ...S.label, marginTop: 18 }}>Date d'ouverture <span style={{ color: COULEURS.corail }}>*</span></label>
      <SelecteurDate valeur={date} onChange={setDate} />
      {!date && (
        <p style={{ ...S.aide, color: COULEURS.corail, marginTop: 8, fontWeight: 600 }}>
          Faites glisser les colonnes pour choisir une date.
        </p>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12, background: "#fff", borderRadius: 18, padding: "14px 16px", marginTop: 16, boxShadow: "0 4px 14px rgba(46,34,48,0.07)" }}>
        <span style={{ fontSize: 28, flexShrink: 0 }}>📖</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, color: COULEURS.encre, marginBottom: 2 }}>Ces souvenirs deviendront un vrai livre</div>
          <div style={{ fontSize: 12, color: COULEURS.doux, lineHeight: 1.4 }}>À l'ouverture, commandez un album papier imprimé de tous vos moments.</div>
        </div>
      </div>

      <button style={{ ...S.boutonPrincipal, ...(!peutCreer || enCours ? S.boutonDesactive : {}) }} disabled={!peutCreer || enCours}
        onClick={async () => {
          setEnCours(true);
          try {
            await creerCapsule({ nom: nom.trim(), type, dateOuverture: date || null, couverture });
          } catch (e) {
            alert("Erreur : " + e.message);
          } finally {
            setEnCours(false);
          }
        }}>
        {enCours ? "Création en cours…" : "Créer la capsule"}
      </button>
    </div>
  );
}

// ============================================================================
//  ÉCRAN REJOINDRE : saisir un code -> retrouver la capsule -> s'y ajouter.
//  Dans ce prototype mono-appareil, le code correspond à une capsule LOCALE.
//  EN PROD : le code interrogerait le serveur (la capsule vit chez quelqu'un
//  d'autre) puis l'ajouterait à votre liste.
// ============================================================================
function EcranRejoindre({ moi, allerVers, rechercherCapsule, rejoindreCapsule, codePrefill, onPrefillUsed }) {
  const [code, setCode] = useState(codePrefill || "");
  const codePropre = code.toUpperCase().replace(/[^A-Z0-9]/g, "");

  // Consume le prefill une seule fois (deep link ou QR)
  React.useEffect(() => {
    if (codePrefill) { setCode(codePrefill); onPrefillUsed?.(); }
  }, [codePrefill]); // eslint-disable-line react-hooks/exhaustive-deps
  const [capsuleTrouvee, setCapsuleTrouvee] = useState(null);
  const [recherche, setRecherche] = useState(false);
  const [prenom, setPrenom] = useState(moi.prenom);
  const [photo, setPhoto] = useState(moi.photo || null);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    if (codePropre.length !== 6) { setCapsuleTrouvee(null); return; }
    setRecherche(true);
    rechercherCapsule(codePropre).then((res) => {
      setCapsuleTrouvee(res || null);
      setRecherche(false);
    });
  }, [codePropre]);

  return (
    <div style={S.ecran}>
      <EnTeteRetour titre="Rejoindre une capsule" onRetour={() => allerVers("capsules")} />
      <label style={S.label}>Code de la capsule</label>
      <input style={{ ...S.input, letterSpacing: 4, textTransform: "uppercase", fontWeight: 700, textAlign: "center", fontSize: 22 }}
        placeholder="ABC123" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} />

      {recherche && <p style={S.aide}>Recherche en cours…</p>}

      {codePropre.length === 6 && !recherche && !capsuleTrouvee && (
        <p style={{ ...S.aide, color: COULEURS.corail }}>Aucune capsule ne correspond à ce code.</p>
      )}

      {capsuleTrouvee && (
        <div style={{ marginTop: 16 }}>
          <div style={S.carteTrouvee}>
            <div style={{ fontWeight: 700, fontSize: 17 }}>✨ {capsuleTrouvee.nom}</div>
            <div style={{ color: COULEURS.doux, fontSize: 14, marginTop: 2 }}>
              {capsuleTrouvee.nb_participants} participant{capsuleTrouvee.nb_participants > 1 ? "s" : ""}
            </div>
          </div>
          <label style={S.label}>Vous rejoignez sous le prénom</label>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <SelecteurPhotoProfil photo={photo} couleur={moi.couleur} prenom={prenom} onChange={setPhoto} taille={56} />
            <input style={{ ...S.input, flex: 1 }} value={prenom} onChange={(e) => setPrenom(e.target.value)} />
          </div>
          <button style={{ ...S.boutonPrincipal, ...(prenom.trim() && !enCours ? {} : S.boutonDesactive) }}
            disabled={!prenom.trim() || enCours}
            onClick={async () => {
              setEnCours(true);
              const id = await rejoindreCapsule(capsuleTrouvee.id, codePropre, { prenom: prenom.trim(), photo });
              setEnCours(false);
              if (id) allerVers("detail", id);
            }}>
            {enCours ? "Rejoindre…" : "Rejoindre cette capsule"}
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================================
//  ÉCRAN INVITER : montre le code + le lien partageable de la capsule.
// ============================================================================
function EcranInviter({ capsule, allerVers }) {
  const [copie, setCopie] = useState(""); // libellé de confirmation ("lien"/"code")

  if (!capsule) return null;
  const lien = lienPartage(capsule.code);

  // Copie un texte dans le presse-papier, avec repli silencieux si bloqué.
  async function copier(texte, quoi) {
    try {
      await navigator.clipboard.writeText(texte);
      setCopie(quoi);
      setTimeout(() => setCopie(""), 2000);
    } catch (e) { /* presse-papier indisponible : l'utilisateur copie à la main */ }
  }
  // Partage natif (feuille de partage du téléphone : WhatsApp, SMS, mail...).
  // EN PROD sur mobile, navigator.share ouvre la vraie feuille de partage.
  async function partager() {
    try {
      if (navigator.share) {
        await navigator.share({ title: `Rejoins ma capsule Blooom "${capsule.nom}"`, text: `Rejoins ma capsule Blooom "${capsule.nom}" !\n\nCode : ${capsule.code}\nLien : ${lien}` });
      } else {
        copier(lien, "lien"); // repli : copie si le partage natif n'existe pas
      }
    } catch (e) { /* partage annulé par l'utilisateur : on ne fait rien */ }
  }

  return (
    <div style={S.ecran}>
      <EnTeteRetour titre="Inviter" onRetour={() => allerVers("detail", capsule.id)} />
      <div style={{ textAlign: "center", marginTop: 6 }}>
        <div style={{ fontSize: 44 }}>🔗</div>
        <h2 style={S.finTitre}>Invitez vos proches</h2>
        <p style={S.finTexte}>Partagez ce code ou ce lien. La personne entrera le code pour rejoindre « {capsule.nom} ».</p>
      </div>

      {/* Le CODE, affiché en grand, facile à dicter ou recopier. */}
      <div style={S.blocCode}>
        <div style={S.codeLabel}>Code de la capsule</div>
        <div style={S.codeValeur}>{capsule.code}</div>
        <button style={S.boutonMini} onClick={() => copier(capsule.code, "code")}>
          {copie === "code" ? "✓ Copié" : "Copier le code"}
        </button>
      </div>

      {/* Le LIEN partageable. */}
      <div style={S.blocLien}>
        <div style={{ fontSize: 13, color: COULEURS.doux, wordBreak: "break-all" }}>{lien}</div>
      </div>

      <button style={S.boutonPrincipal} onClick={partager}>📤 Partager le lien</button>
      <button style={S.boutonSecondaire} onClick={() => copier(lien, "lien")}>
        {copie === "lien" ? "✓ Lien copié" : "Copier le lien"}
      </button>
    </div>
  );
}

// ============================================================================
//  ÉCRAN ÉDITION PARTICIPANT : ajout/modif d'un participant DANS la capsule.
// ============================================================================
function EcranEditionParticipant({ capsule, participantActifId, ajouterParticipant, modifierParticipant, retour, allerVers }) {
  const estNouveau = participantActifId === "nouveau";
  const existant = estNouveau ? null : capsule?.participants.find((p) => p.id === participantActifId);
  const [prenom, setPrenom] = useState(existant?.prenom || "");
  const [description, setDescription] = useState(existant?.description || "");
  const [photo, setPhoto] = useState(existant?.photo || null);
  const couleur = existant?.couleur || COULEURS_AVATAR[0];

  async function enregistrer() {
    if (!prenom.trim()) return;
    const champs = { prenom: prenom.trim(), description: description.trim(), photo };
    if (estNouveau) await ajouterParticipant(capsule.id, champs);
    else await modifierParticipant(capsule.id, participantActifId, champs);
    allerVers(retour, capsule.id);
  }
  return (
    <div style={S.ecran}>
      <EnTeteRetour titre={estNouveau ? "Ajouter un participant" : "Modifier"} onRetour={() => allerVers(retour, capsule.id)} />
      <div style={{ display: "flex", justifyContent: "center", margin: "8px 0 18px" }}>
        <SelecteurPhotoProfil photo={photo} couleur={couleur} prenom={prenom} onChange={setPhoto} />
      </div>
      <label style={S.label}>Prénom</label>
      <input style={S.input} value={prenom} onChange={(e) => setPrenom(e.target.value)} autoFocus={estNouveau} />
      <label style={S.label}>Description</label>
      <input style={S.input} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex. Témoin de la mariée" />
      <button style={{ ...S.boutonPrincipal, ...(prenom.trim() ? {} : S.boutonDesactive) }} disabled={!prenom.trim()} onClick={enregistrer}>
        {estNouveau ? "Ajouter" : "Enregistrer"}
      </button>
    </div>
  );
}

// Bandeau dans EcranDetail listant les paris que l'utilisateur n'a pas encore votés.
function ParisPendants({ capsule, moi, voterPari }) {
  const moisParticipant = capsule.participants.find(p => p.userId === moi?.id);
  const [commentaires, setCommentaires] = React.useState({});  // contribId → texte
  const [envoi, setEnvoi] = React.useState(null);

  const paris = capsule.contributions.filter(c => c.type === "pari");
  const nonVotes = paris.filter(c => {
    try {
      const d = c.question ? JSON.parse(c.question) : { votes: {} };
      return moisParticipant && !d.votes?.[moisParticipant.id];
    } catch { return false; }
  });

  if (!moisParticipant || nonVotes.length === 0) return null;

  async function voter(contribId, vote) {
    if (envoi) return;
    setEnvoi(contribId + vote);
    await voterPari(capsule.id, contribId, moisParticipant.id, vote, commentaires[contribId] || "");
    setEnvoi(null);
  }

  return (
    <div style={{ marginTop: 14 }}>
      <label style={S.label}>🎲 Paris en attente de ton vote</label>
      {nonVotes.map(c => {
        const auteur = capsule.participants.find(p => p.id === c.auteurId);
        return (
          <div key={c.id} style={{ background: "#fff", borderRadius: 20, padding: "16px 14px", marginBottom: 10, boxShadow: "0 4px 14px rgba(46,34,48,0.07)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <Avatar membre={auteur} taille={28} />
              <span style={{ fontSize: 12, fontWeight: 600, color: COULEURS.doux }}>{auteur?.prenom}</span>
            </div>
            <div style={{ fontWeight: 700, fontSize: 15, color: COULEURS.encre, lineHeight: 1.5, fontStyle: "italic", marginBottom: 12 }}>
              « {c.texte} »
            </div>
            <textarea
              style={{ ...S.zoneTexte, minHeight: 52, marginBottom: 10, fontSize: 13 }}
              placeholder="Ton commentaire (facultatif)…"
              value={commentaires[c.id] || ""}
              onChange={e => setCommentaires(prev => ({ ...prev, [c.id]: e.target.value }))}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button
                style={{ flex: 1, background: "#22c55e", color: "#fff", border: "none", borderRadius: 14, padding: 12, fontWeight: 700, fontSize: 14, cursor: "pointer", opacity: envoi ? 0.6 : 1 }}
                disabled={!!envoi}
                onClick={() => voter(c.id, "oui")}>
                ✅ Je dis oui
              </button>
              <button
                style={{ flex: 1, background: "#ef4444", color: "#fff", border: "none", borderRadius: 14, padding: 12, fontWeight: 700, fontSize: 14, cursor: "pointer", opacity: envoi ? 0.6 : 1 }}
                disabled={!!envoi}
                onClick={() => voter(c.id, "non")}>
                ❌ Je dis non
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
//  VOTES EN ATTENTE — bandeau dans EcranDetail pour les souvenirs vote non encore votés
// ============================================================================
function VotesPendants({ capsule, moi, voterSouvenir }) {
  const moisParticipant = capsule.participants.find(p => p.userId === moi?.id);
  const estCreateur = moi?.id === capsule.createurId;
  const [selectionPar, setSelectionPar] = React.useState({}); // contribId → option
  const [envoi, setEnvoi] = React.useState(null);

  const votes = capsule.contributions.filter(c => c.type === "vote");
  if (votes.length === 0) return null;

  return (
    <div style={{ marginTop: 14 }}>
      {votes.map(c => {
        let donnees = { question: "", options: [], votes: {} };
        try { if (c.question) donnees = JSON.parse(c.question); } catch {}
        const votesMap  = donnees.votes || {};
        const options   = donnees.options || [];
        const nbVotes   = Object.keys(votesMap).length;
        const nbTotal   = capsule.participants.length;
        const monVote   = moisParticipant ? votesMap[moisParticipant.id] : null;
        const aVote     = !!monVote;
        const auteur    = capsule.participants.find(p => p.id === c.auteurId);
        const selection = selectionPar[c.id];

        // Créateur ayant déjà voté : juste le compteur
        if (estCreateur && aVote) {
          return (
            <div key={c.id} style={{ background: "#fff", borderRadius: 20, padding: "14px 16px",
              marginBottom: 10, boxShadow: "0 4px 14px rgba(46,34,48,0.07)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 20 }}>🗳️</span>
                <span style={{ fontWeight: 700, fontSize: 14, color: COULEURS.encre, flex: 1 }}>
                  {donnees.question}
                </span>
              </div>
              <div style={{ fontSize: 13, color: COULEURS.doux, fontWeight: 600 }}>
                {nbVotes}/{nbTotal} participant{nbTotal > 1 ? "s" : ""} {nbVotes > 1 ? "ont" : "a"} voté
              </div>
            </div>
          );
        }

        // Participant ayant déjà voté
        if (aVote) {
          return (
            <div key={c.id} style={{ background: "#fff", borderRadius: 20, padding: "14px 16px",
              marginBottom: 10, boxShadow: "0 4px 14px rgba(46,34,48,0.07)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 20 }}>🗳️</span>
                <span style={{ fontWeight: 700, fontSize: 14, color: COULEURS.encre, flex: 1 }}>
                  {donnees.question}
                </span>
              </div>
              <div style={{ fontSize: 12, color: "#22c55e", fontWeight: 700 }}>
                ✅ Vote enregistré · "{monVote}"
              </div>
            </div>
          );
        }

        // Participant n'ayant pas encore voté
        if (!moisParticipant) return null;

        async function voter() {
          if (!selection || envoi) return;
          setEnvoi(c.id);
          await voterSouvenir(capsule.id, c.id, moisParticipant.id, selection);
          setEnvoi(null);
        }

        return (
          <div key={c.id} style={{ background: "#fff", borderRadius: 20, padding: "16px 14px",
            marginBottom: 10, boxShadow: "0 4px 14px rgba(46,34,48,0.07)",
            border: "1.5px solid #e8e0ec" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <Avatar membre={auteur} taille={26} />
              <span style={{ fontSize: 11, color: COULEURS.doux, fontWeight: 600 }}>{auteur?.prenom}</span>
            </div>
            <div style={{ fontWeight: 700, fontSize: 15, color: COULEURS.encre, lineHeight: 1.5,
              marginBottom: 12 }}>
              🗳️ {donnees.question}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
              {options.map(opt => (
                <button key={opt} onClick={() => setSelectionPar(prev => ({ ...prev, [c.id]: opt }))}
                  style={{ background: selection === opt ? DEGRADE : "#f5f0f8",
                    color: selection === opt ? "#fff" : COULEURS.encre,
                    border: selection === opt ? "none" : `1.5px solid ${COULEURS.bordure}`,
                    borderRadius: 14, padding: "11px 14px", fontWeight: 700, fontSize: 14,
                    cursor: "pointer", textAlign: "left",
                    boxShadow: selection === opt ? "0 4px 14px rgba(255,92,157,0.35)" : "none",
                    transition: "all 0.15s ease",
                    fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                  {opt}
                </button>
              ))}
            </div>
            <button
              disabled={!selection || !!envoi}
              onClick={voter}
              style={{ width: "100%", background: selection ? DEGRADE : "#e5dde8",
                color: "#fff", border: "none", borderRadius: 14, padding: 13,
                fontWeight: 700, fontSize: 14, cursor: selection ? "pointer" : "default",
                opacity: envoi === c.id ? 0.6 : 1,
                fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              {envoi === c.id ? "Enregistrement…" : "🔒 Valider mon vote"}
            </button>
            <p style={{ fontSize: 11, color: COULEURS.doux, textAlign: "center", margin: "8px 0 0" }}>
              Votre vote est définitif et ne peut pas être modifié.
            </p>
          </div>
        );
      })}
    </div>
  );
}

// Animation du verdict d'un pari à l'ouverture de la capsule.
// Phase 0 : énoncé + bouton. Phase 1 : dé qui grossit 7s puis explose. Phase 2 : résultats.
function AnimPari({ contrib, capsule, moisParticipant, voterPari }) {
  const [phase, setPhase]     = React.useState(() => {
    try {
      const d = contrib.question ? JSON.parse(contrib.question) : { votes: {} };
      const v = Object.entries(d.votes || {});
      return v.length >= capsule.participants.length && capsule.participants.length > 0 ? 2 : 0;
    } catch { return 0; }
  });
  const [barG, setBarG]       = React.useState(0);
  const [barP, setBarP]       = React.useState(0);
  const [commentaire, setCom] = React.useState("");
  const [envoi, setEnvoi]     = React.useState(false);

  // État de l'animation du dé (phase 1)
  const [deScale,    setDeScale]    = React.useState(0.05);
  const [deOpacity,  setDeOpacity]  = React.useState(0);
  const [deRotation, setDeRotation] = React.useState(0);
  const rafRef   = React.useRef(null);
  const startRef = React.useRef(null);
  const DUREE    = 7000; // ms

  const donnees = React.useMemo(() => {
    try { return contrib.question ? JSON.parse(contrib.question) : { votes: {} }; }
    catch { return { votes: {} }; }
  }, [contrib.question]);

  const votes   = donnees.votes || {};
  const monVote = moisParticipant ? votes[moisParticipant.id] : null;
  const liste   = Object.entries(votes);
  const nbG     = liste.filter(([, v]) => v.vote === "oui").length;
  const nbP     = liste.filter(([, v]) => v.vote === "non").length;
  const total   = liste.length;
  const pG      = total > 0 ? Math.round(nbG / total * 100) : 0;
  const pP      = total > 0 ? Math.round(nbP / total * 100) : 0;
  const tousOntVote = total > 0 && total >= capsule.participants.length;

  // Anime les barres dès que phase 2 est atteinte (animation ou init directe)
  React.useEffect(() => {
    if (phase !== 2) return;
    const t = setTimeout(() => { setBarG(pG); setBarP(pP); }, 120);
    return () => clearTimeout(t);
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // Animation RAF : le dé grandit progressivement sur 7s puis explose
  React.useEffect(() => {
    if (phase !== 1) return;
    startRef.current = performance.now();

    function tick(now) {
      const elapsed = now - startRef.current;
      const t = Math.min(1, elapsed / DUREE);

      // Croissance lente (easing) jusqu'à 85% du temps, puis explosion rapide
      let s;
      if (t < 0.85) {
        s = 0.05 + Math.pow(t / 0.85, 2) * 0.95;  // 0.05 → 1.0
      } else {
        const boom = (t - 0.85) / 0.15;
        s = 1 + boom * boom * 9;                   // 1.0 → ~10
      }

      // Oscillation (wobble) qui s'intensifie avec la taille, cesse lors de l'explosion
      const wobble = t < 0.84
        ? Math.sin(elapsed * 0.006) * 20 * Math.min(1, t * 5)
        : 0;

      // Opacité : apparition rapide → stable → disparition lors de l'explosion
      let op;
      if      (t < 0.05) op = t / 0.05;
      else if (t < 0.86) op = 1;
      else               op = Math.max(0, 1 - (t - 0.86) / 0.14);

      setDeScale(s);
      setDeOpacity(op);
      setDeRotation(wobble);

      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        // Transition vers les résultats (barres animées par useEffect)
        setPhase(2);
      }
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [phase, pG, pP]);

  async function voter(vote) {
    if (!moisParticipant || envoi) return;
    setEnvoi(true);
    await voterPari(capsule.id, contrib.id, moisParticipant.id, vote, commentaire);
    setEnvoi(false);
  }

  return (
    <div>
      {/* Énoncé — toujours visible */}
      <div style={{ background: "linear-gradient(135deg,rgba(255,138,61,0.12),rgba(198,92,232,0.12))", borderRadius: 20, padding: "20px 16px", marginBottom: 16, textAlign: "center" }}>
        <div style={{ fontSize: 38, marginBottom: 10 }}>🎲</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: COULEURS.encre, lineHeight: 1.6, fontStyle: "italic" }}>
          « {contrib.texte} »
        </div>
      </div>

      {/* Phase 0 : bouton pour lancer le dépouillement */}
      {phase === 0 && (
        <div style={{ textAlign: "center", paddingBottom: 8 }}>
          <button
            onClick={() => setPhase(1)}
            style={{ background: DEGRADE, color: "#fff", border: "none", borderRadius: 18, padding: "15px 32px", fontSize: 16, fontWeight: 700, cursor: "pointer", boxShadow: "0 8px 24px rgba(255,92,157,0.45)", fontFamily: "'Plus Jakarta Sans', sans-serif", letterSpacing: 0.3 }}>
            🎲 Lancer le dépouillement
          </button>
        </div>
      )}

      {/* Phase 1 : dé qui grossit sur 7 secondes */}
      {phase === 1 && (
        <div style={{ textAlign: "center", minHeight: 170, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", overflow: "hidden", padding: "10px 0" }}>
          <div style={{
            fontSize: 64,
            display: "inline-block",
            transform: `scale(${deScale}) rotate(${deRotation}deg)`,
            opacity: deOpacity,
            transformOrigin: "center center",
            lineHeight: 1,
            willChange: "transform, opacity",
          }}>
            🎲
          </div>
          <div style={{ marginTop: 28, fontSize: 13, fontWeight: 700, color: COULEURS.doux, letterSpacing: 2, textTransform: "uppercase", opacity: Math.min(1, deOpacity * 4) }}>
            Dépouillement en cours…
          </div>
        </div>
      )}

      {/* Phase 2 : résultats */}
      {phase === 2 && (
        <div>
          {total > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700, color: "#22c55e", marginBottom: 4 }}>
                  <span>✅ Je dis oui</span><span>{pG}%</span>
                </div>
                <div style={{ height: 16, background: "#e8fdf0", borderRadius: 8, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${barG}%`, background: "linear-gradient(90deg,#22c55e,#4ade80)", borderRadius: 8, transition: "width 1.2s cubic-bezier(0.4,0,0.2,1)" }} />
                </div>
              </div>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700, color: "#ef4444", marginBottom: 4 }}>
                  <span>❌ Je dis non</span><span>{pP}%</span>
                </div>
                <div style={{ height: 16, background: "#fff0f0", borderRadius: 8, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${barP}%`, background: "linear-gradient(90deg,#ef4444,#f87171)", borderRadius: 8, transition: "width 1.2s cubic-bezier(0.4,0,0.2,1)" }} />
                </div>
              </div>
            </div>
          )}

          {capsule.participants.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              {capsule.participants.map(p => {
                const v = votes[p.id];
                return (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, background: "#fff", borderRadius: 14, padding: "10px 12px", boxShadow: "0 2px 8px rgba(46,34,48,0.06)" }}>
                    <Avatar membre={p} taille={30} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: COULEURS.encre }}>{p.prenom}</div>
                      {v?.commentaire && <div style={{ fontSize: 12, color: COULEURS.doux, marginTop: 1 }}>"{v.commentaire}"</div>}
                    </div>
                    <span style={{ fontWeight: 800, fontSize: 13, color: v ? (v.vote === "oui" ? "#22c55e" : "#ef4444") : COULEURS.doux }}>
                      {v ? (v.vote === "oui" ? "✅ Je dis oui" : "❌ Je dis non") : "n'a pas voté"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {total === 0 && <div style={{ textAlign: "center", color: COULEURS.doux, fontSize: 13, marginBottom: 14 }}>Aucun vote enregistré.</div>}

          {moisParticipant && !monVote && !tousOntVote && (
            <div style={{ background: "#fff", borderRadius: 16, padding: "14px 14px", boxShadow: "0 2px 8px rgba(46,34,48,0.07)" }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: COULEURS.encre, marginBottom: 8 }}>Votre verdict</div>
              <textarea style={{ ...S.zoneTexte, minHeight: 52, marginBottom: 8, fontSize: 13 }}
                placeholder="Un commentaire (facultatif)…"
                value={commentaire} onChange={e => setCom(e.target.value)} />
              <div style={{ display: "flex", gap: 8 }}>
                <button style={{ flex: 1, background: "#22c55e", color: "#fff", border: "none", borderRadius: 14, padding: 12, fontWeight: 700, cursor: "pointer", opacity: envoi ? 0.6 : 1 }}
                  disabled={envoi} onClick={() => voter("oui")}>✅ Je dis oui</button>
                <button style={{ flex: 1, background: "#ef4444", color: "#fff", border: "none", borderRadius: 14, padding: 12, fontWeight: 700, cursor: "pointer", opacity: envoi ? 0.6 : 1 }}
                  disabled={envoi} onClick={() => voter("non")}>❌ Je dis non</button>
              </div>
            </div>
          )}
          {monVote && (
            <div style={{ textAlign: "center", fontSize: 13, color: COULEURS.doux, padding: "8px 0" }}>
              Vous avez voté <strong style={{ color: monVote.vote === "oui" ? "#22c55e" : "#ef4444" }}>
                {monVote.vote === "oui" ? "✅ Je dis oui" : "❌ Je dis non"}
              </strong>
              {monVote.commentaire && <span> · "{monVote.commentaire}"</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
//  ÉCRAN DÉTAIL : couverture, compte à rebours, date, PARTICIPANTS + invitation.
// ============================================================================
// Poids estimé en Mo par type de contribution (les médias sont des URLs, on ne peut pas peser exactement)
const POIDS_MO = {
  photo: 3, video: 30, vocal: 1, dessin: 0.5, document: 2,
  message: 0.01, secret: 0.01, pari: 0.01, vote: 0.01, chanson: 0.01, meteo: 0.01, une_du_jour: 0.01,
};

// Carte "Code Papy" — affiché dans EcranDetail pour les créateurs de capsules Papy.
function CodePapyCard({ code, allerVers, capsuleId }) {
  const [copie, setCopie] = useState(false);
  async function copier() {
    try {
      await navigator.clipboard.writeText(code);
      setCopie(true);
      setTimeout(() => setCopie(false), 2000);
    } catch {}
  }
  return (
    <div style={{ background: "#FFFBEB", borderRadius: 18, padding: "16px 18px",
      marginTop: 14, border: "1.5px solid #FDE68A" }}>
      <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700,
        fontSize: 13, color: "#92400E", marginBottom: 6 }}>
        👴👵 Code pour Mamie/Papy
      </div>
      <div style={{ fontSize: 12, color: "#B45309", lineHeight: 1.5, marginBottom: 12,
        fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        Donnez ce code à vos proches. En l'utilisant, ils choisissent leur rôle : contributeur ou Mamie/Papy.
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div style={{ flex: 1, background: "#fff", borderRadius: 12, padding: "10px 14px",
          textAlign: "center", fontFamily: "'Bricolage Grotesque', sans-serif",
          fontWeight: 900, fontSize: 24, letterSpacing: 6, color: "#92400E",
          border: "2px dashed #FDE68A" }}>
          {code}
        </div>
        <button onClick={copier}
          style={{ background: "#FDE68A", border: "none", borderRadius: 12,
            padding: "10px 14px", fontSize: 12, fontWeight: 700, color: "#92400E",
            cursor: "pointer", whiteSpace: "nowrap", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
          {copie ? "✓ Copié" : "Copier"}
        </button>
      </div>
      {allerVers && capsuleId && (
        <button onClick={() => allerVers("choix_role_papy", capsuleId)}
          style={{ width: "100%", padding: "10px 0", borderRadius: 12, border: "none",
            background: "linear-gradient(135deg,#C25A20,#FF8C5A)", color: "#fff",
            fontWeight: 700, fontSize: 13, cursor: "pointer",
            fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
          👁 Voir la capsule avec ce code
        </button>
      )}
    </div>
  );
}

// Indicateur de quotas par type (photos, vidéos, vocaux) — basé sur la formule de la capsule.
function IndicateurStockage({ capsule, compact = false }) {
  const formule = capsule.formule || "gratuit";
  const q = QUOTAS[formule] || QUOTAS.gratuit;

  const items = [
    { label: "📸 Photos", quota: capsule.quota_photos ?? q.photos, compte: capsule.compte_photos ?? 0 },
    { label: "🎬 Vidéos", quota: capsule.quota_videos ?? q.videos, compte: capsule.compte_videos ?? 0 },
    { label: "🎤 Vocaux", quota: capsule.quota_vocaux ?? q.vocaux, compte: capsule.compte_vocaux ?? 0 },
  ].filter(i => i.quota > 0);

  function labelQuota(item) {
    if (item.quota >= 9999) return "Illimité";
    return `${item.compte} / ${item.quota}`;
  }

  if (items.length === 0) return null;

  if (compact) {
    return (
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        {items.map(item => {
          const limite = item.quota < 9999;
          const pct = limite ? Math.min(100, (item.compte / item.quota) * 100) : 0;
          return (
            <div key={item.label} style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: pct > 80 ? "#FF8A3D" : COULEURS.doux, textAlign: "center", marginBottom: 2 }}>
                {item.label.split(" ")[0]} {labelQuota(item)}
              </div>
              <div style={{ height: 3, background: `${COULEURS.doux}28`, borderRadius: 999, overflow: "hidden" }}>
                {limite && <div style={{ height: "100%", borderRadius: 999, width: `${pct}%`,
                  background: pct > 90 ? "#FF5C5C" : pct > 70 ? "#FF8A3D" : DEGRADE, transition: "width .6s ease" }} />}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: COULEURS.doux, marginBottom: 8 }}>Stockage de la capsule</div>
      {items.map(item => {
        const limite = item.quota < 9999;
        const pct = limite ? Math.min(100, (item.compte / item.quota) * 100) : 0;
        const couleurVal = pct > 80 ? "#FF8A3D" : COULEURS.doux;
        return (
          <div key={item.label} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
              <span style={{ fontSize: 12, color: COULEURS.encre }}>{item.label}</span>
              <span style={{ fontSize: 11, color: couleurVal }}>{labelQuota(item)}</span>
            </div>
            <div style={{ height: 4, background: `${COULEURS.doux}28`, borderRadius: 999, overflow: "hidden" }}>
              {limite && <div style={{ height: "100%", borderRadius: 999, width: `${pct}%`,
                background: pct > 90 ? "#FF5C5C" : pct > 70 ? "#FF8A3D" : DEGRADE, transition: "width .6s ease" }} />}
            </div>
          </div>
        );
      })}
      {q.mensuel && (
        <p style={{ fontSize: 10, color: COULEURS.doux, margin: 0, marginTop: 4 }}>
          Se réinitialise le 1er du mois.
        </p>
      )}
    </div>
  );
}

function VoirEnsembleButton({ capsule, moi, insererNotification }) {
  const [envoye, setEnvoye] = React.useState(false);
  const [info, setInfo] = React.useState(false);

  async function inviterEnsemble() {
    if (!insererNotification) return;
    const autresParticipants = capsule.participants.filter(p => p.id !== moi?.participantId);
    const nomExpediteur = moi?.prenom || "Quelqu'un";
    await Promise.all(autresParticipants.map(p =>
      insererNotification(
        p.id,
        capsule.id,
        `${nomExpediteur} vous invite à ouvrir « ${capsule.nom} » ensemble maintenant ! 🎉`,
        "detail"
      )
    ));
    setEnvoye(true);
    setTimeout(() => setEnvoye(false), 4000);
  }

  return (
    <div style={{ marginTop: 8 }}>
      <button
        onClick={inviterEnsemble}
        disabled={envoye}
        style={{
          width: "100%", padding: "11px 16px", borderRadius: 14, border: "1.5px solid #A78BFA",
          background: envoye ? "#F3F0FF" : "transparent", color: envoye ? "#7C3AED" : "#7C3AED",
          fontSize: 14, fontWeight: 700, cursor: envoye ? "default" : "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
          transition: "all 0.2s",
        }}
      >
        {envoye ? "✓ Invitations envoyées !" : "👀 Voir tous ensemble ?"}
      </button>
      <button
        onClick={() => setInfo(v => !v)}
        style={{ background: "none", border: "none", color: "#A78BFA", fontSize: 11,
          fontWeight: 600, margin: "4px auto 0", display: "block", cursor: "pointer", padding: 0 }}
      >
        {info ? "Masquer" : "C'est quoi ?"}
      </button>
      {info && (
        <p style={{ fontSize: 11, color: "#6B7280", textAlign: "center", margin: "6px 4px 0",
          lineHeight: 1.5, background: "#F9F5FF", borderRadius: 10, padding: "8px 12px" }}>
          Envoie une notification à tous les membres pour qu'ils ouvrent la capsule en même temps que vous — où qu'ils soient. ✨
        </p>
      )}
    </div>
  );
}

function EcranDetail({ capsule, moi, allerVers, ouvrirCapsule, modifierDate, modifierNom, modifierCouverture, editerParticipant, voterPari, voterSouvenir, onPaywall, insererNotification, supprimerCapsule, quitterCapsule, marierParticipant, capsulesLiees }) {
  const [editionDate, setEditionDate] = useState(false);
  const [nouvelleDate, setNouvelleDate] = useState(capsule?.dateOuverture || "");
  const [editionNom, setEditionNom] = useState(false);
  const [nouveauNom, setNouveauNom] = useState(capsule?.nom || "");
  const [confirmSuppression, setConfirmSuppression] = useState(false);
  const [copieInvit, setCopieInvit] = useState(false);
  const [srcRecadrageCouv, setSrcRecadrageCouv] = useState(null);

  async function partagerInvitation() {
    const lien = lienPartage(capsule.code);
    try {
      if (navigator.share) {
        await navigator.share({
          title: `Rejoins ma capsule Blooom "${capsule.nom}"`,
          text:  `Rejoins notre capsule mariage "${capsule.nom}" ! 💍\n\nCode : ${capsule.code}\nLien : ${lien}`,
        });
      } else {
        await navigator.clipboard.writeText(`Code : ${capsule.code}\nLien : ${lien}`);
        setCopieInvit(true); setTimeout(() => setCopieInvit(false), 2000);
      }
    } catch (e) { /* annulé */ }
  }

  const MAX_AFFICHES = 20;
  const affichesParticipants = React.useMemo(() => {
    if (!capsule) return [];
    const liste = capsule.participants;
    if (liste.length <= MAX_AFFICHES) return liste;
    return [...liste].sort(() => Math.random() - 0.5).slice(0, MAX_AFFICHES);
  }, [capsule?.id, capsule?.participants?.length]);

  const _estPapy = capsule?.formule === "papy";
  const MOIS_FR = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
  const papyMoisDisponibles = React.useMemo(() => {
    if (!_estPapy) return [];
    const opts = []; const base = new Date();
    base.setDate(1); base.setHours(0,0,0,0); base.setMonth(base.getMonth() + 2);
    for (let i = 0; i < 12; i++) {
      const d = new Date(base); d.setMonth(base.getMonth() + i);
      opts.push({ label: `${MOIS_FR[d.getMonth()]} ${d.getFullYear()}`, iso: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-01` });
    }
    return opts;
  }, [_estPapy]);
  const [papyMoisIdx, setPapyMoisIdx] = useState(() => {
    if (!_estPapy || !capsule?.dateOuverture) return 0;
    const isoTarget = capsule.dateOuverture.substring(0, 7) + "-01";
    const idx = papyMoisDisponibles.findIndex(m => m.iso === isoTarget);
    return idx >= 0 ? idx : 0;
  });

  if (!capsule) return (
    <div style={S.ecran}>
      <EnTeteRetour titre="Capsule" onRetour={() => allerVers("capsules")} />
      <p style={{ textAlign: "center", color: COULEURS.doux, marginTop: 60, fontSize: 14 }}>Chargement…</p>
    </div>
  );
  const total = capsule.participants.length;
  const tailleAvatar = total <= 3 ? 44 : total <= 8 ? 36 : total <= 14 ? 30 : 26;
  const tailleNom = Math.max(10, tailleAvatar * 0.22);
  const jours = joursRestants(capsule.dateOuverture);
  const ouvrable = estOuvrable(capsule);
  const typeInfo = TYPES_CAPSULES.find((t) => t.id === capsule.type);
  const estMariage = capsule.formule === "mariage";
  const estPapy    = capsule.formule === "papy";
  const monParticipant = capsule.participants.find(p => p.userId === moi?.id);
  const estCreateur = moi?.id === capsule.createurId;
  const marieesList = estMariage ? capsule.participants.filter(p => p.marie) : [];
  const estMarie = estMariage ? (monParticipant?.marie || false) : true;
  const peutOuvrirCapsule = !estMariage || estMarie;

  // Papy — règles de modification et infos d'affichage
  const estPremierePapyCapsule = estPapy && (!capsulesLiees || capsulesLiees.length === 0);
  const peutModifierDate = !estPapy || estPremierePapyCapsule;
  const papyMoisEnCours = estPapy && capsule.dateOuverture
    ? (() => { const d = new Date(capsule.dateOuverture); d.setMonth(d.getMonth()-1); return `${MOIS_FR[d.getMonth()]} ${d.getFullYear()}`; })()
    : null;
  const papyProchaineOuverture = estPapy && capsule.dateOuverture
    ? (() => { const d = new Date(capsule.dateOuverture); return `1er ${MOIS_FR[d.getMonth()]} ${d.getFullYear()}`; })()
    : null;

  return (
    <div style={{ ...S.ecran, ...(estMariage ? { background:"linear-gradient(180deg,#FFF7ED 0%,#FFFBF5 55%,#FFF0E6 100%)" } : {}) }}>
      {estMariage && <style>{`
        @keyframes mpSc{0%,100%{opacity:.25;transform:scale(.8) rotate(-8deg)}50%{opacity:1;transform:scale(1.25) rotate(8deg)}}
        @keyframes mpSh{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
        @keyframes mpFl{0%,100%{transform:translateY(0) rotate(0deg)}50%{transform:translateY(-8px) rotate(6deg)}}
        @keyframes mpPulse{0%,100%{box-shadow:0 4px 18px rgba(201,168,76,.3)}50%{box-shadow:0 4px 32px rgba(201,168,76,.7)}}
        .mp1{animation:mpSc 2.0s ease-in-out infinite}
        .mp2{animation:mpSc 2.0s ease-in-out .35s infinite}
        .mp3{animation:mpSc 2.0s ease-in-out .7s infinite}
        .mp4{animation:mpSc 2.0s ease-in-out 1.05s infinite}
        .mp5{animation:mpSc 2.0s ease-in-out 1.4s infinite}
        .mp6{animation:mpSc 2.0s ease-in-out 1.75s infinite}
        .mp7{animation:mpSc 2.0s ease-in-out .55s infinite}
        .mp8{animation:mpSc 2.0s ease-in-out .9s infinite}
        .mpFlotte{animation:mpFl 3.2s ease-in-out infinite}
        .mpShimmer{background:linear-gradient(270deg,#3D0C11,#6B1428,#BE185D,#C9A84C,#F5D78E,#C9A84C,#BE185D,#6B1428,#3D0C11);background-size:500% 500%;animation:mpSh 5s ease infinite}
        .mpPulse{animation:mpPulse 2.5s ease-in-out infinite}
        .mpBtn{background:linear-gradient(135deg,#3D0C11,#831843,#BE185D,#C9A84C)!important;color:#fff!important;border:none!important;box-shadow:0 4px 18px rgba(131,24,67,.4)!important}
      `}</style>}
      <EnTeteRetour titre={capsule.nom} onRetour={() => allerVers("capsules")} />

      {/* Modal recadrage — commun à tous les types */}
      {srcRecadrageCouv && (
        <RecadreurCouverture
          src={srcRecadrageCouv}
          onValider={b64 => { modifierCouverture(capsule.id, b64); setSrcRecadrageCouv(null); }}
          onAnnuler={() => setSrcRecadrageCouv(null)}
        />
      )}

      {estMariage ? (
        capsule.couverture ? (
          /* ── Mariage avec photo : hero pleine largeur ── */
          <div style={{ borderRadius: 22, overflow: "hidden", marginBottom: 14, position: "relative", flexShrink: 0 }}>
            <img src={capsule.couverture} alt=""
              style={{ width: "100%", height: 220, objectFit: "cover", display: "block" }} />
            <div style={{ position: "absolute", inset: 0,
              background: "linear-gradient(to bottom, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.68) 100%)" }} />
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "16px 18px" }}>
              {editionNom ? (
                <div style={{ display: "flex", gap: 8 }}>
                  <input value={nouveauNom} onChange={e => setNouveauNom(e.target.value)}
                    style={{ flex: 1, background: "rgba(255,255,255,0.15)", border: "1.5px solid rgba(255,215,100,0.7)",
                      borderRadius: 10, padding: "6px 10px", fontSize: 15, color: "#fff", fontWeight: 700, outline: "none" }} autoFocus />
                  <button style={{ background: "rgba(201,168,76,0.8)", border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 14, color: "#fff", fontWeight: 700, cursor: "pointer" }}
                    onClick={() => { modifierNom(capsule.id, nouveauNom); setEditionNom(false); }}>✓</button>
                  <button style={{ background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 14, color: "#fff", cursor: "pointer" }}
                    onClick={() => { setNouveauNom(capsule.nom); setEditionNom(false); }}>✕</button>
                </div>
              ) : (
                <div style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 800, fontSize: 18,
                  color: "#fff", textShadow: "0 2px 8px rgba(0,0,0,0.5)" }}>
                  💍 {capsule.nom}
                  {moi?.id === capsule.createurId && modifierNom && (
                    <button style={{ display: "block", background: "none", border: "none",
                      color: "rgba(255,215,100,0.85)", fontSize: 11, cursor: "pointer", fontWeight: 600, padding: "3px 0 0" }}
                      onClick={() => setEditionNom(true)}>✏️ Renommer</button>
                  )}
                </div>
              )}
              <div style={{ color: "rgba(255,215,100,0.9)", fontSize: 12, marginTop: 4, fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
                {capsule.participants.length} invité{capsule.participants.length > 1 ? "s" : ""} · {capsule.contributions.length} souvenir{capsule.contributions.length > 1 ? "s" : ""}
              </div>
            </div>
            {moi?.id === capsule.createurId && (
              <label style={{ position: "absolute", top: 10, right: 10, cursor: "pointer" }}>
                <div style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)", borderRadius: 10,
                  padding: "6px 12px", color: "#fff", fontSize: 12, fontWeight: 700 }}>
                  📷 Modifier
                </div>
                <input type="file" accept="image/*" style={{ display: "none" }}
                  onChange={(e) => lireFichierEnBase64(e, setSrcRecadrageCouv)} />
              </label>
            )}
          </div>
        ) : (
          /* ── Mariage sans photo : bannière shimmer + ajout photo ── */
          <div className="mpShimmer" style={{ borderRadius: 22, padding: "26px 18px 20px", marginBottom: 14, position: "relative", overflow: "hidden", flexShrink: 0 }}>
            <span className="mp1" style={{ position: "absolute", top: 7,    left: 14,   fontSize: 21, pointerEvents: "none", zIndex: 1 }}>✨</span>
            <span className="mp2" style={{ position: "absolute", top: 11,   right: 22,  fontSize: 17, pointerEvents: "none", zIndex: 1 }}>💫</span>
            <span className="mp3" style={{ position: "absolute", top: 24,   left: "43%",fontSize: 13, pointerEvents: "none", zIndex: 1 }}>⭐</span>
            <span className="mp4" style={{ position: "absolute", bottom: 9,  left: 30,   fontSize: 18, pointerEvents: "none", zIndex: 1 }}>✨</span>
            <span className="mp5" style={{ position: "absolute", bottom: 11, right: 18,  fontSize: 15, pointerEvents: "none", zIndex: 1 }}>💫</span>
            <span className="mp6" style={{ position: "absolute", top: 8,    left: "68%",fontSize: 12, pointerEvents: "none", zIndex: 1 }}>✨</span>
            <span className="mp7" style={{ position: "absolute", bottom: 18, left: "54%",fontSize: 11, pointerEvents: "none", zIndex: 1 }}>⭐</span>
            <span className="mp8" style={{ position: "absolute", top: 32,   right: 42,  fontSize: 10, pointerEvents: "none", zIndex: 1 }}>💫</span>
            <div className="mpFlotte" style={{ textAlign: "center", fontSize: 46, lineHeight: 1, marginBottom: 6, position: "relative", zIndex: 2 }}>💍</div>
            <div style={{ textAlign: "center", color: "#fff", fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 800, fontSize: 18, textShadow: "0 2px 10px rgba(0,0,0,.3)", position: "relative", zIndex: 2 }}>
              {editionNom ? (
                <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "center" }}>
                  <input value={nouveauNom} onChange={e => setNouveauNom(e.target.value)}
                    style={{ flex: 1, maxWidth: 200, background: "rgba(255,255,255,0.15)", border: "1.5px solid rgba(255,215,100,0.7)", borderRadius: 10, padding: "6px 10px", fontSize: 15, color: "#fff", fontWeight: 700, outline: "none" }} autoFocus />
                  <button style={{ background: "rgba(201,168,76,0.8)", border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 14, color: "#fff", fontWeight: 700, cursor: "pointer" }}
                    onClick={() => { modifierNom(capsule.id, nouveauNom); setEditionNom(false); }}>✓</button>
                  <button style={{ background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 14, color: "#fff", cursor: "pointer" }}
                    onClick={() => { setNouveauNom(capsule.nom); setEditionNom(false); }}>✕</button>
                </div>
              ) : (
                <>
                  {capsule.nom}
                  {moi?.id === capsule.createurId && modifierNom && (
                    <button style={{ display: "block", margin: "4px auto 0", background: "none", border: "none", color: "rgba(255,215,100,0.75)", fontSize: 11, cursor: "pointer", fontWeight: 600, padding: 0 }}
                      onClick={() => setEditionNom(true)}>✏️ Renommer</button>
                  )}
                </>
              )}
            </div>
            <div style={{ textAlign: "center", color: "rgba(255,215,100,.95)", fontSize: 12, marginTop: 4, fontFamily: "'Plus Jakarta Sans',sans-serif", position: "relative", zIndex: 2 }}>
              {capsule.participants.length} invité{capsule.participants.length > 1 ? "s" : ""} · {capsule.contributions.length} souvenir{capsule.contributions.length > 1 ? "s" : ""}
            </div>
            {moi?.id === capsule.createurId && (
              <label style={{ display: "block", cursor: "pointer", marginTop: 12, position: "relative", zIndex: 2 }}>
                <div style={{ textAlign: "center", background: "rgba(0,0,0,0.25)", borderRadius: 10,
                  padding: "7px 0", color: "rgba(255,255,255,0.9)", fontSize: 12, fontWeight: 700 }}>
                  📷 Ajouter une photo de couverture
                </div>
                <input type="file" accept="image/*" style={{ display: "none" }}
                  onChange={(e) => lireFichierEnBase64(e, setSrcRecadrageCouv)} />
              </label>
            )}
          </div>
        )
      ) : (
        /* ── Autres types : section couverture standard ── */
        <>
          <label style={{ display: "block", cursor: "pointer", marginBottom: 10 }}>
            <div style={{ ...S.detailCouverture, marginBottom: 0,
              background: capsule.couverture ? `url(${capsule.couverture}) center/cover` : (typeInfo?.teinte || "#FF6B5E"),
              position: "relative", overflow: "hidden" }}>
              {!capsule.couverture && (
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 56 }}>{typeInfo?.icone || "✨"}</div>
                  <div style={{ color: "rgba(255,255,255,0.9)", fontSize: 13, fontWeight: 600, marginTop: 8, background: "rgba(0,0,0,0.25)", padding: "6px 14px", borderRadius: 999 }}>
                    📷 Ajouter une photo de couverture
                  </div>
                </div>
              )}
              {capsule.couverture && <div style={S.boutonCouverture}>📷 Changer</div>}
            </div>
            <input type="file" accept="image/*" style={{ display: "none" }}
              onChange={(e) => lireFichierEnBase64(e, setSrcRecadrageCouv)} />
          </label>
          {capsule.couverture && (
            <button onClick={() => setSrcRecadrageCouv(capsule.couverture)}
              style={{ width: "100%", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.18)",
                borderRadius: 12, color: "rgba(255,255,255,0.85)", padding: "8px 0",
                fontSize: 13, fontWeight: 600, cursor: "pointer", marginBottom: 8, fontFamily: "inherit" }}>
              ↕ Recadrer
            </button>
          )}
        </>
      )}

      {/* ── Bandeau mensuel Papy/Mamie ── */}
      {estPapy && (
        <div style={{ background:"linear-gradient(135deg,#FFF0E6,#FFE4CC)",
          border:"2px solid #FF8C5A", borderRadius:18, padding:"13px 16px", marginBottom:12 }}>
          <div style={{ fontSize:11, fontWeight:800, color:"#C25A20",
            letterSpacing:".06em", textTransform:"uppercase", marginBottom:8 }}>
            📅 Capsule mensuelle
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
            {papyProchaineOuverture && (
              <div style={{ fontSize:13, color:"#5C3A1E" }}>
                <strong>Prochaine ouverture :</strong> {papyProchaineOuverture}
              </div>
            )}
            {!capsule.dateOuverture && (
              <div style={{ fontSize:13, color:"#A07850", fontStyle:"italic" }}>
                Aucune date d'ouverture définie
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ ...S.blocSceau, ...(estMariage ? {background:"linear-gradient(135deg,rgba(201,168,76,.18),rgba(190,24,93,.09))",border:"1.5px solid rgba(201,168,76,.5)",boxShadow:"0 4px 16px rgba(201,168,76,.15)"} : {}) }}>
        {capsule.ouverte ? <div style={S.sceauEtat}>🎉 Capsule ouverte</div>
          : ouvrable ? <div style={S.sceauEtat}>✨ Prête à être ouverte</div>
          : (<><div style={{ ...S.sceauJours, ...(estMariage ? {color:"#C9A84C"} : {}) }}>{jours ?? "—"}</div><div style={S.sceauEtat}>jour{jours > 1 ? "s" : ""} avant l'ouverture</div></>)}
        {!capsule.ouverte && (
          <div style={{ marginTop: 10 }}>
            {/* Édition de la date */}
            {editionDate && estPremierePapyCapsule ? (
              /* Papy : sélecteur de mois (1er du mois uniquement) */
              <div style={{ marginTop: 8 }}>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                  <button onClick={() => setPapyMoisIdx(i => Math.max(0, i-1))}
                    disabled={papyMoisIdx === 0}
                    style={{ flexShrink:0, width:36, height:36, borderRadius:10,
                      border:"1.5px solid rgba(255,140,90,.4)", background:"#fff",
                      fontSize:18, color: papyMoisIdx === 0 ? "rgba(255,140,90,.3)" : "#C25A20",
                      cursor: papyMoisIdx === 0 ? "default" : "pointer", padding:0 }}>‹</button>
                  <div style={{ flex:1, textAlign:"center", padding:"8px 10px", borderRadius:14,
                    border:"2px solid #FF5A20", background:"linear-gradient(135deg,#FFF5EC,#FFF0E6)" }}>
                    <div style={{ fontWeight:800, fontSize:15, color:"#C25A20" }}>
                      {papyMoisDisponibles[papyMoisIdx]?.label}
                    </div>
                    <div style={{ fontSize:11, color:"#A07850", marginTop:1 }}>Ouverture le 1er</div>
                  </div>
                  <button onClick={() => setPapyMoisIdx(i => Math.min(papyMoisDisponibles.length-1, i+1))}
                    disabled={papyMoisIdx === papyMoisDisponibles.length-1}
                    style={{ flexShrink:0, width:36, height:36, borderRadius:10,
                      border:"1.5px solid rgba(255,140,90,.4)", background:"#fff",
                      fontSize:18, color: papyMoisIdx === papyMoisDisponibles.length-1 ? "rgba(255,140,90,.3)" : "#C25A20",
                      cursor: papyMoisIdx === papyMoisDisponibles.length-1 ? "default" : "pointer", padding:0 }}>›</button>
                </div>
                <div style={{ display:"flex", gap:8 }}>
                  <button style={{ ...S.boutonMini, flex:1, marginTop:0 }}
                    onClick={() => { modifierDate(capsule.id, papyMoisDisponibles[papyMoisIdx].iso); setEditionDate(false); }}>
                    Valider
                  </button>
                  <button style={{ ...S.boutonMiniGris, flex:1 }} onClick={() => setEditionDate(false)}>Annuler</button>
                </div>
              </div>
            ) : editionDate && !estPapy ? (
              /* Non-papy : sélecteur de date classique */
              <div style={{ textAlign: "left" }}>
                <SelecteurDate valeur={nouvelleDate || ""} onChange={setNouvelleDate} />
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button style={{ ...S.boutonMini, flex: 1, marginTop: 0 }} onClick={() => { modifierDate(capsule.id, nouvelleDate || null); setEditionDate(false); }}>Valider</button>
                  <button style={{ ...S.boutonMiniGris, flex: 1 }} onClick={() => setEditionDate(false)}>Annuler</button>
                </div>
              </div>
            ) : (
              <div style={S.sceauDate}>
                {capsule.dateOuverture ? `le ${formaterDate(capsule.dateOuverture)}` : "Ouverture libre"}{" "}
                {moi?.id === capsule.createurId && peutModifierDate && (
                  <button style={S.lienCrayon} onClick={() => setEditionDate(true)}>✏️ Modifier</button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {!capsule.ouverte && (
        <button
          style={{ ...S.boutonPrincipal, marginTop: 0, marginBottom: 10,
            ...(estMariage ? {background:"linear-gradient(135deg,#3D0C11,#831843,#BE185D,#C9A84C)",boxShadow:"0 4px 20px rgba(131,24,67,.4)"} : {}) }}
          onClick={() => allerVers("contribution", capsule.id)}>
          {estMariage ? "💍 Déposer un souvenir" : "+ Déposer un souvenir"}
        </button>
      )}

      <div style={{ ...S.statsLigne, ...(estMariage ? {background:"linear-gradient(135deg,rgba(201,168,76,.14),rgba(190,24,93,.07))",border:"1px solid rgba(201,168,76,.35)",borderRadius:16,boxShadow:"0 2px 10px rgba(201,168,76,.12)"} : {}) }}>
        <div style={S.statBloc}>
          <div style={{ ...S.statChiffre, ...(estMariage ? {color:"#831843"} : {}) }}>{capsule.contributions.length}</div>
          <div style={S.statLabel}>souvenirs</div>
        </div>
        <div style={S.statBloc}>
          <div style={{ ...S.statChiffre, ...(estMariage ? {color:"#831843"} : {}) }}>{capsule.participants.length}</div>
          <div style={S.statLabel}>participants</div>
        </div>
      </div>

      {/* Indicateur de stockage — limite du créateur, identique pour tous les membres */}
      <IndicateurStockage capsule={capsule} />

      {!capsule.ouverte && (capsule.formule === "gratuit" || !capsule.formule) && (
        <button onClick={() => allerVers("upgrade_media", capsule.id)}
          style={{ width: "100%", padding: "10px 0", borderRadius: 12, border: "none",
            background: COULEURS.corail + "15", color: COULEURS.corail,
            fontWeight: 700, fontSize: 13, cursor: "pointer", marginTop: 6,
            fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
          Ajouter des souvenirs →
        </button>
      )}

      {/* Grille des participants */}
      <div style={{ marginTop: 10 }}>
        <label style={{ ...S.label, ...(estMariage ? {color:"#831843",fontWeight:700} : {}) }}>
          {estMariage ? "💍 " : ""}{total} participant{total > 1 ? "s" : ""}
          {total > MAX_AFFICHES && <span style={{ fontWeight: 400, color: COULEURS.doux }}> · aperçu aléatoire</span>}
        </label>
        <div style={{ background: estMariage ? "linear-gradient(135deg,rgba(255,247,237,.95),rgba(255,243,227,.9))" : "#fff", borderRadius: 22, padding: "8px 6px", boxShadow: estMariage ? "0 4px 16px rgba(201,168,76,.18)" : "0 4px 14px rgba(46,34,48,0.07)", display: "flex", flexWrap: "wrap", gap: 4, justifyContent: "center", border: estMariage ? "1.5px solid rgba(201,168,76,.4)" : "none" }}>
          {affichesParticipants.map((p) => {
            const estMoi = p.userId === moi?.id;
            return (
              <div key={p.id}
                onClick={estMoi ? () => editerParticipant(p.id, "detail") : undefined}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "2px 2px", borderRadius: 8, cursor: estMoi ? "pointer" : "default" }}>
                <div style={{ position: "relative" }}>
                  <Avatar membre={p} taille={tailleAvatar} />
                  {estMoi && (
                    <div style={{ position: "absolute", bottom: 0, right: 0, width: 8, height: 8, borderRadius: "50%", background: DEGRADE, border: "1.5px solid #fff" }} />
                  )}
                  {p.marie && (
                    <div style={{ position: "absolute", top: -5, right: -5, fontSize: 12, lineHeight: 1 }}>💍</div>
                  )}
                </div>
                <span style={{ fontSize: tailleNom, fontWeight: 600, color: COULEURS.encre, maxWidth: tailleAvatar + 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.prenom}
                </span>
              </div>
            );
          })}
          {total > MAX_AFFICHES && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, padding: "4px 2px" }}>
              <div style={{ width: tailleAvatar, height: tailleAvatar, borderRadius: "50%", background: COULEURS.bordure, display: "flex", alignItems: "center", justifyContent: "center", color: COULEURS.doux, fontWeight: 700, fontSize: tailleAvatar * 0.28 }}>
                +{total - MAX_AFFICHES}
              </div>
              <span style={{ fontSize: tailleNom, color: COULEURS.doux, fontWeight: 600 }}>autres</span>
            </div>
          )}
        </div>
      </div>

      {/* Désignation des mariés — visible uniquement pour le créateur d'une capsule mariage */}
      {estMariage && estCreateur && marierParticipant && (
        <div style={{ marginTop: 12, background: "linear-gradient(135deg,rgba(201,168,76,.10),rgba(131,24,67,.07))", border: "1.5px solid rgba(201,168,76,.5)", borderRadius: 18, padding: "14px 14px 10px" }}>
          <label style={{ fontSize: 12, fontWeight: 800, color: "#831843", marginBottom: 10, display: "block", letterSpacing: "0.05em", textTransform: "uppercase" }}>
            💍 Désigner les mariés (2 max)
          </label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {capsule.participants.map(p => {
              const selected = p.marie;
              const nbMaries = marieesList.length;
              const disabled = !selected && nbMaries >= 2;
              return (
                <button key={p.id}
                  onClick={() => !disabled && marierParticipant(capsule.id, p.id, !selected)}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 20,
                    border: `1.5px solid ${selected ? "#C9A84C" : "rgba(201,168,76,.3)"}`,
                    background: selected ? "linear-gradient(135deg,rgba(201,168,76,.25),rgba(190,24,93,.15))" : "rgba(255,255,255,.7)",
                    color: selected ? "#831843" : COULEURS.doux, fontWeight: selected ? 800 : 500, fontSize: 13,
                    cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.38 : 1,
                    fontFamily: "'Plus Jakarta Sans', sans-serif", transition: "all 0.2s" }}>
                  {selected ? "💍 " : "○ "}{p.prenom}
                </button>
              );
            })}
          </div>
          {marieesList.length === 2 && (
            <p style={{ fontSize: 11, color: "rgba(131,24,67,.75)", margin: "10px 0 0", fontStyle: "italic", lineHeight: 1.5 }}>
              Seuls {marieesList.map(p => p.prenom).join(" & ")} pourront voir et ouvrir cette capsule.
            </p>
          )}
          {marieesList.length === 0 && (
            <p style={{ fontSize: 11, color: "rgba(131,24,67,.55)", margin: "10px 0 0", fontStyle: "italic" }}>
              Aucun marié désigné — tout le monde peut accéder au contenu pour l'instant.
            </p>
          )}
        </div>
      )}

      {/* Paris en attente de vote — visibles avant l'ouverture */}
      <ParisPendants capsule={capsule} moi={moi} voterPari={voterPari} />
      <VotesPendants capsule={capsule} moi={moi} voterSouvenir={voterSouvenir} />

      {!capsule.ouverte && (
        <>
          {estMariage && (
            <div style={{textAlign:"center",margin:"14px 0 6px",fontSize:13,color:"rgba(201,168,76,.8)",letterSpacing:4,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
              <span className="mp1">✨</span> <span className="mp3">💫</span> <span className="mp5">✨</span> <span className="mp7">⭐</span> <span className="mp2">💫</span> <span className="mp4">✨</span> <span className="mp6">💫</span>
            </div>
          )}
          {estMariage ? (
            <>
              <button
                style={{ width:"100%", padding:"14px 0", borderRadius:16,
                  background:"linear-gradient(135deg,#3D0C11,#831843,#BE185D,#C9A84C)",
                  color:"#fff", border:"none", fontWeight:700, fontSize:15, cursor:"pointer",
                  fontFamily:"'Bricolage Grotesque',sans-serif",
                  boxShadow:"0 4px 20px rgba(131,24,67,.4)",
                  display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}
                onClick={partagerInvitation}>
                <span>📨</span><span>{copieInvit ? "✓ Lien copié !" : "Partager l'invitation"}</span>
              </button>
              <button
                style={{ width:"100%", padding:"13px 0", borderRadius:16, marginTop:8,
                  border:"2px solid #C9A84C", background:"linear-gradient(135deg,rgba(201,168,76,.08),rgba(190,24,93,.06))",
                  color:"#831843", fontWeight:700, fontSize:14, cursor:"pointer",
                  fontFamily:"'Bricolage Grotesque',sans-serif",
                  display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}
                onClick={() => allerVers("qr_mariage", capsule.id)}>
                <span>🖨️</span><span>QR code invités</span>
              </button>
            </>
          ) : (
            <button style={S.boutonInviter} onClick={() => {
              const maxP = capsule.quota_participants ?? 10;
              if (capsule.participants.length >= maxP) {
                onPaywall && onPaywall("quota_atteint");
              } else {
                allerVers("inviter", capsule.id);
              }
            }}>🔗 Inviter quelqu'un</button>
          )}
          <p style={S.aide}>Le contenu reste secret jusqu'à l'ouverture.</p>
          {ouvrable && peutOuvrirCapsule && <button style={S.boutonOuvrir} onClick={() => ouvrirCapsule(capsule.id)}>🔓 Ouvrir la capsule</button>}
          {ouvrable && !peutOuvrirCapsule && marieesList.length > 0 && (
            <div style={{ textAlign:"center",padding:"14px 16px",background:"linear-gradient(135deg,rgba(201,168,76,.10),rgba(131,24,67,.07))",border:"1.5px solid rgba(201,168,76,.4)",borderRadius:16,marginTop:8 }}>
              <div style={{ fontSize:22,marginBottom:4 }}>💍</div>
              <p style={{ fontSize:13,fontWeight:600,color:"#831843",margin:0,fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
                Cette capsule s'ouvre uniquement pour {marieesList.map(p => p.prenom).join(" & ")}
              </p>
            </div>
          )}
          {ouvrable && !peutOuvrirCapsule && marieesList.length === 0 && (
            <div style={{ textAlign:"center",padding:"12px 16px",background:"rgba(201,168,76,.07)",border:"1px dashed rgba(201,168,76,.4)",borderRadius:14,marginTop:8 }}>
              <p style={{ fontSize:12,color:"rgba(131,24,67,.6)",margin:0,fontStyle:"italic" }}>Le créateur doit désigner les mariés pour déverrouiller l'ouverture</p>
            </div>
          )}
          {ouvrable && peutOuvrirCapsule && capsule.participants.length > 1 && (
            <VoirEnsembleButton capsule={capsule} moi={moi} insererNotification={insererNotification} />
          )}
        </>
      )}
      {capsule.ouverte && peutOuvrirCapsule && <button style={S.boutonPrincipal} onClick={() => {
        try { localStorage.removeItem(`blooom_ouverture_${capsule.id}`); } catch {}
        allerVers("ouverture", capsule.id);
      }}>Revoir les souvenirs</button>}
      {capsule.ouverte && !peutOuvrirCapsule && (
        <div style={{ textAlign:"center",padding:"14px 16px",background:"linear-gradient(135deg,rgba(201,168,76,.10),rgba(131,24,67,.07))",border:"1.5px solid rgba(201,168,76,.4)",borderRadius:16,marginTop:4 }}>
          <div style={{ fontSize:22,marginBottom:4 }}>💍</div>
          <p style={{ fontSize:13,fontWeight:600,color:"#831843",margin:0,fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
            Le contenu est réservé aux mariés
          </p>
        </div>
      )}

      {/* Mode simplifié + code de partage pour les capsules Mamie/Papy */}
      {capsule.formule === "papy" && (
        <>
          {moi?.id === capsule.createurId && (
            <CodePapyCard code={capsule.code} allerVers={allerVers} capsuleId={capsule.id} />
          )}
        </>
      )}

      {/* Section impression — Naissance et Mamie/Papy uniquement */}
      {(capsule.formule === "naissance" || capsule.formule === "papy") && (
        <SectionImpression capsule={capsule} allerVers={allerVers} />
      )}

      {/* Mois précédents — membres d'une capsule Papy/Mamie */}
      {capsule.formule === "papy" && capsulesLiees?.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#7C3A0A", marginBottom: 10,
            letterSpacing: "0.04em", textTransform: "uppercase", display:"flex", alignItems:"center", gap:6 }}>
            <span>📅</span> Mois précédents
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {[...capsulesLiees]
              .sort((a, b) => new Date(b.dateCreation || 0) - new Date(a.dateCreation || 0))
              .map(c => {
                const nb     = c.contributions?.length || 0;
                const dateMois = c.dateCreation
                  ? new Date(c.dateCreation).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
                  : "";
                const hasPhoto = c.contributions?.find(ct => ct.type === "photo" && ct.media);
                return (
                  <button key={c.id} onClick={() => allerVers("detail", c.id)}
                    style={{ display:"flex", alignItems:"center", gap:12, background:"#fff",
                      border:"1.5px solid rgba(255,140,90,.25)", borderRadius:18, padding:"12px 14px",
                      cursor:"pointer", width:"100%", textAlign:"left",
                      boxShadow:"0 3px 12px rgba(255,90,32,.07)" }}>
                    {/* Vignette */}
                    <div style={{ width:48, height:48, borderRadius:12, flexShrink:0, overflow:"hidden",
                      background: hasPhoto ? "none" : "linear-gradient(135deg,#FFE4CC,#FFB37A)",
                      display:"flex", alignItems:"center", justifyContent:"center" }}>
                      {hasPhoto
                        ? <img src={hasPhoto.media} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                        : <span style={{ fontSize:22 }}>📅</span>
                      }
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:700, fontSize:14, color:"#3D1A0A",
                        overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{c.nom}</div>
                      <div style={{ fontSize:12, color:"#A07850", marginTop:2 }}>
                        {nb} souvenir{nb !== 1 ? "s" : ""}{dateMois ? ` · ${dateMois}` : ""}
                      </div>
                    </div>
                    <span style={{ fontSize:18, color:"#FF8C5A", flexShrink:0 }}>→</span>
                  </button>
                );
              })}
          </div>
        </div>
      )}

      {/* Suppression (créateur) ou départ (participant) */}
      {(() => {
        const estCreateur = moi?.id === capsule.createurId;
        const monParticipant = capsule.participants?.find(p => p.userId === moi?.id);
        if (estCreateur && supprimerCapsule) return (
          <div style={{ marginTop: 32, paddingTop: 16, borderTop: `1px solid ${COULEURS.bordure}` }}>
            {!confirmSuppression ? (
              <button onClick={() => setConfirmSuppression(true)}
                style={{ background: "none", border: "none", color: COULEURS.doux, fontSize: 12,
                  cursor: "pointer", padding: "4px 0", fontFamily: "'Plus Jakarta Sans', sans-serif",
                  opacity: 0.6, textDecoration: "underline" }}>
                🗑️ Supprimer cette capsule
              </button>
            ) : (
              <div style={{ background: "#FFF1F1", borderRadius: 14, padding: "14px 16px", border: "1px solid #FECACA" }}>
                <p style={{ margin: "0 0 12px", fontSize: 13, color: "#7F1D1D", fontWeight: 600,
                  fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                  Supprimer « {capsule.nom} » ? Tous les souvenirs seront perdus définitivement.
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => supprimerCapsule(capsule.id)}
                    style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "none",
                      background: "#DC2626", color: "#fff", fontWeight: 700, fontSize: 13,
                      cursor: "pointer", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                    Oui, supprimer
                  </button>
                  <button onClick={() => setConfirmSuppression(false)}
                    style={{ flex: 1, padding: "10px 0", borderRadius: 10,
                      border: `1px solid ${COULEURS.bordure}`, background: "none",
                      color: COULEURS.doux, fontWeight: 600, fontSize: 13,
                      cursor: "pointer", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                    Annuler
                  </button>
                </div>
              </div>
            )}
          </div>
        );
        if (!estCreateur && monParticipant && quitterCapsule) return (
          <div style={{ marginTop: 32, paddingTop: 16, borderTop: `1px solid ${COULEURS.bordure}` }}>
            {!confirmSuppression ? (
              <button onClick={() => setConfirmSuppression(true)}
                style={{ background: "none", border: "none", color: COULEURS.doux, fontSize: 12,
                  cursor: "pointer", padding: "4px 0", fontFamily: "'Plus Jakarta Sans', sans-serif",
                  opacity: 0.6, textDecoration: "underline" }}>
                🚪 Quitter cette capsule
              </button>
            ) : (
              <div style={{ background: "#FFF1F1", borderRadius: 14, padding: "14px 16px", border: "1px solid #FECACA" }}>
                <p style={{ margin: "0 0 12px", fontSize: 13, color: "#7F1D1D", fontWeight: 600,
                  fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                  Quitter « {capsule.nom} » ? Vous n'y aurez plus accès.
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => quitterCapsule(capsule.id, monParticipant.id)}
                    style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "none",
                      background: "#DC2626", color: "#fff", fontWeight: 700, fontSize: 13,
                      cursor: "pointer", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                    Oui, quitter
                  </button>
                  <button onClick={() => setConfirmSuppression(false)}
                    style={{ flex: 1, padding: "10px 0", borderRadius: 10,
                      border: `1px solid ${COULEURS.bordure}`, background: "none",
                      color: COULEURS.doux, fontWeight: 600, fontSize: 13,
                      cursor: "pointer", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                    Annuler
                  </button>
                </div>
              </div>
            )}
          </div>
        );
        return null;
      })()}
    </div>
  );
}

// Section impression — choix du rythme, navigue vers la page de tarifs
function SectionImpression({ capsule, allerVers }) {
  const rythmes = [
    { id: "mensuel",      label: "📅 Tous les mois",   badge: "Populaire" },
    { id: "trimestriel",  label: "📅 Tous les 3 mois"  },
    { id: "semestriel",   label: "📅 Tous les 6 mois"  },
    { id: "annuel",       label: "📅 Une fois par an"   },
  ];

  return (
    <div style={{ marginTop: 24, background: "var(--carte-bg)", borderRadius: 20, padding: "18px 16px",
      border: `1px solid ${COULEURS.bordure}`, boxShadow: "0 4px 16px rgba(46,34,48,0.06)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 20 }}>📖</span>
        <span style={{ fontWeight: 800, fontSize: 15, color: COULEURS.encre }}>Album papier</span>
      </div>
      <p style={{ fontSize: 12, color: COULEURS.doux, margin: "0 0 12px", lineHeight: 1.6 }}>
        Recevez vos souvenirs imprimés selon le rythme qui vous convient.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rythmes.map(r => (
          <button key={r.id}
            onClick={() => allerVers("tarifs_impression", capsule.id)}
            style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
              background: "rgba(0,0,0,0.03)", border: `1px solid ${COULEURS.bordure}`,
              borderRadius: 12, padding: "10px 14px", fontSize: 13, fontWeight: 600,
              color: COULEURS.encre, textAlign: "left", cursor: "pointer",
              fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            <span>{r.label}</span>
            {r.badge && (
              <span style={{ fontSize: 10, fontWeight: 800, background: COULEURS.corail,
                color: "#fff", borderRadius: 999, padding: "2px 8px" }}>{r.badge}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// Liste triable par pression longue (450 ms) puis glisser.
// Deux affichages : grille compacte 3 colonnes (défaut) ou liste complète (accessibilité).
// L'ordre et la préférence d'affichage sont persistés dans localStorage.
function TriableTypes({ onSelect, capsule, onUpgradeMedia }) {
  const [ordre, setOrdre] = React.useState(() => {
    try {
      const s = localStorage.getItem("blooom_ordre_types");
      if (s) {
        const ids = JSON.parse(s);
        const sauvés  = ids.map(id => TYPES_CONTRIBUTION.find(t => t.id === id)).filter(Boolean);
        const nouveaux = TYPES_CONTRIBUTION.filter(t => !ids.includes(t.id));
        return [...sauvés, ...nouveaux];
      }
    } catch {}
    return [...TYPES_CONTRIBUTION];
  });

  const [affichage, setAffichage] = React.useState(
    () => localStorage.getItem("blooom_affichage_types") || "compact"
  );
  const [visuel, setVisuel]     = React.useState(ordre);
  const [dragging, setDragging] = React.useState(false);
  const drag        = React.useRef({ active: false, id: null, snap: null });
  const rows        = React.useRef([]);
  const container   = React.useRef(null);
  const timer       = React.useRef(null);
  const justDropped = React.useRef(false);

  React.useEffect(() => {
    const el = container.current;
    if (!el) return;
    const handler = (e) => {
      if (!drag.current.active) return;
      e.preventDefault();
      reordonner(e.touches[0].clientX, e.touches[0].clientY);
    };
    el.addEventListener("touchmove", handler, { passive: false });
    return () => el.removeEventListener("touchmove", handler);
  }, []);

  // Distance 2D pour que le drag fonctionne aussi en grille (pas seulement en liste).
  function reordonner(x, y) {
    let best = 0, minD = Infinity;
    rows.current.forEach((row, i) => {
      if (!row) return;
      const r = row.getBoundingClientRect();
      const d = Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2));
      if (d < minD) { minD = d; best = i; }
    });
    const { id, snap } = drag.current;
    const sans   = snap.filter(t => t.id !== id);
    const glissé = snap.find(t => t.id === id);
    const next   = [...sans];
    next.splice(best, 0, glissé);
    setVisuel(next);
  }

  function commencerPression(id) {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      drag.current = { active: true, id, snap: [...ordre] };
      navigator.vibrate?.(40);
      setDragging(true);
    }, 450);
  }

  function onMouseMove(e) {
    if (!drag.current.active) return;
    reordonner(e.clientX, e.clientY);
  }

  function deposer() {
    clearTimeout(timer.current);
    if (drag.current.active) {
      justDropped.current = true;
      setOrdre(visuel);
      try { localStorage.setItem("blooom_ordre_types", JSON.stringify(visuel.map(t => t.id))); } catch {}
    }
    drag.current = { active: false, id: null, snap: null };
    setDragging(false);
  }

  function basculerAffichage() {
    const next = affichage === "compact" ? "liste" : "compact";
    setAffichage(next);
    localStorage.setItem("blooom_affichage_types", next);
  }

  // Calcule le statut quota d'un type de contribution pour cette capsule
  function statutQuota(typeId) {
    if (!capsule) return null;
    const res = peutContribuer(capsule, typeId);
    if (!res.peut) {
      if (res.raison === "type_non_disponible") return { badge: "Non disponible", couleur: COULEURS.doux, grise: true, raison: "type_non_disponible" };
      if (res.raison === "quota_atteint") return { badge: "Limite atteinte", couleur: "#FF5C5C", grise: true, raison: "quota_atteint" };
    }
    return null;
  }

  const handlers = (id, locked = false) => locked ? {} : ({
    onMouseDown:  () => commencerPression(id),
    onMouseUp:    () => clearTimeout(timer.current),
    onTouchStart: () => commencerPression(id),
    onClick:      () => { if (justDropped.current) { justDropped.current = false; return; } onSelect(id); },
  });

  return (
    <div>
      {/* Bouton de bascule discret en haut à droite */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <button onClick={basculerAffichage}
          style={{ background: "none", border: "none", color: COULEURS.doux, fontSize: 12, fontWeight: 600, cursor: "pointer", padding: "2px 0" }}>
          {affichage === "compact" ? "☰ Affichage liste" : "⊞ Affichage compact"}
        </button>
      </div>

      {/* Grille compacte — 3 colonnes, tuiles icône + libellé */}
      {affichage === "compact" && (
        <div ref={container} onMouseMove={onMouseMove} onMouseUp={deposer} onTouchEnd={deposer}
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, gridAutoRows: "80px", overflow: "visible" }}>
          {visuel.map((t, i) => {
            const saisi = dragging && drag.current.id === t.id;
            const sq = statutQuota(t.id);
            return (
              <div key={t.id} ref={el => rows.current[i] = el}
                style={{ transform: saisi ? "scale(1.06)" : "scale(1)", transition: dragging && !saisi ? "transform 0.12s" : "none", position: "relative" }}>
                <button style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 5, background: "#fff", border: "none", borderRadius: 14, padding: "8px 6px", width: "100%", height: "100%", cursor: sq?.grise ? "default" : dragging ? "grabbing" : "pointer", fontFamily: "'Plus Jakarta Sans', sans-serif", boxShadow: "0 3px 10px rgba(46,34,48,0.06)", opacity: saisi ? 0.45 : 1, overflow: "hidden", position: "relative" }}
                  {...handlers(t.id, sq?.grise)}>
                  <span style={{ fontSize: 24, opacity: sq?.grise ? 0.35 : 1 }}>{t.icone}</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: COULEURS.encre, textAlign: "center", lineHeight: 1.3, opacity: sq?.grise ? 0.35 : 1 }}>{t.nom}</span>
                  {sq?.grise && (
                    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
                      background: "rgba(255,255,255,0.55)", borderRadius: 14 }}>
                      <span style={{ fontSize: 9, fontWeight: 800, color: sq.couleur, textAlign: "center",
                        background: "#fff", borderRadius: 6, padding: "2px 6px",
                        boxShadow: "0 1px 4px rgba(0,0,0,0.10)" }}>{sq.badge}</span>
                    </div>
                  )}
                </button>
                {sq?.grise && sq.raison === "type_non_disponible" && onUpgradeMedia && (
                  <button
                    onMouseDown={e => e.stopPropagation()}
                    onClick={e => { e.stopPropagation(); onUpgradeMedia(capsule?.id); }}
                    style={{ position: "absolute", top: -8, right: -8,
                      background: "linear-gradient(135deg,#FF8A3D,#FF5C5C)",
                      border: "none", borderRadius: 10, padding: "3px 8px", fontSize: 9, fontWeight: 700,
                      color: "#fff", cursor: "pointer", lineHeight: 1.4, zIndex: 10,
                      boxShadow: "0 2px 8px rgba(255,92,92,0.45)", whiteSpace: "nowrap" }}>
                    + Débloquer
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Affichage liste — identique à l'original, pour accessibilité */}
      {affichage === "liste" && (
        <div ref={container} onMouseMove={onMouseMove} onMouseUp={deposer} onTouchEnd={deposer}>
          {visuel.map((t, i) => {
            const saisi = dragging && drag.current.id === t.id;
            const sq = statutQuota(t.id);
            return (
              <div key={t.id} ref={el => rows.current[i] = el}
                style={{ opacity: saisi ? 0.45 : 1, transform: saisi ? "scale(1.03)" : "scale(1)", transition: dragging && !saisi ? "transform 0.12s, opacity 0.12s" : "none", position: "relative" }}>
                <button style={{ ...S.choixContrib, cursor: sq?.grise ? "default" : dragging ? "grabbing" : "default",
                  opacity: sq?.grise ? 0.45 : 1, overflow: "hidden", position: "relative" }}
                  {...handlers(t.id, sq?.grise)}>
                  <span style={{ fontSize: 22, marginRight: 12 }}>{t.icone}</span>
                  <span style={{ flex: 1, textAlign: "left" }}>{t.nom}</span>
                  {sq?.grise
                    ? <span style={{ fontSize: 10, fontWeight: 700, color: sq.couleur, whiteSpace: "nowrap" }}>{sq.badge}</span>
                    : <span style={{ color: COULEURS.doux, fontSize: 16, userSelect: "none" }}>⠿</span>}
                </button>
                {sq?.grise && sq.raison === "type_non_disponible" && onUpgradeMedia && (
                  <button
                    onMouseDown={e => e.stopPropagation()}
                    onClick={e => { e.stopPropagation(); onUpgradeMedia(capsule?.id); }}
                    style={{ position: "absolute", top: 4, right: 4,
                      background: "linear-gradient(135deg,#FF8A3D,#FF5C5C)",
                      border: "none", borderRadius: 10, padding: "3px 8px", fontSize: 9, fontWeight: 700,
                      color: "#fff", cursor: "pointer", lineHeight: 1.4, zIndex: 10,
                      boxShadow: "0 2px 8px rgba(255,92,92,0.45)", whiteSpace: "nowrap" }}>
                    + Débloquer
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Convertit un code météo WMO en libellé + emoji.
function descriptionMeteo(code) {
  if (code === 0)   return { texte: "Ciel dégagé",           icone: "☀️",  cle: "soleil" };
  if (code <= 3)    return { texte: "Partiellement nuageux",  icone: "⛅",  cle: "nuageux" };
  if (code <= 48)   return { texte: "Brouillard",             icone: "🌫️", cle: "brouillard" };
  if (code <= 55)   return { texte: "Bruine",                 icone: "🌦️", cle: "bruine" };
  if (code <= 65)   return { texte: "Pluie",                  icone: "🌧️", cle: "pluie" };
  if (code <= 75)   return { texte: "Neige",                  icone: "❄️", cle: "neige" };
  if (code <= 82)   return { texte: "Averses",                icone: "🌧️", cle: "averses" };
  if (code <= 99)   return { texte: "Orage",                  icone: "⛈️", cle: "orage" };
  return { texte: "Indéfini", icone: "🌡️", cle: "soleil" };
}

// Gradient de fond selon la condition météo.
function fondMeteo(cle) {
  const fonds = {
    soleil:      "linear-gradient(160deg, #FFD93D 0%, #FF8A3D 55%, #FF5C3A 100%)",
    nuageux:     "linear-gradient(160deg, #89AFCF 0%, #B8CFDF 55%, #E0EAF2 100%)",
    brouillard:  "linear-gradient(160deg, #A0ADB8 0%, #C8D2DA 55%, #E2E8EE 100%)",
    bruine:      "linear-gradient(160deg, #5B8FA8 0%, #8DAFC4 55%, #C2D6E4 100%)",
    pluie:       "linear-gradient(160deg, #2C5F7A 0%, #4D7CFF 55%, #7EB3CC 100%)",
    neige:       "linear-gradient(160deg, #B8D4E8 0%, #D8ECF7 55%, #F0F8FF 100%)",
    averses:     "linear-gradient(160deg, #3A5A7A 0%, #5580A0 55%, #8AAFC8 100%)",
    orage:       "linear-gradient(160deg, #1C2A3A 0%, #2E4460 55%, #4A6080 100%)",
  };
  return fonds[cle] || fonds.soleil;
}

// Couleur du texte selon le fond (clair ou sombre).
function texteMeteo(cle) {
  return ["orage", "pluie", "averses"].includes(cle) ? "#fff" : "#1c2a3a";
}

// Illustration SVG selon la clé météo.
function IllustrationMeteo({ cle, taille = 130 }) {
  const c = taille / 2;
  if (cle === "soleil") return (
    <svg width={taille} height={taille} viewBox="0 0 130 130">
      <defs><radialGradient id="sg"><stop offset="0%" stopColor="#FFE066"/><stop offset="100%" stopColor="#FF8A3D"/></radialGradient></defs>
      {[0,30,60,90,120,150,180,210,240,270,300,330].map(a => <line key={a} x1={65+Math.cos(a*Math.PI/180)*38} y1={65+Math.sin(a*Math.PI/180)*38} x2={65+Math.cos(a*Math.PI/180)*56} y2={65+Math.sin(a*Math.PI/180)*56} stroke="#FF8A3D" strokeWidth="4" strokeLinecap="round" opacity="0.7"/>)}
      <circle cx="65" cy="65" r="28" fill="url(#sg)"/>
    </svg>
  );
  if (cle === "nuageux") return (
    <svg width={taille} height={taille} viewBox="0 0 130 130">
      <defs><radialGradient id="sg2"><stop offset="0%" stopColor="#FFE066"/><stop offset="100%" stopColor="#FF8A3D"/></radialGradient></defs>
      {[0,40,80,120,160,200,240,280,320].map(a => <line key={a} x1={45+Math.cos(a*Math.PI/180)*22} y1={44+Math.sin(a*Math.PI/180)*22} x2={45+Math.cos(a*Math.PI/180)*34} y2={44+Math.sin(a*Math.PI/180)*34} stroke="#FF8A3D" strokeWidth="3" strokeLinecap="round" opacity="0.6"/>)}
      <circle cx="45" cy="44" r="18" fill="url(#sg2)"/>
      <ellipse cx="72" cy="78" rx="32" ry="20" fill="#dde8f5"/>
      <ellipse cx="52" cy="82" rx="22" ry="16" fill="#edf3fb"/>
      <ellipse cx="88" cy="82" rx="20" ry="15" fill="#edf3fb"/>
      <ellipse cx="70" cy="72" rx="26" ry="18" fill="#fff"/>
    </svg>
  );
  if (cle === "brouillard") return (
    <svg width={taille} height={taille} viewBox="0 0 130 130">
      {[38,54,70,86].map((y,i) => <rect key={y} x={14+i*4} y={y} width={102-i*8} height="8" rx="4" fill="#b0bec5" opacity={0.5+i*0.12}/>)}
    </svg>
  );
  if (cle === "bruine" || cle === "pluie" || cle === "averses") {
    const heavy = cle === "averses";
    return (
      <svg width={taille} height={taille} viewBox="0 0 130 130">
        <ellipse cx="65" cy="52" rx="36" ry="22" fill="#90a4c0"/>
        <ellipse cx="45" cy="58" rx="26" ry="18" fill="#b0c4d8"/>
        <ellipse cx="82" cy="57" rx="24" ry="17" fill="#b0c4d8"/>
        <ellipse cx="64" cy="48" rx="30" ry="20" fill="#cfd8e3"/>
        {(heavy ? [28,46,64,82,100,37,55,73,91] : [34,58,82,46,70]).map((x,i) => (
          <line key={x} x1={x} y1={76+i%2*6} x2={x-5} y2={96+i%2*6} stroke="#4D7CFF" strokeWidth={heavy?2.5:2} strokeLinecap="round" opacity="0.75"/>
        ))}
      </svg>
    );
  }
  if (cle === "neige") return (
    <svg width={taille} height={taille} viewBox="0 0 130 130">
      <ellipse cx="65" cy="50" rx="36" ry="22" fill="#cfd8e3"/>
      <ellipse cx="45" cy="56" rx="26" ry="18" fill="#dde6ef"/>
      <ellipse cx="84" cy="55" rx="24" ry="17" fill="#dde6ef"/>
      <ellipse cx="64" cy="46" rx="30" ry="20" fill="#eef2f7"/>
      {[30,50,70,90,40,60,80].map((x,i) => <text key={x} x={x} y={80+i%3*12} fontSize="14" fill="#4D7CFF" opacity="0.8" textAnchor="middle">❄</text>)}
    </svg>
  );
  if (cle === "orage") return (
    <svg width={taille} height={taille} viewBox="0 0 130 130">
      <ellipse cx="65" cy="46" rx="40" ry="26" fill="#546e7a"/>
      <ellipse cx="43" cy="54" rx="28" ry="20" fill="#607d8b"/>
      <ellipse cx="86" cy="53" rx="25" ry="19" fill="#607d8b"/>
      <ellipse cx="64" cy="42" rx="33" ry="22" fill="#78909c"/>
      <polygon points="72,66 60,66 56,90 66,88 62,110 80,82 68,84" fill="#FFE066" opacity="0.9"/>
    </svg>
  );
  return <span style={{ fontSize: 80 }}>🌡️</span>;
}

// Lecteur vocal pour la découverte d'une capsule — sans bouton Recommencer, design immersif.
function LecteurVocalOuverture({ url }) {
  const audioRef = React.useRef(null);
  const rafRef   = React.useRef(null);
  const [playing, setPlaying]   = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [duree, setDuree]       = React.useState(0);
  const [courant, setCourant]   = React.useState(0);

  function startRaf() {
    function tick() {
      const a = audioRef.current;
      if (a && a.duration) { setCourant(a.currentTime); setProgress(a.currentTime / a.duration); }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
  }
  function stopRaf() { if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; } }
  React.useEffect(() => () => stopRaf(), []);

  function fmt(s) { const m = Math.floor(s / 60), sec = Math.floor(s % 60); return `${m}:${sec.toString().padStart(2, "0")}`; }

  function togglePlay() {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); stopRaf(); setPlaying(false); }
    else { a.play(); startRaf(); setPlaying(true); }
  }

  function onLoadedMetadata() { if (audioRef.current) setDuree(audioRef.current.duration); }
  function onEnded() { stopRaf(); setPlaying(false); setProgress(0); setCourant(0); if (audioRef.current) audioRef.current.currentTime = 0; }

  function seek(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const a = audioRef.current;
    if (a && a.duration) { a.currentTime = ratio * a.duration; setProgress(ratio); setCourant(a.currentTime); }
  }

  return (
    <div style={{ borderRadius: 24, background: COULEURS.encre, padding: "28px 20px", position: "relative", overflow: "hidden" }}>
      {/* blobs décoratifs */}
      <div style={{ position: "absolute", top: -40, right: -40, width: 160, height: 160, borderRadius: "50%", background: "radial-gradient(circle, rgba(198,92,232,0.3) 0%, transparent 70%)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: -30, left: -30, width: 120, height: 120, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,92,157,0.22) 0%, transparent 70%)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", top: "40%", left: "55%", width: 80, height: 80, borderRadius: "50%", background: "radial-gradient(circle, rgba(77,124,255,0.18) 0%, transparent 70%)", pointerEvents: "none" }} />

      {/* Icône centrale animée */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
        <div style={{ width: 72, height: 72, borderRadius: "50%", background: "linear-gradient(135deg,#FF8A3D,#FF5C9D,#C65CE8)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, boxShadow: playing ? "0 0 0 12px rgba(255,92,157,0.18), 0 0 0 24px rgba(255,92,157,0.08)" : "0 6px 24px rgba(255,92,157,0.4)", transition: "box-shadow 0.4s" }}>
          🎙️
        </div>
      </div>

      {/* Titre + durée */}
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: "#fff", marginBottom: 4 }}>Message vocal</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)" }}>{duree ? fmt(duree) : "…"}</div>
      </div>

      {/* Barre de progression */}
      <div onClick={seek} style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.1)", cursor: "pointer", marginBottom: 8, position: "relative" }}>
        <div style={{ height: "100%", borderRadius: 3, background: "linear-gradient(90deg,#FF8A3D,#FF5C9D,#C65CE8)", width: `${progress * 100}%` }} />
        {/* curseur */}
        <div style={{ position: "absolute", top: "50%", left: `${progress * 100}%`, transform: "translate(-50%, -50%)", width: 14, height: 14, borderRadius: "50%", background: "#fff", boxShadow: "0 2px 8px rgba(0,0,0,0.3)", pointerEvents: "none" }} />
      </div>

      {/* Temps */}
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 24 }}>
        <span>{fmt(courant)}</span>
        <span>-{fmt(Math.max(0, duree - courant))}</span>
      </div>

      {/* Bouton play/pause */}
      <div style={{ display: "flex", justifyContent: "center" }}>
        <button onClick={togglePlay} style={{ width: 64, height: 64, borderRadius: "50%", background: "linear-gradient(135deg,#FF8A3D,#FF5C9D,#C65CE8)", border: "none", cursor: "pointer", fontSize: 24, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 6px 24px rgba(255,92,157,0.5)", fontFamily: "inherit" }}>
          {playing ? "⏸" : "▶"}
        </button>
      </div>

      <audio ref={audioRef} src={url} onLoadedMetadata={onLoadedMetadata} onEnded={onEnded} style={{ display: "none" }} />
    </div>
  );
}

// Lecteur audio stylisé post-enregistrement vocal
function LecteurVocal({ url, onRecommencer }) {
  const audioRef = React.useRef(null);
  const rafRef   = React.useRef(null);
  const [playing, setPlaying] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [duree, setDuree] = React.useState(0);
  const [courant, setCourant] = React.useState(0);

  // Boucle RAF : mise à jour ~60fps pendant la lecture
  function startRaf() {
    function tick() {
      const a = audioRef.current;
      if (a && a.duration) {
        setCourant(a.currentTime);
        setProgress(a.currentTime / a.duration);
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
  }
  function stopRaf() {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
  }

  React.useEffect(() => () => stopRaf(), []);

  function fmt(s) {
    const m = Math.floor(s / 60), sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }

  function togglePlay() {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); stopRaf(); setPlaying(false); }
    else { a.play(); startRaf(); setPlaying(true); }
  }

  function onLoadedMetadata() {
    const a = audioRef.current;
    if (a) setDuree(a.duration);
  }

  function onEnded() {
    stopRaf();
    setPlaying(false); setProgress(0); setCourant(0);
    if (audioRef.current) audioRef.current.currentTime = 0;
  }

  function seek(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const a = audioRef.current;
    if (a && a.duration) { a.currentTime = ratio * a.duration; setProgress(ratio); setCourant(a.currentTime); }
  }

  return (
    <div style={{ marginTop: 14, borderRadius: 20, background: COULEURS.encre, padding: "20px 18px 24px", position: "relative", overflow: "hidden", flexShrink: 0 }}>
      {/* blobs décoratifs */}
      <div style={{ position: "absolute", top: -30, right: -30, width: 120, height: 120, borderRadius: "50%", background: "radial-gradient(circle, rgba(198,92,232,0.25) 0%, transparent 70%)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: -20, left: -20, width: 90, height: 90, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,92,157,0.2) 0%, transparent 70%)", pointerEvents: "none" }} />

      {/* icône + titre */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div style={{ width: 44, height: 44, borderRadius: "50%", background: "linear-gradient(135deg,#FF8A3D,#FF5C9D,#C65CE8)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>
          🎙️
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#fff" }}>Message vocal</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 1 }}>{duree ? fmt(duree) : "…"}</div>
        </div>
      </div>

      {/* barre de progression cliquable */}
      <div onClick={seek} style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.12)", cursor: "pointer", marginBottom: 10, position: "relative" }}>
        <div style={{ height: "100%", borderRadius: 3, background: "linear-gradient(90deg,#FF8A3D,#FF5C9D,#C65CE8)", width: `${progress * 100}%` }} />
      </div>

      {/* temps courant / restant */}
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "rgba(255,255,255,0.45)", marginBottom: 16 }}>
        <span>{fmt(courant)}</span>
        <span>-{fmt(Math.max(0, duree - courant))}</span>
      </div>

      {/* bouton play/pause */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
        <button onClick={togglePlay} style={{ width: 60, height: 60, borderRadius: "50%", background: "linear-gradient(135deg,#FF8A3D,#FF5C9D,#C65CE8)", border: "none", cursor: "pointer", fontSize: 22, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 20px rgba(255,92,157,0.45)" }}>
          {playing ? "⏸" : "▶"}
        </button>
      </div>

      {/* recommencer */}
      <button onClick={onRecommencer} style={{ display: "block", width: "100%", background: "rgba(255,255,255,0.12)", border: "1.5px solid rgba(255,255,255,0.35)", color: "#fff", borderRadius: 14, padding: "11px 0", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'Plus Jakarta Sans', sans-serif", marginTop: 4 }}>
        🔄 Recommencer
      </button>

      <audio ref={audioRef} src={url} onLoadedMetadata={onLoadedMetadata} onEnded={onEnded} style={{ display: "none" }} />
    </div>
  );
}

// Canvas tactile pour dessiner avec le doigt ou la souris.
// Sauvegarde le résultat en base64 PNG via onSave().
function CanvasDessin({ onSave }) {
  const canvasRef = React.useRef(null);
  const dessinant = React.useRef(false);
  const historique = React.useRef([]); // snapshots ImageData avant chaque trait
  const [couleur, setCouleur] = React.useState("#1c1014");
  const [valide, setValide] = React.useState(false);
  const [peutAnnuler, setPeutAnnuler] = React.useState(false);
  const PALETTE = ["#1c1014", "#FF5C9D", "#FF8A3D", "#4D7CFF", "#C65CE8", "#22c55e", "#ffffff"];

  React.useEffect(() => {
    const ctx = canvasRef.current.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
  }, []);

  function getXY(e) {
    const r = canvasRef.current.getBoundingClientRect();
    const scaleX = canvasRef.current.width  / r.width;
    const scaleY = canvasRef.current.height / r.height;
    const src = e.touches ? e.touches[0] : e;
    return [(src.clientX - r.left) * scaleX, (src.clientY - r.top) * scaleY];
  }

  function debut(e) {
    e.preventDefault();
    // Sauvegarde l'état du canvas avant de commencer le trait
    const c = canvasRef.current;
    historique.current.push(c.getContext("2d").getImageData(0, 0, c.width, c.height));
    setPeutAnnuler(true);
    dessinant.current = true;
    const ctx = c.getContext("2d");
    const [x, y] = getXY(e);
    ctx.beginPath(); ctx.moveTo(x, y);
  }

  function trace(e) {
    e.preventDefault();
    if (!dessinant.current) return;
    const ctx = canvasRef.current.getContext("2d");
    ctx.lineWidth = 4; ctx.lineCap = "round"; ctx.strokeStyle = couleur;
    const [x, y] = getXY(e);
    ctx.lineTo(x, y); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x, y);
    setValide(false);
  }

  function fin(e) { e.preventDefault(); dessinant.current = false; }

  function annuler() {
    if (!historique.current.length) return;
    const snap = historique.current.pop();
    canvasRef.current.getContext("2d").putImageData(snap, 0, 0);
    setPeutAnnuler(historique.current.length > 0);
    onSave(null); setValide(false);
  }

  function effacer() {
    const ctx = canvasRef.current.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    historique.current = [];
    setPeutAnnuler(false);
    onSave(null); setValide(false);
  }

  function valider() {
    onSave(canvasRef.current.toDataURL("image/png"));
    setValide(true);
  }

  return (
    <div>
      <canvas ref={canvasRef} width={600} height={400}
        style={{ borderRadius: 16, border: "2px solid #eee", touchAction: "none", cursor: "crosshair", display: "block", width: "100%", background: "#fff" }}
        onMouseDown={debut} onMouseMove={trace} onMouseUp={fin} onMouseLeave={fin}
        onTouchStart={debut} onTouchMove={trace} onTouchEnd={fin}
      />
      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
        {PALETTE.map(c => (
          <button key={c} onClick={() => setCouleur(c)}
            style={{ width: 26, height: 26, borderRadius: "50%", background: c, border: couleur === c ? "3px solid #FF5C9D" : "2px solid #ddd", cursor: "pointer", flexShrink: 0 }} />
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button style={{ ...S.boutonMiniGris, flex: 1, opacity: peutAnnuler ? 1 : 0.4 }} onClick={annuler} disabled={!peutAnnuler}>↩ Annuler</button>
        <button style={{ ...S.boutonMiniGris, flex: 1 }} onClick={effacer}>🗑️ Effacer</button>
        <button style={{ ...S.boutonMini, flex: 1, ...(valide ? { background: "#22c55e" } : {}) }} onClick={valider}>
          {valide ? "✓ Validé" : "✓ Valider"}
        </button>
      </div>
    </div>
  );
}

// ============================================================================
//  ÉCRAN SUCCÈS PACK INOUBLIABLE — affiché après l'achat d'un pack occasion
//  Formulaire post-paiement : nommer + typer + dater la capsule payante.
// ============================================================================
function EcranSuccesPack({ creerCapsule, allerVers, capsuleWebhookId, setCapsules }) {
  const [nom, setNom]         = useState("");
  const [type, setType]       = useState(null);
  const [date, setDate]       = useState("");
  const [enCours, setEnCours] = useState(false);

  const peutCreer = nom.trim().length > 0 && type !== null;

  async function validerCreation() {
    setEnCours(true);
    try {
      if (capsuleWebhookId) {
        // Met à jour la capsule déjà créée par le webhook — évite le doublon
        await supabase.from("capsules").update({
          nom: nom.trim(), type, date_ouverture: date || null,
        }).eq("id", capsuleWebhookId);
        setCapsules(prev => prev.map(c =>
          c.id === capsuleWebhookId ? { ...c, nom: nom.trim(), type, dateOuverture: date || null } : c
        ));
        allerVers("capsules");
      } else {
        await creerCapsule({ nom: nom.trim(), type, dateOuverture: date || null, couverture: null, formule: "occasion", ecranSucces: "capsules" });
      }
    } catch (e) {
      alert("Erreur : " + e.message);
      setEnCours(false);
    }
  }

  return (
    <div style={S.ecran}>
      {/* Bandeau pack */}
      <div style={{
        background: "linear-gradient(160deg,#1e1b4b 0%,#4c1d95 60%,#6d28d9 100%)",
        padding: "44px 24px 22px", position: "relative", overflow: "hidden",
        borderRadius: 24, margin: "0 0 20px", flexShrink: 0,
      }}>
        <div style={{ position: "absolute", top: -10, right: -10, fontSize: 80, opacity: 0.07, lineHeight: 1 }}>🎉</div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 36, lineHeight: 1 }}>🎉</div>
          <div>
            <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 800,
              fontSize: 18, color: "#fff" }}>Pack Inoubliable activé !</div>
            <div style={{ fontSize: 11, color: "rgba(167,139,250,0.9)", marginTop: 2,
              fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              Donnez un nom et une date à votre capsule
            </div>
          </div>
        </div>
      </div>

      {/* Inclus Pack Inoubliable */}
      <div style={{ background: "#EEF2FF", border: "1.5px solid #C7D2FE", borderRadius: 16,
        padding: "12px 16px", marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: "#3730a3", marginBottom: 6, letterSpacing: 0.3 }}>
          ✅ Inclus dans votre Pack Inoubliable
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "5px 14px" }}>
          {["📷 150 photos", "🎬 20 vidéos", "🎤 10 vocaux", "👥 50 participants"].map((item, i) => (
            <div key={i} style={{ fontSize: 12, color: "#3730a3", fontWeight: 600,
              fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{item}</div>
          ))}
        </div>
      </div>

      <label style={S.label}>Nom de la capsule</label>
      <input style={S.input} placeholder="Ex. Soirée chez Jules, Road trip Espagne…"
        value={nom} onChange={e => setNom(e.target.value)} />

      <label style={S.label}>Quel type ?</label>
      <div style={S.grilleTypes}>
        {TYPES_CAPSULES.filter(t => ["weekend","evjf","soiree","festival","libre"].includes(t.id)).map(t => (
          <button key={t.id} onMouseDown={e => e.preventDefault()} onClick={() => setType(t.id)}
            style={{ ...S.tuileType,
              border: type === t.id ? `2px solid ${t.teinte}` : "2px solid transparent",
              background: type === t.id ? t.teinte + "18" : "#fff",
              transform: type === t.id ? "scale(1.04)" : "scale(1)",
              boxShadow: type === t.id ? `0 4px 14px ${t.teinte}44` : "0 3px 10px rgba(46,34,48,0.06)",
              transition: "transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease" }}>
            <div style={{ ...S.tuileIcone, background: t.teinte + "22" }}>{t.icone}</div>
            <div style={S.tuileTypeNom}>{t.nom === "Capsule libre" ? "Autres" : t.nom === "EVJF / EVG" ? "EVG / EVJF" : t.nom}</div>
          </button>
        ))}
      </div>

      <label style={{ ...S.label, marginTop: 18 }}>Date d'ouverture</label>
      <SelecteurDate valeur={date} onChange={setDate} />

      <button style={{ ...S.boutonPrincipal, ...(!peutCreer || enCours ? S.boutonDesactive : {}),
        background: peutCreer ? "linear-gradient(135deg,#3730a3,#6d28d9)" : undefined }}
        disabled={!peutCreer || enCours} onClick={validerCreation}>
        {enCours ? "Création en cours…" : "Créer la capsule →"}
      </button>
    </div>
  );
}

// ============================================================================
//  ÉCRAN SUCCÈS MARIAGE : formulaire de création post-paiement — design wedding
// ============================================================================
function EcranSuccesMariage({ creerCapsule, allerVers, capsuleWebhookId, setCapsules }) {
  const [nom, setNom]                     = useState("");
  const [date, setDate]                   = useState("");
  const [couverture, setCouverture]       = useState(null);
  const [preview, setPreview]             = useState(null);
  const [srcRecadrageCouv, setSrcRecadrageCouv] = useState(null);
  const [enCours, setEnCours]             = useState(false);

  const peutCreer = nom.trim().length > 0;

  function onPhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = ev => setSrcRecadrageCouv(ev.target.result);
    r.readAsDataURL(file);
  }

  async function validerCreation() {
    setEnCours(true);
    try {
      if (capsuleWebhookId) {
        const couvertureUrl = couverture
          ? await uploaderFichier("couvertures", couverture, capsuleWebhookId)
          : null;
        await supabase.from("capsules").update({
          nom: nom.trim(),
          date_ouverture: date || null,
          ...(couvertureUrl ? { couverture_url: couvertureUrl } : {}),
        }).eq("id", capsuleWebhookId);
        setCapsules(prev => prev.map(c =>
          c.id === capsuleWebhookId
            ? { ...c, nom: nom.trim(), dateOuverture: date || null, ...(couvertureUrl ? { couverture: couvertureUrl } : {}) }
            : c
        ));
        allerVers("capsules");
      } else {
        await creerCapsule({ nom: nom.trim(), type: "mariage", dateOuverture: date || null,
          couverture: couverture || null, formule: "mariage", ecranSucces: "qr_mariage" });
      }
    } catch (e) {
      alert("Erreur : " + e.message);
      setEnCours(false);
    }
  }

  const BandeauMariage = ({ sousTitre }) => (
    <div style={{ background: "linear-gradient(150deg,#3D0C11 0%,#831843 45%,#BE185D 75%,#C9A84C 100%)",
      padding: "44px 24px 22px", position: "relative", overflow: "hidden",
      borderRadius: 24, margin: "0 0 20px", flexShrink: 0 }}>
      <div style={{ position:"absolute", top:12, left:22, fontSize:14, opacity:0.55 }}>✨</div>
      <div style={{ position:"absolute", top:28, right:32, fontSize:18, opacity:0.45 }}>💫</div>
      <div style={{ position:"absolute", bottom:14, left:44, fontSize:11, opacity:0.5 }}>✨</div>
      <div style={{ position:"absolute", top:8, right:16, fontSize:22, opacity:0.4 }}>🥂</div>
      <div style={{ position:"absolute", bottom:10, right:28, fontSize:10, opacity:0.55 }}>⭐</div>
      <div style={{ display:"flex", alignItems:"center", gap:12 }}>
        <div style={{ fontSize:40, lineHeight:1 }}>💍</div>
        <div>
          <div style={{ fontFamily:"'Bricolage Grotesque',sans-serif", fontWeight:800,
            fontSize:18, color:"#fff" }}>Pack Mariage activé !</div>
          <div style={{ fontSize:11, color:"rgba(255,215,100,0.9)", marginTop:2,
            fontFamily:"'Plus Jakarta Sans',sans-serif" }}>{sousTitre}</div>
        </div>
      </div>
    </div>
  );

  return (
    <div style={S.ecran}>
      <BandeauMariage sousTitre="Créez votre capsule de souvenirs" />

      <div style={{ background:"#FFF7ED", border:"1.5px solid #C9A84C", borderRadius:16,
        padding:"12px 16px", marginBottom:16 }}>
        <div style={{ fontSize:12, fontWeight:800, color:"#78350F", marginBottom:6, letterSpacing:0.3 }}>
          💍 Inclus dans votre Pack Mariage
        </div>
        <div style={{ display:"flex", flexWrap:"wrap", gap:"5px 14px" }}>
          {["📷 500 photos","🎬 50 vidéos","🎤 30 vocaux","👥 Participants illimités","🖨️ QR codes invités"].map((item,i) => (
            <div key={i} style={{ fontSize:12, color:"#92400E", fontWeight:600,
              fontFamily:"'Plus Jakarta Sans',sans-serif" }}>{item}</div>
          ))}
        </div>
      </div>

      {srcRecadrageCouv && (
        <RecadreurCouverture
          src={srcRecadrageCouv}
          onValider={b64 => { setCouverture(b64); setPreview(b64); setSrcRecadrageCouv(null); }}
          onAnnuler={() => setSrcRecadrageCouv(null)}
        />
      )}

      <label style={S.label}>Nom de la capsule</label>
      <input style={S.input} placeholder="Ex. Mariage de Sophie & Thomas…"
        value={nom} onChange={e => setNom(e.target.value)} />

      <label style={{ ...S.label, marginTop: 8 }}>Date d'ouverture</label>
      <SelecteurDate valeur={date} onChange={setDate} />

      <label style={{ ...S.label, marginTop: 8 }}>Photo de couverture</label>
      <label style={{ display: "block", cursor: "pointer", marginBottom: 12 }}>
        <div style={{ height: 140, borderRadius: 16, overflow: "hidden", position: "relative",
          background: preview
            ? `url(${preview}) center/cover`
            : "linear-gradient(135deg,#3D0C11 0%,#831843 45%,#BE185D 75%,#C9A84C 100%)",
          display: "flex", alignItems: "center", justifyContent: "center",
          border: "2px dashed rgba(201,168,76,0.5)" }}>
          {!preview && (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 36, marginBottom: 6 }}>💍</div>
              <div style={{ color: "rgba(255,255,255,0.9)", fontSize: 12, fontWeight: 600,
                background: "rgba(0,0,0,0.3)", padding: "5px 14px", borderRadius: 999 }}>
                📷 Choisir une photo
              </div>
            </div>
          )}
          {preview && (
            <div style={{ position: "absolute", bottom: 8, right: 8, background: "rgba(0,0,0,0.55)",
              color: "#fff", fontSize: 12, fontWeight: 600, borderRadius: 8, padding: "4px 10px" }}>
              📷 Changer
            </div>
          )}
        </div>
        <input type="file" accept="image/*" style={{ display: "none" }} onChange={onPhoto} />
      </label>

      <button style={{ ...S.boutonPrincipal, ...(!peutCreer||enCours ? S.boutonDesactive : {}),
        background: peutCreer ? "linear-gradient(135deg,#3D0C11,#831843,#BE185D,#C9A84C)" : undefined }}
        disabled={!peutCreer||enCours} onClick={validerCreation}>
        {enCours ? "Création en cours…" : "💍 Créer ma capsule →"}
      </button>
    </div>
  );
}

// ============================================================================
//  ÉCRAN QR CODE MARIAGE : partage et impression après création
// ============================================================================
function EcranQrMariage({ capsule, allerVers }) {
  const [copie, setCopie] = useState(false);

  if (!capsule) return (
    <div style={S.ecran}>
      <p style={{ textAlign:"center", color:COULEURS.doux, marginTop:60 }}>Chargement…</p>
    </div>
  );

  const lien  = lienPartage(capsule.code);
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(lien)}&color=3D0C11&bgcolor=FFF7ED&margin=12`;

  async function partager() {
    try {
      if (navigator.share) {
        await navigator.share({
          title: `Rejoins ma capsule Blooom "${capsule.nom}"`,
          text:  `Rejoins notre capsule mariage "${capsule.nom}" ! 💍\n\nCode : ${capsule.code}\nLien : ${lien}`,
        });
      } else {
        await navigator.clipboard.writeText(`Code : ${capsule.code}\nLien : ${lien}`);
        setCopie(true); setTimeout(() => setCopie(false), 2000);
      }
    } catch (e) { /* annulé */ }
  }

  function imprimer() {
    const w = window.open("","_blank");
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>QR Code — ${capsule.nom}</title>
    <style>
      body{font-family:Georgia,serif;display:flex;flex-direction:column;align-items:center;
        justify-content:center;min-height:100vh;margin:0;background:#FFF7ED;}
      .carte{background:#fff;border:2px solid #C9A84C;border-radius:16px;padding:32px 28px;
        text-align:center;max-width:300px;box-shadow:0 4px 20px rgba(131,24,67,.15);}
      .emoji{font-size:28px;margin-bottom:8px;}
      h2{color:#3D0C11;margin:0 0 4px;font-size:19px;}
      .sub{color:#92400E;font-size:13px;margin:0 0 20px;}
      img{width:200px;height:200px;border-radius:8px;}
      .url{font-size:10px;color:#78350F;margin-top:14px;word-break:break-all;}
      @media print{body{background:#fff;}}
    </style></head><body>
    <div class="carte">
      <div class="emoji">💍</div>
      <h2>${capsule.nom}</h2>
      <p class="sub">Scannez pour rejoindre la capsule</p>
      <img src="${qrUrl}" alt="QR Code" />
      <div class="url">${lien}</div>
    </div></body></html>`);
    w.document.close(); w.focus();
    setTimeout(()=>{ w.print(); }, 400);
  }

  return (
    <div style={S.ecran}>
      {/* Bandeau célébration */}
      <div style={{ background:"linear-gradient(150deg,#3D0C11 0%,#831843 45%,#BE185D 75%,#C9A84C 100%)",
        padding:"44px 24px 22px", position:"relative", overflow:"hidden",
        borderRadius:24, margin:"0 0 20px", flexShrink:0 }}>
        <div style={{ position:"absolute", top:12, left:22, fontSize:14, opacity:0.55 }}>✨</div>
        <div style={{ position:"absolute", top:28, right:32, fontSize:18, opacity:0.45 }}>💫</div>
        <div style={{ position:"absolute", bottom:14, left:44, fontSize:11, opacity:0.5 }}>✨</div>
        <div style={{ position:"absolute", top:8, right:16, fontSize:22, opacity:0.4 }}>🥂</div>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ fontSize:40, lineHeight:1 }}>💍</div>
          <div>
            <div style={{ fontFamily:"'Bricolage Grotesque',sans-serif", fontWeight:800,
              fontSize:18, color:"#fff" }}>Votre capsule est prête !</div>
            <div style={{ fontSize:12, color:"rgba(255,215,100,0.9)", marginTop:2,
              fontFamily:"'Plus Jakarta Sans',sans-serif" }}>{capsule.nom}</div>
          </div>
        </div>
      </div>

      {/* QR code */}
      <div style={{ background:"#FFF7ED", border:"2px solid #C9A84C", borderRadius:20,
        padding:"22px 20px", textAlign:"center", marginBottom:14, flexShrink:0 }}>
        <div style={{ fontSize:13, fontWeight:700, color:"#78350F", marginBottom:14,
          fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
          🖨️ QR code à imprimer pour vos invités
        </div>
        <img src={qrUrl} alt="QR Code invitation"
          style={{ width:200, height:200, borderRadius:12,
            boxShadow:"0 4px 16px rgba(131,24,67,0.2)" }} />
        <div style={{ fontSize:10, color:"#92400E", marginTop:10, wordBreak:"break-all",
          fontFamily:"'Plus Jakarta Sans',sans-serif", opacity:0.8 }}>{lien}</div>
      </div>

      <button onClick={imprimer}
        style={{ width:"100%", padding:"14px 0", borderRadius:16, border:"none",
          background:"linear-gradient(135deg,#3D0C11,#831843,#BE185D,#C9A84C)",
          color:"#fff", fontWeight:700, fontSize:15, cursor:"pointer", marginBottom:10,
          fontFamily:"'Bricolage Grotesque',sans-serif",
          boxShadow:"0 4px 14px rgba(131,24,67,0.35)",
          display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
        <span>🖨️</span><span>Imprimer le QR code</span>
      </button>

      <button onClick={partager}
        style={{ width:"100%", padding:"13px 0", borderRadius:16,
          border:"1.5px solid #C9A84C", background:"none", color:"#831843",
          fontWeight:700, fontSize:14, cursor:"pointer", marginBottom:10,
          fontFamily:"'Bricolage Grotesque',sans-serif",
          display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
        <span>📨</span><span>{copie ? "✓ Lien copié !" : "Partager l'invitation"}</span>
      </button>

      <button onClick={() => allerVers("detail", capsule.id)}
        style={{ width:"100%", padding:"13px 0", borderRadius:16, border:"none",
          background:"var(--carte-bg)", color:COULEURS.encre,
          fontWeight:700, fontSize:14, cursor:"pointer",
          fontFamily:"'Bricolage Grotesque',sans-serif",
          boxShadow:"0 2px 8px rgba(46,34,48,0.06)",
          display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
        <span>💍</span><span>Voir ma capsule</span>
      </button>
    </div>
  );
}

// ============================================================================
//  ÉCRAN UPGRADE MÉDIA : achat rapide de +5 vidéos et/ou +5 vocaux
// ============================================================================
function EcranUpgradeMedia({ capsule, allerVers, acheterUpgradeMedia, ecranPrecedent }) {
  const [enCours, setEnCours] = useState(null);

  const options = [
    {
      id: "upgrade_videos",
      emoji: "🎬",
      titre: "+5 vidéos",
      desc: "Déposez jusqu'à 5 vidéos (20s max) dans cette capsule",
      prix: "2,99€",
      prixCents: 299,
    },
    {
      id: "upgrade_vocaux",
      emoji: "🎤",
      titre: "+5 messages vocaux",
      desc: "Déposez jusqu'à 5 memos vocaux (20s max) dans cette capsule",
      prix: "2,99€",
      prixCents: 299,
    },
    {
      id: "upgrade_videos_vocaux",
      emoji: "🎬🎤",
      titre: "Pack vidéos + vocaux",
      desc: "5 vidéos et 5 vocaux — économisez 1€ par rapport à l'achat séparé",
      prix: "4,99€",
      prixCents: 499,
      badge: "Meilleure offre",
    },
  ];

  async function acheter(opt) {
    setEnCours(opt.id);
    try {
      await acheterUpgradeMedia(opt.id, capsule.id);
    } catch (e) {
      alert("Erreur : " + e.message);
      setEnCours(null);
    }
  }

  return (
    <div style={{ ...S.ecran, display: "flex", flexDirection: "column" }}>
      <EnTeteRetour titre="Débloquer du contenu" onRetour={() => allerVers(ecranPrecedent || "detail", capsule.id)} />
      <div style={{ flex: 1, padding: "0 20px 24px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {options.map(opt => (
            <div key={opt.id} style={{ position: "relative", background: "#fff", borderRadius: 16,
              padding: "14px 16px",
              boxShadow: opt.badge ? "0 4px 20px rgba(255,92,92,0.15)" : "0 2px 10px rgba(46,34,48,0.07)",
              border: opt.badge ? "1.5px solid #FF5C5C30" : "1.5px solid transparent" }}>
              {opt.badge && (
                <div style={{ position: "absolute", top: -9, right: 12,
                  background: "linear-gradient(135deg,#FF8A3D,#FF5C5C)", color: "#fff",
                  fontSize: 10, fontWeight: 700, borderRadius: 20, padding: "2px 9px" }}>
                  {opt.badge}
                </div>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 28, lineHeight: 1, flexShrink: 0 }}>{opt.emoji}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: COULEURS.encre }}>{opt.titre}</div>
                  <div style={{ fontSize: 12, color: COULEURS.doux, marginTop: 2 }}>{opt.desc}</div>
                </div>
                <button
                  disabled={!!enCours}
                  onClick={() => acheter(opt)}
                  style={{ flexShrink: 0, padding: "9px 14px", borderRadius: 12, border: "none",
                    cursor: enCours ? "default" : "pointer",
                    background: enCours === opt.id ? COULEURS.doux : "linear-gradient(135deg,#FF8A3D,#FF5C5C)",
                    color: "#fff", fontWeight: 700, fontSize: 13,
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    opacity: enCours && enCours !== opt.id ? 0.5 : 1,
                    transition: "opacity 0.15s" }}>
                  {enCours === opt.id ? "…" : opt.prix}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div>
          <p style={{ fontSize: 11, color: COULEURS.doux, textAlign: "center", margin: "12px 0 10px" }}>
            🔐 Stripe · Paiement sécurisé · Disponible immédiatement
          </p>

        <button onClick={() => allerVers("creer")}
          style={{ width: "100%", padding: "15px 0", borderRadius: 16, border: "none",
            background: "linear-gradient(135deg,#1a1a2e 0%,#16213e 100%)",
            color: "#fff", fontWeight: 700, fontSize: 15,
            cursor: "pointer", fontFamily: "'Bricolage Grotesque', sans-serif",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <span style={{ fontSize: 18 }}>✨</span>
          <span>Voir toutes les formules Blooom</span>
          <span style={{ fontSize: 13, opacity: 0.6 }}>→</span>
        </button>
      </div>
    </div>
  </div>
  );
}

function WheelCol({ items, value, onChange }) {
  const ref = React.useRef(null);
  const H = 22;
  const timer = React.useRef(null);

  React.useLayoutEffect(() => {
    const idx = items.findIndex(x => x.v === value);
    if (ref.current && idx >= 0) ref.current.scrollTop = idx * H;
  }, []);

  React.useEffect(() => {
    const idx = items.findIndex(x => x.v === value);
    if (ref.current && idx >= 0) {
      const target = idx * H;
      if (Math.abs(ref.current.scrollTop - target) > H / 2)
        ref.current.scrollTo({ top: target, behavior: "smooth" });
    }
  }, [value]);

  const onScroll = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (!ref.current) return;
      const idx = Math.round(ref.current.scrollTop / H);
      const item = items[Math.max(0, Math.min(idx, items.length - 1))];
      if (item && item.v !== value) onChange(item.v);
    }, 80);
  };

  return (
    <div style={{ flex: 1, position: "relative", height: H * 3, overflow: "hidden" }}>
      <div style={{ position: "absolute", top: H, left: 1, right: 1, height: H, background: "rgba(255,138,61,0.12)", borderTop: "1px solid rgba(255,138,61,0.45)", borderBottom: "1px solid rgba(255,138,61,0.45)", borderRadius: 6, pointerEvents: "none", zIndex: 2 }} />
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: H, background: "linear-gradient(to bottom, var(--input-bg) 20%, transparent)", pointerEvents: "none", zIndex: 2 }} />
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: H, background: "linear-gradient(to top, var(--input-bg) 20%, transparent)", pointerEvents: "none", zIndex: 2 }} />
      <div ref={ref} onScroll={onScroll} className="bwhl"
        style={{ height: "100%", overflowY: "scroll", scrollSnapType: "y mandatory", scrollbarWidth: "none", msOverflowStyle: "none" }}>
        <div style={{ height: H }} />
        {items.map(item => (
          <div key={item.v} style={{ height: H, display: "flex", alignItems: "center", justifyContent: "center", scrollSnapAlign: "center", fontSize: 10, fontWeight: 600, color: COULEURS.encre, fontFamily: "'Plus Jakarta Sans', sans-serif", userSelect: "none" }}>
            {item.l}
          </div>
        ))}
        <div style={{ height: H }} />
      </div>
    </div>
  );
}

function DateTimePicker({ value, onChange }) {
  const fallback = React.useRef(new Date().toISOString());
  const iso = value || fallback.current;
  const d = new Date(iso);
  const j = d.getDate(), mo = d.getMonth() + 1, an = d.getFullYear(), h = d.getHours(), mi = d.getMinutes();
  const upd = (nj, nmo, nan, nh, nmi) => {
    const nd = new Date(nan, nmo - 1, nj, nh, nmi);
    if (!isNaN(nd)) onChange(nd.toISOString());
  };
  const Y = new Date().getFullYear();
  const days    = Array.from({length:31}, (_,i) => ({ v:i+1, l:String(i+1).padStart(2,"0") }));
  const months  = ["Jan","Fév","Mar","Avr","Mai","Jui","Jul","Aoû","Sep","Oct","Nov","Déc"].map((l,i) => ({ v:i+1, l }));
  const years   = Array.from({length:11}, (_,i) => ({ v:Y-10+i, l:String(Y-10+i) }));
  const hours   = Array.from({length:24}, (_,i) => ({ v:i, l:String(i).padStart(2,"0") }));
  const minutes = Array.from({length:60}, (_,i) => ({ v:i, l:String(i).padStart(2,"0") }));

  return (
    <div style={{ background: "var(--input-bg)", borderRadius: 14, display: "flex", alignItems: "center", padding: "4px 8px", gap: 2, boxShadow: "0 2px 8px rgba(46,34,48,0.06)" }}>
      <style>{`.bwhl::-webkit-scrollbar{display:none}`}</style>
      <WheelCol items={days}    value={j}  onChange={v => upd(v, mo, an, h, mi)} />
      <WheelCol items={months}  value={mo} onChange={v => upd(j, v, an, h, mi)} />
      <WheelCol items={years}   value={an} onChange={v => upd(j, mo, v, h, mi)} />
      <div style={{ width: 1, height: 24, background: COULEURS.bordure, flexShrink: 0, margin: "0 4px" }} />
      <WheelCol items={hours}   value={h}  onChange={v => upd(j, mo, an, v, mi)} />
      <div style={{ flexShrink: 0, fontSize: 10, fontWeight: 800, color: COULEURS.doux }}>:</div>
      <WheelCol items={minutes} value={mi} onChange={v => upd(j, mo, an, h, v)} />
    </div>
  );
}

// ============================================================================
//  ÉCRAN CONTRIBUTION : auteur choisi PARMI LES PARTICIPANTS de la capsule.
// ============================================================================
function EcranContribution({ capsule, moi, allerVers, ajouterContribution, editerParticipant, onUpgradeMedia }) {
  const moisParticipant = capsule.participants.find((p) => p.userId === moi?.id) || capsule.participants[0];
  const [auteurIds, setAuteurIds] = useState(moisParticipant ? [moisParticipant.id] : []);
  const [ajoutOuvert, setAjoutOuvert] = useState(false);
  const [typeContrib, setTypeContrib] = useState(null);
  const [voteDepositaire, setVoteDepositaire] = useState(null); // "oui" | "non" — vote du déposant sur son propre pari
  // États pour le type "vote"
  const [voteQuestion, setVoteQuestion]     = useState("");
  const [voteOptions, setVoteOptions]       = useState(["", ""]);
  const [monVoteCreateur, setMonVoteCreateur] = useState(null);

  // Pari et vote sont personnels : on revient à soi seul si on bascule sur ces types.
  React.useEffect(() => {
    if (typeContrib === "pari" || typeContrib === "vote") {
      setAuteurIds(moisParticipant ? [moisParticipant.id] : []);
      setAjoutOuvert(false);
    }
    if (typeContrib === "vote") {
      setVoteQuestion(""); setVoteOptions(["", ""]); setMonVoteCreateur(null);
    }
  }, [typeContrib]); // eslint-disable-line react-hooks/exhaustive-deps

  const [texte, setTexte] = useState("");
  const [media, setMedia] = useState(null);         // File object (pour l'upload)
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState(null); // blob URL (pour l'affichage)
  const [enUpload, setEnUpload] = useState(false);
  const [filtre, setFiltre] = useState("original");
  const [ambiance, setAmbiance] = useState("soleil");
  const [enregistrement, setEnregistrement] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const enregistreurRef = React.useRef(null);
  const analyserRef    = React.useRef(null);
  const audioCtxRef    = React.useRef(null);
  const animFrameRef   = React.useRef(null);
  const vizCanvasRef   = React.useRef(null);
  const autoStopRef    = React.useRef(null);
  const chronoRef      = React.useRef(null);
  const [tempsRestant, setTempsRestant] = useState(null);
  const inputCameraRef  = React.useRef(null);
  const inputGalerieRef = React.useRef(null);

  // Dessin — base64 PNG produit par CanvasDessin
  const [dessinData, setDessinData] = useState(null);
  const [commentaireDessin, setCommentaireDessin] = useState("");

  // Date de prise de vue (photo/vidéo) — auto-détectée depuis EXIF, modifiable manuellement
  const [datePrise, setDatePrise] = useState(null);

  // Document PDF — objet File sélectionné par l'utilisateur
  const [pdfFichier, setPdfFichier] = useState(null);

  // Une du jour — données récupérées depuis Le Monde via rss2json
  const [uneData, setUneData] = useState(null);
  const [uneChargement, setUneChargement] = useState(false);

  // Météo — données récupérées depuis Open-Meteo + géolocalisation navigateur
  const [meteoData, setMeteoData] = useState(null);
  const [meteoChargement, setMeteoChargement] = useState(false);
  const [meteoCommentaire, setMeteoCommentaire] = useState("");
  const [lieuManuel, setLieuManuel] = useState("");

  // Chanson — recherche iTunes, résultats et sélection finale
  const [rechercheMusique, setRechercheMusique] = useState("");
  const [resultatsMusique, setResultatsMusique] = useState([]);
  const [rechercheEnCours, setRechercheEnCours] = useState(false);
  const [chansonSelectionnee, setChansonSelectionnee] = useState(null);
  const [paroles, setParoles] = useState(null);
  const [parolesChargement, setParolesChargement] = useState(false);

  React.useEffect(() => {
    return () => {
      enregistreurRef.current?.state === "recording" && enregistreurRef.current.stop();
      cancelAnimationFrame(animFrameRef.current);
      clearTimeout(autoStopRef.current);
      clearInterval(chronoRef.current);
      audioCtxRef.current?.close();
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      if (mediaPreviewUrl) URL.revokeObjectURL(mediaPreviewUrl);
    };
  }, [audioUrl, mediaPreviewUrl]);

  // Boucle d'animation : lit les fréquences et dessine les barres en dégradé Blooom.
  function lancerViz() {
    const canvas   = vizCanvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;

    // Cale la résolution logique sur la taille CSS réelle × devicePixelRatio pour éviter le flou.
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width  = Math.round(rect.width  * dpr);
    canvas.height = Math.round(rect.height * dpr);

    const ctx  = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    const data = new Uint8Array(analyser.frequencyBinCount);

    function draw() {
      animFrameRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(data);
      // Dimensions en CSS pixels (après le scale dpr)
      const W = rect.width, H = rect.height;
      ctx.clearRect(0, 0, W, H);

      const grad = ctx.createLinearGradient(0, 0, W, 0);
      grad.addColorStop(0,   "#FF8A3D");
      grad.addColorStop(0.5, "#FF5C9D");
      grad.addColorStop(1,   "#C65CE8");

      const n    = data.length;
      const gap  = 2;                            // espace fixe entre barres (px)
      const barW = (W - gap * (n - 1)) / n;      // barres qui remplissent exactement la largeur

      for (let i = 0; i < n; i++) {
        const barH = Math.max(3, (data[i] / 255) * H);
        const x    = i * (barW + gap);
        const y    = H - barH;
        const r    = Math.min(barW / 2, 4);

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + barW - r, y);
        ctx.quadraticCurveTo(x + barW, y, x + barW, y + r);
        ctx.lineTo(x + barW, H);
        ctx.lineTo(x, H);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
        ctx.fill();
      }
    }
    draw();
  }

  async function commencerEnregistrement() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Web Audio API — connecte le micro à un analyseur de fréquences pour la viz.
      const audioCtx = new AudioContext();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 128; // 64 barres
      audioCtx.createMediaStreamSource(stream).connect(analyser);
      audioCtxRef.current = audioCtx;
      analyserRef.current = analyser;

      const recorder = new MediaRecorder(stream);
      const morceaux = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) morceaux.push(e.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        cancelAnimationFrame(animFrameRef.current);
        audioCtxRef.current?.close();
        const blob = new Blob(morceaux, { type: "audio/webm" });
        const url = URL.createObjectURL(blob);
        setAudioBlob(blob);
        setAudioUrl(url);
        setEnregistrement(false);
      };
      recorder.start();
      enregistreurRef.current = recorder;
      setEnregistrement(true);
      setTempsRestant(20);
      // Arrêt automatique à 20s
      autoStopRef.current = setTimeout(() => enregistreurRef.current?.stop(), 20000);
      // Décompte seconde par seconde
      chronoRef.current = setInterval(() => {
        setTempsRestant(t => { if (t <= 1) { clearInterval(chronoRef.current); return 0; } return t - 1; });
      }, 1000);
      // Lancer la viz après le setState pour que le canvas soit monté
      setTimeout(lancerViz, 50);
    } catch (e) {
      alert("Impossible d'accéder au microphone : " + e.message);
    }
  }

  function arreterEnregistrement() {
    clearTimeout(autoStopRef.current);
    clearInterval(chronoRef.current);
    enregistreurRef.current?.stop();
  }

  function recommencer() {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(null);
    setAudioUrl(null);
    setTempsRestant(null);
  }

  // Récupère la une du jour via allorigins.win (proxy CORS gratuit) + DOMParser.
  // Essaie 3 sources françaises en cascade pour maximiser la fiabilité.
  async function fetchUneJour() {
    setUneChargement(true);
    const SOURCES = [
      { rss: "https://www.lemonde.fr/rss/une.xml",                   nom: "Le Monde" },
      { rss: "https://www.lefigaro.fr/rss/figaro_actualites.xml",    nom: "Le Figaro" },
      { rss: "https://www.francetvinfo.fr/titres.rss",               nom: "France Info" },
    ];
    for (const src of SOURCES) {
      try {
        const res  = await fetch("https://api.allorigins.win/get?url=" + encodeURIComponent(src.rss));
        const data = await res.json();
        if (!data.contents) continue;
        const doc   = new DOMParser().parseFromString(data.contents, "text/xml");
        const item  = doc.querySelector("item");
        if (!item) continue;
        const raw   = item.querySelector("title")?.textContent || "";
        const titre = raw.replace(/<!\[CDATA\[|\]\]>/g, "").trim();
        const lien  = item.querySelector("link")?.textContent?.trim() || null;
        if (!titre) continue;
        setUneData({
          titre,
          source: src.nom,
          url: lien,
          date: new Date().toLocaleDateString("fr-FR", { weekday: "long", year: "numeric", month: "long", day: "numeric" }),
        });
        setUneChargement(false);
        return;
      } catch {}
    }
    alert("Impossible de récupérer la une. Vérifie ta connexion internet.");
    setUneChargement(false);
  }

  // Appelle Open-Meteo pour des coordonnées données et met à jour meteoData.
  async function fetchMeteoPourCoords(lat, lon, lieuNom) {
    const meteoRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&current=temperature_2m,weathercode&timezone=auto`);
    const meteoJson = await meteoRes.json();
    const temp  = Math.round(meteoJson.current.temperature_2m);
    const code  = meteoJson.current.weathercode;
    const { texte: condition, icone, cle } = descriptionMeteo(code);
    setMeteoData({ temp, condition, icone, cle, lieu: lieuNom, date: new Date().toLocaleDateString("fr-FR", { weekday: "long", year: "numeric", month: "long", day: "numeric" }), commentaire: "" });
  }

  // Géolocalisation automatique via le navigateur.
  async function fetchMeteo() {
    setMeteoChargement(true);
    try {
      const pos = await new Promise((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 10000 })
      );
      const { latitude: lat, longitude: lon } = pos.coords;
      const geoRes  = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`);
      const geoJson = await geoRes.json();
      const lieu = geoJson.address?.city || geoJson.address?.town || geoJson.address?.village || "Votre position";
      await fetchMeteoPourCoords(lat, lon, lieu);
    } catch (e) {
      if (e.code === 1) alert("Autorisez la géolocalisation dans votre navigateur.");
      else alert("Erreur météo : " + e.message);
    }
    setMeteoChargement(false);
  }

  // Recherche d'un lieu saisi manuellement via Nominatim forward geocoding.
  async function fetchMeteoLieu() {
    if (!lieuManuel.trim()) return;
    setMeteoChargement(true);
    try {
      const res  = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(lieuManuel)}&format=json&limit=1`);
      const json = await res.json();
      if (!json.length) { alert(`Lieu introuvable : "${lieuManuel}"`); setMeteoChargement(false); return; }
      const { lat, lon, display_name } = json[0];
      const nom = display_name.split(",")[0];
      await fetchMeteoPourCoords(parseFloat(lat), parseFloat(lon), nom);
    } catch (e) { alert("Erreur : " + e.message); }
    setMeteoChargement(false);
  }

  // Récupère les paroles via Lyrics.ovh (gratuit, sans clé, CORS ok).
  async function fetchParoles(artiste, titre) {
    setParolesChargement(true);
    setParoles(null);
    try {
      const res  = await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(artiste)}/${encodeURIComponent(titre)}`);
      const json = await res.json();
      if (json.lyrics) setParoles(json.lyrics.trim());
      else setParoles("__introuvable__");
    } catch { setParoles("__introuvable__"); }
    setParolesChargement(false);
  }

  // Recherche une chanson via l'API iTunes Search (gratuite, sans clé, CORS ok).
  async function rechercherChanson() {
    if (!rechercheMusique.trim()) return;
    setRechercheEnCours(true);
    try {
      const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(rechercheMusique)}&media=music&limit=6&country=fr`);
      const json = await res.json();
      setResultatsMusique(json.results || []);
    } catch (e) { alert("Recherche impossible : " + e.message); }
    setRechercheEnCours(false);
  }

  const optionsValides = voteOptions.map(o => o.trim()).filter(Boolean);
  const peutEnvoyer =
    (typeContrib === "message"          && texte.trim()) ||
    ((typeContrib === "photo" || typeContrib === "video") && media) ||
    (typeContrib === "vocal"            && audioBlob) ||
    (typeContrib === "dessin"           && dessinData) ||
    (typeContrib === "secret"           && texte.trim()) ||
    (typeContrib === "pari"             && texte.trim() && voteDepositaire !== null) ||
    (typeContrib === "vote"             && voteQuestion.trim() && optionsValides.length >= 2 && monVoteCreateur !== null) ||
    (typeContrib === "une_du_jour"      && uneData) ||
    (typeContrib === "meteo"            && meteoData) ||
    (typeContrib === "chanson"          && chansonSelectionnee) ||
    (typeContrib === "document"         && pdfFichier);

  async function envoyer() {
    // La question field sert à stocker des données structurées JSON pour certains types.
    const questionField =
      typeContrib === "une_du_jour" ? JSON.stringify(uneData)
    : typeContrib === "meteo"       ? JSON.stringify({ ...meteoData, commentaire: meteoCommentaire })
    : typeContrib === "chanson"     ? JSON.stringify({ ...chansonSelectionnee, paroles: paroles && paroles !== "__introuvable__" ? paroles : null })
    : typeContrib === "pari"        ? JSON.stringify({ votes: moisParticipant && voteDepositaire ? { [moisParticipant.id]: { vote: voteDepositaire, commentaire: "", ts: new Date().toISOString() } } : {} })
    : typeContrib === "vote"        ? JSON.stringify({ question: voteQuestion.trim(), options: optionsValides, votes: moisParticipant && monVoteCreateur ? { [moisParticipant.id]: monVoteCreateur } : {} })
    : null;

    // Pour un document, on utilise le titre saisi OU le nom original du fichier
    const texteAEnvoyer = typeContrib === "document"
      ? (texte.trim() || pdfFichier?.name || "Document PDF")
      : typeContrib === "dessin"
      ? commentaireDessin.trim()
      : typeContrib === "vote"
      ? voteQuestion.trim()
      : texte.trim();

    if (typeContrib === "video") setEnUpload(true);
    try {
      await ajouterContribution(capsule.id, {
        id: genererId(), auteurId: auteurIds[0], type: typeContrib, texte: texteAEnvoyer,
        question: questionField,
        media: (typeContrib === "photo" || typeContrib === "video") ? media
             : typeContrib === "vocal"    ? audioBlob
             : typeContrib === "dessin"   ? dessinData
             : typeContrib === "document" ? pdfFichier
             : null,
        filtre, ambiance: typeContrib === "message" ? ambiance : null,
        date: datePrise || new Date().toISOString(), reactions: {},
      });
    } catch { setEnUpload(false); }
    allerVers("detail", capsule.id);
  }
  const auteur = capsule.participants.find((p) => p.id === auteurIds[0]);
  const cssFiltre = FILTRES.find((f) => f.id === filtre)?.css || "none";

  return (
    <div style={S.ecran}>
      <EnTeteRetour titre="Déposer un souvenir" onRetour={() => allerVers("detail", capsule.id)} />
      <label style={S.label}>Qui contribue ?</label>
      <div style={{ background: "#fff", borderRadius: 20, padding: "10px 14px", boxShadow: "0 4px 14px rgba(46,34,48,0.07)", marginBottom: 4 }}>
        {/* Avatars des contributeurs sélectionnés */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {auteurIds.map((id) => {
            const p = capsule.participants.find(x => x.id === id);
            if (!p) return null;
            return (
              <div key={id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, position: "relative" }}>
                <div style={{ position: "relative" }}>
                  <Avatar membre={p} taille={36} />
                  {p.id !== moisParticipant?.id && (
                    <button onClick={() => setAuteurIds(prev => prev.filter(i => i !== id))}
                      style={{ position: "absolute", top: -3, right: -3, width: 15, height: 15, borderRadius: "50%", background: COULEURS.encre, color: "#fff", border: "none", cursor: "pointer", fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>
                      ×
                    </button>
                  )}
                </div>
                <span style={{ fontSize: 10, fontWeight: 600, color: COULEURS.encre, maxWidth: 44, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.prenom}</span>
              </div>
            );
          })}

          {/* Bouton + masqué pour les paris et votes (auteur unique) */}
          {typeContrib !== "pari" && typeContrib !== "vote" && (
            <button onClick={() => setAjoutOuvert(v => !v)}
              style={{ width: 36, height: 36, borderRadius: "50%", background: ajoutOuvert ? COULEURS.encre : "linear-gradient(135deg,#f0eaf2,#e8e0ec)", border: "none", cursor: "pointer", fontSize: 18, color: ajoutOuvert ? "#fff" : COULEURS.doux, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              +
            </button>
          )}
        </div>

        {/* Panneau de sélection multiple par cases à cocher */}
        {ajoutOuvert && typeContrib !== "pari" && typeContrib !== "vote" && (
          <div style={{ marginTop: 10, borderTop: `1px solid ${COULEURS.bordure}`, paddingTop: 10 }}>
            {capsule.participants.filter(p => p.id !== moisParticipant?.id).length === 0
              ? <div style={{ fontSize: 13, color: COULEURS.doux, padding: "4px 0" }}>Vous êtes le seul membre de cette capsule.</div>
              : capsule.participants.filter(p => p.id !== moisParticipant?.id).map(p => {
                  const coché = auteurIds.includes(p.id);
                  return (
                    <button key={p.id}
                      onClick={() => setAuteurIds(prev => coché ? prev.filter(x => x !== p.id) : [...prev, p.id])}
                      style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", background: coché ? "#f0fdf4" : "none", border: "none", padding: "8px 6px", cursor: "pointer", borderRadius: 12, fontFamily: "'Plus Jakarta Sans', sans-serif", marginBottom: 2 }}>
                      <Avatar membre={p} taille={30} />
                      <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: COULEURS.encre, textAlign: "left" }}>{p.prenom}</span>
                      <div style={{ width: 22, height: 22, borderRadius: 6, background: coché ? "#22c55e" : COULEURS.bordure, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background 0.15s" }}>
                        {coché && <span style={{ color: "#fff", fontSize: 13, fontWeight: 700, lineHeight: 1 }}>✓</span>}
                      </div>
                    </button>
                  );
                })
            }
            <button onClick={() => setAjoutOuvert(false)}
              style={{ width: "100%", background: COULEURS.encre, color: "#fff", border: "none", borderRadius: 12, padding: "10px 0", fontWeight: 700, fontSize: 14, marginTop: 8, cursor: "pointer", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              Valider
            </button>
          </div>
        )}
      </div>

      {!typeContrib && (
        <>
          <label style={S.label}>Que voulez-vous déposer ?</label>
          <TriableTypes onSelect={(id) => { setTypeContrib(id); }} capsule={capsule}
            onUpgradeMedia={capsule.createurId === moi?.id ? onUpgradeMedia : undefined} />
        </>
      )}

      {typeContrib === "message" && (
        <>
          <label style={S.label}>Votre message</label>
          <textarea style={S.zoneTexte} placeholder="Ce que vous voulez transmettre..." value={texte} onChange={(e) => setTexte(e.target.value)} autoFocus />
          <label style={S.label}>Couleur de fond du message</label>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {AMBIANCES.map((a) => (
              <button key={a.id} title={a.nom}
                style={{ width: 36, height: 36, borderRadius: "50%", background: a.fond, border: ambiance === a.id ? `3px solid ${COULEURS.encre}` : "3px solid transparent", cursor: "pointer", flexShrink: 0, boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }}
                onClick={() => setAmbiance(a.id)} />
            ))}
          </div>
        </>
      )}


      {(typeContrib === "photo" || typeContrib === "video") && (() => {
        const accept = typeContrib === "photo" ? "image/*" : "video/*";

        const onSelect = async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          if (typeContrib === "video") {
            const tmpUrl = URL.createObjectURL(file);
            const duree = await new Promise(res => {
              const v = document.createElement("video");
              v.preload = "metadata";
              v.onloadedmetadata = () => { URL.revokeObjectURL(tmpUrl); res(v.duration); };
              v.onerror = () => { URL.revokeObjectURL(tmpUrl); res(null); };
              v.src = tmpUrl;
            });
            if (duree > 20) {
              alert(`Vidéo trop longue (${Math.round(duree)}s). Maximum 20 secondes.`);
              return;
            }
          }
          // Libère l'ancienne URL avant d'en créer une nouvelle
          if (mediaPreviewUrl) URL.revokeObjectURL(mediaPreviewUrl);
          const preview = URL.createObjectURL(file);
          setMedia(file);           // File object → passé à uploaderFichier (File extends Blob)
          setMediaPreviewUrl(preview);
          const exif = typeContrib === "photo" ? await lireExifDate(file) : null;
          setDatePrise(exif || new Date(file.lastModified).toISOString());
        };

        // L'input recouvre toute la surface du label (position absolute 100%×100%, opacity 0).
        // Sans pointerEvents:none — l'utilisateur tape directement l'input, iOS déclenche onChange.
        // Le contenu texte a pointerEvents:none pour laisser passer les taps vers l'input dessous.
        const inputOverlay = {
          position: "absolute", top: 0, left: 0,
          width: "100%", height: "100%",
          opacity: 0, cursor: "pointer",
          fontSize: "100px", // empêche le zoom iOS au double-tap
        };
        const noPtr = { pointerEvents: "none" };

        if (media) {
          return (
            <>
              {typeContrib === "photo"
                ? <img src={mediaPreviewUrl} alt="aperçu"
                    style={{ width: "100%", borderRadius: 16, display: "block", maxHeight: 380, objectFit: "cover" }} />
                : <video src={mediaPreviewUrl} controls playsInline
                    style={{ width: "100%", borderRadius: 16, display: "block" }} />}

              <input style={{ ...S.input, marginTop: 10 }}
                placeholder="Ajouter un commentaire… (optionnel)"
                value={texte} onChange={(ev) => setTexte(ev.target.value)} />

              {enUpload && typeContrib === "video" ? (
                <div style={{ textAlign: "center", padding: "18px 0" }}>
                  <style>{`
                    @keyframes bloomSpin { to { transform: rotate(360deg); } }
                    @keyframes bloomPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
                  `}</style>
                  <div style={{ display: "inline-block", width: 40, height: 40, borderRadius: "50%",
                    border: "3px solid #e8e0ec", borderTopColor: COULEURS.violet || "#7C3AED",
                    animation: "bloomSpin 0.8s linear infinite", marginBottom: 12 }} />
                  <div style={{ fontSize: 14, fontWeight: 700, color: COULEURS.encre,
                    fontFamily: "'Plus Jakarta Sans', sans-serif", animation: "bloomPulse 1.5s ease-in-out infinite" }}>
                    Envoi de la vidéo en cours…
                  </div>
                  <div style={{ fontSize: 12, color: COULEURS.doux, marginTop: 4,
                    fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                    Cela peut prendre quelques secondes
                  </div>
                </div>
              ) : (
                <>
                  <button type="button" style={S.boutonPrincipal} onClick={envoyer}>
                    🔒 Sceller ce souvenir
                  </button>
                  <label style={{ position: "relative", display: "block", textAlign: "center",
                    padding: "8px 0", color: COULEURS.doux, fontSize: 14, fontWeight: 600,
                    cursor: "pointer", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                    <input type="file" accept={accept} capture="environment"
                      style={inputOverlay} onChange={onSelect} />
                    <span style={noPtr}>↩ Reprendre une autre {typeContrib === "photo" ? "photo" : "vidéo"}</span>
                  </label>
                </>
              )}
            </>
          );
        }

        return (
          <>
            <label style={S.label}>Votre {typeContrib === "photo" ? "photo" : "vidéo"}</label>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <label style={{ position: "relative", overflow: "hidden",
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                padding: "13px 0", borderRadius: 14,
                background: "linear-gradient(135deg,#3730a3,#6d28d9)", color: "#fff",
                fontWeight: 700, fontSize: 13, cursor: "pointer",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                boxShadow: "0 3px 10px rgba(109,40,217,0.3)" }}>
                <input type="file" accept={accept} capture="environment"
                  style={inputOverlay} onChange={onSelect} />
                <span style={noPtr}>{typeContrib === "photo" ? "📷" : "🎬"}</span>
                <span style={noPtr}>{typeContrib === "photo" ? "Prendre une photo" : "Filmer (max 20s)"}</span>
              </label>
              <label style={{ position: "relative", overflow: "hidden",
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                padding: "13px 0", borderRadius: 14, border: `1.5px solid ${COULEURS.doux}40`,
                background: "var(--carte-bg)", color: COULEURS.encre,
                fontWeight: 700, fontSize: 13, cursor: "pointer",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                boxShadow: "0 2px 8px rgba(46,34,48,0.06)" }}>
                <input type="file" accept={accept}
                  style={inputOverlay} onChange={onSelect} />
                <span style={noPtr}>🖼️</span>
                <span style={noPtr}>Galerie</span>
              </label>
            </div>
          </>
        );
      })()}

      {typeContrib === "vocal" && (
        <>
          {!audioBlob && !enregistrement && (
            <button style={S.boutonEnregistrer} onClick={commencerEnregistrement}>
              🎙️ Commencer l'enregistrement
            </button>
          )}
          {enregistrement && (
            <div style={S.blocEnregistrement}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={S.pointRouge} />
                  <span style={{ fontWeight: 700, color: "#FF3B30", fontSize: 14 }}>En cours…</span>
                </div>
                <span style={{ fontWeight: 800, fontSize: 16, color: tempsRestant <= 5 ? "#FF3B30" : COULEURS.encre,
                  fontFamily: "'Bricolage Grotesque', sans-serif" }}>
                  {tempsRestant}s
                </span>
              </div>
              {/* Barre de décompte */}
              <div style={{ height: 4, borderRadius: 99, background: "#E5E7EB", overflow: "hidden", margin: "6px 0" }}>
                <div style={{ height: "100%", borderRadius: 99, transition: "width 1s linear",
                  width: `${(tempsRestant / 20) * 100}%`,
                  background: tempsRestant <= 5 ? "#FF3B30" : "linear-gradient(90deg,#6d28d9,#FF5C9D)" }} />
              </div>
              <canvas ref={vizCanvasRef}
                style={{ width: "100%", height: 56, borderRadius: 12, background: COULEURS.encre, display: "block" }} />
              <button style={{ ...S.boutonMini, marginTop: 0, background: COULEURS.encre }} onClick={arreterEnregistrement}>
                ⏹ Arrêter
              </button>
            </div>
          )}
          {audioBlob && !enregistrement && (
            <LecteurVocal url={audioUrl} onRecommencer={recommencer} />
          )}
        </>
      )}

      {/* Dessin tactile — le composant CanvasDessin gère le canvas et appelle setDessinData */}
      {typeContrib === "dessin" && (
        <>
          <label style={S.label}>Dessinez avec le doigt</label>
          <CanvasDessin onSave={setDessinData} />
          <label style={{ ...S.label, marginTop: 10 }}>Ajouter un commentaire (optionnel)</label>
          <input style={S.input} placeholder="Un mot sur ce dessin…" value={commentaireDessin} onChange={e => setCommentaireDessin(e.target.value)} />
        </>
      )}

      {/* Secret — affiché masqué à l'ouverture, visible uniquement après "Révéler" */}
      {typeContrib === "secret" && (
        <>
          <label style={S.label}>Votre secret</label>
          <textarea style={S.zoneTexte} placeholder="Ce que vous ne révélerez qu'à l'ouverture..." value={texte} onChange={(e) => setTexte(e.target.value)} autoFocus />
          <p style={S.aide}>🤫 Ce message sera masqué à l'ouverture. Chaque participant devra appuyer sur "Révéler".</p>
        </>
      )}

      {/* Pari — énoncé + vote immédiat du déposant */}
      {typeContrib === "pari" && (
        <>
          <label style={S.label}>Votre pari</label>
          <textarea style={S.zoneTexte} placeholder="Je parie qu'à l'ouverture de la capsule..." value={texte} onChange={(e) => setTexte(e.target.value)} autoFocus />
          <label style={{ ...S.label, marginTop: 12 }}>Votre propre verdict</label>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => setVoteDepositaire(v => v === "oui" ? null : "oui")}
              style={{ flex: 1, background: voteDepositaire === "oui" ? "#22c55e" : "#f0fdf4", color: voteDepositaire === "oui" ? "#fff" : "#22c55e", border: `2px solid #22c55e`, borderRadius: 14, padding: 12, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
              ✅ Je dis oui
            </button>
            <button
              onClick={() => setVoteDepositaire(v => v === "non" ? null : "non")}
              style={{ flex: 1, background: voteDepositaire === "non" ? "#ef4444" : "#fff0f0", color: voteDepositaire === "non" ? "#fff" : "#ef4444", border: `2px solid #ef4444`, borderRadius: 14, padding: 12, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
              ❌ Je dis non
            </button>
          </div>
          <p style={S.aide}>🎲 Les autres membres pourront voter à leur tour. L'animation du verdict se jouera à l'ouverture.</p>
        </>
      )}

      {/* Vote — question + 2 à 6 options + vote immédiat du créateur */}
      {typeContrib === "vote" && (
        <>
          <label style={S.label}>Votre question</label>
          <textarea style={S.zoneTexte} autoFocus
            placeholder="Ex. Qui sera le vainqueur du tournoi ce weekend ?"
            value={voteQuestion} onChange={e => setVoteQuestion(e.target.value)} />

          <label style={{ ...S.label, marginTop: 14 }}>
            Options de réponse <span style={{ color: COULEURS.doux, fontWeight: 400 }}>({optionsValides.length}/6 min. 2)</span>
          </label>
          {voteOptions.map((opt, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
              <input
                style={{ ...S.input, flex: 1, margin: 0 }}
                placeholder={`Option ${i + 1}${i < 2 ? " (obligatoire)" : ""}`}
                value={opt}
                onChange={e => {
                  const next = [...voteOptions];
                  next[i] = e.target.value;
                  setVoteOptions(next);
                  if (monVoteCreateur && !next.map(o => o.trim()).filter(Boolean).includes(monVoteCreateur)) {
                    setMonVoteCreateur(null);
                  }
                }}
              />
              {i >= 2 && (
                <button onClick={() => {
                  const next = voteOptions.filter((_, j) => j !== i);
                  setVoteOptions(next);
                  if (monVoteCreateur && !next.map(o => o.trim()).filter(Boolean).includes(monVoteCreateur)) {
                    setMonVoteCreateur(null);
                  }
                }}
                  style={{ background: "none", border: `1px solid ${COULEURS.bordure}`, borderRadius: 10,
                    width: 32, height: 32, cursor: "pointer", color: COULEURS.doux, fontSize: 16,
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  ×
                </button>
              )}
            </div>
          ))}
          {voteOptions.length < 6 && (
            <button onClick={() => setVoteOptions(prev => [...prev, ""])}
              style={{ ...S.boutonSecondaire, marginTop: 0, marginBottom: 8, padding: "9px 0" }}>
              + Ajouter une option
            </button>
          )}

          {optionsValides.length >= 2 && (
            <>
              <label style={{ ...S.label, marginTop: 14 }}>Votre propre vote</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 4 }}>
                {optionsValides.map((opt, i) => (
                  <button key={opt} onClick={() => setMonVoteCreateur(v => v === opt ? null : opt)}
                    style={{ background: monVoteCreateur === opt ? DEGRADE : "#f5f0f8",
                      color: monVoteCreateur === opt ? "#fff" : COULEURS.encre,
                      border: monVoteCreateur === opt ? "none" : `1.5px solid ${COULEURS.bordure}`,
                      borderRadius: 14, padding: "11px 14px", fontWeight: 700, fontSize: 14,
                      cursor: "pointer", textAlign: "left",
                      boxShadow: monVoteCreateur === opt ? "0 4px 14px rgba(255,92,157,0.35)" : "none",
                      transition: "all 0.15s ease",
                      fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                    {opt}
                  </button>
                ))}
              </div>
            </>
          )}
          <p style={S.aide}>🗳️ Votre vote est immédiatement verrouillé. Les autres participants recevront une notification pour voter. Les résultats ne sont révélés qu'à l'ouverture de la capsule.</p>
        </>
      )}

      {/* Une du jour — titre récupéré automatiquement depuis Le Monde (RSS → rss2json) */}
      {typeContrib === "une_du_jour" && (
        <>
          <label style={S.label}>Une du jour</label>
          {!uneData ? (
            <button style={{ ...S.boutonPrincipal, marginTop: 0 }} disabled={uneChargement} onClick={fetchUneJour}>
              {uneChargement ? "Récupération en cours…" : "📰 Récupérer la une du jour"}
            </button>
          ) : (
            <div style={{ background: "#fff", borderRadius: 16, padding: 16, boxShadow: "0 4px 14px rgba(46,34,48,0.07)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: COULEURS.doux, letterSpacing: 1, marginBottom: 6 }}>{uneData.source.toUpperCase()} · {uneData.date}</div>
              <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 16, fontWeight: 700, lineHeight: 1.4, color: COULEURS.encre }}>{uneData.titre}</div>
              <button style={{ ...S.lienDiscret, marginTop: 10 }} onClick={() => setUneData(null)}>↺ Actualiser</button>
            </div>
          )}
        </>
      )}

      {/* Météo du jour — géolocalisation auto ou lieu manuel + illustration + commentaire */}
      {typeContrib === "meteo" && (
        <>
          <label style={S.label}>Météo du jour</label>
          {!meteoData ? (
            <div>
              <button style={{ ...S.boutonPrincipal, marginTop: 0 }} disabled={meteoChargement} onClick={fetchMeteo}>
                {meteoChargement ? "Localisation en cours…" : "📍 Utiliser ma position"}
              </button>
              <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "10px 0 8px" }}>
                <div style={{ flex: 1, height: 1, background: COULEURS.bordure }} />
                <span style={{ fontSize: 12, color: COULEURS.doux, fontWeight: 600 }}>ou</span>
                <div style={{ flex: 1, height: 1, background: COULEURS.bordure }} />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  style={{ ...S.input, flex: 1, margin: 0 }}
                  placeholder="Paris, Lyon, New York…"
                  value={lieuManuel}
                  onChange={e => setLieuManuel(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && fetchMeteoLieu()}
                />
                <button style={{ ...S.boutonMini, flexShrink: 0, margin: 0 }} disabled={meteoChargement || !lieuManuel.trim()} onClick={fetchMeteoLieu}>
                  {meteoChargement ? "…" : "🔍"}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ background: fondMeteo(meteoData.cle), borderRadius: 20, padding: "24px 16px", boxShadow: "0 6px 24px rgba(46,34,48,0.15)", textAlign: "center" }}>
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 6 }}>
                  <IllustrationMeteo cle={meteoData.cle || "soleil"} taille={120} />
                </div>
                <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 48, fontWeight: 800, color: texteMeteo(meteoData.cle), lineHeight: 1 }}>{meteoData.temp}°C</div>
                <div style={{ fontSize: 17, fontWeight: 700, color: texteMeteo(meteoData.cle), marginTop: 6, opacity: 0.9 }}>{meteoData.condition}</div>
                <div style={{ fontSize: 13, color: texteMeteo(meteoData.cle), marginTop: 4, opacity: 0.7 }}>{meteoData.lieu} · {meteoData.date}</div>
                <button style={{ ...S.lienDiscret, marginTop: 10, color: texteMeteo(meteoData.cle), opacity: 0.7 }} onClick={() => { setMeteoData(null); setLieuManuel(""); }}>↺ Changer de lieu</button>
              </div>
              <textarea
                style={{ ...S.zoneTexte, marginTop: 10, minHeight: 72 }}
                placeholder="Un petit commentaire sur ce temps… (facultatif)"
                value={meteoCommentaire}
                onChange={e => setMeteoCommentaire(e.target.value)}
              />
            </div>
          )}
        </>
      )}


      {/* Chanson — iTunes Search API (gratuite, sans clé), affiche pochette + titre + artiste */}
      {typeContrib === "chanson" && (
        <>
          <label style={S.label}>Rechercher une chanson</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input style={{ ...S.input, flex: 1 }} placeholder="Artiste ou titre…"
              value={rechercheMusique} onChange={(e) => { setRechercheMusique(e.target.value); setChansonSelectionnee(null); }}
              onKeyDown={(e) => e.key === "Enter" && rechercherChanson()} />
            <button style={{ ...S.boutonMini, marginTop: 0, whiteSpace: "nowrap" }} onClick={rechercherChanson} disabled={rechercheEnCours}>
              {rechercheEnCours ? "…" : "🔍"}
            </button>
          </div>
          {/* Résultats iTunes */}
          {resultatsMusique.length > 0 && !chansonSelectionnee && (
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
              {resultatsMusique.map((r, i) => (
                <button key={i} onClick={() => setChansonSelectionnee({ titre: r.trackName, artiste: r.artistName, pochette: r.artworkUrl100?.replace("100x100", "300x300"), urlApple: r.trackViewUrl, previewUrl: r.previewUrl })}
                  style={{ display: "flex", alignItems: "center", gap: 12, background: "#fff", border: "none", borderRadius: 14, padding: "10px 12px", cursor: "pointer", textAlign: "left", boxShadow: "0 2px 8px rgba(46,34,48,0.06)" }}>
                  <img src={r.artworkUrl100} alt="" style={{ width: 44, height: 44, borderRadius: 8, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: COULEURS.encre }}>{r.trackName}</div>
                    <div style={{ fontSize: 12, color: COULEURS.doux }}>{r.artistName}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
          {/* Aperçu de la chanson sélectionnée + paroles */}
          {chansonSelectionnee && (
            <div style={{ marginTop: 10 }}>
              <div style={{ background: "#fff", borderRadius: 16, padding: 16, display: "flex", alignItems: "center", gap: 14, boxShadow: "0 4px 14px rgba(46,34,48,0.07)" }}>
                <img src={chansonSelectionnee.pochette} alt="" style={{ width: 64, height: 64, borderRadius: 12, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, color: COULEURS.encre }}>{chansonSelectionnee.titre}</div>
                  <div style={{ fontSize: 13, color: COULEURS.doux }}>{chansonSelectionnee.artiste}</div>
                </div>
                <button onClick={() => { setChansonSelectionnee(null); setResultatsMusique([]); setParoles(null); }} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer" }}>×</button>
              </div>

              {/* Bouton pour récupérer les paroles */}
              {!paroles && (
                <button
                  style={{ ...S.boutonSecondaire, marginTop: 10, width: "100%" }}
                  disabled={parolesChargement}
                  onClick={() => fetchParoles(chansonSelectionnee.artiste, chansonSelectionnee.titre)}>
                  {parolesChargement ? "Recherche des paroles…" : "📝 Ajouter les paroles"}
                </button>
              )}

              {/* Paroles introuvables */}
              {paroles === "__introuvable__" && (
                <p style={{ ...S.aide, marginTop: 8 }}>Paroles introuvables pour cette chanson.</p>
              )}

              {/* Paroles trouvées */}
              {paroles && paroles !== "__introuvable__" && (
                <div style={{ background: "#fff", borderRadius: 16, padding: "14px 16px", marginTop: 10, boxShadow: "0 4px 14px rgba(46,34,48,0.07)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <span style={{ fontWeight: 700, fontSize: 13, color: COULEURS.encre }}>📝 Paroles incluses</span>
                    <button onClick={() => setParoles(null)} style={{ background: "none", border: "none", fontSize: 12, color: COULEURS.doux, cursor: "pointer", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                      ✕ Retirer
                    </button>
                  </div>
                  <div style={{ maxHeight: 160, overflowY: "auto", fontSize: 13, color: COULEURS.encre, lineHeight: 1.7, whiteSpace: "pre-line" }}>
                    {paroles}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Document PDF — sélection du fichier + titre optionnel */}
      {typeContrib === "document" && (
        <>
          <label style={S.label}>Fichier PDF</label>
          <input
            type="file"
            accept="application/pdf"
            style={S.input}
            onChange={e => { const f = e.target.files[0]; if (f) setPdfFichier(f); }}
          />
          {/* Aperçu du fichier sélectionné */}
          {pdfFichier && (
            <div style={{ background: "var(--carte-bg)", borderRadius: 16, padding: "14px 16px", marginTop: 12,
              display: "flex", alignItems: "center", gap: 14, boxShadow: "0 4px 14px rgba(46,34,48,0.07)" }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: DEGRADE,
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>
                📄
              </div>
              <div style={{ flex: 1, overflow: "hidden" }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: COULEURS.encre,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {pdfFichier.name}
                </div>
                <div style={{ fontSize: 12, color: COULEURS.doux, marginTop: 2 }}>
                  {(pdfFichier.size / 1024).toFixed(0)} Ko · PDF
                </div>
              </div>
              <button onClick={() => setPdfFichier(null)}
                style={{ background: "none", border: "none", cursor: "pointer",
                  color: COULEURS.doux, fontSize: 18, padding: 4, lineHeight: 1, flexShrink: 0 }}>
                ✕
              </button>
            </div>
          )}
          <label style={{ ...S.label, marginTop: 14 }}>Titre ou description (optionnel)</label>
          <input style={S.input} placeholder="Ex. Diplôme de Lucas, Contrat de mariage…"
            value={texte} onChange={e => setTexte(e.target.value)} />
          <p style={S.aide}>📄 Le document sera accessible en un clic à l'ouverture de la capsule.</p>
        </>
      )}

      {typeContrib && !((typeContrib === "photo" || typeContrib === "video") && media) && (
        <>
          {/* Preuve sociale discrète : renforce la motivation juste avant de sceller,
              sans alourdir visuellement l'acte de dépôt */}
          {peutEnvoyer && <LigneStatDiscrète />}
          {typeContrib === "vote" && !peutEnvoyer && (
            <p style={{ ...S.aide, color: "#FF5C5C", marginBottom: 6 }}>
              {!voteQuestion.trim()
                ? "⚠️ Écrivez d'abord votre question."
                : optionsValides.length < 2
                ? "⚠️ Ajoutez au moins 2 options."
                : "⚠️ Sélectionnez votre propre réponse avant de sceller."}
            </p>
          )}
          <button style={{ ...S.boutonPrincipal, ...(peutEnvoyer ? {} : S.boutonDesactive) }} disabled={!peutEnvoyer} onClick={envoyer}>
            🔒 Sceller ce souvenir
          </button>
        </>
      )}
    </div>
  );
}

// Carte chanson dans EcranOuverture avec accordéon paroles.
function ChansonOuverture({ donnees }) {
  const [parolesOuvertes, setParolesOuvertes] = React.useState(false);
  return (
    <div style={{ background: "#fff", borderRadius: 16, overflow: "hidden", boxShadow: "0 4px 14px rgba(46,34,48,0.07)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: 16 }}>
        <img src={donnees.pochette} alt="" style={{ width: 72, height: 72, borderRadius: 12, flexShrink: 0, boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: COULEURS.encre }}>{donnees.titre}</div>
          <div style={{ fontSize: 13, color: COULEURS.doux, marginTop: 2 }}>{donnees.artiste}</div>
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            {donnees.urlApple && (
              <a href={donnees.urlApple} target="_blank" rel="noreferrer"
                style={{ background: DEGRADE, color: "#fff", borderRadius: 10, padding: "6px 14px", fontSize: 12, fontWeight: 700, textDecoration: "none" }}>
                🎵 Écouter
              </a>
            )}
            {donnees.paroles && (
              <button onClick={() => setParolesOuvertes(v => !v)}
                style={{ background: parolesOuvertes ? COULEURS.encre : "#f0eaf2", color: parolesOuvertes ? "#fff" : COULEURS.encre, border: "none", borderRadius: 10, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                📝 {parolesOuvertes ? "Masquer les paroles" : "Voir les paroles"}
              </button>
            )}
          </div>
        </div>
      </div>
      {parolesOuvertes && donnees.paroles && (
        <div style={{ borderTop: `1px solid ${COULEURS.bordure}`, padding: "14px 16px", fontSize: 13, color: COULEURS.encre, lineHeight: 1.8, whiteSpace: "pre-line", maxHeight: 320, overflowY: "auto", background: "#faf8fc" }}>
          {donnees.paroles}
        </div>
      )}
    </div>
  );
}

// Barre de réactions : 3 emojis toujours visibles en bas, 4 cachés derrière "+".
// Un seul emoji par utilisateur. L'emoji choisi s'affiche en badge sur la carte (pas ici).
function ReactionsBar({ contrib, capsuleId, reagir, monParticipantId }) {
  const [plusOuvert, setPlusOuvert] = React.useState(false);

  const monReaction = monParticipantId ? contrib.reactionsDétail?.[monParticipantId] : null;
  // La barre du bas affiche UNIQUEMENT les 3 réactions toujours visibles
  const enBarre = REACTIONS.filter(r => r.visible);
  // Le panneau "+" contient toujours les 4 réactions cachées
  const enPlus  = REACTIONS.filter(r => !r.visible);

  return (
    <div style={{ marginTop: 18, position: "relative" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {enBarre.map(r => {
          const nb = contrib.reactions?.[r.id] || 0;
          const choisi = monReaction === r.id;
          return (
            <button key={r.id}
              style={{ ...S.boutonReaction, ...(choisi ? { background: "#FFE9D6", outline: "2px solid #FF8A3D" } : {}) }}
              onClick={() => reagir(capsuleId, contrib.id, r.id)}>
              {r.icone}{nb > 0 && <span style={S.reactionNb}>{nb}</span>}
            </button>
          );
        })}
        <button
          onClick={() => setPlusOuvert(v => !v)}
          style={{ ...S.boutonReaction, flex: "none", width: 44, fontSize: 16, color: plusOuvert ? "#fff" : COULEURS.doux, background: plusOuvert ? COULEURS.encre : "#FBF3F7" }}>
          {plusOuvert ? "✕" : "+"}
        </button>
      </div>

      {/* Panneau des 4 réactions cachées */}
      {plusOuvert && (
        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          {enPlus.map(r => {
            const choisi = monReaction === r.id;
            return (
              <button key={r.id}
                style={{ ...S.boutonReaction, ...(choisi ? { background: "#FFE9D6", outline: "2px solid #FF8A3D" } : {}) }}
                onClick={() => { reagir(capsuleId, contrib.id, r.id); setPlusOuvert(false); }}>
                {r.icone}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================================
//  GÉNÉRATEUR D'ALBUM PDF — produit un HTML complet ouvrable dans un nouvel onglet
//  → l'utilisateur utilise le bouton "Sauvegarder en PDF" ou Ctrl+P
// ============================================================================
function genererAlbumHTML(capsule, { embarque = false } = {}) {
  const typeInfo = TYPES_CAPSULES.find(t => t.id === capsule.type) || { icone: "✨", nom: "Capsule" };
  const souvenirs = [...capsule.contributions].sort((a, b) => new Date(a.date) - new Date(b.date));
  const fmtDate = d => d ? new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "";
  const esc = s => String(s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

  const logoSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="110" height="44" fill="none" viewBox="0 0 110 44">
    <defs>
      <linearGradient id="lga" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#FF8A3D"/><stop offset="100%" stop-color="#FF5C9D"/></linearGradient>
      <linearGradient id="lgb" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#FF5C9D"/><stop offset="100%" stop-color="#C65CE8"/></linearGradient>
      <linearGradient id="lgc" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#C65CE8"/><stop offset="100%" stop-color="#4D7CFF"/></linearGradient>
    </defs>
    <circle cx="13" cy="22" r="11" stroke="url(#lga)" stroke-width="2.5"/>
    <circle cx="42" cy="22" r="15" stroke="url(#lgb)" stroke-width="3"/>
    <circle cx="79" cy="22" r="19" stroke="url(#lgc)" stroke-width="3.5"/>
  </svg>`;

  const waveformSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="38" viewBox="0 0 200 38">
    <defs><linearGradient id="wg" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#FF8A3D"/><stop offset="50%" stop-color="#FF5C9D"/><stop offset="100%" stop-color="#C65CE8"/></linearGradient></defs>
    ${[5,9,14,20,26,22,16,10,6,8,14,21,27,23,17,11,7,12,18,24,20,14,8,5,9,16,22,26,18,12].map((h,i)=>
      `<rect x="${i*6+2}" y="${(38-h)/2}" width="4" height="${h}" rx="2" fill="url(#wg)" opacity="${0.5+i/60}"/>`
    ).join("")}
  </svg>`;

  function avatarEl(p, size = 40) {
    const initial = (p?.prenom || "?")[0].toUpperCase();
    const color = p?.couleur || "#FF6B5E";
    const s = `width:${size}px;height:${size}px;border-radius:50%;flex-shrink:0`;
    if (p?.photo) return `<img src="${esc(p.photo)}" style="${s};object-fit:cover"/>`;
    return `<div style="${s};background:${color};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:${Math.round(size*0.38)}px">${initial}</div>`;
  }

  function cardHeader(c) {
    const auteur = capsule.participants.find(p => p.id === c.auteurId);
    const LABELS = { message:"💬 MESSAGE", photo:"📷 PHOTO", video:"🎬 VIDÉO", vocal:"🎙 VOCAL", dessin:"🎨 DESSIN",
      secret:"🤫 SECRET", chanson:"🎵 CHANSON", meteo:"🌤 MÉTÉO", une_du_jour:"📰 UNE DU JOUR",
      pari:"🎲 PARI", question_guidee:"💬 QUESTION", document:"📄 DOCUMENT PDF" };
    return `<div style="display:flex;align-items:center;gap:12px;margin-bottom:18px">
      ${avatarEl(auteur, 40)}
      <div style="flex:1">
        <div style="font-weight:700;font-size:15px;color:#2E2230">${esc(auteur?.prenom || "?")}</div>
        <div style="font-size:12px;color:#9B8AA0;margin-top:2px">${fmtDate(c.date)}</div>
      </div>
      <div style="font-size:10px;font-weight:700;letter-spacing:1.5px;color:#9B8AA0;background:#f8f5f9;padding:4px 10px;border-radius:99px;white-space:nowrap">${LABELS[c.type] || esc(c.type)}</div>
    </div>`;
  }

  function souvenirHTML(c) {
    const auteur = capsule.participants.find(p => p.id === c.auteurId);
    let content = "";

    if (c.type === "photo" && c.media) {
      content = `<img src="${esc(c.media)}" style="width:100%;max-height:360px;object-fit:cover;border-radius:14px;display:block${c.texte ? ";margin-bottom:14px" : ""}"/>
        ${c.texte ? `<p style="font-size:15px;color:#2E2230;line-height:1.75;margin:0;font-style:italic">« ${esc(c.texte)} »</p>` : ""}`;

    } else if (c.type === "video") {
      content = `<div style="background:linear-gradient(135deg,#1c1014,#2E2230);border-radius:14px;padding:36px 24px;text-align:center${c.texte ? ";margin-bottom:14px" : ""}">
        <div style="font-size:52px;margin-bottom:10px">🎬</div>
        <div style="color:#fff;font-weight:700;font-size:15px">Souvenir vidéo de ${esc(auteur?.prenom || "?")}</div>
      </div>
      ${c.texte ? `<p style="font-size:15px;color:#2E2230;line-height:1.75;margin:0;font-style:italic">« ${esc(c.texte)} »</p>` : ""}`;

    } else if (c.type === "vocal") {
      content = `<div style="background:linear-gradient(135deg,#fff5f8,#f5f0ff);border-radius:14px;padding:24px 20px;display:flex;align-items:center;gap:18px">
        <div style="width:54px;height:54px;border-radius:50%;background:linear-gradient(135deg,#FF5C9D,#C65CE8);display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
          </svg>
        </div>
        <div style="flex:1;overflow:hidden">
          <div style="font-weight:700;font-size:14px;color:#2E2230;margin-bottom:10px">Message vocal de ${esc(auteur?.prenom || "?")}</div>
          ${waveformSVG}
        </div>
      </div>`;

    } else if (c.type === "dessin" && c.media) {
      content = `<img src="${esc(c.media)}" style="width:100%;max-height:300px;object-fit:contain;border-radius:14px;display:block;image-rendering:pixelated"/>`;

    } else if (c.type === "secret") {
      content = `<div style="background:linear-gradient(135deg,rgba(155,90,160,0.09),rgba(77,124,255,0.09));border-radius:14px;padding:32px 24px;text-align:center">
        <div style="font-size:40px;margin-bottom:16px">🤫</div>
        <p style="font-size:18px;line-height:1.8;color:#2E2230;margin:0;font-style:italic">« ${esc(c.texte)} »</p>
      </div>`;

    } else if (c.type === "message" || c.type === "question_guidee") {
      const amb = AMBIANCES.find(a => a.id === c.ambiance);
      if (amb) {
        content = `<div style="background:${amb.fond};color:${amb.texte};border-radius:14px;padding:32px 24px;font-size:19px;line-height:1.8;font-weight:600;text-align:center;font-style:italic">${esc(c.texte)}</div>`;
      } else {
        content = `<div style="padding-left:20px;border-left:5px solid transparent;border-image:linear-gradient(180deg,#FF8A3D,#FF5C9D,#C65CE8) 1">
          <p style="font-size:19px;line-height:1.8;color:#2E2230;margin:0;font-style:italic">« ${esc(c.texte)} »</p>
        </div>`;
      }

    } else if (c.type === "chanson") {
      let d = {}; try { d = JSON.parse(c.question) || {}; } catch {}
      const pochette = d.pochette ? `<img src="${esc(d.pochette)}" style="width:80px;height:80px;border-radius:12px;flex-shrink:0;object-fit:cover;box-shadow:0 4px 12px rgba(0,0,0,0.18)"/>` :
        `<div style="width:80px;height:80px;border-radius:12px;background:linear-gradient(135deg,#FF5C9D,#C65CE8);display:flex;align-items:center;justify-content:center;font-size:32px;flex-shrink:0">🎵</div>`;
      content = `<div style="display:flex;gap:18px;align-items:center;background:#faf8fc;border-radius:14px;padding:20px">
        ${pochette}
        <div style="flex:1;min-width:0">
          <div style="font-size:18px;font-weight:800;color:#2E2230;margin-bottom:4px">${esc(d.titre || "Chanson")}</div>
          <div style="font-size:14px;color:#9B8AA0;margin-bottom:${d.paroles ? "10px" : "0"}">${esc(d.artiste || "")}</div>
          ${d.paroles ? `<div style="font-size:12px;color:#9B8AA0;font-style:italic;line-height:1.7;white-space:pre-line">${esc(d.paroles.split("\n").slice(0,4).join("\n"))}</div>` : ""}
        </div>
      </div>`;

    } else if (c.type === "meteo") {
      let d = {}; try { d = JSON.parse(c.question) || {}; } catch {}
      const bgs = { soleil:"linear-gradient(135deg,#FFF9C4,#FFE082)", nuages:"linear-gradient(135deg,#E0E7F0,#B0BEC5)",
        pluie:"linear-gradient(135deg,#BBDEFB,#90CAF9)", orage:"linear-gradient(135deg,#CFD8DC,#90A4AE)",
        neige:"linear-gradient(135deg,#E3F2FD,#BBDEFB)", brume:"linear-gradient(135deg,#F5F5F5,#ECEFF1)" };
      const emojis = { soleil:"☀️", nuages:"⛅", pluie:"🌧️", orage:"⛈️", neige:"❄️", brume:"🌫️" };
      const bg = bgs[d.cle] || "linear-gradient(135deg,#f8f5f9,#f0ecf1)";
      content = `<div style="background:${bg};border-radius:20px;padding:32px 24px;text-align:center">
        <div style="font-size:60px;margin-bottom:10px">${emojis[d.cle] || "🌤"}</div>
        <div style="font-size:48px;font-weight:800;color:#2E2230;line-height:1">${esc(d.temp || "--")}°C</div>
        <div style="font-size:18px;font-weight:700;color:#2E2230;margin-top:10px">${esc(d.condition || "")}</div>
        <div style="font-size:12px;color:#555;margin-top:6px">${esc(d.lieu || "")}${d.lieu && d.date ? " · " : ""}${esc(d.date || "")}</div>
        ${d.commentaire ? `<div style="margin-top:16px;background:rgba(255,255,255,0.55);border-radius:12px;padding:12px 18px;font-size:14px;font-style:italic;color:#2E2230;line-height:1.7">« ${esc(d.commentaire)} »</div>` : ""}
      </div>`;

    } else if (c.type === "une_du_jour") {
      let d = {}; try { d = JSON.parse(c.question) || {}; } catch {}
      content = `<div style="border-radius:14px;overflow:hidden;border:1px solid #f0ecf1">
        <div style="height:5px;background:linear-gradient(90deg,#FF8A3D,#FF5C9D,#C65CE8)"></div>
        <div style="padding:20px 24px">
          <div style="font-size:11px;font-weight:700;color:#9B8AA0;letter-spacing:2px;margin-bottom:10px">${esc((d.source || "").toUpperCase())}${d.date ? " · " + esc(d.date) : ""}</div>
          <div style="font-size:20px;font-weight:800;color:#2E2230;line-height:1.5">${esc(d.titre || "")}</div>
        </div>
      </div>`;

    } else if (c.type === "document") {
      // Carte document PDF dans l'album : icône + nom du fichier + lien cliquable
      content = `<div style="display:flex;align-items:center;gap:20px;background:linear-gradient(135deg,#fff5f0 0%,#f5f0ff 100%);border-radius:14px;padding:22px 20px">
        <div style="width:52px;height:64px;border-radius:10px;background:linear-gradient(135deg,#FF5C9D,#C65CE8);display:flex;align-items:center;justify-content:center;font-size:28px;flex-shrink:0;box-shadow:0 4px 12px rgba(255,92,157,0.35)">📄</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:16px;color:#2E2230;margin-bottom:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.texte || "Document PDF")}</div>
          <div style="font-size:12px;color:#9B8AA0;margin-bottom:14px">Document partagé dans cette capsule</div>
          ${c.media ? `<a href="${esc(c.media)}" target="_blank" style="display:inline-block;background:linear-gradient(120deg,#FF8A3D,#FF5C9D);color:#fff;text-decoration:none;padding:9px 20px;border-radius:10px;font-size:13px;font-weight:700">Ouvrir le document →</a>` : '<span style="font-size:12px;color:#9B8AA0;font-style:italic">Fichier non disponible</span>'}
        </div>
      </div>`;

    } else if (c.type === "pari") {
      let d = { votes: {} }; try { d = JSON.parse(c.question) || {}; } catch {}
      const votes = d.votes || {};
      const vList = Object.entries(votes);
      const nOui = vList.filter(([,v]) => v.vote === "oui").length;
      const nNon = vList.filter(([,v]) => v.vote === "non").length;
      const total = vList.length;
      const pOui = total > 0 ? Math.round(nOui/total*100) : 0;
      const pNon = total > 0 ? Math.round(nNon/total*100) : 0;
      const rows = capsule.participants.map(p => {
        const v = votes[p.id];
        return `<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;background:#fff;border-radius:10px;margin-bottom:6px;box-shadow:0 1px 4px rgba(46,34,48,0.05)">
          ${avatarEl(p, 30)}
          <div style="flex:1;font-weight:600;font-size:13px;color:#2E2230">${esc(p.prenom)}</div>
          <span style="font-weight:700;font-size:13px;color:${v ? (v.vote==="oui"?"#22c55e":"#ef4444") : "#9B8AA0"}">
            ${v ? (v.vote==="oui" ? "✅ Je dis oui" : "❌ Je dis non") : "n'a pas voté"}
          </span>
        </div>`;
      }).join("");
      content = `<div style="background:linear-gradient(135deg,rgba(255,138,61,0.08),rgba(198,92,232,0.08));border-radius:14px;padding:20px">
        <p style="font-size:19px;font-weight:700;color:#2E2230;text-align:center;font-style:italic;margin:0 0 20px">« ${esc(c.texte)} »</p>
        ${total > 0 ? `<div style="margin-bottom:16px">
          <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:700;color:#22c55e;margin-bottom:5px"><span>✅ Je dis oui</span><span>${pOui}%</span></div>
          <div style="height:12px;background:#e8fdf0;border-radius:6px;overflow:hidden;margin-bottom:10px"><div style="height:100%;width:${pOui}%;background:linear-gradient(90deg,#22c55e,#4ade80);border-radius:6px"></div></div>
          <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:700;color:#ef4444;margin-bottom:5px"><span>❌ Je dis non</span><span>${pNon}%</span></div>
          <div style="height:12px;background:#fff0f0;border-radius:6px;overflow:hidden"><div style="height:100%;width:${pNon}%;background:linear-gradient(90deg,#ef4444,#f87171);border-radius:6px"></div></div>
        </div>` : ""}
        <div>${rows}</div>
      </div>`;
    } else {
      content = `<p style="font-size:16px;line-height:1.75;color:#2E2230;margin:0">${esc(c.texte || "")}</p>`;
    }

    return `<div style="break-inside:avoid;page-break-inside:avoid;margin-bottom:28px;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(46,34,48,0.07);border:1px solid #f0e8f0">
      <div style="height:5px;background:linear-gradient(90deg,#FF8A3D,#FF5C9D,#C65CE8,#4D7CFF)"></div>
      <div style="padding:22px 26px">${cardHeader(c)}${content}</div>
    </div>`;
  }

  const cardsHTML = souvenirs.map(c => souvenirHTML(c)).join("");

  const participantsHTML = capsule.participants.map(p => `
    <div style="display:flex;align-items:center;gap:16px;padding:14px 0;border-bottom:1px solid #f8f5f9">
      ${avatarEl(p, 50)}
      <div style="flex:1">
        <div style="font-weight:700;font-size:16px;color:#2E2230">${esc(p.prenom)}</div>
        ${p.description ? `<div style="font-size:13px;color:#9B8AA0;margin-top:3px">${esc(p.description)}</div>` : ""}
      </div>
      <div style="text-align:right">
        <div style="font-size:22px;font-weight:800;color:#2E2230">${capsule.contributions.filter(c => c.auteurId === p.id).length}</div>
        <div style="font-size:11px;color:#9B8AA0;letter-spacing:1px">SOUVENIR${capsule.contributions.filter(c => c.auteurId === p.id).length > 1 ? "S" : ""}</div>
      </div>
    </div>`).join("");

  const dateCreation = fmtDate(capsule.dateCreation);
  const dateOuverture = fmtDate(capsule.dateOuverture);

  return `<!DOCTYPE html><html lang="fr"><head>
<meta charset="utf-8">
<title>Album · ${esc(capsule.nom)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  *,*::before,*::after{box-sizing:border-box}
  @page{margin:0;size:A4}
  body{margin:0;font-family:'Plus Jakarta Sans',sans-serif;background:#f8f5f9;color:#2E2230;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  @media print{.no-print{display:none!important}body{background:#fff}.memories{padding-top:40px}}
  ${!embarque ? `.bar{position:fixed;top:0;left:0;right:0;background:#1c1014;padding:13px 24px;display:flex;align-items:center;justify-content:space-between;z-index:999;box-shadow:0 2px 20px rgba(0,0,0,0.35)}
  .bar-btn{background:linear-gradient(120deg,#FF8A3D,#FF5C9D);color:#fff;border:none;border-radius:12px;padding:10px 22px;font-size:14px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}
  .bar-title{color:#fff;font-weight:700;font-size:15px;margin-left:14px}
  .body{padding-top:66px}` : ".body{padding-top:0}"}
  .cover{background:#1c1014;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 40px;text-align:center;page-break-after:always;break-after:page;position:relative;overflow:hidden}
  .cover::before{content:'';position:absolute;top:-100px;right:-100px;width:320px;height:320px;border-radius:50%;background:radial-gradient(circle,rgba(198,92,232,0.18) 0%,transparent 70%)}
  .cover::after{content:'';position:absolute;bottom:-80px;left:-80px;width:280px;height:280px;border-radius:50%;background:radial-gradient(circle,rgba(255,138,61,0.14) 0%,transparent 70%)}
  .cover-icone{font-size:64px;margin-bottom:24px;position:relative;z-index:1}
  .cover-titre{font-family:'Bricolage Grotesque',sans-serif;font-size:44px;font-weight:800;background:linear-gradient(120deg,#FF8A3D,#FF5C9D 45%,#C65CE8 80%,#4D7CFF);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;line-height:1.2;margin:0 0 14px;position:relative;z-index:1}
  .cover-meta{color:rgba(255,255,255,0.5);font-size:14px;letter-spacing:.5px;position:relative;z-index:1}
  .cover-stats{display:flex;gap:36px;justify-content:center;margin-top:36px;position:relative;z-index:1}
  .stat-num{font-family:'Bricolage Grotesque',sans-serif;font-size:38px;font-weight:800;color:#fff;line-height:1}
  .stat-label{font-size:11px;color:rgba(255,255,255,0.4);letter-spacing:1.5px;text-transform:uppercase;margin-top:4px}
  .cover-bar{width:72px;height:4px;background:linear-gradient(90deg,#FF8A3D,#FF5C9D,#C65CE8);border-radius:2px;margin:32px auto 0;position:relative;z-index:1}
  .memories{padding:44px 36px;max-width:780px;margin:0 auto}
  .sec-title{font-size:11px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:#9B8AA0;margin-bottom:30px;display:flex;align-items:center;gap:14px}
  .sec-title::after{content:'';flex:1;height:1px;background:linear-gradient(90deg,#f0e8f0,transparent)}
  .participants-page{page-break-before:always;break-before:page;padding:44px 36px;max-width:780px;margin:0 auto}
  .closing{text-align:center;padding:56px 36px;max-width:780px;margin:0 auto}
  .closing-msg{font-family:'Bricolage Grotesque',sans-serif;font-size:22px;font-weight:800;color:#2E2230;line-height:1.6;margin-bottom:10px}
  .closing-bar{width:56px;height:3px;background:linear-gradient(90deg,#FF8A3D,#FF5C9D,#C65CE8);border-radius:2px;margin:24px auto 0}
</style>
</head><body>
${!embarque ? `<div class="bar no-print">
  <div style="display:flex;align-items:center">${logoSVG}<span class="bar-title">${esc(capsule.nom)}</span></div>
  <button class="bar-btn" onclick="window.print()">📄 Sauvegarder en PDF</button>
</div>` : ""}
<div class="body">
  <div class="cover">
    <div style="position:relative;z-index:1;margin-bottom:36px">${logoSVG}</div>
    <div class="cover-icone">${typeInfo.icone}</div>
    <h1 class="cover-titre">${esc(capsule.nom)}</h1>
    <div class="cover-meta">${esc(typeInfo.nom)} · ${capsule.participants.length} participant${capsule.participants.length>1?"s":""}</div>
    <div class="cover-stats">
      <div class="cover-stat"><div class="stat-num">${souvenirs.length}</div><div class="stat-label">Souvenirs</div></div>
      ${dateCreation?`<div class="cover-stat"><div class="stat-num" style="font-size:14px;padding-top:11px;letter-spacing:-.3px">${esc(dateCreation)}</div><div class="stat-label">Créée le</div></div>`:""}
      ${dateOuverture?`<div class="cover-stat"><div class="stat-num" style="font-size:14px;padding-top:11px;letter-spacing:-.3px">${esc(dateOuverture)}</div><div class="stat-label">Ouverte le</div></div>`:""}
    </div>
    <div class="cover-bar"></div>
  </div>
  <div class="memories">
    <div class="sec-title">Les souvenirs</div>
    ${cardsHTML}
  </div>
  <div class="participants-page">
    <div style="font-family:'Bricolage Grotesque',sans-serif;font-size:30px;font-weight:800;color:#2E2230;margin-bottom:6px">Les participants 💛</div>
    <div style="font-size:14px;color:#9B8AA0;margin-bottom:28px">${capsule.participants.length} personne${capsule.participants.length>1?"s":""} ont contribué à cette capsule</div>
    ${participantsHTML}
  </div>
  <div class="closing">
    <div style="margin-bottom:20px">${logoSVG}</div>
    <div class="closing-msg">Ces souvenirs vous appartiennent pour toujours.</div>
    <div style="font-size:14px;color:#9B8AA0">Merci d'avoir utilisé Blooom pour garder ce qui compte vraiment.</div>
    <div class="closing-bar"></div>
  </div>
</div>
</body></html>`;
}

// ============================================================================
//  ANIMATIONS DE RÉVÉLATION — effets visuels pour chaque type de souvenir
// ============================================================================

function Particules({ couleur = "#FF8A3D", nb = 20, taille = 8 }) {
  const items = React.useMemo(() => Array.from({ length: nb }, () => ({
    x: Math.random() * 100,
    y: Math.random() * 30,
    delay: Math.random() * 1.5,
    dur: 1.5 + Math.random() * 1.5,
    dx: (Math.random() - 0.5) * 200,
    dy: -150 - Math.random() * 200,
  })), [nb]);
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
      {items.map((item, i) => (
        <div key={i} style={{
          position: "absolute",
          bottom: `${item.y}%`,
          left: `${item.x}%`,
          width: taille, height: taille,
          borderRadius: "50%",
          background: couleur,
          animation: `animParticleOut ${item.dur}s ${item.delay}s ease-out both`,
          "--dx": `${item.dx}px`,
          "--dy": `${item.dy}px`,
        }} />
      ))}
    </div>
  );
}

function Confettis({ nb = 40 }) {
  const couleurs = ["#FF8A3D","#FF5C9D","#C65CE8","#4D7CFF","#FFC436","#22C7B8"];
  const items = React.useMemo(() => Array.from({ length: nb }, (_, i) => ({
    couleur: couleurs[i % couleurs.length],
    x: Math.random() * 100,
    delay: Math.random() * 0.8,
    dur: 1.2 + Math.random() * 1.5,
    w: 8 + Math.random() * 8,
    h: 5 + Math.random() * 6,
    rot: Math.random() * 720 - 360,
  })), [nb]);
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
      {items.map((item, i) => (
        <div key={i} style={{
          position: "absolute",
          top: -20,
          left: `${item.x}%`,
          width: item.w, height: item.h,
          background: item.couleur,
          borderRadius: 2,
          transform: `rotate(${item.rot}deg)`,
          animation: `animConfetti ${item.dur}s ${item.delay}s ease-in both`,
        }} />
      ))}
    </div>
  );
}

function EtoilesOr({ nb = 18 }) {
  const items = React.useMemo(() => Array.from({ length: nb }, () => ({
    x: 5 + Math.random() * 90,
    y: 5 + Math.random() * 90,
    delay: Math.random() * 1.5,
    dur: 0.8 + Math.random(),
    taille: 12 + Math.random() * 16,
  })), [nb]);
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
      {items.map((item, i) => (
        <div key={i} style={{
          position: "absolute",
          top: `${item.y}%`,
          left: `${item.x}%`,
          fontSize: item.taille,
          animation: `animPulseDoux ${item.dur}s ${item.delay}s ease-in-out 3 both`,
        }}>✨</div>
      ))}
    </div>
  );
}

function OndeExpansion({ couleur = "var(--a1)", nb = 3 }) {
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
      {Array.from({ length: nb }).map((_, i) => (
        <div key={i} style={{
          position: "absolute",
          width: 60, height: 60,
          borderRadius: "50%",
          border: `3px solid ${couleur}`,
          animation: `animOndeExpand 1.8s ${i * 0.5}s ease-out 2 both`,
        }} />
      ))}
    </div>
  );
}

function NotesMusique() {
  const notes = ["🎵","🎶","♪","♫","🎵","🎶"];
  const items = React.useMemo(() => notes.map((n, i) => ({
    note: n,
    x: 8 + i * 16,
    delay: i * 0.25,
    dur: 1.5 + (i % 3) * 0.3,
    taille: 20 + (i % 3) * 8,
  })), []);
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
      {items.map((item, i) => (
        <div key={i} style={{
          position: "absolute",
          bottom: "20%",
          left: `${item.x}%`,
          fontSize: item.taille,
          animation: `animNoteFlotante ${item.dur}s ${item.delay}s ease-out 3 both`,
        }}>{item.note}</div>
      ))}
    </div>
  );
}

const CONFIGS_ANIM_REVEAL = {
  message:    { bg: "linear-gradient(135deg,#1a0e2e 0%,#2d1060 100%)", accent: "#C65CE8", effet: "confettis", suspenseTexte: "Un message vous attend...", revelTexte: "Un mot du cœur !" },
  secret:     { bg: "linear-gradient(135deg,#0d1424 0%,#1a2744 100%)", accent: "#4D7CFF", effet: "etoiles",   suspenseTexte: "Un secret va être révélé...", revelTexte: "Le voile se lève !" },
  photo:      { bg: "linear-gradient(135deg,#1a0820 0%,#2a1040 100%)", accent: "#FF5C9D", effet: "particules",suspenseTexte: "Une photo se dévoile...", revelTexte: "Un instant immortalisé !" },
  video:      { bg: "linear-gradient(135deg,#0e1a1a 0%,#1a3030 100%)", accent: "#22C7B8", effet: "onde",      suspenseTexte: "Une vidéo vous attend...", revelTexte: "Revivez ce moment !" },
  dessin:     { bg: "linear-gradient(135deg,#1a1a0e 0%,#2e2810 100%)", accent: "#FFC436", effet: "etoiles",   suspenseTexte: "Un dessin prend vie...", revelTexte: "Art et créativité !" },
  chanson:    { bg: "linear-gradient(135deg,#1a0a1a 0%,#2d1040 100%)", accent: "#FF8A3D", effet: "notes",     suspenseTexte: "Une mélodie vous attend...", revelTexte: "Laissez-vous emporter !" },
  pari:       { bg: "linear-gradient(135deg,#1a0e0e 0%,#301010 100%)", accent: "#FF6B5E", effet: "confettis", suspenseTexte: "Le verdict arrive...", revelTexte: "Qui avait raison ?!" },
  une_du_jour:{ bg: "linear-gradient(135deg,#0e1620 0%,#142030 100%)", accent: "#00BBF9", effet: "onde",      suspenseTexte: "Une manchette du passé...", revelTexte: "L'actu de l'époque !" },
  meteo:      { bg: "linear-gradient(135deg,#0e1830 0%,#0a2240 100%)", accent: "#4D7CFF", effet: "particules",suspenseTexte: "La météo de ce jour-là...", revelTexte: "Le temps qu'il faisait !" },
  vocal:      { bg: "linear-gradient(135deg,#1a0a20 0%,#2a1040 100%)", accent: "#9B5DE5", effet: "onde",      suspenseTexte: "Une voix du passé...", revelTexte: "Écoutez attentivement !" },
};

function AnimRevealSouvenir({ type, phase, onSkip }) {
  if (!phase) return null;
  const typeInfo = TYPES_CONTRIBUTION.find(t => t.id === type) || { icone: "✨", nom: "Souvenir" };
  const cfg = CONFIGS_ANIM_REVEAL[type] || CONFIGS_ANIM_REVEAL.message;
  const isSuspense   = phase === "suspense";
  const isRevelation = phase === "revelation";
  const isCelebration= phase === "celebration";

  return (
    <div style={{
      position: "absolute", inset: 0, zIndex: 100,
      background: cfg.bg,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      overflow: "hidden",
    }}>
      <button onClick={onSkip} style={{
        position: "absolute", top: 14, right: 14, zIndex: 120,
        background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)",
        backdropFilter: "blur(8px)", borderRadius: 20, padding: "6px 14px",
        color: "rgba(255,255,255,0.85)", fontSize: 12, fontWeight: 600, cursor: "pointer",
        fontFamily: "'Plus Jakarta Sans',sans-serif",
      }}>Passer →</button>

      <OndeExpansion couleur={cfg.accent} nb={isSuspense ? 2 : 4} />

      <div style={{
        fontSize: isSuspense ? 56 : isRevelation ? 88 : 72,
        transition: "font-size 0.3s",
        animation: isSuspense
          ? "animPulseDoux 1.2s ease-in-out infinite"
          : isRevelation
          ? "animZoomElastique 0.5s ease-out both"
          : "animPulseDoux 1.5s ease-in-out infinite",
        filter: `drop-shadow(0 0 28px ${cfg.accent})`,
      }}>
        {isSuspense ? "❓" : typeInfo.icone}
      </div>

      <div key={phase} style={{
        marginTop: 28,
        fontSize: isCelebration ? 20 : 15,
        fontWeight: 700,
        color: "#fff",
        textAlign: "center",
        letterSpacing: 0.4,
        lineHeight: 1.4,
        maxWidth: "78%",
        textShadow: `0 0 24px ${cfg.accent}80`,
        animation: "animEntreeBas 0.4s ease-out both",
        fontFamily: "'Plus Jakarta Sans',sans-serif",
      }}>
        {isSuspense ? cfg.suspenseTexte : isCelebration ? cfg.revelTexte : typeInfo.nom}
      </div>

      {!isSuspense && cfg.effet === "confettis"  && <Confettis nb={45} />}
      {!isSuspense && cfg.effet === "etoiles"    && <EtoilesOr nb={18} />}
      {!isSuspense && cfg.effet === "particules" && <Particules couleur={cfg.accent} nb={22} />}
      {!isSuspense && cfg.effet === "onde"       && <OndeExpansion couleur={cfg.accent} nb={5} />}
      {!isSuspense && cfg.effet === "notes"      && <NotesMusique />}

      {isRevelation && (
        <div style={{
          position: "absolute", inset: 0,
          background: "#fff",
          animation: "animFlashBlanc 0.5s ease-out both",
          pointerEvents: "none",
        }} />
      )}
    </div>
  );
}

// ============================================================================
//  ANIMATION VOTE : révélation des résultats à l'ouverture de la capsule.
//  Phase 0 : question + bouton. Phase 1 : urne qui grossit 6s puis explose.
//  Phase 2 : barres par option + liste nominative.
// ============================================================================
function AnimVote({ contrib, capsule, moisParticipant, voterSouvenir }) {
  const donnees = React.useMemo(() => {
    try { return contrib.question ? JSON.parse(contrib.question) : { question: "", options: [], votes: {} }; }
    catch { return { question: "", options: [], votes: {} }; }
  }, [contrib.question]);

  const votes   = donnees.votes || {};
  const options = donnees.options || [];
  const total   = Object.keys(votes).length;
  const monVote = moisParticipant ? votes[moisParticipant.id] : null;

  const [phase, setPhase]     = React.useState(() => total > 0 && total >= capsule.participants.length ? 2 : 0);
  const [barres, setBarres]   = React.useState({});
  const [envoi, setEnvoi]     = React.useState(false);

  // Urne animation (phase 1) — même mécanique que le dé du pari
  const [urneScale, setUrneScale]     = React.useState(0.05);
  const [urneOpacity, setUrneOpacity] = React.useState(0);
  const [urneRot, setUrneRot]         = React.useState(0);
  const rafRef   = React.useRef(null);
  const startRef = React.useRef(null);
  const DUREE    = 6000;

  React.useEffect(() => {
    if (phase !== 2 || !options.length) return;
    const pcts = {};
    options.forEach(opt => {
      const n = Object.values(votes).filter(v => v === opt).length;
      pcts[opt] = total > 0 ? Math.round(n / total * 100) : 0;
    });
    const t = setTimeout(() => setBarres(pcts), 120);
    return () => clearTimeout(t);
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    if (phase !== 1) return;
    startRef.current = performance.now();
    function tick(now) {
      const elapsed = now - startRef.current;
      const t = Math.min(1, elapsed / DUREE);
      let s;
      if (t < 0.85) { s = 0.05 + Math.pow(t / 0.85, 2) * 0.95; }
      else { const boom = (t - 0.85) / 0.15; s = 1 + boom * boom * 9; }
      const wobble = t < 0.84 ? Math.sin(elapsed * 0.007) * 18 * Math.min(1, t * 5) : 0;
      let op;
      if (t < 0.05) op = t / 0.05;
      else if (t < 0.86) op = 1;
      else op = Math.max(0, 1 - (t - 0.86) / 0.14);
      setUrneScale(s); setUrneOpacity(op); setUrneRot(wobble);
      if (t < 1) { rafRef.current = requestAnimationFrame(tick); }
      else { setPhase(2); }
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  async function voterMaintenant(option) {
    if (!moisParticipant || envoi || monVote) return;
    setEnvoi(true);
    await voterSouvenir(capsule.id, contrib.id, moisParticipant.id, option);
    setEnvoi(false);
  }

  // Couleurs distinctes pour les options
  const COULEURS_OPT = ["#6366f1","#f59e0b","#10b981","#ef4444","#8b5cf6","#06b6d4"];

  return (
    <div>
      {/* Question — toujours visible */}
      <div style={{ background: "linear-gradient(135deg,rgba(99,102,241,0.12),rgba(139,92,246,0.12))",
        borderRadius: 20, padding: "20px 16px", marginBottom: 16, textAlign: "center" }}>
        <div style={{ fontSize: 38, marginBottom: 10 }}>🗳️</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: COULEURS.encre, lineHeight: 1.6, fontStyle: "italic" }}>
          « {donnees.question} »
        </div>
      </div>

      {/* Phase 0 : bouton de dévoilement */}
      {phase === 0 && (
        <div style={{ textAlign: "center", paddingBottom: 8 }}>
          <button onClick={() => setPhase(1)}
            style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "#fff",
              border: "none", borderRadius: 18, padding: "15px 32px", fontSize: 16, fontWeight: 700,
              cursor: "pointer", boxShadow: "0 8px 24px rgba(99,102,241,0.45)",
              fontFamily: "'Plus Jakarta Sans', sans-serif", letterSpacing: 0.3 }}>
            🗳️ Dévoiler les résultats
          </button>
        </div>
      )}

      {/* Phase 1 : urne qui grossit */}
      {phase === 1 && (
        <div style={{ textAlign: "center", minHeight: 170, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", overflow: "hidden", padding: "10px 0" }}>
          <div style={{ fontSize: 64, display: "inline-block",
            transform: `scale(${urneScale}) rotate(${urneRot}deg)`,
            opacity: urneOpacity, transformOrigin: "center center",
            lineHeight: 1, willChange: "transform, opacity" }}>
            🗳️
          </div>
          <div style={{ marginTop: 28, fontSize: 13, fontWeight: 700, color: COULEURS.doux,
            letterSpacing: 2, textTransform: "uppercase", opacity: Math.min(1, urneOpacity * 4) }}>
            Dépouillement en cours…
          </div>
        </div>
      )}

      {/* Phase 2 : résultats */}
      {phase === 2 && (
        <div>
          {/* Barres par option */}
          {options.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
              {options.map((opt, i) => {
                const pct = barres[opt] ?? 0;
                const n   = Object.values(votes).filter(v => v === opt).length;
                const col = COULEURS_OPT[i % COULEURS_OPT.length];
                return (
                  <div key={opt}>
                    <div style={{ display: "flex", justifyContent: "space-between",
                      fontSize: 12, fontWeight: 700, color: col, marginBottom: 4 }}>
                      <span>{opt}</span>
                      <span>{n} vote{n > 1 ? "s" : ""} · {pct}%</span>
                    </div>
                    <div style={{ height: 14, background: col + "22", borderRadius: 7, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: col,
                        borderRadius: 7, transition: "width 1.2s cubic-bezier(0.4,0,0.2,1)" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Liste nominative */}
          <div style={{ marginBottom: 14 }}>
            {capsule.participants.map(p => {
              const v = votes[p.id];
              const optIdx = v ? options.indexOf(v) : -1;
              const col = optIdx >= 0 ? COULEURS_OPT[optIdx % COULEURS_OPT.length] : COULEURS.doux;
              return (
                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10,
                  marginBottom: 8, background: "#fff", borderRadius: 14,
                  padding: "10px 12px", boxShadow: "0 2px 8px rgba(46,34,48,0.06)" }}>
                  <Avatar membre={p} taille={30} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: COULEURS.encre }}>{p.prenom}</div>
                  </div>
                  <span style={{ fontWeight: 800, fontSize: 12, color: col,
                    background: col + "18", borderRadius: 20, padding: "4px 10px",
                    maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {v || "N'a pas voté"}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Vote tardif si la capsule est ouverte mais le participant n'a pas encore voté */}
          {moisParticipant && !monVote && (
            <div style={{ background: "#f5f0f8", borderRadius: 16, padding: "14px 14px",
              border: `1.5px solid ${COULEURS.bordure}`, marginTop: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: COULEURS.encre, marginBottom: 10 }}>
                Vous n'avez pas encore voté — votez maintenant
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {options.map((opt, i) => {
                  const col = COULEURS_OPT[i % COULEURS_OPT.length];
                  return (
                    <button key={opt} disabled={envoi}
                      onClick={() => voterMaintenant(opt)}
                      style={{ background: col, color: "#fff", border: "none", borderRadius: 12,
                        padding: "10px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer",
                        opacity: envoi ? 0.6 : 1, textAlign: "left",
                        fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                      {opt}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {total === 0 && <div style={{ textAlign: "center", color: COULEURS.doux, fontSize: 13, marginBottom: 14 }}>Aucun vote enregistré.</div>}
        </div>
      )}
    </div>
  );
}

// ============================================================================
//  ÉCRAN OUVERTURE : révélation un par un + page finale (album papier).
// ============================================================================
function EcranOuverture({ capsule, moi, allerVers, reagir, voterPari, voterSouvenir, voterFavori, premiereFois = false }) {
  const CLE_INDEX = `blooom_ouverture_${capsule?.id}`;
  const [index, setIndexRaw] = useState(() => {
    try {
      const s = localStorage.getItem(`blooom_ouverture_${capsule?.id}`);
      return s ? parseInt(s, 10) : 0;
    } catch { return 0; }
  });
  function setIndex(i) {
    setIndexRaw(i);
    try { localStorage.setItem(`blooom_ouverture_${capsule?.id}`, i); } catch {}
  }
  const [albumDemande, setAlbumDemande] = useState(false);
  const [albumVisualisé, setAlbumVisualisé] = useState(false);

  function ouvrirAlbum() {
    try {
      document.getElementById("blooom-album-overlay")?.remove();

      // Overlay plein écran
      const overlay = document.createElement("div");
      overlay.id = "blooom-album-overlay";
      overlay.style.position = "fixed";
      overlay.style.top = "0";
      overlay.style.left = "0";
      overlay.style.right = "0";
      overlay.style.bottom = "0";
      overlay.style.zIndex = "9999";
      overlay.style.display = "flex";
      overlay.style.flexDirection = "column";
      overlay.style.background = "#f8f5f9";

      // Barre du haut
      const topBar = document.createElement("div");
      topBar.style.background = "#1c1014";
      topBar.style.padding = "12px 18px";
      topBar.style.display = "flex";
      topBar.style.alignItems = "center";
      topBar.style.justifyContent = "space-between";
      topBar.style.flexShrink = "0";
      topBar.style.gap = "10px";

      const titre = document.createElement("span");
      titre.textContent = "📖 " + (capsule.nom || "");
      titre.style.color = "#fff";
      titre.style.fontWeight = "700";
      titre.style.fontSize = "14px";
      titre.style.overflow = "hidden";
      titre.style.textOverflow = "ellipsis";
      titre.style.whiteSpace = "nowrap";
      titre.style.flex = "1";

      const btnPdf = document.createElement("button");
      btnPdf.textContent = "📄 Sauvegarder en PDF";
      btnPdf.style.cssText = "background:linear-gradient(120deg,#FF8A3D,#FF5C9D);color:#fff;border:none;border-radius:10px;padding:8px 16px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;flex-shrink:0";
      btnPdf.onclick = () => iframe.contentWindow?.print();

      const btnFermer = document.createElement("button");
      btnFermer.textContent = "✕";
      btnFermer.style.cssText = "background:rgba(255,255,255,0.15);color:#fff;border:none;border-radius:10px;padding:8px 14px;font-size:16px;cursor:pointer;flex-shrink:0";
      btnFermer.onclick = () => overlay.remove();

      topBar.appendChild(titre);
      topBar.appendChild(btnPdf);
      topBar.appendChild(btnFermer);

      // iframe album
      const iframe = document.createElement("iframe");
      iframe.style.flex = "1";
      iframe.style.border = "none";
      iframe.title = "Album Blooom";

      overlay.appendChild(topBar);
      overlay.appendChild(iframe);
      document.body.appendChild(overlay); // Affiche l'overlay immédiatement

      // Génère le HTML dans un microtask pour ne pas bloquer l'affichage
      Promise.resolve().then(() => {
        try {
          iframe.srcdoc = genererAlbumHTML(capsule, { embarque: true });
        } catch (err) {
          iframe.srcdoc = `<html><body style="font-family:sans-serif;padding:30px;color:#c0392b"><h2>Erreur de génération</h2><pre style="white-space:pre-wrap">${String(err)}</pre></body></html>`;
          console.error("genererAlbumHTML:", err);
        }
      });

      setAlbumVisualisé(true);
    } catch (err) {
      console.error("ouvrirAlbum:", err);
      alert("Erreur : " + err.message);
    }
  }
  const [secretsRevelés, setSecretsRevelés] = useState(new Set());
  const [flotteurs, setFlotteurs] = useState([]);
  const [animPhase, setAnimPhase] = useState(null);
  const animTimersRef = React.useRef([]);
  const indexPrecedentRef = React.useRef(null);
  const canalRef = React.useRef(null);

  // Realtime broadcast channel — réactions flottantes visibles par tous
  useEffect(() => {
    if (!capsule?.id) return;
    const canal = supabase.channel(`capsule-reactions-${capsule.id}`, {
      config: { broadcast: { self: true } },
    });
    canal.on('broadcast', { event: 'reaction' }, ({ payload }) => {
      setFlotteurs(prev => [...prev, { id: Date.now() + Math.random(), emoji: payload.emoji }]);
    }).subscribe();
    canalRef.current = canal;
    return () => { supabase.removeChannel(canal); canalRef.current = null; };
  }, [capsule?.id]);

  function reagirAvecAnimation(capsuleId, contribId, reactionId) {
    const reaction = REACTIONS.find(r => r.id === reactionId);
    if (reaction && canalRef.current) {
      canalRef.current.send({ type: 'broadcast', event: 'reaction', payload: { emoji: reaction.icone } });
    }
    reagir(capsuleId, contribId, reactionId);
  }

  function supprimerFlotteur(id) {
    setFlotteurs(prev => prev.filter(f => f.id !== id));
  }

  function passerAnim() {
    animTimersRef.current.forEach(clearTimeout);
    animTimersRef.current = [];
    setAnimPhase(null);
  }

  useEffect(() => {
    if (indexPrecedentRef.current === null) {
      indexPrecedentRef.current = index;
      return;
    }
    if (index <= indexPrecedentRef.current) {
      indexPrecedentRef.current = index;
      return;
    }
    indexPrecedentRef.current = index;
    setAnimPhase("suspense");
    const t1 = setTimeout(() => setAnimPhase("revelation"), 1500);
    const t2 = setTimeout(() => setAnimPhase("celebration"), 2800);
    const t3 = setTimeout(() => setAnimPhase(null), 5000);
    animTimersRef.current.forEach(clearTimeout);
    animTimersRef.current = [t1, t2, t3];
    return () => animTimersRef.current.forEach(clearTimeout);
  }, [index]);

  // Textes de réponse en cours de saisie pour les questions ouvertes (contribId → texte)

  if (!capsule || capsule.contributions.length === 0) {
    return (
      <div style={S.ecran}>
        <EnTeteRetour titre={capsule?.nom || ""} onRetour={() => allerVers("detail", capsule.id)} />
        <p style={S.videTexte}>Cette capsule ne contient aucun souvenir.</p>
      </div>
    );
  }
  const souvenirs = [...capsule.contributions].sort((a, b) => new Date(a.date) - new Date(b.date));
  // Borne l'index au cas où il aurait été sauvegardé hors-limites.
  const indexSur = Math.min(index, souvenirs.length);
  if (indexSur !== index) { setIndex(indexSur); }
  const estPageFinale = indexSur === souvenirs.length;

  const moisParticipant = capsule.participants.find(p => p.userId === moi?.id);

  if (estPageFinale) {
    return (
      <div style={S.ecran}>
        <EnTeteRetour titre={capsule.nom} onRetour={() => allerVers("detail", capsule.id)} />
        <div style={{ textAlign: "center", paddingTop: 10, paddingBottom: 24 }}>
          <div style={{ fontSize: 52 }}>🎊</div>
          <h2 style={S.finTitre}>Vous avez tout découvert</h2>
          <p style={S.finTexte}>{souvenirs.length} souvenir{souvenirs.length > 1 ? "s" : ""} partagé{souvenirs.length > 1 ? "s" : ""} ensemble.</p>
          {/* Étape 1 : visualiser l'album en PDF — réservé Plus */}
          {estPlus(moi) ? (
            <button style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
              background: "#fff", border: "2px solid #f0ecf1", borderRadius: 18, padding: "16px 24px",
              width: "100%", cursor: "pointer", marginTop: 8, marginBottom: 4,
              boxShadow: "0 4px 16px rgba(46,34,48,0.07)", transition: "box-shadow 0.2s" }}
              onClick={ouvrirAlbum}>
              <span style={{ fontSize: 24 }}>📖</span>
              <div style={{ textAlign: "left" }}>
                <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 800, fontSize: 15, color: "#2E2230" }}>Visualiser l'album</div>
                <div style={{ fontSize: 12, color: "#9B8AA0", marginTop: 2 }}>Voir tous vos souvenirs mis en page</div>
              </div>
              <span style={{ marginLeft: "auto", fontSize: 18, color: "#9B8AA0" }}>→</span>
            </button>
          ) : (
            <button style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
              background: "linear-gradient(135deg,#FF8A3D12,#FF5C9D12)", border: "2px solid #FF5C9D40",
              borderRadius: 18, padding: "16px 24px", width: "100%", cursor: "pointer", marginTop: 8, marginBottom: 4 }}
              onClick={() => allerVers("abonnement")}>
              <span style={{ fontSize: 24 }}>📖</span>
              <div style={{ textAlign: "left", flex: 1 }}>
                <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 800, fontSize: 15,
                  background: DEGRADE, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                  Visualiser l'album
                </div>
                <div style={{ fontSize: 12, color: "#FF5C9D", marginTop: 2, fontWeight: 600 }}>✨ Réservé aux abonnés Plus</div>
              </div>
              <span style={{ marginLeft: "auto", fontSize: 18, color: "#FF5C9D" }}>→</span>
            </button>
          )}

          {/* Étape 2 : commander l'album — affiché après visualisation */}
          {albumVisualisé && (
            !albumDemande ? (
              <button style={S.carteAlbum} onClick={() => setAlbumDemande(true)}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, opacity: 0.8, marginBottom: 8 }}>ÉDITION LIMITÉE</div>
                <div style={S.albumTitre}>🖨️ Transformez vos souvenirs en album papier</div>
                <div style={S.albumSous}>Chaque photo, message et moment de cette capsule imprimé dans un vrai livre relié — livré chez vous.</div>
                <div style={{ marginTop: 16, background: "rgba(255,255,255,0.25)", borderRadius: 12, padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontWeight: 700, fontSize: 15 }}>Commander mon album</span>
                  <span style={{ fontSize: 20 }}>→</span>
                </div>
              </button>
            ) : (
              <div style={S.albumConfirme}>✓ Parfait ! La commande d'album sera disponible dans la version finale.</div>
            )
          )}
          {voterFavori && moisParticipant && (
            <SectionVoteFavori capsule={capsule} moisParticipantId={moisParticipant.id} voterFavori={voterFavori} />
          )}
          <button style={{ ...S.boutonSecondaire, marginTop: 16 }} onClick={() => setIndex(0)}>↺ Revoir depuis le début</button>
        </div>
      </div>
    );
  }

  const courant = souvenirs[indexSur];
  const auteur  = capsule.participants.find((p) => p.id === courant.auteurId);
  const cssFiltre = FILTRES.find((f) => f.id === courant.filtre)?.css || "none";
  const ambiance  = AMBIANCES.find((a) => a.id === courant.ambiance);
  const typeInfo  = TYPES_CONTRIBUTION.find((t) => t.id === courant.type);

  // Données JSON stockées dans le champ question pour certains types structurés
  let donnees = null;
  try { if (["une_du_jour","meteo","chanson"].includes(courant.type)) donnees = JSON.parse(courant.question); } catch {}

  const monReaction = moisParticipant ? courant.reactionsDétail?.[moisParticipant.id] : null;
  const monReactionObj = monReaction ? REACTIONS.find(r => r.id === monReaction) : null;

  const afficherReactions = !["pari", "vote"].includes(courant.type);

  return (
    <>
    <div style={S.ecran}>
      <EnTeteRetour titre={capsule.nom} onRetour={() => allerVers("detail", capsule.id)} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={S.progression}>{indexSur + 1} / {souvenirs.length}</div>
        {!premiereFois && indexSur < souvenirs.length - 1 && (
          <button onClick={() => setIndex(souvenirs.length - 1)}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, color: COULEURS.doux, padding: "4px 0", letterSpacing: 0.3 }}>
            Dernier souvenir →
          </button>
        )}
      </div>
      {typeInfo && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, margin: "10px 0 4px", padding: "8px 20px", borderRadius: 24, background: "linear-gradient(135deg,#FF8A3D22,#C65CE822)", border: "1px solid #C65CE840", alignSelf: "center" }}>
          <span style={{ fontSize: 22 }}>{typeInfo.icone}</span>
          <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: 0.5, background: "linear-gradient(90deg,#FF8A3D,#C65CE8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>{typeInfo.nom}</span>
        </div>
      )}
      <div style={{ ...S.carteSouvenir, position: "relative" }}>
        {/* Badge emoji choisi par l'utilisateur — en haut à droite de la carte */}
        {monReactionObj && (
          <div style={{ position: "absolute", top: -14, right: -14, width: 38, height: 38, borderRadius: "50%", background: "#fff", boxShadow: "0 2px 12px rgba(46,34,48,0.18)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, zIndex: 10 }}>
            {monReactionObj.icone}
          </div>
        )}
        <div style={S.souvenirEntete}>
          <Avatar membre={auteur} taille={36} />
          <div><div style={{ fontWeight: 700 }}>{auteur?.prenom || "Inconnu"}</div><div style={S.souvenirDate}>{formaterDateHeure(courant.date)}</div></div>
        </div>

        {/* Médias classiques */}
        {courant.type === "photo"  && courant.media && <img src={courant.media} alt="souvenir" style={{ ...S.souvenirMedia, filter: cssFiltre }} />}
        {courant.type === "video"  && courant.media && <video src={courant.media} controls style={{ ...S.souvenirMedia, filter: cssFiltre }} />}
        {courant.type === "vocal" && courant.media && (
          <LecteurVocalOuverture url={courant.media} />
        )}

        {/* Dessin — affiché comme une image */}
        {courant.type === "dessin" && courant.media && (
          <img src={courant.media} alt="dessin" style={{ ...S.souvenirMedia, imageRendering: "pixelated" }} />
        )}

        {/* Document PDF — carte avec bouton d'ouverture dans un nouvel onglet */}
        {courant.type === "document" && courant.media && (
          <div style={{ background: "var(--carte-bg)", borderRadius: 18, padding: 20,
            display: "flex", alignItems: "center", gap: 16,
            boxShadow: "0 4px 14px rgba(46,34,48,0.07)", marginBottom: 4 }}>
            {/* Icône PDF stylisée */}
            <div style={{ width: 52, height: 60, borderRadius: 10, background: DEGRADE,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 26, flexShrink: 0, boxShadow: "0 4px 12px rgba(255,92,157,0.4)" }}>
              📄
            </div>
            <div style={{ flex: 1, overflow: "hidden" }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: COULEURS.encre, marginBottom: 4,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {courant.texte || "Document PDF"}
              </div>
              <div style={{ fontSize: 12, color: COULEURS.doux }}>Document partagé dans cette capsule</div>
            </div>
            {/* Bouton d'ouverture — ouvre le PDF dans un nouvel onglet */}
            <a href={courant.media} target="_blank" rel="noopener noreferrer"
              style={{ background: DEGRADE, color: "#fff", borderRadius: 12, padding: "10px 16px",
                fontSize: 13, fontWeight: 700, textDecoration: "none", flexShrink: 0,
                boxShadow: "0 4px 12px rgba(255,92,157,0.35)" }}>
              Ouvrir →
            </a>
          </div>
        )}

        {/* Texte standard (message + question guidée) avec ambiance */}
        {courant.texte && courant.type === "message" && ambiance
          ? <div style={{ ...S.souvenirMessageAmbiance, background: ambiance.fond, color: ambiance.texte }}>{courant.texte}</div>
          : courant.texte && !["secret","pari","vote"].includes(courant.type) && <div style={S.souvenirTexte}>{courant.texte}</div>
        }

        {/* Secret — masqué par défaut, révélé au clic individuel */}
        {courant.type === "secret" && (
          secretsRevelés.has(courant.id)
            ? <div style={S.souvenirTexte}>{courant.texte}</div>
            : <div style={{ textAlign: "center", padding: "20px 0" }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>🤫</div>
                <button style={S.boutonPrincipal}
                  onClick={() => setSecretsRevelés(prev => new Set([...prev, courant.id]))}>
                  Révéler le secret
                </button>
              </div>
        )}

        {/* Pari — animation de verdict avec suspense puis résultats nominatifs */}
        {courant.type === "pari" && (
          <AnimPari key={courant.id} contrib={courant} capsule={capsule}
            moisParticipant={moisParticipant} voterPari={voterPari} />
        )}

        {/* Vote — révélation des résultats avec animation urne */}
        {courant.type === "vote" && (
          <AnimVote key={courant.id} contrib={courant} capsule={capsule}
            moisParticipant={moisParticipant} voterSouvenir={voterSouvenir} />
        )}

        {/* Une du jour — titre récupéré au moment du dépôt */}
        {courant.type === "une_du_jour" && donnees && (
          <div style={{ background: "#fff", borderRadius: 16, padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: COULEURS.doux, letterSpacing: 1, marginBottom: 6 }}>{donnees.source?.toUpperCase()} · {donnees.date}</div>
            <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 17, fontWeight: 700, lineHeight: 1.4, color: COULEURS.encre }}>{donnees.titre}</div>
            {donnees.url && <a href={donnees.url} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 10, fontSize: 13, color: COULEURS.corail, fontWeight: 700 }}>Lire l'article →</a>}
          </div>
        )}

        {/* Météo du jour — données enregistrées au moment du dépôt */}
        {courant.type === "meteo" && donnees && (
          <div style={{ background: fondMeteo(donnees.cle), borderRadius: 20, padding: "24px 16px", boxShadow: "0 6px 24px rgba(46,34,48,0.15)", textAlign: "center" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 4 }}>
              <IllustrationMeteo cle={donnees.cle || "soleil"} taille={120} />
            </div>
            <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 48, fontWeight: 800, color: texteMeteo(donnees.cle), lineHeight: 1 }}>{donnees.temp}°C</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: texteMeteo(donnees.cle), marginTop: 6, opacity: 0.9 }}>{donnees.condition}</div>
            <div style={{ fontSize: 13, color: texteMeteo(donnees.cle), marginTop: 4, opacity: 0.7 }}>{donnees.lieu} · {donnees.date}</div>
            {donnees.commentaire && (
              <div style={{ marginTop: 14, background: "rgba(255,255,255,0.25)", borderRadius: 12, padding: "10px 14px", fontSize: 14, color: texteMeteo(donnees.cle), fontStyle: "italic", textAlign: "left" }}>
                "{donnees.commentaire}"
              </div>
            )}
          </div>
        )}

        {/* Chanson du moment — pochette + titre + artiste + paroles accordéon */}
        {courant.type === "chanson" && donnees && (
          <ChansonOuverture donnees={donnees} />
        )}

        {/* Réactions emoji — masquées pour pari qui a ses propres boutons de vote */}
        {afficherReactions && (
          <ReactionsBar contrib={courant} capsuleId={capsule.id} reagir={reagirAvecAnimation} monParticipantId={moisParticipant?.id} />
        )}
      </div>
      {/* Emojis flottants Realtime — superposés au-dessus de la carte */}
      {flotteurs.map(f => (
        <ReactionFlottante key={f.id} emoji={f.emoji} id={f.id} onDone={() => supprimerFlotteur(f.id)} />
      ))}
      <div style={S.navOuverture}>
        <button style={{ ...S.boutonNav, ...(indexSur === 0 ? S.boutonDesactive : {}) }} disabled={indexSur === 0} onClick={() => setIndex(indexSur - 1)}>← Précédent</button>
        <button style={S.boutonNav} onClick={() => {
          if (indexSur === souvenirs.length - 1) allerVers("detail", capsule.id);
          else setIndex(indexSur + 1);
        }}>{indexSur === souvenirs.length - 1 ? "Terminer →" : "Suivant →"}</button>
      </div>
    </div>
    {animPhase && courant && (
      <AnimRevealSouvenir type={courant.type} phase={animPhase} onSkip={passerAnim} />
    )}
    </>
  );
}

// ============================================================================
// ============================================================================
//  ANIMATION OUVERTURE MARIAGE — dorée, drôle, mémorable
// ============================================================================
function AnimationOuvertureMariage({ capsule, allerVers }) {
  const [phase, setPhase]       = React.useState(1);
  const [fondu, setFondu]       = React.useState(1);
  const [drumRoll, setDrumRoll] = React.useState(0);
  const [showWarn, setShowWarn] = React.useState(false);
  const [showRings, setShowRings] = React.useState(false);
  const [showBtn, setShowBtn]   = React.useState(false);
  const nbInvites = capsule?.participants?.length || 0;

  function passer() { allerVers("ouverture", capsule?.id); }
  function changerPhase(n, apres) {
    setTimeout(() => {
      setFondu(0);
      setTimeout(() => { setPhase(n); setFondu(1); }, 350);
    }, apres);
  }

  React.useEffect(() => {
    const t = [];
    for (let i = 1; i <= 4; i++) t.push(setTimeout(() => setDrumRoll(i), 3300 + i * 450));
    t.push(setTimeout(() => setShowWarn(true), 5200));
    changerPhase(2, 3000);
    changerPhase(3, 7200);
    t.push(setTimeout(() => setShowRings(true), 7700));
    changerPhase(4, 11200);
    t.push(setTimeout(() => setShowBtn(true), 12800));
    return () => t.forEach(clearTimeout);
  }, []);

  const RINGS = [
    {left:"4%", delay:0,   size:22, dur:2.8},
    {left:"15%",delay:.4,  size:15, dur:3.2},
    {left:"27%",delay:.2,  size:20, dur:2.6},
    {left:"39%",delay:.6,  size:17, dur:3.0},
    {left:"51%",delay:.1,  size:24, dur:2.9},
    {left:"63%",delay:.5,  size:14, dur:3.3},
    {left:"75%",delay:.3,  size:19, dur:2.7},
    {left:"87%",delay:.7,  size:21, dur:3.1},
  ];

  const SPARKS = [
    {e:"✨",t:"7%", l:"5%", s:22,d:0  },{e:"💫",t:"10%",l:"83%",s:18,d:.3},
    {e:"⭐",t:"28%",l:"3%", s:14,d:.6 },{e:"💍",t:"24%",l:"89%",s:16,d:.2},
    {e:"✨",t:"54%",l:"4%", s:20,d:.5 },{e:"🌟",t:"60%",l:"85%",s:17,d:.1},
    {e:"💛",t:"79%",l:"7%", s:15,d:.4 },{e:"✨",t:"74%",l:"87%",s:19,d:.7},
  ];

  const bgs = [
    "#0D0A0B",
    "#0D0A0B",
    "linear-gradient(160deg,#3D0C11 0%,#831843 40%,#BE185D 70%,#C9A84C 100%)",
    "linear-gradient(160deg,#C9A84C 0%,#F5D78E 35%,#C9A84C 65%,#831843 100%)",
  ];

  return (
    <div style={{ position:"absolute",inset:0,background:bgs[phase-1]||"#0D0A0B",zIndex:100,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"32px 24px",overflow:"hidden",opacity:fondu,transition:"opacity 0.35s ease, background 0.7s ease" }}>
      <style>{`
        @keyframes maoBeat{0%,100%{transform:scale(1)}40%{transform:scale(1.22)}70%{transform:scale(.9)}}
        @keyframes maoGlow{0%,100%{text-shadow:0 0 20px #C9A84C,0 0 40px rgba(201,168,76,.5)}50%{text-shadow:0 0 55px #F5D78E,0 0 95px rgba(201,168,76,.9),0 0 140px rgba(201,168,76,.3)}}
        @keyframes maoRing{0%{transform:translateY(-60px) rotate(-20deg);opacity:0}15%{opacity:.9}100%{transform:translateY(110vh) rotate(540deg);opacity:.2}}
        @keyframes maoPop{0%{transform:scale(0) rotate(-10deg);opacity:0}65%{transform:scale(1.14) rotate(5deg)}100%{transform:scale(1) rotate(0);opacity:1}}
        @keyframes maoShake{0%,100%{transform:rotate(0)translateX(0)}20%{transform:rotate(-7deg)translateX(-4px)}40%{transform:rotate(7deg)translateX(4px)}60%{transform:rotate(-4deg)translateX(-2px)}80%{transform:rotate(4deg)translateX(2px)}}
        @keyframes maoFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-14px)}}
        @keyframes maoSpark{0%,100%{opacity:.2;transform:scale(.5) rotate(0deg)}50%{opacity:1;transform:scale(1.35) rotate(180deg)}}
        @keyframes maoCrash{0%{transform:translateY(-80px) scale(1.2);opacity:0}70%{transform:translateY(5px) scale(1.02)}100%{transform:translateY(0) scale(1);opacity:1}}
      `}</style>

      <button onClick={passer} style={{ position:"absolute",top:18,right:18,background:"rgba(255,255,255,.1)",border:"none",color:"rgba(255,255,255,.6)",fontSize:11,fontWeight:600,padding:"6px 13px",borderRadius:20,cursor:"pointer",zIndex:10,letterSpacing:".04em" }}>Passer →</button>

      {phase === 1 && (
        <div style={{ textAlign:"center",display:"flex",flexDirection:"column",alignItems:"center",gap:28 }}>
          <div style={{ fontSize:90,lineHeight:1,animation:"maoBeat 1.1s ease-in-out infinite, maoGlow 2s ease-in-out infinite" }}>💍</div>
          <p style={{ color:"rgba(201,168,76,.9)",fontSize:18,fontWeight:600,letterSpacing:".10em",textTransform:"uppercase",margin:0,animation:"fadeSlideUp .8s ease both",fontFamily:"'Plus Jakarta Sans',sans-serif" }}>Le moment est arrivé</p>
          <p style={{ color:"rgba(255,255,255,.4)",fontSize:13,margin:0,fontFamily:"'Plus Jakarta Sans',sans-serif" }}>Vos invités vous ont préparé quelque chose…</p>
        </div>
      )}

      {phase === 2 && (
        <div style={{ textAlign:"center",display:"flex",flexDirection:"column",alignItems:"center",gap:20 }}>
          <div style={{ fontSize:60,animation:"maoShake .18s ease-in-out infinite" }}>🥁</div>
          <div style={{ color:"#fff",fontSize:20,fontWeight:700,fontFamily:"'Bricolage Grotesque',sans-serif" }}>
            Roulement de tambour{"·".repeat(drumRoll)}
          </div>
          {showWarn && (
            <div style={{ background:"linear-gradient(135deg,rgba(201,168,76,.12),rgba(61,12,17,.3))",border:"2px solid #C9A84C",borderRadius:18,padding:"16px 20px",maxWidth:290,animation:"maoCrash .5s cubic-bezier(.34,1.56,.64,1) both" }}>
              <div style={{ fontSize:13,fontWeight:800,color:"#C9A84C",letterSpacing:".12em",marginBottom:8 }}>⚠️ AVERTISSEMENT ⚠️</div>
              <div style={{ color:"#fff",fontSize:15,fontWeight:700,lineHeight:1.55,marginBottom:8 }}>
                Vos invités se sont <em style={{ color:"#F5D78E" }}>vraiment</em> lâchés 🫣
              </div>
              <div style={{ color:"rgba(255,255,255,.5)",fontSize:11,lineHeight:1.5 }}>
                Préparez-vous à rire, pleurer, et tout ça<br/>en même temps. Vous êtes prévenus. 😅
              </div>
            </div>
          )}
        </div>
      )}

      {phase === 3 && (
        <>
          {showRings && RINGS.map((r, i) => (
            <div key={i} style={{ position:"absolute",top:"-30px",left:r.left,fontSize:r.size,animation:`maoRing ${r.dur}s ${r.delay}s linear infinite`,pointerEvents:"none",zIndex:1 }}>💍</div>
          ))}
          <div style={{ textAlign:"center",display:"flex",flexDirection:"column",alignItems:"center",gap:20,position:"relative",zIndex:2 }}>
            <div style={{ fontSize:70,animation:"maoFloat 2.4s ease-in-out infinite" }}>💒</div>
            <h2 style={{ fontFamily:"'Bricolage Grotesque',sans-serif",color:"#fff",fontSize:26,fontWeight:800,margin:0,textShadow:"0 2px 16px rgba(0,0,0,.4)",animation:"fadeSlideUp .5s ease both",letterSpacing:"-.02em" }}>{capsule?.nom || "Capsule Mariage"}</h2>
            <p style={{ color:"rgba(255,255,255,.85)",fontSize:15,margin:0,lineHeight:1.6,animation:"fadeSlideUp .5s .15s ease both",fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
              <strong>{nbInvites}</strong> invité{nbInvites > 1 ? "s ont" : " a"} déposé leurs<br/>plus beaux souvenirs pour vous 💛
            </p>
          </div>
        </>
      )}

      {phase === 4 && (
        <>
          {SPARKS.map((sp, i) => (
            <div key={i} style={{ position:"absolute",top:sp.t,left:sp.l,fontSize:sp.s,animation:`maoSpark 1.8s ${sp.d}s ease-in-out infinite`,pointerEvents:"none",zIndex:1 }}>{sp.e}</div>
          ))}
          <div style={{ textAlign:"center",display:"flex",flexDirection:"column",alignItems:"center",gap:22,position:"relative",zIndex:2 }}>
            <div style={{ display:"flex",gap:10,fontSize:56,animation:"maoPop .7s cubic-bezier(.34,1.56,.64,1) both" }}>🥂🥂</div>
            <p style={{ fontFamily:"'Plus Jakarta Sans',sans-serif",color:"#3D0C11",fontSize:11,fontWeight:800,letterSpacing:".18em",textTransform:"uppercase",margin:0,animation:"fadeSlideUp .5s .1s ease both",opacity:.8 }}>Bienvenue dans votre capsule</p>
            <h1 style={{ fontFamily:"'Bricolage Grotesque',sans-serif",color:"#3D0C11",fontSize:36,fontWeight:900,margin:0,letterSpacing:"-.03em",textShadow:"0 2px 12px rgba(255,255,255,.4)",animation:"fadeSlideUp .5s .2s ease both" }}>C'est parti ! 💍</h1>
            {showBtn && (
              <button onClick={passer} style={{ background:"#3D0C11",color:"#F5D78E",border:"2px solid #C9A84C",fontSize:16,fontWeight:700,padding:"15px 32px",borderRadius:24,cursor:"pointer",boxShadow:"0 8px 32px rgba(61,12,17,.45)",animation:"maoPop .5s cubic-bezier(.34,1.56,.64,1) both",fontFamily:"'Plus Jakarta Sans',sans-serif",letterSpacing:".01em" }}>
                Découvrir les souvenirs 💍
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

//  ANIMATION D'OUVERTURE SPECTACULAIRE — 4 phases, première ouverture seulement
// ============================================================================
function AnimationOuverture({ capsule, allerVers }) {
  const [phase, setPhase] = React.useState(1);
  const [fondu, setFondu] = React.useState(1);
  const [lettresVisibles, setLettresVisibles] = React.useState(0);
  const [avatarsVisibles, setAvatarsVisibles] = React.useState(0);
  const [showBtn, setShowBtn] = React.useState(false);

  const texteP1 = "Ce moment a attendu pour vous...";
  const typeInfo = TYPES_CAPSULES.find(t => t.id === capsule?.type) || { icone: "✨", nom: "" };
  const nbParticipants = capsule?.participants?.length || 0;

  function passer() {
    allerVers("ouverture", capsule?.id);
  }

  function changerPhase(nouvellePhase, apres = 0) {
    setTimeout(() => {
      setFondu(0);
      setTimeout(() => { setPhase(nouvellePhase); setFondu(1); }, 350);
    }, apres);
  }

  React.useEffect(() => {
    const timers = [];
    // Phase 1 : lettres une par une (50ms chacune, départ 400ms)
    for (let i = 1; i <= texteP1.length; i++) {
      timers.push(setTimeout(() => setLettresVisibles(i), 400 + i * 55));
    }
    // Phase 2 après 3 200ms
    changerPhase(2, 3200);
    // Phase 3 après 6 400ms, puis avatars
    timers.push(setTimeout(() => {
      setFondu(0);
      setTimeout(() => {
        setPhase(3); setFondu(1); setAvatarsVisibles(0);
        for (let i = 1; i <= nbParticipants; i++) {
          timers.push(setTimeout(() => setAvatarsVisibles(i), i * 380));
        }
      }, 350);
    }, 6400));
    // Phase 4 après 10 000ms
    timers.push(setTimeout(() => {
      setFondu(0);
      setTimeout(() => { setPhase(4); setFondu(1); }, 350);
    }, 10000));
    // Bouton "Découvrir" après 12 000ms
    timers.push(setTimeout(() => setShowBtn(true), 12000));

    return () => timers.forEach(clearTimeout);
  }, []);

  const estPhase4 = phase === 4;
  const bg = estPhase4
    ? "linear-gradient(135deg,#FF8A3D 0%,#FF5C9D 55%,#C65CE8 100%)"
    : "#1c1014";

  return (
    <div style={{
      position: "absolute", inset: 0, background: bg, zIndex: 100,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "32px 28px", overflow: "hidden",
      opacity: fondu, transition: "opacity 0.35s ease, background 0.6s ease",
    }}>
      {/* Bouton passer */}
      <button onClick={passer} style={{
        position: "absolute", top: 18, right: 18, background: "rgba(255,255,255,0.18)",
        border: "none", color: "#fff", fontSize: 12, fontWeight: 600,
        padding: "6px 13px", borderRadius: 20, cursor: "pointer", letterSpacing: "0.04em",
        zIndex: 10,
      }}>Passer →</button>

      {phase === 1 && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 36 }}>
          <div style={{ animation: "pulseLogo 2s ease-in-out infinite" }}>
            <LogoBlooom taille={96} />
          </div>
          <p style={{
            color: "#fff", fontSize: 18, fontWeight: 500, textAlign: "center",
            letterSpacing: "0.01em", lineHeight: 1.6, margin: 0,
            fontFamily: "'Plus Jakarta Sans', sans-serif", minHeight: 60,
          }}>
            {texteP1.slice(0, lettresVisibles)}
            {lettresVisibles < texteP1.length && (
              <span style={{ animation: "clignote 0.65s step-start infinite", marginLeft: 1 }}>|</span>
            )}
          </p>
        </div>
      )}

      {phase === 2 && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 22, textAlign: "center" }}>
          <div style={{ fontSize: 80, lineHeight: 1, animation: "logoExplosion 0.65s cubic-bezier(0.34,1.56,0.64,1) both" }}>
            {typeInfo.icone}
          </div>
          <h2 style={{
            fontFamily: "'Bricolage Grotesque', sans-serif",
            fontSize: 30, fontWeight: 800, color: "#fff", margin: 0,
            letterSpacing: "-0.02em",
            animation: "fadeSlideUp 0.5s 0.2s ease both",
          }}>
            {capsule?.nom || "Votre capsule"}
          </h2>
          <p style={{
            color: "rgba(255,255,255,0.65)", fontSize: 15, margin: 0, lineHeight: 1.7,
            animation: "fadeSlideUp 0.5s 0.4s ease both",
          }}>
            Créée le {capsule?.dateCreation
              ? new Date(capsule.dateCreation).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
              : "…"}.<br/>
            Scellée avec amour.
          </p>
        </div>
      )}

      {phase === 3 && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 32, textAlign: "center" }}>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center", maxWidth: 300 }}>
            {(capsule?.participants || []).map((p, i) => (
              <div key={p.id} style={{
                width: 60, height: 60, borderRadius: "50%",
                background: p.couleur || "#FF8A3D",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 22, fontWeight: 700, color: "#fff",
                boxShadow: "0 4px 18px rgba(0,0,0,0.35)",
                opacity: i < avatarsVisibles ? 1 : 0,
                transform: i < avatarsVisibles ? "scale(1)" : "scale(0.2)",
                transition: "opacity 0.4s ease, transform 0.4s cubic-bezier(0.34,1.56,0.64,1)",
                flexShrink: 0,
              }}>
                {p.photo
                  ? <img src={p.photo} alt={p.prenom} style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} />
                  : (p.prenom || "?")[0].toUpperCase()
                }
              </div>
            ))}
          </div>
          <p style={{
            color: "#fff", fontSize: 18, fontWeight: 600, margin: 0, lineHeight: 1.6,
            opacity: avatarsVisibles > 0 ? 1 : 0, transition: "opacity 0.5s 0.3s ease",
          }}>
            {nbParticipants} personne{nbParticipants > 1 ? "s ont" : " a"} déposé<br/>
            quelque chose pour vous
          </p>
        </div>
      )}

      {phase === 4 && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 30, textAlign: "center" }}>
          <div style={{ animation: "logoExplosion 0.8s cubic-bezier(0.34,1.56,0.64,1) both" }}>
            <LogoBlooom taille={80} />
          </div>
          <div style={{ animation: "fadeSlideUp 0.5s 0.3s ease both" }}>
            <p style={{
              color: "rgba(255,255,255,0.85)", fontSize: 18, fontWeight: 600, margin: "0 0 10px",
              letterSpacing: "0.06em", textTransform: "uppercase",
              fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}>
              Scelle. Attends. Souris.
            </p>
            <p style={{
              fontFamily: "'Bricolage Grotesque', sans-serif",
              color: "#fff", fontSize: 32, fontWeight: 800, margin: 0,
              letterSpacing: "-0.02em",
            }}>
              C'est le moment.
            </p>
          </div>
          {showBtn && (
            <button onClick={passer} style={{
              background: "#fff", color: "#C65CE8", border: "none",
              fontSize: 17, fontWeight: 700, padding: "16px 36px",
              borderRadius: 24, cursor: "pointer", letterSpacing: "0.01em",
              boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
              animation: "zoomDoux 0.5s cubic-bezier(0.34,1.56,0.64,1) both",
              fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}>
              Découvrir les souvenirs →
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
//  6. ÉCRAN DE CONNEXION — inscription + connexion par email + mot de passe
// ============================================================================
// ============================================================================
//  PAYWALL MODAL — overlay affiché quand une limite de plan est atteinte.
//  Apparaît en position absolute dans le cadre téléphone.
// ============================================================================
// ============================================================================
//  MODALE PAYWALL — feuille iOS depuis le bas. Utilise getPaywallContent.
//  Appelée avec type={paywallType} où paywallType est une clé de getPaywallContent.
// ============================================================================
function ModalPaywall({ type, moi, allerVers, onFermer }) {
  const raison  = typeof type === "string" ? type : (type?.raison ?? "capsule_limite_gratuit");
  const options = typeof type === "object" ? type : {};
  const contenu = getPaywallContent(raison, options);

  return (
    <div style={{
      position: "absolute", inset: 0, zIndex: 400,
      background: "rgba(46,34,48,0.85)", backdropFilter: "blur(6px)",
      display: "flex", alignItems: "flex-end",
      animation: "fadeSlideUp 0.3s ease both",
    }} onClick={onFermer}>
      <div style={{
        background: "var(--carte-bg)", borderRadius: "28px 28px 20px 20px",
        padding: "28px 22px 24px", width: "100%",
        boxShadow: "0 -10px 40px rgba(46,34,48,0.25)",
      }} onClick={e => e.stopPropagation()}>

        {/* Titre + texte */}
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 800, fontSize: 19, color: COULEURS.encre, lineHeight: 1.25 }}>
            {contenu.titre}
          </div>
          <p style={{ fontSize: 13, color: COULEURS.doux, marginTop: 10, lineHeight: 1.6, margin: "10px 0 0" }}>
            {contenu.texte}
          </p>
        </div>

        {/* CTA principal */}
        {contenu.cta && (
          <button onClick={() => { onFermer(); allerVers("creer"); }}
            style={{ ...S.boutonPrincipal, marginTop: 4 }}>
            {contenu.cta}
          </button>
        )}

        {/* CTA secondaire (packs naissance/papy) */}
        {contenu.ctaSecondaire && (
          <button onClick={() => { onFermer(); allerVers("creer"); }}
            style={{ ...S.boutonSecondaire, marginTop: 10 }}>
            {contenu.ctaSecondaire}
          </button>
        )}

        {/* Ligne de réassurance */}
        <p style={{ fontSize: 11, color: COULEURS.doux, textAlign: "center", margin: "12px 0 0", lineHeight: 1.5 }}>
          🔐 Stripe · 🇪🇺 Europe · Annulation à tout moment
        </p>

        {/* Fermer */}
        <button onClick={onFermer}
          style={{ display: "block", width: "100%", background: "none", border: "none", color: COULEURS.doux,
            fontSize: 13, cursor: "pointer", marginTop: 10,
            fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
          Pas maintenant
        </button>
      </div>
    </div>
  );
}

// ============================================================================
//  ÉCRAN SENIOR — interface ultra-simplifiée pour les bénéficiaires d'un Pack
//  Mamie/Papy. Grands visuels, bouton unique "Découvrir", réactions émoji.
// ============================================================================
function EcranSenior({ capsule, moi, allerVers, reagir }) {
  const contributions = (capsule?.contributions || []).filter(c => !c.secret);
  const derniere = contributions[contributions.length - 1];

  function partagerSMS() {
    const lien = `https://blooom.app/c/${capsule?.code}`;
    if (navigator.share) {
      navigator.share({ title: capsule?.nom, url: lien }).catch(() => {});
    } else {
      window.open(`sms:?&body=Regarde notre capsule de souvenirs : ${lien}`);
    }
  }

  return (
    <div style={{ ...S.ecran, alignItems: "center", justifyContent: "center", textAlign: "center", padding: "32px 24px" }}>
      {/* Titre capsule */}
      <div style={{ fontSize: 28, fontWeight: 900, fontFamily: "'Bricolage Grotesque', sans-serif",
        color: COULEURS.encre, marginBottom: 8, lineHeight: 1.2 }}>
        {capsule?.nom || "Nos souvenirs"}
      </div>
      <p style={{ fontSize: 16, color: COULEURS.doux, marginBottom: 32 }}>
        {contributions.length} souvenir{contributions.length !== 1 ? "s" : ""} vous attendent 💛
      </p>

      {/* Aperçu du dernier souvenir */}
      {derniere && (
        <div style={{ background: "var(--carte-bg)", borderRadius: 24, padding: 20, marginBottom: 24, width: "100%",
          boxShadow: "0 6px 24px rgba(46,34,48,0.10)" }}>
          {derniere.type === "photo" && derniere.contenu && (
            <img src={derniere.contenu} alt="" style={{ width: "100%", borderRadius: 16, maxHeight: 200, objectFit: "cover" }} />
          )}
          {derniere.type === "message" && (
            <p style={{ fontSize: 17, color: COULEURS.encre, lineHeight: 1.6, margin: 0 }}>"{derniere.contenu}"</p>
          )}
          <div style={{ fontSize: 13, color: COULEURS.doux, marginTop: 10 }}>— {derniere.auteurPrenom || "Quelqu'un"}</div>
        </div>
      )}

      {/* Réactions */}
      <div style={{ display: "flex", gap: 16, justifyContent: "center", marginBottom: 32 }}>
        {["🥹", "😂", "💛"].map(emoji => (
          <button key={emoji} onClick={() => derniere && reagir && reagir(capsule.id, derniere.id, emoji)}
            style={{ fontSize: 36, background: "none", border: "none", cursor: "pointer", lineHeight: 1 }}>
            {emoji}
          </button>
        ))}
      </div>

      {/* Bouton principal — grand, centré */}
      <button onClick={() => allerVers("ouverture", capsule?.id)}
        style={{ ...S.boutonPrincipal, fontSize: 18, padding: "18px 0", borderRadius: 20, marginBottom: 16 }}>
        Découvrir tous les souvenirs
      </button>

      {/* Partage SMS */}
      <button onClick={partagerSMS}
        style={{ background: "none", border: `1px solid ${COULEURS.bordure}`, borderRadius: 14, padding: "12px 24px",
          fontSize: 15, color: COULEURS.doux, cursor: "pointer", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        📱 Partager par SMS
      </button>
    </div>
  );
}

// EcranAbonnement redirige vers EcranCreer (nouveau modèle : packs à l'acte, pas d'abonnement général)
function EcranAbonnement({ moi, allerVers }) {
  React.useEffect(() => { allerVers("creer"); }, []);
  return null;
}

// EcranOffrir — remplacé par EcranCreer dans le nouveau modèle économique
function EcranOffrir({ moi, allerVers }) {
  React.useEffect(() => { allerVers("creer"); }, []);
  return null;
}

function _EcranAbonnementLegacy({ moi, allerVers }) {
  // Lance une session Stripe Checkout via la Edge Function Supabase
  async function lancerCheckout(planId) {
    setChargement(true);
    try {
      const baseUrl = window.location.origin;
      const { data, error } = await supabase.functions.invoke("create-checkout-session", {
        body: {
          plan_id:     planId,
          user_id:     moi?.id,
          success_url: `${baseUrl}?checkout=success`,
          cancel_url:  `${baseUrl}?checkout=cancelled`,
        },
      });
      if (error || !data?.url) throw new Error(error?.message || "Redirection impossible");
      // Redirige vers la page de paiement Stripe hébergée
      window.location.href = data.url;
    } catch (e) {
      alert("Impossible d'accéder au paiement : " + e.message);
      setChargement(false);
    }
  }

  // Ouvre le Stripe Customer Portal pour gérer l'abonnement (résiliation, CB…)
  async function ouvrirPortal() {
    setChargement(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-portal-session", {
        body: { user_id: moi?.id, return_url: window.location.origin },
      });
      if (error || !data?.url) throw new Error(error?.message || "Portail indisponible");
      window.location.href = data.url;
    } catch (e) {
      alert("Erreur portail : " + e.message);
      setChargement(false);
    }
  }

  // Identifiants Stripe selon la période sélectionnée
  const PLANS = {
    plus:   { id: periode === "mensuel" ? "plus_monthly"   : "plus_yearly"   },
    rituel: { id: periode === "mensuel" ? "rituel_monthly" : "rituel_yearly" },
  };

  return (
    <div style={S.ecran}>
      <EnTeteRetour titre="Abonnement" onRetour={() => allerVers("profil")} />

      {/* En-tête émotionnelle avec cercles animés */}
      <div style={{ textAlign: "center", padding: "4px 0 18px" }}>
        <div style={{ display: "flex", justifyContent: "center", gap: 7, marginBottom: 14 }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{
              width: 11, height: 11, borderRadius: "50%", background: DEGRADE,
              animation: `pulseCercle 1.6s ${i * 0.27}s ease-in-out infinite`,
            }} />
          ))}
        </div>
        <h2 style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 800,
          fontSize: 20, color: COULEURS.encre, margin: "0 0 8px", lineHeight: 1.3 }}>
          Des souvenirs qui durent.<br />Un prix qui ne fait pas mal.
        </h2>
        <p style={{ fontSize: 12, color: COULEURS.doux, margin: 0 }}>
          Annulez à tout moment. Vos souvenirs restent pour toujours.
        </p>
      </div>

      {/* Toggle mensuel / annuel */}
      <div style={{ display: "flex", background: "#f0ece6", borderRadius: 999,
        padding: 4, marginBottom: 20, gap: 4 }}>
        {[
          { id: "mensuel", label: "Mensuel" },
          { id: "annuel",  label: <>Annuel <span style={{ background: "#22C7B8", color: "#fff",
            fontSize: 10, fontWeight: 800, borderRadius: 999, padding: "1px 6px", marginLeft: 4 }}>
            −30%</span></> },
        ].map(p => (
          <button key={p.id} onClick={() => setPeriode(p.id)}
            style={{ flex: 1, padding: "8px 0", borderRadius: 999, border: "none", cursor: "pointer",
              background: periode === p.id ? "#fff" : "transparent",
              fontWeight: 700, fontSize: 13, color: periode === p.id ? COULEURS.encre : COULEURS.doux,
              boxShadow: periode === p.id ? "0 2px 8px rgba(46,34,48,0.12)" : "none",
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.18s" }}>
            {p.label}
          </button>
        ))}
      </div>

      {/* ── Trois cartes côte à côte avec défilement horizontal ── */}
      <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 8,
        scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch", marginBottom: 4 }}>

        {/* Carte Gratuit */}
        <div style={{ minWidth: 148, flex: "0 0 148px", scrollSnapAlign: "start",
          background: "var(--carte-bg)", borderRadius: 20, padding: "18px 13px",
          border: plan === "gratuit" ? `2px solid ${COULEURS.corail}` : `1px solid ${COULEURS.bordure}`,
          boxShadow: "0 4px 14px rgba(46,34,48,0.07)", position: "relative" }}>
          {plan === "gratuit" && (
            <span style={{ position: "absolute", top: -9, left: "50%", transform: "translateX(-50%)",
              background: COULEURS.corail, color: "#fff", fontSize: 9, fontWeight: 800,
              padding: "2px 10px", borderRadius: 999, whiteSpace: "nowrap" }}>✓ VOTRE PLAN</span>
          )}
          <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 800,
            fontSize: 17, color: COULEURS.encre, marginBottom: 6 }}>Gratuit</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: COULEURS.encre, marginBottom: 14 }}>0€</div>
          {["1 capsule active", "5 participants", "500 Mo", "Tous les types de souvenirs"].map((f, i) => (
            <div key={i} style={{ fontSize: 11, color: COULEURS.doux, marginBottom: 5,
              display: "flex", gap: 5, alignItems: "flex-start", lineHeight: 1.35 }}>
              <span style={{ flexShrink: 0 }}>·</span>{f}
            </div>
          ))}
          <button disabled style={{ width: "100%", marginTop: 14, padding: "10px 0",
            background: "transparent", color: COULEURS.doux,
            border: `1px solid ${COULEURS.bordure}`, borderRadius: 12,
            fontSize: 12, fontWeight: 700, cursor: "default",
            fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            {plan === "gratuit" ? "Votre plan" : "Gratuit"}
          </button>
        </div>

        {/* Carte Plus ✨ — mise en avant avec dégradé */}
        <div style={{ minWidth: 158, flex: "0 0 158px", scrollSnapAlign: "start",
          background: DEGRADE, borderRadius: 20, padding: "18px 13px",
          boxShadow: "0 12px 32px rgba(255,92,157,0.45)", position: "relative" }}>
          <span style={{ position: "absolute", top: -9, left: "50%", transform: "translateX(-50%)",
            background: "#fff", color: COULEURS.corail, fontSize: 9, fontWeight: 800,
            padding: "2px 10px", borderRadius: 999, whiteSpace: "nowrap",
            boxShadow: "0 2px 8px rgba(255,92,157,0.25)" }}>LE PLUS POPULAIRE 🎁</span>
          {(plan === "plus" || plan === "plus_cadeau") && (
            <span style={{ position: "absolute", top: -9, right: 10,
              background: "rgba(255,255,255,0.3)", color: "#fff", fontSize: 9, fontWeight: 800,
              padding: "2px 8px", borderRadius: 999 }}>✓ ACTIF</span>
          )}
          <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 800,
            fontSize: 17, color: "#fff", marginBottom: 4 }}>Plus ✨</div>
          {/* Prix selon la période */}
          <div style={{ fontSize: 22, fontWeight: 800, color: "#fff" }}>
            {periode === "mensuel" ? "2,99€" : "24,99€"}
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.8)", marginBottom: 12 }}>
            {periode === "mensuel" ? "/mois" : "/an · soit 2,08€/mois"}
          </div>
          {[
            "3 capsules actives",
            "Participants illimités",
            "10 Go de stockage",
            "Tous types de souvenirs",
            "Packs Weekend, Voyage, Soirée inclus",
            "Animations premium",
            "Export PDF",
          ].map((f, i) => (
            <div key={i} style={{ fontSize: 11, color: "rgba(255,255,255,0.92)", marginBottom: 5,
              display: "flex", gap: 5, alignItems: "flex-start", lineHeight: 1.35 }}>
              <span style={{ flexShrink: 0 }}>✓</span>{f}
            </div>
          ))}
          {!estPlus(moi) && (
            <button onClick={() => lancerCheckout(PLANS.plus.id)} disabled={chargement}
              style={{ width: "100%", marginTop: 14, padding: "10px 0",
                background: "rgba(255,255,255,0.22)", color: "#fff",
                border: "2px solid rgba(255,255,255,0.45)", borderRadius: 12,
                fontSize: 12, fontWeight: 700, cursor: chargement ? "wait" : "pointer",
                fontFamily: "'Plus Jakarta Sans', sans-serif", opacity: chargement ? 0.6 : 1 }}>
              {chargement ? "…" : "Commencer avec Plus"}
            </button>
          )}
        </div>

        {/* Carte Rituel 🌟 */}
        <div style={{ minWidth: 148, flex: "0 0 148px", scrollSnapAlign: "start",
          background: "var(--carte-bg)", borderRadius: 20, padding: "18px 13px",
          border: (plan === "rituel" || plan === "rituel_cadeau") ? "2px solid #C65CE8" : `1px solid ${COULEURS.bordure}`,
          boxShadow: "0 4px 14px rgba(46,34,48,0.07)", position: "relative" }}>
          {(plan === "rituel" || plan === "rituel_cadeau") && (
            <span style={{ position: "absolute", top: -9, left: "50%", transform: "translateX(-50%)",
              background: "#C65CE8", color: "#fff", fontSize: 9, fontWeight: 800,
              padding: "2px 10px", borderRadius: 999, whiteSpace: "nowrap" }}>✓ VOTRE PLAN</span>
          )}
          <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 800,
            fontSize: 17, color: COULEURS.encre, marginBottom: 4 }}>Rituel 🌟</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: COULEURS.encre }}>
            {periode === "mensuel" ? "4,99€" : "49,99€"}
          </div>
          <div style={{ fontSize: 11, color: COULEURS.doux, marginBottom: 12 }}>
            {periode === "mensuel" ? "/mois" : "/an · soit 4,16€/mois"}
          </div>
          {[
            "Tout Blooom Plus",
            "Capsules illimitées",
            "50 Go de stockage",
            "Pack Mamie/Papy inclus",
            "1 album papier/an offert",
            "Capsule surprise trim.",
          ].map((f, i) => (
            <div key={i} style={{ fontSize: 11, color: COULEURS.doux, marginBottom: 5,
              display: "flex", gap: 5, alignItems: "flex-start", lineHeight: 1.35 }}>
              <span style={{ color: "#C65CE8", flexShrink: 0 }}>✓</span>{f}
            </div>
          ))}
          {!estRituel(moi) && (
            <button onClick={() => lancerCheckout(PLANS.rituel.id)} disabled={chargement}
              style={{ width: "100%", marginTop: 14, padding: "10px 0",
                background: "linear-gradient(120deg,#C65CE8,#9B5DE5)", color: "#fff",
                border: "none", borderRadius: 12,
                fontSize: 12, fontWeight: 700, cursor: chargement ? "wait" : "pointer",
                fontFamily: "'Plus Jakarta Sans', sans-serif", opacity: chargement ? 0.6 : 1 }}>
              {chargement ? "…" : "Choisir Rituel"}
            </button>
          )}
        </div>
      </div>
      <p style={{ fontSize: 11, color: COULEURS.doux, textAlign: "center", marginBottom: 20 }}>
        ← Faites glisser pour comparer →
      </p>

      {/* Bouton Gérer l'abonnement — uniquement si déjà abonné */}
      {estPlus(moi) && (
        <button onClick={ouvrirPortal} disabled={chargement}
          style={{ ...S.boutonSecondaire, fontSize: 13 }}>
          {chargement ? "Chargement…" : "⚙️ Gérer mon abonnement"}
        </button>
      )}

      {/* ── Packs à l'unité ── */}
      <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 800,
        fontSize: 16, margin: "24px 0 8px" }}>Packs à l'unité</div>
      <p style={{ ...S.aide, marginBottom: 12 }}>
        Sans abonnement — débloque tout pour une capsule. Inclus dans Plus et Rituel.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 24 }}>
        {PACKS_INFO.map(pack => (
          <button key={pack.id}
            onClick={() => estPlus(moi)
              ? alert("Ce pack est déjà inclus dans votre abonnement 🎉")
              : lancerCheckout(pack.id)}
            style={{ background: "var(--carte-bg)", border: `1px solid ${COULEURS.bordure}`,
              borderRadius: 16, padding: "14px 12px", cursor: "pointer", textAlign: "left",
              boxShadow: "0 3px 10px rgba(46,34,48,0.06)",
              fontFamily: "'Plus Jakarta Sans', sans-serif", position: "relative" }}>
            {estPlus(moi) && (
              <span style={{ position: "absolute", top: 7, right: 9, fontSize: 9,
                fontWeight: 800, color: COULEURS.corail }}>INCLUS</span>
            )}
            <div style={{ fontSize: 24, marginBottom: 6 }}>{pack.icone}</div>
            <div style={{ fontWeight: 700, fontSize: 13, color: COULEURS.encre, marginBottom: 4 }}>{pack.nom}</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: COULEURS.corail }}>{pack.prix}€</div>
          </button>
        ))}
      </div>

      {/* ── Section Offrir Blooom ── */}
      <div style={{ background: "linear-gradient(135deg,#FF8A3D12,#FF5C9D12)",
        border: `1px solid ${COULEURS.corail}28`, borderRadius: 20, padding: "18px 16px", marginBottom: 14 }}>
        <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 800,
          fontSize: 16, color: COULEURS.encre, marginBottom: 8 }}>🎁 Offrir Blooom</div>
        <p style={{ ...S.aide, marginBottom: 12 }}>
          Le destinataire reçoit un code par email. Aucun abonnement automatique — il active quand il veut.
        </p>
        <button onClick={() => allerVers("offrir")}
          style={{ ...S.boutonPrincipal, marginTop: 0, fontSize: 14 }}>
          Offrir un abonnement →
        </button>
      </div>

      {/* Lien code cadeau */}
      <button onClick={() => allerVers("activer_code")}
        style={{ display: "block", width: "100%", background: "none", border: "none",
          color: COULEURS.doux, fontSize: 13, cursor: "pointer", textDecoration: "underline",
          padding: "4px 0", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        J'ai un code cadeau à activer
      </button>

      <p style={{ ...S.aide, textAlign: "center", marginTop: 16 }}>
        🔒 Paiement sécurisé via Stripe · Sans engagement pour les abonnements mensuels
      </p>
    </div>
  );
}

// _EcranOffrirLegacy — conservé pour référence, non utilisé
function _EcranOffrirLegacy({ moi, allerVers }) {
  const [prenom, setPrenom]       = useState("");
  const [email, setEmail]         = useState("");
  const [offreId, setOffreId]     = useState(null);
  const [chargement, setChargement] = useState(false);

  const OFFRES = [
    { id: "cadeau_plus_6m",    label: "6 mois Blooom Plus",   prix: 14.99, icone: "✨" },
    { id: "cadeau_plus_1an",   label: "1 an Blooom Plus",     prix: 24.99, icone: "✨" },
    { id: "cadeau_rituel_1an", label: "1 an Blooom Rituel",   prix: 49.99, icone: "🌟" },
  ];

  const peutOffrir = prenom.trim() && email.trim() && offreId;

  // Lance le paiement Stripe avec les informations du destinataire
  async function offrir() {
    if (!peutOffrir) return;
    setChargement(true);
    try {
      const baseUrl = window.location.origin;
      const { data, error } = await supabase.functions.invoke("create-checkout-session", {
        body: {
          plan_id:     offreId,
          user_id:     moi?.id,
          success_url: `${baseUrl}?checkout=gift_success`,
          cancel_url:  `${baseUrl}?checkout=cancelled`,
          destinataire: { prenom: prenom.trim(), email: email.trim() },
        },
      });
      if (error || !data?.url) throw new Error(error?.message || "Erreur lors de la redirection");
      window.location.href = data.url;
    } catch (e) {
      alert("Erreur : " + e.message);
      setChargement(false);
    }
  }

  return (
    <div style={S.ecran}>
      <EnTeteRetour titre="Offrir Blooom 🎁" onRetour={() => allerVers("abonnement")} />

      <p style={{ ...S.aide, marginBottom: 20 }}>
        Le destinataire reçoit un email avec son code d'activation. Il l'active quand il veut — aucun abonnement automatique.
      </p>

      {/* Sélection de l'offre */}
      <label style={S.label}>Choisissez l'offre</label>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
        {OFFRES.map(offre => (
          <button key={offre.id} onClick={() => setOffreId(offre.id)}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
              background: offreId === offre.id ? "linear-gradient(120deg,#FF8A3D12,#FF5C9D12)" : "var(--carte-bg)",
              border: offreId === offre.id ? `2px solid ${COULEURS.corail}` : `1px solid ${COULEURS.bordure}`,
              borderRadius: 16, padding: "14px 16px", cursor: "pointer",
              fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 22 }}>{offre.icone}</span>
              <span style={{ fontWeight: 700, fontSize: 14, color: COULEURS.encre }}>{offre.label}</span>
            </div>
            <span style={{ fontWeight: 800, fontSize: 16, color: COULEURS.corail }}>{offre.prix}€</span>
          </button>
        ))}
      </div>

      {/* Informations du destinataire */}
      <label style={S.label}>Prénom du destinataire</label>
      <input style={S.input} placeholder="Ex. Marie" value={prenom}
        onChange={e => setPrenom(e.target.value)} />

      <label style={S.label}>Email du destinataire</label>
      <input style={S.input} placeholder="marie@exemple.fr" type="email" value={email}
        onChange={e => setEmail(e.target.value)} />

      <button
        onClick={offrir}
        disabled={!peutOffrir || chargement}
        style={{ ...S.boutonPrincipal, ...(!peutOffrir || chargement ? S.boutonDesactive : {}) }}>
        {chargement ? "Redirection…" : "🎁 Offrir maintenant"}
      </button>

      <p style={{ ...S.aide, textAlign: "center", marginTop: 12 }}>
        🔒 Paiement sécurisé via Stripe
      </p>
    </div>
  );
}

// ============================================================================
//  ÉCRAN ACTIVER UN CODE CADEAU — saisie et validation d'un code d'activation.
// ============================================================================
function EcranActiverCode({ moi, allerVers, onCodeActive }) {
  const [code, setCode]           = useState("");
  const [chargement, setChargement] = useState(false);
  // null = pas encore tenté | "success" | message d'erreur string
  const [resultat, setResultat]   = useState(null);

  async function activer() {
    if (!code.trim()) return;
    setChargement(true);
    setResultat(null);
    try {
      // Appelle la fonction SQL SECURITY DEFINER qui vérifie et active le code
      const { data, error } = await supabase.rpc("activer_code_cadeau", {
        p_code:    code.trim().toUpperCase(),
        p_user_id: moi?.id,
      });
      if (error) throw error;
      if (data?.success) {
        setResultat("success");
        // Recharge les données du profil pour refléter le nouveau plan
        onCodeActive && onCodeActive();
      } else {
        setResultat(data?.message || "Code invalide ou déjà utilisé.");
      }
    } catch (e) {
      setResultat("Erreur : " + e.message);
    } finally {
      setChargement(false);
    }
  }

  return (
    <div style={S.ecran}>
      <EnTeteRetour titre="Code cadeau" onRetour={() => allerVers("abonnement")} />

      {resultat === "success" ? (
        /* Confirmation d'activation */
        <div style={{ textAlign: "center", padding: "32px 0" }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>🎉</div>
          <h2 style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 800,
            fontSize: 22, color: COULEURS.encre, marginBottom: 12 }}>Code activé !</h2>
          <p style={{ fontSize: 14, color: COULEURS.doux, marginBottom: 24, lineHeight: 1.5 }}>
            Votre abonnement a bien été mis à jour. Profitez de Blooom !
          </p>
          <button onClick={() => allerVers("profil")} style={S.boutonPrincipal}>
            Voir mon profil →
          </button>
        </div>
      ) : (
        <>
          <p style={{ ...S.aide, marginBottom: 20 }}>
            Entrez le code à 10 caractères reçu par email pour activer votre abonnement cadeau.
          </p>

          <label style={S.label}>Votre code cadeau</label>
          <input
            style={{ ...S.input, textTransform: "uppercase", letterSpacing: 3,
              fontSize: 18, fontWeight: 700, textAlign: "center" }}
            placeholder="XXXXXXXXXXXX"
            value={code}
            onChange={e => { setCode(e.target.value.toUpperCase()); setResultat(null); }}
            maxLength={12}
          />

          {/* Message d'erreur si code invalide */}
          {resultat && resultat !== "success" && (
            <p style={{ color: "#C62828", fontSize: 13, fontWeight: 600, marginTop: 8, textAlign: "center" }}>
              ⚠️ {resultat}
            </p>
          )}

          <button
            onClick={activer}
            disabled={!code.trim() || chargement}
            style={{ ...S.boutonPrincipal, ...(!code.trim() || chargement ? S.boutonDesactive : {}) }}>
            {chargement ? "Vérification…" : "Activer le code"}
          </button>
        </>
      )}
    </div>
  );
}

// ============================================================================
//  BANNIÈRE COOKIES — affichée une seule fois à la première visite.
//  Blooom n'utilisant que des cookies essentiels, le seul besoin est
//  d'informer l'utilisateur, pas de recueillir un consentement granulaire.
// ============================================================================
function BanniereCookies() {
  // Initialisation depuis localStorage : si déjà acceptée, on n'affiche rien
  const [visible, setVisible] = useState(() => {
    try { return !localStorage.getItem("blooom_cookies"); } catch { return true; }
  });

  if (!visible) return null;

  function accepter() {
    try { localStorage.setItem("blooom_cookies", "1"); } catch {}
    setVisible(false);
  }

  return (
    <div style={{
      position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 500,
      background: "rgba(46,34,48,0.95)", backdropFilter: "blur(10px)",
      padding: "14px 16px 18px",
      display: "flex", alignItems: "center", gap: 12,
      animation: "fadeSlideUp 0.4s cubic-bezier(0.34,1.56,0.64,1) both",
    }}>
      <p style={{ flex: 1, color: "#fff", fontSize: 12, margin: 0, lineHeight: 1.5 }}>
        <span style={{ fontWeight: 700 }}>🍪 Cookies essentiels uniquement.</span>{" "}
        Blooom n'utilise aucun cookie publicitaire ni de tracking.
      </p>
      <button onClick={accepter} style={{
        background: DEGRADE, color: "#fff", border: "none", borderRadius: 12,
        padding: "9px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer",
        flexShrink: 0, fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}>
        Compris
      </button>
    </div>
  );
}

// ============================================================================
//  ÉCRAN CONFIDENTIALITÉ — engagements vie privée en langage clair +
//  suppression de compte en deux étapes avec confirmation par email.
// ============================================================================
function EcranConfidentialite({ allerVers, session, onSupprimerCompte }) {
  // 0 = affichage normal ; 1 = alerte irréversible ; 2 = saisie email ; 3 = en cours
  const [etape, setEtape] = useState(0);
  const [emailSaisi, setEmailSaisi] = useState("");
  const [erreur, setErreur] = useState("");

  // Liste des engagements affichés sous forme de cartes
  const ENGAGEMENTS = [
    {
      icone: "🔒",
      titre: "Vos souvenirs sont privés",
      texte: "Toutes vos données sont chiffrées en transit (TLS 1.3) et au repos (AES-256). Seuls vous et vos invités peuvent y accéder.",
    },
    {
      icone: "🇩🇪",
      titre: "Hébergé en Europe",
      texte: "Nos serveurs sont à Francfort, Allemagne. Vos données ne quittent jamais l'Union européenne.",
    },
    {
      icone: "🚫",
      titre: "Zéro publicité",
      texte: "Blooom ne diffuse aucune publicité, maintenant ni jamais. C'est inscrit dans nos conditions générales.",
    },
    {
      icone: "🤝",
      titre: "Zéro revente de données",
      texte: "Vos données personnelles ne sont jamais vendues, louées ni partagées à des fins commerciales.",
    },
    {
      icone: "🍪",
      titre: "Cookies essentiels uniquement",
      texte: "Blooom n'utilise que les cookies nécessaires au fonctionnement de l'app. Aucun cookie publicitaire ni de tracking.",
    },
  ];

  // Lance la suppression définitive après vérification de l'email
  async function supprimerDefinitivement() {
    if (emailSaisi.trim().toLowerCase() !== session?.user?.email?.toLowerCase()) {
      setErreur("L'email saisi ne correspond pas à votre compte.");
      return;
    }
    setEtape(3);
    setErreur("");
    try {
      await onSupprimerCompte();
    } catch (e) {
      setEtape(2);
      setErreur("Erreur lors de la suppression : " + e.message);
    }
  }

  return (
    <div style={S.ecran}>
      <EnTeteRetour titre="Confidentialité & sécurité" onRetour={() => allerVers("profil")} />

      <p style={{ fontSize: 14, color: COULEURS.doux, lineHeight: 1.6, marginBottom: 20 }}>
        Chez Blooom, vos souvenirs vous appartiennent. Voici nos engagements, sans jargon juridique.
      </p>

      {/* Cartes d'engagements */}
      {ENGAGEMENTS.map((eng, i) => (
        <div key={i} style={{
          display: "flex", gap: 14, alignItems: "flex-start",
          background: "var(--carte-bg)", borderRadius: 18, padding: 16,
          marginBottom: 10, boxShadow: "0 4px 14px rgba(46,34,48,0.06)",
        }}>
          <div style={{
            fontSize: 20, width: 42, height: 42, borderRadius: 12,
            background: "var(--profond-bg)", display: "flex", alignItems: "center",
            justifyContent: "center", flexShrink: 0,
          }}>
            {eng.icone}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: COULEURS.encre, marginBottom: 4 }}>
              {eng.titre}
            </div>
            <div style={{ fontSize: 13, color: COULEURS.doux, lineHeight: 1.5 }}>
              {eng.texte}
            </div>
          </div>
        </div>
      ))}

      {/* Lien vers le rapport de transparence sur le site web */}
      <a
        href="https://blooom.app/confidentialite"
        target="_blank"
        rel="noopener noreferrer"
        style={{ display: "block", textAlign: "center", marginTop: 10, marginBottom: 4,
          color: COULEURS.corail, fontSize: 13, fontWeight: 700, textDecoration: "none" }}
      >
        📋 Rapport de transparence →
      </a>
      <p style={{ textAlign: "center", fontSize: 11, color: COULEURS.doux, marginBottom: 28 }}>
        Dernière mise à jour : 31 mai 2026
      </p>

      {/* ── Suppression de compte — étape 0 : bouton discret ── */}
      {etape === 0 && (
        <button
          onClick={() => setEtape(1)}
          style={{
            width: "100%", background: "transparent",
            color: COULEURS.doux, border: `1px solid ${COULEURS.bordure}`,
            borderRadius: 16, padding: 14, fontSize: 14, fontWeight: 600,
            cursor: "pointer", fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}
        >
          🗑️ Supprimer mon compte
        </button>
      )}

      {/* ── Étape 1 : avertissement irréversible ── */}
      {etape === 1 && (
        <div style={{ background: "#FFF0F0", borderRadius: 18, padding: 20 }}>
          <p style={{ fontWeight: 700, fontSize: 15, color: "#C62828", margin: "0 0 10px" }}>
            ⚠️ Cette action est irréversible
          </p>
          <p style={{ fontSize: 13, color: COULEURS.encre, lineHeight: 1.6, margin: "0 0 16px" }}>
            Toutes vos capsules, souvenirs, photos et vidéos seront{" "}
            <strong>définitivement supprimés</strong> de nos serveurs.
            Les capsules dont vous êtes l'unique créateur deviendront inaccessibles.
          </p>
          <button
            onClick={() => setEtape(2)}
            style={{ ...S.boutonPrincipal, background: "#C62828", boxShadow: "none", marginTop: 0 }}
          >
            Continuer vers la suppression
          </button>
          <button onClick={() => setEtape(0)} style={{ ...S.boutonSecondaire, marginTop: 10 }}>
            Annuler
          </button>
        </div>
      )}

      {/* ── Étape 2 : confirmation par email ── */}
      {etape === 2 && (
        <div style={{ background: "#FFF0F0", borderRadius: 18, padding: 20 }}>
          <p style={{ fontWeight: 700, fontSize: 15, color: "#C62828", margin: "0 0 10px" }}>
            Confirmation finale
          </p>
          <p style={{ fontSize: 13, color: COULEURS.encre, lineHeight: 1.6, margin: "0 0 12px" }}>
            Saisissez votre adresse email{" "}
            <strong>{session?.user?.email}</strong>{" "}
            pour confirmer la suppression définitive.
          </p>
          <input
            style={S.input}
            type="email"
            placeholder="votre@email.com"
            value={emailSaisi}
            onChange={e => setEmailSaisi(e.target.value)}
            autoFocus
          />
          {erreur && (
            <p style={{ ...S.aide, color: "#C62828", marginTop: 6 }}>{erreur}</p>
          )}
          <button
            onClick={supprimerDefinitivement}
            disabled={!emailSaisi.trim()}
            style={{
              ...S.boutonPrincipal, background: "#C62828", boxShadow: "none", marginTop: 14,
              ...(!emailSaisi.trim() ? S.boutonDesactive : {}),
            }}
          >
            Supprimer définitivement
          </button>
          <button
            onClick={() => { setEtape(0); setEmailSaisi(""); setErreur(""); }}
            style={{ ...S.boutonSecondaire, marginTop: 10 }}
          >
            Annuler
          </button>
        </div>
      )}

      {/* ── Étape 3 : suppression en cours ── */}
      {etape === 3 && (
        <div style={{ textAlign: "center", padding: "24px 0", color: COULEURS.doux, fontSize: 14 }}>
          ⏳ Suppression en cours…
        </div>
      )}
    </div>
  );
}

// ============================================================================
//  ÉCRAN PAPY SIMPLE — un souvenir à la fois, grands boutons, fond chaud.
// ============================================================================
//  ÉCRAN PAPY SIMPLE — 2 phases : accueil mensuel + galerie animée souvenir/souvenir.
// ============================================================================
function PhotoZoomable({ src }) {
  const [scale, setScale] = React.useState(1);
  const containerRef = React.useRef(null);
  const st = React.useRef({ lastDist: null, lastScale: 1, scale: 1 });

  React.useEffect(() => {
    setScale(1); st.current.scale = 1; st.current.lastScale = 1;
  }, [src]);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const dist = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onStart = e => {
      if (e.touches.length === 2) {
        st.current.lastDist = dist(e.touches);
        st.current.lastScale = st.current.scale;
      }
    };
    const onMove = e => {
      if (e.touches.length === 2 && st.current.lastDist != null) {
        e.preventDefault();
        const d = dist(e.touches);
        const ns = Math.min(5, Math.max(1, st.current.lastScale * d / st.current.lastDist));
        st.current.scale = ns;
        setScale(ns);
      }
    };
    const onEnd = e => { if (e.touches.length < 2) st.current.lastDist = null; };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
    };
  }, []);

  return (
    <div ref={containerRef}
      style={{ position: "absolute", inset: 0, overflow: "hidden", background: "#111" }}
      onDoubleClick={() => { const ns = st.current.scale > 1 ? 1 : 2.5; st.current.scale = ns; setScale(ns); }}>
      <img src={src} alt="Photo"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%",
          objectFit: "contain",
          transform: `scale(${scale})`, transformOrigin: "center center",
          transition: "transform 0.12s ease",
          userSelect: "none", pointerEvents: "none" }} />
    </div>
  );
}

function EcranPapySimple({ capsule, allerVers, onTerminer, autresCapsules }) {
  const [phase, setPhase] = useState("accueil");
  const [index, setIndex] = useState(0);
  const [animKey, setAnimKey] = useState(0);
  const [capsuleChoisie, setCapsuleChoisie] = useState(null);
  // Photo / dessin zoom
  const [zoomPhoto, setZoomPhoto] = useState(false);
  // Vidéo
  const videoRef = React.useRef(null);
  const [videoPlaying, setVideoPlaying] = useState(false);
  // Audio (vocal + musique)
  const audioRef = React.useRef(null);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioTermine, setAudioTermine] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [parolesModal, setParolesModal] = useState(false);

  const capsuleAffichee = capsuleChoisie || capsule;
  const contributions = capsuleAffichee?.contributions || [];
  const total = contributions.length;
  const contrib = contributions[index] || null;
  const auteur = contrib
    ? (capsuleAffichee?.participants || []).find(p => p.id === contrib.auteurId)
    : null;

  const prenoms = (capsuleAffichee?.participants || []).map(p => p.prenom).filter(Boolean);
  const prenomsStr = prenoms.length === 0 ? "votre famille"
    : prenoms.length === 1 ? prenoms[0]
    : prenoms.slice(0, -1).join(", ") + " et " + prenoms[prenoms.length - 1];
  const moisStr = new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

  // Réinitialise tout quand on change de souvenir
  React.useEffect(() => {
    setZoomPhoto(false);
    setVideoPlaying(false);
    setAudioPlaying(false);
    setAudioTermine(false);
    setAudioProgress(0);
    setParolesModal(false);
    try { if (videoRef.current) { videoRef.current.pause(); videoRef.current.currentTime = 0; } } catch {}
    try { if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; } } catch {}
  }, [index]);

  function toggleVideo() {
    if (!videoRef.current) return;
    if (videoPlaying) { videoRef.current.pause(); } else { videoRef.current.play(); }
  }
  function toggleAudio() {
    if (!audioRef.current) return;
    if (audioTermine) {
      audioRef.current.currentTime = 0;
      audioRef.current.play();
      setAudioTermine(false);
    } else if (audioPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
  }

  function allerSuivant() { setIndex(i => i + 1); setAnimKey(k => k + 1); }
  function allerPrecedent() { setIndex(i => i - 1); setAnimKey(k => k + 1); }

  // ── Phase accueil ──────────────────────────────────────────────────────────
  if (phase === "accueil") return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%",
      background: "linear-gradient(160deg, #FFF0E6 0%, #FFE4CC 50%, #FFF5EC 100%)",
      alignItems: "center", justifyContent: "flex-start",
      padding: "52px 24px 40px", textAlign: "center", position: "relative",
      overflowY: "auto" }}>

      {allerVers && (
        <button onClick={() => allerVers("detail", capsule?.id)}
          style={{ position: "absolute", top: 14, left: 14, background: "rgba(255,140,90,0.15)",
            border: "none", borderRadius: 999, padding: "6px 14px", fontSize: 13,
            fontWeight: 700, color: "#C25A20", cursor: "pointer" }}>
          ← Retour
        </button>
      )}

      {/* Cercles décoratifs en fond */}
      <div style={{ position: "absolute", width: 260, height: 260, borderRadius: "50%",
        background: "rgba(255,140,90,0.07)", top: -60, right: -60 }} />
      <div style={{ position: "absolute", width: 180, height: 180, borderRadius: "50%",
        background: "rgba(255,180,90,0.07)", bottom: 40, left: -50 }} />

      {/* Icône pulsante */}
      <div style={{ fontSize: 72, animation: "pulseCercle 2.2s ease-in-out infinite",
        marginBottom: 20, filter: "drop-shadow(0 6px 18px rgba(255,140,90,0.35))" }}>
        💌
      </div>

      {/* Badge mois */}
      <div style={{ background: "linear-gradient(135deg, #FF8C5A 0%, #FF6B3C 100%)",
        color: "#fff", borderRadius: 999, padding: "7px 20px", fontSize: 13, fontWeight: 800,
        marginBottom: 18, fontFamily: "'Bricolage Grotesque', sans-serif",
        animation: "fadeSlideUp 0.5s ease both",
        boxShadow: "0 6px 18px rgba(255,108,60,0.35)" }}>
        ✨ Nouveaux souvenirs
      </div>

      {/* Titre principal */}
      <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 800,
        fontSize: 22, color: "#3D1A0A", lineHeight: 1.35, marginBottom: 8,
        animation: "fadeSlideUp 0.5s 0.08s ease both" }}>
        Découvrez les souvenirs de<br />
        <span style={{ color: "#FF6B3C" }}>{prenomsStr}</span>
      </div>
      <div style={{ fontSize: 15, color: "#A07850", marginBottom: 28,
        animation: "fadeSlideUp 0.5s 0.14s ease both",
        fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        pour le mois de <strong style={{ color: "#7C4A2A" }}>{moisStr}</strong>
      </div>

      {/* Avatars membres */}
      {(capsuleAffichee?.participants || []).length > 0 && (
        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginBottom: 24,
          animation: "fadeSlideUp 0.5s 0.2s ease both" }}>
          {(capsuleAffichee.participants).slice(0, 5).map(p => (
            <div key={p.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
              <div style={{ width: 50, height: 50, borderRadius: "50%",
                background: p.couleur || "#FF8C5A", display: "flex",
                alignItems: "center", justifyContent: "center",
                fontSize: 18, fontWeight: 800, color: "#fff",
                boxShadow: "0 4px 12px rgba(0,0,0,0.14)" }}>
                {initiales(p.prenom)}
              </div>
              <span style={{ fontSize: 11, color: "#A07850", fontWeight: 600,
                fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                {p.prenom}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Compteur */}
      {total > 0 && (
        <div style={{ fontSize: 14, color: "#B06840",
          marginBottom: 22, fontFamily: "'Plus Jakarta Sans', sans-serif",
          animation: "fadeSlideUp 0.5s 0.25s ease both" }}>
          🎁 {total} souvenir{total > 1 ? "s" : ""} vous attendent
        </div>
      )}

      {/* CTA */}
      {total > 0 ? (
        <button onClick={() => { setIndex(0); setAnimKey(0); setPhase("parcours"); }}
          style={{ background: "linear-gradient(135deg, #FF8C5A 0%, #FF5A20 100%)",
            color: "#fff", border: "none", borderRadius: 22, padding: "20px 0",
            fontSize: 19, fontWeight: 800, cursor: "pointer", width: "100%",
            fontFamily: "'Bricolage Grotesque', sans-serif",
            boxShadow: "0 14px 32px rgba(255,90,32,0.45)",
            animation: "fadeSlideUp 0.5s 0.3s ease both" }}>
          Voir mes souvenirs ✨
        </button>
      ) : (
        <div style={{ fontSize: 16, color: "#A07850", fontStyle: "italic",
          animation: "fadeSlideUp 0.5s 0.25s ease both" }}>
          Pas encore de souvenirs ce mois-ci…
        </div>
      )}

      {/* ── Mois précédents ── */}
      {autresCapsules?.length > 0 && (
        <div style={{ marginTop: 32, width: "100%", animation: "fadeSlideUp 0.5s 0.38s ease both" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#A07850", marginBottom: 12,
            textAlign: "left", display: "flex", alignItems: "center", gap: 6 }}>
            📅 Souvenirs des mois précédents
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[...autresCapsules]
              .sort((a, b) => new Date(b.dateCreation || b.created_at || 0) - new Date(a.dateCreation || a.created_at || 0))
              .map(c => {
                const nb = (c.contributions || []).length;
                const dateStr = c.dateCreation
                  ? new Date(c.dateCreation).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
                  : c.created_at
                  ? new Date(c.created_at).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
                  : "";
                return (
                  <button key={c.id}
                    onClick={() => {
                      setCapsuleChoisie(c);
                      setIndex(0); setAnimKey(0); setPhase("parcours");
                    }}
                    style={{ background: "rgba(255,255,255,0.72)", border: "1.5px solid rgba(255,140,90,0.22)",
                      borderRadius: 18, padding: "15px 18px", cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      backdropFilter: "blur(6px)", width: "100%", textAlign: "left" }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: "#3D1A0A" }}>{c.nom}</div>
                      <div style={{ fontSize: 13, color: "#A07850", marginTop: 3 }}>
                        {nb} souvenir{nb !== 1 ? "s" : ""}
                        {dateStr ? ` · ${dateStr}` : ""}
                      </div>
                    </div>
                    <span style={{ fontSize: 22, color: "#FF8C5A", flexShrink: 0 }}>→</span>
                  </button>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );

  // ── Phase parcours — top bar solide + contenu + bottom bar ───────────────
  const chansonData = contrib?.type === "chanson"
    ? (() => { let d = {}; try { d = JSON.parse(contrib.question || "{}"); } catch {} return d; })()
    : null;
  const audioSrcChanson = chansonData ? (chansonData.preview || chansonData.previewUrl || null) : null;

  return (
    <div key={animKey} style={{ display: "flex", flexDirection: "column", height: "100%",
      background: "#111", animation: "animSlideGauche 0.28s cubic-bezier(0.34,1.1,0.64,1) both" }}>

      {/* ════════════════ BARRE HAUTE solide ════════════════ */}
      <div style={{ flexShrink: 0, background: "#0e0e0e", paddingTop: 48 }}>
        <div style={{ height: 4, background: "rgba(255,255,255,0.15)" }}>
          <div style={{ height: "100%", background: "linear-gradient(90deg,#FF8C5A,#FF5A20)",
            width: `${((index + 1) / total) * 100}%`,
            transition: "width 0.4s cubic-bezier(0.4,0,0.2,1)",
            borderRadius: "0 4px 4px 0" }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px 0" }}>
          <button onClick={() => setPhase("accueil")}
            style={{ background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 999,
              padding: "9px 16px", fontSize: 14, fontWeight: 700, color: "#fff",
              cursor: "pointer", flexShrink: 0 }}>
            ← Menu
          </button>
          <div style={{ flex: 1 }} />
          {(contrib?.type === "photo" || contrib?.type === "dessin") && contrib?.media && (
            <button onClick={() => setZoomPhoto(true)}
              style={{ background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 999,
                padding: "9px 16px", fontSize: 14, fontWeight: 700, color: "#fff",
                cursor: "pointer", flexShrink: 0 }}>
              🔍 Agrandir
            </button>
          )}
          <div style={{ background: "rgba(255,255,255,0.1)", borderRadius: 999, padding: "8px 14px",
            fontSize: 14, fontWeight: 800, color: "#fff", flexShrink: 0 }}>
            {index + 1} / {total}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px 12px" }}>
          <div style={{ width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
            background: auteur?.couleur || "#FF8C5A",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14, fontWeight: 800, color: "#fff" }}>
            {initiales(auteur?.prenom)}
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, color: "#fff" }}>
              {auteur?.prenom || "Quelqu'un"}
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginTop: 1 }}>
              {formaterDateHeure(contrib?.date)}
            </div>
          </div>
        </div>
      </div>

      {/* ════════════════ ZONE CONTENU ════════════════ */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>

      {/* ════════════════ PHOTO ════════════════ */}
      {contrib?.type === "photo" && (
        contrib.media
          ? <PhotoZoomable src={contrib.media} />
          : <div style={{ position: "absolute", inset: 0,
              background: "linear-gradient(135deg,#FF8C5A 0%,#FFD580 55%,#FF6B88 100%)",
              display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 88 }}>🌸</div>
                <div style={{ color: "rgba(255,255,255,0.9)", fontSize: 16, fontWeight: 700,
                  marginTop: 12, background: "rgba(0,0,0,0.18)", padding: "6px 20px", borderRadius: 999 }}>
                  Photo
                </div>
              </div>
            </div>
      )}

      {/* ════════════════ DESSIN ════════════════ */}
      {contrib?.type === "dessin" && (
        contrib.media
          ? <img src={contrib.media} alt="Dessin"
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%",
                objectFit: "contain", background: "#fff" }} />
          : <div style={{ position: "absolute", inset: 0, background: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ fontSize: 80, opacity: 0.3 }}>🖌️</div>
            </div>
      )}

      {/* ════════════════ VIDÉO ════════════════ */}
      {contrib?.type === "video" && (
        <div style={{ position: "absolute", inset: 0, background: "#000" }}>
          {contrib.media
            ? <video ref={videoRef} src={contrib.media} playsInline
                onPlay={() => setVideoPlaying(true)}
                onPause={() => setVideoPlaying(false)}
                onEnded={() => setVideoPlaying(false)}
                style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : <div style={{ width: "100%", height: "100%", background: "linear-gradient(145deg,#0f172a,#1e293b)",
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <div style={{ fontSize: 88, filter: "drop-shadow(0 0 28px rgba(255,140,90,0.6))",
                  animation: "pulseCercle 1.8s ease-in-out infinite" }}>🎬</div>
                <div style={{ fontSize: 20, color: "rgba(255,255,255,0.8)", marginTop: 20,
                  fontWeight: 600, textAlign: "center", padding: "0 40px", lineHeight: 1.5 }}>
                  {contrib.texte || "Vidéo"}
                </div>
              </div>
          }
          {/* Gros bouton Play central — disparaît pendant la lecture */}
          {contrib.media && !videoPlaying && (
            <button onClick={toggleVideo}
              style={{ position: "absolute", inset: 0, background: "transparent", border: "none",
                display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <div style={{ width: 96, height: 96, borderRadius: "50%",
                background: "rgba(255,255,255,0.93)", backdropFilter: "blur(4px)",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 10px 40px rgba(0,0,0,0.55)" }}>
                <span style={{ fontSize: 38, marginLeft: 7 }}>▶</span>
              </div>
            </button>
          )}
          {/* Bouton Pause discret pendant la lecture */}
          {contrib.media && videoPlaying && (
            <button onClick={toggleVideo}
              style={{ position: "absolute", top: 110, right: 16,
                background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)", border: "none",
                borderRadius: 999, padding: "11px 20px",
                color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
              ⏸ Pause
            </button>
          )}
        </div>
      )}

      {/* ════════════════ MESSAGE ════════════════ */}
      {contrib?.type === "message" && (
        <div style={{ position: "absolute", inset: 0,
          background: "linear-gradient(145deg,#FFF8F2 0%,#FFE8D0 100%)",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          padding: "24px 32px" }}>
          <div style={{ fontSize: 60, marginBottom: 28 }}>💬</div>
          <div style={{ fontSize: 26, lineHeight: 1.8, color: "#3D1A0A",
            fontFamily: "'Plus Jakarta Sans', sans-serif", fontStyle: "italic",
            fontWeight: 500, textAlign: "center", maxWidth: 340 }}>
            « {contrib.texte} »
          </div>
        </div>
      )}

      {/* ════════════════ VOCAL ════════════════ */}
      {contrib?.type === "vocal" && (
        <div style={{ position: "absolute", inset: 0,
          background: "linear-gradient(145deg,#F0FDF4 0%,#DCFCE7 100%)",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          padding: "24px 32px" }}>

          {contrib.media && (
            <audio ref={audioRef} src={contrib.media}
              onPlay={() => setAudioPlaying(true)}
              onPause={() => setAudioPlaying(false)}
              onEnded={() => { setAudioPlaying(false); setAudioTermine(true); }}
              onTimeUpdate={() => audioRef.current?.duration &&
                setAudioProgress(audioRef.current.currentTime / audioRef.current.duration)} />
          )}

          {/* Waveform — animée seulement pendant la lecture */}
          <div style={{ display: "flex", gap: 5, alignItems: "center", height: 80, marginBottom: 36 }}>
            {[0.4,0.65,1,0.55,0.85,0.45,0.75,0.5,0.9,0.6,1,0.5,0.8,0.45,0.7,0.4,0.9,0.6].map((h, i) => (
              <div key={i} style={{ width: 6, borderRadius: 99,
                background: "linear-gradient(to top,#16A34A,#4ADE80)",
                height: `${h * 100}%`,
                opacity: audioPlaying ? 1 : 0.35,
                transition: "opacity 0.4s",
                animation: audioPlaying
                  ? `pulseCercle ${0.7 + (i % 4) * 0.2}s ${i * 0.05}s ease-in-out infinite`
                  : "none" }} />
            ))}
          </div>

          {/* Gros bouton central */}
          <button onClick={contrib.media ? toggleAudio : undefined}
            style={{ width: 110, height: 110, borderRadius: "50%", border: "none",
              background: audioPlaying
                ? "linear-gradient(135deg,#15803D,#166534)"
                : "linear-gradient(135deg,#22C55E,#16A34A)",
              color: "#fff", fontSize: 40, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: audioPlaying
                ? "0 0 0 14px rgba(34,197,94,0.18), 0 8px 28px rgba(22,163,74,0.5)"
                : "0 8px 28px rgba(22,163,74,0.45)",
              transition: "all 0.25s" }}>
            {audioPlaying ? "⏸" : audioTermine ? "↺" : "▶"}
          </button>
          <div style={{ marginTop: 18, fontSize: 19, fontWeight: 700, color: "#14532D",
            textAlign: "center" }}>
            {audioPlaying ? "En cours d'écoute…"
              : audioTermine ? "Appuyez pour réécouter"
              : "Appuyez pour écouter"}
          </div>

          {/* Barre de progression audio */}
          {(audioPlaying || audioTermine || audioProgress > 0) && (
            <div style={{ width: "75%", height: 8, background: "#BBF7D0", borderRadius: 99, marginTop: 22 }}>
              <div style={{ width: `${audioProgress * 100}%`, height: "100%",
                background: "#16A34A", borderRadius: 99, transition: "width 0.25s" }} />
            </div>
          )}

          {contrib.texte && (
            <div style={{ fontSize: 18, color: "#15803D", marginTop: 24, lineHeight: 1.6,
              textAlign: "center", maxWidth: 300 }}>{contrib.texte}</div>
          )}
        </div>
      )}

      {/* ════════════════ MUSIQUE ════════════════ */}
      {contrib?.type === "musique" && (
        <div style={{ position: "absolute", inset: 0,
          background: "linear-gradient(145deg,#1e003a 0%,#3b0764 100%)",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          padding: "24px 32px", overflow: "hidden" }}>
          {["♪","♫","♩","♬","♪","♫","♩","♬"].map((n, i) => (
            <div key={i} style={{ position: "absolute", fontSize: 30,
              color: "rgba(255,255,255,0.1)",
              top: `${6 + i * 11}%`, left: `${4 + i * 13}%`,
              animation: `animNoteFlotante ${2.2 + i * 0.4}s ${i * 0.3}s ease-out infinite` }}>{n}</div>
          ))}

          {contrib.media && (
            <audio ref={audioRef} src={contrib.media}
              onPlay={() => setAudioPlaying(true)}
              onPause={() => setAudioPlaying(false)}
              onEnded={() => { setAudioPlaying(false); setAudioTermine(true); }}
              onTimeUpdate={() => audioRef.current?.duration &&
                setAudioProgress(audioRef.current.currentTime / audioRef.current.duration)} />
          )}

          <div style={{ fontSize: 88, marginBottom: 18 }}>🎵</div>
          <div style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 800,
            fontSize: 26, color: "#fff", marginBottom: 6, textAlign: "center" }}>
            {contrib.titre || "Une chanson pour vous"}
          </div>
          {contrib.artiste && (
            <div style={{ fontSize: 18, color: "rgba(255,255,255,0.7)", marginBottom: 22 }}>
              {contrib.artiste}
            </div>
          )}
          {contrib.texte && (
            <div style={{ fontSize: 17, color: "rgba(255,255,255,0.88)", lineHeight: 1.65,
              fontStyle: "italic", textAlign: "center", maxWidth: 320, marginBottom: 28 }}>
              « {contrib.texte} »
            </div>
          )}

          <button onClick={contrib.media ? toggleAudio : undefined}
            style={{ width: 100, height: 100, borderRadius: "50%", border: "none",
              background: audioPlaying ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.92)",
              color: audioPlaying ? "#fff" : "#3b0764",
              fontSize: 38, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: audioPlaying
                ? "0 0 0 14px rgba(192,132,252,0.2), 0 8px 32px rgba(0,0,0,0.4)"
                : "0 8px 32px rgba(0,0,0,0.4)",
              transition: "all 0.25s" }}>
            {audioPlaying ? "⏸" : audioTermine ? "↺" : "▶"}
          </button>
          <div style={{ marginTop: 16, fontSize: 17, fontWeight: 700,
            color: "rgba(255,255,255,0.8)", textAlign: "center" }}>
            {audioPlaying ? "En écoute…"
              : audioTermine ? "Appuyez pour réécouter"
              : "Appuyez pour écouter"}
          </div>
          {(audioPlaying || audioTermine || audioProgress > 0) && (
            <div style={{ width: "70%", height: 6, background: "rgba(255,255,255,0.2)",
              borderRadius: 99, marginTop: 18 }}>
              <div style={{ width: `${audioProgress * 100}%`, height: "100%",
                background: "#C084FC", borderRadius: 99, transition: "width 0.25s" }} />
            </div>
          )}
        </div>
      )}

      {/* ════════════════ QUESTION / PARI ════════════════ */}
      {(contrib?.type === "question" || contrib?.type === "pari") && (() => {
        let votes = {};
        try { const d = JSON.parse(contrib.question || "{}"); votes = d.votes || {}; } catch {}
        const parts = capsuleAffichee?.participants || [];
        return (
          <div style={{ position: "absolute", inset: 0,
            background: "linear-gradient(145deg,#0c2340 0%,#1a3a6e 100%)",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            padding: "24px 28px", overflowY: "auto" }}>
            <div style={{ fontSize: 68, marginBottom: 18 }}>🎯</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.5)",
              marginBottom: 14, letterSpacing: 2 }}>PARI</div>
            <div style={{ fontSize: 22, lineHeight: 1.7, color: "#fff", textAlign: "center",
              fontWeight: 700, maxWidth: 320, marginBottom: 24 }}>
              {contrib.texte}
            </div>
            {Object.keys(votes).length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
                {Object.entries(votes).map(([pid, v]) => {
                  const p = parts.find(x => x.id === pid);
                  return (
                    <div key={pid} style={{ background: "rgba(255,255,255,0.1)", borderRadius: 16,
                      padding: "13px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ width: 40, height: 40, borderRadius: "50%",
                        background: p?.couleur || "#FF8C5A", flexShrink: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 14, fontWeight: 800, color: "#fff" }}>
                        {initiales(p?.prenom)}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>{p?.prenom || "?"}</div>
                        {v.commentaire && <div style={{ color: "rgba(255,255,255,0.65)", fontSize: 14 }}>{v.commentaire}</div>}
                      </div>
                      <div style={{ fontSize: 26 }}>{v.vote === "gagne" ? "✅" : v.vote === "perdu" ? "❌" : "❓"}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* ════════════════ SECRET ════════════════ */}
      {contrib?.type === "secret" && (
        <div style={{ position: "absolute", inset: 0,
          background: "linear-gradient(145deg,#1a0533 0%,#2d0a5e 100%)",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          padding: "24px 32px" }}>
          <div style={{ fontSize: 80, marginBottom: 22,
            filter: "drop-shadow(0 0 24px rgba(200,150,255,0.55))" }}>🤫</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,0.5)",
            marginBottom: 22, letterSpacing: 2 }}>UN SECRET</div>
          <div style={{ fontSize: 24, lineHeight: 1.8, color: "#fff",
            fontFamily: "'Plus Jakarta Sans',sans-serif", fontStyle: "italic",
            fontWeight: 500, textAlign: "center", maxWidth: 340,
            background: "rgba(255,255,255,0.08)", borderRadius: 24, padding: "24px 28px" }}>
            « {contrib.texte} »
          </div>
        </div>
      )}

      {/* ════════════════ MÉTÉO ════════════════ */}
      {contrib?.type === "meteo" && (() => {
        let d = {}; try { d = JSON.parse(contrib.question || "{}"); } catch {}
        const bgs = { soleil:"linear-gradient(145deg,#FFFDE7,#FFE082)",
          nuages:"linear-gradient(145deg,#E3F2FD,#90CAF9)",
          pluie:"linear-gradient(145deg,#BBDEFB,#64B5F6)",
          orage:"linear-gradient(145deg,#B0BEC5,#78909C)",
          neige:"linear-gradient(145deg,#E3F2FD,#B3E5FC)",
          brume:"linear-gradient(145deg,#ECEFF1,#CFD8DC)" };
        const emojis = { soleil:"☀️", nuages:"⛅", pluie:"🌧️", orage:"⛈️", neige:"❄️", brume:"🌫️" };
        const textDark = ["orage","brume","nuages"].includes(d.cle);
        const tc = textDark ? "#1a2a3a" : "#2E2230";
        return (
          <div style={{ position: "absolute", inset: 0,
            background: bgs[d.cle] || "linear-gradient(145deg,#BBDEFB,#90CAF9)",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            padding: "16px 28px", overflowY: "auto" }}>
            <div style={{ fontSize: 80, marginBottom: 6,
              filter: "drop-shadow(0 4px 20px rgba(0,0,0,0.12))" }}>
              {emojis[d.cle] || "🌤"}
            </div>
            <div style={{ fontSize: 60, fontWeight: 900, color: tc, lineHeight: 1, marginBottom: 6 }}>
              {d.temp || "--"}°C
            </div>
            {(d.lieu || d.date) && (
              <div style={{ fontSize: 15, color: tc, opacity: 0.65, marginBottom: 14 }}>
                {d.lieu}{d.lieu && d.date ? " · " : ""}{d.date}
              </div>
            )}
            {d.commentaire && (
              <div style={{ background: "rgba(255,255,255,0.6)", borderRadius: 20,
                padding: "14px 20px", fontSize: 17, fontStyle: "italic",
                color: tc, lineHeight: 1.65, textAlign: "center", maxWidth: 320 }}>
                « {d.commentaire} »
              </div>
            )}
          </div>
        );
      })()}

      {/* ════════════════ CHANSON ════════════════ */}
      {contrib?.type === "chanson" && (() => {
        const d = chansonData || {};
        return (
          <div style={{ position: "absolute", inset: 0,
            background: "linear-gradient(145deg,#1e003a 0%,#3b0764 100%)",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            padding: "20px 32px", overflow: "hidden" }}>
            {audioSrcChanson && (
              <audio ref={audioRef} src={audioSrcChanson}
                onPlay={() => setAudioPlaying(true)}
                onPause={() => setAudioPlaying(false)}
                onEnded={() => { setAudioPlaying(false); setAudioTermine(true); }}
                onTimeUpdate={() => audioRef.current?.duration &&
                  setAudioProgress(audioRef.current.currentTime / audioRef.current.duration)} />
            )}
            {["♪","♫","♩","♬","♪","♫"].map((n, i) => (
              <div key={i} style={{ position: "absolute", fontSize: 30,
                color: "rgba(255,255,255,0.09)",
                top: `${6 + i * 14}%`, left: `${4 + i * 17}%`,
                animation: `animNoteFlotante ${2.2 + i * 0.4}s ${i * 0.3}s ease-out infinite` }}>{n}</div>
            ))}
            {/* Hint "écouter" — visible uniquement avant le premier lancement */}
            {audioSrcChanson && !audioPlaying && !audioTermine && (
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 14,
                background: "rgba(192,132,252,0.18)", border: "1px solid rgba(192,132,252,0.35)",
                borderRadius: 999, padding: "8px 18px", animation: "pulseCercle 2s ease-in-out infinite" }}>
                <span style={{ fontSize: 15 }}>▶</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#E9D5FF", letterSpacing: 0.3 }}>
                  Touchez la pochette pour écouter
                </span>
              </div>
            )}
            {/* Pochette cliquable pour lancer / arrêter la musique */}
            <button onClick={audioSrcChanson ? toggleAudio : undefined}
              style={{ background: "none", border: "none", cursor: audioSrcChanson ? "pointer" : "default",
                padding: 0, position: "relative", marginBottom: 18 }}>
              {d.pochette
                ? <img src={d.pochette} alt="pochette"
                    style={{ width: 160, height: 160, borderRadius: 22, objectFit: "cover", display: "block",
                      boxShadow: `0 12px 44px rgba(0,0,0,0.55)${audioPlaying ? ", 0 0 0 4px rgba(192,132,252,0.5)" : ""}`,
                      transition: "box-shadow 0.3s" }} />
                : <div style={{ width: 160, height: 160, borderRadius: 22,
                    background: "rgba(255,255,255,0.08)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 80, boxShadow: "0 12px 44px rgba(0,0,0,0.55)" }}>🎵</div>
              }
              <div style={{ position: "absolute", inset: 0, borderRadius: 22,
                background: audioPlaying ? "rgba(0,0,0,0.12)" : "rgba(0,0,0,0.32)",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "background 0.25s" }}>
                <span style={{ fontSize: 44, filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.7))" }}>
                  {audioPlaying ? "⏸" : audioTermine ? "↺" : "▶"}
                </span>
              </div>
            </button>
            <div style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 800,
              fontSize: 24, color: "#fff", marginBottom: 4, textAlign: "center" }}>
              {d.titre || "Une chanson pour vous"}
            </div>
            {d.artiste && (
              <div style={{ fontSize: 17, color: "rgba(255,255,255,0.7)", marginBottom: 10 }}>
                {d.artiste}
              </div>
            )}
            {contrib.texte && (
              <div style={{ fontSize: 16, color: "rgba(255,255,255,0.85)", lineHeight: 1.6,
                fontStyle: "italic", textAlign: "center", maxWidth: 300, marginBottom: 14 }}>
                « {contrib.texte} »
              </div>
            )}
            {(audioPlaying || audioTermine || audioProgress > 0) && (
              <div style={{ width: "70%", height: 5, background: "rgba(255,255,255,0.2)",
                borderRadius: 99, marginBottom: 16 }}>
                <div style={{ width: `${audioProgress * 100}%`, height: "100%",
                  background: "#C084FC", borderRadius: 99, transition: "width 0.25s" }} />
              </div>
            )}
            {d.paroles && (
              <button onClick={() => setParolesModal(true)}
                style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.22)",
                  borderRadius: 999, padding: "11px 28px", fontSize: 16, fontWeight: 700,
                  color: "#fff", cursor: "pointer" }}>
                📖 Voir les paroles
              </button>
            )}
          </div>
        );
      })()}

      </div>{/* fin zone contenu */}

      {/* ════════════════ BARRE BASSE solide ════════════════ */}
      <div style={{ flexShrink: 0, background: "#0e0e0e", padding: "12px 16px 30px" }}>
        {["photo","video","dessin"].includes(contrib?.type) && contrib?.texte && (
          <div style={{ fontSize: 15, color: "#ccc", lineHeight: 1.5, marginBottom: 10 }}>
            {contrib.texte}
          </div>
        )}
        <div style={{ display: "flex", gap: 12 }}>
          <button disabled={index === 0} onClick={allerPrecedent}
            style={{ flex: 1, padding: "18px 0", fontSize: 17, fontWeight: 800,
              borderRadius: 20, border: "none",
              background: index === 0 ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.14)",
              color: index === 0 ? "rgba(255,255,255,0.25)" : "#fff",
              cursor: index === 0 ? "default" : "pointer" }}>
            ← Précédent
          </button>
          <button
            onClick={index < total - 1
              ? allerSuivant
              : () => { if (onTerminer) onTerminer(); else setPhase("accueil"); }}
            style={{ flex: 2, padding: "18px 0", fontSize: 18, fontWeight: 800,
              borderRadius: 20, border: "none",
              background: "linear-gradient(135deg,#FF8C5A 0%,#FF5A20 100%)",
              color: "#fff", boxShadow: "0 8px 24px rgba(255,90,32,0.4)", cursor: "pointer" }}>
            {index < total - 1 ? "Suivant →" : "✓ Terminé"}
          </button>
        </div>
      </div>

      {/* ════════════════ MODAL ZOOM PHOTO / DESSIN ════════════════ */}
      {zoomPhoto && contrib?.media && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200,
          background: "rgba(0,0,0,0.97)",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}
          onClick={() => setZoomPhoto(false)}>
          <img src={contrib.media} alt="Zoom"
            style={{ maxWidth: "100%", maxHeight: "82vh", objectFit: "contain", borderRadius: 6 }} />
          <button onClick={() => setZoomPhoto(false)}
            style={{ marginTop: 28, background: "rgba(255,255,255,0.16)", border: "none",
              color: "#fff", fontSize: 18, fontWeight: 700, borderRadius: 999,
              padding: "16px 44px", cursor: "pointer", backdropFilter: "blur(8px)" }}>
            ✕ Fermer
          </button>
        </div>
      )}

      {/* ════════════════ MODAL PAROLES ════════════════ */}
      {parolesModal && chansonData?.paroles && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200,
          background: "rgba(14,0,28,0.97)", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "52px 20px 12px", display: "flex", alignItems: "center",
            justifyContent: "space-between", flexShrink: 0 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 19, color: "#fff" }}>
                {chansonData.titre || "Paroles"}
              </div>
              {chansonData.artiste && (
                <div style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", marginTop: 2 }}>
                  {chansonData.artiste}
                </div>
              )}
            </div>
            <button onClick={() => setParolesModal(false)}
              style={{ background: "rgba(255,255,255,0.12)", border: "none", borderRadius: 999,
                padding: "10px 18px", fontSize: 15, fontWeight: 700, color: "#fff", cursor: "pointer" }}>
              ✕
            </button>
          </div>
          {audioPlaying && (
            <div style={{ display: "flex", gap: 4, alignItems: "center", justifyContent: "center",
              paddingBottom: 10, flexShrink: 0 }}>
              {[0.5,0.8,1,0.6,0.9,0.5,0.75,0.4,0.85,0.55].map((h, i) => (
                <div key={i} style={{ width: 4, borderRadius: 99, background: "#C084FC",
                  height: `${h * 28}px`,
                  animation: `pulseCercle ${0.7 + (i % 4) * 0.2}s ${i * 0.06}s ease-in-out infinite` }} />
              ))}
            </div>
          )}
          <div style={{ flex: 1, overflowY: "auto", padding: "8px 28px 48px" }}>
            <div style={{ fontSize: 18, color: "rgba(255,255,255,0.88)", lineHeight: 2.0,
              textAlign: "center", whiteSpace: "pre-line", fontStyle: "italic" }}>
              {chansonData.paroles}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
//  ÉCRAN APERÇU PAPY — prévisualisation avec 5 types de souvenirs animés.
// ============================================================================
// ============================================================================
//  ÉCRAN SUCCÈS PACK MAMIE/PAPY — formulaire de création post-paiement
// ============================================================================
function EcranSuccesPapy({ creerCapsule, allerVers }) {
  const [nom, setNom]               = useState("");
  const [couverture, setCouverture]           = useState(null);
  const [preview, setPreview]               = useState(null);
  const [srcRecadrageCouv, setSrcRecadrageCouv] = useState(null);
  const [enCours, setEnCours]               = useState(false);

  // Génère les 12 prochains mois disponibles (minimum : dans 2 mois)
  const MOIS_NOMS = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
  const moisDisponibles = React.useMemo(() => {
    const opts = [];
    const base = new Date();
    base.setDate(1);
    base.setHours(0, 0, 0, 0);
    // minimum = mois courant + 2 (au moins 1 mois entier de contributions avant ouverture)
    base.setMonth(base.getMonth() + 2);
    for (let i = 0; i < 12; i++) {
      const d = new Date(base);
      d.setMonth(base.getMonth() + i);
      opts.push({
        label: `${MOIS_NOMS[d.getMonth()]} ${d.getFullYear()}`,
        mois:  d.getMonth(),
        annee: d.getFullYear(),
        iso:   `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`,
      });
    }
    return opts;
  }, []);

  const [moisIdx, setMoisIdx] = useState(0);
  const moisOuverture = moisDisponibles[moisIdx];

  // Mois de contribution = ouverture - 1 mois
  const moisContrib = React.useMemo(() => {
    const d = new Date(moisOuverture.iso);
    d.setMonth(d.getMonth() - 1);
    return `${MOIS_NOMS[d.getMonth()]} ${d.getFullYear()}`;
  }, [moisOuverture]);

  function onPhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = ev => setSrcRecadrageCouv(ev.target.result);
    r.readAsDataURL(file);
  }

  async function valider() {
    if (!nom.trim()) return;
    setEnCours(true);
    try {
      await creerCapsule({
        nom: nom.trim(), type: "retraite",
        dateOuverture: moisOuverture.iso,
        couverture: couverture || null,
        formule: "papy",
        ecranSucces: "papy",
      });
    } catch (e) {
      alert("Erreur : " + e.message);
      setEnCours(false);
    }
  }

  return (
    <div style={S.ecran}>
      {srcRecadrageCouv && (
        <RecadreurCouverture
          src={srcRecadrageCouv}
          onValider={b64 => { setCouverture(b64); setPreview(b64); setSrcRecadrageCouv(null); }}
          onAnnuler={() => setSrcRecadrageCouv(null)}
        />
      )}

      {/* ── Bandeau principal ── */}
      <div style={{ background:"linear-gradient(135deg,#C25A20,#FF8C5A)",
        borderRadius:20, padding:"16px 16px 14px", marginBottom:16, flexShrink:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
          <div style={{ fontSize:32, lineHeight:1 }}>👴</div>
          <div>
            <div style={{ fontFamily:"'Bricolage Grotesque',sans-serif", fontWeight:800,
              fontSize:16, color:"#fff" }}>Pack Mamie / Papy activé !</div>
            <div style={{ fontSize:11, color:"rgba(255,240,220,.85)", marginTop:1,
              fontFamily:"'Plus Jakarta Sans',sans-serif" }}>Capsule mensuelle · renouvellement automatique</div>
          </div>
        </div>
        <div style={{ display:"flex", gap:7, flexWrap:"wrap" }}>
          {["📷 30 photos","🎬 4 vidéos","🎤 4 vocaux","👥 Membres illimités"].map(f => (
            <div key={f} style={{ background:"rgba(255,255,255,.2)", borderRadius:10,
              padding:"4px 9px", fontSize:11, color:"#fff", fontWeight:600, whiteSpace:"nowrap" }}>
              {f}
            </div>
          ))}
        </div>
      </div>

      {/* ── 1. Prénom de Mamie/Papy ── */}
      <label style={S.label}>Prénom de Mamie / Papy</label>
      <input style={{ ...S.input, marginBottom:14 }} placeholder="Ex. Capsule de Mamie Joëlle"
        value={nom} onChange={e => setNom(e.target.value)} autoFocus />

      {/* ── 2. Première ouverture ── */}
      <label style={S.label}>Première ouverture par Mamie / Papy</label>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
        <button onClick={() => setMoisIdx(i => Math.max(0, i - 1))}
          disabled={moisIdx === 0}
          style={{ flexShrink:0, width:40, height:40, borderRadius:12,
            border:"1.5px solid rgba(255,140,90,.4)", background:"#fff",
            fontSize:20, color: moisIdx === 0 ? "rgba(255,140,90,.3)" : "#C25A20",
            cursor: moisIdx === 0 ? "default" : "pointer",
            fontFamily:"sans-serif", lineHeight:1, padding:0 }}>‹</button>
        <div style={{ flex:1, textAlign:"center", padding:"10px 12px", borderRadius:16,
          border:"2px solid #FF5A20",
          background:"linear-gradient(135deg,#FFF5EC,#FFF0E6)" }}>
          <div style={{ fontWeight:800, fontSize:16, color:"#C25A20",
            fontFamily:"'Bricolage Grotesque',sans-serif" }}>
            {moisOuverture.label}
          </div>
          <div style={{ fontSize:11, color:"#A07850", marginTop:2 }}>
            Ouverture le 1er {moisOuverture.label}
          </div>
        </div>
        <button onClick={() => setMoisIdx(i => Math.min(moisDisponibles.length - 1, i + 1))}
          disabled={moisIdx === moisDisponibles.length - 1}
          style={{ flexShrink:0, width:40, height:40, borderRadius:12,
            border:"1.5px solid rgba(255,140,90,.4)", background:"#fff",
            fontSize:20, color: moisIdx === moisDisponibles.length-1 ? "rgba(255,140,90,.3)" : "#C25A20",
            cursor: moisIdx === moisDisponibles.length-1 ? "default" : "pointer",
            fontFamily:"sans-serif", lineHeight:1, padding:0 }}>›</button>
      </div>

      {/* ── 3. Récapitulatif dynamique ── */}
      <div style={{ background:"#FFF5EC", border:"1.5px solid rgba(255,140,90,.35)",
        borderRadius:16, padding:"11px 13px", marginBottom:16 }}>
        <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <span style={{ fontSize:16, width:24, textAlign:"center", flexShrink:0 }}>💳</span>
            <div style={{ fontSize:12, color:"#5C3A1E" }}>
              <strong>Prélèvement · 1er {moisContrib}</strong>
              <span style={{ color:"#A07850" }}> — les membres déposent leurs souvenirs</span>
            </div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <span style={{ fontSize:16, width:24, textAlign:"center", flexShrink:0 }}>👴</span>
            <div style={{ fontSize:12, color:"#5C3A1E" }}>
              <strong>Mamie/Papy découvre · 1er {moisOuverture.label}</strong>
              <span style={{ color:"#A07850" }}> — reçoit son lien, voit tout</span>
            </div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <span style={{ fontSize:14, width:24, textAlign:"center", flexShrink:0 }}>🔄</span>
            <div style={{ fontSize:11, color:"#A07850", fontStyle:"italic" }}>
              Puis cycle automatique chaque mois — résiliable à tout moment
            </div>
          </div>
        </div>
      </div>

      {/* ── 4. Photo de couverture (optionnelle) ── */}
      <label style={S.label}>
        Photo de couverture
        <span style={{ color:COULEURS.doux, fontWeight:500 }}> (optionnelle)</span>
      </label>
      <label style={{ display:"block", cursor:"pointer", marginBottom:20 }}>
        <input type="file" accept="image/*" onChange={onPhoto} style={{ display:"none" }} />
        <div style={{ borderRadius:16, overflow:"hidden",
          background: preview ? "none" : "#FFF5EC",
          border: preview ? "2px solid #FF8C5A" : "2px dashed rgba(255,140,90,.4)",
          height: preview ? "auto" : 64,
          display:"flex", alignItems:"center", justifyContent:"center",
          position:"relative", transition:"border .15s" }}>
          {preview
            ? <img src={preview} alt="couverture"
                style={{ width:"100%", maxHeight:120, objectFit:"cover", borderRadius:14, display:"block" }} />
            : <div style={{ display:"flex", alignItems:"center", gap:8, color:"rgba(255,140,90,.8)" }}>
                <span style={{ fontSize:20 }}>🖼️</span>
                <span style={{ fontSize:13, fontWeight:600 }}>Ajouter une photo</span>
              </div>
          }
          {preview && (
            <div style={{ position:"absolute", bottom:8, right:10,
              background:"rgba(0,0,0,.45)", borderRadius:8,
              padding:"3px 10px", fontSize:11, color:"#fff", fontWeight:600 }}>
              Changer ✎
            </div>
          )}
        </div>
      </label>

      {/* ── Bouton créer ── */}
      <button
        style={{ ...S.boutonPrincipal, ...(!nom.trim() || enCours ? S.boutonDesactive : {}),
          background: nom.trim() ? "linear-gradient(135deg,#C25A20,#FF8C5A)" : undefined }}
        disabled={!nom.trim() || enCours}
        onClick={valider}>
        {enCours ? "Création en cours…" : "✨ Ouvrir l'espace souvenirs →"}
      </button>
    </div>
  );
}

// ============================================================================
//  ONGLET PAPY / MAMIE — hub mensuel : setup, capsule en cours, mois précédents
// ============================================================================
function EcranPapy({ capsules, moi, allerVers, creerCapsule, modifierNom, modifierCouverture, supprimerCapsule }) {
  const now = new Date();

  const papyCapsules = capsules
    .filter(c =>
      c.formule === "papy" &&
      (c.createurId === moi?.id || c.participants.some(p => p.userId === moi?.id))
    )
    .sort((a, b) =>
      new Date(b.dateOuverture || b.dateCreation || 0) -
      new Date(a.dateOuverture || a.dateCreation || 0)
    );

  // Pas encore de capsule papy → formulaire de setup inline
  if (papyCapsules.length === 0) {
    return <EcranSuccesPapy creerCapsule={creerCapsule} allerVers={allerVers} />;
  }

  const capsuleActuelle = papyCapsules[0];
  const moisPrecedents  = papyCapsules.slice(1);
  const estCreateur     = capsuleActuelle.createurId === moi?.id;
  const nbContribs      = capsuleActuelle.contributions?.length || 0;
  const totalContribs   = papyCapsules.reduce((sum, c) => sum + (c.contributions?.length || 0), 0);
  const dateOuv         = capsuleActuelle.dateOuverture ? new Date(capsuleActuelle.dateOuverture) : null;
  const enCours         = !dateOuv || dateOuv > now;
  const joursJ          = dateOuv ? Math.ceil((dateOuv - now) / 86400000) : null;

  const [editionNom, setEditionNom]         = useState(false);
  const [nouveauNom, setNouveauNom]         = useState(capsuleActuelle.nom);
  const [srcRecadrageCouv, setSrcRecadrageCouv] = useState(null);
  const [confirmSuppression, setConfirmSuppression] = useState(false);

  return (
    <div style={{ ...S.ecran, padding: "0 0 96px" }}>
      {srcRecadrageCouv && (
        <RecadreurCouverture
          src={srcRecadrageCouv}
          onValider={b64 => { modifierCouverture(capsuleActuelle.id, b64); setSrcRecadrageCouv(null); }}
          onAnnuler={() => setSrcRecadrageCouv(null)}
        />
      )}

      {/* ── Hero : photo de couverture (pleine largeur, 210px) ── */}
      <div style={{ position: "relative", height: 210, flexShrink: 0, marginBottom: 16 }}>
        {capsuleActuelle.couverture ? (
          <img src={capsuleActuelle.couverture} alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block",
              borderRadius: "0 0 28px 28px" }} />
        ) : (
          <div style={{ width: "100%", height: "100%",
            background: "linear-gradient(135deg,#C25A20 0%,#FF8C5A 60%,#FFB37A 100%)",
            borderRadius: "0 0 28px 28px",
            display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 72, opacity: .3 }}>👴</span>
          </div>
        )}
        {/* Dégradé fondu vers le bas */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 120,
          background: "linear-gradient(to top, rgba(150,60,10,.82) 0%, transparent 100%)",
          borderRadius: "0 0 28px 28px" }} />
        {/* Titre par-dessus */}
        <div style={{ position: "absolute", bottom: 18, left: 20, right: 20 }}>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,.75)",
            letterSpacing: ".06em", textTransform: "uppercase" }}>Espace souvenirs</p>
          {editionNom ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
              <input value={nouveauNom} onChange={e => setNouveauNom(e.target.value)}
                style={{ flex: 1, background: "rgba(255,255,255,.2)",
                  border: "1.5px solid rgba(255,255,255,.5)", borderRadius: 10,
                  padding: "6px 10px", fontSize: 18, color: "#fff", fontWeight: 700, outline: "none" }} />
              <button onClick={() => { modifierNom(capsuleActuelle.id, nouveauNom); setEditionNom(false); }}
                style={{ background: "rgba(255,255,255,.3)", border: "none", borderRadius: 8,
                  padding: "6px 12px", color: "#fff", fontWeight: 700, cursor: "pointer" }}>✓</button>
              <button onClick={() => { setNouveauNom(capsuleActuelle.nom); setEditionNom(false); }}
                style={{ background: "rgba(255,255,255,.15)", border: "none", borderRadius: 8,
                  padding: "6px 12px", color: "#fff", cursor: "pointer" }}>✕</button>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3 }}>
              <h1 style={{ margin: 0, fontFamily: "'Bricolage Grotesque',sans-serif",
                fontSize: 28, fontWeight: 800, color: "#fff", letterSpacing: "-.02em", flex: 1 }}>
                👴 {capsuleActuelle.nom}
              </h1>
              {estCreateur && (
                <button onClick={() => setEditionNom(true)}
                  style={{ background: "rgba(255,255,255,.2)", border: "none", borderRadius: 8,
                    padding: "5px 10px", color: "#fff", fontSize: 14, cursor: "pointer" }}>
                  ✏️
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Contenu scrollable sous la photo ── */}
      <div style={{ padding: "0 20px" }}>

        {/* Statut + compte à rebours */}
        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          <div style={{ background: enCours ? "#FFF5EC" : "#ECFDF5",
            border: `1.5px solid ${enCours ? "rgba(255,140,90,.5)" : "rgba(16,185,129,.4)"}`,
            borderRadius: 10, padding: "5px 12px", fontSize: 12, fontWeight: 700,
            color: enCours ? "#C25A20" : "#059669" }}>
            {enCours ? "📝 En cours de contributions" : "✅ Prête à découvrir"}
          </div>
          {joursJ !== null && joursJ > 0 && (
            <div style={{ background: "#FFF5EC", border: "1.5px solid rgba(255,140,90,.4)",
              borderRadius: 10, padding: "5px 12px", fontSize: 12, fontWeight: 700, color: "#C25A20" }}>
              J−{joursJ} avant l'ouverture
            </div>
          )}
        </div>

        {/* Total depuis le début */}
        <div style={{ background: "linear-gradient(135deg,#FFF5EC,#FFF0E6)",
          border: "2px solid rgba(255,140,90,.4)", borderRadius: 18,
          padding: "14px 16px", marginBottom: 14,
          display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#A07850",
              textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 4 }}>
              Total depuis le début
            </div>
            <div style={{ fontSize: 28, fontWeight: 900, color: "#C25A20",
              fontFamily: "'Bricolage Grotesque',sans-serif", lineHeight: 1 }}>
              {totalContribs}
              <span style={{ fontSize: 14, fontWeight: 600, color: "#A07850", marginLeft: 7 }}>
                souvenir{totalContribs !== 1 ? "s" : ""} partagés
              </span>
            </div>
            <div style={{ fontSize: 12, color: "#A07850", marginTop: 4 }}>
              {nbContribs} ce mois · {papyCapsules.length} capsule{papyCapsules.length > 1 ? "s" : ""}
            </div>
          </div>
          <div style={{ fontSize: 34 }}>🏅</div>
        </div>

        {/* Bouton Contribuer */}
        <button
          onClick={() => allerVers("contribution", capsuleActuelle.id)}
          style={{ ...S.boutonPrincipal,
            background: "linear-gradient(135deg,#C25A20,#FF8C5A)",
            boxShadow: "0 6px 20px rgba(194,90,32,.35)",
            marginBottom: 12, fontSize: 16, padding: "15px 20px",
            fontFamily: "'Bricolage Grotesque',sans-serif" }}>
          ✍️ Contribuer à la capsule du mois →
        </button>

        {/* Inviter des proches */}
        {estCreateur && (
          <button style={{ ...S.boutonSecondaire, marginBottom: 18, marginTop: 0 }}
            onClick={() => allerVers("inviter", capsuleActuelle.id)}>
            👥 Inviter des proches à contribuer
          </button>
        )}

        {/* Mois précédents */}
        {moisPrecedents.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: COULEURS.doux,
              letterSpacing: ".04em", textTransform: "uppercase", marginBottom: 10 }}>
              📅 Mois précédents
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {moisPrecedents.map(c => {
                const nb = c.contributions?.length || 0;
                const dateMois = (c.dateOuverture || c.dateCreation)
                  ? new Date(c.dateOuverture || c.dateCreation).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
                  : "";
                const hasPhoto = c.contributions?.find(ct => ct.type === "photo" && ct.media);
                return (
                  <button key={c.id} onClick={() => allerVers("detail", c.id)}
                    style={{ display: "flex", alignItems: "center", gap: 12,
                      background: "var(--carte-bg)", border: "none", borderRadius: 18,
                      padding: "12px 14px", cursor: "pointer", width: "100%", textAlign: "left",
                      boxShadow: "0 4px 14px rgba(46,34,48,.07)" }}>
                    <div style={{ width: 48, height: 48, borderRadius: 12, flexShrink: 0,
                      overflow: "hidden",
                      background: hasPhoto ? "none" : "linear-gradient(135deg,#FFE4CC,#FFB37A)",
                      display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {hasPhoto
                        ? <img src={hasPhoto.media} alt=""
                            style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        : <span style={{ fontSize: 22 }}>📅</span>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: COULEURS.encre,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.nom}
                      </div>
                      <div style={{ fontSize: 12, color: COULEURS.doux, marginTop: 2 }}>
                        {nb} souvenir{nb !== 1 ? "s" : ""}{dateMois ? ` · ${dateMois}` : ""}
                      </div>
                    </div>
                    <span style={{ fontSize: 18, color: "#FF8C5A", flexShrink: 0 }}>→</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Paramètres (créateur seulement) */}
        {estCreateur && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: COULEURS.doux,
              letterSpacing: ".04em", textTransform: "uppercase", marginBottom: 10 }}>
              ⚙️ Paramètres
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                background: "var(--carte-bg)", borderRadius: 16, padding: "14px 16px",
                cursor: "pointer", boxShadow: "0 2px 8px rgba(46,34,48,.05)" }}>
                <input type="file" accept="image/*" style={{ display: "none" }}
                  onChange={e => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = ev => setSrcRecadrageCouv(ev.target.result); r.readAsDataURL(f); }} />
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: 20 }}>🖼️</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: COULEURS.encre }}>Photo de couverture</div>
                    <div style={{ fontSize: 12, color: COULEURS.doux }}>Modifier la photo principale</div>
                  </div>
                </div>
                <span style={{ fontSize: 18, color: COULEURS.doux }}>›</span>
              </label>
              <button onClick={() => allerVers("abonnement")}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                  background: "var(--carte-bg)", borderRadius: 16, padding: "14px 16px",
                  border: "none", cursor: "pointer", width: "100%",
                  boxShadow: "0 2px 8px rgba(46,34,48,.05)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: 20 }}>💳</span>
                  <div style={{ textAlign: "left" }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: COULEURS.encre }}>Gérer l'abonnement</div>
                    <div style={{ fontSize: 12, color: COULEURS.doux }}>Renouvellement automatique · résiliable</div>
                  </div>
                </div>
                <span style={{ fontSize: 18, color: COULEURS.doux }}>›</span>
              </button>
            </div>
          </div>
        )}

        {/* Suppression — créateur uniquement */}
        {estCreateur && supprimerCapsule && (
          <div style={{ marginTop: 24, paddingTop: 16, borderTop: `1px solid ${COULEURS.bordure}` }}>
            {!confirmSuppression ? (
              <button
                onClick={() => setConfirmSuppression(true)}
                style={{ background: "none", border: "none", color: COULEURS.doux, fontSize: 12,
                  cursor: "pointer", padding: "4px 0", fontFamily: "'Plus Jakarta Sans', sans-serif",
                  opacity: 0.6, textDecoration: "underline" }}>
                🗑️ Supprimer cette capsule
              </button>
            ) : (
              <div style={{ background: "#FFF1F1", borderRadius: 14, padding: "14px 16px",
                border: "1px solid #FECACA" }}>
                <p style={{ margin: "0 0 12px", fontSize: 13, color: "#7F1D1D", fontWeight: 600,
                  fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                  Supprimer « {capsuleActuelle.nom} » ? Tous les souvenirs seront perdus définitivement.
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => { supprimerCapsule(capsuleActuelle.id); allerVers("capsules"); }}
                    style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "none",
                      background: "#DC2626", color: "#fff", fontWeight: 700, fontSize: 13,
                      cursor: "pointer", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                    Oui, supprimer
                  </button>
                  <button
                    onClick={() => setConfirmSuppression(false)}
                    style={{ flex: 1, padding: "10px 0", borderRadius: 10,
                      border: `1px solid ${COULEURS.bordure}`, background: "none",
                      color: COULEURS.doux, fontWeight: 600, fontSize: 13,
                      cursor: "pointer", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                    Annuler
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

// ============================================================================
//  ÉCRAN TARIFS IMPRESSION — album papier : mensuel, trimestriel, semestriel, annuel
// ============================================================================
function EcranTarifsImpression({ capsule, allerVers }) {
  const OFFRES = [
    {
      id: "mensuel",
      label: "Tous les mois",
      icone: "📅",
      prix: "9,99€",
      unite: "/mois",
      pages: "~20 pages",
      detail: "Un album compact chaque mois — idéal pour suivre l'évolution au fil du temps.",
      economie: null,
      populaire: true,
    },
    {
      id: "trimestriel",
      label: "Tous les 3 mois",
      icone: "🗓️",
      prix: "24,99€",
      unite: "/trimestre",
      pages: "~60 pages",
      detail: "Un album saisonnier riche, réunissant 3 mois de souvenirs.",
      economie: "Économisez 5€ vs mensuel",
      populaire: false,
    },
    {
      id: "semestriel",
      label: "Tous les 6 mois",
      icone: "📆",
      prix: "44,99€",
      unite: "/semestre",
      pages: "~120 pages",
      detail: "Un beau volume à partager en famille à chaque demi-année.",
      economie: "Économisez 15€ vs mensuel",
      populaire: false,
    },
    {
      id: "annuel",
      label: "Une fois par an",
      icone: "🎁",
      prix: "79,99€",
      unite: "/an",
      pages: "~240 pages",
      detail: "Le grand album annuel — un cadeau exceptionnel à offrir ou conserver.",
      economie: "Économisez 40€ vs mensuel",
      populaire: false,
    },
  ];

  return (
    <div style={S.ecran}>
      <EnTeteRetour titre="Album papier" onRetour={() => allerVers("detail", capsule?.id)} />

      {/* Hero */}
      <div style={{ background: "linear-gradient(135deg,#3730a3,#6d28d9)", borderRadius: 20,
        padding: "20px 18px", marginBottom: 20, textAlign: "center" }}>
        <div style={{ fontSize: 36, marginBottom: 8 }}>📖</div>
        <div style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 800,
          fontSize: 18, color: "#fff", marginBottom: 6 }}>
          Transformez vos souvenirs en album
        </div>
        <div style={{ fontSize: 12, color: "rgba(196,181,253,.9)", lineHeight: 1.5 }}>
          Impression professionnelle · Papier haute qualité · Livraison incluse
        </div>
      </div>

      {/* Offres */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {OFFRES.map(o => (
          <div key={o.id}
            style={{ background: "var(--carte-bg)", borderRadius: 18,
              border: o.populaire ? "2px solid #6d28d9" : `1px solid ${COULEURS.bordure}`,
              boxShadow: o.populaire ? "0 4px 20px rgba(109,40,217,.18)" : "0 2px 10px rgba(46,34,48,.06)",
              overflow: "hidden" }}>
            {o.populaire && (
              <div style={{ background: "linear-gradient(135deg,#3730a3,#6d28d9)",
                textAlign: "center", padding: "5px 0",
                fontSize: 11, fontWeight: 800, color: "#fff", letterSpacing: ".05em" }}>
                ⭐ LE PLUS POPULAIRE
              </div>
            )}
            <div style={{ padding: "14px 16px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 22 }}>{o.icone}</span>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 14, color: COULEURS.encre }}>{o.label}</div>
                    <div style={{ fontSize: 11, color: COULEURS.doux, marginTop: 1 }}>{o.pages}</div>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <span style={{ fontFamily: "'Bricolage Grotesque',sans-serif",
                    fontWeight: 900, fontSize: 20, color: o.populaire ? "#6d28d9" : COULEURS.encre }}>
                    {o.prix}
                  </span>
                  <span style={{ fontSize: 11, color: COULEURS.doux }}>{o.unite}</span>
                </div>
              </div>
              <p style={{ fontSize: 12, color: COULEURS.doux, margin: "0 0 10px", lineHeight: 1.5 }}>
                {o.detail}
              </p>
              {o.economie && (
                <div style={{ fontSize: 11, fontWeight: 700, color: "#16a34a",
                  background: "#dcfce7", borderRadius: 8, padding: "3px 10px",
                  display: "inline-block", marginBottom: 10 }}>
                  🎉 {o.economie}
                </div>
              )}
              <button
                style={{ width: "100%", padding: "11px 0", borderRadius: 13, border: "none",
                  background: o.populaire
                    ? "linear-gradient(135deg,#3730a3,#6d28d9)"
                    : "rgba(109,40,217,.08)",
                  color: o.populaire ? "#fff" : "#6d28d9",
                  fontWeight: 800, fontSize: 13, cursor: "pointer",
                  fontFamily: "'Plus Jakarta Sans',sans-serif" }}
                onClick={() => alert("Commande bientôt disponible — fonctionnalité en cours d'intégration.")}>
                Commander {o.label.toLowerCase()} →
              </button>
            </div>
          </div>
        ))}
      </div>

      <p style={{ textAlign: "center", fontSize: 11, color: COULEURS.doux,
        margin: "18px 0 0", lineHeight: 1.6 }}>
        📦 Livraison sous 5–7 jours ouvrés · Résiliable à tout moment
      </p>
    </div>
  );
}

// ============================================================================
//  ÉCRAN CHOIX RÔLE PAPY — "Qui êtes-vous ?" avant d'accéder à la capsule
// ============================================================================
function EcranChoixRolePapy({ capsule, allerVers }) {
  return (
    <div style={S.ecran}>
      <EnTeteRetour titre="" onRetour={() => allerVers("detail", capsule?.id)} />

      {/* Hero */}
      <div style={{ textAlign: "center", padding: "10px 0 24px" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>👴👵</div>
        <div style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 800,
          fontSize: 22, color: COULEURS.encre, marginBottom: 8 }}>
          Bienvenue !
        </div>
        <div style={{ fontSize: 14, color: COULEURS.doux, lineHeight: 1.6, maxWidth: 280, margin: "0 auto" }}>
          Comment souhaitez-vous accéder à la capsule <strong>{capsule?.nom}</strong> ?
        </div>
      </div>

      {/* Choix Mamie/Papy */}
      <button onClick={() => allerVers("vue_papy_simple", capsule?.id)}
        style={{ width: "100%", borderRadius: 20, border: "2px solid #FF8C5A",
          background: "linear-gradient(135deg,#FFF0E6,#FFE4CC)",
          padding: "20px 18px", marginBottom: 14, cursor: "pointer", textAlign: "left" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ fontSize: 36, lineHeight: 1, flexShrink: 0 }}>👴</div>
          <div>
            <div style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 800,
              fontSize: 17, color: "#C25A20", marginBottom: 4 }}>
              Je suis Mamie ou Papy
            </div>
            <div style={{ fontSize: 12, color: "#A07850", lineHeight: 1.5 }}>
              Vue simplifiée · Faite pour vous · Pas de compte requis
            </div>
          </div>
        </div>
      </button>

      {/* Choix Contributeur */}
      <button onClick={() => allerVers("papy")}
        style={{ width: "100%", borderRadius: 20, border: `1.5px solid ${COULEURS.bordure}`,
          background: "var(--carte-bg)",
          padding: "20px 18px", marginBottom: 10, cursor: "pointer", textAlign: "left",
          boxShadow: "0 4px 14px rgba(46,34,48,.07)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ fontSize: 36, lineHeight: 1, flexShrink: 0 }}>👨‍👩‍👧</div>
          <div>
            <div style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 800,
              fontSize: 17, color: COULEURS.encre, marginBottom: 4 }}>
              Je suis un contributeur
            </div>
            <div style={{ fontSize: 12, color: COULEURS.doux, lineHeight: 1.5 }}>
              Accès à toutes les capsules mensuelles · Vue complète
            </div>
          </div>
        </div>
      </button>

      <p style={{ textAlign: "center", fontSize: 11, color: COULEURS.doux,
        marginTop: 10, lineHeight: 1.6 }}>
        Votre choix n'est pas définitif — vous pouvez revenir en arrière à tout moment.
      </p>
    </div>
  );
}

// ============================================================================
//  ÉCRAN VUE PAPY SIMPLE — interface simplifiée in-app pour Mamie/Papy
// ============================================================================
function EcranVuePapySimple({ capsule, capsules, moi, allerVers }) {
  if (!capsule) return null;

  // Autres capsules papy du même créateur (mois précédents)
  const autresCapsules = capsules
    ? capsules.filter(c => c.formule === "papy" && c.id !== capsule.id && c.createurId === capsule.createurId)
        .sort((a, b) => new Date(b.dateOuverture || 0) - new Date(a.dateOuverture || 0))
    : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div style={{ background: "linear-gradient(135deg,#C25A20,#FF8C5A)", padding: "12px 16px",
        display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,.9)",
          fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
          👴 Vue Mamie / Papy — {capsule.nom}
        </div>
        <button onClick={() => allerVers("choix_role_papy", capsule.id)}
          style={{ background: "rgba(255,255,255,.2)", border: "none", borderRadius: 999,
            padding: "5px 12px", fontSize: 12, fontWeight: 700, color: "#fff", cursor: "pointer" }}>
          ← Retour
        </button>
      </div>
      <div style={{ flex: 1, overflow: "hidden" }}>
        <EcranPapySimple
          capsule={capsule}
          allerVers={allerVers}
          onTerminer={() => allerVers("choix_role_papy", capsule.id)}
          autresCapsules={autresCapsules}
        />
      </div>
    </div>
  );
}

function EcranApercuPapy({ allerVers }) {
  const d = new Date().toISOString();
  const mockCapsule = {
    id: "preview",
    nom: "Mamie Joëlle",
    contributions: [
      { id: "m1", type: "photo",   media: null,
        texte: "Les enfants au jardin ce matin — ils pensent à toi ! ☀️",
        date: d, auteurId: "p1" },
      { id: "m2", type: "video",   media: null,
        texte: "Léo fait ses premiers pas ! On a pensé à toi direct 🥹",
        date: d, auteurId: "p2" },
      { id: "m3", type: "vocal",   media: null, texte: null,
        date: d, auteurId: "p1" },
      { id: "m4", type: "musique", media: null,
        titre: "La Vie en Rose", artiste: "Édith Piaf",
        texte: "On a pensé à toi en l'écoutant 💛",
        date: d, auteurId: "p2" },
      { id: "m5", type: "message",
        texte: "Mamie, on t'aime tellement fort. Vivement les prochaines vacances ensemble ! 💛",
        date: d, auteurId: "p1" },
    ],
    participants: [
      { id: "p1", prenom: "Sarah", couleur: "#F472B6" },
      { id: "p2", prenom: "Lucas", couleur: "#60A5FA" },
    ],
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div style={{ background: "rgba(22,14,26,0.92)", padding: "12px 16px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexShrink: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.9)",
          fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
          Aperçu — vue de Mamie/Papy
        </div>
        <button onClick={() => allerVers("creer")}
          style={{ background: "rgba(255,255,255,0.16)", border: "none", borderRadius: 999,
            padding: "5px 12px", fontSize: 12, fontWeight: 700, color: "#fff", cursor: "pointer" }}>
          Fermer ✕
        </button>
      </div>
      <div style={{ flex: 1, overflow: "hidden" }}>
        <EcranPapySimple capsule={mockCapsule} allerVers={null} onTerminer={() => allerVers("creer")} />
      </div>
    </div>
  );
}

// ============================================================================
//  ÉCRAN PAPY STANDALONE — chargement autonome pour les bénéficiaires sans compte.
// ============================================================================
function EcranPapyStandalone({ capsuleId }) {
  const [capsule, setCapsule] = useState(null);
  const [enCharge, setEnCharge] = useState(true);
  const [erreur, setErreur] = useState(false);

  useEffect(() => {
    async function charger() {
      const { data, error } = await supabase
        .from("capsules")
        .select("*, participants(*), contributions(*, reactions(*))")
        .eq("id", capsuleId)
        .single();
      if (error || !data) setErreur(true);
      else setCapsule(normaliserCapsule(data));
      setEnCharge(false);
    }
    charger();
  }, [capsuleId]);

  function allerSortir() {
    try { localStorage.removeItem("blooom_papy_capsule_id"); } catch {}
    window.location.reload();
  }

  if (enCharge) return (
    <CadreTelephone>
      <div style={{ display: "flex", flexDirection: "column", height: "100%",
        alignItems: "center", justifyContent: "center", background: "#FFF8F0" }}>
        <div style={{ fontSize: 38 }}>⏳</div>
        <div style={{ fontSize: 16, color: "#A07850", marginTop: 12 }}>
          Chargement des souvenirs…
        </div>
      </div>
    </CadreTelephone>
  );

  if (erreur) return (
    <CadreTelephone>
      <div style={{ display: "flex", flexDirection: "column", height: "100%",
        alignItems: "center", justifyContent: "center", textAlign: "center",
        padding: "24px 28px", background: "#FFF8F0" }}>
        <div style={{ fontSize: 48 }}>😕</div>
        <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 800,
          fontSize: 20, color: "#5C3D2E", marginTop: 16 }}>
          Impossible de charger
        </div>
        <div style={{ fontSize: 15, color: "#A07850", marginTop: 8, lineHeight: 1.5 }}>
          Vérifiez votre connexion internet et réessayez.
        </div>
        <button onClick={() => window.location.reload()}
          style={{ marginTop: 24, padding: "14px 28px", background: "#FF8C5A",
            color: "#fff", border: "none", borderRadius: 16, fontSize: 16,
            fontWeight: 700, cursor: "pointer", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
          Réessayer
        </button>
        <button onClick={allerSortir}
          style={{ marginTop: 12, background: "none", border: "none",
            color: "#A07850", fontSize: 14, cursor: "pointer", padding: "8px 0" }}>
          ← Saisir un autre code
        </button>
      </div>
    </CadreTelephone>
  );

  return (
    <CadreTelephone>
      <EcranPapySimple capsule={capsule} allerVers={null} />
    </CadreTelephone>
  );
}

// ============================================================================
//  ÉCRAN CONNEXION
// ============================================================================
function EcranConnexion() {
  const [mode, setMode] = useState(null); // null=choix, "inscription", "connexion", "papy", "oubli"
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [chargement, setChargement] = useState(false);
  const [confirme, setConfirme] = useState(false);
  const [erreur, setErreur] = useState("");
  const [codePapy, setCodePapy] = useState("");

  function traduitErreur(msg) {
    if (!msg) return "Une erreur est survenue.";
    if (msg.includes("Invalid login")) return "Email ou mot de passe incorrect.";
    if (msg.includes("Email not confirmed")) return "Confirmez d'abord votre email (vérifiez votre boîte).";
    if (msg.includes("already registered") || msg.includes("already exists")) return "Un compte existe déjà avec cet email.";
    if (msg.includes("at least 6")) return "Le mot de passe doit contenir au moins 6 caractères.";
    if (msg.includes("valid email")) return "Adresse email invalide.";
    return msg;
  }

  async function sInscrire() {
    setChargement(true); setErreur("");
    const { error } = await supabase.auth.signUp({
      email: email.trim(), password: motDePasse,
      options: { emailRedirectTo: window.location.origin },
    });
    setChargement(false);
    if (error) setErreur(traduitErreur(error.message));
    else setConfirme(true);
  }

  async function seConnecter() {
    setChargement(true); setErreur("");
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(), password: motDePasse,
    });
    setChargement(false);
    if (error) setErreur(traduitErreur(error.message));
    // Si succès : onAuthStateChange dans App() prend le relai automatiquement
  }

  async function envoyerReinit() {
    if (!email.trim()) { setErreur("Saisissez votre adresse e-mail."); return; }
    setChargement(true); setErreur("");
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin,
    });
    setChargement(false);
    if (error) { setErreur(traduitErreur(error.message)); return; }
    setConfirme(true);
  }

  async function rejoindrePapy() {
    if (!codePapy.trim()) return;
    setChargement(true); setErreur("");
    const { data: capsule, error } = await supabase
      .from("capsules")
      .select("id, nom, formule, code")
      .eq("code", codePapy.trim().toUpperCase())
      .maybeSingle();
    setChargement(false);
    if (error || !capsule) {
      setErreur("Code introuvable. Vérifiez le code et réessayez.");
      return;
    }
    try { localStorage.setItem("blooom_papy_capsule_id", capsule.id); } catch {}
    window.location.reload();
  }

  // Mode saisie de code Papy
  if (mode === "papy") return (
    <CadreTelephone>
      <div style={{ ...S.ecran, background: "#FFF8F0", justifyContent: "center" }}>
        <EnTeteRetour titre="" onRetour={() => { setMode(null); setErreur(""); setCodePapy(""); }} />
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 52 }}>👴👵</div>
          <h1 style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 800,
            fontSize: 24, color: "#5C3D2E", marginTop: 10, lineHeight: 1.2 }}>
            Vos souvenirs
          </h1>
          <p style={{ fontSize: 15, color: "#A07850", marginTop: 8, lineHeight: 1.6 }}>
            Saisissez le code donné par votre famille pour voir vos souvenirs.
          </p>
        </div>
        <label style={{ ...S.label, fontSize: 15, color: "#7C5C43" }}>Votre code</label>
        <input
          style={{ ...S.input, fontSize: 26, textAlign: "center", letterSpacing: 8,
            fontWeight: 800, textTransform: "uppercase", color: "#5C3D2E", padding: "16px 20px" }}
          placeholder="Ex. ABCD12"
          value={codePapy}
          maxLength={6}
          onChange={e => setCodePapy(e.target.value.toUpperCase())}
          autoFocus
        />
        {erreur && <p style={{ ...S.aide, color: COULEURS.corail, textAlign: "center" }}>⚠ {erreur}</p>}
        <button
          style={{ ...S.boutonPrincipal, marginTop: 16, padding: "16px 0", fontSize: 17,
            background: "linear-gradient(135deg, #FF8C5A 0%, #FFAA7A 100%)",
            boxShadow: "0 10px 24px rgba(255,140,90,0.35)",
            ...(!codePapy.trim() || chargement ? S.boutonDesactive : {}) }}
          disabled={!codePapy.trim() || chargement}
          onClick={rejoindrePapy}>
          {chargement ? "Vérification…" : "Voir mes souvenirs →"}
        </button>
      </div>
    </CadreTelephone>
  );

  // Confirmation envoyée
  if (confirme) return (
    <CadreTelephone>
      <div style={{ ...S.ecran, justifyContent: "center", textAlign: "center" }}>
        <div style={{ fontSize: 56 }}>📬</div>
        <h1 style={S.titrePage}>Vérifiez vos e-mails</h1>
        <p style={{ ...S.aide, textAlign: "center", marginTop: 12 }}>
          Un email de confirmation Blooom a été envoyé à <strong>{email}</strong>.
          Cliquez sur le lien pour activer votre compte.
        </p>
        <button style={{ ...S.boutonSecondaire, marginTop: 24 }}
          onClick={() => { setConfirme(false); setMode(null); setMotDePasse(""); }}>
          ← Retour
        </button>
      </div>
    </CadreTelephone>
  );

  // Choix initial
  if (!mode) return (
    <CadreTelephone>
      <div style={{ ...S.ecran, justifyContent: "center" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
          <LogoBlooom taille={52} />
        </div>
        <h1 style={{ ...S.titrePage, textAlign: "center" }}>Blooom</h1>
        <p style={{ ...S.aide, textAlign: "center", fontStyle: "italic", marginBottom: 16 }}>
          Scelle. Attends. Révèle.
        </p>
        {/* Preuve sociale sur l'écran d'accueil : crée un sentiment de communauté
            pour les nouveaux visiteurs et les encourage à s'inscrire */}
        <CarteStatStatique />
        <div style={{ marginBottom: 16 }} />
        <button style={S.boutonPrincipal} onClick={() => { setMode("inscription"); setErreur(""); }}>
          Créer un compte
        </button>
        <button style={S.boutonSecondaire} onClick={() => { setMode("connexion"); setErreur(""); }}>
          Se connecter
        </button>
        <button
          onClick={() => { setMode("papy"); setErreur(""); }}
          style={{ width: "100%", background: "#FFF8F0", color: "#7C5C43",
            border: "1.5px solid #F5C89A", borderRadius: 16, padding: "13px 0",
            fontSize: 15, fontWeight: 700, cursor: "pointer", marginTop: 12,
            fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
          👴👵 J'ai un code famille
        </button>
      </div>
    </CadreTelephone>
  );

  // Mot de passe oublié
  if (mode === "oubli") return (
    <CadreTelephone>
      <div style={{ ...S.ecran, justifyContent: "center" }}>
        <EnTeteRetour titre="Mot de passe oublié" onRetour={() => { setMode("connexion"); setErreur(""); setConfirme(false); }} />
        {confirme ? (
          <>
            <div style={{ textAlign: "center", fontSize: 48, marginBottom: 16 }}>📬</div>
            <p style={{ textAlign: "center", fontWeight: 700, fontSize: 16, color: COULEURS.encre, marginBottom: 8 }}>
              E-mail envoyé !
            </p>
            <p style={{ textAlign: "center", fontSize: 14, color: COULEURS.doux, lineHeight: 1.6 }}>
              Consultez votre boîte mail et cliquez sur le lien pour choisir un nouveau mot de passe.
            </p>
            <button style={S.boutonPrincipal} onClick={() => { setMode("connexion"); setConfirme(false); }}>
              Retour à la connexion
            </button>
          </>
        ) : (
          <>
            <p style={{ fontSize: 14, color: COULEURS.doux, marginBottom: 16, lineHeight: 1.6 }}>
              Saisissez votre adresse e-mail. Vous recevrez un lien pour créer un nouveau mot de passe.
            </p>
            <label style={S.label}>Adresse e-mail</label>
            <input style={S.input} type="email" placeholder="vous@exemple.com"
              value={email} onChange={(e) => setEmail(e.target.value)} autoFocus
              onKeyDown={(e) => e.key === "Enter" && !chargement && envoyerReinit()} />
            {erreur && <p style={{ ...S.aide, color: COULEURS.corail, marginTop: 8 }}>⚠ {erreur}</p>}
            <button
              style={{ ...S.boutonPrincipal, ...(!email.trim() || chargement ? S.boutonDesactive : {}) }}
              disabled={!email.trim() || chargement}
              onClick={envoyerReinit}
            >
              {chargement ? "Envoi…" : "Envoyer le lien"}
            </button>
          </>
        )}
      </div>
    </CadreTelephone>
  );

  // Formulaire
  const estInscription = mode === "inscription";
  const peutSoumettre = email.trim() && motDePasse.length >= 6 && !chargement;
  return (
    <CadreTelephone>
      <div style={{ ...S.ecran, justifyContent: "center" }}>
        <EnTeteRetour
          titre={estInscription ? "Créer un compte" : "Se connecter"}
          onRetour={() => { setMode(null); setErreur(""); setMotDePasse(""); }}
        />
        <label style={S.label}>Adresse e-mail</label>
        <input style={S.input} type="email" placeholder="vous@exemple.com"
          value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        <label style={S.label}>Mot de passe</label>
        <input style={S.input} type="password"
          placeholder={estInscription ? "6 caractères minimum" : "Votre mot de passe"}
          value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && peutSoumettre && (estInscription ? sInscrire() : seConnecter())}
        />
        {!estInscription && (
          <button type="button"
            onClick={() => { setMode("oubli"); setErreur(""); }}
            style={{ background: "none", border: "none", color: COULEURS.doux, fontSize: 13,
              cursor: "pointer", padding: "4px 0", fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontWeight: 600, textAlign: "right", width: "100%" }}>
            Mot de passe oublié ?
          </button>
        )}
        {erreur && <p style={{ ...S.aide, color: COULEURS.corail, marginTop: 8 }}>⚠ {erreur}</p>}
        <button
          style={{ ...S.boutonPrincipal, ...(!peutSoumettre ? S.boutonDesactive : {}) }}
          disabled={!peutSoumettre}
          onClick={estInscription ? sInscrire : seConnecter}
        >
          {chargement ? "…" : estInscription ? "Créer mon compte" : "Se connecter"}
        </button>

        {/* Message de confiance sous le formulaire — réduit l'anxiété liée à la création de compte */}
        <p style={{ textAlign: "center", fontSize: 14, color: COULEURS.encre, fontWeight: 600, marginTop: 22, lineHeight: 1.5 }}>
          🔐 Vos souvenirs sont privés, chiffrés, et n'appartiennent qu'à vous.
        </p>
        <p style={{ textAlign: "center", fontSize: 11, color: COULEURS.doux, marginTop: 6, letterSpacing: 0.4 }}>
          Zéro publicité · Hébergé en Europe · Suppression garantie
        </p>
      </div>
    </CadreTelephone>
  );
}

// ============================================================================
//  ÉCRAN NOUVEAU MOT DE PASSE — affiché après clic sur le lien de réinitialisation
// ============================================================================
function EcranNouveauMotDePasse({ onTermine }) {
  const [mdp, setMdp] = useState("");
  const [confirme, setConfirme] = useState("");
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState("");
  const [succes, setSucces] = useState(false);

  async function valider() {
    if (mdp.length < 6) { setErreur("Le mot de passe doit contenir au moins 6 caractères."); return; }
    if (mdp !== confirme) { setErreur("Les mots de passe ne correspondent pas."); return; }
    setChargement(true); setErreur("");
    const { error } = await supabase.auth.updateUser({ password: mdp });
    setChargement(false);
    if (error) { setErreur(error.message); return; }
    setSucces(true);
    await supabase.auth.signOut();
    setTimeout(onTermine, 1800);
  }

  return (
    <CadreTelephone>
      <div style={{ ...S.ecran, justifyContent: "center" }}>
        <div style={{ textAlign: "center", fontSize: 48, marginBottom: 8 }}>🔑</div>
        <h2 style={{ textAlign: "center", fontFamily: "'Bricolage Grotesque',sans-serif",
          fontSize: 22, fontWeight: 800, color: COULEURS.encre, marginBottom: 4 }}>
          Nouveau mot de passe
        </h2>
        {succes ? (
          <>
            <div style={{ textAlign: "center", fontSize: 48, marginTop: 16 }}>✅</div>
            <p style={{ textAlign: "center", fontSize: 15, fontWeight: 700, color: COULEURS.encre, marginTop: 12 }}>
              Mot de passe mis à jour !
            </p>
            <p style={{ textAlign: "center", fontSize: 13, color: COULEURS.doux, marginTop: 6 }}>
              Vous allez être redirigé vers la connexion…
            </p>
          </>
        ) : (
          <>
            <label style={S.label}>Nouveau mot de passe</label>
            <input style={S.input} type="password" placeholder="6 caractères minimum"
              value={mdp} onChange={(e) => setMdp(e.target.value)} autoFocus />
            <label style={S.label}>Confirmer le mot de passe</label>
            <input style={S.input} type="password" placeholder="Répétez le mot de passe"
              value={confirme} onChange={(e) => setConfirme(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !chargement && valider()} />
            {erreur && <p style={{ ...S.aide, color: COULEURS.corail, marginTop: 8 }}>⚠ {erreur}</p>}
            <button
              style={{ ...S.boutonPrincipal, ...(mdp.length < 6 || chargement ? S.boutonDesactive : {}) }}
              disabled={mdp.length < 6 || chargement}
              onClick={valider}
            >
              {chargement ? "Mise à jour…" : "Valider mon nouveau mot de passe"}
            </button>
          </>
        )}
      </div>
    </CadreTelephone>
  );
}

// ============================================================================
//  7. COMPOSANT PRINCIPAL — App
// ============================================================================
export default function App() {
  const [session, setSession] = useState(null);
  const [sessionPrete, setSessionPrete] = useState(false);
  const [reinitMdp, setReinitMdp] = useState(false);
  const [moi, setMoi] = useState(null);
  const [capsules, setCapsules] = useState([]);
  const [chargement, setChargement] = useState(true);

  const [palette, setPalette] = useState(() => { try { return localStorage.getItem("blooom_palette") || "aurora"; } catch { return "aurora"; } });
  const [mode, setMode] = useState(() => { try { return localStorage.getItem("blooom_mode") || "clair"; } catch { return "clair"; } });

  const vars = buildVars(palette, mode);

  function changerPalette(id) { setPalette(id); try { localStorage.setItem("blooom_palette", id); } catch {} }
  function changerMode(m) { setMode(m); try { localStorage.setItem("blooom_mode", m); } catch {} }

  const [ecran, setEcran] = useState("capsules");
  const [ecranPrecedent, setEcranPrecedent] = useState(null);
  const [capsuleActiveId, setCapsuleActiveId] = useState(null);
  const [participantActifId, setParticipantActifId] = useState(null);
  const [retourParticipant, setRetourParticipant] = useState("detail");
  const [notifPari, setNotifPari] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [panneauNotifs, setPanneauNotifs] = useState(false);
  const [codePrefill, setCodePrefill] = useState(null);
  const [paywallType, setPaywallType] = useState(null);
  const [maintenance, setMaintenance] = useState(false);
  const [maintenanceMsg, setMaintenanceMsg] = useState("L'application est en maintenance. Revenez bientôt !");
  const [packSucces, setPackSucces] = useState(null);
  const [capsuleWebhookId, setCapsuleWebhookId] = useState(null);
  const [gami, setGami] = useState(null);
  const [gamiUnlock, setGamiUnlock] = useState(null);
  const gamiInitRef = React.useRef(false);
  const gamiPrevRef = React.useRef(null);
  const premierChargementRef = React.useRef(true);
  const chargerContribsRef   = React.useRef(null);

  // Déclenche les toasts de badge/niveau quand gami change (résout la perte de badges en cas d'appels rapides)
  useEffect(() => {
    if (!gami) return;
    if (!gamiInitRef.current) { gamiInitRef.current = true; gamiPrevRef.current = gami; return; }
    const prev = gamiPrevRef.current || GAMI_VIDE;
    const anciensBadges = badgesDebloques(prev);
    const nouveauxBadges = badgesDebloques(gami).filter(b => !anciensBadges.some(a => a.slug === b.slug));
    if (gami.niveau > prev.niveau) setGamiUnlock({ type: "niveau", niveau: gami.niveau });
    else if (nouveauxBadges.length) setGamiUnlock({ type: "badge", badges: nouveauxBadges });
    gamiPrevRef.current = gami;
  }, [gami]); // eslint-disable-line react-hooks/exhaustive-deps

  // Vérifie le mode maintenance au démarrage et écoute les changements en temps réel
  useEffect(() => {
    async function checkMaintenance() {
      const { data } = await supabase
        .from("app_settings")
        .select("key,value")
        .in("key", ["maintenance_mode", "maintenance_message"]);
      if (!data) return;
      const map = Object.fromEntries(data.map(r => [r.key, r.value]));
      setMaintenance(map.maintenance_mode === "true");
      if (map.maintenance_message) setMaintenanceMsg(map.maintenance_message);
    }
    checkMaintenance();

    // Écoute les modifications du backoffice en temps réel
    const canal = supabase
      .channel("app-settings-watch")
      .on("postgres_changes", { event: "*", schema: "public", table: "app_settings" }, payload => {
        if (payload.new?.key === "maintenance_mode")   setMaintenance(payload.new.value === "true");
        if (payload.new?.key === "maintenance_message") setMaintenanceMsg(payload.new.value);
      })
      .subscribe();
    return () => supabase.removeChannel(canal);
  }, []);

  // Enregistre le token push et écoute les taps sur notifications (natif seulement)
  useEffect(() => {
    if (!session || !Capacitor.isNativePlatform()) return;
    let listeners = [];

    PushNotifications.requestPermissions().then(({ receive }) => {
      if (receive !== "granted") return;
      PushNotifications.register();

      PushNotifications.addListener("registration", async ({ value: token }) => {
        await supabase.from("device_tokens").upsert(
          { user_id: session.user.id, token, platform: Capacitor.getPlatform(), updated_at: new Date().toISOString() },
          { onConflict: "token" }
        );
      }).then(l => listeners.push(l));

      PushNotifications.addListener("pushNotificationActionPerformed", ({ notification }) => {
        const d = notification.data || {};
        if (d.cible === "ouverture" && d.capsule_id) allerVers("ouverture", d.capsule_id);
        else if (d.capsule_id) allerVers("detail", d.capsule_id);
      }).then(l => listeners.push(l));
    });

    return () => { listeners.forEach(l => l.remove()); };
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  // Capture le code parrain, le code d'invitation et le retour Stripe depuis l'URL
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const parrain = params.get("parrain");
      if (parrain) localStorage.setItem("blooom_parrain", parrain.toUpperCase());
      const code = (params.get("code") || "").toUpperCase();
      if (code.length >= 5) {
        setCodePrefill(code);
        window.history.replaceState({}, "", window.location.pathname);
      }
      if (params.get("checkout") === "success") {
        const pack = params.get("pack") || "occasion";
        window.history.replaceState({}, "", window.location.pathname);
        setPackSucces(pack);
      }
    } catch {}
  }, []);

  // Navigue vers l'écran rejoindre dès que l'auth est connue (lien d'invitation web)
  useEffect(() => {
    if (!codePrefill || !sessionPrete) return;
    allerVers("rejoindre");
  }, [codePrefill, sessionPrete]); // eslint-disable-line react-hooks/exhaustive-deps

  // Navigue vers l'écran de création du pack une fois l'utilisateur connecté et les données chargées
  useEffect(() => {
    if (!packSucces || chargement || !session) return;
    // Crédite les points pour tous les packs payants
    if (packSucces === "occasion" || packSucces === "mariage") {
      incrementerGami({ points: 4, packs_inoubliables_achetes: 1 });
    } else if (packSucces === "papy") {
      incrementerGami({ points: 3 });
    }
    // Pour les packs occasion/mariage, récupère l'ID de la capsule créée par le webhook
    // pour éviter qu'EcranSuccesPack en crée une deuxième (doublon)
    if (packSucces === "occasion" || packSucces === "mariage") {
      const typeAchat = packSucces === "mariage" ? "pack_mariage" : "pack_occasion";
      supabase
        .from("achats")
        .select("capsule_id")
        .eq("user_id", session.user.id)
        .eq("type", typeAchat)
        .eq("statut", "complete")
        .not("capsule_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
        .then(({ data }) => {
          setCapsuleWebhookId(data?.capsule_id || null);
          allerVers(packSucces === "mariage" ? "succes_mariage" : "succes_pack");
          setPackSucces(null);
        });
    } else {
      allerVers(packSucces === "papy" ? "succes_papy" : "succes_pack");
      setPackSucces(null);
    }
  }, [packSucces, chargement, session]); // eslint-disable-line react-hooks/exhaustive-deps

  // Gère les Universal Links / App Links (lien d'invitation ouvert depuis le téléphone)
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let handler = null;

    CapApp.addListener("appUrlOpen", ({ url }) => {
      try {
        const parsed = new URL(url);
        const code = (parsed.searchParams.get("code") || parsed.pathname.split("/").pop() || "").toUpperCase();
        if (code.length >= 5) { setCodePrefill(code); allerVers("rejoindre"); }
        // Capture aussi le code parrain dans les deep links
        const parrain = parsed.searchParams.get("parrain");
        if (parrain) localStorage.setItem("blooom_parrain", parrain.toUpperCase());
      } catch {}
    }).then(l => { handler = l; });

    return () => { if (handler) handler.remove(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Écoute les changements de session (connexion / déconnexion / lien magique cliqué)
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setSessionPrete(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") { setReinitMdp(true); }
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!sessionPrete) return;
    if (!session) { setChargement(false); return; }
    chargerDonnees();
  }, [session, sessionPrete]);

  // Temps réel : recharge les données quand un autre appareil ajoute une
  // contribution ou un participant. Supabase n'envoie que les événements
  // autorisés par le RLS (les autres sont filtrés côté serveur).
  useEffect(() => {
    if (!session) return;
    const canal = supabase
      .channel('mises-a-jour')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contributions' }, (payload) => {
        const cid = payload.new?.capsule_id || payload.old?.capsule_id;
        if (cid) chargerContribsRef.current?.(cid);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'participants' }, () => chargerDonnees())
      .subscribe();
    return () => supabase.removeChannel(canal);
  }, [session]);

  // Relance pari : vérifie si un membre n'a pas voté dans les 48h
  useEffect(() => {
    if (!capsules.length || !session) return;
    const DELAI_48H = 48 * 60 * 60 * 1000;
    const maintenant = Date.now();
    for (const capsule of capsules) {
      if (!capsule.ouverte) continue;
      const moisParticipant = capsule.participants?.find(p => p.userId === session.user.id);
      if (!moisParticipant) continue;
      for (const contrib of (capsule.contributions || [])) {
        if (contrib.type !== "pari") continue;
        if (maintenant - new Date(contrib.date).getTime() < DELAI_48H) continue;
        let donnees = { votes: {} };
        try { if (contrib.question) donnees = JSON.parse(contrib.question); } catch {}
        if (donnees.votes?.[moisParticipant.id]) continue; // déjà voté
        const cle = `blooom_notif_pari_${contrib.id}_${moisParticipant.id}`;
        if (localStorage.getItem(cle)) continue; // déjà notifié
        setNotifPari({ capsuleNom: capsule.nom, capsuleId: capsule.id, contribId: contrib.id, cle });
        return;
      }
    }
  }, [capsules, session]);

  async function chargerDonnees() {
    const estPremier = premierChargementRef.current;
    if (estPremier) setChargement(true);
    const [{ data: profil }, { data: capsulesDB, error: capsErreur }, { data: gamiDB }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle(),
      supabase.from("capsules")
        .select("*, participants(*)")
        .order("created_at", { ascending: false }),
      supabase.from("gamification").select("*").eq("user_id", session.user.id).maybeSingle(),
    ]);
    if (capsErreur) console.error("[chargerDonnees] capsules:", capsErreur.message);
    if (profil) setMoi(normaliserProfil(profil));
    // Fusionne DB + état local : prend le max de chaque compteur.
    // Évite qu'un rechargement déclenché par Realtime écrase une progression locale
    // en attente d'écriture (RPC fire-and-forget).
    setGami(prev => {
      const db = gamiDB || GAMI_VIDE;
      if (!prev) return db;
      return {
        points_total:               Math.max(prev.points_total,               db.points_total),
        niveau:                     Math.max(prev.niveau,                     db.niveau),
        capsules_creees:            Math.max(prev.capsules_creees,            db.capsules_creees),
        souvenirs_deposes:          Math.max(prev.souvenirs_deposes,          db.souvenirs_deposes),
        parrainages_acceptes:       Math.max(prev.parrainages_acceptes,       db.parrainages_acceptes),
        capsules_papy_ouvertes:     Math.max(prev.capsules_papy_ouvertes,     db.capsules_papy_ouvertes),
        packs_inoubliables_achetes: Math.max(prev.packs_inoubliables_achetes, db.packs_inoubliables_achetes),
      };
    });
    if (capsulesDB) {
      const liste = capsulesDB.map(normaliserCapsule);
      // Applique la photo de profil sur toutes les entrées participant de l'utilisateur
      if (profil) {
        liste.forEach(c => c.participants.forEach(p => {
          if (p.userId === session.user.id) p.photo = profil.photo_url || null;
        }));
      }
      // Fusionne avec l'état local pour ne pas perdre les capsules créées optimistiquement
      // (creerCapsule les ajoute localement avant que Realtime ne confirme).
      setCapsules(prev => {
        // Préserve les contributions déjà chargées pour éviter de les effacer entre les recharges
        const prevMap = new Map(prev.map(c => [c.id, c]));
        const merged = liste.map(c => ({
          ...c,
          contributions: prevMap.get(c.id)?.contributions || [],
        }));
        if (!prev.length) return merged;
        const ids = new Set(liste.map(c => c.id));
        const localOnly = prev.filter(c => !ids.has(c.id));
        return localOnly.length ? [...merged, ...localOnly] : merged;
      });
    }
    if (estPremier) {
      setChargement(false);
      premierChargementRef.current = false;
    }
    // Charge les notifications après que les capsules sont disponibles
    if (capsulesDB) chargerNotifsPour(capsulesDB.map(normaliserCapsule));
  }

  // Charge les contributions d'une capsule à la demande (appelé à l'ouverture ou par Realtime)
  async function chargerContributions(capsuleId) {
    const { data, error } = await supabase
      .from("contributions")
      .select("*, reactions(*)")
      .eq("capsule_id", capsuleId)
      .order("created_at", { ascending: true });
    if (error) { console.error("[chargerContributions]", error.message); return; }
    setCapsules(prev => prev.map(c =>
      c.id === capsuleId
        ? { ...c, contributions: (data || []).map(normaliserContribution) }
        : c
    ));
  }
  // Garde la ref à jour à chaque render pour le Realtime (évite les closures figées)
  chargerContribsRef.current = chargerContributions;

  // Charge les contributions quand l'utilisateur navigue vers une capsule
  useEffect(() => {
    if (!capsuleActiveId || !session) return;
    const ecransAvecContribs = [
      "detail", "ouverture", "contribution", "papy", "papy_simple",
      "vue_papy_simple", "animation_ouverture", "senior", "choix_role_papy",
    ];
    if (ecransAvecContribs.includes(ecran)) chargerContribsRef.current?.(capsuleActiveId);
  }, [capsuleActiveId, ecran, session]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Suppression de compte complète (RGPD) ──────────────────────────────────
  async function seDeconnecter() {
    await supabase.auth.signOut();
  }

  // Ordre : 1. récupérer les URLs médias, 2. supprimer fichiers Storage,
  // 3. enregistrer dans suppressions, 4. supprimer données BDD, 5. déconnecter.
  async function supprimerCompte() {
    const userId = session.user.id;
    const email  = session.user.email;

    // Récupère les chemins des médias uploadés par l'utilisateur
    const { data: contribs } = await supabase
      .from("contributions")
      .select("media_url")
      .eq("auteur_id", userId);

    // Extrait les chemins relatifs depuis les URLs publiques Supabase Storage
    const cheminMedias = (contribs || [])
      .filter(c => c.media_url)
      .map(c => {
        try {
          const u = new URL(c.media_url);
          const marker = "/object/public/medias/";
          const idx = u.pathname.indexOf(marker);
          return idx >= 0
            ? decodeURIComponent(u.pathname.slice(idx + marker.length).split("?")[0])
            : null;
        } catch { return null; }
      })
      .filter(Boolean);

    // Supprime les fichiers médias (photos, vidéos, dessins, vocaux)
    if (cheminMedias.length > 0) {
      await supabase.storage.from("medias").remove(cheminMedias);
    }

    // Supprime l'avatar — nommé {userId}.{ext} dans le bucket avatars
    const { data: avatars } = await supabase.storage.from("avatars").list("", { search: userId });
    if (avatars?.length) {
      await supabase.storage.from("avatars").remove(avatars.map(f => f.name));
    }

    // Enregistre la suppression pour traçabilité RGPD (avant de supprimer le profil)
    await supabase.from("suppressions").insert({
      email,
      user_id: userId,
      requested_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    });

    // Supprime dans l'ordre pour respecter les contraintes FK
    await supabase.from("contributions").delete().eq("auteur_id", userId);
    await supabase.from("participants").delete().eq("user_id", userId);
    await supabase.from("parrainages").delete().or(`parrain_id.eq.${userId},filleul_id.eq.${userId}`);
    await supabase.from("profiles").delete().eq("id", userId);

    // Déconnecte l'utilisateur (la suppression du compte auth est faite côté Supabase admin)
    await supabase.auth.signOut();
  }

  async function chargerNotifsPour(listeCapsules) {
    const mesIds = listeCapsules.flatMap(c =>
      (c.participants || []).filter(p => p.userId === session?.user?.id).map(p => p.id)
    );
    if (!mesIds.length) return;
    const { data } = await supabase.from("notifications")
      .select("*")
      .in("participant_id", mesIds)
      .order("created_at", { ascending: false })
      .limit(50);
    if (data) setNotifications(data.map(normaliserNotification));
  }

  async function insererNotification(participantId, capsuleId, texte, cibleEcran = null) {
    await supabase.from("notifications").insert({
      participant_id: participantId, capsule_id: capsuleId, texte, cible_ecran: cibleEcran,
    });
    // Push notification (fire-and-forget — ne bloque pas si FCM non configuré)
    supabase.functions.invoke("send-push", {
      body: {
        participant_id: participantId,
        title: "Blooom 🌸",
        body: texte,
        data: { cible: cibleEcran || "detail", capsule_id: capsuleId || "" },
      },
    }).catch(() => {});
  }

  async function marquerLue(notifId) {
    await supabase.from("notifications").update({ lue: true }).eq("id", notifId);
    setNotifications(l => l.map(n => n.id === notifId ? { ...n, lue: true } : n));
  }

  async function voterFavori(capsuleId, contribId) {
    const capsule = capsules.find(c => c.id === capsuleId);
    const participant = capsule?.participants.find(p => p.userId === session.user.id);
    if (!participant) return;
    await supabase.from("votes_favori").insert({
      capsule_id: capsuleId, participant_id: participant.id, contribution_id: contribId,
    });
  }


  const allerVers = useCallback((nouvelEcran, id = null) => {
    setEcran(prev => { setEcranPrecedent(prev); return nouvelEcran; });
    if (id !== null) setCapsuleActiveId(id);
  }, []);

  const editerParticipant = useCallback((pid, origine) => {
    setParticipantActifId(pid);
    setRetourParticipant(origine);
    setEcran("participant");
  }, []);

  // --- Profil ---
  async function creerMoi({ prenom, description, photo }) {
    const photo_url = photo ? await uploaderFichier("avatars", photo, session.user.id) : null;
    const { data } = await supabase.from("profiles").upsert({
      id: session.user.id, prenom, description, photo_url, couleur: COULEURS_AVATAR[0],
    }).select().single();
    if (data) setMoi(normaliserProfil(data));

    // Enregistre le parrainage si l'utilisateur est arrivé via un lien parrain
    const codeParrain = localStorage.getItem("blooom_parrain");
    if (codeParrain) {
      const { data: profil } = await supabase
        .from("profiles").select("id").eq("code_parrain", codeParrain).maybeSingle();
      // On vérifie que le parrain existe et que ce n'est pas l'utilisateur lui-même
      if (profil && profil.id !== session.user.id) {
        await supabase.from("parrainages").insert({
          parrain_id: profil.id,
          filleul_id: session.user.id,
        });
      }
      localStorage.removeItem("blooom_parrain");
    }
  }

  async function modifierMoi(champs) {
    const photo_url = champs.photo && champs.photo !== moi.photo
      ? await uploaderFichier("avatars", champs.photo, session.user.id)
      : moi.photo;
    const { data } = await supabase.from("profiles")
      .update({ prenom: champs.prenom, description: champs.description, photo_url })
      .eq("id", session.user.id).select().single();
    if (data) {
      setMoi(normaliserProfil(data));
      // Répercute la nouvelle photo sur toutes les entrées participant de l'utilisateur
      setCapsules(l => l.map(c => ({
        ...c,
        participants: c.participants.map(p =>
          p.userId === session.user.id ? { ...p, photo: photo_url, prenom: champs.prenom } : p
        ),
      })));
    }
  }

  // --- Gamification ---
  async function incrementerGami(delta) {
    if (!session) return;
    setGami(prev => {
      const a = prev || GAMI_VIDE;
      const nouvel = {
        ...a,
        points_total:               a.points_total               + (delta.points                     || 0),
        capsules_creees:            a.capsules_creees            + (delta.capsules_creees            || 0),
        souvenirs_deposes:          a.souvenirs_deposes          + (delta.souvenirs_deposes          || 0),
        parrainages_acceptes:       a.parrainages_acceptes       + (delta.parrainages_acceptes       || 0),
        capsules_papy_ouvertes:     a.capsules_papy_ouvertes     + (delta.capsules_papy_ouvertes     || 0),
        packs_inoubliables_achetes: a.packs_inoubliables_achetes + (delta.packs_inoubliables_achetes || 0),
      };
      nouvel.niveau = niveauDepuisPoints(nouvel.points_total).niveau;
      return nouvel;
    });
    supabase.rpc("incrementer_gamification", {
      p_user_id:                    session.user.id,
      p_points:                     delta.points                     || 0,
      p_capsules_creees:            delta.capsules_creees            || 0,
      p_souvenirs_deposes:          delta.souvenirs_deposes          || 0,
      p_parrainages_acceptes:       delta.parrainages_acceptes       || 0,
      p_capsules_papy_ouvertes:     delta.capsules_papy_ouvertes     || 0,
      p_packs_inoubliables_achetes: delta.packs_inoubliables_achetes || 0,
    }).catch(err => console.error("incrementerGami:", err));
  }

  // --- Capsules ---
  async function creerCapsule({ nom, type, dateOuverture, couverture, formule: formuleParam, ecranSucces }) {
    const formule = formuleParam || "gratuit";
    if (formule === "gratuit") {
      const capsulesActives = capsules.filter(c => c.createurId === session.user.id && !c.ouverte && c.formule === "gratuit").length;
      const { peut } = peutCreerCapsuleGratuite(capsulesActives);
      if (!peut) { setPaywallType("capsule_limite_gratuit"); return null; }
    }
    const couverture_url = couverture ? await uploaderFichier("couvertures", couverture, genererId()) : null;
    const capsuleId = crypto.randomUUID();
    const code = genererCode();
    const quotas = getQuotasCapsule(formule);
    const now = new Date().toISOString();
    const { error: errCapsule } = await supabase.from("capsules").insert({
      id: capsuleId, nom, type, date_ouverture: dateOuverture || null,
      couverture_url, code, created_by: session.user.id,
      formule,
      quota_photos: quotas.quota_photos, quota_videos: quotas.quota_videos,
      quota_vocaux: quotas.quota_vocaux, quota_participants: quotas.quota_participants,
      duree_video_max_s: quotas.duree_video_max_s, duree_vocal_max_s: quotas.duree_vocal_max_s,
      compte_photos: 0, compte_videos: 0, compte_vocaux: 0,
    });
    if (errCapsule) throw new Error("Capsule : " + errCapsule.message);
    const participantId = crypto.randomUUID();
    const { error: errParticipant } = await supabase.from("participants").insert({
      id: participantId,
      capsule_id: capsuleId, user_id: session.user.id,
      prenom: moi.prenom, description: moi.description,
      photo_url: moi.photo, couleur: moi.couleur,
    });
    if (errParticipant) throw new Error("Participant : " + errParticipant.message);
    // Construction locale — évite chargerDonnees() et son chargement=true qui démonterait l'écran
    const nouvelleCapsule = normaliserCapsule({
      id: capsuleId, nom, type, date_ouverture: dateOuverture || null,
      couverture_url, code, created_by: session.user.id, created_at: now,
      ouverte: false, formule,
      quota_photos: quotas.quota_photos, quota_videos: quotas.quota_videos,
      quota_vocaux: quotas.quota_vocaux, quota_participants: quotas.quota_participants,
      duree_video_max_s: quotas.duree_video_max_s, duree_vocal_max_s: quotas.duree_vocal_max_s,
      compte_photos: 0, compte_videos: 0, compte_vocaux: 0,
      participants: [{ id: participantId, capsule_id: capsuleId, user_id: session.user.id,
        prenom: moi.prenom, description: moi.description, photo_url: moi.photo, couleur: moi.couleur }],
      contributions: [],
    });
    setCapsules(prev => [nouvelleCapsule, ...prev]);
    allerVers(ecranSucces || "detail", capsuleId);
    incrementerGami({ points: 2, capsules_creees: 1 });
    return capsuleId;
  }

  async function modifierDate(capsuleId, date) {
    await supabase.from("capsules").update({ date_ouverture: date || null }).eq("id", capsuleId);
    setCapsules(l => l.map(c => c.id === capsuleId ? { ...c, dateOuverture: date } : c));
  }

  async function modifierNom(capsuleId, nom) {
    if (!nom.trim()) return;
    await supabase.from("capsules").update({ nom: nom.trim() }).eq("id", capsuleId);
    setCapsules(l => l.map(c => c.id === capsuleId ? { ...c, nom: nom.trim() } : c));
  }

  async function modifierCouverture(capsuleId, photo) {
    const couverture_url = await uploaderFichier("couvertures", photo, capsuleId);
    if (!couverture_url) { alert("Échec de l'upload photo. Vérifiez les permissions du bucket 'couvertures' dans Supabase."); return; }
    const { error } = await supabase.from("capsules").update({ couverture_url }).eq("id", capsuleId);
    if (error) { alert("Erreur : " + error.message); return; }
    setCapsules(l => l.map(c => c.id === capsuleId ? { ...c, couverture: couverture_url } : c));
  }

  async function supprimerCapsule(capsuleId) {
    await supabase.from("contributions").delete().eq("capsule_id", capsuleId);
    await supabase.from("participants").delete().eq("capsule_id", capsuleId);
    await supabase.from("capsules").delete().eq("id", capsuleId);
    setCapsules(l => l.filter(c => c.id !== capsuleId));
    allerVers("capsules");
  }

  async function quitterCapsule(capsuleId, participantId) {
    await supabase.from("participants").delete().eq("id", participantId);
    setCapsules(l => l.filter(c => c.id !== capsuleId));
    allerVers("capsules");
  }

  async function marierParticipant(capsuleId, participantId, estMarie) {
    const capsule = capsules.find(c => c.id === capsuleId);
    if (!capsule || capsule.createurId !== moi?.id) return;
    await supabase.from("participants").update({ marie: estMarie }).eq("id", participantId);
    setCapsules(l => l.map(c => c.id === capsuleId
      ? { ...c, participants: c.participants.map(p => p.id === participantId ? { ...p, marie: estMarie } : p) }
      : c
    ));
  }

  // --- Participants ---
  async function ajouterParticipant(capsuleId, { prenom, description, photo }) {
    const capsule = capsules.find(c => c.id === capsuleId);
    const maxP = capsule?.quota_participants ?? 9999;
    if (capsule && capsule.participants.length >= maxP) {
      setPaywallType("quota_atteint");
      return null;
    }
    const photo_url = photo ? await uploaderFichier("avatars", photo, genererId()) : null;
    const couleur = COULEURS_AVATAR[(capsule?.participants.length || 0) % COULEURS_AVATAR.length];
    const participantId = crypto.randomUUID();
    const { error } = await supabase.from("participants").insert({
      id: participantId, capsule_id: capsuleId, prenom,
      description: description || null, photo_url, couleur,
    });
    if (error) { console.error("Erreur participant :", error); return null; }
    setCapsules(l => l.map(c => c.id !== capsuleId ? c : {
      ...c, participants: [...c.participants, {
        id: participantId, userId: null,
        prenom, description: description || "", photo: photo_url || null, couleur,
      }],
    }));
    return participantId;
  }

  async function modifierParticipant(capsuleId, participantId, champs) {
    const photo_url = champs.photo
      ? await uploaderFichier("avatars", champs.photo, participantId)
      : undefined;
    const update = { prenom: champs.prenom, description: champs.description };
    if (photo_url !== undefined) update.photo_url = photo_url;
    await supabase.from("participants").update(update).eq("id", participantId);
    setCapsules(l => l.map(c => c.id !== capsuleId ? c : {
      ...c, participants: c.participants.map(p =>
        p.id === participantId ? { ...p, ...champs, photo: photo_url ?? p.photo } : p
      ),
    }));
  }

  async function rechercherCapsule(code) {
    const local = capsules.find(c => c.code === code);
    if (local) return { id: local.id, nom: local.nom, nb_participants: local.participants.length };
    const { data } = await supabase.rpc("chercher_capsule_par_code", { p_code: code });
    return data?.[0] || null;
  }

  async function rejoindreCapsuleParCode(capsuleId, code, { prenom, photo }) {
    const photo_url = photo ? await uploaderFichier("avatars", photo, genererId()) : null;
    const { error } = await supabase.rpc("rejoindre_capsule", {
      p_code: code, p_prenom: prenom, p_photo_url: photo_url,
    });
    if (error) { alert(error.message); return null; }
    // Notifie le créateur avant rechargement (on a encore l'état local)
    const capsuleLocale = capsules.find(c => c.id === capsuleId);
    if (capsuleLocale?.createurId) {
      const createurParticipant = capsuleLocale.participants.find(p => p.userId === capsuleLocale.createurId);
      if (createurParticipant) {
        insererNotification(createurParticipant.id, capsuleId,
          `👋 ${prenom} a rejoint votre capsule « ${capsuleLocale.nom} » !`, "detail"
        );
      }
    }
    await chargerDonnees();
    return capsuleId;
  }

  // --- Contributions / ouverture / réactions ---
  async function ajouterContribution(capsuleId, contribution) {
    const media_url = contribution.media
      ? await uploaderFichier("medias", contribution.media, genererId())
      : null;
    const { data } = await supabase.from("contributions").insert({
      capsule_id: capsuleId,
      auteur_id: contribution.auteurId,
      type: contribution.type,
      texte: contribution.texte || null,
      question: contribution.question || null,
      media_url,
      filtre: contribution.filtre,
      ambiance: contribution.ambiance || null,
      ...(contribution.date ? { created_at: contribution.date } : {}),
    }).select().single();
    if (data) {
      const typeToField = { photo: "compte_photos", video: "compte_videos", vocal: "compte_vocaux" };
      const field = typeToField[contribution.type];
      const capsule = capsules.find(c => c.id === capsuleId);
      const nouvelleContrib = normaliserContribution({ ...data, reactions: [] });
      const newCompte = field && capsule ? (capsule[field] ?? 0) + 1 : null;
      if (field && newCompte !== null) {
        supabase.from("capsules").update({ [field]: newCompte }).eq("id", capsuleId);
        setCapsules(l => l.map(c => c.id !== capsuleId ? c : {
          ...c, [field]: newCompte, contributions: [...c.contributions, nouvelleContrib],
        }));
      } else {
        setCapsules(l => l.map(c => c.id !== capsuleId ? c : {
          ...c, contributions: [...c.contributions, nouvelleContrib],
        }));
      }
      incrementerGami({ points: 1, souvenirs_deposes: 1 });
      // Vote : insérer dans souvenirs_votes + notifier tous les autres participants
      if (contribution.type === "vote" && capsule) {
        let parsedVote = { question: "", options: [] };
        try { if (contribution.question) parsedVote = JSON.parse(contribution.question); } catch {}
        await supabase.from("souvenirs_votes").insert({
          contribution_id: data.id,
          capsule_id: capsuleId,
          question: parsedVote.question,
          options: parsedVote.options,
        }).catch(() => {});
        for (const p of capsule.participants.filter(p => p.userId !== session?.user?.id)) {
          insererNotification(p.id, capsuleId,
            `🗳️ Un vote a été créé dans « ${capsule.nom} » — donnez votre avis !`,
            "detail"
          );
        }
      }
      // Jalons : notifie tous les participants à 10, 20, 50 contributions
      const nbApres = (capsule?.contributions.length || 0) + 1;
      if ([10, 20, 50].includes(nbApres) && capsule) {
        for (const p of capsule.participants) {
          insererNotification(p.id, capsuleId,
            `🎉 La capsule « ${capsule.nom} » vient d'atteindre ${nbApres} souvenir${nbApres > 1 ? "s" : ""} !`,
            "detail"
          );
        }
      }
    }
  }

  async function ouvrirCapsule(capsuleId) {
    await supabase.from("capsules").update({ ouverte: true }).eq("id", capsuleId);
    setCapsules(l => l.map(c => c.id === capsuleId ? { ...c, ouverte: true } : c));
    const capsule = capsules.find(c => c.id === capsuleId);
    if (capsule?.formule === "papy") {
      incrementerGami({ points: 5, capsules_papy_ouvertes: 1 });
    }
    // Notifie tous les participants (sauf l'ouvreur) que la capsule est ouverte
    if (capsule) {
      for (const p of capsule.participants.filter(p => p.userId !== session?.user?.id)) {
        insererNotification(p.id, capsuleId, `🎉 La capsule « ${capsule.nom} » est maintenant ouverte !`, "ouverture");
      }
    }
    allerVers("animation_ouverture", capsuleId);
  }

  // Enregistre le vote (gagné/perdu + commentaire) d'un participant sur un pari. Définitif.
  async function voterPari(capsuleId, contribId, participantId, vote, commentaire) {
    const capsule = capsules.find(c => c.id === capsuleId);
    const contrib = capsule?.contributions.find(ct => ct.id === contribId);
    let donnees = { votes: {} };
    try { if (contrib?.question) donnees = JSON.parse(contrib.question); } catch {}
    if (donnees.votes?.[participantId]) return; // déjà voté — immuable
    const nouvelles = { ...donnees, votes: { ...donnees.votes, [participantId]: { vote, commentaire: commentaire || "", ts: new Date().toISOString() } } };
    await supabase.from("contributions").update({ question: JSON.stringify(nouvelles) }).eq("id", contribId);
    setCapsules(l => l.map(c => c.id !== capsuleId ? c : {
      ...c, contributions: c.contributions.map(ct =>
        ct.id !== contribId ? ct : { ...ct, question: JSON.stringify(nouvelles) }
      ),
    }));
  }


  async function voterSouvenir(capsuleId, contribId, participantId, option) {
    const capsule = capsules.find(c => c.id === capsuleId);
    const contrib = capsule?.contributions.find(ct => ct.id === contribId);
    let donnees = { question: "", options: [], votes: {} };
    try { if (contrib?.question) donnees = JSON.parse(contrib.question); } catch {}
    if (donnees.votes?.[participantId]) return; // déjà voté — immuable
    const nouvelles = { ...donnees, votes: { ...donnees.votes, [participantId]: option } };
    await supabase.from("contributions").update({ question: JSON.stringify(nouvelles) }).eq("id", contribId);
    await supabase.from("votes_reponses").insert({ souvenir_id: contribId, participant_id: participantId, option_choisie: option }).catch(() => {});
    setCapsules(l => l.map(c => c.id !== capsuleId ? c : {
      ...c, contributions: c.contributions.map(ct =>
        ct.id !== contribId ? ct : { ...ct, question: JSON.stringify(nouvelles) }
      ),
    }));
  }

  async function reagir(capsuleId, contribId, reactionId) {
    const capsule = capsules.find(c => c.id === capsuleId);
    const participant = capsule?.participants.find(p => p.userId === session.user.id);
    if (!participant) return;
    const contrib = capsule.contributions.find(ct => ct.id === contribId);
    const ancienneReaction = contrib?.reactionsDétail?.[participant.id];

    // Même emoji : déselectionner
    if (ancienneReaction === reactionId) {
      await supabase.from("reactions")
        .delete()
        .eq("contribution_id", contribId)
        .eq("participant_id", participant.id);
      setCapsules(l => l.map(c => c.id !== capsuleId ? c : {
        ...c, contributions: c.contributions.map(ct =>
          ct.id !== contribId ? ct : {
            ...ct,
            reactions: { ...ct.reactions, [reactionId]: Math.max(0, (ct.reactions?.[reactionId] || 0) - 1) },
            reactionsDétail: Object.fromEntries(Object.entries(ct.reactionsDétail || {}).filter(([k]) => k !== participant.id)),
          }
        ),
      }));
      return;
    }

    // Supprimer l'ancienne réaction si elle existe
    if (ancienneReaction) {
      await supabase.from("reactions")
        .delete()
        .eq("contribution_id", contribId)
        .eq("participant_id", participant.id);
    }

    // Insérer la nouvelle
    await supabase.from("reactions").insert({
      contribution_id: contribId, participant_id: participant.id, type: reactionId,
    });
    setCapsules(l => l.map(c => c.id !== capsuleId ? c : {
      ...c, contributions: c.contributions.map(ct =>
        ct.id !== contribId ? ct : {
          ...ct,
          reactions: {
            ...ct.reactions,
            ...(ancienneReaction ? { [ancienneReaction]: Math.max(0, (ct.reactions?.[ancienneReaction] || 0) - 1) } : {}),
            [reactionId]: (ct.reactions?.[reactionId] || 0) + 1,
          },
          reactionsDétail: { ...(ct.reactionsDétail || {}), [participant.id]: reactionId },
        }
      ),
    }));
  }

  async function acheterUpgradeMedia(upgradeType, capsuleId) {
    const { data, error } = await supabase.functions.invoke("create-checkout-session", {
      body: {
        type: upgradeType,
        user_id: moi?.id,
        capsule_id: capsuleId,
        success_url: `${window.location.origin}?checkout=success`,
        cancel_url:  `${window.location.origin}?checkout=cancelled`,
      },
    });
    if (error || !data?.url) throw new Error(error?.message || "Erreur création session");
    window.location.href = data.url;
  }

  const capsuleActive = capsules.find(c => c.id === capsuleActiveId);

  if (maintenance) return (
    <CadreTelephone vars={vars}>
      <div style={{ ...S.ecran, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 20 }}>
        <div style={{ fontSize: 56 }}>🔧</div>
        <h2 style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 800, fontSize: 22, color: COULEURS.encre }}>
          Maintenance en cours
        </h2>
        <p style={{ fontSize: 14, color: COULEURS.doux, lineHeight: 1.6, maxWidth: 260 }}>
          {maintenanceMsg}
        </p>
      </div>
    </CadreTelephone>
  );

  if (!sessionPrete || chargement) return <CadreTelephone vars={vars}><div style={S.ecran} /></CadreTelephone>;
  if (reinitMdp) return <EcranNouveauMotDePasse onTermine={() => setReinitMdp(false)} />;
  if (!session) {
    const papyId = (() => { try { return localStorage.getItem("blooom_papy_capsule_id"); } catch { return null; } })();
    if (papyId) return <EcranPapyStandalone capsuleId={papyId} />;
    return <EcranConnexion />;
  }
  if (!moi) return <CadreTelephone vars={vars}><EcranBienvenue creerMoi={creerMoi} /></CadreTelephone>;

  // La barre de navigation n'apparaît que sur les écrans principaux
  const afficherOnglets = ["capsules", "creer", "papy", "profil", "succes_pack", "succes_mariage", "succes_papy"].includes(ecran);
  const hasPapy = capsules.some(c =>
    c.formule === "papy" &&
    (c.createurId === moi?.id || c.participants.some(p => p.userId === moi?.id))
  );

  return (
    <CadreTelephone vars={vars}>
      {ecran === "capsules" && <EcranCapsules capsules={capsules} moi={moi} allerVers={allerVers} notifications={notifications} onOuvrirNotifs={() => setPanneauNotifs(true)} />}
      {ecran === "profil"          && <EcranProfil moi={moi} capsules={capsules} gami={gami} modifierMoi={modifierMoi} allerVers={allerVers} seDeconnecter={seDeconnecter} />}
      {ecran === "modifier_profil" && <EcranModifierProfil moi={moi} modifierMoi={modifierMoi} allerVers={allerVers} />}
      {ecran === "confidentialite" && <EcranConfidentialite allerVers={allerVers} session={session} onSupprimerCompte={supprimerCompte} />}
      {ecran === "abonnement"   && <EcranAbonnement moi={moi} allerVers={allerVers} />}
      {ecran === "offrir"       && <EcranOffrir moi={moi} allerVers={allerVers} />}
      {ecran === "activer_code" && <EcranActiverCode moi={moi} allerVers={allerVers} onCodeActive={chargerDonnees} />}
      {ecran === "creer" && <EcranCreer moi={moi} capsules={capsules} allerVers={allerVers} creerCapsule={creerCapsule} onPaywall={setPaywallType} ecranPrecedent={ecranPrecedent} />}
      {ecran === "parametres" && <EcranParametres palette={palette} mode={mode} onPalette={changerPalette} onMode={changerMode} allerVers={allerVers} ecranPrecedent={ecranPrecedent} />}
      {ecran === "creation" && <EcranCreation allerVers={allerVers} creerCapsule={creerCapsule} />}
      {ecran === "rejoindre" && (
        <EcranRejoindre moi={moi} allerVers={allerVers}
          rechercherCapsule={rechercherCapsule} rejoindreCapsule={rejoindreCapsuleParCode}
          codePrefill={codePrefill} onPrefillUsed={() => setCodePrefill(null)} />
      )}
      {ecran === "inviter" && <EcranInviter capsule={capsuleActive} allerVers={allerVers} />}
      {ecran === "participant" && (
        <EcranEditionParticipant capsule={capsuleActive} participantActifId={participantActifId}
          ajouterParticipant={ajouterParticipant} modifierParticipant={modifierParticipant}
          retour={retourParticipant} allerVers={allerVers} />
      )}
      {ecran === "detail" && (
        <EcranDetail capsule={capsuleActive} moi={moi} allerVers={allerVers} ouvrirCapsule={ouvrirCapsule}
          modifierDate={modifierDate} modifierNom={modifierNom} modifierCouverture={modifierCouverture}
          editerParticipant={editerParticipant} voterPari={voterPari} voterSouvenir={voterSouvenir} onPaywall={setPaywallType}
          insererNotification={insererNotification} supprimerCapsule={supprimerCapsule}
          quitterCapsule={quitterCapsule} marierParticipant={marierParticipant}
          capsulesLiees={capsuleActive?.formule === "papy"
            ? capsules.filter(c => c.formule === "papy" && c.id !== capsuleActive.id && c.participants.some(p => p.userId === moi?.id))
            : undefined} />
      )}
      {ecran === "contribution" && (
        <EcranContribution capsule={capsuleActive} moi={moi} allerVers={allerVers}
          ajouterContribution={ajouterContribution} editerParticipant={editerParticipant}
          onUpgradeMedia={(capsuleId) => allerVers("upgrade_media", capsuleId)} />
      )}
      {ecran === "upgrade_media" && (
        <EcranUpgradeMedia capsule={capsuleActive} allerVers={allerVers} acheterUpgradeMedia={acheterUpgradeMedia} ecranPrecedent={ecranPrecedent} />
      )}
      {ecran === "succes_pack" && (
        <EcranSuccesPack creerCapsule={creerCapsule} allerVers={allerVers} capsuleWebhookId={capsuleWebhookId} setCapsules={setCapsules} />
      )}
      {ecran === "succes_mariage" && (
        <EcranSuccesMariage creerCapsule={creerCapsule} allerVers={allerVers} capsuleWebhookId={capsuleWebhookId} setCapsules={setCapsules} />
      )}
      {ecran === "succes_papy" && (
        <EcranSuccesPapy creerCapsule={creerCapsule} allerVers={allerVers} />
      )}
      {ecran === "papy" && (
        <EcranPapy capsules={capsules} moi={moi} allerVers={allerVers}
          creerCapsule={creerCapsule} modifierNom={modifierNom} modifierCouverture={modifierCouverture}
          supprimerCapsule={supprimerCapsule} />
      )}
      {ecran === "tarifs_impression" && (
        <EcranTarifsImpression capsule={capsuleActive} allerVers={allerVers} />
      )}
      {ecran === "choix_role_papy" && (
        <EcranChoixRolePapy capsule={capsuleActive} allerVers={allerVers} />
      )}
      {ecran === "vue_papy_simple" && (
        <EcranVuePapySimple capsule={capsuleActive} capsules={capsules} moi={moi} allerVers={allerVers} />
      )}
      {ecran === "qr_mariage" && (
        <EcranQrMariage capsule={capsuleActive} allerVers={allerVers} />
      )}

      {ecran === "ouverture" && (() => {
        if (!capsuleActive) { allerVers("capsules"); return null; }
        if (capsuleActive.formule === "mariage") {
          const mp = capsuleActive.participants.find(p => p.userId === moi?.id);
          if (!mp?.marie) { allerVers("detail", capsuleActive.id); return null; }
        }
        return <EcranOuverture capsule={capsuleActive} moi={moi} allerVers={allerVers} reagir={reagir} voterPari={voterPari} voterSouvenir={voterSouvenir} voterFavori={voterFavori} premiereFois={ecranPrecedent === "animation_ouverture"} />;
      })()}
      {ecran === "animation_ouverture" && capsuleActive?.formule === "mariage" && <AnimationOuvertureMariage capsule={capsuleActive} allerVers={allerVers} />}
      {ecran === "animation_ouverture" && capsuleActive?.formule !== "mariage" && <AnimationOuverture capsule={capsuleActive} allerVers={allerVers} />}
      {ecran === "senior" && <EcranSenior capsule={capsuleActive} moi={moi} allerVers={allerVers} reagir={reagir} />}
      {ecran === "papy_simple" && (
        <EcranPapySimple capsule={capsuleActive} allerVers={allerVers}
          autresCapsules={capsules.filter(c => c.id !== capsuleActive?.id)} />
      )}
      {ecran === "apercu_papy" && (
        <EcranApercuPapy allerVers={allerVers} />
      )}
      {ecran === "admin" && moi?.isAdmin && (
        <EcranAdmin allerVers={allerVers} />
      )}
      {ecran === "badges" && <EcranBadges gami={gami} allerVers={allerVers} />}

      {gamiUnlock && <GamiToast unlock={gamiUnlock} onFermer={() => setGamiUnlock(null)} />}

      {afficherOnglets && <BarreOnglets actif={ecran} allerVers={allerVers} hasPapy={hasPapy} />}

      {panneauNotifs && (
        <PanneauNotifications notifications={notifications} onMarquerLue={marquerLue}
          onFermer={() => setPanneauNotifs(false)} allerVers={allerVers} />
      )}
      {paywallType && (
        <ModalPaywall type={paywallType} moi={moi} allerVers={allerVers} onFermer={() => setPaywallType(null)} />
      )}
      {notifPari && (
        <div style={{ position: "absolute", bottom: afficherOnglets ? 84 : 16, left: 12, right: 12, zIndex: 300,
          animation: "fadeSlideUp 0.4s cubic-bezier(0.34,1.56,0.64,1) both" }}>
          <div style={{ background: "#fff", borderRadius: 18, padding: "14px 14px 14px 16px",
            boxShadow: "0 8px 32px rgba(46,34,48,0.18)", display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 26, flexShrink: 0 }}>🎲</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: COULEURS.encre }}>Pari en attente !</div>
              <div style={{ fontSize: 12, color: COULEURS.doux, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                Tu n'as pas encore voté dans « {notifPari.capsuleNom} »
              </div>
            </div>
            <button onClick={() => {
              try { localStorage.setItem(notifPari.cle, "1"); } catch {}
              setNotifPari(null);
              allerVers("ouverture", notifPari.capsuleId);
            }} style={{ background: DEGRADE, color: "#fff", border: "none", borderRadius: 12, padding: "8px 12px",
              fontSize: 12, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
              Voter →
            </button>
            <button onClick={() => {
              try { localStorage.setItem(notifPari.cle, "1"); } catch {}
              setNotifPari(null);
            }} style={{ background: "none", border: "none", color: COULEURS.doux, fontSize: 18, cursor: "pointer",
              padding: "0 2px", lineHeight: 1, flexShrink: 0 }}>
              ✕
            </button>
          </div>
        </div>
      )}
    </CadreTelephone>
  );
}

// ============================================================================
//  CADRE TÉLÉPHONE + polices modernes.
// ============================================================================
function CadreTelephone({ children, vars }) {
  const cssVars = vars || buildVars(
    (() => { try { return localStorage.getItem("blooom_palette") || "aurora"; } catch { return "aurora"; } })(),
    (() => { try { return localStorage.getItem("blooom_mode") || "clair"; } catch { return "clair"; } })()
  );
  return (
    <div style={S.fondPage}>
      <style>{`:root{${cssVars}}`}</style>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,600;12..96,700;12..96,800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        ::-webkit-scrollbar { width: 0; }
        .scrollbar-pack::-webkit-scrollbar { width: 4px; }
        .scrollbar-pack::-webkit-scrollbar-track { background: transparent; }
        .scrollbar-pack::-webkit-scrollbar-thumb { background: rgba(46,34,48,0.18); border-radius: 99px; }
        .scrollbar-pack { scrollbar-width: thin; scrollbar-color: rgba(46,34,48,0.18) transparent; }
        input,textarea { color-scheme: light dark; }
        @keyframes slideUp { from { transform: translateY(40px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes pulseCercle { 0%,100% { transform: scale(0.75); opacity: 0.5; } 50% { transform: scale(1.2); opacity: 1; } }
        @keyframes diceRoll { from { transform: rotate(-20deg) scale(1); } to { transform: rotate(20deg) scale(1.15); } }
        @keyframes pulseLogo { 0%,100% { transform: scale(1); opacity: 0.9; } 50% { transform: scale(1.12); opacity: 1; } }
        @keyframes zoomDoux { from { transform: scale(0.4); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        @keyframes avatarRebond { 0% { transform: scale(0.3); opacity: 0; } 60% { transform: scale(1.2); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
        @keyframes logoExplosion { 0% { transform: scale(0) rotate(-20deg); opacity: 0; } 60% { transform: scale(1.35) rotate(8deg); opacity: 1; } 100% { transform: scale(1) rotate(0deg); opacity: 1; } }
        @keyframes clignote { 0%,100% { opacity: 1; } 50% { opacity: 0; } }
        @keyframes fadeSlideUp { from { transform: translateY(24px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes flotterReaction { 0% { transform: translateY(0) scale(1); opacity: 1; } 80% { opacity: 1; } 100% { transform: translateY(-140px) scale(1.5); opacity: 0; } }
        /* ---- Animations de révélation par type de souvenir ---- */
        /* Pulsation douce — suspense, étoiles */
        @keyframes animPulseDoux { 0%,100% { transform:scale(1); opacity:0.85; } 50% { transform:scale(1.1); opacity:1; } }
        /* Tremblement nerveux — cadenas secret, dé pari */
        @keyframes animTremblement { 0%,100% { transform:translateX(0); } 20% { transform:translateX(-5px) rotate(-3deg); } 40% { transform:translateX(5px) rotate(3deg); } 60% { transform:translateX(-3px); } 80% { transform:translateX(3px); } }
        /* Flash blanc intense — révélation photo, pari */
        @keyframes animFlashBlanc { 0%,100% { filter:brightness(1); } 50% { filter:brightness(4); } }
        /* Note de musique qui monte et disparaît */
        @keyframes animNoteFlotante { 0% { transform:translateY(0) rotate(-10deg); opacity:0; } 25% { opacity:1; } 100% { transform:translateY(-90px) rotate(12deg); opacity:0; } }
        /* Particule d'artifice — lit --dx et --dy pour direction */
        @keyframes animParticleOut { 0% { transform:translate(-50%,-50%) scale(1.5); opacity:1; } 100% { transform:translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) scale(0); opacity:0; } }
        /* Onde sonore concentrique */
        @keyframes animOndeExpand { 0% { transform:scale(1); opacity:0.7; } 100% { transform:scale(3.8); opacity:0; } }
        /* Confetti qui tombe depuis le haut */
        @keyframes animConfetti { 0% { transform:translateY(0) rotate(0deg); opacity:1; } 100% { transform:translateY(260px) rotate(400deg); opacity:0; } }
        /* Rayon de soleil qui tourne — météo soleil */
        @keyframes animRayonSoleil { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
        /* Goutte de pluie */
        @keyframes animGoutte { 0% { transform:translateY(-10px) scaleY(1); opacity:0; } 15% { opacity:0.7; } 100% { transform:translateY(260px) scaleY(1.4); opacity:0; } }
        /* Flocon de neige */
        @keyframes animFlocon { 0% { transform:translateY(-10px) rotate(0deg); opacity:0; } 15% { opacity:0.8; } 100% { transform:translateY(240px) rotate(200deg); opacity:0; } }
        /* Clignotement curseur machine à écrire */
        @keyframes animCurseurBlink { 0%,100% { opacity:1; } 50% { opacity:0; } }
        /* Entrée par le bas — player vocal, textes */
        @keyframes animEntreeBas { from { transform:translateY(55px); opacity:0; } to { transform:translateY(0); opacity:1; } }
        /* Zoom élastique — révélations fortes */
        @keyframes animZoomElastique { 0% { transform:scale(0); opacity:0; } 55% { transform:scale(1.18); } 100% { transform:scale(1); opacity:1; } }
        /* Clap de cinéma qui tombe depuis le haut */
        @keyframes animClapBas { from { transform:translateY(-90px) rotate(-4deg); opacity:0; } to { transform:translateY(0) rotate(0); opacity:1; } }
        /* Rideau gauche qui s'écarte */
        @keyframes animRideauGauche { from { transform:translateX(0); } to { transform:translateX(-100%); } }
        /* Rideau droit qui s'écarte */
        @keyframes animRideauDroite { from { transform:translateX(0); } to { transform:translateX(100%); } }
        /* Pochette album en rotation 3D depuis le haut */
        @keyframes animRotation3D { 0% { transform:rotateX(90deg) scale(0.6); opacity:0; } 100% { transform:rotateX(0deg) scale(1); opacity:1; } }
        /* Glissement depuis la droite */
        @keyframes animSlideGauche { from { transform:translateX(55px); opacity:0; } to { transform:translateX(0); opacity:1; } }
        /* Dé qui tourne — suspense pari */
        @keyframes animDeRotation { 0% { transform:rotate(0deg) scale(1); } 25% { transform:rotate(90deg) scale(1.12); } 50% { transform:rotate(180deg) scale(1); } 75% { transform:rotate(270deg) scale(1.12); } 100% { transform:rotate(360deg) scale(1); } }
        /* Trait de pinceau de gauche à droite — dessin */
        @keyframes animTraitPinceau { 0% { width:0; opacity:0; } 50% { opacity:1; } 100% { width:90%; opacity:0; } }
      `}</style>
      {/* La bannière cookies est positionnée en absolute dans le cadre téléphone —
          elle apparaît sur tous les écrans à la première visite. */}
      <div style={S.telephone}>
        {children}
        <BanniereCookies />
      </div>
    </div>
  );
}

// ============================================================================
//  THÈMES & PALETTES — CSS custom properties injectées dans :root
// ============================================================================
const PALETTES_THEME = [
  { id: "aurora",  nom: "Aurora",  icone: "🌸", a1: "#FF8A3D", a2: "#FF5C9D", a3: "#C65CE8", f1: "#FFE9D6", f2: "#FFDCE5", f3: "#FBE7FF", ombre: "rgba(255,92,157,0.35)" },
  { id: "ocean",   nom: "Océan",   icone: "🌊", a1: "#0EA5E9", a2: "#6366F1", a3: "#8B5CF6", f1: "#E0F2FE", f2: "#EDE9FE", f3: "#F5F3FF", ombre: "rgba(99,102,241,0.35)" },
  { id: "foret",   nom: "Forêt",   icone: "🌿", a1: "#10B981", a2: "#0D9488", a3: "#059669", f1: "#ECFDF5", f2: "#D1FAE5", f3: "#CCFBF1", ombre: "rgba(16,185,129,0.35)" },
  { id: "soleil",  nom: "Soleil",  icone: "☀️", a1: "#F59E0B", a2: "#F97316", a3: "#EF4444", f1: "#FFFBEB", f2: "#FFF7ED", f3: "#FEF2F2", ombre: "rgba(245,158,11,0.35)" },
  { id: "galaxie", nom: "Galaxie", icone: "✨", a1: "#6366F1", a2: "#8B5CF6", a3: "#A78BFA", f1: "#EEF2FF", f2: "#EDE9FE", f3: "#F5F3FF", ombre: "rgba(99,102,241,0.4)" },
];

function buildVars(paletteId, mode) {
  const p = PALETTES_THEME.find(x => x.id === paletteId) || PALETTES_THEME[0];
  if (mode === "sombre") {
    return `--a1:${p.a1};--a2:${p.a2};--a3:${p.a3};--fond1:#1a1020;--fond2:#1e1528;--fond3:#160e2a;--ombre:rgba(0,0,0,0.7);--carte-bg:#261d30;--profond-bg:#0f0a16;--input-bg:#1e1628;--encre:#F0EAF5;--doux:#8070a0;--bordure:#3a2d50;--barre-bg:rgba(26,16,40,0.97);`;
  }
  return `--a1:${p.a1};--a2:${p.a2};--a3:${p.a3};--fond1:${p.f1};--fond2:${p.f2};--fond3:${p.f3};--ombre:${p.ombre};--carte-bg:#FFFFFF;--profond-bg:#FFFFFF;--input-bg:#FFFFFF;--encre:#2E2230;--doux:#9B8AA0;--bordure:#F0E6EC;--barre-bg:rgba(255,255,255,0.92);`;
}

// ============================================================================
//  STYLES — les valeurs sensibles au thème utilisent des CSS custom properties
// ============================================================================
const COULEURS = { encre: "var(--encre)", doux: "var(--doux)", carte: "var(--carte-bg)", bordure: "var(--bordure)", corail: "var(--a1)", orange: "var(--a1)", or: "#FFC436", rose: "var(--a2)", terre: "var(--a1)" };
const DEGRADE = "linear-gradient(120deg,var(--a1) 0%,var(--a2) 100%)";

const S = {
  fondPage: { minHeight: "100vh", display: "flex", justifyContent: "center", alignItems: "center", background: "#1c1014", padding: 16, fontFamily: "'Plus Jakarta Sans', sans-serif" },
  telephone: { width: 390, maxWidth: "100%", height: 800, maxHeight: "94vh", background: "linear-gradient(170deg,var(--fond1) 0%,var(--fond2) 50%,var(--fond3) 100%)", borderRadius: 42, overflow: "hidden", boxShadow: "0 30px 90px var(--ombre)", border: "10px solid #1c1014", position: "relative" },
  ecran: { height: "100%", overflowY: "auto", padding: "26px 20px 96px", display: "flex", flexDirection: "column", color: COULEURS.encre },

  enteteAccueil: { marginBottom: 14 },
  surtitre: { color: COULEURS.doux, fontSize: 15, margin: 0, fontWeight: 600 },
  titrePage: { fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 34, fontWeight: 800, margin: "2px 0 0", letterSpacing: "-0.02em" },
  enteteRetour: { display: "flex", alignItems: "center", gap: 12, marginBottom: 16 },
  fleche: { background: "var(--carte-bg)", color: COULEURS.encre, width: 40, height: 40, borderRadius: 14, fontSize: 20, cursor: "pointer", border: "none", boxShadow: "0 3px 10px rgba(46,34,48,0.1)" },
  enteteTitre: { fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 21, fontWeight: 700 },

  videAccueil: { textAlign: "center", marginTop: 40, padding: "0 10px" },
  videTexte: { color: COULEURS.doux, fontSize: 16, lineHeight: 1.5 },

  carteCapsule: { background: "var(--carte-bg)", border: "none", borderRadius: 22, padding: 0, marginBottom: 14, cursor: "pointer", width: "100%", overflow: "hidden", boxShadow: "0 8px 24px rgba(46,34,48,0.1)" },
  carteCouverture: { height: 110, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", color: "#fff" },
  cartePastille: { position: "absolute", top: 10, right: 10, background: "rgba(255,255,255,0.15)", color: "#fff", borderRadius: 999, minWidth: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600, padding: "0 9px", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.3)", letterSpacing: 0.5 },
  carteNom: { fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 19, fontWeight: 700, color: COULEURS.encre },
  carteSous: { color: COULEURS.doux, fontSize: 14, marginTop: 2, fontWeight: 500 },

  carteMembre: { display: "flex", alignItems: "center", gap: 14, background: "var(--profond-bg)", border: "none", borderRadius: 18, padding: 14, marginBottom: 10, cursor: "pointer", width: "100%", boxShadow: "0 4px 14px rgba(46,34,48,0.07)" },
  membreNom: { fontWeight: 700, fontSize: 16, display: "flex", alignItems: "center", gap: 8, color: COULEURS.encre },
  membreDesc: { color: COULEURS.doux, fontSize: 14, marginTop: 2 },
  badgeVous: { background: DEGRADE, color: "#fff", fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 999 },
  ajoutMembreRond: { width: 44, height: 44, borderRadius: "50%", border: `2px dashed ${COULEURS.doux}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, color: COULEURS.doux },

  label: { fontSize: 14, fontWeight: 700, color: COULEURS.encre, margin: "16px 0 8px" },
  input: { width: "100%", padding: 14, borderRadius: 14, border: "none", background: "var(--input-bg)", fontSize: 16, color: COULEURS.encre, fontFamily: "'Plus Jakarta Sans', sans-serif", boxShadow: "0 2px 8px rgba(46,34,48,0.06)" },
  zoneTexte: { width: "100%", minHeight: 120, padding: 14, borderRadius: 14, border: "none", background: "var(--input-bg)", fontSize: 16, color: COULEURS.encre, fontFamily: "'Plus Jakarta Sans', sans-serif", resize: "vertical", boxShadow: "0 2px 8px rgba(46,34,48,0.06)" },
  aide: { fontSize: 13, color: COULEURS.doux, marginTop: 8, lineHeight: 1.4 },

  zoneCouverture: { display: "flex", alignItems: "center", justifyContent: "center", height: 120, borderRadius: 16, border: `2px dashed ${COULEURS.bordure}`, background: "#fff", cursor: "pointer", overflow: "hidden" },
  couvertureApercu: { width: "100%", height: "100%", objectFit: "cover" },
  detailCouverture: { height: 150, borderRadius: 22, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", color: "#fff", marginBottom: 14, overflow: "hidden" },
  boutonCouverture: { position: "absolute", bottom: 10, right: 10, background: "rgba(0,0,0,0.5)", color: "#fff", borderRadius: 999, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", backdropFilter: "blur(4px)" },

  grilleTypes: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 },
  tuileType: { background: "#fff", border: "2px solid transparent", borderRadius: 14, padding: "12px 6px", cursor: "pointer", textAlign: "center", boxShadow: "0 3px 10px rgba(46,34,48,0.06)", outline: "none", WebkitTapHighlightColor: "transparent", WebkitAppearance: "none" },
  tuileIcone: { width: 40, height: 40, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, margin: "0 auto" },
  tuileTypeNom: { fontSize: 11, fontWeight: 600, marginTop: 6, lineHeight: 1.3 },

  boutonPrincipal: { width: "100%", background: DEGRADE, color: "#fff", border: "none", borderRadius: 16, padding: 16, fontSize: 16, fontWeight: 700, cursor: "pointer", marginTop: 16, fontFamily: "'Plus Jakarta Sans', sans-serif", boxShadow: "0 10px 24px rgba(255,92,157,0.4)" },
  boutonSecondaire: { width: "100%", background: "#fff", color: COULEURS.corail, border: "none", borderRadius: 16, padding: 15, fontSize: 15, fontWeight: 700, cursor: "pointer", marginTop: 12, fontFamily: "'Plus Jakarta Sans', sans-serif", boxShadow: "0 4px 14px rgba(46,34,48,0.08)" },
  boutonInviter: { width: "100%", background: COULEURS.encre, color: "#fff", border: "none", borderRadius: 16, padding: 15, fontSize: 15, fontWeight: 700, cursor: "pointer", marginTop: 12, fontFamily: "'Plus Jakarta Sans', sans-serif" },
  boutonDesactive: { opacity: 0.45, cursor: "not-allowed", boxShadow: "none" },
  boutonOuvrir: { width: "100%", background: COULEURS.encre, color: "#fff", border: "none", borderRadius: 16, padding: 16, fontSize: 16, fontWeight: 700, cursor: "pointer", marginTop: 12, fontFamily: "'Plus Jakarta Sans', sans-serif" },
  boutonMini: { background: DEGRADE, color: "#fff", border: "none", borderRadius: 12, padding: "10px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer", marginTop: 10 },
  boutonMiniGris: { flex: 1, background: "#F3ECEF", color: COULEURS.encre, border: "none", borderRadius: 12, padding: 10, fontSize: 14, fontWeight: 600, cursor: "pointer" },
  lienDiscret: { background: "none", border: "none", color: COULEURS.corail, fontSize: 14, cursor: "pointer", padding: 0, marginTop: 10, fontWeight: 700, width: "100%" },
  lienCrayon: { background: "none", border: "none", color: COULEURS.corail, fontSize: 13, cursor: "pointer", fontWeight: 700, padding: 0 },

  blocSceau: { background: "var(--carte-bg)", borderRadius: 22, padding: "14px 16px", textAlign: "center", marginBottom: 10, boxShadow: "0 6px 20px rgba(46,34,48,0.08)" },
  sceauJours: { fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 48, fontWeight: 800, background: DEGRADE, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", lineHeight: 1 },
  sceauEtat: { fontSize: 16, color: COULEURS.encre, marginTop: 4, fontWeight: 600 },
  sceauDate: { fontSize: 14, color: COULEURS.doux, marginTop: 6 },

  statsLigne: { display: "flex", gap: 12 },
  statBloc: { flex: 1, background: "var(--profond-bg)", borderRadius: 16, padding: 14, textAlign: "center", boxShadow: "0 4px 14px rgba(46,34,48,0.06)" },
  statChiffre: { fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 26, fontWeight: 800, color: COULEURS.encre },
  statLabel: { fontSize: 13, color: COULEURS.doux, fontWeight: 500 },

  // Rejoindre / inviter
  carteTrouvee: { background: "var(--carte-bg)", borderRadius: 16, padding: 16, boxShadow: "0 4px 14px rgba(46,34,48,0.08)" },
  blocCode: { background: "var(--carte-bg)", borderRadius: 20, padding: "22px", textAlign: "center", marginTop: 10, boxShadow: "0 6px 20px rgba(46,34,48,0.08)" },
  codeLabel: { fontSize: 13, color: COULEURS.doux, fontWeight: 600 },
  codeValeur: { fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 44, fontWeight: 800, letterSpacing: 6, background: DEGRADE, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", margin: "4px 0 8px" },
  blocLien: { background: "var(--input-bg)", borderRadius: 14, padding: 14, marginTop: 12, boxShadow: "0 2px 8px rgba(46,34,48,0.06)" },

  rangeeAuteurs: { display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 },
  choixAuteur: { display: "flex", flexDirection: "column", alignItems: "center", gap: 5, background: "none", border: "none", cursor: "pointer", padding: 6, borderRadius: 14, minWidth: 66 },
  choixAuteurActif: { background: "#fff", boxShadow: "0 4px 12px rgba(255,92,157,0.25)" },
  choixAuteurNom: { fontSize: 12, color: COULEURS.encre, fontWeight: 600, maxWidth: 62, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  choixContrib: { display: "flex", alignItems: "center", width: "100%", background: "var(--carte-bg)", border: "none", borderRadius: 16, padding: 16, marginBottom: 10, cursor: "pointer", fontSize: 16, fontWeight: 600, color: COULEURS.encre, fontFamily: "'Plus Jakarta Sans', sans-serif", boxShadow: "0 3px 10px rgba(46,34,48,0.06)" },
  apercuMedia: { width: "100%", borderRadius: 14, marginTop: 10, display: "block" },

  rangeeFiltres: { display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 },
  pastilleFiltre: { flexShrink: 0, background: "var(--carte-bg)", border: "none", borderRadius: 999, padding: "9px 15px", fontSize: 13, fontWeight: 600, cursor: "pointer", color: COULEURS.encre, boxShadow: "0 2px 8px rgba(46,34,48,0.06)" },
  pastilleFiltreActive: { background: DEGRADE, color: "#fff" },
  pastilleAmbiance: { flexShrink: 0, border: "none", borderRadius: 999, padding: "9px 17px", fontSize: 13, fontWeight: 700, cursor: "pointer" },

  progression: { textAlign: "center", color: COULEURS.doux, fontSize: 14, marginBottom: 12, fontWeight: 600 },
  carteSouvenir: { background: "var(--carte-bg)", borderRadius: 24, padding: 20, flex: 1, boxShadow: "0 8px 24px rgba(46,34,48,0.1)" },
  souvenirEntete: { display: "flex", alignItems: "center", gap: 10, marginBottom: 14 },
  souvenirDate: { fontSize: 13, color: COULEURS.doux },
  souvenirMedia: { width: "100%", borderRadius: 14, marginBottom: 12, display: "block" },
  souvenirTexte: { fontSize: 17, lineHeight: 1.6 },
  souvenirMessageAmbiance: { fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 20, fontWeight: 600, lineHeight: 1.5, padding: 22, borderRadius: 18, marginTop: 4 },
  ligneReactions: { display: "flex", gap: 8, marginTop: 18 },
  boutonReaction: { flex: 1, background: "#FBF3F7", border: "none", borderRadius: 14, padding: 11, fontSize: 18, cursor: "pointer" },
  reactionNb: { fontSize: 14, marginLeft: 4, color: COULEURS.doux, fontWeight: 600 },
  navOuverture: { display: "flex", gap: 12, marginTop: 16 },
  boutonNav: { flex: 1, background: "var(--carte-bg)", border: "none", borderRadius: 14, padding: 14, fontSize: 15, fontWeight: 700, color: COULEURS.encre, cursor: "pointer", fontFamily: "'Plus Jakarta Sans', sans-serif", boxShadow: "0 3px 10px rgba(46,34,48,0.06)" },

  finTitre: { fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 26, fontWeight: 800, margin: "10px 0 6px" },
  finTexte: { color: COULEURS.doux, fontSize: 15, marginBottom: 22, lineHeight: 1.5 },
  carteAlbum: { width: "100%", textAlign: "left", cursor: "pointer", border: "none", background: DEGRADE, color: "#fff", borderRadius: 22, padding: 22, boxShadow: "0 14px 34px rgba(255,92,157,0.4)" },
  albumTitre: { fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 21, fontWeight: 700 },
  albumSous: { fontSize: 14, opacity: 0.92, marginTop: 6, lineHeight: 1.5 },
  albumFleche: { fontSize: 15, fontWeight: 700, marginTop: 14 },
  albumConfirme: { background: "var(--carte-bg)", color: "#2E7D55", borderRadius: 18, padding: 18, fontSize: 15, lineHeight: 1.5, boxShadow: "0 4px 14px rgba(46,34,48,0.08)" },

  boutonEnregistrer: { width: "100%", background: "#FF3B30", color: "#fff", border: "none", borderRadius: 16, padding: 18, fontSize: 16, fontWeight: 700, cursor: "pointer", marginTop: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, fontFamily: "'Plus Jakarta Sans', sans-serif" },
  blocEnregistrement: { display: "flex", flexDirection: "column", alignItems: "center", gap: 12, background: "#FFF0F0", borderRadius: 16, padding: "18px 16px", marginTop: 12 },
  pointRouge: { width: 14, height: 14, borderRadius: "50%", background: "#FF3B30", animation: "pulse 1s infinite" },
  lecteurAudio: { background: "#F8F0F5", borderRadius: 16, padding: "20px 16px", textAlign: "center", marginBottom: 12 },

  barreOnglets: { position: "absolute", bottom: 0, left: 0, right: 0, height: 72, background: "var(--barre-bg)", borderTop: `1px solid ${COULEURS.bordure}`, display: "flex", backdropFilter: "blur(10px)" },
  onglet: { flex: 1, background: "none", border: "none", cursor: "pointer", color: COULEURS.doux, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2 },
  ongletActif: { color: "var(--a2)" },
  ongletNom: { fontSize: 11, fontWeight: 700 },
};
