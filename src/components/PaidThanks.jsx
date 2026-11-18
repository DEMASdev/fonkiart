import PayArt from "./PayArt";
import { paidCongrats } from "../lib/invoiceView";

// The thank-you once a Cart order is paid by card, in the invoice page's look (Andy: "keep
// everything esthetically beautiful pretty and art driven"): the Fonkiart title and its
// congratulations, then the pieces first (pictures, titles, prices), the total paid, the Order
// Reference and the thanks. The same everywhere a card payment is found paid: back from Stripe
// (src/pages/CardReturnPage.jsx), the cart (src/pages/CartPage.jsx) and the checkout
// (src/components/CheckoutModal.jsx). view: the server's answer, { ref, lines, total, name }.
// action: the button under it.
export default function PaidThanks({ view, artworks, action }) {
  const congrats = paidCongrats("paid");
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
      <PayArt lines={view.lines} total={view.total} artworks={artworks} totalLabel="Total Paid" />
      <div className="pay-return-ref">
        <div className="pay-return-ref-label">Order Reference</div>
        <div className="pay-return-ref-value">{view.ref}</div>
        <div className="pay-return-ref-note">Also in your confirmation email</div>
      </div>
      <div className="invoice-approved-banner">
        <p className="pay-return-thanks">Thank you for your payment!</p>
        <p className="pay-return-by">Paid by card ✓</p>
        <p className="pay-return-note">We will be sending you a tracking number or delivery updates if shipping is needed.</p>
      </div>
      {action}
    </div>
  );
}
