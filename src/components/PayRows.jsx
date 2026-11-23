import PayMarks from "./PayMarks";

// The ways to pay as rows, on the Cart's checkout (step 2) and the invoice page alike: the words
// first (no emoji), a quiet line under them, the way's own small mark (the footer's), quiet lines
// between; the one chosen is plain to see, a pale pink and a gold bar (src/index.css, "The ways to
// pay, as rows"). A screen reader hears a group of choices and which one is chosen; the marks are
// pictures of the words beside them, so it hears the words once.
// rows: payRows (src/lib/payWays.js). value: the chosen row's id. onChoose(id): a row tapped.
// A row may carry an offer: one more line under its quiet one (the Cart's checkout puts the Klarna
// offer on Klarna's row, src/lib/klarnaOffer.js; the invoice page puts none).
// detail(id): what opens right under the chosen row (the invoice page: where to send it, or the
// button that opens Stripe's form); the Cart's checkout shows it on its next step instead.
export default function PayRows({ rows, value, onChoose, detail }) {
  return (
    <div className="pay-rows" role="radiogroup" aria-label="How to pay">
      {rows.flatMap(({ id, label, sub, offer }) => {
        const chosen = value === id;
        const more = chosen && detail ? detail(id) : null;
        return [
          <button key={id} type="button" role="radio" aria-checked={chosen} className={`pay-row${chosen ? " sel" : ""}${offer ? " has-offer" : ""}`} onClick={() => onChoose(id)}>
            <span className="pay-row-dot" aria-hidden="true" />
            <span className="pay-row-label">{label}</span>
            <span className="pay-row-sub">{sub}</span>
            {offer && <span className="pay-row-offer">{offer}</span>}
            <span className="pay-row-marks" aria-hidden="true"><PayMarks way={id} /></span>
          </button>,
          more && <div key={`${id}-more`} className="pay-row-more">{more}</div>,
        ];
      })}
    </div>
  );
}
