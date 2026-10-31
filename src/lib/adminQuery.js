// Records a supabase-js style query (from().select().eq()...) as plain data so the
// server can replay it; awaiting it hands that description to `run`.
const METHODS = ["select", "insert", "update", "upsert", "delete", "eq", "neq", "gt", "gte", "lt", "lte", "in", "is", "like", "ilike", "order", "limit", "range", "single", "maybeSingle"];

export function recordQuery(table, run) {
  const chain = [];
  const q = {};
  for (const m of METHODS) q[m] = (...a) => { chain.push({ m, a }); return q; };
  q.then = (resolve, reject) => run({ kind: "query", table, chain }).then(resolve, reject);
  return q;
}
