// Shipping and tracking (Andy, 2026-11-17: "if shipping was used ... check mark and activate a
// box to enter the tracking number and should ask to send an email to the customer ... with a
// live link to track the order", and "when marking an order as shipped it should ask for
// tracking number or if it was a pickup delivery").
//
// An order that went out with a carrier keeps three text columns: tracking_carrier (one of
// CARRIERS), tracking_number, and tracking_url (only for "Other": that carrier's own tracking
// page). trackingLink() turns them into the ONE live link that the admin's Orders list, the
// client's email and the client's invoice page all use. A pickup / hand delivery is saved as
// tracking_carrier "pickup", with no number and no link (PICKUP_FIELDS).
//
// The server refuses anything else before it is saved (api/_lib/adminOps.js keeps its own copy
// of these rules; tests/tracking.test.js checks the two agree). trackingLink() checks again
// anyway, because the link ends up in an email and on the client's page: a "javascript:" link
// there would run code when tapped, so anything that is not https:// gives no link at all.

export const CARRIERS = [
  ["usps", "USPS"],
  ["ups", "UPS"],
  ["fedex", "FedEx"],
  ["dhl", "DHL"],
  ["other", "Other"],
];

// Pickup / hand delivery: not a carrier, so not in the carrier menu; it has no tracking link.
export const PICKUP = "pickup";
export const PICKUP_LABEL = "Pickup / hand delivery";
export const PICKUP_FIELDS = { tracking_carrier: PICKUP, tracking_number: null, tracking_url: null };
export const isPickup = (order) => order?.tracking_carrier === PICKUP;

// Each carrier's own tracking page, with the (already encoded) number filled in.
const PAGES = {
  usps: (n) => `https://tools.usps.com/go/TrackConfirmAction?tLabels=${n}`,
  ups: (n) => `https://www.ups.com/track?tracknum=${n}`,
  fedex: (n) => `https://www.fedex.com/fedextrack/?trknbr=${n}`,
  dhl: (n) => `https://www.dhl.com/us-en/home/tracking/tracking-express.html?submit=1&tracking-id=${n}`,
};

// A tracking number: letters, digits, spaces and dashes, 4 to 60 of them, starting and ending
// with a letter or digit (so a saved one is always trimmed). Same rule on the server.
export const TRACKING_NUMBER_RE = /^[A-Za-z0-9][A-Za-z0-9 -]{2,58}[A-Za-z0-9]$/;
export const MAX_TRACKING_URL = 2000;

const hasControl = (s) => [...s].some(c => { const n = c.codePointAt(0); return n < 32 || n === 127; });

// A pasted tracking page: https:// and a real web address, with no spaces, quotes, angle
// brackets or control characters in it. Returns the address as the browser reads it, or null.
export function httpsLink(value) {
  if (typeof value !== "string" || value.length > MAX_TRACKING_URL) return null;
  if (!/^https:\/\//i.test(value) || /[\s"'<>`\\]/.test(value) || hasControl(value)) return null;
  let u;
  try { u = new URL(value); } catch { return null; }
  return u.protocol === "https:" && u.hostname ? u.href : null;
}

// The live tracking link, or null when there is none to give. The carriers' pages want the bare
// number, so the spaces people type to read it ("9400 1118 ...") are left out of the link; the
// order itself keeps the number as it was typed.
export function trackingLink({ carrier, number, url } = {}) {
  if (carrier === "other") return httpsLink(typeof url === "string" ? url.trim() : url);
  if (typeof carrier !== "string" || !Object.hasOwn(PAGES, carrier)) return null;
  const n = typeof number === "string" ? number.replace(/\s+/g, "") : "";
  return n ? PAGES[carrier](encodeURIComponent(n)) : null;
}

export const orderTracking = (order) => ({ carrier: order?.tracking_carrier ?? null, number: order?.tracking_number ?? null, url: order?.tracking_url ?? null });
export const orderTrackingLink = (order) => trackingLink(orderTracking(order));
export const hasTrackingSaved = (order) => !!(order?.tracking_carrier || order?.tracking_number || order?.tracking_url);
export const carrierLabel = (carrier) => carrier === PICKUP ? PICKUP_LABEL : CARRIERS.find(([v]) => v === carrier)?.[1] ?? "";

// The saved tracking in words: "USPS · 9400 1118 9922", for Other the tracking page's address
// ("Tracking link · track.example.com"), and for a pickup "Pickup / hand delivery".
export function trackingLabel(order) {
  const { carrier, number, url } = orderTracking(order);
  if (carrier === "other") {
    const link = trackingLink({ carrier, url });
    return `Tracking link${link ? ` · ${new URL(link).hostname}` : ""}`;
  }
  return [carrierLabel(carrier), number].filter(Boolean).join(" · ");
}

// Clears all three (the admin's "Clear").
export const NO_TRACKING = { tracking_carrier: null, tracking_number: null, tracking_url: null };

// What the admin typed in Admin -> Orders, checked and tidied for saving:
// { fields } (the three columns) or { problem } (what to tell the admin). Other keeps only the
// link; every other carrier keeps only the number.
export function trackingFields({ carrier, number, url } = {}) {
  if (carrier === "other") {
    const link = typeof url === "string" ? url.trim() : "";
    if (!link) return { problem: "Paste the carrier's tracking link." };
    if (!httpsLink(link)) return { problem: "That tracking link can't be used. Paste the whole link from the carrier's page, starting with https://" };
    return { fields: { tracking_carrier: "other", tracking_number: null, tracking_url: link } };
  }
  if (typeof carrier !== "string" || !Object.hasOwn(PAGES, carrier)) return { problem: "Choose the carrier." };
  const n = typeof number === "string" ? number.trim() : "";
  if (!n) return { problem: "Type the tracking number." };
  if (!TRACKING_NUMBER_RE.test(n)) return { problem: "Check the tracking number: only letters, numbers, spaces and dashes, 4 to 60 of them." };
  return { fields: { tracking_carrier: carrier, tracking_number: n, tracking_url: null } };
}

// Saving it (the tracking, or PICKUP_FIELDS), after the question "Email ...?":
//  - From the Status menu (ship: true, the admin picked Shipped): the order becomes Shipped,
//    whichever button was tapped. Send also emails the client the "shipped" email (with the
//    link, or the pickup words); Not now emails no one.
//  - From the "Shipped with a carrier" tick box: Send (email: true) makes a Paid order Shipped
//    (Shipped and Delivered stay as they are) and sends ONE email, the "shipped" one with the
//    link (a Delivered order's is the "delivered" one, also with the link). Not now (email:
//    false) saves only the tracking: no email, and the status stays.
// The status is saved together with the tracking, NOT through the Status menu's own save, which
// would send its own email as well: Shipped never sends two.
// change: what to save on the order. emailStatus: which status email to send, or null.
export function trackingSave(order, fields, { email = false, ship = false } = {}) {
  const shipped = ship || (email && order?.status === "paid");
  const change = shipped ? { ...fields, status: "shipped" } : { ...fields };
  const emailStatus = !email ? null : shipped || order?.status !== "delivered" ? "shipped" : "delivered";
  return { change, emailStatus };
}

// Which carrier a tracking number belongs to, from its shape alone (Andy, 2026-11-18: "shouldn't
// by the tracking be easy to know which method was used ?"). Only shapes that are clear; anything
// else is null and the menu is left to him. The spaces and dashes people type are ignored.
//   UPS: 1Z + 16 letters/digits · USPS: 20-22 digits starting 91-95, the same with "420" + the ZIP
//   in front, or 2 letters + 9 digits + "US" · FedEx: 12 or 15 digits · DHL Express: 10 digits.
export function guessCarrier(number) {
  const n = String(number ?? "").replace(/[\s-]/g, "").toUpperCase();
  if (/^1Z[0-9A-Z]{16}$/.test(n)) return "ups";
  if (/^9[1-5]\d{18,20}$/.test(n) || /^420\d{5}(\d{4})?9[1-5]\d{18,20}$/.test(n) || /^[A-Z]{2}\d{9}US$/.test(n)) return "usps";
  if (/^(\d{12}|\d{15})$/.test(n)) return "fedex";
  if (/^\d{10}$/.test(n)) return "dhl";
  return null;
}

// Typing the tracking number: the carrier menu fills itself in from the number while it is empty
// or was filled in this way (guessed), and follows the number as it changes. A carrier picked by
// hand, or saved before, is never changed. Only carrier, number and link are ever saved
// (trackingFields), so "guessed" stays in the form.
export function withNumber(draft = {}, number) {
  const next = { ...draft, number, err: "" };
  if (draft.carrier && !draft.guessed) return next;
  const g = guessCarrier(number);
  return { ...next, carrier: g || "", guessed: !!g };
}
