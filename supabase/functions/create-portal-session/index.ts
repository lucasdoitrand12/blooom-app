// Edge Function Supabase — crée une session Stripe Customer Portal.
// Permet à l'utilisateur de gérer son abonnement (résiliation, changement de plan,
// mise à jour de moyen de paiement) directement sur l'interface Stripe hébergée.
// Variables d'environnement requises :
//   STRIPE_SECRET_KEY        — clé secrète Stripe
//   SUPABASE_URL             — URL du projet Supabase
//   SUPABASE_SERVICE_ROLE_KEY — clé service role pour lire stripe_customer_id

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

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { user_id, return_url } = await req.json();

    if (!user_id) throw new Error("user_id manquant");

    // Récupère le stripe_customer_id depuis le profil Supabase
    const { data: profil, error } = await supabase
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user_id)
      .single();

    if (error || !profil?.stripe_customer_id) {
      throw new Error("Aucun abonnement Stripe trouvé pour cet utilisateur.");
    }

    // Crée la session Customer Portal — l'utilisateur peut gérer son abonnement sans support
    const session = await stripe.billingPortal.sessions.create({
      customer:   profil.stripe_customer_id,
      return_url: return_url ?? "https://blooom.app",
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
