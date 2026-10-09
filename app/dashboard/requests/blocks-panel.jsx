"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setAllowRestricted, unblockAds } from "../bookings-actions";

/** What the developer has blocked, with Unblock, and the restricted-categories switch. */
export default function BlocksPanel({ blocks, allowRestricted }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(action) {
    setBusy(true);
    setError("");
    const result = await action().catch(() => ({ error: "Connection lost. Try again." }));
    setBusy(false);
    if (result?.error) return setError(result.error);
    router.refresh();
  }

  return (
    <div className="panel stack">
      <label>
        <input
          type="checkbox"
          checked={allowRestricted}
          disabled={busy}
          onChange={(event) => run(() => setAllowRestricted({ allow: event.target.checked }))}
        />{" "}
        Accept ads for alcohol and tobacco, gambling, dating and adult content
      </label>
      <p className="settings-help">Off by default. When off, advertisers in those categories cannot book your placements.</p>

      {blocks.length > 0 && (
        <table>
          <tbody>
            {blocks.map((block) => (
              <tr key={block.id}>
                <td>
                  {block.kindLabel}: {block.name}
                </td>
                <td className="actions-cell">
                  <button className="button button-quiet" type="button" disabled={busy} onClick={() => run(() => unblockAds({ blockId: block.id }))}>
                    Unblock
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
