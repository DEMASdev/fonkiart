import { useState } from "react";
import CheckoutModal from "./CheckoutModal";

export default function FloatingCart({ cart, removeFromCart, settings, cartOpen, setCartOpen, onView }) {
  const [checkout, setCheckout] = useState(null);
  return (
    <>
      {cartOpen && (
        <>
          <div className="cart-overlay" onClick={() => setCartOpen(false)} />
          <div className="cart-drawer">
            <div className="cart-drawer-head">
              <span>Your Cart ({cart.length})</span>
              <button onClick={() => setCartOpen(false)} style={{ background:"none", border:"none", cursor:"pointer", color:"var(--muted)", fontSize:20, lineHeight:1, padding:0 }}>✕</button>
            </div>
            {cart.length > 0 && (
              <div style={{ padding:"12px 24px", borderBottom:"1px solid var(--border)", background:"var(--cream)", fontSize:12, color:"var(--muted)", letterSpacing:".04em" }}>
                Ready to <strong style={{ color:"var(--ink)", textTransform:"uppercase", letterSpacing:".1em" }}>Checkout?</strong> Tap "Checkout" on an item below.
              </div>
            )}
            <div className="cart-drawer-body">
              {cart.length === 0 ? (
                <div className="cart-empty">
                  <div className="cart-empty-icon">🛒</div>
                  <p style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:20, fontWeight:300, marginBottom:8 }}>Your cart is empty</p>
                  <p style={{ fontSize:13, color:"var(--muted)" }}>Browse the collection and add pieces you love.</p>
                </div>
              ) : cart.map(item => (
                <div key={item.id} className="cart-drawer-item">
                  <img src={item.image} alt={item.title} style={{ cursor: onView ? "pointer" : "default" }} onClick={() => onView && onView(item)} />
                  <div>
                    <div className="cart-drawer-title" style={{ cursor: onView ? "pointer" : "default" }} onClick={() => onView && onView(item)}>{item.title}</div>
                    <div className="cart-drawer-price">
                      {item.salePrice ? `$${Number(item.salePrice).toLocaleString()}` : item.price ? `$${Number(item.price).toLocaleString()}` : "Price on request"}
                    </div>
                    <button onClick={() => setCheckout(item)}
                      style={{ background:"none", border:"1px solid var(--gold)", color:"var(--gold)", cursor:"pointer", fontSize:10, letterSpacing:".12em", textTransform:"uppercase", padding:"4px 10px", fontFamily:"'DM Sans',sans-serif", marginTop:6, transition:"all .2s" }}
                      onMouseEnter={e=>{e.currentTarget.style.background="var(--gold)";e.currentTarget.style.color="#fff"}}
                      onMouseLeave={e=>{e.currentTarget.style.background="none";e.currentTarget.style.color="var(--gold)"}}>
                      Checkout →
                    </button>
                  </div>
                  <button onClick={() => removeFromCart(item.id)}
                    style={{ background:"none", border:"none", cursor:"pointer", color:"var(--muted)", fontSize:18, lineHeight:1, padding:0, transition:"color .2s" }}
                    onMouseEnter={e=>e.currentTarget.style.color="#c0392b"}
                    onMouseLeave={e=>e.currentTarget.style.color="var(--muted)"}
                    title="Remove">✕</button>
                </div>
              ))}
            </div>
            {cart.length > 0 && (
              <div className="cart-drawer-foot">
                <div style={{ fontSize:12, color:"var(--muted)", marginBottom:12 }}>Each piece checks out individually — tap "Checkout →" above.</div>
                <button style={{ background:"none", border:"none", cursor:"pointer", fontSize:11, letterSpacing:".1em", textTransform:"uppercase", color:"var(--muted)", textDecoration:"underline", textUnderlineOffset:3, padding:0 }}
                  onClick={() => { cart.forEach(i => removeFromCart(i.id)); }}>Clear Cart</button>
              </div>
            )}
          </div>
          {checkout && <CheckoutModal item={checkout} settings={settings} onClose={() => setCheckout(null)} />}
        </>
      )}
    </>
  );
}
