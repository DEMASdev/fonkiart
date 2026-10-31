import crypto from "crypto";
import { InputError } from "./errors.js";
import { hashPassword, isMissingTable } from "./adminSecret.js";
import { pwRulesMet, pwRulesFailed } from "./pwRules.js";
import * as T from "./emails.js";

// Customers' "Forgot password?". A customer can have a Supabase sign-in (made
// with "Create Account"), a collectors password set by hand in the admin
// (Clients.password), or both; one emailed link resets whichever exist. The
// pending link lives hashed in the server-only customer_resets table, one row
// per email.

const RESET_MS = 30 * 60 * 1000;
const RESEND_MS = 2 * 60 * 1000;
const PER_PAGE = 200;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

async function findAuthUser(db, email) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error) throw new Error(`auth users: ${error.message}`);
    const users = data?.users || [];
    const hit = users.find(u => String(u.email || "").toLowerCase() === email);
    if (hit) return hit;
    if (users.length < PER_PAGE) return null;
  }
  return null;
}

async function findAccounts(db, email) {
  const { data: rows, error } = await db.from("Clients").select("id,password").eq("email", email).limit(1);
  if (error) throw error;
  return { client: rows?.[0]?.password ? rows[0] : null, user: await findAuthUser(db, email) };
}

function tableError(error) {
  if (isMissingTable(error)) return new InputError("Password reset isn't switched on yet", 503);
  return new Error(`customer_resets: ${error.message}`);
}

export async function opCustomerResetRequest(db, body, mail, siteUrl, now = Date.now()) {
  const email = String(body.email || "").trim().toLowerCase();
  if (email.length > 254 || !EMAIL_RE.test(email)) throw new InputError("Enter a valid email address.");
  // Same answer whether or not the email has an account, so the form can't be used to probe.
  const { client, user } = await findAccounts(db, email);
  if (!client && !user) return { ok: true };
  const { data: prev, error: readErr } = await db.from("customer_resets").select("requested_at").eq("email", email).maybeSingle();
  if (readErr) throw tableError(readErr);
  if (prev?.requested_at && now - Date.parse(prev.requested_at) < RESEND_MS) return { ok: true };
  const token = crypto.randomBytes(32).toString("base64url");
  const { error } = await db.from("customer_resets").upsert({
    email,
    token_hash: sha256(token),
    expires_at: new Date(now + RESET_MS).toISOString(),
    requested_at: new Date(now).toISOString(),
  });
  if (error) throw tableError(error);
  await mail.send({ to: email, subject: "Reset your Fonkiart password",
    htmlContent: T.customerReset({ link: `${siteUrl}/#reset=${token}`, minutes: RESET_MS / 60000 }) });
  return { ok: true };
}

export async function opCustomerResetSet(db, body, now = Date.now()) {
  const token = String(body.token || "");
  const password = body.password;
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new InputError("This reset link isn't valid. Ask for a new one.");
  if (typeof password !== "string" || !pwRulesMet(password)) throw new InputError(`Password does not meet the requirements: ${pwRulesFailed(password).join(", ")}`);
  if (password.length > 200) throw new InputError("That password is too long.");
  const hash = sha256(token);
  const { data: row, error } = await db.from("customer_resets").select("*").eq("token_hash", hash).maybeSingle();
  if (error) throw tableError(error);
  if (!row) throw new InputError("This reset link was already used or replaced. Ask for a new one.");
  if (!row.expires_at || now > Date.parse(row.expires_at)) throw new InputError("This reset link has expired. Ask for a new one.");
  const { client, user } = await findAccounts(db, row.email);
  if (!client && !user) throw new InputError("There's no account with this email any more.");
  if (user) {
    // The link proved they read this inbox, so an unconfirmed email counts as confirmed now.
    const { error: authErr } = await db.auth.admin.updateUserById(user.id, { password, email_confirm: true });
    if (authErr) throw new InputError(authErr.message || "Couldn't save that password. Try a different one.");
  }
  if (client) {
    const { error: clientErr } = await db.from("Clients").update({ password: hashPassword(password) }).eq("id", client.id);
    if (clientErr) throw new Error(`Clients password: ${clientErr.message}`);
  }
  const { error: clearErr } = await db.from("customer_resets").update({ token_hash: null, expires_at: null }).eq("email", row.email);
  if (clearErr) throw tableError(clearErr);
  return { ok: true, email: row.email };
}
