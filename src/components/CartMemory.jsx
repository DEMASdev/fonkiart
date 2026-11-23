import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { storeCall } from "../lib/store";
import { rememberedEmail, toldEmail, onRemembered, saveCart } from "../lib/cartMemory";
import { boxPercent, boxPlan, boxShown, cartSince, markBoxShown } from "../lib/cartBox";
import CartEmailBox from "./CartEmailBox";

// Knows who the cart belongs to (Andy, 2026-11-22: "then we know who the person is"). It saves
// the cart with them whenever it changes (src/lib/cartMemory.js), and offers someone not known
// yet the 5-minute box (src/lib/cartBox.js, CartEmailBox). quiet: a page reached by its own link
// (a conversation, an invoice, the way back from paying), where the box never shows. saving:
// whether cart saving is on (App.jsx, src/lib/useCartSaving.js); while it is off nothing is sent.
const SAVE_AFTER_MS = 1200; // a few quick taps on the cart are saved once
// The checkout, or another window (a piece's own, the welcome gift, the cart drawer): the box waits.
const othersOpen = () => !!document.querySelector(".modal-bg, .cart-drawer, .checkout-page-bg");
// Signed in (a buyer, or anyone): known already, so never offered the box.
const signedIn = async () => {
  try { return !!(await supabase?.auth.getSession())?.data?.session; } catch { return false; }
};

export default function CartMemory({ cart, user, settings, quiet, saving }) {
  const [email, setEmail] = useState(rememberedEmail); // known: any email given here
  const [told, setTold] = useState(toldEmail); // ...and told its cart is saved: the one saved with
  const [open, setOpen] = useState(false);
  useEffect(() => onRemembered(() => { setEmail(rememberedEmail()); setTold(toldEmail()); }), []);

  useEffect(() => {
    const t = setTimeout(() => {
      saveCart(storeCall, cart, { user, email: told, saving }).catch((e) => console.warn("Cart not kept:", e?.status || "offline"));
    }, SAVE_AFTER_MS);
    return () => clearTimeout(t);
  }, [cart, user, told, saving]);

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
  return <CartEmailBox cart={cart} percent={boxPercent(settings)} saving={saving} onClose={() => setOpen(false)} />;
}
