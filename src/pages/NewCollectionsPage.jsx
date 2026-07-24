import { useState } from "react";
import ArtworkModal from "../components/ArtworkModal";
import PriceInquiryModal from "../components/PriceInquiryModal";

export default function NewCollectionsPage({ data, addToCart, cart }) {
  const [selected, setSelected] = useState(null);
  const [priceInquiry, setPriceInquiry] = useState(null);
  const items = data.items.filter(i => i.isNew);
  return (
    <div>
      <div className="page-hero">
        <p className="page-hero-eyebrow">Just Arrived</p>
        <h1 className="page-hero-title">New Collections</h1>
        <p className="page-hero-sub">Fresh original works, just added to the gallery.</p>
      </div>
      <div className="gallery">
        {items.length === 0
          ? <div className="gallery-empty"><h3>No new pieces yet</h3><p style={{fontSize:13}}>Mark artworks as "New" in the Admin panel.</p></div>
          : <div className="gallery-grid">
              {items.map(item => (
                <div key={item.id} className="card" onClick={() => setSelected(item)}>
                  <img src={item.image} alt={item.title} loading="lazy" />
                  {item.isChildren && <div className="card-children">❤️</div>}
                  {item.isSold && <div className="card-badge" style={{top:10,background:"#1c1a18",color:"#fff",letterSpacing:".14em"}}>Sold</div>}
                  {!item.isSold && <div className="card-badge card-badge-new" style={{top:10}}>New</div>}
                  <div className="card-over">
                    <div className="card-cat">{item.category}</div>
                    <div className="card-title">{item.title}</div>
                    {item.salePrice
                      ? <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
                          <span className="card-price" style={{marginBottom:0,color:"var(--gold)"}}>${Number(item.salePrice).toLocaleString()}</span>
                          {item.price && <span style={{fontSize:11,color:"rgba(255,255,255,.5)",textDecoration:"line-through"}}>${Number(item.price).toLocaleString()}</span>}
                        </div>
                      : <div className="card-price">{item.price ? `$${Number(item.price).toLocaleString()}` : <span style={{fontSize:11,letterSpacing:".1em",opacity:.75}}>Price on request</span>}</div>
                    }
                    {item.isSold
                      ? <button className="card-btn" disabled style={{opacity:.45,cursor:"default"}}>Sold Out</button>
                      : <button className="card-btn" onClick={e=>{e.stopPropagation(); item.price||item.salePrice ? addToCart(item) : setPriceInquiry(item);}}>{item.price||item.salePrice ? (cart?.find(i=>i.id===item.id) ? "✓ Added" : "Shop →") : "Inquire"}</button>
                    }
                  </div>
                </div>
              ))}
            </div>
        }
      </div>
      {selected && <ArtworkModal item={selected} onClose={() => setSelected(null)} sold={!!selected.isSold} onBuy={selected.isSold ? undefined : s => { setSelected(null); s.price||s.salePrice ? addToCart(s) : setPriceInquiry(s); }} />}
      {priceInquiry && <PriceInquiryModal item={priceInquiry} onClose={() => setPriceInquiry(null)} />}
    </div>
  );
}
