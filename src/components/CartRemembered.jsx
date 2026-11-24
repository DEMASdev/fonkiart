import { useSyncExternalStore } from "react";
import { storeCall } from "../lib/store";
import { toldEmail, onRemembered, notMe, isBuyer, cameBack } from "../lib/cartMemory";
import "../cartBox.css";

// On the Cart page: that this cart is saved (src/lib/cartMemory.js), only while cart saving is on
// (saving: App.jsx) and only when it is, so it is true whenever it shows.
// - Signed in (Andy, 2026-11-23, "all 8"): with their account, once what they left in their cart has
//   come back here (cameBack), as it is saved only from then on.
// - Else with an email typed in this same browser, told so and with its pass (toldEmail). It tells
//   nobody anything new. "Not you?" takes the pieces off that email and forgets it in this browser.
export default function CartRemembered({ count, user, saving }) {
  const email = useSyncExternalStore(onRemembered, toldEmail, toldEmail);
  const account = isBuyer(user);
  const here = () => account && cameBack(user.id);
  const back = useSyncExternalStore(onRemembered, here, here);
  if (!saving || !count || !(account ? back : email)) return null;

  if (account) return (
    <div className="cart-kept" role="status">
      <p className="cart-kept-text cart-kept-alone">Your pieces are saved with your account.</p>
    </div>
  );
  const forgetMe = () => { notMe(storeCall).catch((e) => console.warn("Cart not cleared:", e?.status || "offline")); };
  return (
    <div className="cart-kept" role="status">
      <p className="cart-kept-text">Your pieces are saved for <strong className="cart-kept-email">{email}</strong>.</p>
      <button type="button" className="cart-kept-not" onClick={forgetMe}>Not you?</button>
    </div>
  );
}
