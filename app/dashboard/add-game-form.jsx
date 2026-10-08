"use client";

import { useActionState, useState } from "react";
import { createGame } from "./actions";

/**
 * A plain <form action={createGame}> drops the action's return value, so a
 * failed create looked like nothing happened. This keeps the name the user typed
 * and shows what went wrong.
 */
export default function AddGameForm() {
  const [name, setName] = useState("");
  const [state, submit, pending] = useActionState(async (_previous, formData) => {
    const result = await createGame(formData);
    if (result?.ok) setName("");
    return result ?? null;
  }, null);

  return (
    <>
      <form action={submit} className="row" style={{ marginTop: "1.5rem" }}>
        <input
          className="field"
          name="name"
          placeholder="Game name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={pending}
          required
        />
        <button className="button" type="submit" disabled={pending} aria-busy={pending}>
          {pending ? "Adding…" : "Add game"}
        </button>
      </form>
      {state?.error && (
        <p className="error" role="alert" style={{ marginTop: "0.75rem" }}>
          {state.error}
        </p>
      )}
    </>
  );
}
