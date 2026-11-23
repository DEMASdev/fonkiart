// The link from the daily "Waiting for you" email into Admin -> Orders, with its "Didn't finish
// paying" list open (Andy, 2026-11-22). The server builds it (api/_lib/emails.js), App.jsx reads it
// once on arrival and takes it out of the address bar, and Admin still asks for its password on a
// device that isn't signed in. The list's wish waits in this tab until Orders opens (OrdersTab.jsx).
const PARAM = "admin";
const UNFINISHED = "unfinished";
const WISH = "fonkiart-open-unfinished";

export const unfinishedLink = (site) => `${site}/?${PARAM}=${UNFINISHED}`;

// The address bar's link, or null: "unfinished" is the only one there is.
export const readAdminLink = (search) => (new URLSearchParams(search).get(PARAM) === UNFINISHED ? UNFINISHED : null);

// The same address without the link (and everything else kept).
export function withoutAdminLink(search) {
  const q = new URLSearchParams(search);
  q.delete(PARAM);
  const rest = q.toString();
  return rest ? `?${rest}` : "";
}

// The wish, kept for this tab only. A private window may refuse storage: then the list just
// starts closed, as it always did.
const session = () => { try { return globalThis.sessionStorage || null; } catch { return null; } };
export function askOpenUnfinished() { try { session()?.setItem(WISH, "1"); } catch { /* storage refused */ } }
export function wantsOpenUnfinished() { try { return session()?.getItem(WISH) === "1"; } catch { return false; } }
export function doneOpenUnfinished() { try { session()?.removeItem(WISH); } catch { /* storage refused */ } }
