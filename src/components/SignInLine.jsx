import { toldEmail } from "../lib/cartMemory";
import "../cartBox.css";

// What the welcome window and the 5-minute box say instead of "saved" to someone whose email was on
// the list already (Andy, 2026-11-23, "all 8"): a stranger may be the one typing it, so this browser
// was handed no pass and saves nothing with it (src/lib/cartMemory.js toldEmail). Their own sign-in
// does. email: the one just given. onSignIn(email): opens the site's sign-in window with it
// (App.jsx); none for someone signed in, whose cart is saved with their account.
export default function SignInLine({ email, onSignIn }) {
  const v = email.trim().toLowerCase();
  if (!onSignIn || toldEmail() === v) return null;
  return (
    <div className="cart-signin">
      <p className="cart-signin-text">Sign in and your cart is saved too.</p>
      <button type="button" className="cart-signin-go" onClick={() => onSignIn(v)}>Sign in</button>
    </div>
  );
}
