import { InputError } from "./errors.js";

// The admin screens still describe their queries the way supabase-js does
// (from().select().eq()...); the browser sends that description here and the
// server replays it with the service key — only for these tables and methods.

export const ADMIN_TABLES = new Set(["Artworks", "Settings", "Leads", "Orders", "Requests", "Clients"]);
const ACTIONS = new Set(["select", "insert", "update", "upsert", "delete"]);
const MODIFIERS = new Set(["select", "eq", "neq", "gt", "gte", "lt", "lte", "in", "is", "like", "ilike", "order", "limit", "range", "single", "maybeSingle"]);
const BUCKET = "artworks";
const PATH_RE = /^(?!.*\.\.)(?!\/)[A-Za-z0-9/_.-]{1,200}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateChain(table, chain) {
  if (!ADMIN_TABLES.has(table)) throw new InputError("Unknown table");
  if (!Array.isArray(chain) || chain.length === 0 || chain.length > 30) throw new InputError("Bad query");
  chain.forEach((step, i) => {
    if (!step || typeof step.m !== "string" || !Array.isArray(step.a ?? [])) throw new InputError("Bad query");
    if (!(i === 0 ? ACTIONS : MODIFIERS).has(step.m)) throw new InputError(`Not allowed: ${step.m}`);
  });
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
  const htmlContent = typeof body.htmlContent === "string" ? body.htmlContent : "";
  if (!subject || !htmlContent || htmlContent.length > 200_000) throw new InputError("Bad email");
  const replyTo = body.replyTo && EMAIL_RE.test(String(body.replyTo)) ? String(body.replyTo) : undefined;
  await mail.send({ to: recipients(body.to), subject, htmlContent, replyTo });
  return { ok: true };
}
