export default function CollectionsPage({ data, setPage, goToCategory }) {
  const categories = data.categories || [];

  return (
    <div>
      <div className="page-hero">
        <p className="page-hero-eyebrow">Browse By</p>
        <h1 className="page-hero-title">Collections</h1>
        <p className="page-hero-sub">Explore the collection by style.</p>
      </div>
      <div className="gallery">
        {categories.length === 0
          ? <div className="gallery-empty"><h3>No collections yet</h3><p style={{fontSize:13}}>Add categories in the Admin panel.</p></div>
          : <div className="gallery-grid">
              {categories.map(cat => {
                const preview = data.items.find(i => i.category === cat && i.image);
                return (
                  <div key={cat} className="card" onClick={() => goToCategory(cat)}>
                    {preview
                      ? <img src={preview.image} alt={cat} loading="lazy" />
                      : <div style={{ width:"100%", aspectRatio:"1/1", background:"linear-gradient(135deg,#e8e2d9,#d4cdc4)" }} />
                    }
                    <div className="card-over" style={{ opacity:1, background:"linear-gradient(to top,rgba(10,8,6,.75) 0%,transparent 60%)" }}>
                      <div className="card-title" style={{ fontSize:20 }}>{cat}</div>
                      <button className="card-btn">Explore →</button>
                    </div>
                  </div>
                );
              })}
            </div>
        }
      </div>
    </div>
  );
}
