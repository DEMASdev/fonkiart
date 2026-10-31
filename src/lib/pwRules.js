// Password rules — THE BROWSER'S COPY, for the live checklist. The server's copy
// is api/_lib/pwRules.js and tests/security.test.js keeps the two identical, so
// change one, change both. Same rules as DEMAS (taken 2026-10-31).

export const PW_RULES = [
  { id:'len',   label:'At least 8 characters', test: v => v.length >= 8 },
  { id:'lower', label:'A lowercase letter',    test: v => /[a-z]/.test(v) },
  { id:'upper', label:'An uppercase letter',   test: v => /[A-Z]/.test(v) },
  { id:'num',   label:'A number',              test: v => /\d/.test(v) },
  { id:'sym',   label:'A special character',   test: v => /[^A-Za-z0-9]/.test(v) },
];

export const pwRulesMet = v => PW_RULES.every(r => r.test(String(v ?? "")));
