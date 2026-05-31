import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  throw new Error('Créez admin/.env.local avec VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY');
}

// Utilise la clé anon — les droits admin sont accordés par les RLS policies
// qui appellent is_admin() (voir admin/supabase/schema.sql).
// Les actions destructives passent par les Edge Functions avec service_role.
export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true },
});
