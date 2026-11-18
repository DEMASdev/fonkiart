import { useState } from "react";
import { Image as ImageIcon } from "lucide-react";
import Pic from "../components/Pic";

// The artwork's picture, small, in its own little mat (Andy, 2026-11-18: "keep everything
// esthetically beautiful pretty and art driven please"). Admin -> Orders shows one at the start of
// every order, and the address pop-up a bigger one.
// art: the catalogue piece the order is for (findArtwork, src/lib/invoiceView.js: same title), or
// null. No piece, or a picture that will not load: a quiet empty frame, never a broken image.
// The title is always written beside it, so the picture itself says nothing to a screen reader.
export default function ArtThumb({ art, size = "row" }) {
  const [broken, setBroken] = useState(false);
  const cls = `order-art order-art-${size}`;
  if (!art?.image || broken) {
    return <span className={`${cls} order-art-none`} aria-hidden="true"><ImageIcon size={size === "big" ? 30 : 22} strokeWidth={1.25} /></span>;
  }
  return (
    <span className={cls}>
      <Pic src={art.image} w={size === "big" ? 320 : 160} alt="" loading="lazy" onError={() => setBroken(true)} />
    </span>
  );
}
