import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL      = process.env.VITE_SUPABASE_URL      || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

const COLS = [
  "id","title","description","availability","condition",
  "price","sale_price","link","image_link","brand","google_product_category"
];

function row(a) {
  const available = a.isSold ? "out of stock" : "in stock";
  const basePrice = parseFloat(a.price) || 0;
  const salePrice = parseFloat(a.salePrice) || 0;
  const priceStr  = basePrice ? `${basePrice.toFixed(2)} USD` : "";
  const salePriceStr = salePrice && salePrice < basePrice ? `${salePrice.toFixed(2)} USD` : "";

  const desc = [a.description, a.medium, a.dimensions]
    .filter(Boolean).join(" | ").replace(/"/g, "'").slice(0, 5000);

  return [
    a.id,
    (a.title || "").replace(/"/g, "'"),
    desc,
    available,
    "new",
    priceStr,
    salePriceStr,
    `https://fonkiart.com/?artwork=${a.id}`,
    a.image || (Array.isArray(a.images) ? a.images[0] : "") || "",
    "FonkiArt",
    "Arts & Entertainment > Hobbies & Creative Arts > Artwork"
  ].map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",");
}

export default async function handler(req, res) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return res.status(500).send("Supabase not configured");
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: artworks, error } = await supabase
    .from("Artworks")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("catalog-feed:", error);
    return res.status(500).send(`Database error: ${error.message || JSON.stringify(error)}`);
  }

  const filtered = artworks.filter(a =>
    !a.isCollectorsOnly && !a.collectors_only &&
    (parseFloat(a.price) > 0 || parseFloat(a.salePrice) > 0)
  );
  const csv = [COLS.join(","), ...filtered.map(row)].join("\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.status(200).send(csv);
}
