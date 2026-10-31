import { PW_RULES, pwRulesMet } from "../lib/pwRules";

// Live checklist under a new-password box: each rule turns ✓ as it passes,
// and the list folds into "Good to go" once they all do.
export default function PasswordRules({ value }) {
  const v = value || "";
  if (pwRulesMet(v)) return <p role="status" style={{ fontSize:12, color:"#2d6a4f", fontWeight:600, margin:"8px 0 0" }}>✓ Good to go</p>;
  return (
    <ul role="status" aria-live="polite" style={{ listStyle:"none", padding:0, margin:"8px 0 0", fontSize:12, lineHeight:1.7 }}>
      {PW_RULES.map(r => {
        const ok = r.test(v);
        return <li key={r.id} style={{ color: ok ? "#2d6a4f" : "var(--muted)", fontWeight: ok ? 600 : 400 }}>{ok ? "✓" : "○"} {r.label}</li>;
      })}
    </ul>
  );
}
