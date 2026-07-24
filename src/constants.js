import {
  Home, LayoutGrid, Handshake, Mail,
  Heart, Sparkles, Tag, Archive, Layers, Image,
} from "lucide-react";

export const DEFAULT_CATEGORIES = ["The Ladies", "Ocean", "Mountain", "Windows", "Art Prints"];

export const DEFAULT_STATE = {
  items: [],
  categories: DEFAULT_CATEGORIES,
  settings: { zelleContact: "fonkiart@gmail.com", zelleLabel: "email", venmoHandle: "", cashAppHandle: "", stripeLink: "", couponDiscount: 15, instagram: "", facebook: "", tiktok: "", navVisible: {} }
};

export const NAV_ITEMS = [
  { id: "home",        label: "Home",             Icon: Home },
  { id: "catalog",     label: "Original Art",     Icon: LayoutGrid },
  { id: "collections", label: "Collections",      Icon: Layers },
  { id: "artprints",   label: "Art Prints",       Icon: Image },
  { id: "new",         label: "New Collections",   Icon: Sparkles },
  { id: "specials",    label: "Specials",          Icon: Tag },
  { id: "archive",     label: "Past Works",        Icon: Archive },
  { id: "partners",    label: "Partners",          Icon: Handshake },
  { id: "contact",     label: "Contact Us",        Icon: Mail },
  { id: "children",    label: "Children Benefit",  Icon: Heart },
];

export const ADMIN_TASKS = [
  { id:"venmo",      text:"Set your Venmo handle in Settings",                           action: ["settings","zelle"],  note:null },
  { id:"cashapp",    text:"Set your Cash App cashtag in Settings",                      action: ["settings","zelle"],  note:null },
  { id:"zelle",      text:"Confirm Zelle contact is correct",                           action: ["settings","zelle"],  note:null },
  { id:"stripe",     text:"Add your Stripe payment link",                               action: ["settings","stripe"], note:null },
  { id:"social",     text:"Add Instagram, Facebook and TikTok links",                   action: ["settings","social"], note:null },
  { id:"photos",     text:"Upload real artwork photos to the catalog",                  action: ["tab","items"],       note:null },
  { id:"about",      text:"Write the About Us bio",                                     action: null,                  note:"Contact your developer to update the About page text" },
  { id:"ship-rate",  text:"Shipping & Tax: decide flat rate for orders under $75",      action: null,                  note:"e.g. $12.95 domestic flat rate — tell your developer once decided" },
  { id:"ship-tax",   text:"Shipping & Tax: decide which states you collect tax for",    action: null,                  note:"Options: Florida only (7% Broward), all US states, or none for now" },
  { id:"ship-intl",  text:"Shipping & Tax: decide if you ship internationally",         action: null,                  note:"If yes, what flat rate? If no, international orders will see 'US only'" },
  { id:"ship-scope", text:"Shipping & Tax: confirm if Stripe also needs to be updated", action: null,                  note:"Manual checkout (Zelle/Venmo/Cash App) is ready. Stripe may need separate setup in Stripe dashboard." },
];
