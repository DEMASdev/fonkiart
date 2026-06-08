import { useMemo } from "react";
import CollectorsSection from "../components/CollectorsSection";

export default function HomePage({ setPage, data }) {
  const allImgs = (data?.items || []).filter(i => i.image);
  const slides = useMemo(() => {
    const shuffled = [...allImgs].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 3);
  }, [data?.items?.length]);

  return (
    <div>
      <div className="hero">
        <div className="hero-left">
          <p className="hero-eyebrow">Original Art & Fine Art Prints</p>
          <h1 className="hero-title">Where <em>art</em><br />meets the soul</h1>
          <p className="hero-sub">Curated works available for purchase. Each piece is original and ships worldwide.</p>
          <div className="hero-buttons" style={{ display:"flex", gap:10, marginTop:20, flexWrap:"wrap" }}>
            <button className="btn-p" onClick={() => setPage("catalog")} style={{ background:"var(--gold)", fontSize:13, letterSpacing:".18em", padding:"13px 28px" }}>Shop Now →</button>
            <button className="btn-s" onClick={() => setPage("catalog")} style={{ color:"rgba(255,255,255,.6)", borderColor:"rgba(255,255,255,.25)", fontSize:11 }}>Shop the Collection</button>
          </div>
        </div>
        <div className="hero-right">
          {slides.length === 0
            ? <div style={{ gridColumn:"1/-1", background:"linear-gradient(135deg,#e8e2d9,#d4cdc4)" }} />
            : slides.map((item, i) => (
                <div key={item.id} className="hero-panel">
                  <img src={item.image} alt={item.title} />
                </div>
              ))
          }
          <button className="hero-shop-btn" onClick={() => setPage("catalog")}>Shop the Collection →</button>
        </div>
      </div>

      <div className="home-quicklinks" style={{ borderTop:"2px solid var(--border)", borderBottom:"1px solid var(--border)", display:"grid", gridTemplateColumns:"repeat(4,1fr)" }}>
        {[
          { label:"Original Art",     desc:"One-of-a-kind pieces",  page:"catalog" },
          { label:"Fine Art Prints",  desc:"Art prints & editions",  page:"catalog" },
          { label:"Special Orders",   desc:"Custom commissions",     page:"special" },
          { label:"Children Benefit", desc:"Art for a cause",        page:"children" },
        ].map((c, i) => (
          <div key={c.label} onClick={() => setPage(c.page)} className="quicklink-item"
            style={{ borderLeft: i > 0 ? "1px solid var(--border)" : "none" }}
            onMouseEnter={e => e.currentTarget.style.background="#fdf9f4"}
            onMouseLeave={e => e.currentTarget.style.background="transparent"}
          >
            <div className="quicklink-label">{c.label}</div>
            <div className="quicklink-desc">{c.desc}</div>
            <div className="quicklink-cta">Explore →</div>
          </div>
        ))}
      </div>

      <CollectorsSection />
    </div>
  );
}
