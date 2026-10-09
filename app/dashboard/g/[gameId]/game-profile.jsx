"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveGameProfile } from "../../actions";
import GameProfileFields from "../../game-profile-fields";
import { PROFILE_KEYS } from "../../../../lib/targeting";

const sameLists = (a, b) => PROFILE_KEYS.every((key) => [...a[key]].sort().join() === [...b[key]].sort().join());

/**
 * What the game is: genres, platforms, languages. Advertisers can aim a creative at these, and a
 * creative that asks for something the game has not filled in does not show in it.
 */
export default function GameProfile({ gameId, initial }) {
  const router = useRouter();
  const [profile, setProfile] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null); // { tone, text }

  const complete = PROFILE_KEYS.every((key) => profile[key].length > 0);
  const changed = !sameLists(profile, saved);

  async function save(event) {
    event.preventDefault();
    if (busy || !complete || !changed) return;
    setBusy(true);
    setNote(null);
    const result = await saveGameProfile({ gameId, ...profile }).catch(() => ({ error: "Connection lost. Try again." }));
    setBusy(false);
    if (result?.error) return setNote({ tone: "error", text: result.error });
    setSaved(result.value);
    setProfile(result.value);
    setNote({ tone: "done", text: "Saved. Players get it the next time they start the game." });
    router.refresh();
  }

  return (
    <section className="panel settings" aria-labelledby="profile-title">
      <h2 id="profile-title">About the game</h2>
      <p className="settings-help">
        Advertisers can aim an ad at a genre, a device or a language. An ad only shows in your game when
        it fits what you say here, and an ad that asks for something you have not filled in does not show.
      </p>
      <form className="stack" onSubmit={save}>
        <GameProfileFields value={profile} onChange={(next) => { setProfile(next); setNote(null); }} disabled={busy} />
        <div className="row">
          <button className="button" type="submit" disabled={busy || !complete || !changed}>
            {busy ? "Saving…" : "Save"}
          </button>
          {!complete && <span className="muted-line">Pick at least one genre, platform and language.</span>}
          <span
            role="status"
            aria-live="polite"
            className={note?.tone === "error" ? "error" : "upload-done"}
          >
            {note?.text ?? ""}
          </span>
        </div>
      </form>
    </section>
  );
}
