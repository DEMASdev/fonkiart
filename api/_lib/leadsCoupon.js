import { InputError } from "./errors.js";
import * as T from "./emails.js";
import { adminEmail } from "./adminOps.js";
import { EMAIL_RE, lower } from "./couponMail.js";
import { couponDiscount } from "./storeOps.js";
import { linkFor, sendCouponEmail, unsubscribedAmong, whyNoCoupon } from "./unsubscribe.js";
import { sizesOf, sizesWords } from "../../src/lib/couponSize.js";

// Admin -> Leads, "+ Create Coupon": the email of it, when Andy ticks the box, and who on the list
// asked for no more coupons ("Unsubscribe", unsubscribe.js). Admin-only (api/admin.js, behind the admin
// login). The email is built here, from the code on that person's own Leads row, never in the browser.
const MAX_EMAILS = 5000;
export const GIFT_HEADING = "A Gift From Fonkiart";

// Emails their coupon to { email }: { sent: true }, or { sent: false, why: "out" } when they asked for no
// more. It can't be checked, or didn't go: it throws.
export async function couponGift(db, body, mail) {
  const email = lower(body?.email);
  if (!EMAIL_RE.test(email)) throw new InputError("Bad email");
  const { data, error } = await db.from("Leads").select("*").eq("email", email).limit(10);
  if (error) throw new Error(`Leads read: ${error.message}`);
  const lead = (data || []).find(l => l.coupon_code);
  if (!lead) throw new InputError("They have no coupon to send.", 409);
  const words = sizesWords(sizesOf(lead.coupon_size, await couponDiscount(db)), { upTo: true });
  const out = await sendCouponEmail(db, mail, { to: email, subject: "Your Exclusive Coupon — Fonkiart",
    html: (unsubscribe) => T.couponGift({ code: lead.coupon_code, words, unsubscribe }) });
  if (out.why === "unchecked") throw new Error("couldn't check whether they asked for no more coupons, so nothing was sent");
  return out;
}

// An Admin page open since before this was built still writes that email itself, as an ordinary one:
// the same rule, and the same link at its end.
export const isOldGift = (body) => body?.heading === GIFT_HEADING;
export async function oldGift(db, body, mail) {
  const to = lower(typeof body.to === "string" ? body.to : body.to?.[0]?.email);
  if (!EMAIL_RE.test(to)) throw new InputError("Bad recipient");
  const why = await whyNoCoupon(db, to);
  if (why) throw new InputError(why === "out" ? "They asked not to get coupons, so nothing was sent." : "Nothing was sent: try again in a minute.", 409);
  return adminEmail(mail, { ...body, to }, linkFor(to));
}

// Which of these emails asked for no more coupons: { emails }. Throws when it can't be read.
export async function unsubscribedLeads(db, body) {
  const emails = Array.isArray(body?.emails) ? body.emails : [];
  if (emails.length > MAX_EMAILS || !emails.every(e => typeof e === "string" && e.length <= 254)) throw new InputError("Bad emails");
  return { emails: [...(await unsubscribedAmong(db, emails))] };
}
