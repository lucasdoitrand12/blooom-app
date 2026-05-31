// Edge Function : envoie des push notifications via FCM v1 API
// Variables d'environnement requises dans le dashboard Supabase :
//   FIREBASE_PROJECT_ID   — ex: blooom-app
//   FIREBASE_SA_EMAIL     — client_email du service account JSON
//   FIREBASE_SA_KEY       — private_key du service account JSON (avec \n réels)
import { serve }         from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient }  from "https://esm.sh/@supabase/supabase-js@2";

const PROJECT_ID = Deno.env.get("FIREBASE_PROJECT_ID") ?? "";
const SA_EMAIL   = Deno.env.get("FIREBASE_SA_EMAIL")   ?? "";
const SA_KEY     = Deno.env.get("FIREBASE_SA_KEY")     ?? "";

// Génère un access token OAuth2 à partir du service account (JWT → Google Token API)
async function getAccessToken(): Promise<string> {
  const now  = Math.floor(Date.now() / 1000);
  const enc  = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  const header  = enc({ alg: "RS256", typ: "JWT" });
  const payload = enc({
    iss:   SA_EMAIL,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud:   "https://oauth2.googleapis.com/token",
    exp:   now + 3600,
    iat:   now,
  });

  const unsigned = `${header}.${payload}`;
  const pemBody  = SA_KEY.replace(/-----BEGIN PRIVATE KEY-----/, "")
                         .replace(/-----END PRIVATE KEY-----/, "")
                         .replace(/\\n/g, "\n")
                         .replace(/\s/g, "");
  const der      = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));
  const key      = await crypto.subtle.importKey(
    "pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]
  );
  const sigBuf   = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const sig      = btoa(String.fromCharCode(...new Uint8Array(sigBuf)))
                   .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const jwt      = `${unsigned}.${sig}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const { access_token } = await res.json();
  return access_token;
}

async function fcmSend(
  token: string,
  title: string,
  body: string,
  data: Record<string, string> = {},
  accessToken: string
): Promise<boolean> {
  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${PROJECT_ID}/messages:send`,
    {
      method:  "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body:    JSON.stringify({
        message: {
          token,
          notification: { title, body },
          data,
          apns: { payload: { aps: { badge: 1, sound: "default" } } },
          android: { priority: "high" },
        },
      }),
    }
  );
  return res.ok;
}

serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  // Service role pour contourner RLS lors de la lecture des tokens
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const {
    participant_id, // cible : un participant précis
    user_ids,       // cible : liste d'UUID auth (ex : tous les utilisateurs)
    segment,        // 'tous' | 'bientot' (30j)
    title = "Blooom 🌸",
    body,
    data = {},
  } = await req.json();

  if (!body) return new Response(JSON.stringify({ error: "body requis" }), { status: 400 });

  // 1. Construire la liste de user_id à notifier
  let targetUserIds: string[] = [];

  if (participant_id) {
    const { data: p } = await supabase
      .from("participants").select("user_id").eq("id", participant_id).maybeSingle();
    if (p?.user_id) targetUserIds = [p.user_id];
  } else if (user_ids?.length) {
    targetUserIds = user_ids;
  } else if (segment === "tous") {
    const { data: rows } = await supabase
      .from("participants").select("user_id").not("user_id", "is", null);
    targetUserIds = [...new Set((rows ?? []).map((r: { user_id: string }) => r.user_id))];
  } else if (segment === "bientot") {
    const in30 = new Date(Date.now() + 30 * 86400000).toISOString();
    const { data: caps } = await supabase
      .from("capsules").select("id").eq("ouverte", false).lte("date_ouverture", in30);
    const capIds = (caps ?? []).map((c: { id: string }) => c.id);
    if (capIds.length) {
      const { data: rows } = await supabase
        .from("participants").select("user_id").in("capsule_id", capIds).not("user_id", "is", null);
      targetUserIds = [...new Set((rows ?? []).map((r: { user_id: string }) => r.user_id))];
    }
  }

  if (!targetUserIds.length) return new Response(JSON.stringify({ sent: 0 }));

  // 2. Récupérer les device tokens
  const { data: tokens } = await supabase
    .from("device_tokens").select("token").in("user_id", targetUserIds);

  if (!tokens?.length) return new Response(JSON.stringify({ sent: 0 }));

  // 3. Envoyer via FCM (uniquement si les credentials sont configurés)
  let sent = 0;
  if (PROJECT_ID && SA_EMAIL && SA_KEY) {
    const accessToken = await getAccessToken();
    const dataStr: Record<string, string> = Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, String(v)])
    );
    const results = await Promise.allSettled(
      tokens.map((t: { token: string }) => fcmSend(t.token, title, body, dataStr, accessToken))
    );
    sent = results.filter(r => r.status === "fulfilled" && r.value).length;
  }

  return new Response(JSON.stringify({ sent, total: tokens.length }), {
    headers: { "Content-Type": "application/json" },
  });
});
