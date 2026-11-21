import { useEffect, useState } from "react";
import { storeCall } from "../lib/store";
import { stripeJsReady } from "../lib/stripeJs";
import { showKlarnaLine } from "../lib/klarnaLine";

// Klarna's "pay in 4" line on a piece's page (ArtworkModal), under the price and above ADD TO CART:
// Stripe's own words in Stripe's own frame (src/lib/klarnaLine.js). It asks for the shop's key and
// for Stripe.js only once it is drawn, so only once a piece's page opens. It takes room (the gap
// above ADD TO CART) only while Klarna's words are there: where it shows nothing, there is no gap.
// cents: the price shown, in cents (klarnaLine.js priceCents).
export default function KlarnaLine({ cents }) {
  const [box, setBox] = useState(null); // the element the line goes into, once it is on the page
  const [room, setRoom] = useState(false);
  useEffect(() => {
    if (!box) return undefined;
    return showKlarnaLine(box, cents, { ask: storeCall, ready: stripeJsReady, onRoom: setRoom });
  }, [box, cents]);
  return <div ref={setBox} className="klarna-line" style={room ? { marginBottom: 20 } : undefined} />;
}
