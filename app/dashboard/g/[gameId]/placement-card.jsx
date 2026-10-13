"use client";

import { createContext, useContext, useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { PLACE_TYPES } from "../../../../lib/placement-organization";
import { STATUS_LABELS, effectiveType, offReason, typeIsSuggested, typeLabel } from "../../../../lib/placement-view";
import { addressOf, locateUrl } from "../../../../lib/unity-link";
import { changeTags, setPlaceType } from "../../placement-actions";

// What the Placements tab adds to a placement's own card (the picture editor): the handle (grip, or a tick
// box while editing), the name you rename by clicking it, the "⋮" menu, the on/off switch, and the row of chips
// and tags. Menus and small panels (Details, Where it stands, add a tag, pick a scene) float over the page,
// so opening one never changes the size of a card or moves its neighbours. The organizer provides the
// context and draws the floating layer once; the card (surface-card.jsx) places the pieces inside itself.

export const OrgContext = createContext(null);

/** What the organizer knows about one placement, or null outside the organizer (the plain card list). */
export function useOrg(placementId) {
  const org = useContext(OrgContext);
  const item = org?.items.get(placementId);
  if (!item) return null;
  return { ...org, item, state: org.stateOf(item) };
}

const CUSTOM = "__custom";
const SHOWN_TAGS = 3; // tags written on the card itself; the rest are in Details

function useAction() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState(null);
  function run(promise, after, undo) {
    setMessage(null);
    startTransition(async () => {
      const result = await promise.catch(() => ({ error: "Connection lost. Try again." }));
      if (result?.error) {
        undo?.();
        setMessage({ kind: "error", text: result.error });
      }
      else {
        if (result?.warning) setMessage({ kind: "note", text: result.warning });
        after?.();
      }
    });
  }
  return { message, setMessage, run, pending };
}

/** What the placement is doing now, in one phrase: its own switch first, then its folder, then what is on it. */
function statusOf(item, state, ctx) {
  if (item.enabled === false) return { key: "off", text: "Inactive" };
  const folder = item.folderId ? (ctx.folders ?? []).find((entry) => entry.id === item.folderId) : null;
  if (folder && folder.enabled === false) return { key: "folder", text: "Folder is off" };
  if (state === "showing") return { key: state, text: "Active" };
  if (state === "empty") return { key: state, text: "No pictures" };
  return { key: state, text: STATUS_LABELS[state] };
}

/** Left of the name: the grip to drag the card by, or the tick box while editing. */
export function CardHandle({ placementId }) {
  const org = useOrg(placementId);
  if (!org) return null;
  const { item, editing, selected, onSelect } = org;
  if (editing) {
    return (
      <label className="org-pick">
        <input type="checkbox" checked={selected.has(item.id)} onChange={() => onSelect(item.id)} />
        <span className="sr-only">Select {item.label}</span>
      </label>
    );
  }
  return (
    <span className="org-grip" data-grip="1" aria-hidden="true" title="Drag to another folder">
      <svg width="10" height="16" viewBox="0 0 10 16">
        {[3, 8, 13].flatMap((y) => [2.5, 7.5].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.4" fill="currentColor" />))}
      </svg>
    </span>
  );
}

/** Under the picture: how the placement stands (Active, Inactive, Folder is off, No pictures), and its switch. */
export function CardStatus({ placementId }) {
  const org = useOrg(placementId);
  if (!org) return null;
  const { item, state, ctx, busy } = org;
  const on = item.enabled !== false;
  const working = busy.has(`p:${item.id}`);
  const status = statusOf(item, state, ctx);
  const dim = on && (status.key === "folder" || status.key === "empty");
  return (
    <span className="org-status">
      <span className={`org-state is-${status.key}`}>{status.text}</span>
      <button
        type="button"
        className={`own-switch${working ? " is-busy" : ""}${dim ? " is-dim" : ""}`}
        role="switch"
        aria-checked={on}
        aria-busy={working}
        aria-label={`${on ? "Switch off" : "Switch on"} ${item.label}`}
        title="Show ads on this placement"
        disabled={working}
        onClick={() => org.switchPlacements([item.id], !on)}
      >
        <span className="own-knob" />
        {working && <span className="own-spin" aria-hidden="true" />}
      </button>
    </span>
  );
}

/** The name at the top of the card. Click it and the field opens right there; Enter or a click elsewhere saves, Escape cancels. */
export function CardName({ placementId, label }) {
  const org = useOrg(placementId);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(label);
  const finished = useRef(false);
  if (!org) {
    return (
      <div className="surface-label" title={label}>
        {label}
      </div>
    );
  }
  const { item } = org;
  function open() {
    finished.current = false;
    setName(item.label);
    setEditing(true);
  }
  function save() {
    if (finished.current) return;
    finished.current = true;
    const next = name.trim();
    setEditing(false);
    // The new name shows at once, dimmed, until the list from the server carries it.
    if (next !== "" && next !== item.label) org.renameItem(item.id, next);
  }
  return (
    <div className="org-name">
      {editing ? (
        <input
          className="field org-name-input"
          value={name}
          maxLength={120}
          autoFocus
          aria-label="Placement name"
          data-nodrag="1"
          onFocus={(event) => event.target.select()}
          onChange={(event) => setName(event.target.value)}
          onBlur={save}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              save();
            } else if (event.key === "Escape") {
              finished.current = true;
              setEditing(false);
            }
          }}
        />
      ) : (
        <button
          type="button"
          className={`org-name-btn${item.labelPending ? " is-pending" : ""}`}
          title={item.labelPending ? "Saving the new name…" : "Click to rename"}
          aria-busy={item.labelPending ? true : undefined}
          onClick={open}
        >
          {item.label}
          {item.labelPending && <Spinner />}
        </button>
      )}
    </div>
  );
}

/** The "⋮" button in the card's top row; the menu itself floats (CardPopups). */
export function CardMenuButton({ placementId }) {
  const org = useOrg(placementId);
  if (!org) return null;
  const { item, pop } = org;
  return (
    <button
      type="button"
      className="org-menu-btn"
      data-nodrag="1"
      data-popbtn="1"
      aria-haspopup="menu"
      aria-expanded={pop?.id === item.id && pop.kind === "menu"}
      aria-label={`More actions for ${item.label}`}
      title="More"
      onClick={(event) => org.togglePop(event, item.id, "menu")}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <circle cx="12" cy="5" r="2" />
        <circle cx="12" cy="12" r="2" />
        <circle cx="12" cy="19" r="2" />
      </svg>
    </button>
  );
}

/** Splits what was typed into tags: commas separate them, repeats and empty ones are dropped. */
function splitTags(text, already = []) {
  const seen = new Set(already.map((tag) => tag.toLowerCase()));
  const out = [];
  for (const part of String(text).split(",")) {
    const tag = part.trim().replace(/\s+/g, " ").slice(0, 30);
    if (!tag || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    out.push(tag);
  }
  return out;
}

/** Adding and removing one placement's tags; a change shows at once and is undone if the server refuses. */
function useTagEdit(org) {
  const { item, gameId } = org;
  const { message, run, pending } = useAction();
  const [adding, setAdding] = useState([]);
  const [removing, setRemoving] = useState([]);
  useEffect(() => {
    setAdding((current) => current.filter((tag) => !item.tags.includes(tag)));
    setRemoving((current) => current.filter((tag) => item.tags.includes(tag)));
  }, [item.tags]);
  const shown = [...item.tags, ...adding.filter((tag) => !item.tags.includes(tag))];
  const known = [...new Set([...org.items.values()].flatMap((entry) => entry.tags))].sort((a, b) => a.localeCompare(b));
  const shownLower = new Set(shown.map((tag) => tag.toLowerCase()));
  const offered = known.filter((tag) => !shownLower.has(tag.toLowerCase()));
  const undo = () => {
    setAdding([]);
    setRemoving([]);
  };
  function add(text) {
    const list = splitTags(text, shown);
    if (list.length === 0) return false;
    setAdding((current) => [...current, ...list]);
    run(changeTags({ gameId, ids: [item.id], add: list }), undefined, undo);
    return true;
  }
  function remove(tag) {
    setRemoving((current) => [...current, tag]);
    run(changeTags({ gameId, ids: [item.id], remove: [tag] }), undefined, undo);
  }
  return { shown, offered, adding, removing, add, remove, message, pending };
}

function TagChip({ tag, edit }) {
  const busy = edit.adding.includes(tag) || edit.removing.includes(tag);
  return (
    <span className={`org-chip org-chip-tag${busy ? " is-busy" : ""}`}>
      {tag}
      {busy ? (
        <Spinner />
      ) : (
        <button type="button" className="org-x" aria-label={`Remove tag ${tag}`} onClick={() => edit.remove(tag)}>
          ×
        </button>
      )}
    </span>
  );
}

/** Under "Open to advertisers": the kind of spot, the tags (each can be removed here), and "+ Tag". */
export function CardTagRow({ placementId }) {
  const org = useOrg(placementId);
  const edit = useTagEdit(org ?? { item: { tags: [], id: "" }, gameId: "", items: new Map() });
  if (!org) return null;
  const { item, state, ctx, pop } = org;
  const places = item.places.length;
  const type = effectiveType(item);
  const why = state === "off" || state === "partly" ? offReason(item, ctx) : "";
  const tags = edit.shown;
  return (
    <div className="org-summary">
      <div className="org-chips">
        {item.shared && places > 1 && (
          <span className="org-chip org-chip-places" title="Copies of one prefab share this placement">
            ×{places} places
          </span>
        )}
        {!item.shared && (
          <span className="org-chip org-chip-unique" title="This placement has an ID of its own">
            unique
          </span>
        )}
        <span
          className={`org-chip${typeIsSuggested(item) ? " org-chip-guess" : ""}`}
          title={typeIsSuggested(item) ? "Suggested automatically. Change it in Details." : undefined}
        >
          {type ? typeLabel(type) : "Type not determined"}
          {typeIsSuggested(item) ? " (auto)" : ""}
        </span>
        {why && why !== "Switched off" && !/^(Folder|Its folder)/.test(why) && <span className="org-chip org-chip-off">{why}</span>}
        {tags.slice(0, SHOWN_TAGS).map((tag) => (
          <TagChip key={tag} tag={tag} edit={edit} />
        ))}
        {tags.length > SHOWN_TAGS && <span className="org-chip org-chip-tag" title="The rest are in Details">+{tags.length - SHOWN_TAGS}</span>}
        <button
          type="button"
          className="org-chip org-chip-add"
          data-popbtn="1"
          aria-haspopup="dialog"
          aria-expanded={pop?.id === item.id && pop.kind === "tag"}
          onClick={(event) => org.togglePop(event, item.id, "tag")}
        >
          + Tag
        </button>
      </div>
      {edit.message?.kind === "error" && (
        <div className="error" role="alert">
          {edit.message.text}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- the floating layer

const MENU_WIDTH = 236;

/**
 * Drawn once by the organizer. Shows whichever menu or panel is open (org.pop): the "⋮" menu, the small
 * "add a tag" panel, or the scene picker laid over the card. Outside click, Escape, scrolling the page or
 * resizing the window closes it.
 */
export function CardPopups() {
  const ctx = useContext(OrgContext);
  const pop = ctx?.pop ?? null;
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const setPop = ctx?.setPop;
  useEffect(() => {
    if (!pop || !setPop) return;
    const close = () => setPop(null);
    const down = (event) => {
      if (event.target.closest?.(".org-pop, [data-popbtn]")) return;
      close();
    };
    const scroll = (event) => {
      if (event.target?.closest?.(".org-pop")) return;
      close();
    };
    const key = (event) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key);
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", close);
    };
  }, [pop, setPop]);
  if (!ready || !pop) return null;
  const item = ctx.items.get(pop.id);
  if (!item) return null;
  const org = { ...ctx, item, state: ctx.stateOf(item) };
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const a = pop.anchor;
  let body;
  if (pop.kind === "menu") {
    const left = Math.max(8, Math.min(vw - MENU_WIDTH - 8, a.right - MENU_WIDTH));
    const flip = left + MENU_WIDTH + 350 > vw;
    const up = vh - a.bottom < 560;
    body = (
      <div className={`org-pop org-menu${flip ? " is-flip" : ""}${up ? " is-up" : ""}`} role="menu" style={{ left, top: a.bottom + 6, width: MENU_WIDTH }}>
        <CardMenu org={org} />
      </div>
    );
  } else if (pop.kind === "tag") {
    const width = 290;
    const left = Math.max(8, Math.min(vw - width - 8, a.left));
    const style = vh - a.bottom >= 220 ? { left, width, top: a.bottom + 6 } : { left, width, bottom: vh - a.top + 6 };
    body = (
      <div className="org-pop is-tag" role="dialog" aria-label="Add a tag" style={style}>
        <PopHead title="Add a tag" onClose={() => setPop(null)} />
        <div className="org-pop-sec">
          <TagAdder org={org} current />
        </div>
      </div>
    );
  } else {
    const c = pop.cell;
    body = (
      <div className="org-pop is-card" role="dialog" aria-label="Show in Unity" style={{ left: c.left, top: c.top, width: c.width, height: c.height }}>
        <PopHead title="Show in Unity: pick a scene" onClose={() => setPop(null)} />
        <div className="org-pop-scroll">
          <div className="org-scene-list">
            <Places org={org} />
          </div>
        </div>
      </div>
    );
  }
  return createPortal(body, document.body);
}

function PopHead({ title, onClose }) {
  return (
    <div className="org-pop-head">
      <span>{title}</span>
      <button type="button" className="org-icon-button org-icon-small" aria-label="Close" onClick={onClose}>
        ×
      </button>
    </div>
  );
}

function CardMenu({ org }) {
  const { item, ctx, setPop } = org;
  const [copied, setCopied] = useState(false);
  // the folder the placement is in now is always first
  const targets = [{ id: null, label: "No folder" }, ...ctx.folders.map((folder) => ({ id: folder.id, label: folder.name + (folder.enabled === false ? " (off)" : "") }))];
  const here = (target) => (target.id ?? null) === (item.folderId ?? null);
  const ordered = [...targets.filter(here), ...targets.filter((target) => !here(target))];

  async function copyId() {
    setPop(null);
    try {
      await navigator.clipboard.writeText(item.externalId);
      org.say({ kind: "ok", text: "ID copied." });
    } catch {
      org.say({ kind: "error", text: "Could not copy. Select the ID in Details and copy it by hand." });
    }
  }
  async function showInUnity() {
    if (item.places.length > 1) return setPop({ id: item.id, kind: "unity", cell: org.pop.cell });
    setPop(null);
    if (item.places.length === 0) return org.say({ kind: "note", text: "Unity has not reported where this one stands yet. Press Send placements in Unity." });
    org.say({ kind: "note", text: "Asking Unity…" });
    org.say(await askUnity(item, item.places[0]));
  }

  return (
    <>
      <div className="org-sub is-wide">
        <button type="button" className="org-menu-item" role="menuitem" aria-haspopup="true">
          <ListIcon />
          <span>Details</span>
          <span className="org-menu-caret" aria-hidden="true">▸</span>
        </button>
        <div className="org-flyout org-fly-details" role="dialog" aria-label="Details">
          <div className="org-pop-scroll">
            <DetailsBody org={org} />
          </div>
        </div>
      </div>
      <div className="org-sub">
        <button type="button" className="org-menu-item" role="menuitem" aria-haspopup="true">
          <FolderIcon />
          <span>Move to folder</span>
          <span className="org-menu-caret" aria-hidden="true">▸</span>
        </button>
        <div className="org-flyout org-fly-move" role="menu">
          {ordered.map((target) => (
            <button
              key={target.id ?? "none"}
              type="button"
              className="org-menu-item"
              role="menuitem"
              disabled={here(target)}
              onClick={() => {
                setPop(null);
                org.moveItems([item.id], target.id);
              }}
            >
              <FolderIcon />
              <span>{target.label}</span>
              {here(target) && <span className="org-menu-tick">current</span>}
            </button>
          ))}
        </div>
      </div>
      <div className="org-menu-sep" />
      <button type="button" className="org-menu-item" role="menuitem" onClick={copyId}>
        <CopyIcon small />
        Copy ID
      </button>
      <button type="button" className="org-menu-item" role="menuitem" onClick={showInUnity}>
        <CubeIcon small />
        <span>Show in Unity</span>
        {item.places.length > 1 && <span className="org-menu-caret">{item.places.length} scenes</span>}
      </button>
    </>
  );
}

/** Asks the Unity editor (it listens on this computer) to select one place; resolves to a message. */
async function askUnity(item, place) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(locateUrl(item.externalId, place), { signal: controller.signal });
    const body = await response.json().catch(() => ({}));
    return response.ok ? { kind: "ok", text: "Shown in Unity." } : { kind: "error", text: body.error || "Unity could not find it. Open the right scene and try again." };
  } catch {
    return {
      kind: "error",
      text: "Could not reach Unity. Open this project in the Unity editor (DeusADS SDK 0.8 or newer), or copy the address and find it by hand.",
    };
  } finally {
    clearTimeout(timer);
  }
}

/** The panel that flies out of the menu: ID and place type, where it stands, and its tags. */
function DetailsBody({ org }) {
  const edit = useTagEdit(org);
  return (
    <>
      <div className="org-pop-sec">
        <Details org={org} />
      </div>
      <div className="org-pop-sec">
        <h4 className="org-pop-title">Where it stands · {org.item.places.length}</h4>
        <Places org={org} />
      </div>
      <div className="org-pop-sec">
        <h4 className="org-pop-title">Tags · {edit.shown.length}</h4>
        <div className="org-chips">
          {edit.shown.length === 0 && <span className="muted-line">No tags.</span>}
          {edit.shown.map((tag) => (
            <TagChip key={tag} tag={tag} edit={edit} />
          ))}
        </div>
        <TagAdder org={org} edit={edit} />
      </div>
    </>
  );
}

/** A field for a new tag (commas separate several), and the tags used elsewhere in the game, one click to add. */
function TagAdder({ org, edit: given, current = false }) {
  const own = useTagEdit(org);
  const edit = given ?? own;
  const [text, setText] = useState("");
  return (
    <form
      className="org-tag-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (edit.add(text)) setText("");
      }}
    >
      {current && edit.shown.length > 0 && (
        <>
          <span className="org-pop-title">On this placement</span>
          <span className="org-chips">
            {edit.shown.map((tag) => (
              <TagChip key={tag} tag={tag} edit={edit} />
            ))}
          </span>
        </>
      )}
      <div className="org-val">
        <input className="field org-tag-field" value={text} maxLength={60} placeholder="New tag name" aria-label="New tag" onChange={(event) => setText(event.target.value)} />
        <button className="button button-quiet button-small" type="submit" disabled={splitTags(text, edit.shown).length === 0}>
          {edit.pending ? <Spinner /> : "Add"}
        </button>
      </div>
      {edit.offered.length > 0 && (
        <>
          <span className="org-pop-title">Your other tags</span>
          <span className="org-chips">
            {edit.offered.map((tag) => (
              <button key={tag} type="button" className="org-chip org-chip-pick" onClick={() => edit.add(tag)}>
                + {tag}
              </button>
            ))}
          </span>
        </>
      )}
      <Message message={edit.message} />
    </form>
  );
}

function Details({ org }) {
  const { item, gameId } = org;
  const { message, setMessage, run } = useAction();
  const known = (id) => PLACE_TYPES.some((entry) => entry.id === id);
  const [customOpen, setCustomOpen] = useState(false);
  const [customType, setCustomType] = useState(item.placeType && !known(item.placeType) ? item.placeType : "");
  const customActive = customOpen || Boolean(item.placeType && !known(item.placeType));

  function chooseType(value) {
    if (value === CUSTOM) return setCustomOpen(true);
    setCustomOpen(false);
    setCustomType("");
    run(setPlaceType({ gameId, ids: [item.id], type: value === "" ? null : value }));
  }

  async function copyId() {
    try {
      await navigator.clipboard.writeText(item.externalId);
      setMessage({ kind: "ok", text: "ID copied." });
    } catch {
      setMessage({ kind: "error", text: "Could not copy. Select the ID and copy it by hand." });
    }
  }

  return (
    <>
      <div className="org-grid">
        <span className="org-key">ID</span>
        <div className="org-val" title={item.shared ? "Shared by every copy of the prefab. Change this in Unity: “Make unique” or “Share with…”." : "Its own ID. Change this in Unity: “Share with…”."}>
          <code className="org-code">{item.externalId}</code>
          <IconButton label="Copy ID" onClick={copyId}>
            <CopyIcon />
          </IconButton>
        </div>

        <span className="org-key">Place type</span>
        <div className="org-val org-val-stack">
          <select className="field" value={customActive ? CUSTOM : item.placeType ?? ""} aria-label="Place type" onChange={(event) => chooseType(event.target.value)}>
            <option value="">{item.suggestedType ? `Automatic (${typeLabel(item.suggestedType)})` : "Automatic"}</option>
            {PLACE_TYPES.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
            <option value={CUSTOM}>Other…</option>
          </select>
          {customActive && (
            <form
              className="org-val"
              onSubmit={(event) => {
                event.preventDefault();
                run(setPlaceType({ gameId, ids: [item.id], type: customType }));
                setCustomOpen(false);
              }}
            >
              <input className="field" value={customType} maxLength={40} placeholder="e.g. Boss arena" onChange={(event) => setCustomType(event.target.value)} aria-label="Custom place type" />
              <button className="button button-quiet button-small" type="submit">
                Save
              </button>
            </form>
          )}
        </div>
      </div>
      <Message message={message} />
    </>
  );
}

function Places({ org }) {
  const { item } = org;
  const [link, setLink] = useState(null);

  async function showInUnity(place) {
    setLink({ kind: "note", text: "Asking Unity…" });
    setLink(await askUnity(item, place));
  }

  async function copyAddress(place) {
    try {
      await navigator.clipboard.writeText(addressOf(place));
      setLink({ kind: "ok", text: "Address copied." });
    } catch {
      setLink({ kind: "error", text: "Could not copy. Select the text and copy it by hand." });
    }
  }

  return (
    <>
      {item.places.length === 0 && <p className="muted-line">Unity has not reported where this one stands yet. Press Send placements in Unity.</p>}
      <ul className="org-places">
        {item.places.map((place) => (
          <li key={place.id ?? `${place.scene}/${place.path}`}>
            <span className="org-place-address">
              <span className="org-place-scene">{place.scene || "(no scene)"}</span>
              <span>{place.path || "—"}</span>
            </span>
            <IconButton label="Show in Unity" hint="Show in Unity: select this object in the open Unity editor" onClick={() => showInUnity(place)}>
              <CubeIcon />
            </IconButton>
            <IconButton label="Copy address" hint="Copy address: scene and object path as text" onClick={() => copyAddress(place)}>
              <CopyIcon />
            </IconButton>
          </li>
        ))}
      </ul>
      <Message message={link} />
    </>
  );
}

function Spinner() {
  return <span className="org-spin" aria-hidden="true" />;
}

function Message({ message }) {
  if (!message) return null;
  return (
    <div className={message.kind === "error" ? "error" : message.kind === "ok" ? "org-ok" : "muted-line"} role={message.kind === "error" ? "alert" : "status"}>
      {message.text}
    </div>
  );
}

function IconButton({ label, hint, onClick, children }) {
  return (
    <button type="button" className="org-icon-button" aria-label={label} title={hint ?? label} onClick={onClick}>
      {children}
    </button>
  );
}

function CopyIcon({ small }) {
  const size = small ? 16 : 18;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </svg>
  );
}

function CubeIcon({ small }) {
  const size = small ? 16 : 18;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2.5l8.5 4.8v9.4L12 21.5l-8.5-4.8V7.3z" />
      <path d="M3.8 7.4L12 12l8.2-4.6M12 12v9.3" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 6h16M4 12h16M4 18h10" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h5l2 2.5h8A1.5 1.5 0 0 1 21 9v8.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z" />
    </svg>
  );
}
