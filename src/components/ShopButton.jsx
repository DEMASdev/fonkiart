import { useRef } from "react";

// The button on a piece's card in the shop (Catalog, New Collections, Specials). "Shop →" puts the
// piece in the cart, and the same button then says "Checkout →" and goes there (Andy, 2026-11-23:
// "once a item is clicked ( the shop buttom ) , the button of that item should be checkout !"). It
// said "✓ Added" before, and led nowhere. A second tap right on top of the first (a double tap) only
// adds the piece. A piece with no price: "Inquire". Sold: "Sold Out".
const DOUBLE_TAP_MS = 700;

export default function ShopButton({ item, inCart, onAdd, onAsk, onCheckout }) {
  const addedAt = useRef(0);
  if (item.isSold) return <button className="card-btn" disabled style={{opacity:.45,cursor:"default"}}>Sold Out</button>;
  const priced = item.price || item.salePrice;
  const tap = (e) => {
    e.stopPropagation(); // the card under it opens the piece's own window
    if (!priced) { onAsk(item); return; }
    if (!inCart) { addedAt.current = Date.now(); onAdd(item); return; }
    if (Date.now() - addedAt.current > DOUBLE_TAP_MS) onCheckout();
  };
  return <button className={`card-btn${priced && inCart ? " is-checkout" : ""}`} onClick={tap}>{!priced ? "Inquire" : inCart ? "Checkout →" : "Shop →"}</button>;
}
