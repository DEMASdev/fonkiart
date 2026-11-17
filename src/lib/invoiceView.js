// Opening a sent invoice from the admin (Andy, 2026-11-17: "i can't open past invoices").
// The admin's Orders list only had "Link" (copies the address) and "Resend", so
// there was no way to look at an invoice. "Open" now opens the customer's own
// invoice page with &view=shop added: the same page the customer sees, but
// READ-ONLY. The Approve button is not shown there, so opening an invoice can never
// approve it on the customer's behalf.

export const SHOP_VIEW = "shop";

// The customer's link (what the invoice email carries) is unchanged; the shop's
// link is the same address plus &view=shop.
export function invoiceLink(origin, token, { shopView = false } = {}) {
  const link = `${origin}/?invoice=${encodeURIComponent(token)}`;
  return shopView ? `${link}&view=${SHOP_VIEW}` : link;
}

export function readInvoiceParams(search) {
  const p = new URLSearchParams(search);
  return { token: p.get("invoice"), shopView: p.get("view") === SHOP_VIEW };
}

// Only the customer, on their own link, can approve, and only once.
export function canApprove({ approved, shopView }) {
  return !approved && !shopView;
}
