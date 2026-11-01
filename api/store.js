import { getServiceClient } from "./_lib/supabaseAdmin.js";
import { sendBrevo, senderAddress } from "./_lib/brevo.js";
import { InputError } from "./_lib/errors.js";
import { STORE_OPS } from "./_lib/storeOps.js";
import { withRandomArt } from "./_lib/emails.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const op = String(req.query?.op || "");
  const run = STORE_OPS[op];
  if (!run) return res.status(404).json({ error: "Unknown operation" });
  const db = getServiceClient();
  if (!db) {
    console.error("store: SUPABASE_SERVICE_ROLE_KEY or SUPABASE_URL not configured");
    return res.status(503).json({ error: "Store not configured" });
  }
  try {
    const send = async (m) => sendBrevo({ ...m, htmlContent: await withRandomArt(db, m.htmlContent) });
    return res.status(200).json(await run(db, req, { sender: senderAddress(), send }));
  } catch (e) {
    if (e instanceof InputError) return res.status(e.status).json({ error: e.message });
    console.error(`store ${op}:`, e?.message || e);
    return res.status(500).json({ error: "Something went wrong" });
  }
}
