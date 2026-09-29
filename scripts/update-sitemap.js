import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sitemapPath = resolve(__dirname, '../public/sitemap.xml');
const DOMAIN = 'https://fonkiart.com';
const today = new Date().toISOString().split('T')[0];

// NOTE: the site is a single-page app with no client-side router — every
// nav item (Catalog, Collections, New, ...) renders at the same URL and the
// page shown depends on localStorage, not the address bar. So "/catalog",
// "/collections" etc. are NOT real, distinct, crawlable URLs — listing them
// here would be fabricating pages Google can't actually reach differently
// from the homepage. The only genuinely distinct, indexable URLs today are
// the homepage and the per-artwork deep links (?artwork=ID), which the app
// does read from the address bar (see the deepLinkId state in App.jsx).
// Giving each section its own real URL is a real, separate project (a
// router) — not something this script can honestly fake.

function urlEntry(loc, priority) {
  return `  <url>\n    <loc>${loc}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>${priority}</priority>\n    <lastmod>${today}</lastmod>\n  </url>`;
}

async function fetchArtworkIds() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.warn('update-sitemap: no Supabase credentials at build time — sitemap will only list the homepage');
    return [];
  }
  try {
    const supabase = createClient(url, key);
    const { data, error } = await supabase.from('Artworks').select('id,price,salePrice,isCollectorsOnly,collectors_only');
    if (error) { console.warn('update-sitemap: could not read Artworks —', error.message); return []; }
    // Same eligibility rule as api/catalog-feed.js: purchasable, non-collectors-only pieces.
    return (data || [])
      .filter(a => !a.isCollectorsOnly && !a.collectors_only && (parseFloat(a.price) > 0 || parseFloat(a.salePrice) > 0))
      .map(a => a.id);
  } catch (e) {
    console.warn('update-sitemap: Artworks fetch failed —', e.message);
    return [];
  }
}

const artworkIds = await fetchArtworkIds();

const entries = [
  urlEntry(`${DOMAIN}/`, '1.0'),
  ...artworkIds.map(id => urlEntry(`${DOMAIN}/?artwork=${id}`, '0.7')),
];

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>\n`;

writeFileSync(sitemapPath, sitemap);
console.log(`sitemap.xml written: 1 static page + ${artworkIds.length} artwork page(s)`);
