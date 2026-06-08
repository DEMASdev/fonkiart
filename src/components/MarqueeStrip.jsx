export default function MarqueeStrip() {
  const msgs = ["Ships Worldwide", "Original Art & Fine Art Prints", "New Works Added Weekly", "Shop the Collection", "Secure Checkout", "Contact Us for Shipping Rates"];
  const items = [...msgs, ...msgs];
  return (
    <div className="marquee-wrap">
      <div className="marquee-track">
        {items.map((m, i) => (
          <span key={i} className="marquee-item">
            {m}<span className="marquee-sep"> ✦ </span>
          </span>
        ))}
      </div>
    </div>
  );
}
