import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { storeCall } from "../lib/store";
import ThreadBubble from "../components/ThreadBubble";
import Pic from "../components/Pic";
import "../threads.css";

// fonkiart.com/?thread=<token> — the customer's private copy of their conversation
// with the shop, linked from every answer we email them. Anyone holding the link can
// read and answer it, the same as the invoice link.
// `embedded`: shown inside the full site (App.jsx), so the site's own header, menu
// and footer replace this page's logo and "fonkiart.com" link.

const POLL_MS = 15000;                 // new messages appear without a refresh (Andy, 2026-11-13)
const POLL_IDLE_STOP_MS = 60 * 60000;  // after an hour with nothing new, wait for the tab to be reopened
const sameThread = (a, b) => {
  const am = a?.messages || [], bm = b?.messages || [];
  return am.length === bm.length && am[am.length - 1]?.at === bm[bm.length - 1]?.at;
};

// Three pieces of Aliana's art for the header, a different three on each visit.
function pickArt(artworks, seed) {
  const pool = artworks.filter(a => a.image && !a.isSold);
  const score = (a) => { let h = seed; for (const c of String(a.id ?? a.image)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
  return pool.map(a => [score(a), a]).sort((x, y) => x[0] - y[0]).slice(0, 3).map(([, a]) => a);
}

export default function ThreadPage({ token, embedded = false, artworks = [] }) {
  const [thread, setThread] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState({ ok: false, note: "" });
  const [seed] = useState(() => Math.floor(Math.random() * 1e9));
  const art = useMemo(() => pickArt(artworks, seed), [artworks, seed]);
  const threadRef = useRef(null);
  const lastChange = useRef(0);

  const fetchThread = useCallback(() => storeCall("thread", { token }), [token]);
  useEffect(() => {
    let live = true;
    fetchThread()
      .then(t => { if (live) { setThread(t); lastChange.current = Date.now(); } })
      .catch(() => { if (live) setNotFound(true); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [fetchThread]);

  // Keep it current: check every 15 s while the page is on screen, and at once when
  // the customer comes back to the tab. Hidden tabs don't ask.
  const loaded = Boolean(thread);
  useEffect(() => {
    if (!loaded) return;
    let stop = false;
    const refresh = async (always) => {
      if (stop || document.hidden) return;
      if (!always && Date.now() - lastChange.current > POLL_IDLE_STOP_MS) return;
      try {
        const t = await fetchThread();
        if (!stop) setThread(prev => {
          if (sameThread(prev, t)) return prev;
          lastChange.current = Date.now();
          return t;
        });
      } catch { /* a missed check is fine; the next one tries again */ }
    };
    const id = setInterval(() => refresh(false), POLL_MS);
    const onVisible = () => refresh(true);
    document.addEventListener("visibilitychange", onVisible);
    return () => { stop = true; clearInterval(id); document.removeEventListener("visibilitychange", onVisible); };
  }, [loaded, fetchThread]);

  // Open at the latest message (a short pause first, so the welcome and the art are
  // seen), and glide to each new one as it arrives.
  const count = thread?.messages?.length ?? -1;
  const firstScroll = useRef(true);
  useEffect(() => {
    if (count < 0) return;
    const wait = firstScroll.current ? 700 : 0;
    firstScroll.current = false;
    const id = setTimeout(() => {
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      threadRef.current?.lastElementChild?.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    }, wait);
    return () => clearTimeout(id);
  }, [count]);

  const send = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    setResult({ ok: false, note: "" });
    try {
      await storeCall("thread-reply", { token, message: text });
      setText("");
      setResult({ ok: true, note: "Sent. We'll answer here and by email." });
      setThread(await fetchThread());
      lastChange.current = Date.now();
    } catch (e) { setResult({ ok: false, note: e.message || "It didn't send. Please try again." }); }
    finally { setSending(false); }
  };

  const logo = embedded ? null : <div className="invoice-logo"><div className="invoice-logo-dot" />Fonkiart</div>;
  const hero = (
    <div className="page-hero rq-hero">
      <div className="rq-hero-text">
        <p className="page-hero-eyebrow">Your Conversation</p>
        <h1 className="page-hero-title">Welcome Back</h1>
        <p className="rq-hero-sub">Thank you for chatting with us!</p>
      </div>
      {art.length > 0 && (
        <div className="rq-hero-art" aria-hidden="true">
          {art.map(a => <div key={a.id ?? a.image} className="rq-hero-tile"><Pic src={a.image} w={320} alt="" /></div>)}
        </div>
      )}
    </div>
  );
  const shell = (content) => embedded
    ? <div>{hero}<div className="rq-embed">{content}</div></div>
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

      <div className="rq-thread" ref={threadRef}>
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
