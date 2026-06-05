// Edge Function Supabase — reçoit et traite les webhooks Stripe.
// Variables d'environnement requises :
//   STRIPE_SECRET_KEY        — clé secrète Stripe
//   STRIPE_WEBHOOK_SECRET    — secret de signature du webhook (whsec_...)
//   SUPABASE_URL             — URL du projet Supabase
//   SUPABASE_SERVICE_ROLE_KEY — clé service role (bypass RLS)

import { serve }        from "https://deno.land/std@0.177.0/http/server.ts";
import Stripe           from "https://esm.sh/stripe@14.0.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

// Quotas à appliquer selon la formule — miroir de src/utils/abonnement.js
// POURQUOI dupliquer : l'Edge Function n'a pas accès au code frontend
const QUOTAS: Record<string, { photos: number; videos: number; vocaux: number; participants: number; dureeVideo: number; dureeVocal: number }> = {
  gratuit:  { photos: 15,  videos: 0,  vocaux: 0,  participants: 10,   dureeVideo: 0,  dureeVocal: 0  },
  occasion: { photos: 150, videos: 20, vocaux: 10, participants: 50,   dureeVideo: 20, dureeVocal: 20 },
  mariage:  { photos: 500, videos: 50, vocaux: 30, participants: 9999, dureeVideo: 20, dureeVocal: 20 },
  naissance:{ photos: 40,  videos: 4,  vocaux: 4,  participants: 9999, dureeVideo: 20, dureeVocal: 20 },
  papy:     { photos: 40,  videos: 4,  vocaux: 4,  participants: 9999, dureeVideo: 20, dureeVocal: 20 },
};

// Mappe le type d'achat vers la formule de capsule à créer
function formuleDepuisType(type: string): string {
  if (type === "pack_mariage") return "mariage";
  if (type.startsWith("pack_naissance")) return "naissance";
  if (type.startsWith("pack_papy")) return "papy";
  if (type === "pack_occasion") return "occasion";
  return "gratuit";
}

// Génère un code d'invitation alphanumérique à 6 caractères
function genererCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

serve(async (req: Request) => {
  const signature = req.headers.get("stripe-signature");
  const body      = await req.text();

  // Vérifie la signature Stripe — rejette toute requête non signée
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEventFromPayload(
      body,
      signature ?? "",
      Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "",
    );
  } catch (err) {
    console.error("Signature Stripe invalide :", err);
    return new Response("Signature invalide", { status: 400 });
  }

  try {
    switch (event.type) {

      // ── Paiement réussi ──────────────────────────────────────────────────
      case "checkout.session.completed": {
        const session  = event.data.object as Stripe.Checkout.Session;
        const userId   = session.client_reference_id ?? session.metadata?.user_id;
        const type     = session.metadata?.type ?? "";
        const formule  = formuleDepuisType(type);
        const q        = QUOTAS[formule] ?? QUOTAS.gratuit;

        if (!userId) break;

        // Enregistre l'achat dans la table achats
        await supabase.from("achats").insert({
          user_id:               userId,
          type,
          stripe_session_id:     session.id,
          stripe_subscription_id: session.subscription as string ?? null,
          montant_centimes:      session.amount_total ?? 0,
          statut:                "complete",
          capsule_id:            null, // sera mis à jour après création de la capsule
        });

        // Met à jour le stripe_customer_id sur le profil si pas encore fait
        if (session.customer) {
          await supabase.from("profiles")
            .update({ stripe_customer_id: session.customer as string })
            .eq("id", userId)
            .is("stripe_customer_id", null);
        }

        // Albums — pas de capsule à créer, on arrête ici
        if (type.startsWith("album_")) break;

        // Packs occasion et mariage : crée la capsule immédiatement
        if (type === "pack_occasion" || type === "pack_mariage") {
          const nom    = session.metadata?.capsule_nom  || "Ma capsule";
          const ctype  = session.metadata?.capsule_type || "amis";
          const date   = session.metadata?.capsule_date || null;

          const capsuleId = crypto.randomUUID();
          await supabase.from("capsules").insert({
            id:                 capsuleId,
            nom,
            type:               ctype,
            date_ouverture:     date,
            code:               genererCode(),
            created_by:         userId,
            formule,
            quota_photos:       q.photos,
            quota_videos:       q.videos,
            quota_vocaux:       q.vocaux,
            quota_participants: q.participants,
            duree_video_max_s:  q.dureeVideo,
            duree_vocal_max_s:  q.dureeVocal,
            compte_photos:      0,
            compte_videos:      0,
            compte_vocaux:      0,
          });

          // Met à jour l'achat avec l'ID de capsule créée
          await supabase.from("achats")
            .update({ capsule_id: capsuleId })
            .eq("stripe_session_id", session.id);
        }

        // Pack naissance : crée la capsule immédiatement (setup minimal, pas de form post-achat)
        if (type.startsWith("pack_naissance")) {
          const nom   = session.metadata?.capsule_nom  || "Mon bébé";
          const ctype = session.metadata?.capsule_type || "naissance";
          const date  = session.metadata?.capsule_date || null;

          const capsuleId = crypto.randomUUID();
          await supabase.from("capsules").insert({
            id:                 capsuleId,
            nom,
            type:               ctype,
            date_ouverture:     date,
            code:               genererCode(),
            created_by:         userId,
            formule:            "naissance",
            quota_photos:       q.photos,
            quota_videos:       q.videos,
            quota_vocaux:       q.vocaux,
            quota_participants: q.participants,
            duree_video_max_s:  q.dureeVideo,
            duree_vocal_max_s:  q.dureeVocal,
            compte_photos:      0,
            compte_videos:      0,
            compte_vocaux:      0,
          });

          await supabase.from("packs_actifs").insert({
            user_id:               userId,
            capsule_id:            capsuleId,
            type:                  "naissance",
            stripe_subscription_id: session.subscription as string ?? null,
            actif:                 true,
          });

          await supabase.from("achats")
            .update({ capsule_id: capsuleId })
            .eq("stripe_session_id", session.id);
        }

        // Pack papy : enregistre uniquement dans packs_actifs (sans capsule_id).
        // La capsule est créée après paiement par l'utilisateur via EcranSuccesPapy
        // (choix du nom + date d'ouverture). La capsule sera liée dans creerCapsule.
        if (type.startsWith("pack_papy")) {
          await supabase.from("packs_actifs").insert({
            user_id:               userId,
            capsule_id:            null,
            type:                  "papy",
            stripe_subscription_id: session.subscription as string ?? null,
            actif:                 true,
          });
        }

        // Incrémente le compteur d'utilisations du code promo si applicable
        const promoId = session.metadata?.promo_id;
        if (promoId) {
          await supabase.rpc("incrementer_utilisation_promo", { p_id: promoId });
        }


        break;
      }

      // ── Abonnement récurrent résilié ─────────────────────────────────────
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        // Marque le pack comme inactif — la capsule et ses souvenirs restent accessibles
        await supabase.from("packs_actifs")
          .update({ actif: false })
          .eq("stripe_subscription_id", sub.id);

        // Notifie l'utilisateur via la table notifications
        const { data: pack } = await supabase.from("packs_actifs")
          .select("user_id, type").eq("stripe_subscription_id", sub.id).single();
        if (pack?.user_id) {
          await supabase.from("notifications").insert({
            user_id:     pack.user_id,
            texte:       `Votre Pack ${pack.type === "naissance" ? "Naissance" : "Mamie/Papy"} a été résilié. Vos souvenirs restent accessibles.`,
            lue:         false,
          });
        }
        break;
      }

      // ── Abonnement mis à jour (renouvellement) ───────────────────────────
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        await supabase.from("packs_actifs")
          .update({ expire_at: new Date(sub.current_period_end * 1000).toISOString() })
          .eq("stripe_subscription_id", sub.id);
        break;
      }

      // ── Paiement récurrent échoué ────────────────────────────────────────
      case "invoice.payment_failed": {
        const invoice    = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        const { data: profil } = await supabase
          .from("profiles").select("id").eq("stripe_customer_id", customerId).single();

        if (profil?.id) {
          await supabase.from("notifications").insert({
            user_id: profil.id,
            texte:   "Votre paiement Blooom a échoué. Mettez à jour votre moyen de paiement pour continuer.",
            lue:     false,
          });
        }
        break;
      }
    }
  } catch (err) {
    console.error("Erreur traitement webhook :", event.type, err);
    return new Response("Erreur interne", { status: 500 });
  }

  return new Response(JSON.stringify({ recu: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
