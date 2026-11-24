// How long ago, in words ("5 minutes ago", "2 days ago"): Admin -> Orders, "Left in the cart".
const MINUTE = 60 * 1000;
export function agoWords(iso, now = Date.now()) {
  const minutes = Math.floor((now - Date.parse(iso || "")) / MINUTE);
  if (!Number.isFinite(minutes)) return "";
  if (minutes < 1) return "just now";
  const [n, unit] = minutes < 60 ? [minutes, "minute"] : minutes < 24 * 60 ? [Math.floor(minutes / 60), "hour"] : [Math.floor(minutes / (24 * 60)), "day"];
  return `${n} ${unit}${n === 1 ? "" : "s"} ago`;
}
