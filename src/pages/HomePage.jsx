import { useState } from "react";
import CollectorsSection from "../components/CollectorsSection";
import { img } from "../lib/img";

// Second look (Andy, 11-01: "sharper cleaner more intuitive"): one strong piece of
// art up top, the newest works right away, and categories you can see.
const price = (item) => item.salePrice ? `$${Number(item.salePrice).toLocaleString()}`
  : item.price ? `$${Number(item.price).toLocaleString()}` : "Price on request";

export default function HomePage({ setPage, data, onView }) {
  const works = (data?.items || []).filter(i => i.image);
  const forSale = works.filter(i => !i.isSold && !i.isChildren);
  // A random hero per visit: the dice roll happens once (useState initializer = the one
  // impure spot allowed), the pick happens every render, so it still works when the
  // artworks arrive after the page first draws.
  const [roll] = useState(() => Math.random());
  const hero = forSale[Math.floor(roll * forSale.length)] || works[0];
  const latest = forSale.slice(0, 6);
  const open = (item) => (onView ? onView(item) : setPage("catalog"));

  const tiles = [
    { label: "Original Art",     desc: "One-of-a-kind pieces", page: "catalog",   art: forSale[0] },
    { label: "Fine Art Prints",  desc: "Prints & editions",    page: "artprints", art: forSale[1] || works[1] },
    { label: "Special Orders",   desc: "Custom commissions",   page: "special",   art: forSale[2] || works[2] },
    { label: "Children Benefit", desc: "Art for a cause",      page: "children",  art: works.find(i => i.isChildren) || works[3] },
  ];

  return (
    <div className="v2-home">
      <section className="v2-hero">
        <div className="v2-hero-text">
          <p className="v2-eyebrow">Original art · Isla Morada, Florida Keys</p>
          <h1 className="v2-hero-title">Where <em>art</em> meets the soul</h1>
          <p className="v2-hero-sub">One-of-a-kind paintings and fine art prints by Aliana Fonseca. Every piece ships worldwide.</p>
          <div className="v2-hero-actions">
            <button className="v2-btn" onClick={() => setPage("catalog")}>Shop the collection</button>
            <button className="v2-link" onClick={() => setPage("special")}>Commission a piece →</button>
          </div>
        </div>
        {hero && (
          <button className="v2-hero-art" onClick={() => open(hero)}>
            <img src={img(hero.image, 1080)} alt={hero.title} />
            <span className="v2-hero-caption">“{hero.title}” · Aliana Fonseca</span>
          </button>
        )}
      </section>

      {latest.length > 0 && (
        <section className="v2-section">
          <div className="v2-section-head">
            <h2>New works</h2>
            <button className="v2-link" onClick={() => setPage("catalog")}>See all →</button>
          </div>
          <div className="v2-grid">
            {latest.map(item => (
              <button key={item.id} className="v2-card" onClick={() => open(item)}>
                <span className="v2-card-img"><img src={img(item.image, 640)} alt={item.title} loading="lazy" /></span>
                <span className="v2-card-title">{item.title}</span>
                <span className="v2-card-price">{price(item)}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="v2-section">
        <div className="v2-section-head"><h2>Explore</h2></div>
        <div className="v2-tiles">
          {tiles.map(t => (
            <button key={t.label} className="v2-tile" onClick={() => setPage(t.page)}>
              {t.art && <span className="v2-tile-img"><img src={img(t.art.image, 640)} alt="" loading="lazy" /></span>}
              <span className="v2-tile-label">{t.label}</span>
              <span className="v2-tile-desc">{t.desc}</span>
            </button>
          ))}
        </div>
      </section>

      <CollectorsSection />
    </div>
  );
}
