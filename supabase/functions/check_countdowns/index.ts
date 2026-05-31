// Edge Function : vérifications quotidiennes planifiées via pg_cron
// Déclencher avec : select cron.schedule('daily-blooom-check', '0 9 * * *', $$
//   select net.http_post(url := '<SUPABASE_URL>/functions/v1/check_countdowns',
//     headers := '{"Authorization":"Bearer <SERVICE_ROLE_KEY>"}') $$);
//
// Tables requises (SQL à exécuter dans Supabase SQL Editor) :
// create table notifications (
//   id uuid primary key default gen_random_uuid(),
//   participant_id uuid references participants(id) on delete cascade,
//   capsule_id uuid references capsules(id) on delete cascade,
//   texte text not null,
//   lue boolean default false,
//   cible_ecran text,
//   created_at timestamptz default now()
// );
// create table quiz_reponses (
//   id uuid primary key default gen_random_uuid(),
//   capsule_id uuid references capsules(id) on delete cascade,
//   participant_id uuid references participants(id) on delete cascade,
//   reponse integer not null,
//   created_at timestamptz default now()
// );
// create table votes_favori (
//   id uuid primary key default gen_random_uuid(),
//   capsule_id uuid references capsules(id) on delete cascade,
//   participant_id uuid references participants(id) on delete cascade,
//   contribution_id uuid references contributions(id) on delete cascade,
//   created_at timestamptz default now(),
//   unique(capsule_id, participant_id)
// );

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async () => {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  // 1. COMPTE À REBOURS : notifier 7 jours avant ouverture
  const in7 = new Date(today);
  in7.setDate(in7.getDate() + 7);
  const in7Str = in7.toISOString().slice(0, 10);

  const { data: capsules7j } = await supabase
    .from("capsules")
    .select("id, nom, participants(id)")
    .eq("ouverte", false)
    .gte("date_ouverture", in7Str + "T00:00:00")
    .lt("date_ouverture", in7Str + "T23:59:59");

  for (const capsule of capsules7j ?? []) {
    for (const p of capsule.participants ?? []) {
      const cle = `countdown_7j_${capsule.id}_${todayStr}`;
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("participant_id", p.id)
        .eq("capsule_id", capsule.id)
        .like("texte", "%7 jours%");
      if ((count ?? 0) === 0) {
        await supabase.from("notifications").insert({
          participant_id: p.id,
          capsule_id: capsule.id,
          texte: `🕰️ La capsule « ${capsule.nom} » s'ouvre dans 7 jours !`,
          cible_ecran: "detail",
        });
      }
    }
  }

  // 2. COMPTE À REBOURS : notifier le jour J
  const { data: capsulesJ } = await supabase
    .from("capsules")
    .select("id, nom, participants(id)")
    .eq("ouverte", false)
    .gte("date_ouverture", todayStr + "T00:00:00")
    .lt("date_ouverture", todayStr + "T23:59:59");

  for (const capsule of capsulesJ ?? []) {
    for (const p of capsule.participants ?? []) {
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("participant_id", p.id)
        .eq("capsule_id", capsule.id)
        .like("texte", "%s'ouvre aujourd'hui%");
      if ((count ?? 0) === 0) {
        await supabase.from("notifications").insert({
          participant_id: p.id,
          capsule_id: capsule.id,
          texte: `🎊 La capsule « ${capsule.nom} » s'ouvre aujourd'hui !`,
          cible_ecran: "detail",
        });
      }
    }
  }

  // 3. RELANCE CONTRIBUTIONS : participants sans contribution depuis 7 jours
  const il7j = new Date(today);
  il7j.setDate(il7j.getDate() - 7);

  const { data: capsulesFermees } = await supabase
    .from("capsules")
    .select("id, nom, participants(id, user_id), contributions(auteur_id, created_at)")
    .eq("ouverte", false);

  for (const capsule of capsulesFermees ?? []) {
    for (const p of capsule.participants ?? []) {
      if (!p.user_id) continue;
      const derniereContrib = (capsule.contributions ?? [])
        .filter(c => c.auteur_id === p.id)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
      const depuisCreation = (today.getTime() - new Date(capsule.created_at ?? today).getTime()) / 86400000;
      if (depuisCreation < 7) continue; // nouvelle capsule, pas de relance
      if (!derniereContrib || new Date(derniereContrib.created_at) < il7j) {
        const { count } = await supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("participant_id", p.id)
          .eq("capsule_id", capsule.id)
          .like("texte", "%souvenir depuis%")
          .gte("created_at", il7j.toISOString());
        if ((count ?? 0) === 0) {
          await supabase.from("notifications").insert({
            participant_id: p.id,
            capsule_id: capsule.id,
            texte: `✏️ Tu n'as pas ajouté de souvenir depuis 7 jours dans « ${capsule.nom} ». Il en manque peut-être !`,
            cible_ecran: "contribution",
          });
        }
      }
    }
  }

  // 4. ANNIVERSAIRE : capsules créées exactement 1 an avant aujourd'hui
  const il1an = new Date(today);
  il1an.setFullYear(il1an.getFullYear() - 1);
  const il1anStr = il1an.toISOString().slice(0, 10);

  const { data: capsulesAnniv } = await supabase
    .from("capsules")
    .select("id, nom, participants(id)")
    .gte("created_at", il1anStr + "T00:00:00")
    .lt("created_at", il1anStr + "T23:59:59");

  for (const capsule of capsulesAnniv ?? []) {
    for (const p of capsule.participants ?? []) {
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("participant_id", p.id)
        .eq("capsule_id", capsule.id)
        .like("texte", "%1 an%");
      if ((count ?? 0) === 0) {
        await supabase.from("notifications").insert({
          participant_id: p.id,
          capsule_id: capsule.id,
          texte: `🥂 La capsule « ${capsule.nom} » fête ses 1 an aujourd'hui !`,
          cible_ecran: "detail",
        });
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, date: todayStr }), {
    headers: { "Content-Type": "application/json" },
  });
});
