export default function PartnersPage({ setPage }) {
  return (
    <div>
      <div className="page-hero">
        <p className="page-hero-eyebrow">Collaborations</p>
        <h1 className="page-hero-title">Partners</h1>
        <p className="page-hero-sub">Fonkiart collaborates with galleries, brands, and organizations that share a passion for meaningful art.</p>
      </div>
      <div className="placeholder-body">
        <h2>Partner With Us</h2>
        <p>We're open to collaborations with interior designers, hotels, event planners, non-profits, and corporate clients looking to enrich their spaces with original art.</p>
        <p>If you're interested in becoming a partner or featuring Fonkiart's work in your venue or platform, please reach out through the Contact page.</p>
        <button className="btn-p" onClick={() => setPage("contact")}>Get in Touch</button>
      </div>
    </div>
  );
}
