import { useState } from "react";
import ArtworkModal from "../components/ArtworkModal";

export default function SoldPage({ data }) {
  const [selected, setSelected] = useState(null);
  const items = data.items.filter(i => i.isSold);
  return (
    <div>
      <div className="page-hero">
        <p className="page-hero-eyebrow">Archive</p>
        <h1 className="page-hero-title">Past Works</h1>
        <p className="page-hero-sub">A record of original pieces that have found their permanent homes.</p>
      </div>
      <div className="gallery">
        {items.length === 0
          ? <div className="gallery-empty"><h3>No archived pieces yet</h3><p style={{fontSize:13}}>Mark artworks as "Sold" in the Admin panel.</p></div>
          : <div className="gallery-grid">
              {items.map(item => (
                <div key={item.id} className="card" onClick={() => setSelected(item)}>
                  <img src={item.image} alt={item.title} loading="lazy" style={{filter:"grayscale(30%)"}} />
                  <div style={{ position:"absolute", inset:0, background:"rgba(10,8,6,.45)", display:"flex", alignItems:"center", justifyContent:"center", pointerEvents:"none" }}>
                    <span style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:13, letterSpacing:".25em", textTransform:"uppercase", color:"rgba(255,255,255,.75)", border:"1px solid rgba(255,255,255,.3)", padding:"5px 16px" }}>Sold</span>
                  </div>
                  <div className="card-over" style={{cursor:"pointer"}}>
                    <div className="card-cat">{item.category}</div>
                    <div className="card-title">{item.title}</div>
                    {item.price && <div className="card-price" style={{color:"rgba(255,255,255,.5)",textDecoration:"line-through"}}>${Number(item.price).toLocaleString()}</div>}
                  </div>
                </div>
              ))}
            </div>
        }
      </div>
      {selected && <ArtworkModal item={selected} onClose={() => setSelected(null)} sold />}
    </div>
  );
}
