import { useState } from "react";
import ArtworkModal from "../components/ArtworkModal";
import CheckoutModal from "../components/CheckoutModal";
import { getUrgency } from "../utils/helpers";

export default function SpecialsPage({ data, addToCart, cart }) {
  const [selected, setSelected] = useState(null);
  const [checkout, setCheckout] = useState(null);
  const items = data.items.filter(i => i.salePrice);
  return (
    <div>
      <div className="page-hero">
        <p className="page-hero-eyebrow">Limited Time</p>
        <h1 className="page-hero-title">Specials</h1>
        <p className="page-hero-sub">Original works at special prices — for a limited time only.</p>
      </div>
      <div className="gallery">
        {items.length === 0
          ? <div className="gallery-empty"><h3>No specials right now</h3><p style={{fontSize:13}}>Add a sale price to artworks in the Admin panel.</p></div>
          : <div className="gallery-grid">
              {items.map(item => (
                <div key={item.id} className="card" onClick={() => setSelected(item)}>
                  <img src={item.image} alt={item.title} loading="lazy" />
                  {item.isChildren && <div className="card-children">❤️</div>}
                  {item.isSold && <div className="card-badge" style={{top:10,background:"#1c1a18",color:"#fff",letterSpacing:".14em"}}>Sold</div>}
                  {!item.isSold && <div className="card-badge card-badge-sale" style={{top:10}}>Sale</div>}
                  {!item.isSold && item.isNew && <div className="card-badge card-badge-new" style={{top:34}}>New</div>}
                  <div className="card-over">
                    <div className="card-cat">{item.category}</div>
                    <div className="card-title">{item.title}</div>
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
                      <div className="card-price" style={{color:"var(--gold)"}}>${Number(item.salePrice).toLocaleString()}</div>
                      {item.price && <div style={{fontSize:13,color:"rgba(255,255,255,.5)",textDecoration:"line-through"}}>${Number(item.price).toLocaleString()}</div>}
                    </div>
                    {item.isSold
                      ? <button className="card-btn" disabled style={{opacity:.45,cursor:"default"}}>Sold Out</button>
                      : <button className="card-btn" onClick={e=>{e.stopPropagation();addToCart(item);}}>{cart?.find(i=>i.id===item.id) ? "✓ Added" : "Shop →"}</button>
                    }
                    {!item.isSold && (() => { const u = getUrgency(item.id); return (
                      <div style={{fontSize:10,color:"rgba(255,255,255,.8)",letterSpacing:".05em",marginTop:7,lineHeight:1.7,textAlign:"center"}}>
                        <div>🎨 Only 1 available</div>
                        {u.inDemand && <div>🔥 This piece is in demand</div>}
                        {u.cartCount > 0 && <div>👀 {u.cartCount} other visitor{u.cartCount > 1 ? "s have" : " has"} this in their cart</div>}
                      </div>
                    ); })()}
                  </div>
                </div>
              ))}
            </div>
        }
      </div>
      {selected && <ArtworkModal item={selected} onClose={() => setSelected(null)} sold={!!selected.isSold} onBuy={selected.isSold ? undefined : s => { setSelected(null); setCheckout(s); }} />}
      {checkout && <CheckoutModal item={checkout} settings={data.settings} onClose={() => setCheckout(null)} />}
    </div>
  );
}
