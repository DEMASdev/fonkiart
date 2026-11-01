import { useState } from "react";
import CollectorsSection from "../components/CollectorsSection";
import { img } from "../lib/img";

// Third look (Andy, 11-01): laid out like jessicaannart.com, "but a more sharp clean
// version, 1/3 of the huge size pictures ... same colors we have but more gold lines".
// Her page runs full-width photos; here every picture sits in a gold-lined frame at
// about a third of the page, and thin gold lines mark off each part of the page.
const price = (item) => item.salePrice ? `$${Number(item.salePrice).toLocaleString()}`
  : item.price ? `$${Number(item.price).toLocaleString()}` : "Price on request";

function Frame({ item, onClick }) {
  if (!item) return null;
  return (
    <button className="v3-frame" onClick={onClick} title={item.title}>
      <img src={img(item.image, 640)} alt={item.title} loading="lazy" />
    </button>
  );
}

const Heading = ({ children }) => <h2 className="v3-heading"><span>{children}</span></h2>;

function Split({ script, title, sub, label, onGo, art, onArt, flip }) {
  return (
    <section className={`v3-split${flip ? " flip" : ""}`}>
      <div className="v3-split-text">
        <p className="v3-script">{script}</p>
        <h2 className="v3-h2">{title}</h2>
        <span className="v3-rule" />
        <p className="v3-sub">{sub}</p>
        <button className="v3-btn" onClick={onGo}>{label}</button>
      </div>
      <Frame item={art} onClick={onArt} />
    </section>
  );
}

export default function HomePage({ setPage, data, onView }) {
  const works = (data?.items || []).filter(i => i.image);
  const forSale = works.filter(i => !i.isSold && !i.isChildren);
  const pool = forSale.length ? forSale : works;
  // One dice roll per visit (the useState initializer is the one impure spot allowed);
  // the picks are worked out every render, so they still appear when the artworks
  // arrive after the page first draws.
  const [roll] = useState(() => Math.random());
  const [active, setActive] = useState(0);
  const base = Math.floor(roll * pool.length);
  const at = (k) => (pool.length ? pool[(base + k) % pool.length] : undefined);
  const half = Math.max(1, Math.floor(pool.length / 2));
  const latest = forSale.slice(0, 4);
  const cur = latest[Math.min(active, latest.length - 1)];
  // The grid after "Latest works" carries on from the 5th newest, in full rows of four
  // (a lone card on a second row looks unfinished).
  const rest = forSale.length >= 8 ? forSale.slice(4, 12) : forSale.slice(0, 8);
  const shop = rest.slice(0, Math.max(4, rest.length - (rest.length % 4)));
  const prints = works.find(i => i.category === "Art Prints" && !i.isSold) || at(3);
  const cause = works.find(i => i.isChildren) || at(5);
  const showCause = data?.settings?.navVisible?.children !== false;
  const open = (item) => (onView ? onView(item) : setPage("catalog"));

  return (
    <div className="v3-home">
      <section className="v3-hero">
        <Frame item={at(0)} onClick={() => open(at(0))} />
        <div className="v3-hero-box">
          <p className="v3-eyebrow">Isla Morada · Florida Keys</p>
          <h1 className="v3-h1">Where art meets the soul</h1>
          <span className="v3-rule" />
          <p className="v3-sub">One-of-a-kind paintings and fine art prints by Aliana Fonseca. Every piece ships worldwide.</p>
          <button className="v3-btn" onClick={() => setPage("catalog")}>Shop the collection</button>
          <button className="v3-link" onClick={() => setPage("special")}>Commission a piece →</button>
        </div>
        <Frame item={at(half)} onClick={() => open(at(half))} />
      </section>

      <section className="v3-band">
        <p>Every piece is created with intention, emotion, and craftsmanship.</p>
      </section>

      <Split script="One-of-a-kind pieces" title="Original Art" sub="Shop the current collection of paintings by Aliana Fonseca."
        label="Shop originals" onGo={() => setPage("catalog")} art={at(1)} onArt={() => open(at(1))} />

      {cur && (
        <section className="v3-latest">
          <Heading>Latest works</Heading>
          <div className="v3-latest-body">
            <div className="v3-latest-list">
              {latest.map((item, i) => (
                <button key={item.id} className={`v3-latest-title${item === cur ? " active" : ""}`}
                  onMouseEnter={() => setActive(i)} onFocus={() => setActive(i)} onClick={() => setActive(i)}>{item.title}</button>
              ))}
              <span className="v3-rule" />
              {(cur.medium || cur.dimensions) && <p className="v3-latest-meta">{[cur.medium, cur.dimensions].filter(Boolean).join(" · ")}</p>}
              <p className="v3-price">{price(cur)}</p>
              <button className="v3-btn" onClick={() => open(cur)}>View this piece</button>
            </div>
            <Frame item={cur} onClick={() => open(cur)} />
          </div>
        </section>
      )}

      <Split flip script="Prints & editions" title="Fine Art Prints" sub="Fine art prints of Aliana's paintings."
        label="Shop prints" onGo={() => setPage("artprints")} art={prints} onArt={() => open(prints)} />

      {shop.length > 0 && (
        <section className="v3-shop">
          <Heading>Shop the collection</Heading>
          <div className="v3-grid">
            {shop.map(item => (
              <button key={item.id} className="v3-card" onClick={() => open(item)}>
                <span className="v3-card-img"><img src={img(item.image, 640)} alt={item.title} loading="lazy" /></span>
                <span className="v3-card-title">{item.title}</span>
                <span className="v3-card-price">{price(item)}</span>
              </button>
            ))}
          </div>
          <div className="v3-center"><button className="v3-btn-line" onClick={() => setPage("catalog")}>View all originals</button></div>
        </section>
      )}

      <Split script="Bespoke creations" title="Special Orders"
        sub="Have something specific in mind? Fonkiart accepts custom commissions — from personal portraits to large-scale installations."
        label="Start a commission" onGo={() => setPage("special")} art={at(2)} onArt={() => open(at(2))} />

      {showCause && (
        <Split flip script="Art for a cause" title="Children Benefit" sub="Pieces marked with ❤️ support children's art programs."
          label="Learn more" onGo={() => setPage("children")} art={cause} onArt={() => open(cause)} />
      )}

      <CollectorsSection />
    </div>
  );
}
