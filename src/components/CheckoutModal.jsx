import { useState, useEffect, useEffectEvent, useLayoutEffect, useRef } from "react";
import { BREVO_SENDER } from "../lib/supabase";
import { storeCall } from "../lib/store";
import { stripeJsReady } from "../lib/stripeJs";
import { readCardOrder, saveCardOrder, dropCardOrder, matchesCart, cardOrderBody, CARD_FORM_DOWN } from "../lib/cartOrder";
import { payTries } from "../lib/payTries";
import { holdBack } from "../lib/backInside";
import CardCheckout from "./CardCheckout";
import WayBack from "./WayBack";
import PaidThanks from "./PaidThanks";
import PayRows from "./PayRows";
import Pic from "./Pic";
import { payRows, stripeRows, isStripe, serverWays } from "../lib/payWays";

// The card order this cart was paying is gone from the shop (cancelled, or handled by hand): the
// checkout starts over, with the details still filled in.
const GONE = "This checkout had to start over. Your details are still filled in: please check them and tap Continue again.";
// The card payment didn't open, for a reason the buyer can't act on: try again, or pay another way.
const CARD_DIDNT_OPEN = "The card payment couldn't open right now. Please try again in a moment, or choose another way to pay.";

// onSuccess: an order placed to be paid by Zelle, Venmo or Cash App (the Cart page empties the
// cart then). onPaid(titles): a card payment is in (the Cart page empties those pieces). Card
// payments go through the server and Stripe (api/_lib/cartCheckout.js): ONE order per cart,
// however the buyer retries, and the card form opens inside fonkiart.com or not at all.
export default function CheckoutModal({ items, settings, onClose, onSuccess, onPaid, fullPage }) {
  const venmoHandle   = settings.venmoHandle   || "@fonkiart";
  const cashAppHandle = settings.cashAppHandle || "$fonkiart";
  const [method, setMethod] = useState(null);
  const [step, setStep] = useState(1);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  // The card order this cart already saved and hasn't finished paying (src/lib/cartOrder.js).
  // With one, the checkout pays THAT order, by card again or another way, and saves no other.
  // The buyer never hears of it as "saved", nor its number, before paying (Andy, 2026-11-19, yes
  // to: "there's no 'saved' message and no order number until they pay, or tap 'I've Sent the
  // Payment' for Zelle, Venmo or Cash App. When they come back, the checkout looks normal, with
  // their name and address already filled in"): the details as they typed them, and the coupon
  // the server took for it, applied. The number shows on the thank-you.
  const [saved, setSaved] = useState(() => { const order = readCardOrder(); return matchesCart(order, items) ? order : null; });
  // The same, for a try to pay to read once the server has answered: another try may have saved the
  // order since that one was tapped. keep sets both.
  const savedNow = useRef(saved);
  const keep = (order) => { savedNow.current = order; setSaved(order); };
  const blank = { firstName:"", lastName:"", email:"", phone:"", address:"", city:"", state:"", zip:"", country:"" };
  const [customer, setCustomer] = useState(() => saved ? { ...blank, email: saved.email, ...saved.customer } : blank);
  const [couponCode, setCouponCode] = useState(() => saved?.coupon || "");
  const [couponStatus, setCouponStatus] = useState(() => saved?.coupon ? "valid" : null);
  const [checkoutError, setCheckoutError] = useState("");
  const [orderRef, setOrderRef] = useState("");
  const [savedAtOpen] = useState(() => saved && cardOrderBody(saved, items));
  const [checked, setChecked] = useState(!savedAtOpen); // the server has said what became of it
  const [pay, setPay] = useState(null);                // the card form, open inside the page
  const [paidView, setPaidView] = useState(null);      // the card payment is in
  const [cardCheck, setCardCheck] = useState(null);    // paid in the card form: "checking" · "unpaid" · "error"
  const [calm, setCalm] = useState("");                // the card form didn't open: said calmly, with Try Again
  // Klarna or a bank payment, chosen, that Stripe won't open for this order (its amount, or the way
  // not switched on): the server's one line (api/_lib/stripe.js wayRefused), shown on the ways to
  // pay, with that way no longer chosen and no Try Again.
  const [refused, setRefused] = useState("");
  // The ways Stripe's form can open right now, as the server says (op "card-setup", src/lib/payWays.js);
  // null until it says, or when it says nothing (an older server): then cards and Klarna.
  const [ways, setWays] = useState(null);
  const box = useRef(null);                            // the checkout's own box (a pop-up scrolls in it)
  const stepsBox = useRef(null);                       // the steps' column (its height is measured)
  const [stepsH, setStepsH] = useState(0);
  const wallBox = useRef(null);                        // the art's column (measured too: a phone keeps it in view)
  const [wallH, setWallH] = useState(0);
  // One try to pay at a time, from the tap until the server has answered, so a double tap counts
  // once and two card calls never race (each would close the page before and open its own, leaving
  // one open that nobody pays). The buyer can leave one on its way and choose another way to pay
  // (src/lib/payTries.js): the next try then waits for it, and pays the order it made.
  const [tries] = useState(payTries);
  const over = useRef(false); // paid, or the order placed: a try still on its way has nothing left to do
  // The checkout is gone (✕, or the page moved on) while a card attempt is still on its way:
  // Stripe.js can take up to 15 s to load, and a buyer may walk away first. Then nothing more is
  // asked of the server, and no card form opens in a checkout that is closed.
  const closed = useRef(false);
  useEffect(() => { closed.current = false; return () => { closed.current = true; }; }, []);

  // Predict the next sequential order number (Orders.id is auto-incrementing).
  useEffect(() => {
    storeCall("next-ref").then(r => setOrderRef(r.ref)).catch(e => console.warn("Order ref:", e));
  }, []);
  // Which of Stripe's ways the server can open right now: a row shows only for a way it can open.
  // A way already chosen that it can't open is un-chosen (it says so long before step 2).
  useEffect(() => {
    let gone = false;
    storeCall("card-setup").then((r) => {
      const can = serverWays(r);
      if (gone || !can) return;
      setWays(can);
      setMethod(m => isStripe(m) && !stripeRows(can).some(row => row.id === m) ? null : m);
    }).catch(e => console.warn("Card setup:", e));
    return () => { gone = true; };
  }, []);

  const cv = (k,v) => setCustomer(fm=>({...fm,[k]:v}));
  const fullName = `${customer.firstName} ${customer.lastName}`.trim();
  const discount = settings.couponDiscount ?? 15;
  const itemPrice = (i) => Number(i.salePrice || i.price || 0);
  const itemEffective = (i) => couponStatus === "valid" ? Math.round(itemPrice(i) * (1 - discount / 100)) : itemPrice(i);
  const basePrice = items.reduce((sum,i) => sum + itemPrice(i), 0);
  const effectivePrice = couponStatus === "valid" ? Math.round(basePrice * (1 - discount / 100)) : basePrice;
  const itemsLabel = items.length === 1 ? items[0].title : `${items.length} items`;
  // A saved order shows the amounts the server gave it; its reference shows on the thank-you only.
  const savedAmount = (i) => saved?.lines.find(l => String(l.title).trim() === String(i.title).trim())?.amount;
  const shownAmount = (i) => (saved ? savedAmount(i) : undefined) ?? itemEffective(i);
  const amountDue = saved ? saved.total : effectivePrice;
  const refShown = saved ? saved.ref : orderRef;
  // Step 1 (where to send it) is done with a name and an email; step 2 (how to pay) with a way to
  // pay, once the server has said what became of a saved order.
  const detailsOk = fullName && customer.email.includes("@");
  const canNext = method && checked && detailsOk;
  const money = (n) => `$${Number(n).toLocaleString()}`;
  const couponOn = couponStatus === "valid"; // this checkout's coupon, or the saved order's own (kept)
  const couponKept = !!saved?.coupon; // the saved order's own coupon: applied, and it stays
  // Zelle, Venmo, Cash App: what the buyer writes in the payment's memo or note, so Fonkiart can
  // match it (the order's number shows once they tap "I've Sent the Payment").
  const memo = items.length === 1 ? items[0].title : `${items[0]?.title} + ${items.length - 1} more`;

  // The steps ask one thing each: 1, where to send it; 2, how to pay; 3, the payment.
  const detailsMissing = () => !fullName ? "Please enter your first and last name."
    : !customer.email.includes("@") ? "Please enter a valid email address." : "";
  const continueDetails = () => {
    const missing = detailsMissing();
    setCheckoutError(missing);
    if (!missing) setStep(2);
  };
  const handleContinue = () => {
    if (saved && !checked) return; // a moment: the server is saying what became of the saved order
    if (!method) { setCheckoutError("Please select a payment method."); return; }
    const missing = detailsMissing();
    if (missing) { setCheckoutError(missing); setStep(1); return; }
    setCheckoutError(""); setRefused("");
    setStep(3);
    // Card, Klarna or a bank transfer: Stripe's form opens at once, with no page in between (Andy:
    // "jumps into another useless page ... instead of just going into the CC page"). The buyer sees
    // "Opening the secure card form…" (or "payment form…"), then the form.
    if (isStripe(method)) startCard();
  };

  const applyCoupon = async () => {
    const code = couponCode.trim().toUpperCase();
    if (!code) return;
    if (!customer.email || !customer.email.includes("@")) { setCouponStatus("need-email"); return; }
    setCouponStatus("checking");
    try {
      const { status } = await storeCall("coupon", { code, email: customer.email });
      // A card payment already started for this cart: its price is the server's, set then, and
      // a coupon can't change it now. Said plainly, and nothing is taken off. (savedNow: it may have
      // been saved while the coupon was asked about.)
      setCouponStatus(savedNow.current && status === "valid" ? "too-late" : status);
    } catch { setCouponStatus("invalid"); }
  };

  // The order as the checkout sends it. For a card payment the server prices every piece itself.
  const orderPayload = () => ({
    customer,
    orderRef,
    total: effectivePrice,
    couponCode: couponStatus === "valid" ? couponCode.trim().toUpperCase() : "",
    items: items.map(i => ({ title: i.title, amount: itemEffective(i) })),
  });

  // The server saves the order, marks the coupon used and sends both emails.
  // Returns false if it could not be reached.
  const saveOrder = async () => {
    try {
      await storeCall("order", orderPayload());
      return true;
    } catch (e) {
      console.warn("Order:", e);
      return false;
    }
  };

  // Before the server is asked to pay the saved order (by card again, or another way), the details
  // as typed now are kept with it: should the answer never arrive after a changed email reached the
  // order, the next try, or the checkout opened again, still finds THIS order by that email.
  const keepTyped = () => saveCardOrder({ ...savedNow.current, customer });
  // markSold intentionally removed — Andy marks sold manually in Admin after verifying payment received
  const finish = () => { over.current = true; setDone(true); onSuccess?.(); };
  // Zelle, Venmo, Cash App. A card order this cart already saved is the order: nothing is saved
  // again. The server closes its card page and only now sends its "order received" emails, once
  // (cart-other: a card order's emails wait until it is paid, api/_lib/cartCheckout.js), with the
  // details as they are on the screen now. If the card payment came through after all, that
  // thank-you shows instead.
  const confirmPaid = () => tries.start(async (mine) => {
    setSaving(true); setCheckoutError("");
    await tries.behind(); // a try the buyer left is still being answered: the order it makes is the one to pay
    if (mine.left || closed.current || over.current) return;
    mine.asked = true;
    const was = savedNow.current;
    try {
      if (!was) {
        if (await saveOrder()) finish();
        else if (!mine.left) setCheckoutError(`We couldn't save your order. Please email ${BREVO_SENDER || "us"} with your order number ${orderRef}.`);
        return;
      }
      const out = await storeCall("cart-other", { ...cardOrderBody(keepTyped(), items), customer, method });
      if (over.current) return; // paid, as the server said meanwhile
      if (out.paid) { paidNow(out); return; }
      dropCardOrder(); finish();
    } catch (e) {
      console.warn("Paying another way:", e);
      if (e.status === 404) {
        if (mine.left) { forget(); return; }
        startAfresh();
        setCheckoutError(GONE);
      } else if (mine.left) return; // gone back to choose another way: nothing more to say
      else if (e.status === 409 || e.status === 400) setCheckoutError(e.message);
      else setCheckoutError(`We couldn't record that just now. Your order ${was.ref} is saved: please try again in a moment, or email ${BREVO_SENDER || "us"} with your order number.`);
    }
  }, () => setSaving(false));
  const handleConfirmZelle   = confirmPaid;
  const handleConfirmVenmo   = confirmPaid;
  const handleConfirmCashApp = confirmPaid;

  // The card payment is in (or a bank payment made, still clearing: order.processing): the saved
  // order is done with, the thank-you shows, and the Cart page empties those pieces.
  const paidNow = (order) => {
    over.current = true;
    dropCardOrder();
    keep(null); setPay(null); setPaidView(order); setDone(true);
    onPaid?.(order.lines.map(l => l.title));
  };
  // The saved order is gone from the shop (cancelled, or handled by hand): forget it and start
  // afresh, the details still filled in. Its coupon is asked about again (Apply): it counted
  // for that order, and may not count for a new one.
  const forget = () => {
    dropCardOrder();
    if (savedNow.current?.coupon) setCouponStatus(null);
    keep(null);
  };
  const startAfresh = () => { forget(); setPay(null); setCalm(""); setStep(1); };
  // Klarna or a bank payment that Stripe won't open for this order: back to the ways to pay, with
  // the server's line, that way no longer chosen, and no Try Again (it would only be refused
  // again). An order already saved stays saved, so another way pays THAT order, never a second.
  const refuseWay = (line) => {
    setPay(null); setCalm("");
    setMethod(null); setRefused(line); setStep(2);
  };

  // Paying by card: Continue with Card, Klarna or a bank transfer chosen (and "Try Again" after a
  // calm word), each in Stripe's form; the server is told which (way). The card
  // form opens INSIDE fonkiart.com, or not at all: the buyer is
  // never sent to Stripe's own page (Andy, 2026-11-18: "i don't want to be making the user jump to
  // stripe then back , everything should and can happen in fonkiart.com seamlessly easily  and
  // intuitively"). So Stripe.js comes FIRST, before anything is saved: if it can't load (a
  // blocker, no network, 15 s gone: src/lib/stripeJs.js), nothing is saved or emailed, and a calm
  // word says so, with Try Again and another way to pay. The server refuses the same way, before
  // saving, whenever it can't offer the form (CARD_FORM_DOWN: no key, or a bad one).
  // ONE order per cart, however often it is tapped: a new order is saved (cart-card) only while
  // this cart has none waiting; after that every card attempt re-opens payment for that same order
  // (cart-again), naming the last payment page Stripe made for it. Card payments off: the server
  // says so and saves nothing. The cart is NOT emptied here, only once the payment is in: paid
  // in the form, the buyer stays right here (cardComplete).
  // The buyer can go back to the ways to pay at any moment (leavePayment). Gone back while Stripe.js
  // loads: nothing was asked of the server. While the server answers: the order it saves is kept all
  // the same, no form opens, and whichever way is chosen next pays THAT order (tries.behind()).
  const startCard = () => tries.start(async (mine) => {
    setSaving(true); setCheckoutError(""); setCalm("");
    let was = null; // the order already saved for this cart, as this try asks to pay it
    try {
      const ready = await stripeJsReady();
      // Gone back, or closed, while Stripe.js loaded: nothing saved, nothing sent.
      if (mine.left || closed.current || over.current) return;
      if (!ready) { setCalm(CARD_FORM_DOWN); return; }
      await tries.behind();
      if (mine.left || closed.current || over.current) return;
      mine.asked = true;
      was = savedNow.current;
      // Again: the details as they are on the screen now go with it, so the order's rows (and the
      // email on Stripe's page) follow a changed address or email; still the same order.
      const order = was
        ? await storeCall("cart-again", { ...cardOrderBody(keepTyped(), items), customer, embedded: true, way: method })
        : await storeCall("cart-card", { ...orderPayload(), embedded: true, way: method });
      if (over.current) return; // paid, as the server said meanwhile
      if (order.paid) { paidNow(order); return; }
      // Kept BEFORE the form opens, so the next attempt names this page. Kept even if the checkout
      // closed meanwhile, so opening it again pays THIS order, never a second one. With it, the
      // details as typed and the coupon the server took, for coming back to a filled-in checkout.
      const kept = saveCardOrder({
        ref: order.ref, ids: order.ids, email: was ? (order.email || was.email) : customer.email.trim(),
        lines: order.lines, total: order.total, session: order.session || was?.session,
        customer, coupon: was ? was.coupon : order.coupon,
      });
      if (closed.current) return; // no card form in a checkout that is gone
      keep(kept);
      // The coupon the server took is the one applied, whatever was typed since (the buyer gone back
      // meanwhile); one it didn't take (used elsewhere a moment ago) is not shown as applied.
      if (kept.coupon) { setCouponCode(kept.coupon); setCouponStatus("valid"); }
      else setCouponStatus(s => s === "valid" ? null : s);
      if (mine.left) return; // gone back to choose another way: no form opens
      if (order.clientSecret) { setPay(order); return; }
      // Saved, but Stripe won't open Klarna or a bank payment for it (cart-card's `refused`): kept
      // above all the same, so the next try is THIS order (cart-again, cart-other).
      if (order.refused) { refuseWay(order.cardError); return; }
      // Saved, but no card form to open (Stripe failed as the order was saved): the calm word, and
      // Try Again re-opens THAT order (cart-again). Whatever the answer, this tab never leaves.
      setCalm(order.cardError || CARD_FORM_DOWN);
    } catch (e) {
      console.warn("Card payment:", e);
      if (was && e.status === 404) {
        // The shop no longer has that order as it was saved: start afresh.
        if (mine.left) { forget(); return; }
        startAfresh();
        setCheckoutError(GONE);
      } else if (mine.left) return; // gone back to choose another way: nothing more to say
      else if (e.status === 409 && e.message === CARD_FORM_DOWN) {
        // The server can't offer the card form here: nothing was saved or sent.
        setCalm(e.message);
      } else if (e.status === 409 && method !== "card") {
        // Klarna or a bank payment, refused for the order already saved (cart-again answers a 409):
        // the same line, back on the ways to pay; nothing was saved again.
        refuseWay(e.message);
      } else if (e.status === 409 || e.status === 400) setCheckoutError(e.message);
      else if (e.status === 502 || was) {
        // The order is safe; only the card page didn't open.
        setCalm(e.status === 502 ? e.message : CARD_DIDNT_OPEN);
      } else setCheckoutError(CARD_DIDNT_OPEN); // no order number before paying (Andy, 2026-11-19)
    }
  }, () => setSaving(false));
  const handleCard = () => startCard();
  // Paid inside the card form, and the buyer never left fonkiart.com (Andy: "i don't want to be
  // making the user jump to stripe then back , everything should and can happen in fonkiart.com
  // seamlessly easily  and intuitively"). The server asks Stripe itself whether that page was
  // paid (cart-paid), exactly as for an order started on Stripe's own page before; paid, the
  // thank-you shows right here and those pieces leave the cart. Not yet, or out of reach: a calm
  // word and Check Again, and the saved order stands (opening the checkout again asks too).
  const cardComplete = (page) => tries.start(async () => { // Check Again tapped twice: once
    setCardCheck("checking"); setCalm(""); setCheckoutError("");
    try {
      const order = await storeCall("cart-paid", { ref: page.ref, session: page.session });
      // A bank payment made in the form, still clearing (processing): the same thank-you, saying
      // "Payment processing" (PaidThanks), and those pieces leave the cart: the shop holds them now.
      if (order.paid || order.processing === true) { paidNow(order); return; }
      setCardCheck("unpaid");
    } catch (e) {
      console.warn("Card check:", e);
      setCardCheck("error");
    }
  });
  // Stripe.js wouldn't open the form: the same calm word; Try Again re-opens this order's form.
  const cardFormFailed = () => { setPay(null); setCalm(CARD_FORM_DOWN); };
  // "Choose another way to pay" (WayBack.jsx): back to the ways to pay, from any way, at any moment
  // of the payment, also while the form is still opening (Andy, 2026-11-23: "make sure if the user
  // selects credit card or any other method , the user can go and select another"). An order already
  // saved stays saved, so whichever way is chosen next pays THAT order (cart-again, cart-other).
  const leavePayment = () => {
    tries.leave();
    setSaving(false); setPay(null); setCalm(""); setCheckoutError("");
    setStep(2);
  };
  // The browser's (or the phone's) own Back, one step at a time (src/lib/backInside.js): the payment,
  // the ways to pay, the details, then out to the cart. true: the checkout is still open after it.
  const stepBack = useEffectEvent(() => {
    if (!done && cardCheck === "checking") return true; // a moment: the payment is being confirmed
    if (!done && !cardCheck && step === 3) { leavePayment(); return true; }
    if (!done && !cardCheck && step === 2) { setCheckoutError(""); setStep(1); return true; }
    onClose();
    return false;
  });
  useEffect(() => holdBack(() => stepBack()), []);

  // Opening with a saved card order, the server is asked once what became of it ("cart-order"):
  // paid by now (paid, then the tab closed before coming back): the thank-you, and the cart
  // empties; still open: paid from here, by card again or another way; closed by the shop, or
  // unknown to it: forgotten, and the checkout starts afresh. Until it answers, Continue waits.
  // Out of reach: the saved order stands, and paying by card asks the server again anyway.
  const learned = useEffectEvent((order) => {
    setChecked(true);
    if (order === undefined) return;
    if (order?.state === "paid") { paidNow(order); return; }
    // Paid by bank, still clearing: the thank-you that says so, as when paid in the form.
    if (order?.state === "processing") { paidNow({ ...order, processing: true }); return; }
    if (order?.state === "open") {
      const kept = readCardOrder();
      if (kept && kept.ref === order.ref) keep(saveCardOrder({ ...kept, email: order.email || kept.email, lines: order.lines, total: order.total }));
      return;
    }
    startAfresh();
  });
  useEffect(() => {
    if (!savedAtOpen) return undefined;
    let gone = false;
    storeCall("cart-order", savedAtOpen)
      .then((order) => { if (!gone) learned(order); })
      .catch((e) => { console.warn("Saved order:", e); if (!gone) learned(e.status === 404 ? null : undefined); });
    return () => { gone = true; };
  }, [savedAtOpen]);

  // Done (paid by card, or an order placed with Zelle, Venmo or Cash App): the thank-you opens at
  // its top, as a new page does (App.jsx), not wherever the buyer had scrolled to reach the card
  // form's Pay button, or "I've Sent the Payment" below a long payment panel. Measured before,
  // the thank-you's top sat above the screen: paid at the bottom of the card form, 149px at 375
  // wide and 91px at 1280; placed with Zelle at 375, 151px.
  useLayoutEffect(() => { if (done && fullPage) window.scrollTo(0, 0); }, [done, fullPage]);
  // The checkout opens at its top, and so does each step: the art first, then the step's one
  // question (with Card, "Opening the secure card form…", then the form). Measured before, at
  // 375 wide the buyer was left down where Continue was, below a step now much shorter: only the
  // footer showed, and the opening word sat above the screen. The Cart's checkout is the page, so
  // the page goes to its top; a pop-up scrolls in its own box (and, on a phone, its backdrop), and
  // the page under it stays where it was.
  const shownStep = useRef(0);
  useLayoutEffect(() => {
    if (shownStep.current === step) return; // drawn again on the same step: stay where the buyer is
    shownStep.current = step;
    if (fullPage) { window.scrollTo(0, 0); return; }
    const el = box.current;
    if (el) { el.scrollTop = 0; if (el.parentElement) el.parentElement.scrollTop = 0; }
  }, [step, fullPage]);
  // On a computer the steps stay in view beside the art (src/index.css, "the steps' column"): under
  // the shop's bars while they fit the window; taller than the window, they scroll with the page
  // until their end (the button) is in view, then hold there, so they never hide their own button.
  // For that the CSS needs their height (--steps-h), measured here each time it changes. Until it
  // is measured (or with no ResizeObserver), the steps simply scroll with the page.
  useLayoutEffect(() => {
    const el = stepsBox.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const measure = () => setStepsH(el.offsetHeight);
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(el);
    return () => watch.disconnect();
  }, [done]);
  // On a phone the art sits beside the step and stays in view the same way (src/index.css, "A
  // phone"): under the shop's bars while it fits the screen; taller, it scrolls with the page until
  // its end is in view, then holds, so no piece is ever hidden (on the Cart's page, where the
  // phone's browser can clip the page without making it a box of its own: overflow clip). Its
  // height (--wall-h), measured here.
  useLayoutEffect(() => {
    const el = wallBox.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const measure = () => setWallH(el.offsetHeight);
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(el);
    return () => watch.disconnect();
  }, [done]);

  // Paid by card (in the card form, or found paid): the same thank-you as on the way back from
  // Stripe's own page, the pieces first, right where the form was.
  if (done && paidView) {
    const thanks = <PaidThanks view={paidView} artworks={items}
      action={<button type="button" className="tap confirm-btn pay-return-go" onClick={onClose}>{fullPage ? "Continue Shopping →" : "Close"}</button>} />;
    return fullPage ? <div className="inv-embed pay-return">{thanks}</div> : (
      <div className="modal-bg" onClick={onClose}>
        <div className="inv-embed pay-return pay-thanks-modal" onClick={e => e.stopPropagation()}>{thanks}</div>
      </div>
    );
  }

  if (done) return (
    <div className={fullPage ? "checkout-page-bg" : "modal-bg"} onClick={fullPage ? undefined : onClose}>
      <div className={`checkout checkout-buy${fullPage ? " checkout-fullpage" : ""}`} style={{ textAlign:"center" }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize:50, marginBottom:14 }}>🎨</div>
        <h2 style={{ marginBottom:10 }}>Thank you!</h2>
        <p style={{ color:"var(--muted)", fontSize:16, lineHeight:1.7, marginBottom:16 }}>
          Your order for <strong>{itemsLabel}</strong> has been received.<br />
          Fonkiart will confirm and reach out about shipping.
        </p>
        {refShown && (
          <div style={{ background:"var(--cream)", border:"1px solid var(--border)", padding:"12px 20px", marginBottom:24, display:"inline-block" }}>
            <div style={{ fontSize:16, letterSpacing:".14em", textTransform:"uppercase", color:"var(--muted)", marginBottom:4 }}>Order Reference</div>
            <div style={{ fontFamily:"monospace", fontSize:20, letterSpacing:".08em", color:"var(--ink)", fontWeight:600 }}>{refShown}</div>
            <div style={{ fontSize:16, color:"var(--muted)", marginTop:4 }}>Also in your confirmation email</div>
          </div>
        )}
        <button className="btn-p" style={{ width:"100%" }} onClick={onClose}>Close</button>
      </div>
    </div>
  );

  // The checkout as a gallery wall (Andy, 2026-11-21: "rethink that page if you haven't , make it
  // nicer simpler more intuitive and artsy without making the art the person is buying small and
  // 2nd page/hand"). The art being bought is the biggest thing on the screen at every step, framed
  // as it would hang, with its label under it: the title, what it is, and the price the buyer pays
  // (the saved order's, the server's, once there is one; else the shop's less a valid coupon). On
  // a computer it is the left half, in view while the steps scroll (several pieces stack, each
  // big); on a phone it is the left column beside the step (several pieces one above the other,
  // each whole), except beside Stripe's own form, where it comes first, full width, as on a tablet
  // (several pieces side by side, to swipe). The steps ask one thing each: where to send it, how to
  // pay, then the payment. The card form repeats no pictures (CardCheckout art={false}).
  // src/index.css ("The checkout as a gallery wall") draws it; tests/checkout-layout.test.js holds it.
  const pieceOff = (i) => couponOn && itemPrice(i) !== itemEffective(i);
  const many = items.length > 1;
  const wall = (
    <section ref={wallBox} className={`checkout-wall${many ? " is-many" : ""}${wallH ? " is-measured" : ""}`} style={wallH ? { "--wall-h": `${wallH}px` } : undefined} aria-label="Your order">
      <ul className="checkout-wall-list">
        {items.map(i => (
          <li key={i.id} className="checkout-piece">
            {i.image && <div className="checkout-frame"><Pic src={i.image} w={1080} alt={i.title} className="checkout-piece-pic" /></div>}
            <div className="checkout-piece-label">
              <p className="checkout-piece-title">{i.title}</p>
              {(i.medium || i.dimensions) && <p className="checkout-piece-meta">{[i.medium, i.dimensions].filter(Boolean).join(" · ")}</p>}
              {shownAmount(i) ? <p className="checkout-piece-price">{money(shownAmount(i))}</p> : null}
              {pieceOff(i) && <p className="checkout-off">✓ {discount}% off</p>}
            </div>
          </li>
        ))}
      </ul>
      {many && amountDue ? (
        <div className="checkout-wall-total">
          <span className="checkout-wall-total-label">Total</span>
          <span className="checkout-wall-total-sum">{money(amountDue)}</span>
        </div>
      ) : null}
      {many && couponOn && basePrice !== effectivePrice && <p className="checkout-off checkout-wall-total-off">✓ {discount}% off</p>}
    </section>
  );
  // How to pay: one row each (src/components/PayRows.jsx), Stripe's only for the ways the server
  // can open right now (src/lib/payWays.js).
  const rows = payRows({ ways });
  // Stripe's ways, on the payment step: its heading, and the word while the form opens.
  const stripeQ = { card: "Pay by Card", klarna: "Pay with Klarna", bank: "Pay by Bank Transfer" }[method];
  const opening = method === "card" ? "Opening the secure card form…" : "Opening the secure payment form…";
  // Step 3, whichever way was chosen: the way back, always on the screen (WayBack.jsx); gone only once
  // the payment is being confirmed. Twice in the page, one shown (src/index.css, "The way back"): above
  // the art where the art and the step are one column, else at the top of the step.
  const wayBack = step === 3 && !cardCheck && <WayBack onBack={leavePayment} />;
  // On a phone the art sits on the left and the step on the right (Andy, 2026-11-22: "i would like
  // the image to the left and the options to the right"), at every step but Stripe's own form: that
  // keeps the phone's whole width, the art above it, as before. Beside the art it would get only
  // 199px of a 375 phone, too tight to trust a payment to. src/index.css ("A phone") draws it.
  const side = !(step === 3 && isStripe(method));
  const sendVia = (name, to, how) => (
    <div className="pay-detail">
      <h2 className="checkout-q">Send via {name}</h2>
      <div className="zelle-amount">${Number(amountDue||0).toLocaleString()}</div>
      {couponStatus==="valid" && <p style={{fontSize:16,color:"var(--ok)",marginBottom:8}}>✓ {discount}% coupon applied</p>}
      {to}
      <div className="zelle-steps">{how}</div>
    </div>
  );

  return (
    <div className={fullPage ? "checkout-page-bg checkout-gallery-page" : "modal-bg checkout-gallery-bg"} onClick={fullPage ? undefined : onClose}>
      <div ref={box} className={`checkout checkout-buy checkout-gallery${fullPage ? " checkout-fullpage" : ""}${side ? " checkout-side" : ""}`} onClick={e => e.stopPropagation()}>
        <button className="modal-close checkout-x" aria-label="Close" onClick={onClose}>✕</button>
        {wayBack}
        {wall}
        <div ref={stepsBox} className={`checkout-steps${stepsH ? " is-measured" : ""}`} style={stepsH ? { "--steps-h": `${stepsH}px` } : undefined}>
          <p className="checkout-eyebrow">Purchase · Step {step} of 3</p>
          {wayBack}
          {step === 1 && (
            <>
              {fullPage && <button type="button" className="tap checkout-back" onClick={onClose}>← Back to Cart</button>}
              <h2 className="checkout-q">Where should we send it?</h2>
              <div className="checkout-two">
                <div className="fld"><label>First Name *</label><input autoComplete="given-name" value={customer.firstName} onChange={e=>cv("firstName",e.target.value)} placeholder="Jane" /></div>
                <div className="fld"><label>Last Name *</label><input autoComplete="family-name" value={customer.lastName} onChange={e=>cv("lastName",e.target.value)} placeholder="Smith" /></div>
              </div>
              <div className="fld"><label>Email *</label><input type="email" autoComplete="email" autoCapitalize="none" value={customer.email} onChange={e=>cv("email",e.target.value)} placeholder="jane@email.com" /></div>
              <div className="fld"><label>Phone</label><input type="tel" autoComplete="tel" value={customer.phone} onChange={e=>cv("phone",e.target.value)} placeholder="+1 305 000 0000" /></div>
              <div className="fld"><label>Street</label><input autoComplete="street-address" value={customer.address} onChange={e=>cv("address",e.target.value)} placeholder="123 Main St" /></div>
              <div className="checkout-two">
                <div className="fld"><label>City</label><input autoComplete="address-level2" value={customer.city} onChange={e=>cv("city",e.target.value)} placeholder="Miami" /></div>
                <div className="fld"><label>State</label><input autoComplete="address-level1" value={customer.state} onChange={e=>cv("state",e.target.value)} placeholder="FL" /></div>
              </div>
              <div className="checkout-two">
                <div className="fld"><label>ZIP</label><input autoComplete="postal-code" inputMode="numeric" value={customer.zip} onChange={e=>cv("zip",e.target.value)} placeholder="33101" /></div>
                <div className="fld"><label>Country</label><input autoComplete="country-name" value={customer.country} onChange={e=>cv("country",e.target.value)} placeholder="USA" /></div>
              </div>
              <div className="checkout-coupon">
                <p className="checkout-coupon-label">Coupon Code <span>(optional)</span></p>
                <div className="checkout-coupon-row">
                  <input className="checkout-coupon-input" autoCapitalize="characters" autoComplete="off" value={couponCode} onChange={e=>{ setCouponCode(e.target.value.toUpperCase()); if(couponStatus!=="valid"){setCouponStatus(null);} }}
                    placeholder="FK-XXXX-XXXX" disabled={couponStatus==="valid"}
                    style={{ borderBottomColor:couponStatus==="valid"?"var(--ok)":couponStatus&&couponStatus!=="checking"?"#c0392b":undefined, background:couponStatus==="valid"?"var(--ok-tint)":undefined }}
                  />
                  {/* The coupon of a card payment already started is part of its price, set then: it stays, with no Remove. */}
                  {couponStatus !== "valid"
                    ? <button className="btn-s" onClick={applyCoupon} disabled={couponStatus==="checking"||!couponCode.trim()} style={{whiteSpace:"nowrap"}}>{couponStatus==="checking"?"Checking…":"Apply"}</button>
                    : !couponKept && <button className="btn-s" onClick={()=>{setCouponStatus(null);setCouponCode("");}} style={{whiteSpace:"nowrap",color:"var(--muted)"}}>Remove</button>
                  }
                </div>
                {/* A started card payment's own coupon: its saving is in the server's prices beside it, so no sum is made here. */}
                {couponStatus==="valid"       && <p style={{fontSize:16,color:"var(--ok)",marginTop:6}}>✓ {discount}% discount applied{saved ? null : <> — you save ${(basePrice-effectivePrice).toLocaleString()}</>}</p>}
                {couponStatus==="too-late"    && <p style={{fontSize:16,color:"#c0392b",marginTop:6}}>A coupon can&apos;t be added now: the card payment already started at this price. Please contact Fonkiart to use it.</p>}
                {couponStatus==="invalid"     && <p style={{fontSize:16,color:"#c0392b",marginTop:6}}>Code not found. Check the spelling and try again.</p>}
                {couponStatus==="used"        && <p style={{fontSize:16,color:"#c0392b",marginTop:6}}>This coupon has already been used.</p>}
                {couponStatus==="need-email"  && <p style={{fontSize:16,color:"#c0392b",marginTop:6}}>Enter your email address first, then apply the coupon.</p>}
                {couponStatus==="wrong-email" && <p style={{fontSize:16,color:"#c0392b",marginTop:6}}>This coupon is not linked to this email address.</p>}
              </div>
              <button className="confirm-btn checkout-go" style={{ background:detailsOk?"var(--gold)":"var(--border)" }} onClick={continueDetails}>Continue →</button>
              {checkoutError && <p style={{ fontSize:16, color:"#c0392b", marginTop:8, textAlign:"center" }}>{checkoutError}</p>}
            </>
          )}

          {step === 2 && (
            <>
              <button type="button" className="tap checkout-back" onClick={() => { setCheckoutError(""); setStep(1); }}>← Back</button>
              <h2 className="checkout-q">How would you like to pay?</h2>
              {refused && <p className="pay-calm" role="status">{refused}</p>}
              <PayRows rows={rows} value={method} onChoose={(id) => { setMethod(id); if (isStripe(id)) stripeJsReady(); }} />
              <button className="confirm-btn checkout-go" style={{ background:canNext?"var(--gold)":"var(--border)" }} onClick={handleContinue}>Continue →</button>
              {checkoutError && <p style={{ fontSize:16, color:"#c0392b", marginTop:8, textAlign:"center" }}>{checkoutError}</p>}
            </>
          )}

          {step === 3 && (
            <>
              {method === "zelle" && sendVia("Zelle",
                <><div style={{ fontSize:16, color:"var(--quiet)", marginBottom:5 }}>Send to this {settings.zelleLabel}:</div><div className="zelle-contact">{settings.zelleContact}</div></>,
                <>1. Open your bank app → Zelle<br />2. Send <strong>${Number(amountDue||0).toLocaleString()}</strong> to <strong>{settings.zelleContact}</strong><br />3. Memo: write <strong>{memo}</strong> in your Zelle memo/note<br />4. Confirm below — we ship once payment clears ✓</>)}
              {method === "venmo" && sendVia("Venmo",
                <div className="zelle-contact">{venmoHandle}</div>,
                <>1. Open Venmo → Search <strong>{venmoHandle}</strong><br />2. Send <strong>${Number(amountDue||0).toLocaleString()}</strong><br />3. Note: write <strong>{memo}</strong> in the Venmo note<br />4. Confirm below — we ship once payment clears ✓</>)}
              {method === "cashapp" && sendVia("Cash App",
                <div className="zelle-contact">{cashAppHandle}</div>,
                <>1. Open Cash App → Search <strong>{cashAppHandle}</strong><br />2. Send <strong>${Number(amountDue||0).toLocaleString()}</strong><br />3. Note: write <strong>{memo}</strong> in the Cash App note<br />4. Confirm below — we ship once payment clears ✓</>)}
              {isStripe(method) && <h2 className="checkout-q">{stripeQ}</h2>}
              {isStripe(method) && pay && (
                <CardCheckout pay={pay} artworks={items} art={false} onFail={cardFormFailed} onComplete={cardComplete} check={cardCheck} />
              )}
              {method==="zelle"   && <button className="confirm-btn" onClick={handleConfirmZelle}   disabled={saving}>{saving?"Saving…":"✓ I've Sent the Payment"}</button>}
              {method==="venmo"   && <button className="confirm-btn" onClick={handleConfirmVenmo}   disabled={saving}>{saving?"Saving…":"✓ I've Sent the Payment"}</button>}
              {method==="cashapp" && <button className="confirm-btn" onClick={handleConfirmCashApp} disabled={saving}>{saving?"Saving…":"✓ I've Sent the Payment"}</button>}
              {isStripe(method) && calm && <p className="pay-calm" role="status">{calm}</p>}
              {/* Stripe's ways: Continue already opened the form. Here only while it opens, or once it couldn't. */}
              {isStripe(method) && !pay && (saving
                ? <p className="pay-card-wait" role="status">{opening}</p>
                : <button className="stripe-btn" onClick={handleCard}>Try Again</button>)}
              {checkoutError && <p role="alert" style={{ fontSize:16, color:"#c0392b", marginTop:8, textAlign:"center" }}>{checkoutError}</p>}
              {wayBack && !(isStripe(method) && !pay && saving) && <WayBack foot onBack={leavePayment} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
