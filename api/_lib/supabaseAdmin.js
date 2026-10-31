import { createClient } from "@supabase/supabase-js";

let cached = null;

// A legacy JWT with role service_role, or a new-style secret key. The anon key
// would run, but as the public, and fail only once the tables are locked.
export function isServiceKey(key) {
  if (typeof key !== "string") return false;
  if (key.startsWith("sb_secret_")) return true;
  try {
    return JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString()).role === "service_role";
  } catch {
    return false;
  }
}

// The service-role key bypasses row security, so it lives only in a server-side
// env var (never VITE_-prefixed, or Vite would bake it into the public bundle).
export function getServiceClient() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  if (!isServiceKey(key)) { console.error("SUPABASE_SERVICE_ROLE_KEY is not a service key"); return null; }
  if (!cached) cached = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return cached;
}
