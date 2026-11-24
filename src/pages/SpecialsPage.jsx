import { useState } from "react";
import ArtworkModal from "../components/ArtworkModal";
import ShopButton from "../components/ShopButton";
import Pic from "../components/Pic";

export default function SpecialsPage({ data, addToCart, cart, onCheckout }) {
  const [selected, setSelected] = useState(null);
  const items = data.items.filter(i => i.salePrice);
  const inCart = (item) => !!cart?.find(i => i.id === item.id);
  return (
    <div>
      <div className="page-hero">
        <p className="page-hero-eyebrow">Limited Time</p>
        <h1 className="page-hero-title">Specials</h1>
        <p className="page-hero-sub">Original works at special prices — for a limited time only.</p>
      </div>
      <div className="gallery">
        {items.length === 0
          ? <div className="gallery-empty"><h3>No specials right now</h3><p style={{fontSize:17}}>Add a sale price to artworks in the Admin panel.</p></div>
          : <div className="gallery-grid">
              {items.map(item => (
                <div key={item.id} className="card" onClick={() => setSelected(item)}>
                  <Pic src={item.image} w={640} alt={item.title} loading="lazy" />
                  {item.isChildren && <div className="card-children">❤️</div>}
                  {item.isSold && <div className="card-badge" style={{top:10,background:"#1c1a18",color:"#fff",letterSpacing:".12em"}}>Sold</div>}
                  {!item.isSold && <div className="card-badge card-badge-sale" style={{top:10}}>Sale</div>}
                  {!item.isSold && item.isNew && <div className="card-badge card-badge-new" style={{top:44}}>New</div>}
                  <div className="card-over">
                    <div className="card-cat">{item.category}</div>
                    <div className="card-title">{item.title}</div>
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
                      <div className="card-price" style={{color:"var(--gold)"}}>${Number(item.salePrice).toLocaleString()}</div>
                      {item.price && <div className="card-price-was">${Number(item.price).toLocaleString()}</div>}
                    </div>
                    <ShopButton item={item} inCart={inCart(item)} onAdd={addToCart} onCheckout={onCheckout} />
                  </div>
                </div>
              ))}
            </div>
        }
      </div>
      {selected && <ArtworkModal item={selected} onClose={() => setSelected(null)} sold={!!selected.isSold} inCart={inCart(selected)} onCheckout={onCheckout} onBuy={selected.isSold ? undefined : s => { setSelected(null); addToCart(s); }} />}
    </div>
  );
}
