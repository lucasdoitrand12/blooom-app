// Edge Function Supabase — crée une session Stripe Checkout et renvoie son URL.
// Variables d'environnement requises dans le dashboard Supabase :
//   STRIPE_SECRET_KEY  — clé secrète Stripe (sk_live_... ou sk_test_...)
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

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

// Prix exacts par type de pack (en centimes)
const PRIX_CENTIMES: Record<string, number> = {
  pack_occasion:          999,   // 9,99€ one-shot
  pack_mariage:           2999,  // 29,99€ one-shot
  pack_naissance_mensuel:  499,  // 4,99€/mois récurrent
  pack_naissance_annuel:  4499,  // 44,99€/an récurrent
  pack_papy_mensuel:       499,  // 4,99€/mois récurrent
  pack_papy_annuel:       4499,  // 44,99€/an récurrent
  album_20p:              1299,
  album_40p:              1999,
  album_60p:              2499,
  upgrade_videos:          299,
  upgrade_vocaux:          299,
  upgrade_videos_vocaux:   499,
};

const NOMS: Record<string, string> = {
  pack_occasion:          "Pack Inoubliable (Weekend / Soirée / Voyage / EVJF / EVG)",
  pack_mariage:           "Pack Mariage 💍",
  pack_naissance_mensuel: "Pack Naissance 🍼 — mensuel",
  pack_naissance_annuel:  "Pack Naissance 🍼 — annuel",
  pack_papy_mensuel:      "Pack Mamie/Papy 👴 — mensuel",
  pack_papy_annuel:       "Pack Mamie/Papy 👴 — annuel",
  album_20p:              "Album papier 20 pages",
  album_40p:              "Album papier 40 pages",
  album_60p:              "Album papier 60 pages",
  upgrade_videos:         "+5 vidéos — Blooom",
  upgrade_vocaux:         "+5 vocaux — Blooom",
  upgrade_videos_vocaux:  "+5 vidéos & +5 vocaux — Blooom",
};

const RECURRING = new Set([
  "pack_naissance_mensuel", "pack_naissance_annuel",
  "pack_papy_mensuel",      "pack_papy_annuel",
]);

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Retourne l'ID d'un coupon Stripe pour un pourcentage donné.
// Crée le coupon s'il n'existe pas encore (idempotent grâce à l'ID fixe).
async function obtenirCouponStripe(pourcentage: number): Promise<string> {
  const couponId = `blooom-${pourcentage}pct`;
  try {
    await stripe.coupons.retrieve(couponId);
  } catch {
    await stripe.coupons.create({
      id:          couponId,
      percent_off: pourcentage,
      duration:    "once",
      name:        `Blooom −${pourcentage}%`,
    });
  }
  return couponId;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const {
      type, user_id, capsule_data, capsule_id,
      success_url, cancel_url,
      promo_code,          // optionnel — code promo saisi par l'utilisateur
    } = await req.json();

    const montant = PRIX_CENTIMES[type];
    if (!montant) throw new Error(`Type inconnu : ${type}`);

    const isRecurring = RECURRING.has(type);
    const mode = isRecurring ? "subscription" : "payment";

    // Récupère le customer Stripe existant si disponible
    let stripeCustomerId: string | undefined;
    try {
      const { data: profil } = await supabase
        .from("profiles")
        .select("stripe_customer_id")
        .eq("id", user_id)
        .single();
      if (profil?.stripe_customer_id) stripeCustomerId = profil.stripe_customer_id;
    } catch (_) {
      console.warn("Impossible de récupérer le profil Stripe, on continue sans customer ID");
    }

    // Valide le code promo si fourni
    let couponId: string | undefined;
    let promoValidee: { id: string; pourcentage: number } | null = null;
    if (promo_code) {
      const { data: promo } = await supabase
        .from("codes_promo")
        .select("id, pourcentage, actif, expire_at, utilisations_max, utilisations_actuelles")
        .eq("code", promo_code.trim().toUpperCase())
        .single();

      const maintenant = new Date();
      const valide =
        promo &&
        promo.actif &&
        (!promo.expire_at || new Date(promo.expire_at) > maintenant) &&
        (promo.utilisations_max === null || promo.utilisations_actuelles < promo.utilisations_max);

      if (valide) {
        couponId = await obtenirCouponStripe(promo.pourcentage);
        promoValidee = { id: promo.id, pourcentage: promo.pourcentage };
      }
    }

    // Paramètres de base de la session Checkout
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode,
      line_items: [{
        price_data: {
          currency: "eur",
          product_data: { name: NOMS[type] || type },
          ...(isRecurring
            ? { recurring: { interval: type.endsWith("mensuel") ? "month" : "year" }, unit_amount: montant }
            : { unit_amount: montant }),
        },
        quantity: 1,
      }],
      success_url,
      cancel_url,
      client_reference_id: user_id,
      metadata: {
        type,
        user_id,
        capsule_id:       capsule_id             ?? "",
        capsule_nom:      capsule_data?.nom      ?? "",
        capsule_type:     capsule_data?.type     ?? "",
        capsule_date:     capsule_data?.date     ?? "",
        capsule_formule:  capsule_data?.formule  ?? type.replace("_mensuel","").replace("_annuel","").replace("pack_",""),
        promo_code:       promo_code ?? "",
        promo_id:         promoValidee?.id ?? "",
      },
      ...(stripeCustomerId ? { customer: stripeCustomerId } : {}),
      // Applique le coupon si le code promo est valide
      ...(couponId
        ? (isRecurring
          ? { discounts: [{ coupon: couponId }] }  // abonnement
          : { discounts: [{ coupon: couponId }] })  // paiement unique
        : {}),
    };

    const session = await stripe.checkout.sessions.create(sessionParams);

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    console.error("create-checkout-session error:", message, err);
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
