import { sizedImage } from "../lib/img";

// An <img> that asks for a picture about `w` pixels wide. If the small copy can't be
// had (service down, monthly allowance used up), it quietly falls back to the original.
export default function Pic({ src, w = 640, q = 75, onError, ...rest }) {
  const small = sizedImage(src, w, q);
  return (
    <img
      decoding="async"
      {...rest}
      src={small}
      onError={(e) => {
        const el = e.currentTarget;
        if (small !== src && el.dataset.orig !== src) { el.dataset.orig = src; el.src = src; return; }
        onError?.(e);
      }}
    />
  );
}
