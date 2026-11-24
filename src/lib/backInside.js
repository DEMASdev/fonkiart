// The browser's (or the phone's) own Back while a checkout or an invoice's card form is open: one
// step back INSIDE it, the payment to the ways to pay, those to the details, then out to the cart
// (Andy, 2026-11-23: "tried to go back ... there's no way i'm trapped"). Before, Back knew only the
// shop's pages (App.jsx): inside the checkout it left the whole thing, or seemed to do nothing.
//
// How: a checkout that opens puts ONE entry of its own (inside) on top of its page's, and each Back
// comes off it: the checkout steps back and puts it there again, until it closes. Closed any other
// way (✕, the menu), that entry stays, marked; under it is the same page again, so the next Back
// goes past both, and no press of Back ever seems to do nothing. The buttons on the page never use
// history: they always work.
let holding = 0;  // checkouts open now
let spent = null; // the page whose CLOSED checkout's entry the browser is on; null: none

const here = () => window.history.state || {};

// stepBack(): true when the checkout is still open after stepping back. Returns the way to let go.
export function holdBack(stepBack) {
  const page = here().page;
  const mark = () => ({ ...here(), inside: true });
  if (!here().inside) window.history.pushState(mark(), "");
  holding++;
  spent = null;
  const onPop = (e) => {
    // Another page (or the entry itself): not a step back inside this one. App.jsx has it.
    if (e.state?.inside || e.state?.page !== page) return;
    if (stepBack()) window.history.pushState(mark(), "");
  };
  window.addEventListener("popstate", onPop);
  return () => {
    window.removeEventListener("popstate", onPop);
    holding--;
    if (!holding && here().inside) spent = here().page;
  };
}

// App.jsx, as the shop opens: the state for the entry it starts on. After a reload inside a checkout
// (a reload closes it), that entry is still the checkout's own, and stays marked.
export function firstEntry(state) {
  const inside = !!here().inside;
  spent = inside ? state.page : null;
  return inside ? { ...state, inside } : state;
}
// App.jsx, moving to another page: the state for its new entry.
export function newEntry(state) {
  spent = null;
  return state;
}
// App.jsx, on Back or Forward: true when the entry it landed on is the same page again, under a
// closed checkout's own, and one more Back should go past it.
export function samePageAgain(state) {
  if (holding) return false;
  const again = spent !== null && !state?.inside && state?.page === spent;
  spent = state?.inside ? state.page : null;
  return again;
}
