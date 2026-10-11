"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PLACE_TYPES } from "../../../../lib/placement-organization";
import { STATUS_LABELS, effectiveType, offReason, typeIsSuggested, typeLabel } from "../../../../lib/placement-view";
import { addressOf, locateUrl } from "../../../../lib/unity-link";
import { formatCount } from "../../../../lib/analytics";
import { changeTags, movePlacements, renamePlacement, setPlaceType, setPlacementsEnabled } from "../../placement-actions";

const CUSTOM = "__custom";

/** One placement in the list: a summary line, and when opened its picture editor and details. */
export default function PlacementRow({ gameId, item, state, ctx, selected, onSelect, expanded, onToggle, isHome, onJumpHome, children }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [message, setMessage] = useState(null);
  const [tagText, setTagText] = useState("");
  const [name, setName] = useState(item.label);
  const knownType = (id) => PLACE_TYPES.some((entry) => entry.id === id);
  const [customOpen, setCustomOpen] = useState(false);
  const [customType, setCustomType] = useState(item.placeType && !knownType(item.placeType) ? item.placeType : "");
  const [link, setLink] = useState(null);
  const customActive = customOpen || Boolean(item.placeType && !knownType(item.placeType));

  const type = effectiveType(item);
  // The reason is spelled out only when it is not simply "this one is switched off" (the status already says so).
  const why = state === "off" || state === "partly" ? offReason(item, ctx) : "";
  const reason = why === "Switched off" ? "" : why;
  const shownOn = item.places.length;

  function run(promise) {
    setMessage(null);
    startTransition(async () => {
      const result = await promise.catch(() => ({ error: "Connection lost. Try again." }));
      if (result?.error) setMessage({ kind: "error", text: result.error });
      else {
        if (result?.warning) setMessage({ kind: "note", text: result.warning });
        router.refresh();
      }
    });
  }

  const toggle = (enabled) => run(setPlacementsEnabled({ gameId, ids: [item.id], enabled }));

  function saveName(event) {
    event.preventDefault();
    const next = name.trim();
    if (!next || next === item.label) return;
    run(renamePlacement({ placementId: item.id, label: next }));
  }

  function addTag(event) {
    event.preventDefault();
    if (!tagText.trim()) return;
    run(changeTags({ gameId, ids: [item.id], add: [tagText] }));
    setTagText("");
  }

  function chooseType(value) {
    if (value === CUSTOM) return setCustomOpen(true);
    setCustomOpen(false);
    setCustomType("");
    run(setPlaceType({ gameId, ids: [item.id], type: value === "" ? null : value }));
  }

  function saveCustomType(event) {
    event.preventDefault();
    run(setPlaceType({ gameId, ids: [item.id], type: customType }));
    setCustomOpen(false);
  }

  async function showInUnity(place) {
    setLink({ kind: "note", text: "Asking Unity…" });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    try {
      const response = await fetch(locateUrl(item.externalId, place), { signal: controller.signal });
      const body = await response.json().catch(() => ({}));
      setLink(
        response.ok
          ? { kind: "note", text: "Shown in Unity." }
          : { kind: "error", text: body.error || "Unity could not find it. Open the right scene and try again." }
      );
    } catch {
      setLink({
        kind: "error",
        text: "Could not reach Unity. Open this project in the Unity editor (DeusADS SDK 0.8 or newer), or copy the address and find it by hand.",
      });
    } finally {
      clearTimeout(timer);
    }
  }

  async function copy(text, what) {
    try {
      await navigator.clipboard.writeText(text);
      setLink({ kind: "note", text: `${what} copied.` });
    } catch {
      setLink({ kind: "error", text: "Could not copy. Select the text and copy it by hand." });
    }
  }

  const off = state === "off";

  return (
    <li className={`org-row${off ? " is-off" : ""}${expanded && isHome ? " is-open" : ""}`} id={isHome ? `plc-${item.id}` : undefined}>
      <div className="org-line">
        <label className="org-check">
          <input type="checkbox" checked={selected} onChange={() => onSelect(item.id)} />
          <span className="sr-only">Select {item.label}</span>
        </label>

        <button type="button" className="org-name" onClick={() => (isHome ? onToggle(item.id) : onJumpHome(item.id))} aria-expanded={expanded && isHome}>
          <span className="org-caret" aria-hidden="true">{expanded && isHome ? "▾" : "▸"}</span>
          <span className="org-title">{item.label}</span>
        </button>

        <span className="org-chips">
          {item.shared && shownOn > 1 ? <span className="org-chip" title="Copies of one prefab share this placement">×{shownOn} places</span> : null}
          {!item.shared ? <span className="org-chip" title="This placement has an ID of its own">unique</span> : null}
          <span className="org-chip org-chip-quiet">{item.format || "custom shape"}</span>
          <span className={`org-chip${typeIsSuggested(item) ? " org-chip-guess" : " org-chip-quiet"}`} title={typeIsSuggested(item) ? "Suggested automatically. Open the placement to change it." : undefined}>
            {typeLabel(type)}
            {typeIsSuggested(item) ? " (auto)" : ""}
          </span>
          {item.tags.map((tag) => (
            <span className="org-chip org-chip-tag" key={tag}>
              {tag}
            </span>
          ))}
        </span>

        <span className="org-views num" title="Views in the last 30 days">
          {formatCount(item.views ?? 0)}
        </span>

        <span className={`org-state is-${state}`} title={reason || undefined}>
          {STATUS_LABELS[state]}
        </span>

        <label className="org-switch" title={off && item.enabled !== false ? reason : "Show ads on this placement"}>
          <input type="checkbox" checked={item.enabled !== false} onChange={(event) => toggle(event.target.checked)} />
          <span className="sr-only">{item.enabled !== false ? "Switch off" : "Switch on"} {item.label}</span>
        </label>
      </div>

      {reason && <div className="org-reason">{reason}</div>}
      {!isHome && expanded && <div className="org-reason">Open above, in the first scene it stands in.</div>}

      {expanded && isHome && (
        <div className="org-detail">
          <div className="org-card">{children}</div>

          <div className="org-side">
            <form className="org-field" onSubmit={saveName}>
              <span className="org-field-label">Name</span>
              <span className="row">
                <input className="field" value={name} maxLength={120} onChange={(event) => setName(event.target.value)} aria-label="Placement name" />
                <button className="button button-quiet button-small" type="submit" disabled={!name.trim() || name.trim() === item.label}>
                  Rename
                </button>
              </span>
            </form>

            <div className="org-field">
              <span className="org-field-label">ID</span>
              <span className="row">
                <code className="org-code">{item.externalId}</code>
                <button className="button button-quiet button-small" type="button" onClick={() => copy(item.externalId, "ID")}>
                  Copy ID
                </button>
              </span>
              <span className="muted-line">
                {item.shared ? "Shared by every copy of the prefab. " : "Its own ID, for this one placement. "}
                Change this in Unity: select the placement and use "Make unique" or "Share with…".
              </span>
            </div>

            <div className="org-field">
              <span className="org-field-label">Folder</span>
              <select
                className="field"
                value={item.folderId ?? ""}
                aria-label="Folder"
                onChange={(event) => run(movePlacements({ gameId, ids: [item.id], folderId: event.target.value || null }))}
              >
                <option value="">Not in a folder</option>
                {ctx.folders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                    {folder.enabled === false ? " (off)" : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="org-field">
              <span className="org-field-label">Place type</span>
              <select
                className="field"
                value={customActive ? CUSTOM : item.placeType ?? ""}
                aria-label="Place type"
                onChange={(event) => chooseType(event.target.value)}
              >
                <option value="">{item.suggestedType ? `Automatic (${typeLabel(item.suggestedType)})` : "Automatic (not determined)"}</option>
                {PLACE_TYPES.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.label}
                  </option>
                ))}
                <option value={CUSTOM}>Other…</option>
              </select>
              {customActive && (
                <form className="row" onSubmit={saveCustomType}>
                  <input
                    className="field"
                    value={customType}
                    maxLength={40}
                    placeholder="e.g. Boss arena"
                    onChange={(event) => setCustomType(event.target.value)}
                    aria-label="Custom place type"
                  />
                  <button className="button button-quiet button-small" type="submit">
                    Save
                  </button>
                </form>
              )}
            </div>

            <div className="org-field">
              <span className="org-field-label">Tags</span>
              <span className="org-chips">
                {item.tags.length === 0 && <span className="muted-line">No tags.</span>}
                {item.tags.map((tag) => (
                  <span className="org-chip org-chip-tag" key={tag}>
                    {tag}
                    <button type="button" className="org-x" aria-label={`Remove tag ${tag}`} onClick={() => run(changeTags({ gameId, ids: [item.id], remove: [tag] }))}>
                      ×
                    </button>
                  </span>
                ))}
              </span>
              <form className="row" onSubmit={addTag}>
                <input className="field" value={tagText} maxLength={30} placeholder="Add a tag" onChange={(event) => setTagText(event.target.value)} aria-label="New tag" />
                <button className="button button-quiet button-small" type="submit" disabled={!tagText.trim()}>
                  Add
                </button>
              </form>
            </div>

            <div className="org-field">
              <span className="org-field-label">{item.places.length === 1 ? "Where it stands" : `Where it stands (${item.places.length})`}</span>
              {item.places.length === 0 && <span className="muted-line">Unity has not reported where this one stands yet. Press Send placements in Unity.</span>}
              <ul className="org-places">
                {item.places.map((place) => (
                  <li key={place.id ?? `${place.scene}/${place.path}`}>
                    <span className="org-place-address">{addressOf(place)}</span>
                    {place.views != null && <span className="muted-line num">{formatCount(place.views)} views</span>}
                    <span className="org-place-actions">
                      <button className="button button-quiet button-small" type="button" onClick={() => showInUnity(place)}>
                        Show in Unity
                      </button>
                      <button className="button button-quiet button-small" type="button" onClick={() => copy(addressOf(place), "Address")}>
                        Copy address
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {link && (
              <div className={link.kind === "error" ? "error" : "muted-line"} role={link.kind === "error" ? "alert" : "status"}>
                {link.text}
              </div>
            )}
          </div>
        </div>
      )}

      {message && (
        <div className={message.kind === "error" ? "error" : "muted-line"} role={message.kind === "error" ? "alert" : "status"}>
          {message.text}
        </div>
      )}
    </li>
  );
}
