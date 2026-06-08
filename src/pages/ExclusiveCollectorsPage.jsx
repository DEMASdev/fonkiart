export default function ExclusiveCollectorsPage({ client, onLogout, artworks }) {
  const available = artworks.filter(a => !a.isSold);
  const firstName = client.name ? client.name.split(" ")[0] : "";
  return (
    <div style={{ minHeight:"100vh", background:"var(--cream)", fontFamily:"'DM Sans',sans-serif" }}>
      <div style={{ background:"var(--sidebar-bg)", padding:"28px 48px", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:12 }}>
        <div>
          <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:11, letterSpacing:".22em", textTransform:"uppercase", color:"rgba(255,255,255,.55)", marginBottom:4 }}>Private Collectors Circle</div>
          <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:26, fontWeight:300, color:"#fff" }}>Welcome{firstName ? `, ${firstName}` : ""} — Fonkiart</div>
        </div>
        <button onClick={onLogout} style={{ background:"rgba(255,255,255,.12)", border:"1px solid rgba(255,255,255,.3)", padding:"10px 20px", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", fontSize:11, letterSpacing:".12em", textTransform:"uppercase", color:"#fff" }}>
          Sign Out
        </button>
      </div>
      <div style={{ padding:"48px 48px 80px", maxWidth:1100, margin:"0 auto" }}>
        <div style={{ marginBottom:36 }}>
          <p style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:32, fontWeight:300, color:"var(--ink)", marginBottom:8 }}>The Full Collection</p>
          <p style={{ fontSize:13, color:"var(--muted)", lineHeight:1.7 }}>As an exclusive collector you have first access to every available piece — including works not yet listed publicly.</p>
        </div>
        {available.length > 0 ? (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))", gap:3 }}>
            {available.map(a => (
              <div key={a.id} style={{ position:"relative", aspectRatio:"1", overflow:"hidden", background:"#e8e2d9" }}>
                {a.image && <img src={a.image} alt={a.title} style={{ width:"100%", height:"100%", objectFit:"cover", display:"block" }} />}
                <div style={{ position:"absolute", bottom:0, left:0, right:0, background:"linear-gradient(to top,rgba(10,8,6,.88) 0%,transparent 65%)", padding:"20px 14px 14px" }}>
                  <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:16, color:"#fff", marginBottom:3 }}>{a.title}</div>
                  {a.price && <div style={{ fontSize:12, color:"var(--gold)", letterSpacing:".04em" }}>${Number(a.price).toLocaleString()}</div>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ textAlign:"center", padding:"80px 0", color:"var(--muted)" }}>
            <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:28, fontWeight:300, marginBottom:12 }}>New works arriving soon.</div>
            <p style={{ fontSize:13 }}>The collection is being updated. Check back shortly.</p>
          </div>
        )}
      </div>
    </div>
  );
}
