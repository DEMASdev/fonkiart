// How much a coupon code takes off (src/lib/couponSize.js): the shop's %, or a size of its own that
// Andy chose when he sent it (Andy, 2026-11-22: "maybe we can discount $300 or something if we know the
// acquisition power of the person !!"). The sums, the words and the rules for choosing one, used by the
// site, Admin and the server. What each of those does with them: tests/couponSend.test.js and
// tests/checkout-flow.test.js.
// Every test here fails on 94ef250, which has no such file, except the one marked "control". (splitOff's
// sums came from the Klarna offer's, which went out with it; they are tested here as they were there.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");
// Loaded if it is there, so the shop before this change fails each test by name, not the whole file.
const load = async (p) => (existsSync(new URL(p, root)) ? import(new URL(p, root).href) : {});
const { splitOff, couponPrices, ownSizes, sizesOf, addSize, sizeWords, appliedWords, sizesWords, isSizeWords, moneyWords, typedSize, lessThanNow } = await load("src/lib/couponSize.js");
const { COUPON_RE, ENDING_RE } = await load("api/_lib/cartCheckout.js");
const c = (dollars) => Math.round(dollars * 100);
const sum = (list) => list.reduce((a, b) => a + c(b), 0) / 100;
const THREE_HUNDRED = { dollars: 300, of: 950 };

// ── what it takes off ───────────────────────────────────────────

test("splitOff: across the pieces in proportion, adding up to the exact cent: whole dollars when it can be, a piece never left at $0", () => {
  assert.deepEqual(splitOff(20000, [200000, 100000]), [13300, 6700], "$2,000 + $1,000, $200 off: $133 + $67");
  assert.deepEqual(splitOff(20000, [200050, 100000]), [13334, 6666], "a piece with cents: split to the cent");
  assert.deepEqual(splitOff(30000, [100000, 100000, 100000]), [10000, 10000, 10000]);
  assert.deepEqual(splitOff(20000, [300000, 4500]), [19700, 300], "a small print beside a big piece");
  assert.equal(splitOff(900, [1, 999]), null, "a share that would leave a piece at $0");
  assert.equal(splitOff(1000, [500, 500]), null, "the whole order off");
  for (const bad of [[0, [100]], [-5, [100]], [1.5, [100]], [100, []], [100, [0, 500]], [100, [12.5]], [100, "x"]]) assert.equal(splitOff(...bad), null, JSON.stringify(bad));
  for (let n = 1; n <= 400; n++) {
    const amounts = [c(97 + (n * 37) % 2900), c(5 + (n * 13) % 400), ...(n % 3 ? [] : [c(45 + n)]), ...(n % 7 ? [] : [7 + n])];
    const total = amounts.reduce((a, b) => a + b, 0);
    for (const off of [1000, 2000, 7300, 29500, 1234]) {
      if (off >= total) continue;
      const split = splitOff(off, amounts);
      if (!split) continue;
      assert.equal(split.reduce((a, b) => a + b, 0), off, `${amounts} less ${off}: the shares add up exactly`);
      split.forEach((s, i) => assert.ok(s >= 0 && s < amounts[i] && Math.abs(s - off * amounts[i] / total) < (off % 100 || amounts.some(a => a % 100) ? 1 : 100), `${amounts} less ${off}: share ${i} in proportion`));
    }
  }
});

test("$300 made for $950: $650 on that piece; on three pieces $300 in all, the shares adding up; on a $350 piece its share, $111; and never more than $300", () => {
  assert.deepEqual(couponPrices([950], [THREE_HUNDRED]), { amounts: [650], total: 650, off: 300, size: THREE_HUNDRED });
  const three = couponPrices([950, 778, 648], [THREE_HUNDRED]);
  assert.deepEqual(three, { amounts: [830, 680, 566], total: 2076, off: 300, size: THREE_HUNDRED });
  assert.equal(sum(three.amounts), 2076);
  assert.deepEqual(couponPrices([350], [THREE_HUNDRED]), { amounts: [239], total: 239, off: 111, size: THREE_HUNDRED }, "never more than the same share");
  for (const prices of [[5000], [9000, 12000, 40], [950, 950, 950, 950]]) assert.equal(couponPrices(prices, [THREE_HUNDRED]).off, 300, "however many pieces are added");
  // Every cart: whole dollars off, exactly what the total says, at most $300 and at most the share.
  for (let n = 1; n <= 500; n++) {
    const prices = [20 + (n * 53) % 1900, ...(n % 2 ? [15 + (n * 7) % 300] : []), ...(n % 5 ? [] : [99.99 + n])];
    const { amounts, total, off } = couponPrices(prices, [THREE_HUNDRED]);
    const worth = sum(prices);
    assert.equal(sum(amounts), total, `${prices}: the pieces add up to the total`);
    assert.equal(c(worth) - c(total), c(off), `${prices}: the total is the prices less what is off`);
    assert.equal(off, Math.min(300, Math.round(worth * 300 / 950)), `${prices}: $300, or the share, in whole dollars`);
    amounts.forEach((a, i) => assert.ok(a > 0 && a <= prices[i], `${prices}: a piece is never at $0, nor dearer`));
  }
});

test("20% off: every piece rounded to whole dollars on its own, to the dollar what the checkout has always given", () => {
  assert.deepEqual(couponPrices([950], [{ percent: 20 }]), { amounts: [760], total: 760, off: 190, size: { percent: 20 } });
  // 94ef250's own sum, word for word (api/_lib/cartCheckout.js priceCart).
  const before = (price, discount) => { const pct = Number(discount); const off = Number.isFinite(pct) && pct > 0 && pct < 100 ? pct : 0; return off ? Math.round(price * (1 - off / 100)) : price; };
  let compared = 0;
  for (const percent of [0, 1, 5, 10, 12.5, 15, 20, 25, 33, 50, 75, 99, 100, 150, -5, "15", null, undefined, NaN]) {
    for (const price of [1, 7, 9.5, 10, 45, 49.99, 99, 120, 300, 350, 361.25, 500, 648, 778, 950, 1111, 2350, 18000]) {
      const { amounts, total, off } = couponPrices([price, 120], [{ percent }]);
      assert.deepEqual(amounts, [before(price, percent), before(120, percent)], `${percent}% off ${price}`);
      assert.equal(total, sum(amounts));
      assert.equal(c(off), c(price) + 12000 - c(total));
      compared++;
    }
  }
  assert.equal(compared, 19 * 18, "the whole table");
  assert.equal(before(1111, 15), 944, "control: the sum copied here is the one the checkout shows");
});

test("a code gives its BEST size for the cart: $300 on the piece it was made for, their older 15% when that is more", () => {
  const both = [{ percent: 15 }, THREE_HUNDRED];
  assert.deepEqual([couponPrices([950], both).off, couponPrices([950], both).size], [300, THREE_HUNDRED]);
  const three = couponPrices([950, 778, 648], both);
  assert.deepEqual([three.size, three.total, three.amounts], [{ percent: 15 }, 2020, [808, 661, 551]], "15% of 2,376 is more than $300");
  // Never worse, on any cart, than what the code gave before.
  for (let n = 1; n <= 300; n++) {
    const prices = [30 + (n * 61) % 2400, ...(n % 3 ? [40 + (n * 11) % 700] : [])];
    const best = couponPrices(prices, both).off;
    for (const size of both) assert.ok(best >= couponPrices(prices, [size]).off, `${prices}: at least what ${JSON.stringify(size)} gives`);
  }
  // A tie goes to the later one: the one just sent, whose words the email said.
  assert.deepEqual(couponPrices([2000], [{ percent: 15 }, { dollars: 300, of: 2000 }]).size, { dollars: 300, of: 2000 });
  assert.deepEqual(couponPrices([2000], [{ dollars: 300, of: 2000 }, { percent: 15 }]).size, { percent: 15 });
});

test("a piece with no price stays at 0 and takes no share; no coupon, the prices as they are; cents are kept; a tiny cart is never left at $0", () => {
  assert.deepEqual(couponPrices([950, null, 0], [THREE_HUNDRED]).amounts, [650, 0, 0]);
  assert.deepEqual(couponPrices([950, undefined, "abc", -5], [{ percent: 20 }]).amounts, [760, 0, 0, 0]);
  assert.deepEqual(couponPrices(["950"], [{ percent: 20 }]).amounts, [760], "a price kept as text");
  assert.deepEqual(couponPrices([99.99, 0.02], []), { amounts: [99.99, 0.02], total: 100.01, off: 0, size: null }, "none");
  assert.deepEqual(couponPrices([99.99], null), { amounts: [99.99], total: 99.99, off: 0, size: null });
  assert.deepEqual(couponPrices([], [THREE_HUNDRED]), { amounts: [], total: 0, off: 0, size: THREE_HUNDRED });
  assert.deepEqual(couponPrices([1000.5], [{ dollars: 300, of: 1000.5 }]).amounts, [700.5]);
  for (const [prices, size] of [[[1], THREE_HUNDRED], [[2], { dollars: 900, of: 901 }], [[1, 1], { dollars: 900, of: 901 }], [[0.5], { dollars: 900, of: 901 }], [[500, 500], { dollars: 999, of: 1000 }]]) {
    const { amounts, off, total } = couponPrices(prices, [size]);
    assert.ok(amounts.every(a => a > 0), `${prices} with ${JSON.stringify(size)}: ${amounts}`);
    assert.equal(c(sum(prices)) - c(total), c(off));
  }
});

// ── the list on their Leads row ─────────────────────────────────

test("what a code gives: its own sizes when they are real ones, else the shop's %", () => {
  assert.deepEqual(sizesOf([{ percent: 20 }], 15), [{ percent: 20 }]);
  assert.deepEqual(sizesOf([{ percent: 15 }, THREE_HUNDRED], 10), [{ percent: 15 }, THREE_HUNDRED]);
  assert.deepEqual(sizesOf(THREE_HUNDRED, 15), [THREE_HUNDRED], "one size alone, not in a list");
  for (const none of [null, undefined, [], {}, "20", 20, [{ percent: 0 }], [{ percent: 100 }], [{ percent: "20" }], [{ dollars: 300 }], [{ dollars: 300, of: 300 }], [{ dollars: 0, of: 950 }],
    [{ dollars: 299.5, of: 950 }], [{ dollars: -300, of: 950 }], [{ dollars: 300, of: Infinity }], [{ percent: 20, dollars: 300, of: 950 }], [null, 7, "x"]]) {
    assert.deepEqual(sizesOf(none, 15), [{ percent: 15 }], JSON.stringify(none));
    assert.deepEqual(ownSizes(none), [], JSON.stringify(none));
  }
  assert.deepEqual(ownSizes([{ percent: 100 }, THREE_HUNDRED, "x"]), [THREE_HUNDRED], "only the real ones of a list");
  assert.deepEqual(ownSizes([{ ...THREE_HUNDRED, extra: "x" }]), [THREE_HUNDRED], "and nothing else they carry");
});

test("sending one more size never makes the code worse: the list keeps what it gave and adds the new one; the largest % only, an exact repeat once", () => {
  assert.deepEqual(addSize([], THREE_HUNDRED), [THREE_HUNDRED], "a new code: just the new one");
  assert.deepEqual(addSize([{ percent: 15 }], THREE_HUNDRED), [{ percent: 15 }, THREE_HUNDRED], "an older 15% stays");
  assert.deepEqual(addSize([{ percent: 15 }], { percent: 20 }), [{ percent: 20 }]);
  assert.deepEqual(addSize([{ percent: 20 }, THREE_HUNDRED], { percent: 10 }), [{ percent: 20 }, THREE_HUNDRED], "a smaller % adds nothing");
  assert.deepEqual(addSize([{ percent: 15 }, THREE_HUNDRED], { percent: 40 }), [THREE_HUNDRED, { percent: 40 }]);
  assert.deepEqual(addSize([{ percent: 15 }, THREE_HUNDRED], { dollars: 300, of: 950 }), [{ percent: 15 }, THREE_HUNDRED], "the same again: once");
  assert.deepEqual(addSize([THREE_HUNDRED, { percent: 15 }], { dollars: 300, of: 950 }), [{ percent: 15 }, THREE_HUNDRED], "...and last");
  assert.deepEqual(addSize([THREE_HUNDRED], { dollars: 300, of: 2000 }), [THREE_HUNDRED, { dollars: 300, of: 2000 }], "made for other pieces: another size");
  assert.deepEqual(addSize([{ percent: 15 }], { percent: 15 }), [{ percent: 15 }]);
});

// ── in words ────────────────────────────────────────────────────

test("in words: \"20% off\", \"$300 off\", \"$1,200 coupon applied\"; dollars say what came off THIS cart", () => {
  assert.equal(sizeWords({ percent: 20 }), "20% off");
  assert.equal(sizeWords({ percent: 12.5 }, 42), "12.5% off", "a % says itself");
  assert.equal(sizeWords(THREE_HUNDRED, 300), "$300 off");
  assert.equal(sizeWords(THREE_HUNDRED, 111), "$111 off");
  assert.equal(sizeWords(THREE_HUNDRED), "$300 off", "not known: the size's own");
  assert.equal(sizeWords({ dollars: 1200, of: 4000 }, 1200), "$1,200 off");
  assert.equal(appliedWords({ percent: 20 }), "20% coupon applied");
  assert.equal(appliedWords({ dollars: 1200, of: 4000 }, 1200), "$1,200 coupon applied");
  assert.equal(appliedWords(THREE_HUNDRED, 111), "$111 coupon applied");
  assert.equal(sizesWords([THREE_HUNDRED]), "$300 off");
  assert.equal(sizesWords([{ percent: 15 }, THREE_HUNDRED]), "15% off or $300 off");
  assert.equal(sizesWords([{ percent: 15 }, THREE_HUNDRED], { upTo: true }), "15% off or up to $300 off");
  assert.equal(sizesWords([]), "");
  assert.deepEqual([300, 1200, 7.99, 14.5, 1234567].map(n => moneyWords(n)), ["$300", "$1,200", "$7.99", "$14.50", "$1,234,567"]);
  for (const words of ["20% off", "12.5% off", "$300 off", "$1,200 off", "$0 off", "$1,234,567 off"]) assert.equal(isSizeWords(words), true, words);
  for (const words of ["", "off", "20 off", "$1200 off", "$12,00 off", "$012 off", "100% off", "€300 off", "$300 off.", " $300 off", "<b>$300 off</b>", null, 300, {}]) assert.equal(isSizeWords(words), false, String(words));
});

test("an order's notes: the shop reads back the words it writes, and nothing else", () => {
  const CARD = " · Paying by card";
  for (const said of ["1% coupon applied", "15% coupon applied", "12.5% coupon applied", "$300 coupon applied", "$1,200 coupon applied", "$1,234,567 coupon applied", "$0 coupon applied"]) {
    assert.equal(COUPON_RE.exec(`Order Ref: FA-1752 · Jane Smith · ${said}${CARD}`)?.[1], said, said);
    for (const ending of [` · ${said}`, ` · ${said}${CARD}`, ` · ${said} · Paying by Zelle`, ` · ${said} · Paying by Cash App`]) assert.equal(ENDING_RE.test(ending), true, ending);
    assert.equal(ENDING_RE.exec(` · ${said}${CARD}`)[1], ` · ${said}`);
  }
  for (const ending of ["", CARD, " · Paying by Venmo"]) assert.equal(ENDING_RE.test(ending), true, `no coupon: "${ending}"`);
  for (const other of ["$1200 coupon applied", "$12,00 coupon applied", "$1,2000 coupon applied", "$012 coupon applied", "100% coupon applied", "15.% coupon applied", "€300 coupon applied", "300 coupon applied",
    "$300.50 coupon applied", "$ 300 coupon applied", "-$300 coupon applied", "$300 off", "15% off", "coupon applied", "$300 Coupon applied", "$300 coupon"]) {
    assert.equal(ENDING_RE.test(` · ${other}${CARD}`), false, `an ending the shop never wrote: ${other}`);
    assert.equal(COUPON_RE.exec(`Order Ref: FA-1752 · Jane Smith · ${other}${CARD}`), null, other);
  }
  assert.equal(ENDING_RE.test(` · $300 coupon applied · gift wrap, please${CARD}`), false, "words the shop added by hand are never written over");
  assert.equal(COUPON_RE.exec("Order Ref: FA-1752 · $300 coupon appliedly"), null);
  // Every size's words, as they are written, are read back.
  for (let n = 1; n <= 4000; n += 7) {
    const words = appliedWords({ dollars: n, of: 5000 }, n);
    assert.equal(COUPON_RE.exec(` · ${words}`)?.[1], words, words);
    assert.equal(ENDING_RE.test(` · ${words}`), true, words);
  }
});

// ── choosing one ────────────────────────────────────────────────

test("choosing: whole numbers only, a % from 1 to 99, or dollars from 1 up to the pieces' total less 1; one or the other", () => {
  assert.deepEqual(typedSize({ percent: "20" }, 950), { size: { percent: 20 } });
  assert.deepEqual(typedSize({ percent: 99 }, null), { size: { percent: 99 } }, "a % needs no price");
  assert.deepEqual(typedSize({ dollars: "300" }, 950), { size: { dollars: 300, of: 950 } });
  assert.deepEqual(typedSize({ dollars: " $1,200 " }, 4000), { size: { dollars: 1200, of: 4000 } }, "as a person types it");
  assert.deepEqual(typedSize({ percent: "20%" }, 950), { size: { percent: 20 } });
  assert.deepEqual(typedSize({ dollars: 949 }, 950), { size: { dollars: 949, of: 950 } }, "the most");
  assert.deepEqual(typedSize({ dollars: 1 }, 950), { size: { dollars: 1, of: 950 } }, "the least");
  for (const percent of ["", " ", "0", "100", "-5", "12.5", "abc", "1e1", "2 0", 0, 100, 12.5, NaN, Infinity, true, {}, []]) {
    assert.deepEqual(typedSize({ percent }, 950), { why: "Type a number from 1 to 99." }, `percent ${JSON.stringify(percent)}`);
  }
  for (const dollars of ["", "0", "950", "951", "-5", "299.50", "1,20", "abc", 0, 950, 1e9, true, {}]) {
    assert.deepEqual(typedSize({ dollars }, 950), { why: "Type a number from 1 to 949." }, `dollars ${JSON.stringify(dollars)}`);
  }
  assert.deepEqual(typedSize({ dollars: "9999" }, 2376), { why: "Type a number from 1 to 2,375." });
  for (const total of [null, undefined, 0, 1, NaN]) assert.deepEqual(typedSize({ dollars: "300" }, total), { why: "One of these pieces has no price, so type a % instead." }, String(total));
  assert.deepEqual(typedSize({ percent: 20, dollars: 300 }, 950), { why: "Type a % or a $ amount, not both." });
  assert.deepEqual(typedSize({}, 950), { why: "Type a number from 1 to 99." });
  assert.deepEqual(typedSize(undefined, 950), { why: "Type a number from 1 to 99." });
});

test("never less than what their code already gives on these pieces", () => {
  const now = [{ percent: 15 }];
  assert.equal(lessThanNow({ percent: 10 }, [950], now), "15% ($142 off)", "15% of 950 rounds to 808, which is $142 off");
  assert.equal(lessThanNow({ dollars: 141, of: 950 }, [950], now), "15% ($142 off)");
  assert.equal(lessThanNow({ dollars: 142, of: 950 }, [950], now), "", "the same is not less");
  assert.equal(lessThanNow({ percent: 15 }, [950], now), "");
  assert.equal(lessThanNow({ percent: 20 }, [950], now), "");
  assert.equal(lessThanNow({ percent: 20 }, [950], [{ percent: 15 }, THREE_HUNDRED]), "$300 off");
  assert.equal(lessThanNow({ percent: 32 }, [950], [THREE_HUNDRED]), "", "$304");
  assert.equal(lessThanNow({ dollars: 1200, of: 9000 }, [9000], [{ percent: 15 }]), "15% ($1,350 off)");
  // No price to go by: two percents as they are.
  assert.equal(lessThanNow({ percent: 10 }, [null], now), "15%");
  assert.equal(lessThanNow({ percent: 15 }, [], now), "");
});

// ── one file, everywhere ────────────────────────────────────────

test("the site, Admin and the server use this one file, which imports nothing", () => {
  assert.equal(existsSync(new URL("src/lib/couponSize.js", root)), true);
  assert.doesNotMatch(read("src/lib/couponSize.js"), /^\s*import\b|\brequire\(|\bimport\(/m);
  for (const f of ["api/_lib/storeOps.js", "api/_lib/cartCheckout.js", "api/_lib/unfinishedCoupon.js"]) assert.match(read(f), /from "\.\.\/\.\.\/src\/lib\/couponSize\.js";/, f);
  for (const f of ["src/components/CheckoutModal.jsx", "src/components/WelcomeModal.jsx", "src/admin/CouponAsk.jsx", "src/admin/LeadsTab.jsx"]) assert.match(read(f), /from "\.\.\/lib\/couponSize";/, f);
  // No second copy of the sums: nothing else in the shop takes a % off a price.
  for (const f of ["api/_lib/cartCheckout.js", "api/_lib/storeOps.js", "src/components/CheckoutModal.jsx"]) assert.doesNotMatch(read(f), /1 - \w+ \/ 100/, f);
  assert.match("Math.round(price * (1 - off / 100))", /1 - \w+ \/ 100/, "control: a second copy would be seen");
});

test("the one database change: one empty column, safe to run twice, with nothing taken away", () => {
  const sql = read("db/2026-11-23-coupon-size.sql");
  const statements = sql.split("\n").filter(l => l.trim() && !l.startsWith("--"));
  assert.deepEqual(statements, ['alter table public."Leads" add column if not exists coupon_size jsonb;']);
  assert.doesNotMatch(sql, /\b(drop|delete|update|truncate|not null|default)\b/i);
});

test("control: the shop's % is still read from Settings, 15 when there is none", () => {
  assert.match(read("api/_lib/storeOps.js"), /return data\?\.couponDiscount \?\? 15;/);
});
