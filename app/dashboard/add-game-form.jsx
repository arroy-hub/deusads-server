"use client";

import { useActionState, useState } from "react";
import { createGame } from "./actions";
import GameProfileFields from "./game-profile-fields";
import { PROFILE_KEYS } from "../../lib/targeting";

const EMPTY = { genres: [], platforms: [], languages: [] };

/**
 * A plain <form action={createGame}> drops the action's return value, so a
 * failed create looked like nothing happened. This keeps what the user typed
 * and shows what went wrong.
 *
 * A game says what it is (genres, platforms, languages) when it is added: advertisers can
 * aim a creative at those, and a creative that asks for something the game has not filled
 * in does not show in it.
 */
export default function AddGameForm() {
  const [name, setName] = useState("");
  const [profile, setProfile] = useState(EMPTY);
  const [state, submit, pending] = useActionState(async (_previous, formData) => {
    const result = await createGame(formData);
    if (result?.ok) {
      setName("");
      setProfile(EMPTY);
    }
    return result ?? null;
  }, null);

  const complete = name.trim() !== "" && PROFILE_KEYS.every((key) => profile[key].length > 0);

  return (
    <>
      <form action={submit} className="panel stack" style={{ marginTop: "1.5rem" }}>
        <h2>Add a game</h2>
        <p className="settings-help">
          Say what your game is. Advertisers can aim an ad at a genre, a device or a language, and an ad
          that asks for something your game has not filled in will not show in it.
        </p>
        <label htmlFor="new-game-name">Game name</label>
        <input
          id="new-game-name"
          className="field"
          name="name"
          placeholder="Game name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={120}
          disabled={pending}
          required
        />
        <GameProfileFields value={profile} onChange={setProfile} disabled={pending} named />
        <div className="row">
          <button className="button" type="submit" disabled={pending || !complete} aria-busy={pending}>
            {pending ? "Adding…" : "Add game"}
          </button>
          {!complete && !pending && (
            <span className="muted-line">Pick at least one genre, platform and language.</span>
          )}
        </div>
      </form>
      {state?.error && (
        <p className="error" role="alert" style={{ marginTop: "0.75rem" }}>
          {state.error}
        </p>
      )}
    </>
  );
}
