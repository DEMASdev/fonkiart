// The links from the daily "Waiting for you" email into Admin -> Orders, with the list they are about
// open: "Didn't finish paying" (Andy, 2026-11-22) or "Left in the cart" (2026-11-23). The server builds
// them (api/_lib/emails.js), App.jsx reads one once on arrival and takes it out of the address bar,
// and Admin still asks for its password on a device that isn't signed in. The list's wish waits in
// this tab until Orders opens (OrdersTab.jsx, CartsLeft.jsx).
const PARAM = "admin";
const LISTS = ["unfinished", "carts"];
const WISH = "fonkiart-open-unfinished";

const listLink = (list) => (site) => `${site}/?${PARAM}=${list}`;
export const unfinishedLink = listLink("unfinished");
export const cartsLink = listLink("carts");

// The address bar's link, "unfinished" or "carts", or null.
export const readAdminLink = (search) => { const list = new URLSearchParams(search).get(PARAM); return LISTS.includes(list) ? list : null; };

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
export function askOpenList(list) { try { session()?.setItem(WISH, list); } catch { /* storage refused */ } }
export function wantsOpenList(list) { try { return session()?.getItem(WISH) === list; } catch { return false; } }
export function doneOpenList() { try { session()?.removeItem(WISH); } catch { /* storage refused */ } }
