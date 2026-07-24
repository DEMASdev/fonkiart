import { useState } from "react";
import ArtworkModal from "../components/ArtworkModal";

export default function SpecialsPage({ data, addToCart, cart }) {
  const [selected, setSelected] = useState(null);
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
                  </div>
                </div>
              ))}
            </div>
        }
      </div>
      {selected && <ArtworkModal item={selected} onClose={() => setSelected(null)} sold={!!selected.isSold} onBuy={selected.isSold ? undefined : s => { setSelected(null); addToCart(s); }} />}
    </div>
  );
}
