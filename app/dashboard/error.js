"use client";

import { useCallback, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { isConnectionError } from "../../lib/connection-error";

/**
 * Shown inside the cabinet (the menu stays) when a page fails to load, instead of the bare "Application error" screen.
 * A dropped connection gets its own wording and is retried by itself once the browser is back online; for any other
 * failure the digest finds the line in the server log. Admin pages have their own, closer to the page (admin/error.js).
 */
export default function DashboardError({ error, reset }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const dropped = isConnectionError(error);

  // Ask the server for the page again and then draw it: reset() alone would draw the same failed result.
  const retry = useCallback(() => {
    startTransition(() => {
      router.refresh();
      reset();
    });
  }, [router, reset]);

  useEffect(() => { console.error("[dashboard]", error); }, [error]);

  // The connection is back: try once without being asked.
  useEffect(() => {
    if (!dropped) return undefined;
    window.addEventListener("online", retry, { once: true });
    return () => window.removeEventListener("online", retry);
  }, [dropped, retry]);

  const message = dropped
    ? "The connection dropped while this page was loading. Check your connection and try again."
    : `${error?.message && !/server components render/i.test(error.message) ? error.message : "The server failed while preparing it."}${error?.digest ? ` Reference: ${error.digest}` : ""}`;

  return (
    <div role="alert" style={{ maxWidth: 520, margin: "12vh auto 0", textAlign: "center" }}>
      <h1 style={{ margin: "0 0 0.5rem" }}>{dropped ? "Connection lost" : "This page could not load"}</h1>
      <p className="lede" style={{ margin: "0 0 1.25rem" }}>{message}</p>
      <button type="button" className="button" onClick={retry} disabled={pending}>{pending ? "Loading…" : "Try again"}</button>
    </div>
  );
}
