import { supabase } from "./supabase";

// The public site's only way to touch customer data: /api/store runs each action
// on the server, so the database stays locked to the public key.
export async function storeCall(op, payload = {}, { signedIn = false } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (signedIn && supabase) {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`/api/store?op=${encodeURIComponent(op)}`, { method: "POST", headers, body: JSON.stringify(payload) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || `Store ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return body;
}
