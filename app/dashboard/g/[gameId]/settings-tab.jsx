"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteGame, rotateApiKey, saveGame, setGameIcon } from "../../actions";
import GameIcon from "../../game-icon";
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
 * the icon, the name and what the game is (genres, platforms, languages). The two actions that
 * cannot be taken back (a new API key, deleting the game) are not part of Save; each asks first.
 * `profile` is null when the database does not know these lists yet (migration 0018).
 */
export default function SettingsTab({ gameId, name, iconUrl, iconsReady, profile }) {
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
  if (!title.trim()) missing.push("a name");
  if (lists) for (const key of PROFILE_KEYS) if (lists[key].length === 0) missing.push(`at least one ${FIELDS[key].noun}`);
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
    if (busy || !changed || !valid) return;
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
    <>
      <form onSubmit={save} className="settings-form">
        <section className="panel settings" aria-labelledby="settings-title">
          <h2 id="settings-title">Game settings</h2>
          <p className="settings-help">The game&apos;s icon and name, and its API key for the Unity SDK.</p>

          <div className="settings-block">
            <div className="settings-title">Icon</div>
            <div className="row">
              <GameIcon name={title || name} url={shownIcon} />
              {iconsReady ? (
                <>
                  <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={chooseIcon} />
                  <button type="button" className="button button-quiet" onClick={() => fileRef.current?.click()} disabled={busy}>
                    {shownIcon ? "Change icon" : "Add icon"}
                  </button>
                  {shownIcon && (
                    <button
                      type="button"
                      className="button button-quiet"
                      onClick={() => {
                        setIcon({ blob: null, preview: "", removed: true });
                        touch();
                      }}
                      disabled={busy}
                    >
                      Remove icon
                    </button>
                  )}
                  <span className="muted-line">Any picture; the middle square is used. Shown once you press Save.</span>
                </>
              ) : (
                <span className="muted-line">Icons need the database update (migration 0019).</span>
              )}
            </div>
          </div>

          <div className="settings-block">
            <label htmlFor="game-name">Name</label>
            <input
              id="game-name"
              className="field"
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                touch();
              }}
              maxLength={120}
              disabled={busy}
              required
            />
          </div>

          <ApiKeyBlock gameId={gameId} />
        </section>

        <section className="panel settings" aria-labelledby="profile-title">
          <h2 id="profile-title">About the game</h2>
          {lists ? (
            <>
              <p className="settings-help">
                Tell advertisers what your game is. They aim ads at a genre, a platform or a language, and an ad
                only shows in your game when it fits what you add here. An ad that asks for something you have
                left empty does not show at all, so fill in all three.
              </p>
              <div className="profile-fields">
                {PROFILE_KEYS.map((key) => (
                  <PickField
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
              </div>
            </>
          ) : (
            <p className="notice">
              Run <code>supabase/migrations/0018_targeting.sql</code> in the Supabase SQL editor to describe your
              game for advertisers.
            </p>
          )}
        </section>

        <div className="save-bar">
          <button className="button" type="submit" disabled={busy || !changed || !valid}>
            {busy ? "Saving…" : "Save"}
          </button>
          {!valid && <span className="muted-line">To save, add {missing.join(", ")}.</span>}
          {valid && !changed && !note && <span className="muted-line">No changes to save.</span>}
          <span role="status" aria-live="polite" className={note?.tone === "error" ? "error" : "upload-done"}>
            {note?.text ?? ""}
          </span>
        </div>
      </form>

      <DeleteBlock gameId={gameId} name={name} />
    </>
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

/** A new API key: an action of its own (it takes effect at once), asked for twice. */
function ApiKeyBlock({ gameId }) {
  const router = useRouter();
  const [step, setStep] = useState("idle"); // idle | confirm | working
  const [note, setNote] = useState(null);

  async function rotate() {
    setStep("working");
    setNote(null);
    const result = await rotateApiKey({ gameId }).catch(() => ({ error: "Connection lost. Try again." }));
    setStep("idle");
    if (result?.error) return setNote({ tone: "error", text: result.error });
    setNote({ tone: "done", text: "New key issued. Copy it from the top of this page." });
    router.refresh();
  }

  return (
    <div className="settings-block">
      <div className="settings-title">API key</div>
      <p className="settings-help">
        The key is shown at the top of this page. A new key replaces the old one immediately, without Save: builds
        already shipped with the old key stop receiving creatives and show their fallback textures until you paste
        the new key into the SDK settings and release again.
      </p>
      <div className="row">
        {step === "idle" ? (
          <button type="button" className="button button-quiet" onClick={() => setStep("confirm")}>
            Issue a new key…
          </button>
        ) : (
          <>
            <button type="button" className="button button-danger" onClick={rotate} disabled={step === "working"}>
              {step === "working" ? "Issuing…" : "Replace the key"}
            </button>
            <button type="button" className="button button-quiet" onClick={() => setStep("idle")} disabled={step === "working"}>
              Cancel
            </button>
          </>
        )}
        <span role="status" aria-live="polite" className={note?.tone === "error" ? "error" : "upload-done"}>
          {note?.text ?? ""}
        </span>
      </div>
    </div>
  );
}

/** Deleting the game: needs its exact name typed. */
function DeleteBlock({ gameId, name }) {
  const router = useRouter();
  const [step, setStep] = useState("idle"); // idle | confirm | working
  const [typed, setTyped] = useState("");
  const [note, setNote] = useState(null);

  async function remove(event) {
    event.preventDefault();
    setStep("working");
    setNote(null);
    const result = await deleteGame({ gameId, confirmName: typed }).catch(() => ({ error: "Connection lost. Try again." }));
    if (result?.error) {
      setStep("confirm");
      return setNote({ tone: "error", text: result.error });
    }
    router.push("/dashboard/games");
    router.refresh();
  }

  return (
    <section className="panel settings settings-danger" aria-labelledby="delete-title">
      <h2 id="delete-title">Delete game</h2>
      <p className="settings-help">
        Removes the game with its placements, assignments and every impression recorded for it. Creatives stay in your
        library. This cannot be undone.
      </p>
      {step === "idle" ? (
        <div className="row">
          <button type="button" className="button button-quiet" onClick={() => setStep("confirm")}>
            Delete this game…
          </button>
        </div>
      ) : (
        <form onSubmit={remove} className="stack">
          <label htmlFor="confirm-name">
            Type <strong>{name}</strong> to confirm
          </label>
          <div className="row">
            <input
              id="confirm-name"
              className="field"
              value={typed}
              onChange={(event) => {
                setTyped(event.target.value);
                setNote(null);
              }}
              autoComplete="off"
              disabled={step === "working"}
            />
            <button type="submit" className="button button-danger" disabled={step === "working" || typed.trim() !== name}>
              {step === "working" ? "Deleting…" : "Delete forever"}
            </button>
            <button
              type="button"
              className="button button-quiet"
              onClick={() => {
                setStep("idle");
                setTyped("");
                setNote(null);
              }}
              disabled={step === "working"}
            >
              Cancel
            </button>
          </div>
          <span role="status" aria-live="polite" className={note?.tone === "error" ? "error" : "upload-done"}>
            {note?.text ?? ""}
          </span>
        </form>
      )}
    </section>
  );
}
