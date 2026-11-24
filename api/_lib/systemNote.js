// A small JSON note the server keeps for itself in a PRIVATE Storage bucket: the daily reminder's
// "last ran / last sent" (reminders.js), when a coupon went to a buyer who didn't finish paying or
// left art in their cart (couponMail.js), and who asked for no more coupons (unsubscribe.js, one
// note each). Nothing here is ever public: the bucket is made private the first time it is needed.
const BUCKET = "system";

// Storage's answer for a note (or its bucket) that isn't there yet: statusCode "404", "... not found".
const missing = (error) => String(error?.statusCode) === "404" || error?.status === 404 || /not.?found/i.test(error?.message || "");

// The note, or {} when it doesn't exist yet (or can't be read). strict: a note that is there but
// can't be read throws instead, for a check that must never let a thing happen twice.
export async function readNote(db, file, { strict = false } = {}) {
  const { data, error } = await db.storage.from(BUCKET).download(file);
  if (error && strict && !missing(error)) throw new Error(`can't read ${BUCKET}/${file}: ${error.message || error}`);
  if (error || !data) return {};
  try { return JSON.parse(await data.text()) || {}; } catch (e) {
    if (strict) throw new Error(`${BUCKET}/${file} isn't readable: ${e.message}`, { cause: e });
    return {};
  }
}

// The names of the notes in a folder, [] when there are none yet. One that can't be read throws.
const LIST_AT_ONCE = 1000;
export async function listNotes(db, dir) {
  const names = [];
  for (;;) {
    const { data, error } = await db.storage.from(BUCKET).list(dir, { limit: LIST_AT_ONCE, offset: names.length, sortBy: { column: "name", order: "asc" } });
    if (error && !missing(error)) throw new Error(`can't list ${BUCKET}/${dir}: ${error.message || error}`);
    const page = (data || []).map(f => f.name);
    names.push(...page);
    if (page.length < LIST_AT_ONCE) return names;
  }
}

// Saves the whole note. what: the words for an error ("reminder note").
export async function writeNote(db, file, state, what = "note") {
  const put = () => db.storage.from(BUCKET).upload(file, new Blob([JSON.stringify(state)], { type: "application/json" }), { contentType: "application/json", upsert: true });
  let { error } = await put();
  if (error && /not.?found|bucket/i.test(error.message || "")) {
    const made = await db.storage.createBucket(BUCKET, { public: false });
    if (made.error && !/exist/i.test(made.error.message || "")) throw new Error(`${what} bucket: ${made.error.message}`);
    ({ error } = await put());
  }
  if (error) throw new Error(`${what}: ${error.message || error}`);
}
