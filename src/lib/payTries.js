// One try to pay at a time, which the buyer may leave at any moment (Andy, 2026-11-23: "make sure if
// the user selects credit card or any other method , the user can go and select another"). Before,
// a try on its way held the whole checkout: while Stripe.js loaded (15 s at most) and the server
// answered, there was no way back. The Cart's checkout (CheckoutModal.jsx) and an invoice's card
// form (InvoicePage.jsx) each keep one of these.
//
// start(work, end): runs work(mine), unless a try is already on its way (a double tap counts once);
//   end() runs when it is over, unless the buyer left it. In work:
//   mine.left   true once the buyer has gone back to choose another way: it then opens no form,
//               moves no step and says nothing more, but an order it made is still kept.
//   mine.asked  work sets it as it asks the server for something. From then on the next try waits
//               for this one's end, so it pays the order this one made, never a second one.
// leave(): the buyer goes back; the screen is theirs at once.
// behind(): what the tries left are still doing at the server, for the next one to wait for (a
//   promise; null when there is nothing to wait for).
export function payTries() {
  let now = null;  // the try on its way
  let left = null; // the tries left while the server was still answering
  return {
    start(work, end) {
      if (now) return;
      const mine = now = { left: false, asked: false, over: null };
      mine.over = (async () => {
        try { await work(mine); } catch (e) { console.warn("Payment:", e); }
        if (now !== mine) return;
        now = null;
        end?.();
      })();
    },
    leave() {
      const mine = now;
      if (!mine) return;
      now = null;
      mine.left = true;
      if (!mine.asked) return; // nothing was asked of the server: nothing to wait for
      const both = left = Promise.all([left, mine.over]).then(() => { if (left === both) left = null; });
    },
    behind: () => left,
  };
}
