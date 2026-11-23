import { useEffect, useState } from "react";
import { storeCall } from "./store";
import { cartSaving } from "./cartMemory";

// Is cart saving on (src/lib/cartMemory.js cartSaving)? false until the server says yes, and
// whenever it can't be asked. App.jsx asks once and hands the answer to the parts that say so:
// the 5-minute box, the welcome window's small print and the Cart page's "saved for" line.
export function useCartSaving() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let live = true;
    cartSaving(storeCall).then((yes) => { if (live) setOn(yes); });
    return () => { live = false; };
  }, []);
  return on;
}
