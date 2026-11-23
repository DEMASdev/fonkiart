import { useState } from "react";
import { couponPrices, lessThanNow, moneyWords, ownSizes, sizesOf, typedSize } from "../lib/couponSize";

// "Send a coupon" asks how much off (Andy, 2026-11-22: "maybe we can discount $300 or something if we
// know the acquisition power of the person !!"). On the order itself, never a browser pop-up: two
// linked boxes, % off and $ off. Type in either and the other fills in for these pieces; the one
// typed LAST counts (it is what the email says), and has the gold edge. Beside them, what the pieces come
// to: $950 → $650. It opens at what their code gives now, else at the shop's %. The rules are
// src/lib/couponSize.js's, and the server goes by the same ones again, on its own prices
// (api/_lib/unfinishedCoupon.js).
//  coupon: what the server knows of this buyer, { code, used, sizes, pieces }; nothing when it didn't say.
//  shop: { choose, percent }: can the amount be chosen (its database change has run), and the shop's %;
//    null until the server has said, { failed: true } when it couldn't be asked.
//  percent: the shop's % as Admin has it, until the server has said.
//  onSend(choice): { percent }, { dollars }, or {} for what the code gives (the shop's %).
const plain = (dollars) => moneyWords(dollars).slice(1); // as it stands in the $ box: 1,200

export default function CouponAsk({ to, coupon, shop, percent, onSend, onCancel }) {
  const [typed, setTyped] = useState(null); // { box, text }: the one typed in last; null as it opens
  const choose = shop?.choose === true;
  const shopPercent = shop?.percent ?? percent;
  // What the pieces are worth: null when one has no price (or they couldn't be read), and then only
  // a % can be chosen.
  const prices = (coupon?.pieces || []).map(p => p.price);
  const total = prices.length && prices.every(p => p > 0) ? couponPrices(prices, []).total : null;
  // Their own code, not used yet, and what it gives: never less than that.
  const hasCode = !!coupon?.code && !coupon.used;
  const gives = sizesOf(hasCode ? coupon.sizes : null, shopPercent);
  const now = couponPrices(prices, gives);
  const opens = choose && total !== null && now.size.dollars !== undefined && now.off >= 1
    ? { box: "dollars", text: plain(now.off) }
    : { box: "percent", text: String((total !== null && now.size.percent) || Math.max(0, ...gives.map(s => s.percent || 0)) || shopPercent) };

  const { box, text } = typed || opens;
  const asked = typedSize({ [box]: text }, total);
  // As it opens, a % that isn't whole (Settings can hold 12.5) is sent as it is: it is what their
  // code gives. Typed, only whole numbers count.
  const asIs = !typed && !asked.size ? ownSizes({ percent: Number(text) })[0] : undefined;
  const size = asked.size || asIs || null;
  const cut = size && total !== null ? couponPrices(prices, [size]) : null;
  const more = choose && hasCode && asked.size ? lessThanNow(size, prices, gives) : "";
  const choice = !choose || asIs ? {} : !size || more ? null : size.percent !== undefined ? { percent: size.percent } : { dollars: size.dollars };

  // One plain line, when there is something to say.
  const line = !shop ? "One moment…"
    : shop.failed ? `The amount can't be chosen right now, so it goes at ${shopPercent}%.`
    : !choose ? `Choosing the amount waits for one database change. Until then it goes at ${shopPercent}%.`
    : !size ? asked.why
    : more ? `Their coupon already gives ${more}, so it can't be less.`
    : total === null ? "There's no price to go by here, so only the % works." : "";

  const field = (name, value, off) => (
    <input type="text" inputMode="numeric" autoComplete="off" maxLength={9} value={value} disabled={off}
      onFocus={e => e.target.select()} onChange={e => setTyped({ box: name, text: e.target.value })} />
  );
  return (
    <div className="o-coupon-ask">
      <p className="o-coupon-q">Email {to} a coupon, with their pieces?</p>
      <div className="o-coupon-row">
        <div className="o-coupon-boxes">
          <label className={`o-coupon-box${box === "percent" ? " is-on" : ""}${choose ? "" : " is-off"}`}>
            {field("percent", box === "percent" ? text : cut ? String(Math.round(cut.off / total * 1000) / 10) : "", !choose)}
            <span>% off</span>
          </label>
          <label className={`o-coupon-box${box === "dollars" ? " is-on" : ""}${choose && total !== null ? "" : " is-off"}`}>
            <span>$</span>
            {field("dollars", box === "dollars" ? text : cut ? plain(cut.off) : "", !choose || total === null)}
            <span>off</span>
          </label>
        </div>
        {cut && <p className="o-coupon-becomes"><span className="o-coupon-was">{moneyWords(total)}</span> <span className="o-coupon-to" role="img" aria-label="becomes">→</span> {moneyWords(cut.total)}</p>}
      </div>
      {line && <p className="o-coupon-line" role="status">{line}</p>}
      <div className="mark-paid-ask">
        <button className="tap o-btn o-btn-ink" onClick={() => onSend(choice)} disabled={!shop || !choice}>Send</button>
        <button className="tap mark-paid-no" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
