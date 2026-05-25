import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Service-role client — server-side only. Reads + writes _role, _matches,
// _cascade_runs, etc. NEVER ship this key to the browser.
const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_KEY;

let supabase: SupabaseClient | null = null;

if (url && serviceKey) {
  supabase = createClient(url, serviceKey);
} else {
  console.warn('[db] SUPABASE_URL / SUPABASE_SERVICE_KEY not set — database calls will fail');
}

export { supabase };
