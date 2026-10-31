// The site's public address for links in emails; previews link to themselves.
export function siteUrl() {
  return process.env.VERCEL_ENV === "production" || !process.env.VERCEL_URL
    ? "https://fonkiart.com"
    : `https://${process.env.VERCEL_URL}`;
}
