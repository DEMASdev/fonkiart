import Pic from "./Pic";
import { findArtwork } from "../lib/invoiceView";

// A Cart order's pieces, art first (Andy, for the card payment: "keep everything esthetically
// beautiful pretty and art driven"): each picture, found in the shop by its title the way the
// invoice page finds it, the title in the Fonkiart serif and the price, then the total in the
// serif with lining figures, as on the invoice page. lines and total: the SERVER's prices
// (api/_lib/cartCheckout.js), never the browser's. A piece the shop can't find shows no picture.
export default function PayArt({ lines, total, artworks = [], totalLabel = "Total" }) {
  return (
    <div className="pay-art">
      <ul className="pay-art-list">
        {lines.map((line, n) => {
          const art = findArtwork(artworks, line.title);
          return (
            <li key={`${n}-${line.title}`} className="pay-art-piece">
              {art && <Pic src={art.image} w={320} alt={line.title} className="pay-art-pic" />}
              <div className="pay-art-info">
                <div className="pay-art-title">{line.title}</div>
                <div className="pay-art-price">${Number(line.amount).toLocaleString()}</div>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="invoice-total pay-art-total">
        <span className="invoice-label">{totalLabel}</span>
        <span className="invoice-value">${Number(total).toLocaleString()}</span>
      </div>
    </div>
  );
}
