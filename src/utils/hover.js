// Hover styles for a real mouse only. On a phone a tap fires a fake "mouse enter"
// and never the "leave", so colour changes made with onMouseEnter stuck after a tap.
// Pointer events say which device it was, so touch is simply ignored here.
export function mouseHover(on, off) {
  return {
    onPointerEnter: e => { if (e.pointerType === "mouse") Object.assign(e.currentTarget.style, on); },
    onPointerLeave: e => { if (e.pointerType === "mouse") Object.assign(e.currentTarget.style, off); },
  };
}

// Same idea for hover menus driven by state (open on mouse hover, never on a tap).
export function mouseOnly(fn) {
  return e => { if (e.pointerType === "mouse") fn(e); };
}
