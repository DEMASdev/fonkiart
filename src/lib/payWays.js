// The ways to pay, as the Cart's checkout (step 2) and the invoice page show them, one row each
// (src/components/PayRows.jsx). First the shop's own: Zelle, Venmo, Cash App. Then Stripe's, each
// paid in Stripe's form right on fonkiart.com (src/components/CardCheckout.jsx): a card (and Link,
// Stripe's saved-card checkout, inside the same form), Klarna, a bank transfer (ACH). Andy,
// 2026-11-21: "also paying options look what strip offers .. klarma , Secure Link
// (https://link.com/) , bank transfer / ACH".
// A Stripe row shows only when the server can open that way right now: op "card-setup" says so in
// its `ways` (api/_lib/stripe.js), never a key. A row that opened a form without its way would
// promise the buyer something untrue. A server that says nothing about it (one from before `ways`)
// opens cards and Klarna (waysToPay in api/_lib/stripe.js) and never a bank transfer, so that is
// what shows then. tests/payWays.test.js holds these rules.

// The ways paid in Stripe's form; the server is told which one the buyer chose (`way`).
export const STRIPE_WAYS = ["card", "klarna", "bank"];
export const isStripe = (way) => STRIPE_WAYS.includes(way);
// What a server that says nothing about its ways opens: cards and Klarna, never a bank transfer.
export const WAYS_BEFORE = ["card", "klarna"];

// Stripe's rows, from the server's `ways` ("card", "link", "klarna", "bank"). The card row says
// "Card or Link" only when the server opens Link too. Klarna's row names no plan: Klarna picks
// pay-in-4 or monthly by the amount, and on a large one may offer no pay-in-4 at all.
export function stripeRows(ways) {
  const can = Array.isArray(ways) ? ways : WAYS_BEFORE;
  return [
    can.includes("card") && { id: "card", label: can.includes("link") ? "Card or Link" : "Card", sub: "Stripe · Secure" },
    can.includes("klarna") && { id: "klarna", label: "Klarna", sub: "Pay over time" },
    can.includes("bank") && { id: "bank", label: "Bank transfer (ACH)", sub: "Clears in about 4 business days" },
  ].filter(Boolean);
}

// Every row, in order. zelle, venmo, cashApp, card: whether each is offered here (the invoice
// page: what the shop ticked on it; the Cart's checkout: all of them). ways: the server's.
export function payRows({ zelle = true, venmo = true, cashApp = true, card = true, ways } = {}) {
  return [
    zelle && { id: "zelle", label: "Zelle", sub: "Instant · Free" },
    venmo && { id: "venmo", label: "Venmo", sub: "Instant · Free" },
    cashApp && { id: "cashapp", label: "Cash App", sub: "Instant · Free" },
    ...(card ? stripeRows(ways) : []),
  ].filter(Boolean);
}

// The server's `ways` from its card-setup answer, or null when it says nothing (an older server)
// or could not be reached: then the rows are an older server's (WAYS_BEFORE).
export const serverWays = (answer) => Array.isArray(answer?.ways) ? answer.ways.filter(w => typeof w === "string") : null;
