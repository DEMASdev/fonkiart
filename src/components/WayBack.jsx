// The way back to the ways to pay, there the whole time a payment is open (Andy, 2026-11-23: "make
// sure if the user selects credit card or any other method , the user can go and select another ...
// right now i went hit CC then tried to go back ... there's no way i'm trapped"). Measured before,
// with the card form open: one faint link above the form, off the screen at 10 of 13 places down the
// page on a phone and at 6 of 8 on a computer; and none at all while the form was still opening.
// Now two, for every way to pay (CheckoutModal.jsx; an invoice's card form, through CardCheckout.jsx):
// a strip that stays on the screen wherever the buyer is in the payment (src/index.css, .way-back)
// and, foot, a plain button where the payment ends.
export default function WayBack({ onBack, foot = false }) {
  if (foot) return <button type="button" className="tap pay-other" onClick={onBack}>Choose Another Way to Pay</button>;
  return (
    <div className="way-back">
      <button type="button" className="tap way-back-btn" onClick={onBack}>← Choose another way to pay</button>
    </div>
  );
}
