"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteGame, rotateApiKey, saveGame, setGameIcon } from "../../actions";
import GameIcon from "../../game-icon";
import Modal from "../../modal";
import MultiPick from "../../multi-pick";
import { browserClient } from "../../../../lib/supabase-browser";
import { MAX_ICON_INPUT_BYTES, squareIcon } from "../../../../lib/icon-image";
import { FIELDS, PROFILE_KEYS } from "../../../../lib/targeting";
import { ABOUT_LISTS, parseStoreUrl } from "../../../../lib/game-about";
import { navigating } from "../../_cabinet/nav";

const FIELD_TEXT = {
  genres: { plural: "genres", hint: "Everything that describes the game." },
  platforms: { plural: "platforms", hint: "Where players can play it." },
  languages: { plural: "languages", hint: "The languages the game is available in." },
};

const sameLists = (a, b) => PROFILE_KEYS.every((key) => [...a[key]].sort().join() === [...b[key]].sort().join());
const NO_ICON = { blob: null, preview: "", removed: false };

/**
 * Everything about one game that its owner can change. Laid out as cards: the icon and name on top, the game's
 * description (genres, platforms, languages) beside the API key, and the two actions that cannot be taken back
 * (a new key, deleting the game) kept apart from Save. Save is a bar that is on screen only while there is
 * something to save (or just after it was saved); when something is still empty it says what.
 * `profile` is null when the database does not know these lists yet (migration 0018).
 */
export default function SettingsTab({ gameId, name, apiKey, iconUrl, iconsReady, profile, about, link }) {
  const router = useRouter();
  const fileRef = useRef(null);
  const noteTimer = useRef(null);

  const [title, setTitle] = useState(name);
  const [lists, setLists] = useState(profile);
  const [more, setMore] = useState(about); // store link, devices, play modes; null before migration 0031
  const [saved, setSaved] = useState({ name, lists: profile, more: about });
  const [icon, setIcon] = useState(NO_ICON); // a change waiting for Save
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null); // { tone, text }

  useEffect(() => () => icon.preview && URL.revokeObjectURL(icon.preview), [icon.preview]);
  useEffect(() => () => clearTimeout(noteTimer.current), []);

  const iconChanged = Boolean(icon.blob) || icon.removed;
  const nameChanged = title.trim() !== saved.name;
  const listsChanged = lists ? !sameLists(lists, saved.lists) : false;
  const moreChanged = more ? JSON.stringify(more) !== JSON.stringify(saved.more) : false;
  const dirty = nameChanged || listsChanged || iconChanged || moreChanged;

  const missing = [];
  if (!title.trim()) missing.push("name");
  if (lists) for (const key of PROFILE_KEYS) if (lists[key].length === 0) missing.push(FIELDS[key].label.toLowerCase());
  const storeCheck = more ? parseStoreUrl(more.storeUrl) : { value: "" };
  if (storeCheck.error) missing.push("a valid store link");
  const valid = missing.length === 0;
  // A game the SDK has never talked to is not ready for advertisers, however complete its description is.
  const waitingForSdk = link?.mode === "new";
  const filled = lists ? PROFILE_KEYS.filter((key) => lists[key].length > 0).length : 0;

  const shownIcon = icon.removed ? "" : icon.preview || iconUrl;
  const touch = () => {
    clearTimeout(noteTimer.current);
    setNote(null);
  };
  const flash = (text) => {
    clearTimeout(noteTimer.current);
    setNote({ tone: "done", text });
    noteTimer.current = setTimeout(() => setNote(null), 6000);
  };

  async function chooseIcon(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return setNote({ tone: "error", text: "Choose a picture (PNG, JPG or WebP) for the icon." });
    if (file.size > MAX_ICON_INPUT_BYTES) return setNote({ tone: "error", text: "The icon picture is over 10 MB." });
    try {
      const blob = await squareIcon(file);
      setIcon({ blob, preview: URL.createObjectURL(blob), removed: false });
      touch();
    } catch {
      setNote({ tone: "error", text: "Could not read that picture." });
    }
  }

  function discard() {
    setTitle(saved.name);
    setLists(saved.lists);
    setMore(saved.more);
    setIcon(NO_ICON);
    touch();
  }

  async function save() {
    if (busy || !dirty) return;
    if (!valid) return setNote({ tone: "error", text: `Still to fill in: ${missing.join(", ")}.` });
    setBusy(true);
    setNote(null);

    if (nameChanged || listsChanged || moreChanged) {
      const result = await saveGame({ gameId, name: title, ...(lists ?? {}), ...(more ? { about: more } : {}) }).catch(() => ({ error: "Connection lost. Try again." }));
      if (result?.error) {
        setBusy(false);
        return setNote({ tone: "error", text: result.error });
      }
      setTitle(result.name);
      if (result.value) setLists(result.value);
      // What was kept (the store link comes back as a full address), so the page matches the database.
      const kept = result.about
        ? { storeUrl: result.about.store_url ?? "", devices: result.about.devices, playModes: result.about.play_modes }
        : saved.more;
      setMore(kept);
      setSaved({ name: result.name, lists: result.value ?? saved.lists, more: kept });
    }

    if (iconChanged) {
      const failed = await storeIcon(gameId, icon);
      if (failed) {
        setBusy(false);
        router.refresh();
        return setNote({ tone: "error", text: `Saved, but the icon was not: ${failed}` });
      }
      setIcon(NO_ICON);
    }

    setBusy(false);
    flash("Saved.");
    router.refresh();
  }

  // What the bar says while there is something to save.
  const changedParts = [nameChanged && "name", (listsChanged || moreChanged) && "description", iconChanged && "icon"].filter(Boolean);
  const barText = !valid
    ? `Still to fill in: ${missing.join(", ")}.`
    : `Unsaved changes: ${changedParts.join(" and ")}.`;

  return (
    <div className="st">
      <section className="st-card st-ident" aria-label="Icon and name">
        <div className="st-icon">
          <GameIcon name={title || name} url={shownIcon} size="lg" />
          {iconsReady && (
            <>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={chooseIcon} />
              <button
                type="button"
                className={`st-icon-change${shownIcon ? "" : " is-empty"}`}
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                aria-label={shownIcon ? "Change icon" : "Add icon"}
              >
                <CameraIcon />
                <span>{shownIcon ? "Change" : "Add icon"}</span>
              </button>
              {shownIcon && (
                <button
                  type="button"
                  className="st-icon-remove"
                  aria-label="Remove icon"
                  title="Remove icon"
                  onClick={() => {
                    setIcon({ blob: null, preview: "", removed: true });
                    touch();
                  }}
                  disabled={busy}
                >
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
                    <path d="M1 1l6 6M7 1L1 7" />
                  </svg>
                </button>
              )}
            </>
          )}
        </div>
        <div className="st-name">
          <label htmlFor="game-name">Game name</label>
          <input
            id="game-name"
            className="st-name-input"
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
              touch();
            }}
            maxLength={120}
            disabled={busy}
          />
          <div className="st-name-line">
            {lists && (
              <span className={`st-status ${!valid ? "is-open" : waitingForSdk ? "is-wait" : "is-ready"}`}>
                <span className="st-status-dot" aria-hidden="true" />
                {!valid ? "Description incomplete" : waitingForSdk ? "Waiting for the SDK" : "Ready for advertisers"}
              </span>
            )}
            <span className="st-muted">The name and icon are what advertisers see in the catalog.</span>
          </div>
        </div>
      </section>

      <div className="st-cols">
        {lists ? (
          <section className="st-card st-about" aria-labelledby="about-title">
            <div className="st-card-head">
              <div>
                <h2 id="about-title">About the game</h2>
                <p>Advertisers aim ads at a genre, platform or language. An ad shows only in games that have said what they are.</p>
              </div>
              <span className="st-progress">
                <span className="st-bars" aria-hidden="true">
                  {PROFILE_KEYS.map((key, index) => (
                    <span key={key} className={index < filled ? "is-on" : ""} />
                  ))}
                </span>
                {filled} of {PROFILE_KEYS.length} filled in
              </span>
            </div>
            {more && (
              <div className="st-about-text">
                <div className="st-field">
                  <label htmlFor="game-store">Store link</label>
                  <input
                    id="game-store"
                    className="field"
                    type="url"
                    inputMode="url"
                    value={more.storeUrl}
                    onChange={(event) => {
                      setMore({ ...more, storeUrl: event.target.value });
                      touch();
                    }}
                    maxLength={300}
                    placeholder="https://www.meta.com/experiences/…"
                    disabled={busy}
                  />
                </div>
              </div>
            )}
            {PROFILE_KEYS.map((key) => (
              <AboutRow
                key={key}
                label={FIELDS[key].label}
                noun={FIELDS[key].noun}
                nounPlural={FIELD_TEXT[key].plural}
                hint={FIELD_TEXT[key].hint}
                options={FIELDS[key].options}
                value={lists[key]}
                onChange={(next) => {
                  setLists({ ...lists, [key]: next });
                  touch();
                }}
                searchable={key === "languages"}
                disabled={busy}
              />
            ))}
            {more &&
              [
                ["devices", "devices"],
                ["play_modes", "playModes"],
              ].map(([listKey, stateKey]) => (
                <AboutRow
                  key={listKey}
                  label={ABOUT_LISTS[listKey].label}
                  noun={ABOUT_LISTS[listKey].noun}
                  nounPlural={ABOUT_LISTS[listKey].plural}
                  hint={listKey === "devices" ? "The headsets and screens it runs on." : "How people can play it."}
                  options={ABOUT_LISTS[listKey].options}
                  value={more[stateKey]}
                  onChange={(next) => {
                    setMore({ ...more, [stateKey]: next });
                    touch();
                  }}
                  optional
                  disabled={busy}
                />
              ))}
          </section>
        ) : (
          <p className="notice st-about">
            Run <code>supabase/migrations/0018_targeting.sql</code> in the Supabase SQL editor to describe your game for
            advertisers.
          </p>
        )}

        <KeyCard gameId={gameId} apiKey={apiKey} link={link} />
      </div>

      <DeleteGame gameId={gameId} name={name} />

      {(dirty || note) && (
        <div className="st-bar" role="region" aria-label="Unsaved changes">
          <span className={`st-bar-dot ${note?.tone === "done" && !dirty ? "is-done" : ""}`} aria-hidden="true" />
          <span role="status" aria-live="polite" className="st-bar-text">
            {note ? note.text : barText}
          </span>
          {dirty && (
            <>
              <button type="button" className="st-bar-discard" onClick={discard} disabled={busy}>
                Discard
              </button>
              <button type="button" className="st-bar-save" onClick={save} disabled={busy || !valid}>
                {busy ? "Saving…" : "Save changes"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** One list of the game's description: its name (what it means shows when you point at it), what is chosen, an Add button. */
function AboutRow({ label, noun, nounPlural, hint, options, value, onChange, searchable, disabled, optional = false }) {
  const [open, setOpen] = useState(false);
  const tipId = useId();
  const labelOf = new Map(options.map((option) => [option.id, option.label]));
  // the order of the full list, so the tags read the same as the pop-up
  const order = new Map(options.map((option, index) => [option.id, index]));
  const chosen = [...value].sort((a, b) => (order.get(a) ?? 1e9) - (order.get(b) ?? 1e9));
  const empty = chosen.length === 0;

  return (
    <div className={`st-row ${empty && !optional ? "is-empty" : ""}`}>
      <div className="st-row-label">
        <span className="st-tipwrap">
          <button type="button" className="st-tipbtn" aria-describedby={tipId}>
            {label}
          </button>
          <span id={tipId} role="tooltip" className="st-tipbody">
            {hint}
          </span>
        </span>
      </div>
      <div className="st-row-values" aria-live="polite">
        {empty && !optional && (
          <span className="st-required">
            <AlertIcon /> Required: add at least one
          </span>
        )}
        {chosen.map((id) => (
          <span className="st-chip" key={id}>
            {labelOf.get(id) ?? id}
            <button
              type="button"
              className="st-chip-x"
              aria-label={`Remove ${labelOf.get(id) ?? id}`}
              onClick={() => onChange(value.filter((item) => item !== id))}
              disabled={disabled}
            >
              ×
            </button>
          </span>
        ))}
        <button type="button" className="st-add" onClick={() => setOpen(true)} disabled={disabled}>
          <PlusIcon /> {empty ? `Add ${noun}` : "Add"}
        </button>
      </div>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Add ${nounPlural}`}
        footer={
          <>
            <span className="muted-line">{value.length === 0 ? "None added yet" : `${value.length} added`}</span>
            <button type="button" className="button" onClick={() => setOpen(false)}>
              Done
            </button>
          </>
        }
      >
        <MultiPick label={label} options={options} value={value} onChange={onChange} searchable={searchable} />
      </Modal>
    </div>
  );
}

function CameraIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M4 8h3l2-3h6l2 3h3v11H4zM12 11a3 3 0 100 6 3 3 0 000-6z" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M8 3v10M3 8h10" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5M12 16.5v.01" strokeLinecap="round" />
    </svg>
  );
}

/** Uploads the new icon (or clears it) and records it. Returns an error text, or "" when it worked. */
async function storeIcon(gameId, icon) {
  let path = null;
  if (icon.blob) {
    const db = browserClient();
    const { data } = await db.auth.getSession();
    const userId = data?.session?.user?.id;
    if (!userId) return "your session expired. Sign in again.";
    path = `${userId}/game-icon-${gameId}-${Date.now()}.png`;
    const { error } = await db.storage
      .from("creatives")
      .upload(path, icon.blob, { contentType: "image/png", cacheControl: "31536000", upsert: false });
    if (error) return "the upload failed. Try again.";
  }
  const result = await setGameIcon({ gameId, path }).catch(() => ({ error: "connection lost. Try again." }));
  return result?.error ?? "";
}

/**
 * The API key, always in view: hidden until asked, with show and copy beside it, and "Issue a new key" below.
 * A new key takes effect at once, without Save, and is asked for twice.
 */
function KeyCard({ gameId, apiKey, link }) {
  const router = useRouter();
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  const [step, setStep] = useState("idle"); // idle | confirm | working
  const [note, setNote] = useState(null);
  const codeRef = useRef(null);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    let ok = false;
    try {
      await navigator.clipboard.writeText(apiKey);
      ok = true;
    } catch {
      setShown(true);
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (codeRef.current) {
        const range = document.createRange();
        range.selectNodeContents(codeRef.current);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        ok = document.execCommand?.("copy") ?? false;
      }
    }
    if (!ok) return;
    clearTimeout(timer.current);
    setCopied(true);
    timer.current = setTimeout(() => setCopied(false), 1600);
  }

  async function rotate() {
    setStep("working");
    setNote(null);
    const result = await rotateApiKey({ gameId }).catch(() => ({ error: "Connection lost. Try again." }));
    setStep("idle");
    if (result?.error) return setNote({ tone: "error", text: result.error });
    setShown(true);
    setNote({ tone: "done", text: "New key issued." });
    router.refresh();
  }

  return (
    <section className="st-card st-sdk" aria-labelledby="sdk-title">
      <div className="st-sdk-head">
        <span className="st-key-tile">
          <KeyIcon />
        </span>
        <h2 id="sdk-title">SDK connection</h2>
        {link && (
          <span className={`conn-chip conn-${link.mode}`} style={{ marginLeft: "auto" }}>
            <b />
            {link.short}
          </span>
        )}
      </div>
      <p className="st-muted">
        Paste the key into <strong>Tools → DeusADS → Settings</strong> in Unity, then press Send placements.
      </p>
      <div className="st-key-row">
        {/* one fixed-size line: hidden or shown, what does not fit is cut off, so nothing moves */}
        <code ref={codeRef} className="st-key">
          {shown ? apiKey : "•".repeat(24)}
        </code>
        <button
          type="button"
          className="st-key-btn"
          onClick={() => setShown(!shown)}
          aria-pressed={shown}
          aria-label={shown ? "Hide key" : "Show key"}
          title={shown ? "Hide key" : "Show key"}
        >
          <EyeIcon open={shown} />
        </button>
        <button type="button" className="st-key-btn st-key-copy" onClick={copy} aria-label="Copy key">
          {copied ? <CheckIcon /> : <CopyIcon />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <hr className="st-rule" />
      {step === "confirm" || step === "working" ? (
        <div className="st-rotate">
          <p>
            The old key stops working at once. Builds already shipped with it stop receiving creatives and show their
            fallback textures until you paste the new key into the SDK and release again.
          </p>
          <div className="st-rotate-actions">
            <button type="button" className="st-danger-fill" onClick={rotate} disabled={step === "working"}>
              {step === "working" ? "Issuing…" : "Replace the key"}
            </button>
            <button type="button" className="st-plain" onClick={() => setStep("idle")} disabled={step === "working"}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="st-rotate">
          <button
            type="button"
            className="st-plain"
            onClick={() => {
              setStep("confirm");
              setNote(null);
            }}
          >
            Issue a new key…
          </button>
          <span className="st-muted st-small">Needed only if the key has leaked. Applies at once, without Save.</span>
        </div>
      )}
      <span role="status" aria-live="polite" className={note?.tone === "error" ? "error" : "st-done"}>
        {note?.text ?? ""}
      </span>
      {link && (
        <details className="st-details">
          <summary>
            Connection details<span className="st-details-last">{link.last}</span>
          </summary>
          {link.mode === "silent" && (
            <p className="notice" role="status">
              {link.chip}. Check that the build still has the SDK and the key, and that the game was started recently.
            </p>
          )}
          <dl className="st-kv">
            <div><dt>Last signal</dt><dd>{link.last}</dd></div>
            <div><dt>Placements sent</dt><dd>{link.placements}</dd></div>
            <div><dt>First impression</dt><dd>{link.firstImpression}</dd></div>
          </dl>
          <ol className="st-steps">
            {link.steps.map((step) => (
              <li key={step.title} className={step.done ? "is-done" : ""}>
                <span aria-hidden="true">{step.done ? "✓" : "–"}</span>
                <span>
                  <b>{step.title}</b>
                  <small>{step.when}</small>
                </span>
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}

function EyeIcon({ open }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 100 6 3 3 0 000-6z" />
      {!open && <path d="M3 3l18 18" />}
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
      <path d="M10.5 3.2V3A1.5 1.5 0 009 1.5H4A1.5 1.5 0 002.5 3v5A1.5 1.5 0 004 9.5h.2" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3.5 8.3 6.6 11.3 12.5 4.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="8" cy="15" r="4.2" />
      <path d="M11.2 11.8L20.5 2.5M16.5 6.5l3 3" />
    </svg>
  );
}

/**
 * Deleting the game. A card of its own at the bottom; the button opens a small confirmation over itself (the button
 * keeps its place, so nothing moves). The word "delete" has to be typed. A click anywhere else, or Escape, closes it.
 */
function DeleteGame({ gameId, name }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [typed, setTyped] = useState("");
  const [note, setNote] = useState(null);
  const buttonRef = useRef(null);

  const ready = typed.trim().toLowerCase() === "delete";

  function close() {
    if (working) return;
    setOpen(false);
    setTyped("");
    setNote(null);
    buttonRef.current?.focus();
  }

  async function remove(event) {
    event.preventDefault();
    if (!ready || working) return;
    setWorking(true);
    setNote(null);
    const result = await deleteGame({ gameId, confirmName: typed }).catch(() => ({ error: "Connection lost. Try again." }));
    if (result?.error) {
      setWorking(false);
      return setNote({ tone: "error", text: result.error });
    }
    navigating();
    router.push("/dashboard/games");
    router.refresh();
  }

  return (
    <section className="st-card st-danger" aria-labelledby="danger-title">
      <div className="st-danger-text">
        <h2 id="danger-title">Delete this game</h2>
        <p>
          Removes the game with its placements, assignments and every impression recorded for it. Creatives stay in
          your library. This cannot be undone.
        </p>
      </div>
      <div className="st-danger-slot">
        <button
          ref={buttonRef}
          type="button"
          className="st-delete"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-controls="delete-confirm"
          tabIndex={open ? -1 : 0}
          style={open ? { visibility: "hidden" } : undefined}
        >
          <TrashTile size="sm" /> Delete game
        </button>
        {open && (
          <>
            <div className="st-scrim" onClick={close} aria-hidden="true" />
            <form
              id="delete-confirm"
              className="st-confirm"
              aria-labelledby="delete-title"
              onSubmit={remove}
              onKeyDown={(event) => {
                if (event.key === "Escape") close();
              }}
            >
              <div className="st-confirm-head">
                <TrashTile size="lg" />
                <div>
                  <h3 id="delete-title">Delete {name}?</h3>
                  <p>
                    This cannot be undone. Type <strong>delete</strong> to confirm.
                  </p>
                </div>
              </div>
              <input
                className="st-confirm-input"
                aria-label="Type delete to confirm"
                placeholder="delete"
                value={typed}
                onChange={(event) => {
                  setTyped(event.target.value);
                  setNote(null);
                }}
                autoComplete="off"
                autoFocus
                disabled={working}
              />
              <div className="st-confirm-actions">
                <span role="status" aria-live="polite" className="error">
                  {note?.text ?? ""}
                </span>
                <button type="button" className="st-plain" onClick={close} disabled={working}>
                  Cancel
                </button>
                <button type="submit" className="st-danger-fill" disabled={!ready || working}>
                  {working ? "Deleting…" : "Delete forever"}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </section>
  );
}

/** The red rounded square with a white trash can. */
function TrashTile({ size }) {
  return (
    <span className={`st-trash is-${size}`} aria-hidden="true">
      <svg width={size === "lg" ? 19 : 15} height={size === "lg" ? 19 : 15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
      </svg>
    </span>
  );
}
