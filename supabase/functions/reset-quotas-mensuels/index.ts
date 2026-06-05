// Edge Function Supabase — remet à zéro les compteurs mensuels des capsules
// Naissance et Mamie/Papy le 1er de chaque mois.
// À appeler via pg_cron : 0 1 1 * * (le 1er du mois à 00h01 UTC)
// Variables d'environnement requises :
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve }        from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

serve(async (_req: Request) => {
  try {
    const now = new Date().toISOString();

    // Remet à zéro les compteurs pour TOUTES les capsules des formules mensuelles.
    // POURQUOI ne pas filtrer par packs_actifs.actif : si un abonnement vient d'être
    // résilié en milieu de mois, les membres ont déjà payé ce mois — ils méritent
    // leur quota jusqu'à la prochaine réinitialisation.
    const { data, error } = await supabase
      .from("capsules")
      .update({
        compte_photos: 0,
        compte_videos: 0,
        compte_vocaux: 0,
        papy_reset_at: now,
      })
      .in("formule", ["naissance", "papy"])
      .select("id");

    if (error) throw error;

    const nbCapsules = data?.length ?? 0;

    // Trace l'opération dans admin_logs pour auditabilité
    await supabase.from("admin_logs").insert({
      action:  "reset_quotas_mensuels",
      details: JSON.stringify({ nb_capsules: nbCapsules, executed_at: now }),
    });

    console.log(`Quotas mensuels réinitialisés pour ${nbCapsules} capsule(s).`);

    return new Response(
      JSON.stringify({ ok: true, nb_capsules: nbCapsules }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    console.error("Erreur reset-quotas-mensuels :", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
