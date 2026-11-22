import { findAuthUser } from "./customerReset.js";
import { siteUrl } from "./site.js";

// "Verify my email" in the welcome email (Andy, 2026-11-22: "if someone enters their email they
// should get a verify your email .. email, and inmediately that session is logged in"). It is
// Supabase's own emailed sign-in link, the kind AuthModal.jsx sends collectors (signInWithOtp),
// made here with the service key so it goes inside OUR email next to the code: one email, not two.
// Tapping it confirms the email and signs them in as a BUYER (My Account), never a collector:
//  - someone new: Supabase makes their sign-in, with role "buyer";
//  - a buyer already: their own sign-in link;
//  - anyone else with a sign-in (a collector, or someone who asked to be one): no link, and
//    nothing about them is changed. This never signs anyone into the Collectors Room.
// Anything wrong: no link (null), and the welcome email goes out with its code as before. The link
// signs someone in, so it is never logged and goes nowhere but into their own inbox.
export async function buyerSignInLink(db, email) {
  try {
    const admin = db?.auth?.admin;
    if (typeof admin?.generateLink !== "function") return null;
    const known = await findAuthUser(db, email);
    if (known && known.user_metadata?.role !== "buyer") return null;
    const { data, error } = await admin.generateLink({ type: "magiclink", email, options: { data: { role: "buyer" }, redirectTo: siteUrl() } });
    if (error) {
      console.warn(`welcome: no sign-in link (${/^[\w-]{1,40}$/.test(String(error.code)) ? error.code : error.status || "error"})`);
      return null;
    }
    if (data?.user?.user_metadata?.role !== "buyer") return null; // made by someone else meanwhile: never a non-buyer's link
    const link = data?.properties?.action_link;
    return typeof link === "string" && link.startsWith("https://") ? link : null;
  } catch (e) {
    console.warn(`welcome: no sign-in link (${/^[A-Za-z]{1,40}$/.test(String(e?.name)) ? e.name : "error"})`);
    return null;
  }
}
