"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteGame, renameGame, rotateApiKey } from "../../actions";

/**
 * Rename, issue a new API key, delete. The two that cannot be undone ask first:
 * a new key is a second click, deleting needs the game's exact name typed.
 */
export default function GameSettings({ gameId, name }) {
  const router = useRouter();

  const [title, setTitle] = useState(name);
  const [renaming, setRenaming] = useState(false);
  const [renameNote, setRenameNote] = useState(null); // { tone, text }

  const [rotateStep, setRotateStep] = useState("idle"); // idle | confirm | working
  const [rotateNote, setRotateNote] = useState(null);

  const [deleteStep, setDeleteStep] = useState("idle"); // idle | confirm | working
  const [typed, setTyped] = useState("");
  const [deleteNote, setDeleteNote] = useState(null);

  async function rename(event) {
    event.preventDefault();
    if (renaming || title.trim() === name) return;
    setRenaming(true);
    setRenameNote(null);
    const result = await renameGame({ gameId, name: title }).catch(() => ({ error: "Connection lost. Try again." }));
    setRenaming(false);
    if (result?.error) return setRenameNote({ tone: "error", text: result.error });
    setTitle(result.name);
    setRenameNote({ tone: "done", text: "Saved." });
    router.refresh();
  }

  async function rotate() {
    setRotateStep("working");
    setRotateNote(null);
    const result = await rotateApiKey({ gameId }).catch(() => ({ error: "Connection lost. Try again." }));
    setRotateStep("idle");
    if (result?.error) return setRotateNote({ tone: "error", text: result.error });
    setRotateNote({ tone: "done", text: "New key issued. Copy it from the top of this page." });
    router.refresh();
  }

  async function remove(event) {
    event.preventDefault();
    setDeleteStep("working");
    setDeleteNote(null);
    const result = await deleteGame({ gameId, confirmName: typed }).catch(() => ({ error: "Connection lost. Try again." }));
    if (result?.error) {
      setDeleteStep("confirm");
      return setDeleteNote({ tone: "error", text: result.error });
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <section className="panel settings" aria-labelledby="settings-title">
      <h2 id="settings-title">Game settings</h2>

      <form className="settings-block" onSubmit={rename}>
        <label htmlFor="game-name">Name</label>
        <div className="row">
          <input
            id="game-name"
            className="field"
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
              setRenameNote(null);
            }}
            maxLength={120}
            disabled={renaming}
            required
          />
          <button className="button" type="submit" disabled={renaming || title.trim() === name || !title.trim()}>
            {renaming ? "Saving…" : "Save"}
          </button>
          <Note note={renameNote} />
        </div>
      </form>

      <div className="settings-block">
        <div className="settings-title">API key</div>
        <p className="settings-help">
          A new key replaces the old one immediately. Builds already shipped with the old key stop
          receiving creatives and show their fallback textures until you paste the new key into the
          SDK settings and release again.
        </p>
        <div className="row">
          {rotateStep === "idle" && (
            <button type="button" className="button button-quiet" onClick={() => setRotateStep("confirm")}>
              Issue a new key…
            </button>
          )}
          {rotateStep !== "idle" && (
            <>
              <button type="button" className="button button-danger" onClick={rotate} disabled={rotateStep === "working"}>
                {rotateStep === "working" ? "Issuing…" : "Replace the key"}
              </button>
              <button
                type="button"
                className="button button-quiet"
                onClick={() => setRotateStep("idle")}
                disabled={rotateStep === "working"}
              >
                Cancel
              </button>
            </>
          )}
          <Note note={rotateNote} />
        </div>
      </div>

      <div className="settings-block settings-danger">
        <div className="settings-title">Delete game</div>
        <p className="settings-help">
          Removes the game with its placements, assignments and every impression recorded for it.
          Creatives stay in your library. This cannot be undone.
        </p>
        {deleteStep === "idle" ? (
          <div className="row">
            <button type="button" className="button button-quiet" onClick={() => setDeleteStep("confirm")}>
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
                  setDeleteNote(null);
                }}
                autoComplete="off"
                disabled={deleteStep === "working"}
              />
              <button
                type="submit"
                className="button button-danger"
                disabled={deleteStep === "working" || typed.trim() !== name}
              >
                {deleteStep === "working" ? "Deleting…" : "Delete forever"}
              </button>
              <button
                type="button"
                className="button button-quiet"
                onClick={() => {
                  setDeleteStep("idle");
                  setTyped("");
                  setDeleteNote(null);
                }}
                disabled={deleteStep === "working"}
              >
                Cancel
              </button>
            </div>
            <Note note={deleteNote} />
          </form>
        )}
      </div>
    </section>
  );
}

function Note({ note }) {
  return (
    <span role="status" aria-live="polite" className={note?.tone === "error" ? "error" : "upload-done"}>
      {note?.text ?? ""}
    </span>
  );
}
