import { useState } from "react";
import { Copy, Check } from "lucide-react";

// A small button that copies a number (Andy, 2026-11-17: "put a icon / click here to
// copy invoice number next to it everywhere"). Used beside the invoice number on the
// invoice page, its pay lines and the admin order list. Emails can't run a button, so
// they show the number as plain text only.
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers, or the clipboard blocked: copy through a hidden text box.
    try {
      const box = document.createElement("textarea");
      box.value = text;
      box.setAttribute("readonly", "");
      box.style.cssText = "position:fixed;top:0;left:0;opacity:0;";
      document.body.appendChild(box);
      box.select();
      const ok = document.execCommand("copy");
      box.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

// caption: show words on the button too, on a line of its own (Andy, 2026-11-17: the pay
// lines read better as the sentence, then "Tap here to copy to your clipboard [icon]").
export default function CopyButton({ text, label = "Copy invoice number", size = 14, caption = "" }) {
  const [copied, setCopied] = useState(false);
  const onClick = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (await copyText(text)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }
  };
  const tip = copied ? "Copied" : label;
  const icon = copied ? <Check size={size} aria-hidden="true" /> : <Copy size={size} aria-hidden="true" />;
  if (caption) {
    return (
      <button type="button" className={`copy-btn copy-btn-line${copied ? " is-copied" : ""}`} onClick={onClick} aria-label={copied ? "Copied to your clipboard" : `${label} to your clipboard`}>
        <span>{copied ? "Copied to your clipboard" : caption}</span>{icon}
      </button>
    );
  }
  return (
    <button type="button" className={`copy-btn${copied ? " is-copied" : ""}`} onClick={onClick} aria-label={tip} title={tip}>
      {icon}
      {copied && <span className="copy-btn-done">Copied</span>}
    </button>
  );
}
