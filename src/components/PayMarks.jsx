// The small marks beside the ways to pay (src/components/PayRows.jsx): the same badges as the
// footer's "Accepted Payments" (src/components/Footer.jsx), copied exactly, so the shop shows one
// look for each way everywhere. tests/payWays.test.js checks each one is still the footer's own.
// Only real marks the site already has: Link has none, so its row says it in words.
const visa = <svg viewBox="0 0 48 30" xmlns="http://www.w3.org/2000/svg" aria-label="Visa"><rect width="48" height="30" rx="4" fill="#1A1F71"/><text x="24" y="21" fontFamily="Arial,sans-serif" fontSize="14" fontWeight="bold" fontStyle="italic" fill="#FFFFFF" textAnchor="middle">VISA</text></svg>;
const mastercard = <svg viewBox="0 0 48 30" xmlns="http://www.w3.org/2000/svg" aria-label="Mastercard"><rect width="48" height="30" rx="4" fill="#fff" stroke="#e0e0e0" strokeWidth="1"/><circle cx="18" cy="15" r="9" fill="#EB001B"/><circle cx="30" cy="15" r="9" fill="#F79E1B"/><path d="M24 7.7a9 9 0 0 1 0 14.6A9 9 0 0 1 24 7.7z" fill="#FF5F00"/></svg>;
const klarna = <svg viewBox="0 0 48 30" xmlns="http://www.w3.org/2000/svg" aria-label="Klarna"><rect width="48" height="30" rx="4" fill="#FFB3C7"/><text x="24" y="19.5" fontFamily="Arial,sans-serif" fontSize="10" fontWeight="bold" fill="#0B051D" textAnchor="middle">Klarna.</text></svg>;
const bank = <svg viewBox="0 0 48 30" xmlns="http://www.w3.org/2000/svg" aria-label="Bank"><rect width="48" height="30" rx="4" fill="#fff" stroke="#e0e0e0" strokeWidth="1"/><path d="M6 12.5L13 8l7 4.5z" fill="#1F2A44"/><rect x="7.5" y="13.5" width="2" height="6" fill="#1F2A44"/><rect x="12" y="13.5" width="2" height="6" fill="#1F2A44"/><rect x="16.5" y="13.5" width="2" height="6" fill="#1F2A44"/><rect x="6" y="20.5" width="14" height="2" fill="#1F2A44"/><text x="33" y="19" fontFamily="Arial,sans-serif" fontSize="10" fontWeight="bold" fill="#1F2A44" textAnchor="middle">Bank</text></svg>;
const zelle = <svg viewBox="0 0 48 30" xmlns="http://www.w3.org/2000/svg" aria-label="Zelle"><rect width="48" height="30" rx="4" fill="#6D1ED4"/><text x="24" y="20" fontFamily="Arial,sans-serif" fontSize="13" fontWeight="bold" fill="#FFFFFF" textAnchor="middle">Zelle</text></svg>;
const venmo = <svg viewBox="0 0 48 30" xmlns="http://www.w3.org/2000/svg" aria-label="Venmo"><rect width="48" height="30" rx="4" fill="#3D95CE"/><text x="24" y="20" fontFamily="Arial,sans-serif" fontSize="11" fontWeight="bold" fill="#FFFFFF" textAnchor="middle" letterSpacing=".5">Venmo</text></svg>;
const cashApp = <svg viewBox="0 0 48 30" xmlns="http://www.w3.org/2000/svg" aria-label="Cash App"><rect width="48" height="30" rx="4" fill="#00D632"/><text x="24" y="14" fontFamily="Arial,sans-serif" fontSize="7.5" fontWeight="bold" fill="#FFFFFF" textAnchor="middle" letterSpacing=".3">CASH</text><text x="24" y="23" fontFamily="Arial,sans-serif" fontSize="7.5" fontWeight="bold" fill="#FFFFFF" textAnchor="middle" letterSpacing=".3">APP</text></svg>;

// Each way's marks, by its id (src/lib/payWays.js).
const MARKS = {
  zelle,
  venmo,
  cashapp: cashApp,
  card: <>{visa}{mastercard}</>, // two cards say "card"; Stripe's form takes the rest too
  klarna,
  bank,
};
// The marks of one way (none for a way the site has no mark for).
export default function PayMarks({ way }) {
  return MARKS[way] ?? null;
}
