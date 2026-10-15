// The strip at the top of a game's card on My games: one of a few colours, or a picture the owner uploaded.
// games.cover (migration 0029) holds null (the default colour), "preset:<id>" or "image:<path>".

export const COVERS = [
  { id: "terracotta", name: "Terracotta", css: "linear-gradient(135deg,#a63a18 0%,#e8915a 100%)" },
  { id: "amber", name: "Amber", css: "linear-gradient(135deg,#b8641a 0%,#f0b25e 100%)" },
  { id: "rust", name: "Rust", css: "linear-gradient(135deg,#8a3a1c 0%,#d9a066 100%)" },
  { id: "plum", name: "Plum", css: "linear-gradient(135deg,#5c2a3a 0%,#b06a7a 100%)" },
  { id: "forest", name: "Forest", css: "linear-gradient(135deg,#2f4a3a 0%,#7aa38a 100%)" },
  { id: "stone", name: "Stone", css: "linear-gradient(135deg,#8c7f73 0%,#cfc6bb 100%)" },
];

// The colour a card has until its owner picks one: the first games take these in turn.
const DEFAULTS = ["terracotta", "rust", "stone"];

/** The id of the colour the card at this place in the list has until its owner picks one. */
export const defaultCoverId = (index) => DEFAULTS[index % DEFAULTS.length];

export const COVER_MAX_BYTES = 8 * 1024 * 1024;

/** What a stored value means: { kind: "default" | "preset" | "image", id?, path? }. */
export function parseCover(value) {
  const text = typeof value === "string" ? value : "";
  if (text.startsWith("preset:") && COVERS.some((cover) => cover.id === text.slice(7))) return { kind: "preset", id: text.slice(7) };
  if (text.startsWith("image:") && text.length > 6) return { kind: "image", path: text.slice(6) };
  return { kind: "default" };
}

/** The value to store for a choice, or null when it is not one we know. */
export function coverValue(choice) {
  if (choice == null || choice === "") return null;
  if (typeof choice === "string" && choice.startsWith("preset:") && parseCover(choice).kind === "preset") return choice;
  return undefined;
}

/** The CSS background of a card's strip. `index` is the card's place in the list, which picks its default colour. */
export function coverBackground(value, index, urlOf = () => "") {
  const parsed = parseCover(value);
  if (parsed.kind === "image") {
    const url = urlOf(parsed.path);
    if (url) return `center / cover no-repeat url("${url}")`;
  }
  const id = parsed.kind === "preset" ? parsed.id : DEFAULTS[index % DEFAULTS.length];
  return COVERS.find((cover) => cover.id === id).css;
}
