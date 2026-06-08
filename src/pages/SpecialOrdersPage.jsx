export default function SpecialOrdersPage({ setPage }) {
  return (
    <div>
      <div className="page-hero">
        <p className="page-hero-eyebrow">Bespoke Creations</p>
        <h1 className="page-hero-title">Special Orders</h1>
        <p className="page-hero-sub">Have something specific in mind? Fonkiart accepts custom commissions — from personal portraits to large-scale installations.</p>
      </div>
      <div className="placeholder-body">
        <h2>How It Works</h2>
        <p>Every special order begins with a conversation. Describe your vision — the subject, size, medium, and timeline — and Fonkiart will create a piece made exclusively for you.</p>
        <p>Custom commissions typically take 2–6 weeks depending on complexity. A deposit is required to begin, with the balance due upon completion.</p>
        <p>To get started, reach out via the <strong>Contact Us</strong> page or send a direct message. We'll respond within 48 hours.</p>
        <button className="btn-p" onClick={() => setPage("contact")}>Request a Commission</button>
      </div>
    </div>
  );
}
