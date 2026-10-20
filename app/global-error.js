"use client";

import { useEffect } from "react";
import { isConnectionError } from "../lib/connection-error";

/**
 * The last resort: it replaces the whole page when even the frame could not be drawn, for example when the connection
 * drops while the next page is still arriving. It takes the place of Next's bare "Application error" screen. The root
 * layout is not drawn here, so there is no stylesheet: the page carries its own plain styles and recovers with a full reload.
 */
export default function GlobalError({ error }) {
  const dropped = isConnectionError(error);

  useEffect(() => { console.error("[app]", error); }, [error]);

  // The connection is back: reload once without being asked.
  useEffect(() => {
    if (!dropped) return undefined;
    const back = () => window.location.reload();
    window.addEventListener("online", back, { once: true });
    return () => window.removeEventListener("online", back);
  }, [dropped]);

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif", background: "#f6f2ed", color: "#241d19" }}>
        <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "2rem" }}>
          <div role="alert" style={{ textAlign: "center", maxWidth: 420 }}>
            <h1 style={{ margin: "0 0 0.5rem", fontSize: "1.5rem" }}>{dropped ? "Connection lost" : "Something went wrong"}</h1>
            <p style={{ margin: "0 0 1.25rem", opacity: 0.7, lineHeight: 1.5 }}>
              {dropped
                ? "The connection dropped while this page was loading. Check your connection and reload."
                : `The page could not be drawn.${error?.digest ? ` Reference: ${error.digest}` : ""}`}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{ font: "inherit", fontWeight: 600, padding: "0.6rem 1.1rem", border: 0, borderRadius: 8, background: "#c94a24", color: "#fff", cursor: "pointer" }}
            >
              Reload page
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
