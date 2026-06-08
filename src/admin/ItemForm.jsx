import { useState, useEffect, useRef } from "react";
import { supabase, SUPABASE_URL } from "../lib/supabase";
export default function ItemForm({ data, updateData, addArtwork, editArtwork, editItem, setEditItem }) {
  const blank = { title:"", description:"", medium:"", dimensions:"", category:data.categories[0]||"", price:"", salePrice:"", images:[], image:"", isNew:false, isSold:false, isChildren:false, isCollectorsOnly:false, isEarlyAccess:false, stripeLink:"" };
  const [form, setForm] = useState(blank);
  const [status, setStatus] = useState("");
  const [uploading, setUploading] = useState(false);
  const [newCatInput, setNewCatInput] = useState("");
  const [previewImg, setPreviewImg] = useState(null);
  const multiFileRef = useRef();

  useEffect(() => {
    if (editItem) {
      const imgs = editItem.images?.length ? editItem.images : (editItem.image ? [editItem.image] : []);
      setForm({ ...editItem, images: imgs });
    } else {
      setForm(blank);
    }
  }, [editItem]);

  const handleAddPhoto = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    e.target.value = "";
    if (!supabase) {
      const url = URL.createObjectURL(file);
      setForm(fm => { const imgs = [...fm.images, url]; return { ...fm, images: imgs, image: imgs[0] }; });
      return;
    }
    setUploading(true);
    try {
      const ext = (file.name.split(".").pop()||"jpg").toLowerCase().replace("jpeg","jpg");
      const titleSlug = (form.title||"art").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,40);
      const catSlug  = (form.category||"general").toLowerCase().replace(/[^a-z0-9]+/g,"-").slice(0,20);
      const path = `${catSlug}/${titleSlug}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("artworks").upload(path, file, { upsert:false });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from("artworks").getPublicUrl(path);
      setForm(fm => { const imgs = [...fm.images, publicUrl]; return { ...fm, images: imgs, image: imgs[0] }; });
    } catch(err) {
      console.error("Photo upload:", err); setStatus("upload-error");
    }
    setUploading(false);
  };

  const handleRemovePhoto = (idx) => {
    setForm(fm => {
      const imgs = fm.images.filter((_, i) => i !== idx);
      return { ...fm, images: imgs, image: imgs[0]||"" };
    });
  };

  const handleSave = async () => {
    if (!form.title || form.images.length === 0) { setStatus("warn"); return; }
    setStatus("saving");
    const entry = { ...form, image: form.images[0]||"", images: form.images, id: editItem ? editItem.id : Date.now().toString() };
    if (editItem) { await editArtwork(editItem.id, entry); }
    else { await addArtwork(entry); }
    setForm(blank); setEditItem(null);
    setStatus("ok"); setTimeout(() => setStatus(""), 3000);
  };

  const f = (k,v) => setForm(fm => ({ ...fm,[k]:v }));

  return (
    <div>
      <h2>{editItem ? "Edit Artwork" : "Add Artwork"}</h2>
      {status==="ok"           && <div className="ok-msg">✓ {editItem?"Updated":"Added to gallery"}!</div>}
      {status==="warn"         && <div className="warn-msg">⚠ Title and at least one photo are required.</div>}
      {status==="saving"       && <div className="warn-msg" style={{background:"#f0f8ff",borderColor:"#b0d4f0",color:"#1a4a7a"}}>Saving…</div>}
      {status==="upload-error" && <div className="warn-msg">⚠ Upload failed. Check that the "artworks" bucket is public in Supabase Storage.</div>}

      {previewImg && (
        <div onClick={() => setPreviewImg(null)} style={{
          position:"fixed",inset:0,background:"rgba(0,0,0,.82)",zIndex:9999,
          display:"flex",alignItems:"center",justifyContent:"center",cursor:"zoom-out"
        }}>
          <img src={previewImg} alt="Preview" style={{maxWidth:"90vw",maxHeight:"90vh",objectFit:"contain",border:"2px solid var(--gold)",boxShadow:"0 8px 48px rgba(0,0,0,.6)"}} />
          <button onClick={() => setPreviewImg(null)} style={{
            position:"fixed",top:24,right:28,background:"rgba(255,255,255,.15)",border:"1px solid rgba(255,255,255,.3)",
            color:"#fff",width:36,height:36,borderRadius:"50%",cursor:"pointer",fontSize:16,
            display:"flex",alignItems:"center",justifyContent:"center"
          }}>✕</button>
        </div>
      )}

      <div style={{marginBottom:16}}>
        <label style={{display:"block",fontSize:11,letterSpacing:".12em",textTransform:"uppercase",color:"var(--muted)",marginBottom:8}}>
          Photos <span style={{fontWeight:300,textTransform:"none",letterSpacing:0,fontSize:11}}>(click to preview)</span>
        </label>
        <div style={{display:"flex",gap:12,flexWrap:"wrap",alignItems:"flex-start"}}>
          {form.images.map((url, i) => (
            <div key={i} style={{position:"relative",width:220,height:220,flexShrink:0,cursor:"zoom-in"}} onClick={() => setPreviewImg(url)}>
              <img src={url} style={{width:220,height:220,objectFit:"cover",border:"2px solid var(--border)",display:"block",transition:"border-color .2s"}}
                onMouseEnter={e => e.currentTarget.style.borderColor="var(--gold)"}
                onMouseLeave={e => e.currentTarget.style.borderColor="var(--border)"}
                alt={`photo ${i+1}`} />
              <button onClick={e => { e.stopPropagation(); handleRemovePhoto(i); }} style={{
                position:"absolute",top:-8,right:-8,width:24,height:24,borderRadius:"50%",
                background:"#c0392b",color:"#fff",border:"2px solid #fff",cursor:"pointer",
                fontSize:11,lineHeight:1,display:"flex",alignItems:"center",justifyContent:"center",padding:0,zIndex:2
              }}>✕</button>
              {i===0 && <div style={{position:"absolute",bottom:0,left:0,right:0,background:"rgba(0,0,0,.55)",color:"#fff",fontSize:10,textAlign:"center",letterSpacing:".08em",padding:"4px 0",pointerEvents:"none"}}>MAIN</div>}
              <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0)",display:"flex",alignItems:"center",justifyContent:"center",transition:"background .2s",pointerEvents:"none"}}
                className="img-hover-overlay">
                <span style={{color:"#fff",fontSize:11,letterSpacing:".1em",opacity:0,transition:"opacity .2s"}}>🔍 Preview</span>
              </div>
            </div>
          ))}
          {form.images.length < 6 && (
            <button onClick={() => multiFileRef.current.click()} disabled={uploading} style={{
              width:220,height:220,border:"2px dashed var(--border)",background:"none",
              cursor:uploading?"not-allowed":"pointer",color:"var(--muted)",fontSize:36,
              display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
              flexShrink:0,gap:8,transition:"border-color .2s"
            }}
              onMouseEnter={e => e.currentTarget.style.borderColor="var(--gold)"}
              onMouseLeave={e => e.currentTarget.style.borderColor="var(--border)"}
            >
              {uploading ? <span style={{fontSize:28}}>⏳</span> : <>
                <span style={{fontSize:36,lineHeight:1}}>+</span>
                <span style={{fontSize:11,letterSpacing:".1em",textTransform:"uppercase"}}>Add Photo</span>
              </>}
            </button>
          )}
        </div>
        {uploading && <p style={{fontSize:12,color:"var(--muted)",marginTop:8}}>Uploading photo…</p>}
        {form.images.length > 1 && <p style={{fontSize:11,color:"var(--muted)",marginTop:8}}>First photo is the main gallery image. Remove and re-add to change order.</p>}
        <input ref={multiFileRef} type="file" accept="image/*" style={{display:"none"}} onChange={handleAddPhoto} />
      </div>

      <div className="fld"><label>Title *</label><input value={form.title} onChange={e=>f("title",e.target.value)} placeholder="e.g. Lady in Blue" /></div>
      <div className="fld"><label>Category</label>
        <select value={form.category === "__new__" ? "__new__" : form.category}
          onChange={e => { if (e.target.value === "__new__") { f("category","__new__"); setNewCatInput(""); } else f("category", e.target.value); }}>
          {data.categories.map(c => <option key={c} value={c}>{c}</option>)}
          <option value="__new__">＋ New Category…</option>
        </select>
        {form.category === "__new__" && (
          <div style={{display:"flex",gap:8,marginTop:8}}>
            <input value={newCatInput} onChange={e=>setNewCatInput(e.target.value)}
              placeholder="Category name…" autoFocus
              onKeyDown={e => {
                if (e.key === "Enter") {
                  const cat = newCatInput.trim();
                  if (!cat || data.categories.includes(cat)) return;
                  updateData({ categories: [...data.categories, cat] });
                  f("category", cat); setNewCatInput("");
                }
              }}
              style={{flex:1,border:"1px solid var(--border)",padding:"8px 12px",fontFamily:"'DM Sans',sans-serif",fontSize:14,outline:"none"}} />
            <button className="btn-p" style={{padding:"8px 16px",flexShrink:0}} onClick={() => {
              const cat = newCatInput.trim();
              if (!cat || data.categories.includes(cat)) return;
              updateData({ categories: [...data.categories, cat] });
              f("category", cat); setNewCatInput("");
            }}>Add</button>
          </div>
        )}
      </div>
      <div className="fld"><label>Description</label><textarea value={form.description} onChange={e=>f("description",e.target.value)} placeholder="About this piece…" /></div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
        <div className="fld"><label>Medium</label><input value={form.medium||""} onChange={e=>f("medium",e.target.value)} placeholder="Oil on canvas" /></div>
        <div className="fld"><label>Dimensions</label><input value={form.dimensions||""} onChange={e=>f("dimensions",e.target.value)} placeholder="24 × 36 in." /></div>
      </div>
      <div className="fld"><label>Price (USD)</label><input type="number" value={form.price} onChange={e=>f("price",e.target.value)} placeholder="350" /></div>
      <div className="fld"><label>Sale Price (USD — leave blank if not on sale)</label><input type="number" value={form.salePrice||""} onChange={e=>f("salePrice",e.target.value)} placeholder="250" /></div>
      <div className="fld" style={{display:"flex",alignItems:"center",gap:10}}>
        <input type="checkbox" id="isNew" checked={!!form.isNew} onChange={e=>f("isNew",e.target.checked)} style={{width:"auto"}} />
        <label htmlFor="isNew" style={{textTransform:"none",fontSize:13,letterSpacing:0}}>Mark as New Collection</label>
      </div>
      <div className="fld" style={{display:"flex",alignItems:"center",gap:10}}>
        <input type="checkbox" id="isSold" checked={!!form.isSold} onChange={e=>f("isSold",e.target.checked)} style={{width:"auto"}} />
        <label htmlFor="isSold" style={{textTransform:"none",fontSize:13,letterSpacing:0,color:"#c0392b"}}>Mark as Sold (shows "Sold Out" badge — stays visible until deleted)</label>
      </div>
      <div className="fld" style={{display:"flex",alignItems:"center",gap:10}}>
        <input type="checkbox" id="isChildren" checked={!!form.isChildren} onChange={e=>f("isChildren",e.target.checked)} style={{width:"auto"}} />
        <label htmlFor="isChildren" style={{textTransform:"none",fontSize:13,letterSpacing:0,color:"#e74c3c"}}>❤️ Children Benefit piece (shows heart badge in catalog)</label>
      </div>
      <div style={{borderTop:"1px solid var(--border)",margin:"12px 0 12px",paddingTop:12}}>
        <p style={{fontSize:11,letterSpacing:".12em",textTransform:"uppercase",color:"var(--muted)",marginBottom:10}}>🔑 Exclusive Collectors Room</p>
        <div className="fld" style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
          <input type="checkbox" id="isCollectorsOnly" checked={!!form.isCollectorsOnly} onChange={e=>f("isCollectorsOnly",e.target.checked)} style={{width:"auto",accentColor:"#b8923f"}} />
          <label htmlFor="isCollectorsOnly" style={{textTransform:"none",fontSize:13,letterSpacing:0,color:"#b8923f",fontWeight:500}}>Private Collectors Room only (hidden from public)</label>
        </div>
        <div className="fld" style={{display:"flex",alignItems:"center",gap:10}}>
          <input type="checkbox" id="isEarlyAccess" checked={!!form.isEarlyAccess} onChange={e=>f("isEarlyAccess",e.target.checked)} style={{width:"auto",accentColor:"#b8923f"}} />
          <label htmlFor="isEarlyAccess" style={{textTransform:"none",fontSize:13,letterSpacing:0,color:"#b8923f"}}>Early Access — show to collectors before public release</label>
        </div>
      </div>
      <div className="fld"><label>Stripe Link (optional)</label><input value={form.stripeLink} onChange={e=>f("stripeLink",e.target.value)} placeholder="https://buy.stripe.com/…" /></div>
      <div className="row-btns">
        <button className="btn-p" onClick={handleSave}>{editItem?"Update":"Add to Gallery"}</button>
        {editItem && <button className="btn-s" onClick={() => { setForm(blank); setEditItem(null); }}>Cancel</button>}
      </div>
    </div>
  );
}

