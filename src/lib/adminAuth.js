// Admin session helper. The password itself never reaches this file or the
// browser bundle — /api/admin-login checks it server-side (see that file)
// and hands back a signed, time-limited token that we just store and relay.

const TOKEN_KEY = "fonkiart-admin-authed";

export async function adminLogin(password) {
  try {
    const res = await fetch("/api/admin-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.ok) return false;
    localStorage.setItem(TOKEN_KEY, body.token);
    return true;
  } catch {
    return false;
  }
}

// Re-checks the stored token against the server. A token that's expired,
// forged, or left over from a rotated password fails here even though it's
// still sitting in localStorage.
export async function adminVerify() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return false;
  try {
    const res = await fetch(`/api/admin-verify?token=${encodeURIComponent(token)}`);
    const body = await res.json().catch(() => ({}));
    if (!body.valid) localStorage.removeItem(TOKEN_KEY);
    return !!body.valid;
  } catch {
    return false; // network hiccup: don't trust a token we couldn't verify
  }
}

export function adminHasToken() {
  return !!localStorage.getItem(TOKEN_KEY);
}

export function adminLogout() {
  localStorage.removeItem(TOKEN_KEY);
}
