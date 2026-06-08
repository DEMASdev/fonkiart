import { useState } from "react";
import CheckoutModal from "./CheckoutModal";

export default function FloatingCart({ cart, removeFromCart, settings, cartOpen, setCartOpen }) {
  const [checkout, setCheckout] = useState(null);
  return (
    <>
      <button className="cart-fab" onClick={() => setCartOpen(o => !o)} title="Shopping Cart">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
        {cart.length > 0 && <span className="cart-fab-badge">{cart.length}</span>}
      </button>
      {cartOpen && (
        <>
          <div className="cart-overlay" onClick={() => setCartOpen(false)} />
          <div className="cart-drawer">
            <div className="cart-drawer-head">
              <span>Your Cart ({cart.length})</span>
              <button onClick={() => setCartOpen(false)} style={{ background:"none", border:"none", cursor:"pointer", color:"var(--muted)", fontSize:20, lineHeight:1, padding:0 }}>✕</button>
            </div>
            <div className="cart-drawer-body">
              {cart.length === 0 ? (
                <div className="cart-empty">
                  <div className="cart-empty-icon">🛒</div>
                  <p style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:20, fontWeight:300, marginBottom:8 }}>Your cart is empty</p>
                  <p style={{ fontSize:13, color:"var(--muted)" }}>Browse the collection and add pieces you love.</p>
                </div>
              ) : cart.map(item => (
                <div key={item.id} className="cart-drawer-item">
                  <img src={item.image} alt={item.title} />
                  <div>
                    <div className="cart-drawer-title">{item.title}</div>
                    <div className="cart-drawer-price">
                      {item.salePrice ? `$${Number(item.salePrice).toLocaleString()}` : item.price ? `$${Number(item.price).toLocaleString()}` : "Price on request"}
                    </div>
                    <button onClick={() => setCheckout(item)}
                      style={{ background:"none", border:"1px solid var(--gold)", color:"var(--gold)", cursor:"pointer", fontSize:10, letterSpacing:".12em", textTransform:"uppercase", padding:"4px 10px", fontFamily:"'DM Sans',sans-serif", marginTop:6, transition:"all .2s" }}
                      onMouseEnter={e=>{e.currentTarget.style.background="var(--gold)";e.currentTarget.style.color="#fff"}}
                      onMouseLeave={e=>{e.currentTarget.style.background="none";e.currentTarget.style.color="var(--gold)"}}>
                      Purchase Now
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
                <div style={{ fontSize:12, color:"var(--muted)", marginBottom:12 }}>Select an item above to purchase individually.</div>
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
