import { InputError } from "./errors.js";
import { adminFrame } from "./emails.js";
import { SHIP_LIMITS } from "./shipAddress.js";

// The admin screens still describe their queries the way supabase-js does
// (from().select().eq()...); the browser sends that description here and the
// server replays it with the service key — only for these tables and methods.

export const ADMIN_TABLES = new Set(["Artworks", "Settings", "Leads", "Orders", "Requests", "Clients"]);
const ACTIONS = new Set(["select", "insert", "update", "upsert", "delete"]);
const MODIFIERS = new Set(["select", "eq", "neq", "gt", "gte", "lt", "lte", "in", "is", "like", "ilike", "order", "limit", "range", "single", "maybeSingle"]);
const BUCKET = "artworks";
const PATH_RE = /^(?!.*\.\.)(?!\/)[A-Za-z0-9/_.-]{1,200}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// How an order was paid: the paid invoice says "Paid by ...". Orders.paid_method holds only
// these (Andy, 2026-11-17). The admin's "Mark paid" saves one; a card payment saves "card" by
// itself (storeOps.js). Browser copy, with the button labels: src/lib/orderStatus.js.
export const PAID_METHODS = new Set(["card", "zelle", "venmo", "cashapp", "cash", "other"]);
const WRITES = new Set(["insert", "update", "upsert"]);

// Tracking, saved when an order goes out with a carrier (Andy, 2026-11-17). The link made from
// it goes into the client's email and onto their invoice page, so only these are saved:
//  - tracking_carrier: usps, ups, fedex, dhl or other, or pickup (a pickup / hand delivery,
//    which has no number and no link);
//  - tracking_number: letters, digits, spaces and dashes, 4 to 60 of them, trimmed;
//  - tracking_url (Other's own tracking page): https:// only, so never a "javascript:" link;
//  - null clears any of them.
// Browser copy, with the carrier names and the links: src/lib/tracking.js
// (tests/tracking.test.js checks the two agree).
export const TRACKING_CARRIERS = new Set(["usps", "ups", "fedex", "dhl", "other", "pickup"]);
const TRACKING_NUMBER_RE = /^[A-Za-z0-9][A-Za-z0-9 -]{2,58}[A-Za-z0-9]$/;
const hasControl = (s) => [...s].some(c => { const n = c.codePointAt(0); return n < 32 || n === 127; });
export function isHttpsLink(value) {
  if (typeof value !== "string" || value.length > 2000) return false;
  if (!/^https:\/\//i.test(value) || /[\s"'<>`\\]/.test(value) || hasControl(value)) return false;
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !!u.hostname;
  } catch {
    return false;
  }
}
const TRACKING_RULES = [
  ["tracking_carrier", (v) => TRACKING_CARRIERS.has(v), "Bad carrier"],
  ["tracking_number", (v) => typeof v === "string" && TRACKING_NUMBER_RE.test(v), "Bad tracking number"],
  ["tracking_url", isHttpsLink, "Bad tracking link"],
];

export function validateChain(table, chain) {
  if (!ADMIN_TABLES.has(table)) throw new InputError("Unknown table");
  if (!Array.isArray(chain) || chain.length === 0 || chain.length > 30) throw new InputError("Bad query");
  chain.forEach((step, i) => {
    if (!step || typeof step.m !== "string" || !Array.isArray(step.a ?? [])) throw new InputError("Bad query");
    if (!(i === 0 ? ACTIONS : MODIFIERS).has(step.m)) throw new InputError(`Not allowed: ${step.m}`);
  });
  // A write that sets paid_method must use one of the six, one that sets tracking must follow
  // TRACKING_RULES, and a shipping address field must be text no longer than the checkout
  // allows (SHIP_LIMITS); anything else is refused (400) before the database is touched, so
  // nothing is saved. null clears any of them.
  if (table === "Orders" && WRITES.has(chain[0].m)) {
    for (const row of [].concat(chain[0].a?.[0] ?? [])) {
      if (!row || typeof row !== "object") continue;
      if (Object.hasOwn(row, "paid_method") && !PAID_METHODS.has(row.paid_method)) {
        throw new InputError("Bad payment method");
      }
      for (const [column, ok, refusal] of TRACKING_RULES) {
        if (Object.hasOwn(row, column) && row[column] !== null && !ok(row[column])) throw new InputError(refusal);
      }
      for (const [column, max] of Object.entries(SHIP_LIMITS)) {
        const v = row[column];
        if (Object.hasOwn(row, column) && v !== null && !(typeof v === "string" && v.length <= max)) throw new InputError("Bad shipping address");
      }
    }
  }
}

export async function runQuery(db, table, chain) {
  validateChain(table, chain);
  let q = db.from(table);
  for (const { m, a = [] } of chain) q = q[m](...a);
  const { data, error, count } = await q;
  return {
    data: data ?? null,
    count: count ?? null,
    error: error ? { message: error.message, details: error.details, hint: error.hint, code: error.code } : null,
  };
}

function checkPath(p) {
  if (typeof p !== "string" || !PATH_RE.test(p)) throw new InputError("Bad file path");
  return p;
}

export async function signUpload(db, path) {
  const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(checkPath(path));
  if (error) return { error: { message: error.message } };
  return { path: data.path, token: data.token };
}

export async function removeFiles(db, paths) {
  if (!Array.isArray(paths) || paths.length === 0 || paths.length > 20) throw new InputError("Bad file list");
  const { data, error } = await db.storage.from(BUCKET).remove(paths.map(checkPath));
  return { data: data ?? null, error: error ? { message: error.message } : null };
}

function recipients(to) {
  const list = typeof to === "string" ? [{ email: to }] : to;
  if (!Array.isArray(list) || list.length === 0 || list.length > 10 || !list.every(r => r && EMAIL_RE.test(String(r.email || "")))) {
    throw new InputError("Bad recipient");
  }
  return list.map(r => ({ email: String(r.email) }));
}

export async function adminEmail(mail, body) {
  const subject = typeof body.subject === "string" ? body.subject.slice(0, 300) : "";
  // A heading + the inside get the shared Fonkiart frame; a ready-made htmlContent goes as is.
  const htmlContent = typeof body.heading === "string" && typeof body.content === "string"
    ? adminFrame(body.heading, body.content)
    : typeof body.htmlContent === "string" ? body.htmlContent : "";
  if (!subject || !htmlContent || htmlContent.length > 200_000) throw new InputError("Bad email");
  const replyTo = body.replyTo && EMAIL_RE.test(String(body.replyTo)) ? String(body.replyTo) : undefined;
  await mail.send({ to: recipients(body.to), subject, htmlContent, replyTo });
  return { ok: true };
}
