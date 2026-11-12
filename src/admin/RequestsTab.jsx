import { useState, useEffect, useCallback } from "react";
import { adminDb as supabase, adminAction } from "../lib/adminDb";
import ThreadBubble from "../components/ThreadBubble";
import "../threads.css";

// Requests, phone first: a list of cards; tapping one opens the conversation.
// Answers are sent from here and kept with the request (RequestMessages); the
// customer answers on their private page or by replying to the email.
const STATUS = [["new", "New"], ["in_progress", "In progress"], ["completed", "Completed"]];
const statusLabel = (s) => (STATUS.find(([v]) => v === (s || "new")) || STATUS[0])[1];
const day = (iso) => iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";

export default function RequestsTab() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState(null);
  const [setup, setSetup] = useState({ busy: false, note: "" });

  useEffect(() => {
    Promise.resolve(supabase.from("Requests").select("*").order("created_at", { ascending: false }))
      .then(({ data }) => setRequests(data || []))
      .catch(e => console.error("Requests load:", e))
      .finally(() => setLoading(false));
  }, []);

  const patch = (id, fields) => setRequests(list => list.map(r => r.id === id ? { ...r, ...fields } : r));
  const updateStatus = async (id, status) => {
    await supabase.from("Requests").update({ status }).eq("id", id);
    patch(id, { status });
  };
  const deleteRequest = async (id) => {
    if (!window.confirm("Delete this request and its conversation?")) return;
    await supabase.from("Requests").delete().eq("id", id);
    setRequests(list => list.filter(r => r.id !== id));
    setOpenId(null);
  };
  const connectEmail = async () => {
    setSetup({ busy: true, note: "" });
    try {
      const r = await adminAction("inbound-setup");
      setSetup({ busy: false, note: r.ok ? (r.already ? "Email replies were already connected." : "Email replies connected.") : `Brevo said: ${r.message}` });
    } catch (e) { setSetup({ busy: false, note: e.message }); }
  };

  const q = search.toLowerCase();
  const filtered = requests.filter(r => r.name?.toLowerCase().includes(q) || r.email?.toLowerCase().includes(q));
  const open = requests.find(r => r.id === openId) || null;

  return (
    <div className="crm-wrap rq-wrap">
      <div className="crm-header rq-header">
        <span className="crm-title">Requests ({requests.length})</span>
        <button className="btn-s rq-connect" onClick={connectEmail} disabled={setup.busy}>{setup.busy ? "Connecting…" : "Connect email replies"}</button>
      </div>
      {setup.note && <p className="rq-note">{setup.note}</p>}
      <div className={`rq-layout${open ? " has-open" : ""}`}>
        <div className="rq-list">
          <input className="crm-search" placeholder="Search by name or email…" value={search} onChange={e => setSearch(e.target.value)} />
          {loading ? <p className="crm-empty">Loading…</p>
            : filtered.length === 0 ? <p className="crm-empty">No requests yet.</p>
            : filtered.map(r => (
              <button key={r.id} className={`rq-card${r.id === openId ? " active" : ""}`} onClick={() => setOpenId(r.id)}>
                <span className="rq-card-top">
                  <span className="rq-card-name">{(r.status || "new") === "new" && <span className="rq-dot" aria-label="Needs an answer" />}{r.name || r.email || "No name"}</span>
                  <span className="rq-card-date">{day(r.created_at)}</span>
                </span>
                <span className="rq-card-msg">{r.message}</span>
                <span className={`rq-chip rq-chip-${r.status || "new"}`}>{statusLabel(r.status)}</span>
              </button>
            ))}
        </div>
        {open
          ? <RequestDetail key={open.id} request={open} onBack={() => setOpenId(null)} onStatus={updateStatus} onDelete={deleteRequest} onPatch={patch} />
          : <div className="rq-detail rq-detail-empty"><p className="crm-empty">Pick a request to see the conversation.</p></div>}
      </div>
    </div>
  );
}

function RequestDetail({ request: r, onBack, onStatus, onDelete, onPatch }) {
  const [messages, setMessages] = useState([]);
  const [threadNote, setThreadNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState({ ok: false, note: "" });

  const fetchThread = useCallback(() => adminAction("request-thread", { id: r.id }), [r.id]);
  useEffect(() => {
    let live = true;
    fetchThread()
      .then(t => { if (live) { setMessages(t.messages || []); setThreadNote(""); } })
      .catch(e => { if (live) setThreadNote(e.message); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [fetchThread]);

  const send = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    setResult({ ok: false, note: "" });
    try {
      await adminAction("request-reply", { id: r.id, message: text });
      setText("");
      setResult({ ok: true, note: `Sent to ${r.email}.` });
      if ((r.status || "new") === "new") onPatch(r.id, { status: "in_progress" });
      setMessages((await fetchThread()).messages || []);
    } catch (e) { setResult({ ok: false, note: e.message }); }
    finally { setSending(false); }
  };

  return (
    <div className="rq-detail">
      <button className="rq-back" onClick={onBack}>← All requests</button>
      <div className="rq-who">
        <div className="rq-who-name">{r.name || "No name"}</div>
        {r.email && <a className="rq-who-email" href={`mailto:${r.email}`}>{r.email}</a>}
      </div>
      <div className="rq-tools">
        <select className="rq-status" value={r.status || "new"} onChange={e => onStatus(r.id, e.target.value)}>
          {STATUS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
        </select>
        <button className="btn-d" onClick={() => onDelete(r.id)}>Delete</button>
      </div>

      <div className="rq-thread">
        <ThreadBubble side="theirs" label={`${r.name || "Customer"} · request`} at={r.created_at} body={r.message} />
        {loading ? <p className="rq-muted">Loading conversation…</p>
          : messages.map(m => (
            <ThreadBubble key={m.id} side={m.direction === "out" ? "mine" : "theirs"}
              label={m.direction === "out" ? "Fonkiart" : `${r.name || "Customer"} · ${m.via === "email" ? "by email" : "on the site"}`}
              at={m.created_at} body={m.body} />
          ))}
        {threadNote && <p className="rq-muted">{threadNote}</p>}
      </div>

      {r.email
        ? <div className="rq-reply">
            <textarea className="rq-input" rows={4} placeholder={`Write your answer to ${(r.name || "the customer").split(" ")[0]}…`} value={text} onChange={e => setText(e.target.value)} maxLength={5000} />
            <div className="rq-reply-row">
              <span className={`rq-result${result.ok ? " ok" : ""}`}>{result.note}</span>
              <button className="btn-p" onClick={send} disabled={sending || !text.trim()}>{sending ? "Sending…" : "Send"}</button>
            </div>
            <p className="rq-muted">It goes to their email with a link to this conversation, and it is kept here.</p>
          </div>
        : <p className="rq-muted">This request has no email address, so it can't be answered from here.</p>}
    </div>
  );
}

