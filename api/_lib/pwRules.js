// Password rules — THE SERVER'S COPY (the one that can't be skipped), taken from
// DEMAS (StartHere api/_lib/pwrules.js) on 2026-10-31 so both sites ask the same.
// The browser's copy is src/lib/pwRules.js; tests/security.test.js runs every rule
// from both copies against the same passwords, so change one, change both.
// Two copies on purpose: a file under api/ isn't visible to the browser, and
// importing src/ from a Vercel function depends on file tracing outside api/.

export const PW_RULES = [
  { id:'len',   label:'At least 8 characters', test: v => v.length >= 8 },
  { id:'lower', label:'A lowercase letter',    test: v => /[a-z]/.test(v) },
  { id:'upper', label:'An uppercase letter',   test: v => /[A-Z]/.test(v) },
  { id:'num',   label:'A number',              test: v => /\d/.test(v) },
  { id:'sym',   label:'A special character',   test: v => /[^A-Za-z0-9]/.test(v) },
];

export const pwRulesMet = v => PW_RULES.every(r => r.test(String(v ?? "")));

// Labels of the rules NOT met, for an error that says what to fix without
// ever echoing the password back.
export const pwRulesFailed = v => PW_RULES.filter(r => !r.test(String(v ?? ""))).map(r => r.label);
