import { useState, useEffect, useCallback } from "react";
import { storeCall } from "../lib/store";
import ThreadBubble from "../components/ThreadBubble";
import "../threads.css";

// fonkiart.com/?thread=<token> — the customer's private copy of their conversation
// with the shop, linked from every answer we email them. Anyone holding the link can
// read and answer it, the same as the invoice link.
// `embedded`: shown inside the full site (App.jsx), so the site's own header, menu
// and footer replace this page's logo and "fonkiart.com" link.
export default function ThreadPage({ token, embedded = false }) {
  const [thread, setThread] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState({ ok: false, note: "" });

  const fetchThread = useCallback(() => storeCall("thread", { token }), [token]);
  useEffect(() => {
    let live = true;
    fetchThread()
      .then(t => { if (live) setThread(t); })
      .catch(() => { if (live) setNotFound(true); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [fetchThread]);

  const send = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    setResult({ ok: false, note: "" });
    try {
      await storeCall("thread-reply", { token, message: text });
      setText("");
      setResult({ ok: true, note: "Sent. We'll answer here and by email." });
      setThread(await fetchThread());
    } catch (e) { setResult({ ok: false, note: e.message || "It didn't send. Please try again." }); }
    finally { setSending(false); }
  };

  const logo = embedded ? null : <div className="invoice-logo"><div className="invoice-logo-dot" />Fonkiart</div>;
  const shell = (content) => embedded
    ? <div>
        <div className="page-hero">
          <p className="page-hero-eyebrow">Fonkiart</p>
          <h1 className="page-hero-title">Your Conversation</h1>
        </div>
        <div className="rq-embed">{content}</div>
      </div>
    : <div className="invoice-page">{content}</div>;

  if (loading) return shell(<p className="rq-muted" style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 20 }}>Loading…</p>);
  if (notFound) return shell(
    <div className="invoice-card" style={{ textAlign: "center" }}>
      {logo}
      <p style={{ marginTop: embedded ? 0 : 24, color: "var(--muted)", fontSize: 15 }}>This link is invalid or has expired.</p>
    </div>
  );

  return shell(
    <div className="invoice-card rq-page-card">
      {!embedded && (
        <div className="invoice-header">
          {logo}
          <div className="invoice-tagline">Your conversation with us</div>
        </div>
      )}
      <p className="rq-page-intro">Hi {thread.name || "there"}, here is everything we've said about your request. You can answer right here.</p>

      <div className="rq-thread">
        <ThreadBubble side="mine" label="You · your request" at={thread.original?.at} body={thread.original?.body} />
        {thread.messages.map((m, i) => (
          <ThreadBubble key={i} side={m.from === "you" ? "mine" : "theirs"} label={m.from === "you" ? "You" : "Fonkiart"} at={m.at} body={m.body} />
        ))}
      </div>

      <div className="rq-reply">
        <textarea className="rq-input" rows={4} placeholder="Write your answer…" value={text} onChange={e => setText(e.target.value)} maxLength={5000} />
        <div className="rq-reply-row">
          <span className={`rq-result${result.ok ? " ok" : ""}`}>{result.note}</span>
          <button className="btn-p" onClick={send} disabled={sending || !text.trim()}>{sending ? "Sending…" : "Send"}</button>
        </div>
      </div>
      {!embedded && <p className="rq-muted rq-page-foot"><a href="/">fonkiart.com</a></p>}
    </div>
  );
}
