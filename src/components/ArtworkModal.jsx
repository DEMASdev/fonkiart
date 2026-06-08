import { useState } from "react";
import { getUrgency } from "../utils/helpers";

export default function ArtworkModal({ item, onClose, onBuy, sold }) {
  const allImages = (item.images?.length > 0) ? item.images : (item.image ? [item.image] : []);
  const [imgIdx, setImgIdx] = useState(0);
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-gallery-wrap">
          <img className="modal-img" src={allImages[imgIdx] || item.image} alt={item.title} style={sold ? {filter:"grayscale(20%)"} : undefined} />
          {allImages.length > 1 && (
            <div className="modal-thumbs">
              {allImages.map((url, i) => (
                <button key={i} className={`modal-thumb${imgIdx===i?" active":""}`} onClick={e => { e.stopPropagation(); setImgIdx(i); }}>
                  <img src={url} alt="" />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="modal-info">
          <button className="modal-close" onClick={onClose}>✕</button>
          <p className="modal-cat">{item.category}</p>
          <h2 className="modal-title">{item.title}</h2>
          <p className="modal-desc">{item.description || "Original work by Fonkiart."}</p>
          {(item.medium || item.dimensions) && (
            <div style={{ fontSize:13, color:"var(--muted)", marginBottom:18, lineHeight:1.8 }}>
              {item.medium && <div>{item.medium}</div>}
              {item.dimensions && <div>{item.dimensions}</div>}
            </div>
          )}
          {item.salePrice
            ? <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
                <div className="modal-price" style={{color:"var(--gold)",marginBottom:0}}>${Number(item.salePrice).toLocaleString()}</div>
                {item.price && <div style={{fontSize:20,color:"var(--muted)",textDecoration:"line-through"}}>${Number(item.price).toLocaleString()}</div>}
              </div>
            : item.price
              ? <div className="modal-price">${Number(item.price).toLocaleString()}</div>
              : <div style={{ fontSize:13, color:"var(--muted)", letterSpacing:".08em", marginBottom:20 }}>Price on request — contact us</div>
          }
          {onBuy && (() => { const u = getUrgency(item.id); return (<>
            <div style={{fontSize:11,color:"var(--muted)",letterSpacing:".05em",lineHeight:1.9,marginBottom:14}}>
              <div>🎨 Only 1 available — original artwork</div>
              {u.inDemand  && <div>🔥 This piece is in demand</div>}
              {u.cartCount > 0 && <div>👀 {u.cartCount} other visitor{u.cartCount > 1 ? "s have" : " has"} this in their cart</div>}
            </div>
            <button className="buy-btn" onClick={() => onBuy(item)}>
              {item.price || item.salePrice ? "Purchase This Piece" : "Request Pricing"}
            </button>
            <p className="buy-note">Ships worldwide · Secure payment</p>
          </>); })()}
          {sold && <>
            <div style={{ background:"var(--cream)", border:"1px solid var(--border)", padding:"12px 16px", marginBottom:16 }}>
              <span style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:15, letterSpacing:".18em", textTransform:"uppercase", color:"var(--muted)" }}>This piece has found its home</span>
            </div>
            <p className="buy-note">Commission a similar original piece via the Contact page.</p>
          </>}
        </div>
      </div>
    </div>
  );
}
