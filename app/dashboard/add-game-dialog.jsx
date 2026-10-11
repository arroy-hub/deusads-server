"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createGame } from "./actions";
import GameProfileFields from "./game-profile-fields";
import { PROFILE_KEYS } from "../../lib/targeting";

const EMPTY = { genres: [], platforms: [], languages: [] };

/**
 * The "Add game" button and the pop-up it opens with the questionnaire: the game's name and what it
 * is (genres, platforms, languages). Advertisers can aim a creative at those, and a creative that
 * asks for something the game has not filled in does not show in it.
 *
 * Closing the pop-up (Cancel, the cross, Escape) throws the draft away; it stays open while the
 * game is being saved and when saving fails, so nothing typed is lost.
 */
export default function AddGameDialog() {
  const router = useRouter();
  const dialogRef = useRef(null);
  const nameRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [profile, setProfile] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // The browser's own modal: it traps focus, dims the page and closes on Escape. A layout effect, so
  // the box never shows up empty for a frame while it closes.
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      nameRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const complete = name.trim() !== "" && PROFILE_KEYS.every((key) => profile[key].length > 0);

  function openDialog() {
    setError("");
    setOpen(true);
  }

  // Runs however the pop-up closed (button, cross, Escape, after saving): forget the draft.
  function closed() {
    setOpen(false);
    setName("");
    setProfile(EMPTY);
    setError("");
  }

  async function submit(event) {
    event.preventDefault();
    if (busy || !complete) return;
    setBusy(true);
    setError("");
    const result = await createGame(new FormData(event.currentTarget)).catch(() => ({
      error: "Connection lost. Try again.",
    }));
    setBusy(false);
    if (result?.error) return setError(result.error);
    setOpen(false);
    router.refresh(); // the new game appears in the list behind
  }

  return (
    <>
      <button className="button" type="button" onClick={openDialog} aria-haspopup="dialog">
        Add game
      </button>
      <dialog
        ref={dialogRef}
        className="modal"
        aria-labelledby="add-game-title"
        onClose={closed}
        onCancel={(event) => {
          if (busy) event.preventDefault(); // do not drop a game that is being saved
        }}
      >
        {open && (
          <form className="modal-box" onSubmit={submit}>
            <div className="modal-head">
              <h2 id="add-game-title">Add a game</h2>
              <button
                className="modal-close"
                type="button"
                aria-label="Close"
                onClick={() => setOpen(false)}
                disabled={busy}
              >
                ×
              </button>
            </div>
            <div className="modal-body stack">
              <p className="settings-help">
                Say what your game is. Advertisers can aim an ad at a genre, a device or a language, and an
                ad that asks for something your game has not filled in will not show in it.
              </p>
              <label htmlFor="new-game-name">Game name</label>
              <input
                ref={nameRef}
                id="new-game-name"
                className="field"
                name="name"
                placeholder="Game name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={120}
                disabled={busy}
                autoComplete="off"
                required
              />
              <GameProfileFields value={profile} onChange={setProfile} disabled={busy} named />
            </div>
            <div className="modal-foot">
              {/* here, not under the questionnaire: the buttons are always in view, the end of a long list is not */}
              {error ? (
                <p className="error" role="alert">
                  {error}
                </p>
              ) : (
                !complete &&
                !busy && <span className="muted-line">Add a name and pick at least one genre, platform and language.</span>
              )}
              <button className="button button-quiet" type="button" onClick={() => setOpen(false)} disabled={busy}>
                Cancel
              </button>
              <button className="button" type="submit" disabled={busy || !complete} aria-busy={busy}>
                {busy ? "Adding…" : "Add game"}
              </button>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}
