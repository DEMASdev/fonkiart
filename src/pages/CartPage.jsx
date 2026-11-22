import { useState, useEffect, useEffectEvent } from "react";
import { storeCall } from "../lib/store";
import { readCardOrder, dropCardOrder, matchesCart, cardOrderBody } from "../lib/cartOrder";
import ArtworkModal from "../components/ArtworkModal";
import CheckoutModal from "../components/CheckoutModal";
import PaidThanks from "../components/PaidThanks";
import Pic from "../components/Pic";

// onPaid(titles): a card payment is in; App.jsx takes exactly those pieces out of the cart.
// cancelledRef: back from Stripe's own card page without paying (?cart=FA-...&card=cancelled,
// App.jsx). The order this cart saved for the card is asked about once ("cart-order",
// api/_lib/cartCheckout.js). Still open: a calm word above the cart, which is all still there,
// and Checkout then pays that SAME order (src/components/CheckoutModal.jsx), by card again or
// another way. Paid after all: the thank-you. Closed by the shop, or unknown to it: forgotten,
// so Checkout starts afresh.
// savedFor: the line saying whose email this cart is saved with (App.jsx, CartRemembered), under the title.
export default function CartPage({ cart, removeFromCart, addToCart, items, settings, setPage, onPaid, cancelledRef, savedFor }) {
  const [checkout, setCheckout] = useState(false);
  // The items of the order just placed. The cart itself is emptied the moment the order is
  // saved, so closing the tab on the thank-you screen leaves no paid cart behind; that screen
  // names the order from this copy.
  const [placed, setPlaced] = useState(null);
  const [selected, setSelected] = useState(null);
  // checking · open (its order still waits to be paid; never called "saved" nor numbered to the
  // buyer before paying) · plain (no saved order to speak of) · paid
  const [back, setBack] = useState(() => {
    if (!cancelledRef) return null;
    const order = readCardOrder();
    return order && order.ref === cancelledRef && matchesCart(order, cart) ? { state: "checking", body: cardOrderBody(order, cart) } : { state: "plain" };
  });
  const heard = useEffectEvent((order) => {
    if (order?.state === "paid") { onPaid?.(order.lines.map(l => l.title)); setBack({ state: "paid", view: order }); return; }
    // Paid by bank, still clearing: the same thank-you, saying "Payment processing" (PaidThanks).
    if (order?.state === "processing") { onPaid?.(order.lines.map(l => l.title)); setBack({ state: "paid", view: { ...order, processing: true } }); return; }
    if (order === undefined || order.state === "open") { setBack({ state: "open" }); return; } // undefined: couldn't ask; Checkout asks again
    dropCardOrder();
    setBack({ state: "plain" });
  });
  const asking = back?.body;
  useEffect(() => {
    if (!asking) return undefined;
    let gone = false;
    storeCall("cart-order", asking)
      .then((order) => { if (!gone) heard(order); })
      .catch((e) => { console.warn("Saved order:", e); if (!gone) heard(e.status === 404 ? null : undefined); });
    return () => { gone = true; };
  }, [asking]);

  const itemPrice = (i) => Number(i.salePrice || i.price || 0);
  const subtotal = cart.reduce((sum, i) => sum + itemPrice(i), 0);
  const cartCategories = [...new Set(cart.map(i => i.category).filter(Boolean))];
  const suggestions = cart.length === 0 ? [] : items
    .filter(i => !cart.find(c => c.id === i.id))
    .filter(i => !i.isSold)
    .filter(i => i.price || i.salePrice)
    .filter(i => cartCategories.includes(i.category))
    .slice(0, 4);

  // The card payment is in: only now do its pieces leave the cart. The checkout keeps showing
  // the order from this copy until it is closed, as after a Zelle order.
  const paidByCard = (titles) => { setPlaced([...cart]); onPaid?.(titles); };

  if (back?.state === "paid") return (
    <div className="inv-embed pay-return">
      <PaidThanks view={back.view} artworks={items}
        action={<button type="button" className="tap confirm-btn pay-return-go" onClick={() => setPage("catalog")}>Continue Shopping →</button>} />
    </div>
  );

  if (checkout) {
    return (
      <CheckoutModal
        items={placed || cart}
        settings={settings}
        fullPage
        onClose={() => { setCheckout(false); if (placed) { setPlaced(null); setPage("catalog"); } }}
        onSuccess={() => { setPlaced([...cart]); cart.forEach(i => removeFromCart(i.id)); }}
        onPaid={paidByCard}
      />
    );
  }

  return (
    <div className="cart-page">
      <button className="cart-page-return" onClick={() => setPage("catalog")}>← Return to Shop</button>
      <h1 className="cart-page-title">Your Cart{cart.length > 0 ? ` (${cart.length})` : ""}</h1>
      {savedFor}
      {(back?.state === "open" || back?.state === "plain") && (
        <div className="cart-notice" role="status">
          <p className="cart-notice-title">No payment was taken</p>
          {back.state === "open" && cart.length > 0
            ? <p className="cart-notice-text">Your cart is just as you left it. Tap Checkout to pay by card again, or with Zelle, Venmo or Cash App.</p>
            : cart.length > 0 && <p className="cart-notice-text">Your cart is just as you left it. Tap Checkout whenever you&apos;re ready.</p>}
        </div>
      )}

      {cart.length === 0 ? (
        <div className="cart-empty">
          <div className="cart-empty-icon">🛒</div>
          <p style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:26, fontWeight:300, marginBottom:8 }}>Your cart is empty</p>
          <p style={{ fontSize:17, color:"var(--muted)", marginBottom:20 }}>Browse the collection and add pieces you love.</p>
          <button className="btn-p" onClick={() => setPage("catalog")}>Shop Now</button>
        </div>
      ) : (
        <div className="cart-page-layout">
          <div className="cart-page-items">
            {cart.map(item => (
              <div key={item.id} className="cart-page-item">
                <Pic src={item.image} w={320} alt={item.title} onClick={() => setSelected(item)} />
                <div className="cart-page-item-info">
                  <div className="cart-page-item-cat">{item.category}</div>
                  <div className="cart-page-item-title" onClick={() => setSelected(item)}>{item.title}</div>
                  <div className="cart-page-item-price">
                    {item.salePrice
                      ? <>${Number(item.salePrice).toLocaleString()} <span style={{fontSize:16,color:"var(--muted)",textDecoration:"line-through",marginLeft:6}}>{item.price ? `$${Number(item.price).toLocaleString()}` : ""}</span></>
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
              <span className="cart-page-subtotal-value">${subtotal.toLocaleString()}</span>
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
                <Pic src={item.image} w={640} alt={item.title} loading="lazy" />
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
