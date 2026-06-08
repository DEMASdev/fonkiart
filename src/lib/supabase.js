import { createClient } from "@supabase/supabase-js";

export const BREVO_API_KEY    = import.meta.env.VITE_BREVO_API_KEY;
export const BREVO_SENDER     = import.meta.env.VITE_BREVO_SENDER;
export const SUPABASE_URL     = import.meta.env.VITE_SUPABASE_URL;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const ADMIN_PASSWORD   = import.meta.env.VITE_ADMIN_PASSWORD;

export const supabase = SUPABASE_URL?.startsWith("http")
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;
