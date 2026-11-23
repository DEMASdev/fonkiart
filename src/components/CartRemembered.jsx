import { useEffect, useState } from "react";
import { storeCall } from "../lib/store";
import { toldEmail, onRemembered, forget, isBuyer } from "../lib/cartMemory";
import "../cartBox.css";

// On the Cart page: whose email this cart is saved with (src/lib/cartMemory.js), and "Not you?",
// which takes the pieces off that email and forgets it in this browser. It shows only the email
// typed in this same browser, so it tells nobody anything new. A signed-in buyer's cart is saved
// with their own account, so nothing shows for them. It shows only while cart saving is on
// (saving: App.jsx) and only for an email that was told so (toldEmail), so it is true whenever
// it shows.
export default function CartRemembered({ count, user, saving }) {
  const [email, setEmail] = useState(toldEmail);
  useEffect(() => onRemembered(() => setEmail(toldEmail())), []);
  if (!saving || !email || !count || isBuyer(user)) return null;

  const notMe = () => {
    storeCall("remember-cart", { email, pieces: [] }).catch((e) => console.warn("Cart not cleared:", e?.status || "offline"));
    forget();
  };

  return (
    <div className="cart-kept" role="status">
      <p className="cart-kept-text">Your pieces are saved for <strong className="cart-kept-email">{email}</strong>.</p>
      <button type="button" className="cart-kept-not" onClick={notMe}>Not you?</button>
    </div>
  );
}
