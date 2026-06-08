export default function Pagination({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null;
  const pages = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push("...");
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
    if (page < totalPages - 2) pages.push("...");
    pages.push(totalPages);
  }
  return (
    <div className="pagination">
      <button className="page-btn" disabled={page === 1} onClick={() => onChange(page - 1)}>← Prev</button>
      {pages.map((p, i) => p === "..."
        ? <span key={`e${i}`} style={{ color:"var(--muted)", padding:"0 4px" }}>…</span>
        : <button key={p} className={`page-btn${page === p ? " active" : ""}`} onClick={() => onChange(p)}>{p}</button>
      )}
      <button className="page-btn" disabled={page === totalPages} onClick={() => onChange(page + 1)}>Next →</button>
    </div>
  );
}
