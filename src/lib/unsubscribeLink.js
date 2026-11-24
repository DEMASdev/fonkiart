// The "Unsubscribe" link in every email that carries a coupon (Andy, 2026-11-23, "1bc yes"):
// fonkiart.com/?unsubscribe=<token>. The server makes it and the token in it (api/_lib/unsubscribe.js);
// App.jsx reads it and opens its page (src/pages/UnsubscribePage.jsx). The token stays in the address
// bar while that page is open, so it can be reloaded, and is taken out when the person leaves it.
const PARAM = "unsubscribe";
export const unsubscribeLink = (site, token) => `${site}/?${PARAM}=${token}`;
export const readUnsubscribe = (search) => new URLSearchParams(search).get(PARAM) || null;

// The same address without it (and everything else kept).
export function withoutUnsubscribe(search) {
  const q = new URLSearchParams(search);
  q.delete(PARAM);
  const rest = q.toString();
  return rest ? `?${rest}` : "";
}
