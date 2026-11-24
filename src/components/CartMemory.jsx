import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { rememberedEmail, onRemembered } from "../lib/cartMemory";
import { boxPercent, boxPlan, boxShown, cartSince, markBoxShown } from "../lib/cartBox";
import CartEmailBox from "./CartEmailBox";

// Offers someone not known yet the 5-minute box (src/lib/cartBox.js, CartEmailBox; Andy, 2026-11-22:
// "then we know who the person is"). Their cart itself is saved by src/lib/useSavedCart.js. quiet: a
// page reached by its own link (a conversation, an invoice, the way back from paying), where the box
// never shows. saving: whether cart saving is on (App.jsx, src/lib/useCartSaving.js). onSignIn(email):
// opens the sign-in window (App.jsx); none for someone signed in.
// The checkout, or another window (a piece's own, the welcome gift, the cart drawer): the box waits.
const othersOpen = () => !!document.querySelector(".modal-bg, .cart-drawer, .checkout-page-bg");
// Signed in (a buyer, or anyone): known already, so never offered the box.
const signedIn = async () => {
  try { return !!(await supabase?.auth.getSession())?.data?.session; } catch { return false; }
};

export default function CartMemory({ cart, user, settings, quiet, saving, onSignIn }) {
  const [email, setEmail] = useState(rememberedEmail); // known: any email given here
  const [open, setOpen] = useState(false);
  useEffect(() => onRemembered(() => setEmail(rememberedEmail())), []);

  const count = cart.length;
  const known = !!email || !!user;
  useEffect(() => {
    const since = cartSince(count);
    if (open) return undefined;
    let gone = false;
    let t;
    const look = async () => {
      const plan = boxPlan({ count, since, now: Date.now(), known, shown: boxShown(), busy: quiet || othersOpen() });
      if (plan.wait != null) { t = setTimeout(look, plan.wait); return; }
      if (!plan.show || (await signedIn()) || gone) return;
      markBoxShown();
      setOpen(true);
    };
    t = setTimeout(look, 0);
    return () => { gone = true; clearTimeout(t); };
  }, [count, known, quiet, open]);

  if (!open) return null;
  return <CartEmailBox cart={cart} percent={boxPercent(settings)} saving={saving} onSignIn={onSignIn} onClose={() => setOpen(false)} />;
}
