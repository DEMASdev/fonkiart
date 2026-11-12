import { mouseHover } from "../utils/hover";
import Pic from "./Pic";

export default function FloatingCart({ cart, removeFromCart, cartOpen, setCartOpen, onView, onViewCart }) {
  return (
    <>
      {cartOpen && (
        <>
          <div className="cart-overlay" onClick={() => setCartOpen(false)} />
          <div className="cart-drawer">
            <div className="cart-drawer-head">
              <span>Your Cart ({cart.length})</span>
              <button onClick={() => setCartOpen(false)} aria-label="Close cart" style={{ background:"none", border:"none", cursor:"pointer", color:"var(--muted)", fontSize:20, lineHeight:1, padding:0, width:44, height:44, marginRight:-12, display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
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
                  <Pic src={item.image} w={320} alt={item.title} style={{ cursor: onView ? "pointer" : "default" }} onClick={() => onView && onView(item)} />
                  <div>
                    <div className="cart-drawer-title" style={{ cursor: onView ? "pointer" : "default" }} onClick={() => onView && onView(item)}>{item.title}</div>
                    <div className="cart-drawer-price">
                      {item.salePrice ? `$${Number(item.salePrice).toLocaleString()}` : item.price ? `$${Number(item.price).toLocaleString()}` : "Price on request"}
                    </div>
                  </div>
                  <button onClick={() => removeFromCart(item.id)}
                    style={{ background:"none", border:"none", cursor:"pointer", color:"var(--muted)", fontSize:18, lineHeight:1, padding:0, width:44, height:44, display:"flex", alignItems:"center", justifyContent:"center", transition:"color .2s" }}
                    {...mouseHover({ color:"#c0392b" }, { color:"var(--muted)" })}
                    title="Remove">✕</button>
                </div>
              ))}
            </div>
            {cart.length > 0 && (
              <div className="cart-drawer-foot">
                <button className="cart-drawer-view-btn" onClick={() => { setCartOpen(false); onViewCart && onViewCart(); }}>View Cart</button>
                <button className="tap" style={{ background:"none", border:"none", cursor:"pointer", fontSize:11, letterSpacing:".1em", textTransform:"uppercase", color:"var(--muted)", textDecoration:"underline", textUnderlineOffset:3, padding:0 }}
                  onClick={() => { cart.forEach(i => removeFromCart(i.id)); }}>Clear Cart</button>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
