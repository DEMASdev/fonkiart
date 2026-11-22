import PayArt from "./PayArt";
import { BANK_CLEARING, paidByLabel, paidCongrats } from "../lib/invoiceView";

// The thank-you once a Cart order is paid by card, in the invoice page's look (Andy: "keep
// everything esthetically beautiful pretty and art driven"): the Fonkiart title and its
// congratulations, then the pieces first (pictures, titles, prices), the total paid, the Order
// Reference and the thanks. The same everywhere a card payment is found paid: back from Stripe
// (src/pages/CardReturnPage.jsx), the cart (src/pages/CartPage.jsx) and the checkout
// (src/components/CheckoutModal.jsx). view: the server's answer, { ref, lines, total, name }, and
// method "klarna", "link" or "bank" when Stripe says it was paid that way (a card's answer has no
// method; nor does any other word, which says "card", as before). view.processing: a bank payment
// (ACH) made, not cleared yet: no "Paid", the same pieces, and what happens next (BANK_CLEARING).
// action: the button under it.
const STRIPE_WAYS = new Set(["klarna", "link", "bank"]);
export default function PaidThanks({ view, artworks, action }) {
  const clearing = view.processing === true;
  const by = STRIPE_WAYS.has(view.method) ? paidByLabel(view.method) : "card";
  const congrats = clearing ? { title: "Thank you!", sub: "We're holding your order while your bank payment clears." } : paidCongrats("paid");
  return (
    <div className="invoice-card pay-thanks">
      <div className="invoice-header">
        <div className="invoice-logo"><div className="invoice-logo-dot"/>Fonkiart</div>
        <div className="inv-congrats">
          <div className="inv-congrats-rule" aria-hidden="true"><div className="invoice-logo-dot"/></div>
          <p className="inv-congrats-title">{congrats.title}</p>
          <p className="inv-congrats-sub">{congrats.sub}</p>
        </div>
      </div>
      <p className="pay-return-text">Hi {view.name || "there"}, here is your order from Fonkiart.</p>
      <PayArt lines={view.lines} total={view.total} artworks={artworks} totalLabel={clearing ? "Total" : "Total Paid"} />
      <div className="pay-return-ref">
        <div className="pay-return-ref-label">Order Reference</div>
        <div className="pay-return-ref-value">{view.ref}</div>
        <div className="pay-return-ref-note">{clearing ? "Also in the email we send once it clears" : "Also in your confirmation email"}</div>
      </div>
      {clearing ? (
        <div className="invoice-approved-banner">
          <p className="pay-return-thanks">{BANK_CLEARING.title}</p>
          <p className="pay-return-note">{BANK_CLEARING.note}</p>
        </div>
      ) : (
        <div className="invoice-approved-banner">
          <p className="pay-return-thanks">Thank you for your payment!</p>
          <p className="pay-return-by">{`Paid by ${by} ✓`}</p>
          <p className="pay-return-note">We will be sending you a tracking number or delivery updates if shipping is needed.</p>
        </div>
      )}
      {action}
    </div>
  );
}
