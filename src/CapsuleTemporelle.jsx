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
  { id: "defi_sport",nom: "Défi sportif",     icone: "🏃", dureeAns: 1,   teinte: "#FF6B5E" },

  // --- Nouveaux types : famille & transmission ---
  { id: "grossesse",        nom: "Grossesse",         icone: "🤰", dureeAns: 1,   teinte: "#FF5C9D" },
  { id: "premiers_pas",     nom: "Premiers pas",      icone: "👶", dureeAns: 3,   teinte: "#FFC436" },
  { id: "rentree_maternelle",nom: "Première rentrée", icone: "🎒", dureeAns: 12,  teinte: "#9B5DE5" },
  { id: "retraite",         nom: "Retraite",          icone: "👴", dureeAns: 5,   teinte: "#22C7B8" },
  { id: "memoire",          nom: "Mémoire",           icone: "🕯️", dureeAns: 999, teinte: "#9B8AA0" },
];


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
    <div style={{ background: "#fff", borderRadius: 16, padding: "14px 16px",
      boxShadow: "0 4px 14px rgba(46,34,48,0.07)", textAlign: "center", marginTop: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: COULEURS.doux, letterSpacing: 1, marginBottom: 6 }}>
        EN CE MOMENT SUR BLOOOM
      </div>
      <div style={{ fontSize: 14, color: COULEURS.encre, lineHeight: 1.55,
        opacity: visible ? 1 : 0, transition: "opacity 0.35s ease" }}>
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
    <p style={{ textAlign: "center", fontSize: 12, color: COULEURS.doux,
      fontStyle: "italic", margin: "0 0 12px", lineHeight: 1.5 }}>
      {STATS_SOCIALES[idx]}
    </p>
  );
}

// Carte statique (EcranDetail sans souvenirs, EcranConnexion) : tirage unique,
// plus sobre que la carte rotative — pas d'animation pour ne pas surcharger.
function CarteStatStatique() {
  const [idx] = React.useState(() => piocherStat());
  return (
    <div style={{ background: "var(--profond-bg)", borderRadius: 16, padding: "14px 16px",
      boxShadow: "0 4px 14px rgba(46,34,48,0.07)", textAlign: "center", marginTop: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: COULEURS.doux, letterSpacing: 1, marginBottom: 6 }}>
        EN CE MOMENT SUR BLOOOM
      </div>
      <div style={{ fontSize: 14, color: COULEURS.encre, lineHeight: 1.55 }}>
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
  { id: "une_du_jour",      nom: "La une du jour",          icone: "📰" },
  { id: "meteo",            nom: "La météo du jour",        icone: "🌤️" },
  { id: "chanson",          nom: "La chanson du moment",    icone: "🎵" },
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

// Construit le lien de partage à partir d'un code. Domaine d'exemple :
// EN PROD, ce lien doit être un "lien universel" qui ouvre l'app installée.
function lienPartage(code) {
  return `https://capsule.app/rejoindre?code=${code}`;
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
    id: p.id,
    prenom: p.prenom,
    description: p.description || "",
    photo: p.photo_url || null,
    couleur: p.couleur || COULEURS_AVATAR[0],
    // Parrainage
    codeParrain:   p.code_parrain   || null,
    plusExpiresAt: p.plus_expires_at || null,
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
    id: c.id,
    nom: c.nom,
    type: c.type,
    dateOuverture: c.date_ouverture || null,
    couverture: c.couverture_url || null,
    dateCreation: c.created_at,
    ouverte: c.ouverte,
    code: c.code,
    createurId: c.created_by || null,
    participants: (c.participants || []).map(normaliserParticipant),
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

function EcranParametres({ palette, mode, onPalette, onMode }) {
  return (
    <div style={S.ecran}>
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

function BarreOnglets({ actif, allerVers }) {
  const onglets = [
    { cle: "capsules",   nom: "Capsules",   icone: "📦" },
    { cle: "profil",     nom: "Profil",     icone: "👤" },
    { cle: "parametres", nom: "Paramètres", icone: "⚙️" },
  ];
  return (
    <div style={S.barreOnglets}>
      {onglets.map((o) => (
        <button key={o.cle} style={{ ...S.onglet, ...(actif === o.cle ? S.ongletActif : {}) }}
          onClick={() => allerVers(o.cle)}>
          <div style={{ fontSize: 20 }}>{o.icone}</div>
          <div style={S.ongletNom}>{o.nom}</div>
        </button>
      ))}
    </div>
  );
}

// ============================================================================
//  SÉLECTEUR DE DATE — colonnes "tambour" (drum-roll), style iOS.
// ============================================================================

function ColonnePicker({ items, selected, onSelect, renderItem, flex = 1 }) {
  const ITEM_H = 40;
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
              fontSize: dist === 0 ? 16 : 13, fontWeight: dist === 0 ? 700 : 400,
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
      <div style={{ display: "flex", borderBottom: `1px solid ${COULEURS.bordure}`, padding: "7px 0 6px" }}>
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
function EcranQuizOuverture({ capsule, allerVers, onRepondre }) {
  const vraiNb = capsule?.contributions?.length || 0;
  const [repondu, setRepondu] = React.useState(false);
  const [choix, setChoix] = React.useState(null);

  const propositions = React.useMemo(() => {
    const fausses = new Set();
    while (fausses.size < 3) {
      const ecart = Math.floor(Math.random() * 7) + 1;
      const val = Math.max(1, vraiNb + (Math.random() > 0.5 ? ecart : -ecart));
      if (val !== vraiNb) fausses.add(val);
    }
    return [...fausses, vraiNb].sort(() => Math.random() - 0.5);
  }, [vraiNb]);

  function choisir(val) {
    if (repondu) return;
    setChoix(val);
    setRepondu(true);
    onRepondre(val);
  }

  if (!capsule) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", justifyContent: "center", alignItems: "center", padding: "0 24px", textAlign: "center" }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🔮</div>
      <h2 style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 22, fontWeight: 800, color: "#2E2230", margin: "0 0 10px" }}>
        Quiz d'ouverture
      </h2>
      <p style={{ fontSize: 15, color: "#9B8AA0", marginBottom: 28, lineHeight: 1.6, margin: "0 0 28px" }}>
        Combien de souvenirs y a-t-il dans <strong style={{ color: "#2E2230" }}>{capsule.nom}</strong> ?
      </p>
      <div style={{ width: "100%", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
        {propositions.map(val => {
          let bg = "#fff", color = "#2E2230", border = "2px solid #f0ecf1";
          if (repondu) {
            if (val === vraiNb) { bg = "#e8f8f0"; color = "#1a7a4b"; border = "2px solid #1a7a4b"; }
            else if (val === choix) { bg = "#ffeef0"; color = "#c0392b"; border = "2px solid #e74c3c"; }
          }
          return (
            <button key={val} onClick={() => choisir(val)} disabled={repondu}
              style={{ background: bg, border, borderRadius: 16, padding: "20px 8px", fontSize: 28, fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 800, color, cursor: repondu ? "default" : "pointer", transition: "all 0.3s" }}>
              {val}
            </button>
          );
        })}
      </div>
      {repondu && (
        <>
          <p style={{ fontSize: 17, fontWeight: 700, color: choix === vraiNb ? "#1a7a4b" : "#FF6B5E", margin: "0 0 20px" }}>
            {choix === vraiNb ? "🎉 Exact !" : `Raté… c'est ${vraiNb} souvenir${vraiNb > 1 ? "s" : ""} !`}
          </p>
          <button style={{ background: "linear-gradient(120deg,#FF8A3D 0%,#FF5C9D 100%)", color: "#fff", border: "none", borderRadius: 16, padding: "16px 32px", fontSize: 16, fontWeight: 700, cursor: "pointer" }}
            onClick={() => allerVers("animation_ouverture", capsule.id)}>
            Ouvrir la capsule →
          </button>
        </>
      )}
    </div>
  );
}

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
  return (
    <div style={S.ecran}>
      <div style={{ ...S.enteteAccueil, display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <p style={S.surtitre}>Bonjour {moi?.prenom} 👋</p>
          <h1 style={{ ...S.titrePage, margin: 0 }}>Vos capsules</h1>
        </div>
        {onOuvrirNotifs && <ClocheNotifications notifications={notifications} onClick={onOuvrirNotifs} />}
      </div>

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

          return (
            <button key={c.id} style={S.carteCapsule} onClick={() => allerVers("detail", c.id)}>
              <div style={{ ...S.carteCouverture,
                background: c.couverture ? `url(${c.couverture}) center/cover` : teinte }}>
                {!c.couverture && <span style={{ fontSize: 34 }}>{typeInfo?.icone || "✨"}</span>}
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

                {/* Avatars des participants de CETTE capsule (per-capsule). */}
                <div style={{ display: "flex", marginTop: 8, alignItems: "center" }}>
                  {c.participants.slice(0, 5).map((p, i) => (
                    <div key={p.id} style={{ marginLeft: i === 0 ? 0 : -8, border: "2px solid #fff", borderRadius: "50%" }}>
                      <Avatar membre={p} taille={26} />
                    </div>
                  ))}
                  <span style={{ marginLeft: 8, fontSize: 13, color: COULEURS.doux, fontWeight: 600 }}>
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
function EcranProfil({ moi, capsules, modifierMoi }) {
  const [prenom, setPrenom]       = useState(moi.prenom);
  const [description, setDescription] = useState(moi.description || "");
  const [photo, setPhoto]         = useState(moi.photo || null);
  const [enregistre, setEnregistre] = useState(false);

  // Stats parrainage chargées depuis Supabase
  const [statsParrainage, setStatsParrainage] = useState(null);
  const [copie, setCopie] = useState(false);

  const lienParrainage = moi.codeParrain
    ? `https://blooom.app/rejoindre?parrain=${moi.codeParrain}`
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

  async function enregistrer() {
    await modifierMoi({ prenom: prenom.trim(), description: description.trim(), photo });
    setEnregistre(true);
    setTimeout(() => setEnregistre(false), 2000);
  }

  // Partage via Web Share API (mobile) ou copie dans le presse-papiers
  function partagerLienParrainage() {
    if (!lienParrainage) return;
    if (navigator.share) {
      navigator.share({
        title: "Rejoins-moi sur Blooom 🌸",
        text: "Crée une capsule temporelle avec moi. Tu recevras 1 mois de Plus offert !",
        url: lienParrainage,
      }).catch(() => {});
    } else {
      copierLienParrainage();
    }
  }

  function copierLienParrainage() {
    if (!lienParrainage) return;
    navigator.clipboard.writeText(lienParrainage).then(() => {
      setCopie(true);
      setTimeout(() => setCopie(false), 2000);
    }).catch(() => {});
  }

  const plusActif = moi.plusExpiresAt && new Date(moi.plusExpiresAt) > new Date();

  return (
    <div style={S.ecran}>
      <div style={S.enteteAccueil}>
        <p style={S.surtitre}>Votre fiche</p>
        <h1 style={S.titrePage}>Profil</h1>
      </div>
      <div style={{ display: "flex", justifyContent: "center", margin: "8px 0 18px" }}>
        <SelecteurPhotoProfil photo={photo} couleur={moi.couleur} prenom={prenom} onChange={setPhoto} />
      </div>
      <label style={S.label}>Prénom</label>
      <input style={S.input} value={prenom} onChange={(e) => setPrenom(e.target.value)} />
      <label style={S.label}>Description</label>
      <input style={S.input} value={description} onChange={(e) => setDescription(e.target.value)} />
      <button style={{ ...S.boutonPrincipal, ...(prenom.trim() ? {} : S.boutonDesactive) }} disabled={!prenom.trim()} onClick={enregistrer}>
        Enregistrer
      </button>
      {enregistre && <p style={{ ...S.aide, color: "#2E7D55", textAlign: "center" }}>✓ Enregistré</p>}
      <p style={S.aide}>Ces informations vous représentent quand vous créez ou rejoignez une capsule.</p>

      {/* ── Section parrainage ── */}
      <div style={{ marginTop: 32, paddingTop: 24, borderTop: `1px solid ${COULEURS.bordure}` }}>
        <p style={{ ...S.label, marginTop: 0 }}>🎁 Parrainer un ami</p>
        <p style={{ ...S.aide, marginBottom: 16 }}>
          Invitez un ami. S'il crée une capsule dans les 7 jours, vous recevez tous les deux 1 mois de Blooom Plus offert.
        </p>

        {/* Statut Blooom Plus si actif */}
        {plusActif && (
          <div style={{ background: "linear-gradient(135deg,#FF8A3D18,#FF5C9D18)", border: `1px solid ${COULEURS.corail}40`, borderRadius: 14, padding: "10px 14px", marginBottom: 14, textAlign: "center" }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: COULEURS.corail }}>
              ✨ Blooom Plus actif jusqu'au {new Date(moi.plusExpiresAt).toLocaleDateString("fr-FR")}
            </p>
          </div>
        )}

        {/* Code parrain en grand */}
        {moi.codeParrain && (
          <div style={S.blocCode}>
            <p style={S.codeLabel}>Votre code parrain</p>
            <p style={S.codeValeur}>{moi.codeParrain}</p>
            <p style={{ fontSize: 12, color: COULEURS.doux, wordBreak: "break-all", margin: 0, lineHeight: 1.4 }}>
              {lienParrainage}
            </p>
          </div>
        )}

        {/* Bouton partager */}
        <button style={S.boutonPrincipal} onClick={partagerLienParrainage}>
          📤 Partager mon lien
        </button>
        <button style={{ ...S.boutonSecondaire, marginTop: 10 }} onClick={copierLienParrainage}>
          {copie ? "✓ Copié !" : "📋 Copier le lien"}
        </button>

        {/* Stats parrainage */}
        {statsParrainage && (
          <div style={{ ...S.statsLigne, marginTop: 16 }}>
            <div style={S.statBloc}>
              <div style={S.statChiffre}>{statsParrainage.total}</div>
              <div style={S.statLabel}>ami(s) parrainé(s)</div>
            </div>
            <div style={S.statBloc}>
              <div style={S.statChiffre}>{statsParrainage.convertis}</div>
              <div style={S.statLabel}>ont créé une capsule</div>
            </div>
            <div style={S.statBloc}>
              <div style={{ ...S.statChiffre, background: DEGRADE, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                {statsParrainage.convertis}
              </div>
              <div style={S.statLabel}>mois de Plus gagnés</div>
            </div>
          </div>
        )}
      </div>
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
  const peutCreer = nom.trim().length > 0 && type !== null && date !== "";

  return (
    <div style={S.ecran}>
      <EnTeteRetour titre="Nouvelle capsule" onRetour={() => allerVers("capsules")} />

      <label style={S.label}>Nom de la capsule</label>
      <input style={S.input} placeholder="Ex. Mariage de Léa & Tom" value={nom} onChange={(e) => setNom(e.target.value)} />

      <label style={S.label}>Quel type ?</label>
      <div style={S.grilleTypes}>
        {TYPES_CAPSULES.map((t) => (
          <button key={t.id} style={{ ...S.tuileType, ...(type === t.id ? { borderColor: t.teinte, borderWidth: 2, background: t.teinte + "18" } : {}) }}
            onClick={() => choisirType(t)}>
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
            const id = await creerCapsule({ nom: nom.trim(), type, dateOuverture: date || null, couverture });
            if (id) allerVers("detail", id);
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
        await navigator.share({ title: `Rejoins ma capsule "${capsule.nom}"`, text: `Rejoins ma capsule "${capsule.nom}" !\n\nCode : ${capsule.code}\nLien : ${lien}`, url: lien });
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
function EcranDetail({ capsule, moi, allerVers, ouvrirCapsule, modifierDate, modifierCouverture, editerParticipant, voterPari }) {
  const [editionDate, setEditionDate] = useState(false);
  const [nouvelleDate, setNouvelleDate] = useState(capsule?.dateOuverture || "");

  const MAX_AFFICHES = 20;
  const affichesParticipants = React.useMemo(() => {
    if (!capsule) return [];
    const liste = capsule.participants;
    if (liste.length <= MAX_AFFICHES) return liste;
    return [...liste].sort(() => Math.random() - 0.5).slice(0, MAX_AFFICHES);
  }, [capsule?.id, capsule?.participants?.length]);

  if (!capsule) return null;
  const total = capsule.participants.length;
  const tailleAvatar = total <= 3 ? 64 : total <= 8 ? 52 : total <= 14 ? 44 : 38;
  const tailleNom = Math.max(10, tailleAvatar * 0.22);
  const jours = joursRestants(capsule.dateOuverture);
  const ouvrable = estOuvrable(capsule);
  const typeInfo = TYPES_CAPSULES.find((t) => t.id === capsule.type);

  return (
    <div style={S.ecran}>
      <EnTeteRetour titre={capsule.nom} onRetour={() => allerVers("capsules")} />

      <label style={{ display: "block", cursor: "pointer", marginBottom: 10 }}>
        <div style={{ ...S.detailCouverture, marginBottom: 0,
          background: capsule.couverture ? `url(${capsule.couverture}) center/cover` : (typeInfo?.teinte || "#FF6B5E") }}>
          {!capsule.couverture && (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 56 }}>{typeInfo?.icone || "✨"}</div>
              <div style={{ color: "rgba(255,255,255,0.9)", fontSize: 13, fontWeight: 600, marginTop: 8, background: "rgba(0,0,0,0.25)", padding: "6px 14px", borderRadius: 999 }}>
                📷 Ajouter une photo de couverture
              </div>
            </div>
          )}
          {capsule.couverture && (
            <div style={S.boutonCouverture}>📷 Changer</div>
          )}
        </div>
        <input type="file" accept="image/*" style={{ display: "none" }}
          onChange={(e) => lireFichierEnBase64(e, (b64) => modifierCouverture(capsule.id, b64))} />
      </label>

      <div style={S.blocSceau}>
        {capsule.ouverte ? <div style={S.sceauEtat}>🎉 Capsule ouverte</div>
          : ouvrable ? <div style={S.sceauEtat}>✨ Prête à être ouverte</div>
          : (<><div style={S.sceauJours}>{jours}</div><div style={S.sceauEtat}>jour{jours > 1 ? "s" : ""} avant l'ouverture</div></>)}
        {!capsule.ouverte && (
          <div style={{ marginTop: 10 }}>
            {editionDate ? (
              <div style={{ textAlign: "left" }}>
                <SelecteurDate valeur={nouvelleDate || ""} onChange={setNouvelleDate} />
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button style={{ ...S.boutonMini, flex: 1, marginTop: 0 }} onClick={() => { modifierDate(capsule.id, nouvelleDate || null); setEditionDate(false); }}>Valider</button>
                  <button style={{ ...S.boutonMiniGris, flex: 1 }} onClick={() => setEditionDate(false)}>Annuler</button>
                </div>
              </div>
            ) : (
              <div style={S.sceauDate}>le {formaterDate(capsule.dateOuverture)}{" "}
                {moi?.id === capsule.createurId && (
                  <button style={S.lienCrayon} onClick={() => setEditionDate(true)}>✏️ Modifier</button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {!capsule.ouverte && (
        <button style={{ ...S.boutonPrincipal, marginTop: 0, marginBottom: 10 }} onClick={() => allerVers("contribution", capsule.id)}>+ Déposer un souvenir</button>
      )}

      <div style={S.statsLigne}>
        <div style={S.statBloc}><div style={S.statChiffre}>{capsule.contributions.length}</div><div style={S.statLabel}>souvenirs</div></div>
        <div style={S.statBloc}><div style={S.statChiffre}>{capsule.participants.length}</div><div style={S.statLabel}>participants</div></div>
      </div>

      {/* Preuve sociale quand la capsule est vide : donne envie de déposer le premier souvenir
          en montrant ce que d'autres ont fait dans des situations similaires */}
      {capsule.contributions.length === 0 && !capsule.ouverte && <CarteStatStatique />}

      {/* Grille des participants */}
      <div style={{ marginTop: 10 }}>
        <label style={S.label}>
          {total} participant{total > 1 ? "s" : ""}
          {total > MAX_AFFICHES && <span style={{ fontWeight: 400, color: COULEURS.doux }}> · aperçu aléatoire</span>}
        </label>
        <div style={{ background: "#fff", borderRadius: 22, padding: "12px 10px", boxShadow: "0 4px 14px rgba(46,34,48,0.07)", display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
          {affichesParticipants.map((p) => {
            const estMoi = p.userId === moi?.id;
            return (
              <div key={p.id}
                onClick={estMoi ? () => editerParticipant(p.id, "detail") : undefined}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, padding: "4px 2px", borderRadius: 12, cursor: estMoi ? "pointer" : "default" }}>
                <div style={{ position: "relative" }}>
                  <Avatar membre={p} taille={tailleAvatar} />
                  {estMoi && (
                    <div style={{ position: "absolute", bottom: 0, right: 0, width: 14, height: 14, borderRadius: "50%", background: DEGRADE, border: "2px solid #fff" }} />
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

      {/* Paris en attente de vote — visibles avant l'ouverture */}
      <ParisPendants capsule={capsule} moi={moi} voterPari={voterPari} />

      {!capsule.ouverte && (
        <>
          <button style={S.boutonInviter} onClick={() => allerVers("inviter", capsule.id)}>🔗 Inviter quelqu'un</button>
          <p style={S.aide}>Le contenu reste secret jusqu'à l'ouverture.</p>
          {ouvrable && <button style={S.boutonOuvrir} onClick={() => ouvrirCapsule(capsule.id)}>🔓 Ouvrir la capsule</button>}
        </>
      )}
      {capsule.ouverte && <button style={S.boutonPrincipal} onClick={() => {
        try { localStorage.removeItem(`blooom_ouverture_${capsule.id}`); } catch {}
        allerVers("ouverture", capsule.id);
      }}>Revoir les souvenirs</button>}
    </div>
  );
}

// Liste triable par pression longue (450 ms) puis glisser.
// Deux affichages : grille compacte 3 colonnes (défaut) ou liste complète (accessibilité).
// L'ordre et la préférence d'affichage sont persistés dans localStorage.
function TriableTypes({ onSelect }) {
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

  const handlers = (id) => ({
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
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, gridAutoRows: "80px" }}>
          {visuel.map((t, i) => {
            const saisi = dragging && drag.current.id === t.id;
            return (
              <div key={t.id} ref={el => rows.current[i] = el}
                style={{ opacity: saisi ? 0.45 : 1, transform: saisi ? "scale(1.06)" : "scale(1)", transition: dragging && !saisi ? "transform 0.12s" : "none" }}>
                <button style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 5, background: "#fff", border: "none", borderRadius: 14, padding: "8px 6px", width: "100%", height: "100%", cursor: dragging ? "grabbing" : "default", fontFamily: "'Plus Jakarta Sans', sans-serif", boxShadow: "0 3px 10px rgba(46,34,48,0.06)" }}
                  {...handlers(t.id)}>
                  <span style={{ fontSize: 24 }}>{t.icone}</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: COULEURS.encre, textAlign: "center", lineHeight: 1.3 }}>{t.nom}</span>
                </button>
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
            return (
              <div key={t.id} ref={el => rows.current[i] = el}
                style={{ opacity: saisi ? 0.45 : 1, transform: saisi ? "scale(1.03)" : "scale(1)", transition: dragging && !saisi ? "transform 0.12s, opacity 0.12s" : "none" }}>
                <button style={{ ...S.choixContrib, cursor: dragging ? "grabbing" : "default" }} {...handlers(t.id)}>
                  <span style={{ fontSize: 22, marginRight: 12 }}>{t.icone}</span>
                  <span style={{ flex: 1, textAlign: "left" }}>{t.nom}</span>
                  <span style={{ color: COULEURS.doux, fontSize: 16, userSelect: "none" }}>⠿</span>
                </button>
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
    <div style={{ marginTop: 14, borderRadius: 20, background: COULEURS.encre, padding: "20px 18px", position: "relative", overflow: "hidden" }}>
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
      <button onClick={onRecommencer} style={{ display: "block", margin: "0 auto", background: "transparent", border: "1px solid rgba(255,255,255,0.18)", color: "rgba(255,255,255,0.55)", borderRadius: 20, padding: "6px 18px", fontSize: 12, cursor: "pointer" }}>
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
//  ÉCRAN CONTRIBUTION : auteur choisi PARMI LES PARTICIPANTS de la capsule.
// ============================================================================
function EcranContribution({ capsule, moi, allerVers, ajouterContribution, editerParticipant }) {
  const moisParticipant = capsule.participants.find((p) => p.userId === moi?.id) || capsule.participants[0];
  const [auteurIds, setAuteurIds] = useState(moisParticipant ? [moisParticipant.id] : []);
  const [ajoutOuvert, setAjoutOuvert] = useState(false);
  const [typeContrib, setTypeContrib] = useState(null);
  const [voteDepositaire, setVoteDepositaire] = useState(null); // "oui" | "non" — vote du déposant sur son propre pari

  // Un pari est personnel : on revient à soi seul si on bascule sur ce type.
  React.useEffect(() => {
    if (typeContrib === "pari") { setAuteurIds(moisParticipant ? [moisParticipant.id] : []); setAjoutOuvert(false); }
  }, [typeContrib]);

  const [texte, setTexte] = useState("");
  const [media, setMedia] = useState(null);
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

  // Dessin — base64 PNG produit par CanvasDessin
  const [dessinData, setDessinData] = useState(null);

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
      audioCtxRef.current?.close();
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

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
      // Lancer la viz après le setState pour que le canvas soit monté
      setTimeout(lancerViz, 50);
    } catch (e) {
      alert("Impossible d'accéder au microphone : " + e.message);
    }
  }

  function arreterEnregistrement() {
    enregistreurRef.current?.stop();
  }

  function recommencer() {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(null);
    setAudioUrl(null);
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

  const peutEnvoyer =
    (typeContrib === "message"          && texte.trim()) ||
    ((typeContrib === "photo" || typeContrib === "video") && media) ||
    (typeContrib === "vocal"            && audioBlob) ||
    (typeContrib === "dessin"           && dessinData) ||
    (typeContrib === "secret"           && texte.trim()) ||
    (typeContrib === "pari"             && texte.trim() && voteDepositaire !== null) ||
    (typeContrib === "une_du_jour"      && uneData) ||
    (typeContrib === "meteo"            && meteoData) ||
    (typeContrib === "chanson"          && chansonSelectionnee);

  async function envoyer() {
    // La question field sert à stocker des données structurées JSON pour certains types.
    const questionField =
      typeContrib === "une_du_jour"      ? JSON.stringify(uneData)
    : typeContrib === "meteo"            ? JSON.stringify({ ...meteoData, commentaire: meteoCommentaire })
    : typeContrib === "chanson"          ? JSON.stringify({ ...chansonSelectionnee, paroles: paroles && paroles !== "__introuvable__" ? paroles : null })
    : typeContrib === "pari"             ? JSON.stringify({ votes: moisParticipant && voteDepositaire ? { [moisParticipant.id]: { vote: voteDepositaire, commentaire: "", ts: new Date().toISOString() } } : {} })
    : null;

    await ajouterContribution(capsule.id, {
      id: genererId(), auteurId: auteurIds[0], type: typeContrib, texte: texte.trim(),
      question: questionField,
      media: (typeContrib === "photo" || typeContrib === "video") ? media
           : typeContrib === "vocal"   ? audioBlob
           : typeContrib === "dessin"  ? dessinData
           : null,
      filtre, ambiance: typeContrib === "message" ? ambiance : null,
      date: new Date().toISOString(), reactions: {},
    });
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

          {/* Bouton + masqué pour les paris */}
          {typeContrib !== "pari" && (
            <button onClick={() => setAjoutOuvert(v => !v)}
              style={{ width: 36, height: 36, borderRadius: "50%", background: ajoutOuvert ? COULEURS.encre : "linear-gradient(135deg,#f0eaf2,#e8e0ec)", border: "none", cursor: "pointer", fontSize: 18, color: ajoutOuvert ? "#fff" : COULEURS.doux, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              +
            </button>
          )}
        </div>

        {/* Panneau de sélection multiple par cases à cocher */}
        {ajoutOuvert && typeContrib !== "pari" && (
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
          <TriableTypes onSelect={(id) => { setTypeContrib(id); }} />
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


      {(typeContrib === "photo" || typeContrib === "video") && (
        <>
          <label style={S.label}>Votre {typeContrib === "photo" ? "photo" : "vidéo"}</label>
          <input type="file" style={S.input} accept={typeContrib === "photo" ? "image/*" : "video/*"} onChange={(e) => lireFichierEnBase64(e, setMedia)} />
          {media && typeContrib === "photo" && <img src={media} alt="aperçu" style={S.apercuMedia} />}
          {media && typeContrib === "video" && <video src={media} controls style={S.apercuMedia} />}
          <label style={S.label}>Une légende (optionnel)</label>
          <input style={S.input} placeholder="Quelques mots..." value={texte} onChange={(e) => setTexte(e.target.value)} />
        </>
      )}

      {typeContrib === "vocal" && (
        <>
          {!audioBlob && !enregistrement && (
            <button style={S.boutonEnregistrer} onClick={commencerEnregistrement}>
              🎙️ Commencer l'enregistrement
            </button>
          )}
          {enregistrement && (
            <div style={S.blocEnregistrement}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={S.pointRouge} />
                <span style={{ fontWeight: 700, color: "#FF3B30", fontSize: 14 }}>Enregistrement en cours…</span>
              </div>
              <canvas ref={vizCanvasRef}
                style={{ width: "100%", height: 64, borderRadius: 12, background: COULEURS.encre, display: "block" }} />
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
                <button key={i} onClick={() => setChansonSelectionnee({ titre: r.trackName, artiste: r.artistName, pochette: r.artworkUrl100?.replace("100x100", "300x300"), urlApple: r.trackViewUrl })}
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

      {typeContrib && (
        <>
          {/* Preuve sociale discrète : renforce la motivation juste avant de sceller,
              sans alourdir visuellement l'acte de dépôt */}
          {peutEnvoyer && <LigneStatDiscrète />}
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
      pari:"🎲 PARI", question_guidee:"💬 QUESTION" };
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
//  ÉCRAN OUVERTURE : révélation un par un + page finale (album papier).
// ============================================================================
function EcranOuverture({ capsule, moi, allerVers, reagir, voterPari, voterFavori, premiereFois = false }) {
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
          {/* Étape 1 : visualiser l'album en PDF */}
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

  const afficherReactions = courant.type !== "pari";

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

        {/* Texte standard (message + question guidée) avec ambiance */}
        {courant.texte && courant.type === "message" && ambiance
          ? <div style={{ ...S.souvenirMessageAmbiance, background: ambiance.fond, color: ambiance.texte }}>{courant.texte}</div>
          : courant.texte && !["secret","pari"].includes(courant.type) && <div style={S.souvenirTexte}>{courant.texte}</div>
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
        <button style={S.boutonNav} onClick={() => setIndex(indexSur + 1)}>{indexSur === souvenirs.length - 1 ? "Terminer →" : "Suivant →"}</button>
      </div>
    </div>
    {animPhase && courant && (
      <AnimRevealSouvenir type={courant.type} phase={animPhase} onSkip={passerAnim} />
    )}
    </>
  );
}

// ============================================================================
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
function EcranConnexion() {
  const [mode, setMode] = useState(null); // null=choix, "inscription", "connexion"
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [chargement, setChargement] = useState(false);
  const [confirme, setConfirme] = useState(false);
  const [erreur, setErreur] = useState("");

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
        {erreur && <p style={{ ...S.aide, color: COULEURS.corail, marginTop: 8 }}>⚠ {erreur}</p>}
        <button
          style={{ ...S.boutonPrincipal, ...(!peutSoumettre ? S.boutonDesactive : {}) }}
          disabled={!peutSoumettre}
          onClick={estInscription ? sInscrire : seConnecter}
        >
          {chargement ? "…" : estInscription ? "Créer mon compte" : "Se connecter"}
        </button>
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
  const [maintenance, setMaintenance] = useState(false);
  const [maintenanceMsg, setMaintenanceMsg] = useState("L'application est en maintenance. Revenez bientôt !");

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
    let listeners: { remove: () => void }[] = [];

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

  // Capture le code parrain depuis l'URL web au premier chargement (?parrain=XXXXXXXX)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const parrain = params.get("parrain");
      if (parrain) localStorage.setItem("blooom_parrain", parrain.toUpperCase());
    } catch {}
  }, []);

  // Gère les Universal Links / App Links (lien d'invitation ouvert depuis le téléphone)
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let handler: { remove: () => void } | null = null;

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
  }, [allerVers]);

  // Écoute les changements de session (connexion / déconnexion / lien magique cliqué)
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setSessionPrete(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contributions' }, () => chargerDonnees())
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
    setChargement(true);
    const [{ data: profil }, { data: capsulesDB }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle(),
      supabase.from("capsules")
        .select("*, participants(*), contributions(*, reactions(*))")
        .order("created_at", { ascending: false }),
    ]);
    if (profil) setMoi(normaliserProfil(profil));
    if (capsulesDB) {
      const liste = capsulesDB.map(normaliserCapsule);
      // Applique la photo de profil sur toutes les entrées participant de l'utilisateur
      if (profil) {
        liste.forEach(c => c.participants.forEach(p => {
          if (p.userId === session.user.id) p.photo = profil.photo_url || null;
        }));
      }
      setCapsules(liste);
    }
    setChargement(false);
    // Charge les notifications après que les capsules sont disponibles
    if (capsulesDB) chargerNotifsPour(capsulesDB.map(normaliserCapsule));
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

  function repondreQuiz(valeur) {
    if (!capsuleActiveId) return;
    const capsule = capsules.find(c => c.id === capsuleActiveId);
    const participant = capsule?.participants.find(p => p.userId === session.user.id);
    if (!participant) return;
    supabase.from("quiz_reponses").insert({
      capsule_id: capsuleActiveId, participant_id: participant.id, reponse: valeur,
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

  // --- Capsules ---
  async function creerCapsule({ nom, type, dateOuverture, couverture }) {
    const couverture_url = couverture ? await uploaderFichier("couvertures", couverture, genererId()) : null;
    const capsuleId = crypto.randomUUID();
    const { error: errCapsule } = await supabase.from("capsules").insert({
      id: capsuleId, nom, type, date_ouverture: dateOuverture || null,
      couverture_url, code: genererCode(), created_by: session.user.id,
    });
    if (errCapsule) throw new Error("Capsule : " + errCapsule.message);
    const { error: errParticipant } = await supabase.from("participants").insert({
      capsule_id: capsuleId, user_id: session.user.id,
      prenom: moi.prenom, description: moi.description,
      photo_url: moi.photo, couleur: moi.couleur,
    });
    if (errParticipant) throw new Error("Participant : " + errParticipant.message);
    await chargerDonnees();

    // Conversion parrainage : si c'est la première capsule créée par l'utilisateur
    // et qu'un parrainage non converti existe et a moins de 7 jours
    const premiereCapsule = capsules.filter(c => c.createurId === session.user.id).length === 0;
    if (premiereCapsule) {
      const { data: parrainage } = await supabase
        .from("parrainages")
        .select("id, parrain_id, created_at")
        .eq("filleul_id", session.user.id)
        .eq("converti", false)
        .maybeSingle();

      if (parrainage) {
        const joursDepuis = (Date.now() - new Date(parrainage.created_at).getTime()) / 86_400_000;
        if (joursDepuis <= 7) {
          // Marque le parrainage comme converti
          await supabase.from("parrainages").update({
            converti: true, converti_at: new Date().toISOString(),
          }).eq("id", parrainage.id);
          // Ajoute 30 jours de Plus au parrain (RPC SECURITY DEFINER)
          await supabase.rpc("ajouter_plus_parrain", { p_parrain_id: parrainage.parrain_id });
          // Recharge le profil pour mettre à jour plusExpiresAt si c'est le filleul lui-même
          chargerDonnees();
        }
      }
    }

    return capsuleId;
  }

  async function modifierDate(capsuleId, date) {
    await supabase.from("capsules").update({ date_ouverture: date || null }).eq("id", capsuleId);
    setCapsules(l => l.map(c => c.id === capsuleId ? { ...c, dateOuverture: date } : c));
  }

  async function modifierCouverture(capsuleId, photo) {
    const couverture_url = await uploaderFichier("couvertures", photo, capsuleId);
    if (!couverture_url) { alert("Échec de l'upload photo. Vérifiez les permissions du bucket 'couvertures' dans Supabase."); return; }
    const { error } = await supabase.from("capsules").update({ couverture_url }).eq("id", capsuleId);
    if (error) { alert("Erreur : " + error.message); return; }
    setCapsules(l => l.map(c => c.id === capsuleId ? { ...c, couverture: couverture_url } : c));
  }

  // --- Participants ---
  async function ajouterParticipant(capsuleId, { prenom, description, photo }) {
    const photo_url = photo ? await uploaderFichier("avatars", photo, genererId()) : null;
    const capsule = capsules.find(c => c.id === capsuleId);
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
    }).select().single();
    if (data) {
      setCapsules(l => l.map(c => c.id !== capsuleId ? c : {
        ...c, contributions: [...c.contributions, normaliserContribution({ ...data, reactions: [] })],
      }));
      // Jalons : notifie tous les participants à 10, 20, 50 contributions
      const capsule = capsules.find(c => c.id === capsuleId);
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
    // Notifie tous les participants (sauf l'ouvreur) que la capsule est ouverte
    const capsule = capsules.find(c => c.id === capsuleId);
    if (capsule) {
      for (const p of capsule.participants.filter(p => p.userId !== session?.user?.id)) {
        insererNotification(p.id, capsuleId, `🎉 La capsule « ${capsule.nom} » est maintenant ouverte !`, "ouverture");
      }
    }
    allerVers("quiz_ouverture", capsuleId);
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
  if (!session) return <EcranConnexion />;
  if (!moi) return <CadreTelephone vars={vars}><EcranBienvenue creerMoi={creerMoi} /></CadreTelephone>;

  const afficherOnglets = ["capsules", "profil", "parametres"].includes(ecran);

  return (
    <CadreTelephone vars={vars}>
      {ecran === "capsules" && <EcranCapsules capsules={capsules} moi={moi} allerVers={allerVers} notifications={notifications} onOuvrirNotifs={() => setPanneauNotifs(true)} />}
      {ecran === "profil" && <EcranProfil moi={moi} capsules={capsules} modifierMoi={modifierMoi} />}
      {ecran === "parametres" && <EcranParametres palette={palette} mode={mode} onPalette={changerPalette} onMode={changerMode} />}
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
          modifierDate={modifierDate} modifierCouverture={modifierCouverture} editerParticipant={editerParticipant} voterPari={voterPari} />
      )}
      {ecran === "contribution" && (
        <EcranContribution capsule={capsuleActive} moi={moi} allerVers={allerVers}
          ajouterContribution={ajouterContribution} editerParticipant={editerParticipant} />
      )}
      {ecran === "quiz_ouverture" && (
        <EcranQuizOuverture capsule={capsuleActive} allerVers={allerVers} onRepondre={repondreQuiz} />
      )}
      {ecran === "ouverture" && <EcranOuverture capsule={capsuleActive} moi={moi} allerVers={allerVers} reagir={reagir} voterPari={voterPari} voterFavori={voterFavori} premiereFois={ecranPrecedent === "animation_ouverture"} />}
      {ecran === "animation_ouverture" && <AnimationOuverture capsule={capsuleActive} allerVers={allerVers} />}
      {afficherOnglets && <BarreOnglets actif={ecran} allerVers={allerVers} />}

      {panneauNotifs && (
        <PanneauNotifications notifications={notifications} onMarquerLue={marquerLue}
          onFermer={() => setPanneauNotifs(false)} allerVers={allerVers} />
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
        input,textarea { color-scheme: light dark; }
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
      <div style={S.telephone}>{children}</div>
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
  tuileType: { background: "#fff", border: "2px solid transparent", borderRadius: 14, padding: "12px 6px", cursor: "pointer", textAlign: "center", boxShadow: "0 3px 10px rgba(46,34,48,0.06)" },
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
