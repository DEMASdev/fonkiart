import crypto from "crypto";
import { InputError } from "./errors.js";
import { issueAdminToken, samePassword } from "./adminToken.js";
import { pwRulesMet, pwRulesFailed } from "./pwRules.js";
import * as T from "./emails.js";

// The admin password starts out as the ADMIN_PASSWORD env var. Once it is reset
// from the site, its hash lives in the server-only admin_auth table (one row,
// id 1) with a fresh secret for signing admin sessions, so a reset also ends
// every session signed with the old one.

export const ADMIN_EMAIL = "fonkiart@gmail.com";
const RESET_MS = 30 * 60 * 1000;
const RESEND_MS = 2 * 60 * 1000;

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");
export const isMissingTable = (error) =>
  /PGRST205|42P01/.test(String(error?.code)) || /does not exist|schema cache/i.test(String(error?.message));

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  return `scrypt$${salt.toString("base64url")}$${crypto.scryptSync(password, salt, 32).toString("base64url")}`;
}

export function checkPassword(password, stored) {
  const [kind, salt, hash] = String(stored || "").split("$");
  if (kind !== "scrypt" || !salt || !hash || typeof password !== "string") return false;
  const want = Buffer.from(hash, "base64url");
  const got = crypto.scryptSync(password, Buffer.from(salt, "base64url"), want.length);
  return crypto.timingSafeEqual(got, want);
}

// null = nothing stored yet (no table or no row), so the env var still applies.
// Any other read error throws: a stored password must never quietly fall back.
async function readRow(db) {
  const { data, error } = await db.from("admin_auth").select("*").eq("id", 1).maybeSingle();
  if (error) {
    if (isMissingTable(error)) return null;
    throw new Error(`admin_auth read: ${error.message}`);
  }
  return data || null;
}

export async function adminCredentials(db) {
  const row = db ? await readRow(db) : null;
  if (row?.password_hash && row?.token_secret) {
    return { check: (p) => checkPassword(p, row.password_hash), secret: row.token_secret };
  }
  const env = process.env.ADMIN_PASSWORD;
  return env ? { check: (p) => samePassword(p, env), secret: env } : null;
}

export async function opResetRequest(db, body, mail, siteUrl, now = Date.now()) {
  // Same answer for every address, so the form can't be used to probe accounts.
  if (String(body.email || "").trim().toLowerCase() !== ADMIN_EMAIL) return { ok: true };
  const row = await readRow(db);
  if (row?.reset_requested_at && now - Date.parse(row.reset_requested_at) < RESEND_MS) return { ok: true };
  const token = crypto.randomBytes(32).toString("base64url");
  const { error } = await db.from("admin_auth").upsert({
    id: 1,
    reset_token_hash: sha256(token),
    reset_expires_at: new Date(now + RESET_MS).toISOString(),
    reset_requested_at: new Date(now).toISOString(),
  });
  if (error) {
    if (isMissingTable(error)) throw new InputError("Password reset isn't switched on yet", 503);
    throw new Error(`admin_auth write: ${error.message}`);
  }
  await mail.send({ to: ADMIN_EMAIL, subject: "Reset your Fonkiart admin password",
    htmlContent: T.adminReset({ link: `${siteUrl}/#admin-reset=${token}`, minutes: RESET_MS / 60000 }) });
  return { ok: true };
}

export async function opResetSet(db, body, now = Date.now()) {
  const token = String(body.token || "");
  const password = body.password;
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new InputError("This reset link isn't valid. Ask for a new one.");
  if (typeof password !== "string" || !pwRulesMet(password)) throw new InputError(`Password does not meet the requirements: ${pwRulesFailed(password).join(", ")}`);
  if (password.length > 200) throw new InputError("That password is too long.");
  const row = await readRow(db);
  const stored = String(row?.reset_token_hash || "");
  const given = sha256(token);
  if (stored.length !== given.length || !crypto.timingSafeEqual(Buffer.from(stored), Buffer.from(given))) {
    throw new InputError("This reset link was already used or replaced. Ask for a new one.");
  }
  if (!row.reset_expires_at || now > Date.parse(row.reset_expires_at)) {
    throw new InputError("This reset link has expired. Ask for a new one.");
  }
  const secret = crypto.randomBytes(32).toString("base64url");
  const { error } = await db.from("admin_auth").update({
    password_hash: hashPassword(password),
    token_secret: secret,
    reset_token_hash: null,
    reset_expires_at: null,
    updated_at: new Date(now).toISOString(),
  }).eq("id", 1).eq("reset_token_hash", stored);
  if (error) throw new Error(`admin_auth write: ${error.message}`);
  return { ok: true, token: issueAdminToken(secret, now) };
}
