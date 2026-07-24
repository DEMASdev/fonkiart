import { useState } from "react";
import ArtworkModal from "../components/ArtworkModal";
import CheckoutModal from "../components/CheckoutModal";

export default function CartPage({ cart, removeFromCart, addToCart, items, settings, setPage }) {
  const [checkout, setCheckout] = useState(false);
  const [selected, setSelected] = useState(null);

  const itemPrice = (i) => Number(i.salePrice || i.price || 0);
  const subtotal = cart.reduce((sum, i) => sum + itemPrice(i), 0);
  const cartCategories = [...new Set(cart.map(i => i.category).filter(Boolean))];
  const suggestions = cart.length === 0 ? [] : items
    .filter(i => !cart.find(c => c.id === i.id))
    .filter(i => !i.isSold)
    .filter(i => i.price || i.salePrice)
    .filter(i => cartCategories.includes(i.category))
    .slice(0, 4);

  if (checkout) {
    return (
      <CheckoutModal
        items={cart}
        settings={settings}
        fullPage
        onClose={() => setCheckout(false)}
        onSuccess={() => { cart.forEach(i => removeFromCart(i.id)); setCheckout(false); setPage("catalog"); }}
      />
    );
  }

  return (
    <div className="cart-page">
      <button className="cart-page-return" onClick={() => setPage("catalog")}>← Return to Shop</button>
      <h1 className="cart-page-title">Your Cart{cart.length > 0 ? ` (${cart.length})` : ""}</h1>

      {cart.length === 0 ? (
        <div className="cart-empty">
          <div className="cart-empty-icon">🛒</div>
          <p style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:22, fontWeight:300, marginBottom:8 }}>Your cart is empty</p>
          <p style={{ fontSize:14, color:"var(--muted)", marginBottom:20 }}>Browse the collection and add pieces you love.</p>
          <button className="btn-p" onClick={() => setPage("catalog")}>Shop Now</button>
        </div>
      ) : (
        <div className="cart-page-layout">
          <div className="cart-page-items">
            {cart.map(item => (
              <div key={item.id} className="cart-page-item">
                <img src={item.image} alt={item.title} onClick={() => setSelected(item)} />
                <div className="cart-page-item-info">
                  <div className="cart-page-item-cat">{item.category}</div>
                  <div className="cart-page-item-title" onClick={() => setSelected(item)}>{item.title}</div>
                  <div className="cart-page-item-price">
                    {item.salePrice
                      ? <>${Number(item.salePrice).toLocaleString()} <span style={{fontSize:13,color:"var(--muted)",textDecoration:"line-through",marginLeft:6}}>{item.price ? `$${Number(item.price).toLocaleString()}` : ""}</span></>
                      : item.price ? `$${Number(item.price).toLocaleString()}` : "Price on request"}
                  </div>
                </div>
                <button className="cart-page-item-remove" onClick={() => removeFromCart(item.id)} title="Remove">✕</button>
              </div>
            ))}
          </div>
          <div className="cart-page-summary">
            <div className="cart-page-subtotal">
              <span>Subtotal</span>
              <span>${subtotal.toLocaleString()}</span>
            </div>
            <p className="cart-page-tax-note">Taxes and shipping calculated at checkout</p>
            <button className="confirm-btn" style={{ width:"100%" }} onClick={() => setCheckout(true)}>Checkout →</button>
          </div>
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="cart-suggestions">
          <h2 className="cart-suggestions-title">You May Also Like</h2>
          <div className="gallery-grid">
            {suggestions.map(item => (
              <div key={item.id} className="card" onClick={() => setSelected(item)}>
                <img src={item.image} alt={item.title} loading="lazy" />
                <div className="card-over">
                  <div className="card-cat">{item.category}</div>
                  <div className="card-title">{item.title}</div>
                  <div className="card-price">
                    {item.salePrice ? `$${Number(item.salePrice).toLocaleString()}` : `$${Number(item.price).toLocaleString()}`}
                  </div>
                  <button className="card-btn" onClick={e => { e.stopPropagation(); addToCart(item); }}>
                    {cart.find(i => i.id === item.id) ? "✓ Added" : "Add to Cart"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {selected && (
        <ArtworkModal
          item={selected}
          onClose={() => setSelected(null)}
          sold={!!selected.isSold}
          onBuy={selected.isSold ? undefined : s => { setSelected(null); addToCart(s); }}
        />
      )}
    </div>
  );
}
