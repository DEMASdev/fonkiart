import { useState } from "react";
import { supabase, SUPABASE_URL } from "../lib/supabase";
export default function ItemList({ data, deleteArtwork, patchArtwork, onEdit }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const PER_PAGE = 15;

  const handleDelete = async id => {
    if (!window.confirm("Delete this artwork?")) return;
    const item = data.items.find(i => i.id === id);
    if (item?.image && supabase) {
      const storageBase = `${SUPABASE_URL}/storage/v1/object/public/artworks/`;
      if (item.image.startsWith(storageBase)) {
        const path = item.image.slice(storageBase.length).split("?")[0];
        supabase.storage.from("artworks").remove([path]).catch(() => {});
      }
    }
    await deleteArtwork(id);
  };

  if (!data.items.length) return <p style={{ color:"var(--muted)", fontSize:14 }}>No artworks yet. Add your first piece.</p>;

  const q = search.toLowerCase();
  const filtered = q ? data.items.filter(i =>
    i.title?.toLowerCase().includes(q) ||
    i.category?.toLowerCase().includes(q)
  ) : data.items;

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paged = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const handleSearch = v => { setSearch(v); setPage(1); };

  return (
    <>
      <div style={{ display:"flex", gap:8, marginBottom:14, alignItems:"center" }}>
        <input
          type="text"
          placeholder="Search by title or category…"
          value={search}
          onChange={e => handleSearch(e.target.value)}
          style={{ flex:1, border:"1px solid var(--border)", padding:"7px 11px", fontFamily:"'DM Sans',sans-serif", fontSize:13, outline:"none" }}
        />
        {search && <button className="btn-s" onClick={() => handleSearch("")}>Clear</button>}
        <span style={{ fontSize:12, color:"var(--muted)", whiteSpace:"nowrap" }}>{filtered.length} result{filtered.length!==1?"s":""}</span>
      </div>
      {paged.map(item => (
        <div key={item.id} className="admin-item">
          <img src={item.image} alt={item.title} />
          <div>
            <div className="ai-title">{item.title}</div>
            <div className="ai-meta">{item.category}{item.price?` · $${item.price}`:""}{item.salePrice?` · SALE $${item.salePrice}`:""}{item.medium?` · ${item.medium}`:""}{item.dimensions?` · ${item.dimensions}`:""}{item.isNew?" · NEW":""}{item.isSold?" · SOLD":""}{item.isChildren?" · ❤️ Children":""}</div>
          </div>
          <div className="ai-btns" style={{ flexDirection:"column", alignItems:"flex-end" }}>
            <div style={{ display:"flex", gap:5, marginBottom:5 }}>
              <button
                onClick={async () => { await patchArtwork(item.id, { isNew: !item.isNew }); }}
                style={{ padding:"2px 8px", fontSize:10, letterSpacing:".08em", textTransform:"uppercase", border:"1px solid", borderColor:item.isNew?"var(--sidebar-bg)":"var(--border)", background:item.isNew?"var(--sidebar-bg)":"transparent", color:item.isNew?"var(--gold)":"var(--muted)", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", transition:"all .2s", borderRadius:2 }}
              >New</button>
              <button
                onClick={async () => { await patchArtwork(item.id, { isSold: !item.isSold }); }}
                style={{ padding:"2px 8px", fontSize:10, letterSpacing:".08em", textTransform:"uppercase", border:"1px solid", borderColor:item.isSold?"#c0392b":"var(--border)", background:item.isSold?"#c0392b":"transparent", color:item.isSold?"#fff":"var(--muted)", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", transition:"all .2s", borderRadius:2 }}
              >Sold</button>
            </div>
            <div style={{ display:"flex", gap:5 }}>
              <button className="btn-s" onClick={() => onEdit(item)}>Edit</button>
              <button className="btn-d" onClick={() => handleDelete(item.id)}>Del</button>
            </div>
          </div>
        </div>
      ))}
      {totalPages > 1 && (
        <div style={{ display:"flex", gap:6, justifyContent:"center", marginTop:16 }}>
          <button className="btn-s" onClick={() => setPage(p => Math.max(1,p-1))} disabled={page===1}>‹ Prev</button>
          <span style={{ fontSize:12, color:"var(--muted)", alignSelf:"center" }}>Page {page} of {totalPages}</span>
          <button className="btn-s" onClick={() => setPage(p => Math.min(totalPages,p+1))} disabled={page===totalPages}>Next ›</button>
        </div>
      )}
    </>
  );
}

