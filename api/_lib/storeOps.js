import crypto from "crypto";
import { InputError } from "./errors.js";
import * as T from "./emails.js";
import { bearer } from "./adminToken.js";

// Every public action the shop needs, run on the server with the service key, so the
// database itself can stay locked to the public key. Each one does exactly what the
// browser used to do for that form, and nothing more.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ORDER_REF_OFFSET = 1710;

function text(value, max, label, { required = false, trim = true } = {}) {
  if (value == null || value === "") {
    if (required) throw new InputError(`Missing ${label}`);
    return "";
  }
  if (typeof value !== "string") throw new InputError(`Bad ${label}`);
  const s = trim ? value.trim() : value;
  if (required && !s) throw new InputError(`Missing ${label}`);
  if (s.length > max) throw new InputError(`${label} is too long`);
  return s;
}

function emailField(value) {
  const s = text(value, 254, "email", { required: true });
  if (!EMAIL_RE.test(s)) throw new InputError("Invalid email");
  return s;
}

function amountField(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 10_000_000) throw new InputError("Bad amount");
  return n;
}

export function newCouponCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const part = (n) => Array.from({ length: n }, () => chars[crypto.randomInt(chars.length)]).join("");
  return `FK-${part(4)}-${part(4)}`;
}

export const formatOrderRef = (id) => `FA-${Number(id) + ORDER_REF_OFFSET}`;

export const sha256hex = (s) => crypto.createHash("sha256").update(s, "utf8").digest("hex");

async function couponDiscount(db) {
  const { data } = await db.from("Settings").select("*").eq("id", 1).maybeSingle();
  return data?.couponDiscount ?? 15;
}

async function findCoupon(db, code) {
  const { data } = await db.from("Leads").select("*").eq("coupon_code", code).limit(2);
  return data && data.length === 1 ? data[0] : null;
}

export async function opWelcome(db, body, mail) {
  const email = emailField(body.email).toLowerCase();
  const { data: rows, error } = await db.from("Leads").select("id,coupon_code,coupon_used").eq("email", email).limit(1);
  if (error) throw error;
  const existing = rows?.[0];
  if (existing?.coupon_code) return { returning: true, code: existing.coupon_code, used: !!existing.coupon_used };
  const code = newCouponCode();
  const write = existing
    ? db.from("Leads").update({ coupon_code: code, coupon_used: false }).eq("id", existing.id)
    : db.from("Leads").insert([{ email, source: "welcome-popup", coupon_code: code, coupon_used: false }]);
  const { error: writeErr } = await write;
  if (writeErr) throw writeErr;
  const discount = await couponDiscount(db);
  await mail.send({ to: email, subject: `Your ${discount}% Welcome Coupon — Fonkiart`, htmlContent: T.welcomeCoupon({ code, discount }) });
  return { returning: false, code };
}

export async function opCollectors(db, body) {
  const email = emailField(body.email).toLowerCase();
  const source = body.source === "collectors-request" ? "collectors-request" : "collectors-section";
  const { data: rows, error } = await db.from("Leads").select("id").eq("email", email).limit(1);
  if (error) throw error;
  if (!rows?.length) {
    const { error: insErr } = await db.from("Leads").insert([{ email, source, coupon_code: null, coupon_used: false }]);
    if (insErr) throw insErr;
  }
  return { ok: true };
}

export async function opRequest(db, body, mail) {
  if (body.kind === "contact") {
    const name = text(body.name, 200, "name", { required: true });
    const email = emailField(body.email);
    const message = text(body.message, 5000, "message", { required: true });
    const { error } = await db.from("Requests").insert([{ name, email, message, status: "new" }]);
    if (error) console.warn("store contact insert:", error.message);
    await Promise.allSettled([
      mail.send({ to: mail.sender, subject: "Contact Form Request", htmlContent: T.contactStore({ name, email, message }), replyTo: email }),
      mail.send({ to: email, subject: "We received your message — Fonkiart", htmlContent: T.contactBuyer({ name, message, sender: mail.sender }) }),
    ]);
    return { ok: true };
  }
  if (body.kind === "inquiry") {
    const name = text(body.name, 200, "name", { required: true });
    const email = emailField(body.email);
    const phone = text(body.phone, 50, "phone");
    const message = text(body.message, 5000, "message");
    if (!/^\d{1,20}$/.test(String(body.artworkId ?? ""))) throw new InputError("Bad artwork");
    const { data: art } = await db.from("Artworks").select("*").eq("id", String(body.artworkId)).maybeSingle();
    if (!art) throw new InputError("Artwork not found", 404);
    await Promise.allSettled([
      db.from("Requests").insert([{ name, email, status: "new",
        message: `Price inquiry for "${art.title}"${message ? ` — ${message}` : ""}. Phone: ${phone || "not provided"}.` }]),
      mail.send({ to: mail.sender, subject: `Enquiry about ${art.title}`, htmlContent: T.inquiryStore({ art, name, email, phone, message }) }),
      mail.send({ to: email, subject: `Your inquiry — ${art.title} · Fonkiart`, htmlContent: T.inquiryBuyer({ name, artTitle: art.title, sender: mail.sender }) }),
    ]);
    return { ok: true };
  }
  if (body.kind === "commission") {
    const name = text(body.name, 200, "name", { required: true });
    const email = text(body.email, 254, "email");
    const idea = text(body.idea, 5000, "idea", { required: true });
    const budget = text(body.budget, 100, "budget");
    const { error } = await db.from("Requests").insert([{ name, email, status: "new",
      message: `[COLLECTORS COMMISSION] Budget: ${budget || "TBD"}\n\n${idea}` }]);
    if (error) throw error;
    return { ok: true };
  }
  throw new InputError("Unknown request kind");
}

export async function opNextRef(db) {
  const { data, error } = await db.from("Orders").select("id").order("id", { ascending: false }).limit(1);
  if (error) throw error;
  const maxId = data && data.length ? data[0].id : 9;
  return { ref: formatOrderRef(maxId + 1) };
}

export async function opCoupon(db, body) {
  const code = text(body.code, 40, "code", { required: true }).toUpperCase();
  const email = text(body.email, 254, "email", { required: true }).toLowerCase();
  const lead = await findCoupon(db, code);
  if (!lead) return { status: "invalid" };
  if (lead.coupon_used) return { status: "used" };
  if (String(lead.email || "").toLowerCase() !== email) return { status: "wrong-email" };
  return { status: "valid" };
}

export async function opOrder(db, body, mail) {
  const c = body.customer || {};
  const firstName = text(c.firstName, 100, "first name", { required: true });
  const lastName = text(c.lastName, 100, "last name", { required: true });
  const email = emailField(c.email);
  const phone = text(c.phone, 50, "phone");
  const address = text(c.address, 300, "street");
  const city = text(c.city, 100, "city");
  const state = text(c.state, 100, "state");
  const zip = text(c.zip, 30, "ZIP");
  const country = text(c.country, 100, "country");
  const list = Array.isArray(body.items) ? body.items : [];
  if (!list.length || list.length > 25) throw new InputError("Bad items");
  const items = list.map(i => ({ title: text(i?.title, 300, "item", { required: true }), amount: amountField(i?.amount) }));
  const total = amountField(body.total);
  const orderRef = text(body.orderRef, 20, "order reference");
  if (orderRef && !/^FA-\d{1,9}$/.test(orderRef)) throw new InputError("Bad order reference");

  const fullName = `${firstName} ${lastName}`.trim();
  const addr = [address, city, state, zip, country].filter(Boolean).join(", ");
  const code = body.couponCode ? text(body.couponCode, 40, "coupon").toUpperCase() : "";
  let couponLead = null;
  if (code) {
    const lead = await findCoupon(db, code);
    if (lead && !lead.coupon_used && String(lead.email || "").toLowerCase() === email.toLowerCase()) couponLead = lead;
  }
  const discount = await couponDiscount(db);
  const notes = [`Order Ref: ${orderRef}`, fullName, phone, addr].filter(Boolean).join(" · ") + (couponLead ? ` · ${discount}% coupon applied` : "");

  const { data: existing } = await db.from("Clients").select("id").eq("email", email).limit(1);
  const { error: orderErr } = await db.from("Orders").insert(items.map(i => ({ client_email: email, item_title: i.title, amount: i.amount, status: "pending", notes })));
  if (orderErr) console.error("store order insert:", orderErr.message);

  const itemsLabel = items.length === 1 ? items[0].title : `${items.length} items`;
  const couponApplied = !!couponLead;
  await Promise.allSettled([
    existing?.length ? null : db.from("Clients").insert([{ name: fullName, email, phone: phone || null, address: address || null, city: city || null, state: state || null, zip: zip || null, country: country || null }]),
    couponLead ? db.from("Leads").update({ coupon_used: true }).eq("id", couponLead.id) : null,
    mail.send({ to: email, subject: `Order Received — ${itemsLabel} · Fonkiart`,
      htmlContent: T.orderBuyer({ firstName, orderRef, items, total, couponApplied, discount, addr, sender: mail.sender }) }),
    mail.send({ to: mail.sender, subject: `🎨 New Order ${orderRef}: ${itemsLabel} — ${fullName}`,
      htmlContent: T.orderStore({ orderRef, items, total, couponApplied, discount, fullName, email, phone, addr, saveFailed: !!orderErr }) }),
  ]);
  return { ok: true, saved: !orderErr };
}

function invoiceToken(value) {
  const t = text(value, 100, "invoice", { required: true });
  if (!/^[A-Za-z0-9-]{8,100}$/.test(t)) throw new InputError("Bad invoice link", 404);
  return t;
}

async function findInvoice(db, token) {
  const { data, error } = await db.from("Orders").select("*").eq("invoice_token", token).limit(2);
  if (error) throw error;
  if (!data || data.length !== 1) throw new InputError("Invoice not found", 404);
  return data[0];
}

export async function opInvoice(db, body) {
  const order = await findInvoice(db, invoiceToken(body.token));
  const { data: settings } = await db.from("Settings").select("*").eq("id", 1).maybeSingle();
  return { order, settings: settings || {} };
}

export async function opInvoiceApprove(db, body, mail) {
  const order = await findInvoice(db, invoiceToken(body.token));
  if (!order.invoice_approved) {
    const { error } = await db.from("Orders").update({ invoice_approved: true, status: "confirmed" }).eq("id", order.id);
    if (error) throw error;
    await mail.send({ to: mail.sender, subject: `Invoice approved — ${order.item_title}`, htmlContent: T.invoiceApproved({ order }) })
      .catch(e => console.warn("store invoice email:", e.message));
  }
  return { ok: true };
}

export async function opTrack(db, body) {
  const email = text(body.email, 254, "email", { required: true }).toLowerCase();
  if (!email.includes("@")) throw new InputError("Invalid email");
  const { data, error } = await db.from("Orders").select("id,item_title,status,amount,created_at").eq("client_email", email).order("created_at", { ascending: false });
  if (error) throw error;
  return { orders: data || [] };
}

export async function opLegacyLogin(db, body) {
  const email = text(body.email, 254, "email", { required: true }).toLowerCase();
  const password = text(body.password, 200, "password", { required: true, trim: false });
  const { data: rows } = await db.from("Clients").select("id,name,email,password").eq("email", email).limit(1);
  const client = rows?.[0];
  if (!client?.password) return { ok: false };
  const hashed = sha256hex(password);
  const safe = { id: client.id, name: client.name, email: client.email };
  if (client.password === hashed) return { ok: true, client: safe };
  if (client.password === password) {
    await db.from("Clients").update({ password: hashed }).eq("id", client.id);
    return { ok: true, client: safe };
  }
  return { ok: false };
}

export async function opBuyer(db, req) {
  const token = bearer(req);
  if (!token) throw new InputError("Sign in required", 401);
  const { data, error } = await db.auth.getUser(token);
  const user = data?.user;
  if (error || !user?.email) throw new InputError("Sign in required", 401);
  if (!user.email_confirmed_at && !user.confirmed_at) throw new InputError("Email not confirmed", 403);
  const email = user.email.toLowerCase();
  const [ordersRes, clientRes] = await Promise.all([
    db.from("Orders").select("*").eq("client_email", email).order("created_at", { ascending: false }),
    db.from("Clients").select("*").eq("email", email).limit(1),
  ]);
  let client = clientRes.data?.[0] || null;
  if (!client && user.user_metadata?.name) {
    await db.from("Clients").insert([{ name: user.user_metadata.name, email }]);
    const { data: again } = await db.from("Clients").select("*").eq("email", email).limit(1);
    client = again?.[0] || null;
  }
  if (client) delete client.password;
  return { orders: ordersRes.data || [], client };
}

export const STORE_OPS = {
  "welcome": (db, req, mail) => opWelcome(db, req.body || {}, mail),
  "collectors": (db, req) => opCollectors(db, req.body || {}),
  "request": (db, req, mail) => opRequest(db, req.body || {}, mail),
  "next-ref": (db) => opNextRef(db),
  "coupon": (db, req) => opCoupon(db, req.body || {}),
  "order": (db, req, mail) => opOrder(db, req.body || {}, mail),
  "invoice": (db, req) => opInvoice(db, req.body || {}),
  "invoice-approve": (db, req, mail) => opInvoiceApprove(db, req.body || {}, mail),
  "track": (db, req) => opTrack(db, req.body || {}),
  "legacy-login": (db, req) => opLegacyLogin(db, req.body || {}),
  "buyer": (db, req) => opBuyer(db, req),
};
