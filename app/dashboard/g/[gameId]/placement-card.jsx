"use client";

import { createContext, useContext, useState, useTransition } from "react";
import { PLACE_TYPES } from "../../../../lib/placement-organization";
import { STATUS_LABELS, effectiveType, offReason, typeIsSuggested, typeLabel } from "../../../../lib/placement-view";
import { addressOf, locateUrl } from "../../../../lib/unity-link";
import { changeTags, movePlacements, renamePlacement, setPlaceType } from "../../placement-actions";

// What the Placements tab adds to a placement's own card (the picture editor): a tick box while editing,
// the on/off switch, chips, and the Details, Where it stands and Tags sections. The organizer provides the
// context; the card (surface-card.jsx) places these pieces inside itself, so a placement stays one plate.

export const OrgContext = createContext(null);

/** What the organizer knows about one placement, or null outside the organizer (the plain card list). */
export function useOrg(placementId) {
  const org = useContext(OrgContext);
  const item = org?.items.get(placementId);
  if (!item) return null;
  return { ...org, item, state: org.stateOf(item) };
}

const CUSTOM = "__custom";

function useAction() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState(null);
  function run(promise) {
    setMessage(null);
    startTransition(async () => {
      const result = await promise.catch(() => ({ error: "Connection lost. Try again." }));
      if (result?.error) setMessage({ kind: "error", text: result.error });
      else {
        if (result?.warning) setMessage({ kind: "note", text: result.warning });
      }
    });
  }
  return { message, setMessage, run, pending };
}

/** Over the picture: the tick box while editing, and a badge when the placement is switched off. */
export function CardOverlay({ placementId }) {
  const org = useOrg(placementId);
  if (!org) return null;
  const { item, state, editing, selected, onSelect } = org;
  return (
    <>
      {state === "off" && <span className="org-offbadge">Off: shows nothing in the game</span>}
      {editing && (
        <label className="org-pick">
          <input type="checkbox" checked={selected.has(item.id)} onChange={() => onSelect(item.id)} />
          <span className="sr-only">Select {item.label}</span>
        </label>
      )}
    </>
  );
}

/** Next to the name: how the placement stands, and its switch. */
export function CardStatus({ placementId }) {
  const org = useOrg(placementId);
  if (!org) return null;
  const { item, state } = org;
  const on = item.enabled !== false;
  return (
    <span className="org-status">
      <span className={`org-state is-${state}`}>{STATUS_LABELS[state]}</span>
      <button
        type="button"
        className="own-switch"
        role="switch"
        aria-checked={on}
        aria-label={`${on ? "Switch off" : "Switch on"} ${item.label}`}
        title="Show ads on this placement"
        onClick={() => org.switchPlacements([item.id], !on)}
      >
        <span className="own-knob" />
      </button>
    </span>
  );
}

/** Under the name: shared or unique, the kind of spot, and why it is off when that is not its own switch. */
export function CardChips({ placementId }) {
  const org = useOrg(placementId);
  if (!org) return null;
  const { item, state, ctx } = org;
  const places = item.places.length;
  const type = effectiveType(item);
  const why = state === "off" || state === "partly" ? offReason(item, ctx) : "";
  return (
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
      {why && why !== "Switched off" && <span className="org-chip org-chip-off">{why}</span>}
    </div>
  );
}

/** Details, Where it stands and Tags: three folding sections at the foot of the card. */
export function CardSections({ placementId }) {
  const org = useOrg(placementId);
  const [open, setOpen] = useState({ details: false, places: false, tags: false });
  if (!org) return null;
  const toggle = (key) => setOpen((current) => ({ ...current, [key]: !current[key] }));
  const { item } = org;
  return (
    <div className="org-sections">
      <Section title="Details" open={open.details} onToggle={() => toggle("details")}>
        <Details org={org} />
      </Section>
      <Section title="Where it stands" count={item.places.length} open={open.places} onToggle={() => toggle("places")}>
        <Places org={org} />
      </Section>
      <Section title="Tags" count={item.tags.length} open={open.tags} onToggle={() => toggle("tags")}>
        <Tags org={org} />
      </Section>
    </div>
  );
}

function Section({ title, count, open, onToggle, children }) {
  return (
    <div className="org-section">
      <button type="button" className="org-disclose" onClick={onToggle} aria-expanded={open}>
        <span className="org-caret" aria-hidden="true">{open ? "▾" : "▸"}</span>
        <span>{title}</span>
        {count !== undefined && <span className="org-count">· {count}</span>}
      </button>
      {open && <div className="org-section-body">{children}</div>}
    </div>
  );
}

function Details({ org }) {
  const { item, gameId, ctx } = org;
  const { message, setMessage, run, pending } = useAction();
  const [name, setName] = useState(item.label);
  const [folderId, setFolderId] = useState(item.folderId ?? "");
  const folderChanged = folderId !== (item.folderId ?? "");
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
      setMessage({ kind: "note", text: "ID copied." });
    } catch {
      setMessage({ kind: "error", text: "Could not copy. Select the ID and copy it by hand." });
    }
  }

  const renamed = name.trim() !== "" && name.trim() !== item.label;

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

        <span className="org-key">Folder</span>
        <div className="org-val">
          <select className="field" value={folderId} aria-label="Folder" onChange={(event) => setFolderId(event.target.value)}>
            <option value="">No folder</option>
            {ctx.folders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
                {folder.enabled === false ? " (off)" : ""}
              </option>
            ))}
          </select>
          {folderChanged && (
            <button className="button button-quiet button-small" type="button" disabled={pending} onClick={() => run(movePlacements({ gameId, ids: [item.id], folderId: folderId || null }))}>
              {pending ? "Saving…" : "Save"}
            </button>
          )}
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

        <span className="org-key">Name</span>
        <form
          className="org-val"
          onSubmit={(event) => {
            event.preventDefault();
            if (renamed) run(renamePlacement({ placementId: item.id, label: name.trim() }));
          }}
        >
          <input className="field" value={name} maxLength={120} onChange={(event) => setName(event.target.value)} aria-label="Placement name" />
          {renamed && (
            <button className="button button-quiet button-small" type="submit">
              Save
            </button>
          )}
        </form>
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
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    try {
      const response = await fetch(locateUrl(item.externalId, place), { signal: controller.signal });
      const body = await response.json().catch(() => ({}));
      setLink(response.ok ? { kind: "note", text: "Shown in Unity." } : { kind: "error", text: body.error || "Unity could not find it. Open the right scene and try again." });
    } catch {
      setLink({
        kind: "error",
        text: "Could not reach Unity. Open this project in the Unity editor (DeusADS SDK 0.8 or newer), or copy the address and find it by hand.",
      });
    } finally {
      clearTimeout(timer);
    }
  }

  async function copyAddress(place) {
    try {
      await navigator.clipboard.writeText(addressOf(place));
      setLink({ kind: "note", text: "Address copied." });
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

function Tags({ org }) {
  const { item, gameId } = org;
  const { message, run } = useAction();
  const [text, setText] = useState("");
  return (
    <>
      <div className="org-chips">
        {item.tags.length === 0 && <span className="muted-line">No tags.</span>}
        {item.tags.map((tag) => (
          <span className="org-chip org-chip-tag" key={tag}>
            {tag}
            <button type="button" className="org-x" aria-label={`Remove tag ${tag}`} onClick={() => run(changeTags({ gameId, ids: [item.id], remove: [tag] }))}>
              ×
            </button>
          </span>
        ))}
      </div>
      <form
        className="org-val"
        onSubmit={(event) => {
          event.preventDefault();
          if (!text.trim()) return;
          run(changeTags({ gameId, ids: [item.id], add: [text] }));
          setText("");
        }}
      >
        <input className="field" value={text} maxLength={30} placeholder="Add a tag" onChange={(event) => setText(event.target.value)} aria-label="New tag" />
        <button className="button button-quiet button-small" type="submit" disabled={!text.trim()}>
          Add
        </button>
      </form>
      <Message message={message} />
    </>
  );
}

function Message({ message }) {
  if (!message) return null;
  return (
    <div className={message.kind === "error" ? "error" : "muted-line"} role={message.kind === "error" ? "alert" : "status"}>
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

function CopyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </svg>
  );
}

function CubeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2.5l8.5 4.8v9.4L12 21.5l-8.5-4.8V7.3z" />
      <path d="M3.8 7.4L12 12l8.2-4.6M12 12v9.3" />
    </svg>
  );
}
