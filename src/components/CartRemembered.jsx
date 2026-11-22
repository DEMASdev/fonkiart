import { useEffect, useState } from "react";
import { storeCall } from "../lib/store";
import { rememberedEmail, onRemembered, forget, isBuyer } from "../lib/cartMemory";
import "../cartBox.css";

// On the Cart page: whose email this cart is saved with (src/lib/cartMemory.js), and "Not you?",
// which takes the pieces off that email and forgets it in this browser. It shows only the email
// typed in this same browser, so it tells nobody anything new. A signed-in buyer's cart is saved
// with their own account, so nothing shows for them.
export default function CartRemembered({ count, user }) {
  const [email, setEmail] = useState(rememberedEmail);
  useEffect(() => onRemembered(() => setEmail(rememberedEmail())), []);
  if (!email || !count || isBuyer(user)) return null;

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
