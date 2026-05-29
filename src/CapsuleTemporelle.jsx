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

// ============================================================================
//  2. DONNÉES DE RÉFÉRENCE
// ============================================================================
const TYPES_CAPSULES = [
  { id: "naissance", nom: "Naissance",        icone: "🍼", dureeAns: 18, teinte: "#4D7CFF" },
  { id: "mariage",   nom: "Mariage",          icone: "💍", dureeAns: 10, teinte: "#FF5C9D" },
  { id: "anniv",     nom: "Anniversaire",     icone: "🎂", dureeAns: 1,  teinte: "#FFC436" },
  { id: "noel",      nom: "Noël",             icone: "🎄", dureeAns: 1,  teinte: "#22C7B8" },
  { id: "evjf",      nom: "EVJF / EVG",       icone: "🎉", dureeAns: 1,  teinte: "#9B5DE5" },
  { id: "rentree",   nom: "Rentrée scolaire", icone: "🎒", dureeAns: 12, teinte: "#FF8A3D" },
  { id: "amis",      nom: "Entre amis",       icone: "🤝", dureeAns: 5,  teinte: "#00BBF9" },
  { id: "libre",     nom: "Capsule libre",    icone: "✨", dureeAns: 1,  teinte: "#FF6B5E" },
];

const QUESTIONS = {
  adultes: [
    "Quelle est ta plus grande fierté cette année ?",
    "Quelle peur as-tu aujourd'hui que tu espères avoir surmontée ?",
    "Quel est le dernier truc qui t'a vraiment fait rire ?",
    "Quel conseil donnerais-tu à la personne qui ouvrira cette capsule ?",
    "Qu'est-ce qui te manque le plus ces derniers temps ?",
  ],
};

const REACTIONS = [
  { id: "emouvant", icone: "🥹", nom: "Émouvant" },
  { id: "drole",    icone: "😂", nom: "Drôle"    },
  { id: "precieux", icone: "💛", nom: "Précieux" },
];

const TYPES_CONTRIBUTION = [
  { id: "message",  nom: "Un message",              icone: "✍️" },
  { id: "question", nom: "Répondre à une question", icone: "💭" },
  { id: "photo",    nom: "Une photo",               icone: "📷" },
  { id: "video",    nom: "Une vidéo",               icone: "🎬" },
  { id: "vocal",    nom: "Un message vocal",        icone: "🎙️" },
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
    participants: (c.participants || []).map(normaliserParticipant),
    contributions: (c.contributions || []).map(normaliserContribution),
  };
}

// ============================================================================
//  5. PETITS COMPOSANTS RÉUTILISABLES
// ============================================================================
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

function SelecteurPhotoProfil({ photo, couleur, prenom, onChange, taille = 96 }) {
  return (
    <label style={{ position: "relative", cursor: "pointer", width: taille, height: taille }}>
      <Avatar membre={{ photo, couleur, prenom }} taille={taille} />
      <span style={{ position: "absolute", bottom: -2, right: -2, background: "#fff", borderRadius: "50%",
        width: taille * 0.34, height: taille * 0.34, display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 2px 8px rgba(0,0,0,0.2)", fontSize: taille * 0.18 }}>📷</span>
      <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => lireFichierEnBase64(e, onChange)} />
    </label>
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

// Barre d'onglets : 2 sections seulement (Capsules, Profil) — plus de "Famille"
// globale, conformément à la nouvelle architecture centrée sur la capsule.
function BarreOnglets({ actif, allerVers }) {
  const onglets = [
    { cle: "capsules", nom: "Capsules", icone: "📦" },
    { cle: "profil",   nom: "Profil",   icone: "👤" },
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
//  ÉCRAN BIENVENUE : crée l'identité "moi" (prénom + description + photo).
// ============================================================================
function EcranBienvenue({ creerMoi }) {
  const [prenom, setPrenom] = useState("");
  const [description, setDescription] = useState("");
  const [photo, setPhoto] = useState(null);
  return (
    <div style={{ ...S.ecran, justifyContent: "center" }}>
      <div style={{ fontSize: 56, textAlign: "center" }}>🎉</div>
      <h1 style={{ ...S.titrePage, textAlign: "center" }}>Capsule</h1>
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
function EcranCapsules({ capsules, moi, allerVers }) {
  return (
    <div style={S.ecran}>
      <div style={S.enteteAccueil}>
        <p style={S.surtitre}>Bonjour {moi?.prenom} 👋</p>
        <h1 style={S.titrePage}>Vos capsules</h1>
      </div>

      <button style={S.boutonPrincipal} onClick={() => allerVers("creation")}>+ Nouvelle capsule</button>
      {/* NOUVEAU : rejoindre une capsule existante avec un code reçu. */}
      <button style={S.boutonSecondaire} onClick={() => allerVers("rejoindre")}>🔗 Rejoindre avec un code</button>

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
          return (
            <button key={c.id} style={S.carteCapsule} onClick={() => allerVers("detail", c.id)}>
              <div style={{ ...S.carteCouverture,
                background: c.couverture ? `url(${c.couverture}) center/cover` : (typeInfo?.teinte || "#FF6B5E") }}>
                {!c.couverture && <span style={{ fontSize: 34 }}>{typeInfo?.icone || "✨"}</span>}
                <span style={S.cartePastille}>{c.contributions.length}</span>
              </div>
              <div style={{ padding: "12px 14px", textAlign: "left" }}>
                <div style={S.carteNom}>{c.nom}</div>
                <div style={S.carteSous}>
                  {c.ouverte ? "Ouverte ✓" : ouvrable ? "Prête à ouvrir !"
                    : jours != null ? `Ouverture dans ${jours} jour${jours > 1 ? "s" : ""}` : "Ouverture libre"}
                </div>
                {/* Avatars des participants de CETTE capsule (per-capsule). */}
                <div style={{ display: "flex", marginTop: 10, alignItems: "center" }}>
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
  const [prenom, setPrenom] = useState(moi.prenom);
  const [description, setDescription] = useState(moi.description || "");
  const [photo, setPhoto] = useState(moi.photo || null);
  const [enregistre, setEnregistre] = useState(false);

  async function enregistrer() {
    await modifierMoi({ prenom: prenom.trim(), description: description.trim(), photo });
    setEnregistre(true);
    setTimeout(() => setEnregistre(false), 2000);
  }
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

  function choisirType(t) {
    setType(t.id);
    const d = new Date(); d.setFullYear(d.getFullYear() + t.dureeAns);
    setDate(d.toISOString().slice(0, 10));
  }
  const peutCreer = nom.trim().length > 0 && type !== null;

  return (
    <div style={S.ecran}>
      <EnTeteRetour titre="Nouvelle capsule" onRetour={() => allerVers("capsules")} />
      <label style={S.label}>Photo de couverture (facultatif)</label>
      <label style={S.zoneCouverture}>
        {couverture ? <img src={couverture} alt="couverture" style={S.couvertureApercu} />
          : <span style={{ color: COULEURS.doux }}>📷 Ajouter une photo</span>}
        <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => lireFichierEnBase64(e, setCouverture)} />
      </label>

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

      <label style={S.label}>Date d'ouverture</label>
      <input style={S.input} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <p style={S.aide}>Laissez vide pour décider du jour d'ouverture plus tard.</p>

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
function EcranRejoindre({ moi, allerVers, rechercherCapsule, rejoindreCapsule }) {
  const [code, setCode] = useState("");
  const codePropre = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
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

// ============================================================================
//  ÉCRAN DÉTAIL : couverture, compte à rebours, date, PARTICIPANTS + invitation.
// ============================================================================
function EcranDetail({ capsule, moi, allerVers, ouvrirCapsule, modifierDate, modifierCouverture, editerParticipant }) {
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

      <label style={{ display: "block", cursor: "pointer", marginBottom: 14 }}>
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
                <input style={S.input} type="date" value={nouvelleDate || ""} onChange={(e) => setNouvelleDate(e.target.value)} />
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button style={S.boutonMini} onClick={() => { modifierDate(capsule.id, nouvelleDate || null); setEditionDate(false); }}>Valider</button>
                  <button style={S.boutonMiniGris} onClick={() => setEditionDate(false)}>Annuler</button>
                </div>
              </div>
            ) : (
              <div style={S.sceauDate}>le {formaterDate(capsule.dateOuverture)}{" "}
                <button style={S.lienCrayon} onClick={() => setEditionDate(true)}>✏️ Modifier</button>
              </div>
            )}
          </div>
        )}
      </div>

      <div style={S.statsLigne}>
        <div style={S.statBloc}><div style={S.statChiffre}>{capsule.contributions.length}</div><div style={S.statLabel}>souvenirs</div></div>
        <div style={S.statBloc}><div style={S.statChiffre}>{capsule.participants.length}</div><div style={S.statLabel}>participants</div></div>
      </div>

      {/* Grille des participants */}
      <div style={{ marginTop: 16 }}>
        <label style={S.label}>
          {total} participant{total > 1 ? "s" : ""}
          {total > MAX_AFFICHES && <span style={{ fontWeight: 400, color: COULEURS.doux }}> · aperçu aléatoire</span>}
        </label>
        <div style={{ background: "#fff", borderRadius: 22, padding: "18px 12px", boxShadow: "0 4px 14px rgba(46,34,48,0.07)", display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
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

      {!capsule.ouverte && (
        <>
          <button style={S.boutonPrincipal} onClick={() => allerVers("contribution", capsule.id)}>+ Déposer un souvenir</button>
          <button style={S.boutonInviter} onClick={() => allerVers("inviter", capsule.id)}>🔗 Inviter quelqu'un</button>
          <p style={S.aide}>Le contenu reste secret jusqu'à l'ouverture.</p>
          {ouvrable && <button style={S.boutonOuvrir} onClick={() => ouvrirCapsule(capsule.id)}>🔓 Ouvrir la capsule</button>}
        </>
      )}
      {capsule.ouverte && <button style={S.boutonPrincipal} onClick={() => allerVers("ouverture", capsule.id)}>Revoir les souvenirs</button>}
    </div>
  );
}

// ============================================================================
//  ÉCRAN CONTRIBUTION : auteur choisi PARMI LES PARTICIPANTS de la capsule.
// ============================================================================
function EcranContribution({ capsule, moi, allerVers, ajouterContribution, editerParticipant }) {
  // Auteur par défaut : "moi" s'il participe, sinon le 1er participant.
  const auteurDefaut = capsule.participants.find((p) => p.userId === moi?.id) || capsule.participants[0];
  const [auteurId, setAuteurId] = useState(auteurDefaut?.id);
  const [typeContrib, setTypeContrib] = useState(null);
  const [texte, setTexte] = useState("");
  const [question, setQuestion] = useState("");
  const [media, setMedia] = useState(null);
  const [filtre, setFiltre] = useState("original");
  const [ambiance, setAmbiance] = useState("soleil");
  const [enregistrement, setEnregistrement] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const enregistreurRef = React.useRef(null);

  React.useEffect(() => {
    return () => {
      enregistreurRef.current?.state === "recording" && enregistreurRef.current.stop();
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  async function commencerEnregistrement() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const morceaux = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) morceaux.push(e.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(morceaux, { type: "audio/webm" });
        const url = URL.createObjectURL(blob);
        setAudioBlob(blob);
        setAudioUrl(url);
        setEnregistrement(false);
      };
      recorder.start();
      enregistreurRef.current = recorder;
      setEnregistrement(true);
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

  function tirerQuestion() {
    const liste = QUESTIONS.adultes;
    setQuestion(liste[Math.floor(Math.random() * liste.length)]);
  }
  const peutEnvoyer =
    (typeContrib === "message" && texte.trim()) ||
    (typeContrib === "question" && texte.trim() && question) ||
    ((typeContrib === "photo" || typeContrib === "video") && media) ||
    (typeContrib === "vocal" && audioBlob);

  async function envoyer() {
    await ajouterContribution(capsule.id, {
      id: genererId(), auteurId, type: typeContrib, texte: texte.trim(),
      question: typeContrib === "question" ? question : null,
      media: (typeContrib === "photo" || typeContrib === "video") ? media
           : typeContrib === "vocal" ? audioBlob
           : null,
      filtre, ambiance: typeContrib === "message" ? ambiance : null,
      date: new Date().toISOString(), reactions: {},
    });
    allerVers("detail", capsule.id);
  }
  const auteur = capsule.participants.find((p) => p.id === auteurId);
  const cssFiltre = FILTRES.find((f) => f.id === filtre)?.css || "none";

  return (
    <div style={S.ecran}>
      <EnTeteRetour titre="Déposer un souvenir" onRetour={() => allerVers("detail", capsule.id)} />
      <label style={S.label}>Qui contribue ?</label>
      <div style={S.rangeeAuteurs}>
        {capsule.participants.map((p) => (
          <button key={p.id} style={{ ...S.choixAuteur, ...(auteurId === p.id ? S.choixAuteurActif : {}) }} onClick={() => setAuteurId(p.id)}>
            <Avatar membre={p} taille={44} />
            <span style={S.choixAuteurNom}>{p.prenom}</span>
          </button>
        ))}
      </div>

      {!typeContrib && (
        <>
          <label style={S.label}>Que voulez-vous déposer ?</label>
          {TYPES_CONTRIBUTION.map((t) => (
            <button key={t.id} style={S.choixContrib} onClick={() => { setTypeContrib(t.id); if (t.id === "question") tirerQuestion(); }}>
              <span style={{ fontSize: 22, marginRight: 12 }}>{t.icone}</span>{t.nom}
            </button>
          ))}
        </>
      )}

      {typeContrib === "message" && (
        <>
          <label style={S.label}>Votre message</label>
          <textarea style={S.zoneTexte} placeholder="Ce que vous voulez transmettre..." value={texte} onChange={(e) => setTexte(e.target.value)} autoFocus />
          <label style={S.label}>Ambiance</label>
          <div style={S.rangeeFiltres}>
            {AMBIANCES.map((a) => (
              <button key={a.id} style={{ ...S.pastilleAmbiance, background: a.fond, color: a.texte, outline: ambiance === a.id ? `3px solid ${COULEURS.encre}` : "none" }} onClick={() => setAmbiance(a.id)}>{a.nom}</button>
            ))}
          </div>
        </>
      )}

      {typeContrib === "question" && (
        <>
          <div style={S.carteQuestion}>
            <div style={S.carteQuestionTexte}>{question}</div>
            <button style={{ ...S.lienDiscret, color: "#fff" }} onClick={tirerQuestion}>🎲 Une autre question</button>
          </div>
          <textarea style={S.zoneTexte} placeholder="Votre réponse..." value={texte} onChange={(e) => setTexte(e.target.value)} autoFocus />
        </>
      )}

      {(typeContrib === "photo" || typeContrib === "video") && (
        <>
          <label style={S.label}>Votre {typeContrib === "photo" ? "photo" : "vidéo"}</label>
          <input type="file" style={S.input} accept={typeContrib === "photo" ? "image/*" : "video/*"} onChange={(e) => lireFichierEnBase64(e, setMedia)} />
          {media && typeContrib === "photo" && <img src={media} alt="aperçu" style={{ ...S.apercuMedia, filter: cssFiltre }} />}
          {media && typeContrib === "video" && <video src={media} controls style={{ ...S.apercuMedia, filter: cssFiltre }} />}
          {media && (
            <>
              <label style={S.label}>Filtre</label>
              <div style={S.rangeeFiltres}>
                {FILTRES.map((f) => (
                  <button key={f.id} style={{ ...S.pastilleFiltre, ...(filtre === f.id ? S.pastilleFiltreActive : {}) }} onClick={() => setFiltre(f.id)}>{f.nom}</button>
                ))}
              </div>
              <p style={S.aide}>Filtres colorimétriques. Les effets de visage en réalité augmentée nécessiteront un module dédié dans la version finale.</p>
            </>
          )}
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
              <div style={S.pointRouge} />
              <span style={{ fontWeight: 700, color: "#FF3B30" }}>Enregistrement en cours…</span>
              <button style={{ ...S.boutonMini, marginTop: 0, background: COULEURS.encre }} onClick={arreterEnregistrement}>
                ⏹ Arrêter
              </button>
            </div>
          )}
          {audioBlob && !enregistrement && (
            <div style={{ marginTop: 12 }}>
              <audio src={audioUrl} controls style={{ width: "100%", borderRadius: 12 }} />
              <button style={{ ...S.boutonSecondaire, marginTop: 10 }} onClick={recommencer}>
                🔄 Recommencer
              </button>
            </div>
          )}
        </>
      )}

      {typeContrib && (
        <button style={{ ...S.boutonPrincipal, ...(peutEnvoyer ? {} : S.boutonDesactive) }} disabled={!peutEnvoyer} onClick={envoyer}>
          Sceller ce souvenir {auteur ? `· ${auteur.prenom}` : ""}
        </button>
      )}
    </div>
  );
}

// ============================================================================
//  ÉCRAN OUVERTURE : révélation un par un + page finale (album papier).
// ============================================================================
function EcranOuverture({ capsule, allerVers, reagir }) {
  const [index, setIndex] = useState(0);
  const [albumDemande, setAlbumDemande] = useState(false);

  if (!capsule || capsule.contributions.length === 0) {
    return (
      <div style={S.ecran}>
        <EnTeteRetour titre={capsule?.nom || ""} onRetour={() => allerVers("detail", capsule.id)} />
        <p style={S.videTexte}>Cette capsule ne contient aucun souvenir.</p>
      </div>
    );
  }
  const souvenirs = [...capsule.contributions].sort((a, b) => new Date(a.date) - new Date(b.date));
  const estPageFinale = index === souvenirs.length;

  if (estPageFinale) {
    return (
      <div style={S.ecran}>
        <EnTeteRetour titre={capsule.nom} onRetour={() => allerVers("detail", capsule.id)} />
        <div style={{ textAlign: "center", paddingTop: 10 }}>
          <div style={{ fontSize: 52 }}>🎊</div>
          <h2 style={S.finTitre}>Vous avez tout découvert</h2>
          <p style={S.finTexte}>{souvenirs.length} souvenir{souvenirs.length > 1 ? "s" : ""} partagé{souvenirs.length > 1 ? "s" : ""} ensemble.</p>
          {!albumDemande ? (
            <button style={S.carteAlbum} onClick={() => setAlbumDemande(true)}>
              <div style={S.albumTitre}>🎁 En faire un album papier</div>
              <div style={S.albumSous}>Recevez ces souvenirs imprimés chez vous, à garder pour toujours.</div>
              <div style={S.albumFleche}>Créer mon album →</div>
            </button>
          ) : (
            <div style={S.albumConfirme}>✓ Parfait ! La commande d'album sera disponible dans la version finale.</div>
          )}
          <button style={S.boutonSecondaire} onClick={() => setIndex(0)}>↺ Revoir depuis le début</button>
        </div>
      </div>
    );
  }

  const courant = souvenirs[index];
  // L'auteur est cherché parmi les participants de la capsule.
  const auteur = capsule.participants.find((p) => p.id === courant.auteurId);
  const cssFiltre = FILTRES.find((f) => f.id === courant.filtre)?.css || "none";
  const ambiance = AMBIANCES.find((a) => a.id === courant.ambiance);

  return (
    <div style={S.ecran}>
      <EnTeteRetour titre={capsule.nom} onRetour={() => allerVers("detail", capsule.id)} />
      <div style={S.progression}>{index + 1} / {souvenirs.length}</div>
      <div style={S.carteSouvenir}>
        <div style={S.souvenirEntete}>
          <Avatar membre={auteur} taille={36} />
          <div><div style={{ fontWeight: 700 }}>{auteur?.prenom || "Inconnu"}</div><div style={S.souvenirDate}>{formaterDate(courant.date)}</div></div>
        </div>
        {courant.question && <div style={S.souvenirQuestion}>{courant.question}</div>}
        {courant.type === "photo" && courant.media && <img src={courant.media} alt="souvenir" style={{ ...S.souvenirMedia, filter: cssFiltre }} />}
        {courant.type === "video" && courant.media && <video src={courant.media} controls style={{ ...S.souvenirMedia, filter: cssFiltre }} />}
        {courant.type === "vocal" && courant.media && (
          <div style={S.lecteurAudio}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>🎙️</div>
            <audio src={courant.media} controls style={{ width: "100%" }} />
          </div>
        )}
        {courant.texte && courant.type === "message" && ambiance ? (
          <div style={{ ...S.souvenirMessageAmbiance, background: ambiance.fond, color: ambiance.texte }}>{courant.texte}</div>
        ) : (courant.texte && <div style={S.souvenirTexte}>{courant.texte}</div>)}
        <div style={S.ligneReactions}>
          {REACTIONS.map((r) => {
            const nb = courant.reactions?.[r.id] || 0;
            return <button key={r.id} style={S.boutonReaction} onClick={() => reagir(capsule.id, courant.id, r.id)}>{r.icone} {nb > 0 && <span style={S.reactionNb}>{nb}</span>}</button>;
          })}
        </div>
      </div>
      <div style={S.navOuverture}>
        <button style={{ ...S.boutonNav, ...(index === 0 ? S.boutonDesactive : {}) }} disabled={index === 0} onClick={() => setIndex(index - 1)}>← Précédent</button>
        <button style={S.boutonNav} onClick={() => setIndex(index + 1)}>{index === souvenirs.length - 1 ? "Terminer →" : "Suivant →"}</button>
      </div>
    </div>
  );
}

// ============================================================================
//  6. ÉCRAN DE CONNEXION (lien magique par e-mail)
// ============================================================================
function EcranConnexion() {
  const [email, setEmail] = useState("");
  const [envoye, setEnvoye] = useState(false);
  const [chargement, setChargement] = useState(false);

  async function envoyer() {
    if (!email.trim()) return;
    setChargement(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    setChargement(false);
    if (!error) setEnvoye(true);
    else alert("Erreur : " + error.message);
  }

  if (envoye) return (
    <CadreTelephone>
      <div style={{ ...S.ecran, justifyContent: "center", textAlign: "center" }}>
        <div style={{ fontSize: 56 }}>📬</div>
        <h1 style={S.titrePage}>Vérifiez vos e-mails</h1>
        <p style={{ ...S.aide, textAlign: "center", marginTop: 12 }}>
          Un lien de connexion a été envoyé à <strong>{email}</strong>.
          Cliquez dessus pour accéder à l'application.
        </p>
        <button style={{ ...S.boutonSecondaire, marginTop: 24 }} onClick={() => setEnvoye(false)}>
          ← Changer d'adresse
        </button>
      </div>
    </CadreTelephone>
  );

  return (
    <CadreTelephone>
      <div style={{ ...S.ecran, justifyContent: "center" }}>
        <div style={{ fontSize: 56, textAlign: "center" }}>🎁</div>
        <h1 style={{ ...S.titrePage, textAlign: "center" }}>Capsule</h1>
        <p style={{ ...S.aide, textAlign: "center", marginBottom: 24 }}>
          Entrez votre adresse e-mail pour recevoir un lien de connexion.
        </p>
        <label style={S.label}>Adresse e-mail</label>
        <input
          style={S.input}
          type="email"
          placeholder="vous@exemple.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && envoyer()}
          autoFocus
        />
        <button
          style={{ ...S.boutonPrincipal, ...(email.trim() && !chargement ? {} : S.boutonDesactive) }}
          disabled={!email.trim() || chargement}
          onClick={envoyer}
        >
          {chargement ? "Envoi…" : "Recevoir le lien de connexion"}
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

  const [ecran, setEcran] = useState("capsules");
  const [capsuleActiveId, setCapsuleActiveId] = useState(null);
  const [participantActifId, setParticipantActifId] = useState(null);
  const [retourParticipant, setRetourParticipant] = useState("detail");

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
  }

  const allerVers = useCallback((nouvelEcran, id = null) => {
    setEcran(nouvelEcran);
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
    }
  }

  async function ouvrirCapsule(capsuleId) {
    await supabase.from("capsules").update({ ouverte: true }).eq("id", capsuleId);
    setCapsules(l => l.map(c => c.id === capsuleId ? { ...c, ouverte: true } : c));
    allerVers("ouverture", capsuleId);
  }

  async function reagir(capsuleId, contribId, reactionId) {
    const capsule = capsules.find(c => c.id === capsuleId);
    const participant = capsule?.participants.find(p => p.userId === session.user.id);
    if (!participant) return;
    await supabase.from("reactions").insert({
      contribution_id: contribId, participant_id: participant.id, type: reactionId,
    });
    setCapsules(l => l.map(c => c.id !== capsuleId ? c : {
      ...c, contributions: c.contributions.map(ct =>
        ct.id !== contribId ? ct : {
          ...ct, reactions: { ...ct.reactions, [reactionId]: (ct.reactions?.[reactionId] || 0) + 1 },
        }
      ),
    }));
  }

  const capsuleActive = capsules.find(c => c.id === capsuleActiveId);

  if (!sessionPrete || chargement) return <CadreTelephone><div style={S.ecran} /></CadreTelephone>;
  if (!session) return <EcranConnexion />;
  if (!moi) return <CadreTelephone><EcranBienvenue creerMoi={creerMoi} /></CadreTelephone>;

  const afficherOnglets = ["capsules", "profil"].includes(ecran);

  return (
    <CadreTelephone>
      {ecran === "capsules" && <EcranCapsules capsules={capsules} moi={moi} allerVers={allerVers} />}
      {ecran === "profil" && <EcranProfil moi={moi} capsules={capsules} modifierMoi={modifierMoi} />}
      {ecran === "creation" && <EcranCreation allerVers={allerVers} creerCapsule={creerCapsule} />}
      {ecran === "rejoindre" && (
        <EcranRejoindre moi={moi} allerVers={allerVers}
          rechercherCapsule={rechercherCapsule} rejoindreCapsule={rejoindreCapsuleParCode} />
      )}
      {ecran === "inviter" && <EcranInviter capsule={capsuleActive} allerVers={allerVers} />}
      {ecran === "participant" && (
        <EcranEditionParticipant capsule={capsuleActive} participantActifId={participantActifId}
          ajouterParticipant={ajouterParticipant} modifierParticipant={modifierParticipant}
          retour={retourParticipant} allerVers={allerVers} />
      )}
      {ecran === "detail" && (
        <EcranDetail capsule={capsuleActive} moi={moi} allerVers={allerVers} ouvrirCapsule={ouvrirCapsule}
          modifierDate={modifierDate} modifierCouverture={modifierCouverture} editerParticipant={editerParticipant} />
      )}
      {ecran === "contribution" && (
        <EcranContribution capsule={capsuleActive} moi={moi} allerVers={allerVers}
          ajouterContribution={ajouterContribution} editerParticipant={editerParticipant} />
      )}
      {ecran === "ouverture" && <EcranOuverture capsule={capsuleActive} allerVers={allerVers} reagir={reagir} />}
      {afficherOnglets && <BarreOnglets actif={ecran} allerVers={allerVers} />}
    </CadreTelephone>
  );
}

// ============================================================================
//  CADRE TÉLÉPHONE + polices modernes.
// ============================================================================
function CadreTelephone({ children }) {
  return (
    <div style={S.fondPage}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,600;12..96,700;12..96,800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        ::-webkit-scrollbar { width: 0; }
      `}</style>
      <div style={S.telephone}>{children}</div>
    </div>
  );
}

// ============================================================================
//  STYLES : thème solaire / festif.
// ============================================================================
const COULEURS = { encre: "#2E2230", doux: "#9B8AA0", carte: "#FFFFFF", bordure: "#F0E6EC", corail: "#FF6B5E", orange: "#FF8A3D", or: "#FFC436", rose: "#FF5C9D", terre: "#FF6B5E" };
const DEGRADE = "linear-gradient(120deg,#FF8A3D 0%,#FF5C9D 100%)";

const S = {
  fondPage: { minHeight: "100vh", display: "flex", justifyContent: "center", alignItems: "center", background: "#1c1014", padding: 16, fontFamily: "'Plus Jakarta Sans', sans-serif" },
  telephone: { width: 390, maxWidth: "100%", height: 800, maxHeight: "94vh", background: "linear-gradient(170deg,#FFE9D6 0%,#FFDCE5 50%,#FBE7FF 100%)", borderRadius: 42, overflow: "hidden", boxShadow: "0 30px 90px rgba(255,92,157,0.35)", border: "10px solid #1c1014", position: "relative" },
  ecran: { height: "100%", overflowY: "auto", padding: "26px 20px 96px", display: "flex", flexDirection: "column", color: COULEURS.encre },

  enteteAccueil: { marginBottom: 14 },
  surtitre: { color: COULEURS.doux, fontSize: 15, margin: 0, fontWeight: 600 },
  titrePage: { fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 34, fontWeight: 800, margin: "2px 0 0", letterSpacing: "-0.02em" },
  enteteRetour: { display: "flex", alignItems: "center", gap: 12, marginBottom: 16 },
  fleche: { background: "#fff", color: COULEURS.encre, width: 40, height: 40, borderRadius: 14, fontSize: 20, cursor: "pointer", border: "none", boxShadow: "0 3px 10px rgba(46,34,48,0.1)" },
  enteteTitre: { fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 21, fontWeight: 700 },

  videAccueil: { textAlign: "center", marginTop: 40, padding: "0 10px" },
  videTexte: { color: COULEURS.doux, fontSize: 16, lineHeight: 1.5 },

  carteCapsule: { background: "#fff", border: "none", borderRadius: 22, padding: 0, marginBottom: 14, cursor: "pointer", width: "100%", overflow: "hidden", boxShadow: "0 8px 24px rgba(46,34,48,0.1)" },
  carteCouverture: { height: 110, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", color: "#fff" },
  cartePastille: { position: "absolute", top: 10, right: 10, background: "rgba(0,0,0,0.45)", color: "#fff", borderRadius: 999, minWidth: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, padding: "0 9px", backdropFilter: "blur(4px)" },
  carteNom: { fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 19, fontWeight: 700 },
  carteSous: { color: COULEURS.doux, fontSize: 14, marginTop: 2, fontWeight: 500 },

  carteMembre: { display: "flex", alignItems: "center", gap: 14, background: "#fff", border: "none", borderRadius: 18, padding: 14, marginBottom: 10, cursor: "pointer", width: "100%", boxShadow: "0 4px 14px rgba(46,34,48,0.07)" },
  membreNom: { fontWeight: 700, fontSize: 16, display: "flex", alignItems: "center", gap: 8 },
  membreDesc: { color: COULEURS.doux, fontSize: 14, marginTop: 2 },
  badgeVous: { background: DEGRADE, color: "#fff", fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 999 },
  ajoutMembreRond: { width: 44, height: 44, borderRadius: "50%", border: `2px dashed ${COULEURS.doux}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, color: COULEURS.doux },

  label: { fontSize: 14, fontWeight: 700, color: COULEURS.encre, margin: "16px 0 8px" },
  input: { width: "100%", padding: 14, borderRadius: 14, border: "none", background: "#fff", fontSize: 16, color: COULEURS.encre, fontFamily: "'Plus Jakarta Sans', sans-serif", boxShadow: "0 2px 8px rgba(46,34,48,0.06)" },
  zoneTexte: { width: "100%", minHeight: 120, padding: 14, borderRadius: 14, border: "none", background: "#fff", fontSize: 16, color: COULEURS.encre, fontFamily: "'Plus Jakarta Sans', sans-serif", resize: "vertical", boxShadow: "0 2px 8px rgba(46,34,48,0.06)" },
  aide: { fontSize: 13, color: COULEURS.doux, marginTop: 8, lineHeight: 1.4 },

  zoneCouverture: { display: "flex", alignItems: "center", justifyContent: "center", height: 120, borderRadius: 16, border: `2px dashed ${COULEURS.bordure}`, background: "#fff", cursor: "pointer", overflow: "hidden" },
  couvertureApercu: { width: "100%", height: "100%", objectFit: "cover" },
  detailCouverture: { height: 150, borderRadius: 22, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", color: "#fff", marginBottom: 14, overflow: "hidden" },
  boutonCouverture: { position: "absolute", bottom: 10, right: 10, background: "rgba(0,0,0,0.5)", color: "#fff", borderRadius: 999, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", backdropFilter: "blur(4px)" },

  grilleTypes: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  tuileType: { background: "#fff", border: "2px solid transparent", borderRadius: 16, padding: "14px 10px", cursor: "pointer", textAlign: "center", boxShadow: "0 3px 10px rgba(46,34,48,0.06)" },
  tuileIcone: { width: 46, height: 46, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, margin: "0 auto" },
  tuileTypeNom: { fontSize: 13, fontWeight: 600, marginTop: 8 },

  boutonPrincipal: { width: "100%", background: DEGRADE, color: "#fff", border: "none", borderRadius: 16, padding: 16, fontSize: 16, fontWeight: 700, cursor: "pointer", marginTop: 16, fontFamily: "'Plus Jakarta Sans', sans-serif", boxShadow: "0 10px 24px rgba(255,92,157,0.4)" },
  boutonSecondaire: { width: "100%", background: "#fff", color: COULEURS.corail, border: "none", borderRadius: 16, padding: 15, fontSize: 15, fontWeight: 700, cursor: "pointer", marginTop: 12, fontFamily: "'Plus Jakarta Sans', sans-serif", boxShadow: "0 4px 14px rgba(46,34,48,0.08)" },
  boutonInviter: { width: "100%", background: COULEURS.encre, color: "#fff", border: "none", borderRadius: 16, padding: 15, fontSize: 15, fontWeight: 700, cursor: "pointer", marginTop: 12, fontFamily: "'Plus Jakarta Sans', sans-serif" },
  boutonDesactive: { opacity: 0.45, cursor: "not-allowed", boxShadow: "none" },
  boutonOuvrir: { width: "100%", background: COULEURS.encre, color: "#fff", border: "none", borderRadius: 16, padding: 16, fontSize: 16, fontWeight: 700, cursor: "pointer", marginTop: 12, fontFamily: "'Plus Jakarta Sans', sans-serif" },
  boutonMini: { background: DEGRADE, color: "#fff", border: "none", borderRadius: 12, padding: "10px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer", marginTop: 10 },
  boutonMiniGris: { flex: 1, background: "#F3ECEF", color: COULEURS.encre, border: "none", borderRadius: 12, padding: 10, fontSize: 14, fontWeight: 600, cursor: "pointer" },
  lienDiscret: { background: "none", border: "none", color: COULEURS.corail, fontSize: 14, cursor: "pointer", padding: 0, marginTop: 10, fontWeight: 700, width: "100%" },
  lienCrayon: { background: "none", border: "none", color: COULEURS.corail, fontSize: 13, cursor: "pointer", fontWeight: 700, padding: 0 },

  blocSceau: { background: "#fff", borderRadius: 22, padding: "26px 20px", textAlign: "center", marginBottom: 16, boxShadow: "0 6px 20px rgba(46,34,48,0.08)" },
  sceauJours: { fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 64, fontWeight: 800, background: DEGRADE, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", lineHeight: 1 },
  sceauEtat: { fontSize: 16, color: COULEURS.encre, marginTop: 4, fontWeight: 600 },
  sceauDate: { fontSize: 14, color: COULEURS.doux, marginTop: 6 },

  statsLigne: { display: "flex", gap: 12 },
  statBloc: { flex: 1, background: "#fff", borderRadius: 16, padding: 14, textAlign: "center", boxShadow: "0 4px 14px rgba(46,34,48,0.06)" },
  statChiffre: { fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 26, fontWeight: 800 },
  statLabel: { fontSize: 13, color: COULEURS.doux, fontWeight: 500 },

  // Rejoindre / inviter
  carteTrouvee: { background: "#fff", borderRadius: 16, padding: 16, boxShadow: "0 4px 14px rgba(46,34,48,0.08)" },
  blocCode: { background: "#fff", borderRadius: 20, padding: "22px", textAlign: "center", marginTop: 10, boxShadow: "0 6px 20px rgba(46,34,48,0.08)" },
  codeLabel: { fontSize: 13, color: COULEURS.doux, fontWeight: 600 },
  codeValeur: { fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 44, fontWeight: 800, letterSpacing: 6, background: DEGRADE, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", margin: "4px 0 8px" },
  blocLien: { background: "#fff", borderRadius: 14, padding: 14, marginTop: 12, boxShadow: "0 2px 8px rgba(46,34,48,0.06)" },

  rangeeAuteurs: { display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 },
  choixAuteur: { display: "flex", flexDirection: "column", alignItems: "center", gap: 5, background: "none", border: "none", cursor: "pointer", padding: 6, borderRadius: 14, minWidth: 66 },
  choixAuteurActif: { background: "#fff", boxShadow: "0 4px 12px rgba(255,92,157,0.25)" },
  choixAuteurNom: { fontSize: 12, color: COULEURS.encre, fontWeight: 600, maxWidth: 62, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  choixContrib: { display: "flex", alignItems: "center", width: "100%", background: "#fff", border: "none", borderRadius: 16, padding: 16, marginBottom: 10, cursor: "pointer", fontSize: 16, fontWeight: 600, color: COULEURS.encre, fontFamily: "'Plus Jakarta Sans', sans-serif", boxShadow: "0 3px 10px rgba(46,34,48,0.06)" },
  carteQuestion: { background: DEGRADE, borderRadius: 16, padding: 18, marginBottom: 12, color: "#fff" },
  carteQuestionTexte: { fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 18, lineHeight: 1.4, fontWeight: 600 },
  apercuMedia: { width: "100%", borderRadius: 14, marginTop: 10, display: "block" },

  rangeeFiltres: { display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 },
  pastilleFiltre: { flexShrink: 0, background: "#fff", border: "none", borderRadius: 999, padding: "9px 15px", fontSize: 13, fontWeight: 600, cursor: "pointer", color: COULEURS.encre, boxShadow: "0 2px 8px rgba(46,34,48,0.06)" },
  pastilleFiltreActive: { background: DEGRADE, color: "#fff" },
  pastilleAmbiance: { flexShrink: 0, border: "none", borderRadius: 999, padding: "9px 17px", fontSize: 13, fontWeight: 700, cursor: "pointer" },

  progression: { textAlign: "center", color: COULEURS.doux, fontSize: 14, marginBottom: 12, fontWeight: 600 },
  carteSouvenir: { background: "#fff", borderRadius: 24, padding: 20, flex: 1, boxShadow: "0 8px 24px rgba(46,34,48,0.1)" },
  souvenirEntete: { display: "flex", alignItems: "center", gap: 10, marginBottom: 14 },
  souvenirDate: { fontSize: 13, color: COULEURS.doux },
  souvenirQuestion: { fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 17, color: COULEURS.corail, marginBottom: 10, fontWeight: 600 },
  souvenirMedia: { width: "100%", borderRadius: 14, marginBottom: 12, display: "block" },
  souvenirTexte: { fontSize: 17, lineHeight: 1.6 },
  souvenirMessageAmbiance: { fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 20, fontWeight: 600, lineHeight: 1.5, padding: 22, borderRadius: 18, marginTop: 4 },
  ligneReactions: { display: "flex", gap: 8, marginTop: 18 },
  boutonReaction: { flex: 1, background: "#FBF3F7", border: "none", borderRadius: 14, padding: 11, fontSize: 18, cursor: "pointer" },
  reactionNb: { fontSize: 14, marginLeft: 4, color: COULEURS.doux, fontWeight: 600 },
  navOuverture: { display: "flex", gap: 12, marginTop: 16 },
  boutonNav: { flex: 1, background: "#fff", border: "none", borderRadius: 14, padding: 14, fontSize: 15, fontWeight: 700, color: COULEURS.encre, cursor: "pointer", fontFamily: "'Plus Jakarta Sans', sans-serif", boxShadow: "0 3px 10px rgba(46,34,48,0.06)" },

  finTitre: { fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 26, fontWeight: 800, margin: "10px 0 6px" },
  finTexte: { color: COULEURS.doux, fontSize: 15, marginBottom: 22, lineHeight: 1.5 },
  carteAlbum: { width: "100%", textAlign: "left", cursor: "pointer", border: "none", background: DEGRADE, color: "#fff", borderRadius: 22, padding: 22, boxShadow: "0 14px 34px rgba(255,92,157,0.4)" },
  albumTitre: { fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 21, fontWeight: 700 },
  albumSous: { fontSize: 14, opacity: 0.92, marginTop: 6, lineHeight: 1.5 },
  albumFleche: { fontSize: 15, fontWeight: 700, marginTop: 14 },
  albumConfirme: { background: "#fff", color: "#2E7D55", borderRadius: 18, padding: 18, fontSize: 15, lineHeight: 1.5, boxShadow: "0 4px 14px rgba(46,34,48,0.08)" },

  boutonEnregistrer: { width: "100%", background: "#FF3B30", color: "#fff", border: "none", borderRadius: 16, padding: 18, fontSize: 16, fontWeight: 700, cursor: "pointer", marginTop: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, fontFamily: "'Plus Jakarta Sans', sans-serif" },
  blocEnregistrement: { display: "flex", flexDirection: "column", alignItems: "center", gap: 12, background: "#FFF0F0", borderRadius: 16, padding: "18px 16px", marginTop: 12 },
  pointRouge: { width: 14, height: 14, borderRadius: "50%", background: "#FF3B30", animation: "pulse 1s infinite" },
  lecteurAudio: { background: "#F8F0F5", borderRadius: 16, padding: "20px 16px", textAlign: "center", marginBottom: 12 },

  barreOnglets: { position: "absolute", bottom: 0, left: 0, right: 0, height: 72, background: "rgba(255,255,255,0.92)", borderTop: `1px solid ${COULEURS.bordure}`, display: "flex", backdropFilter: "blur(10px)" },
  onglet: { flex: 1, background: "none", border: "none", cursor: "pointer", color: COULEURS.doux, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2 },
  ongletActif: { color: COULEURS.corail },
  ongletNom: { fontSize: 11, fontWeight: 700 },
};
