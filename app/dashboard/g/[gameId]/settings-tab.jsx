"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteGame, rotateApiKey, saveGame, setGameIcon } from "../../actions";
import GameIcon from "../../game-icon";
import Modal from "../../modal";
import PickField from "../../pick-field";
import { browserClient } from "../../../../lib/supabase-browser";
import { MAX_ICON_INPUT_BYTES, squareIcon } from "../../../../lib/icon-image";
import { FIELDS, PROFILE_KEYS } from "../../../../lib/targeting";

const FIELD_TEXT = {
  genres: { plural: "genres", hint: "Everything that describes the game." },
  platforms: { plural: "platforms", hint: "Where players can play it." },
  languages: { plural: "languages", hint: "The languages the game is available in." },
};

const sameLists = (a, b) => PROFILE_KEYS.every((key) => [...a[key]].sort().join() === [...b[key]].sort().join());

/**
 * Everything about one game that its owner can change, with a single Save for the settings:
 * the icon, the name and what the game is (genres, platforms, languages). Save can always be pressed;
 * when something is still empty it says what, next to the button. The two actions that cannot be taken back (a new API
 * key, deleting the game) are not part of Save; each asks first.
 * `profile` is null when the database does not know these lists yet (migration 0018).
 */
export default function SettingsTab({ gameId, name, apiKey, iconUrl, iconsReady, profile }) {
  const router = useRouter();
  const fileRef = useRef(null);

  const [title, setTitle] = useState(name);
  const [lists, setLists] = useState(profile);
  const [saved, setSaved] = useState({ name, lists: profile });
  const [icon, setIcon] = useState({ blob: null, preview: "", removed: false }); // a change waiting for Save
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null); // { tone, text }

  useEffect(() => () => icon.preview && URL.revokeObjectURL(icon.preview), [icon.preview]);

  const iconChanged = Boolean(icon.blob) || icon.removed;
  const nameChanged = title.trim() !== saved.name;
  const listsChanged = lists ? !sameLists(lists, saved.lists) : false;
  const changed = nameChanged || listsChanged || iconChanged;

  const missing = [];
  if (!title.trim()) missing.push("Name");
  if (lists) for (const key of PROFILE_KEYS) if (lists[key].length === 0) missing.push(FIELDS[key].label);
  const valid = missing.length === 0;

  const shownIcon = icon.removed ? "" : icon.preview || iconUrl;
  const touch = () => setNote(null);

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

  async function save(event) {
    event.preventDefault();
    if (busy) return;
    if (!valid) return setNote({ tone: "error", text: `Fill in the game description: ${missing.join(", ")}.` });
    if (!changed) return setNote({ tone: "done", text: "Nothing to save: no changes." });
    setBusy(true);
    setNote(null);

    let result = { ok: true, name: saved.name, value: saved.lists };
    if (nameChanged || listsChanged) {
      result = await saveGame({ gameId, name: title, ...(lists ?? {}) }).catch(() => ({ error: "Connection lost. Try again." }));
      if (result?.error) {
        setBusy(false);
        return setNote({ tone: "error", text: result.error });
      }
      setTitle(result.name);
      if (result.value) setLists(result.value);
      setSaved({ name: result.name, lists: result.value ?? saved.lists });
    }

    if (iconChanged) {
      const failed = await storeIcon(gameId, icon);
      if (failed) {
        setBusy(false);
        router.refresh();
        return setNote({ tone: "error", text: `Saved, but the icon was not: ${failed}` });
      }
      setIcon({ blob: null, preview: "", removed: false });
    }

    setBusy(false);
    setNote({ tone: "done", text: "Saved. Players get the changes the next time they start the game." });
    router.refresh();
  }

  return (
    <form onSubmit={save} className="settings-form" noValidate>
      <div className="settings-top">
        <section className="panel settings-ident" aria-label="Icon and name">
          <div className="icon-edit">
            <GameIcon name={title || name} url={shownIcon} />
            {iconsReady && (
              <>
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={chooseIcon} />
                <button
                  type="button"
                  className="icon-badge"
                  aria-label={shownIcon ? "Change icon" : "Add icon"}
                  title={shownIcon ? "Change icon" : "Add icon"}
                  onClick={() => fileRef.current?.click()}
                  disabled={busy}
                >
                  <CameraIcon />
                </button>
                {shownIcon && (
                  <button
                    type="button"
                    className="icon-badge icon-badge-remove"
                    aria-label="Remove icon"
                    title="Remove icon"
                    onClick={() => {
                      setIcon({ blob: null, preview: "", removed: true });
                      touch();
                    }}
                    disabled={busy}
                  >
                    ×
                  </button>
                )}
              </>
            )}
          </div>
          <input
            id="game-name"
            className="field"
            aria-label="Name"
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
              touch();
            }}
            maxLength={120}
            disabled={busy}
          />
        </section>
        <KeyButton gameId={gameId} apiKey={apiKey} />
      </div>
      

      {lists ? (
        <section className="panel pick-rows" aria-labelledby="about-title">
          <h2 id="about-title" className="sr-only">
            About the game
          </h2>
          {PROFILE_KEYS.map((key) => (
            <PickField
              key={key}
              compact
              label={FIELDS[key].label}
              noun={FIELDS[key].noun}
              nounPlural={FIELD_TEXT[key].plural}
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
        </section>
      ) : (
        <p className="notice">
          Run <code>supabase/migrations/0018_targeting.sql</code> in the Supabase SQL editor to describe your game for
          advertisers.
        </p>
      )}

      <div className="save-bar">
        <button className="button" type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
        <span role="status" aria-live="polite" className={note?.tone === "error" ? "error" : "upload-done"}>
          {note?.text ?? ""}
        </span>
        <DeleteGame gameId={gameId} name={name} />
      </div>
    </form>
  );
}


function CameraIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M4 8h3l2-3h6l2 3h3v11H4zM12 11a3 3 0 100 6 3 3 0 000-6z" />
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
 * The API key sits behind one button in the corner of the tab. The button opens a field in its place
 * (it floats over what is below, so nothing on the page moves) that shows the key on request, copies
 * it, and can issue a new one (that takes effect at once, without Save, and is asked for twice).
 * "Hide" folds it back under the button.
 */
function KeyButton({ gameId, apiKey }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  const [step, setStep] = useState("idle"); // idle | confirm | working
  const [note, setNote] = useState(null);
  const codeRef = useRef(null);
  const timer = useRef(null);
  const buttonRef = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  function close() {
    setOpen(false);
    setShown(false);
    setCopied(false);
    setStep("idle");
    setNote(null);
    buttonRef.current?.focus();
  }

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
    <div className="key-corner">
      {/* the button keeps its place (and its room) while the field is open */}
      <button
        ref={buttonRef}
        type="button"
        className="button button-quiet key-corner-button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-controls="key-field"
        tabIndex={open ? -1 : 0}
        style={open ? { visibility: "hidden" } : undefined}
      >
        <KeyIcon /> API key
      </button>
      {open && (
        <section
          id="key-field"
          className="key-field"
          aria-label="API key"
          onKeyDown={(event) => {
            if (event.key === "Escape" && step !== "working") close();
          }}
        >
          <div className="key-field-head">
            <span className="key-field-title">
              <KeyIcon /> API key
            </span>
            <button type="button" className="button button-quiet key-toggle" onClick={close} disabled={step === "working"} autoFocus>
              Hide
            </button>
          </div>
          <p className="settings-help">Paste it into Tools → DeusADS → Settings in Unity.</p>
          <div className="key-open">
            <code ref={codeRef} className="key">
              {shown ? apiKey : "•".repeat(24)}
            </code>
            <button type="button" className="button button-quiet key-toggle" onClick={() => setShown(!shown)} aria-pressed={shown}>
              {shown ? "Hide key" : "Show"}
            </button>
            <button type="button" className="button button-quiet key-toggle" onClick={copy}>
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <div className="key-rotate">
            {step === "idle" ? (
              <button type="button" className="button button-quiet" onClick={() => setStep("confirm")}>
                Issue a new key…
              </button>
            ) : (
              <>
                <p className="settings-help">
                  The old key stops working at once, without Save: builds already shipped with it stop receiving creatives
                  and show their fallback textures until you paste the new key into the SDK settings and release again.
                </p>
                <div className="row">
                  <button type="button" className="button button-danger" onClick={rotate} disabled={step === "working"}>
                    {step === "working" ? "Issuing…" : "Replace the key"}
                  </button>
                  <button type="button" className="button button-quiet" onClick={() => setStep("idle")} disabled={step === "working"}>
                    Cancel
                  </button>
                </div>
              </>
            )}
            <span role="status" aria-live="polite" className={note?.tone === "error" ? "error" : "upload-done"}>
              {note?.text ?? ""}
            </span>
          </div>
        </section>
      )}
    </div>
  );
}

function KeyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="8" cy="15" r="4" />
      <path d="M11 12l9-9M16 7l3 3" />
    </svg>
  );
}

/** Deleting the game: a link in the bottom bar; the pop-up needs the game's exact name typed. */
function DeleteGame({ gameId, name }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [typed, setTyped] = useState("");
  const [note, setNote] = useState(null);

  function close() {
    setOpen(false);
    setTyped("");
    setNote(null);
  }

  async function remove(event) {
    event.preventDefault();
    setWorking(true);
    setNote(null);
    const result = await deleteGame({ gameId, confirmName: typed }).catch(() => ({ error: "Connection lost. Try again." }));
    if (result?.error) {
      setWorking(false);
      return setNote({ tone: "error", text: result.error });
    }
    router.push("/dashboard/games");
    router.refresh();
  }

  return (
    <>
      <button type="button" className="delete-link" onClick={() => setOpen(true)}>
        <TrashIcon /> Delete game
      </button>
      <Modal
        open={open}
        onClose={close}
        title="Delete game"
        busy={working}
        footer={
          <>
            <span role="status" aria-live="polite" className={note?.tone === "error" ? "error" : "upload-done"}>
              {note?.text ?? ""}
            </span>
            <button type="button" className="button button-quiet" onClick={close} disabled={working}>
              Cancel
            </button>
            <button type="submit" form="delete-game-form" className="button button-danger" disabled={working || typed.trim() !== name}>
              {working ? "Deleting…" : "Delete forever"}
            </button>
          </>
        }
      >
        <p className="settings-help">
          Removes the game with its placements, assignments and every impression recorded for it. Creatives stay in your
          library. This cannot be undone.
        </p>
        <form id="delete-game-form" onSubmit={remove} className="stack">
          <label htmlFor="confirm-name">
            Type <strong>{name}</strong> to confirm
          </label>
          <input
            id="confirm-name"
            className="field"
            value={typed}
            onChange={(event) => {
              setTyped(event.target.value);
              setNote(null);
            }}
            autoComplete="off"
            disabled={working}
          />
        </form>
      </Modal>
    </>
  );
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
    </svg>
  );
}
