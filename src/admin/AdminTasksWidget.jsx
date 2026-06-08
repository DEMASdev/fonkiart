import { useState } from "react";
import { ADMIN_TASKS } from "../constants";

export default function AdminTasksWidget({ goToTab, goToSettings }) {
  const [done, setDone] = useState(() => {
    try { return JSON.parse(localStorage.getItem("fonkiart-admin-tasks") || "{}"); } catch { return {}; }
  });
  const [tooltip, setTooltip] = useState(null);

  const toggle = (id) => {
    const next = { ...done, [id]: !done[id] };
    setDone(next);
    localStorage.setItem("fonkiart-admin-tasks", JSON.stringify(next));
  };

  const handleClick = (t) => {
    if (t.action) {
      if (t.action[0] === "tab") goToTab(t.action[1]);
      else if (t.action[0] === "settings") goToSettings(t.action[1]);
    } else {
      setTooltip(tooltip === t.id ? null : t.id);
    }
  };

  const remaining = ADMIN_TASKS.filter(t => !done[t.id]).length;

  return (
    <div style={{ background:"#fff", border:"1px solid var(--border)", padding:"24px 28px", marginTop:2 }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
        <p style={{ fontSize:11, letterSpacing:".14em", textTransform:"uppercase", color:"var(--muted)", margin:0 }}>Pending Tasks</p>
        {remaining === 0
          ? <span style={{ fontSize:12, color:"#2d6a4f", fontWeight:500 }}>✓ All done!</span>
          : <span style={{ fontSize:12, color:"var(--muted)" }}>{remaining} remaining</span>}
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
        {ADMIN_TASKS.map(t => (
          <div key={t.id} style={{ position:"relative" }}>
            <div style={{ display:"flex", alignItems:"center", gap:12, padding:"11px 14px", background:done[t.id]?"#f5f9f5":"#fdfcf8", border:`1px solid ${done[t.id]?"#c3ddc9":"var(--border)"}`, cursor:"pointer", transition:"all .15s" }}>
              <div onClick={() => toggle(t.id)} style={{ width:18, height:18, border:`2px solid ${done[t.id]?"#2d6a4f":"var(--border)"}`, borderRadius:3, background:done[t.id]?"#2d6a4f":"transparent", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, transition:"all .15s" }}>
                {done[t.id] && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
              </div>
              <span onClick={() => handleClick(t)} style={{ fontSize:13, color:done[t.id]?"var(--muted)":"var(--ink)", textDecoration:done[t.id]?"line-through":"none", flex:1, lineHeight:1.4 }}>
                {t.text}
              </span>
              {t.action && !done[t.id] && <span onClick={() => handleClick(t)} style={{ fontSize:11, color:"var(--gold)", letterSpacing:".08em", whiteSpace:"nowrap" }}>Go →</span>}
              {!t.action && !done[t.id] && <span onClick={() => handleClick(t)} style={{ fontSize:11, color:"var(--muted)", letterSpacing:".08em", whiteSpace:"nowrap" }}>ℹ Info</span>}
            </div>
            {tooltip === t.id && t.note && (
              <div style={{ background:"#1c1a18", color:"#fff", fontSize:12, padding:"8px 14px", lineHeight:1.5 }}>{t.note}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
