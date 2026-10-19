"use client";

import { useEffect } from "react";

/** Shown instead of a half-drawn screen when something on an admin page fails; the digest finds the line in the server log. */
export default function AdminError({ error, reset }) {
  useEffect(() => { console.error("[admin]", error); }, [error]);
  return (
    <div className="cb-band nt">
      <div className="cb-band-row">
        <div>
          <h1>This screen could not load</h1>
          <p>{error?.message && !/server components render/i.test(error.message) ? error.message : "The server failed while preparing it."}{error?.digest ? ` Reference: ${error.digest}` : ""}</p>
        </div>
        <button type="button" className="cb-btn" onClick={() => reset()}>Try again</button>
      </div>
    </div>
  );
}
