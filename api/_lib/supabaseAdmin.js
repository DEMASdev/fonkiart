import { createClient } from "@supabase/supabase-js";

let cached = null;

// The service-role key bypasses row security, so it lives only in a server-side
// env var (never VITE_-prefixed, or Vite would bake it into the public bundle).
export function getServiceClient() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  if (!cached) cached = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return cached;
}
