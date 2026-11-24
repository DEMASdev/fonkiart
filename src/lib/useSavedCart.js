import { useEffect, useEffectEvent, useState, useSyncExternalStore } from "react";
import { supabase } from "./supabase";
import { storeCall } from "./store";
import { toldEmail, onRemembered, isBuyer, saveCart, backHere, cameBack, markBack, forgetBack, waitingPieces, joinCart, stillSold } from "./cartMemory";

// The saved cart (src/lib/cartMemory.js), for the whole site (App.jsx), on every page of it:
// - the art someone left in their cart comes back into it when they sign in (Andy, 2026-11-23,
//   "all 8"), once per sign-in in this browser;
// - whenever the cart changes, it is saved with whoever it belongs to. Someone signed in has theirs
//   saved only once what they left has come back, so it is never saved over.
// saving: whether cart saving is on (App.jsx, src/lib/useCartSaving.js); while it is off nothing is
// asked and nothing is sent.
const SAVE_AFTER_MS = 1200; // a few quick taps on the cart are saved once

// The Cart page's checkout is open: the cart being paid for is left alone until it closes.
const paying = () => !!document.querySelector(".checkout-page-bg");

// The cart as App.jsx keeps it in this browser.
function keptCart() {
  try {
    const cart = JSON.parse(localStorage.getItem("fonkiart-cart") || "[]");
    return Array.isArray(cart) ? cart : [];
  } catch { return []; }
}

export function useSavedCart({ cart, setCart, user, artworks, saving }) {
  const told = useSyncExternalStore(onRemembered, toldEmail); // the email it is saved with, not signed in
  const me = saving && isBuyer(user) ? user.id : "";
  const listed = artworks.length > 0;
  const [had, setHad] = useState(backHere); // whose saved cart was in the cart this page opened with
  const [back, setBack] = useState(null); // whose saved cart is in this tab's cart by now: { id, ids }

  useEffect(() => {
    if (!supabase) return undefined;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") { forgetBack(); setHad(""); setBack(null); }
    });
    return () => subscription.unsubscribe();
  }, []);

  // ids: what my-cart answered; [] when it came back on an earlier visit, so it wasn't asked; null:
  // it couldn't be asked, and this visit saves nothing. It may also have come back in another tab
  // since this page opened: what that tab has is added too.
  const arrived = useEffectEvent((ids) => {
    if (!ids) return;
    const already = cameBack(me);
    setCart(prev => joinCart(already ? joinCart(prev, keptCart()) : prev, stillSold(ids, artworks)));
    setBack(already ? { id: me } : { id: me, ids });
  });
  useEffect(() => {
    if (!me || !listed) return undefined;
    let gone = false;
    (had === me && cameBack(me) ? Promise.resolve([]) : waitingPieces(storeCall, { paying }))
      .then((ids) => { if (!gone) arrived(ids); });
    return () => { gone = true; };
  }, [me, listed, had]);
  // Marked only once App.jsx has kept the joined cart in this browser (its effect runs before this
  // one), so closing the page in between never loses a piece.
  useEffect(() => { if (back?.ids) markBack(back.id, back.ids); }, [back]);

  const save = useEffectEvent(() => {
    saveCart(storeCall, cart, { user, email: told, saving }).catch((e) => console.warn("Cart not kept:", e?.status || "offline"));
  });
  const ready = !me || back?.id === me;
  useEffect(() => {
    if (!ready) return undefined;
    const t = setTimeout(() => save(), SAVE_AFTER_MS);
    return () => clearTimeout(t);
  }, [cart, me, ready, told, saving]);
}
