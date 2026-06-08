export default function ChildrenPage({ setPage }) {
  return (
    <div>
      <div className="page-hero">
        <p className="page-hero-eyebrow">Art for a Cause</p>
        <h1 className="page-hero-title">Children Benefit</h1>
        <p className="page-hero-sub">A portion of every sale supports programs that bring art education to children in underserved communities.</p>
      </div>
      <div className="placeholder-body">
        <h2>Why It Matters</h2>
        <p>Art changes lives. For children who may not have access to creative education, it opens doors to self-expression, confidence, and new possibilities.</p>
        <p>Fonkiart donates a percentage of proceeds from designated works to local and national children's art programs. When you purchase a piece marked for this initiative, you're not just collecting art — you're investing in a child's future.</p>
        <p>Look for the ❤️ badge in the Catalog to find pieces that directly support the Children Benefit program.</p>
        <button className="btn-p" onClick={() => setPage("contact")}>Get Involved</button>
      </div>
    </div>
  );
}
