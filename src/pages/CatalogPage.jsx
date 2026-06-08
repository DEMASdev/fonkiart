import { useState } from "react";
import Pagination from "../components/Pagination";
import ArtworkModal from "../components/ArtworkModal";
import CheckoutModal from "../components/CheckoutModal";
import PriceInquiryModal from "../components/PriceInquiryModal";
import { getUrgency } from "../utils/helpers";

export default function CatalogPage({ data, addToCart, cart }) {
  const [cat, setCat] = useState("All");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("default");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [checkout, setCheckout] = useState(null);
  const [priceInquiry, setPriceInquiry] = useState(null);
  const PER_PAGE = 12;

  const tabs = ["All", ...data.categories];
  const base = (cat === "All" ? data.items : data.items.filter(i => i.category === cat))
    .filter(i => !i.isCollectorsOnly)
    .filter(i => !search.trim() ||
      i.title?.toLowerCase().includes(search.toLowerCase()) ||
      i.description?.toLowerCase().includes(search.toLowerCase()) ||
      i.category?.toLowerCase().includes(search.toLowerCase())
    );
  const filtered = sort === "price-asc"
    ? [...base].sort((a,b) => Number(a.salePrice||a.price||0) - Number(b.salePrice||b.price||0))
    : sort === "price-desc"
    ? [...base].sort((a,b) => Number(b.salePrice||b.price||0) - Number(a.salePrice||a.price||0))
    : base;

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const handleCat = (c) => { setCat(c); setPage(1); };
  const handleSearch = (v) => { setSearch(v); setPage(1); };

  return (
    <div>
      <div className="cats">
        {tabs.map(c => (
          <button key={c} className={`cat-tab${cat === c ? " active" : ""}`} onClick={() => handleCat(c)}>{c}</button>
        ))}
      </div>
      <div className="catalog-search-wrap">
        <input className="catalog-search" placeholder="Search artworks…" value={search} onChange={e => handleSearch(e.target.value)} />
        <select value={sort} onChange={e => { setSort(e.target.value); setPage(1); }}
          style={{ border:"1px solid var(--border)", padding:"8px 12px", fontFamily:"'DM Sans',sans-serif", fontSize:12, letterSpacing:".06em", background:"var(--cream)", color:"var(--ink)", outline:"none", cursor:"pointer" }}>
          <option value="default">Sort: Default</option>
          <option value="price-asc">Price: Low → High</option>
          <option value="price-desc">Price: High → Low</option>
        </select>
        {search.trim() && <span className="catalog-search-count">{filtered.length} result{filtered.length !== 1 ? "s" : ""}</span>}
      </div>
      <div className="gallery">
        {paginated.length === 0
          ? <div className="gallery-empty">
              <h3>{search ? "No results found" : "No works in this collection yet"}</h3>
              <p style={{ fontSize:13 }}>{search ? `No artworks match "${search}"` : "Add pieces via the Admin panel."}</p>
            </div>
          : <div className="gallery-grid">
              {paginated.map(item => (
                <div key={item.id} className="card" onClick={() => setSelected(item)}>
                  <img src={item.image} alt={item.title} loading="lazy" />
                  {item.isChildren && <div className="card-children">❤️</div>}
                  {item.isSold && <div className="card-badge" style={{top:10,background:"#1c1a18",color:"#fff",letterSpacing:".14em"}}>Sold</div>}
                  {!item.isSold && item.salePrice && <div className="card-badge card-badge-sale" style={{top:10}}>Sale</div>}
                  {!item.isSold && item.isNew && <div className="card-badge card-badge-new" style={{top:item.salePrice?34:10}}>New</div>}
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
                      : <button className="card-btn" onClick={e => { e.stopPropagation(); item.price||item.salePrice ? addToCart(item) : setPriceInquiry(item); }}>{item.price||item.salePrice ? (cart?.find(i=>i.id===item.id) ? "✓ Added" : "Shop →") : "Inquire"}</button>
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
      <Pagination page={page} totalPages={totalPages} onChange={setPage} />
      {selected && <ArtworkModal item={selected} onClose={() => setSelected(null)} sold={!!selected.isSold} onBuy={selected.isSold ? undefined : s => { setSelected(null); s.price||s.salePrice ? setCheckout(s) : setPriceInquiry(s); }} />}
      {checkout && <CheckoutModal item={checkout} settings={data.settings} onClose={() => setCheckout(null)} />}
      {priceInquiry && <PriceInquiryModal item={priceInquiry} onClose={() => setPriceInquiry(null)} />}
    </div>
  );
}
