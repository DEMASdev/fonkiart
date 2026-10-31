import { supabase } from "./supabase";
import { adminTokenValue } from "./adminAuth";
import { recordQuery } from "./adminQuery";

// Same shape as the supabase client the admin screens used before, but every call
// goes to /api/admin, which checks the admin login and runs it on the server.
async function callAdmin(payload) {
  try {
    const res = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminTokenValue()}` },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { data: null, count: null, error: body.error || { message: `Admin API ${res.status}` } };
    return body;
  } catch (e) {
    return { data: null, count: null, error: { message: e?.message || "Network error" } };
  }
}

const storage = {
  from: (bucket) => ({
    async upload(path, file) {
      const signed = await callAdmin({ kind: "storage-sign", path });
      if (signed.error) return { data: null, error: signed.error };
      return supabase.storage.from(bucket).uploadToSignedUrl(signed.path, signed.token, file);
    },
    getPublicUrl: (path) => supabase.storage.from(bucket).getPublicUrl(path),
    remove: (paths) => callAdmin({ kind: "storage-remove", paths }),
  }),
};

export const adminDb = { from: (table) => recordQuery(table, callAdmin), storage };

export async function adminSendEmail(message) {
  const r = await callAdmin({ kind: "email", ...message });
  if (r.error) throw new Error(r.error.message || "Email failed");
}
