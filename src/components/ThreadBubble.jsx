// One message in a request conversation. Used by the admin and by the customer's page;
// "mine" sits on the right, "theirs" on the left, from whoever is looking.
const when = (iso) => iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";

export default function ThreadBubble({ side, label, at, body }) {
  return (
    <div className={`rq-msg rq-${side}`}>
      <div className="rq-msg-meta">{label}{at ? ` · ${when(at)}` : ""}</div>
      <div className="rq-msg-body">{body}</div>
    </div>
  );
}
