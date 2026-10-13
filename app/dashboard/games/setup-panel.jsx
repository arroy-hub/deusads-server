"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const GIT_URL = "https://github.com/arroy-hub/DeusAdsSDK.git";

/**
 * "Set up the SDK" on the card of a game that has not synced yet: a panel from the right over the list with the
 * steps. The game's key is not shown here; the panel points to the game's Settings, where it lives.
 */
export default function SetupPanel({ gameId, gameName }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(GIT_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Copying is a convenience: the address is on the screen.
    }
  }

  const steps = [
    { done: true, title: "Game created", text: `${gameName} is in your cabinet.` },
    {
      title: "Install the SDK",
      text: (
        <>
          In Unity open Window → Package Manager → + → Add package from git URL and paste:
          <span className="sp-code">
            <code>{GIT_URL}</code>
            <button type="button" className="button button-quiet button-small" onClick={copy}>
              {copied ? "Copied" : "Copy"}
            </button>
          </span>
        </>
      ),
    },
    {
      title: "Connect Unity",
      text: (
        <>
          Paste the game&apos;s key into the DeusADS settings in Unity. You will find the key in the game&apos;s Settings:{" "}
          <Link href={`/dashboard/g/${gameId}?tab=settings`}>Open game settings</Link>.
        </>
      ),
    },
    { title: "Send placements", text: "In Unity press Send placements. The ad spaces of your game appear in the cabinet." },
  ];

  return (
    <>
      <button type="button" className="button button-small gc-setup" onClick={() => setOpen(true)}>
        Set up the SDK
      </button>
      <dialog ref={ref} className="sheet" aria-labelledby={`sp-${gameId}`} onClose={() => setOpen(false)}>
        {open && (
          <div className="sheet-box">
            <div className="sheet-head">
              <h2 id={`sp-${gameId}`}>Set up the SDK · {gameName}</h2>
              <button type="button" className="modal-close" aria-label="Close" onClick={() => setOpen(false)}>
                ×
              </button>
            </div>
            <ol className="sheet-steps">
              {steps.map((step, index) => (
                <li key={step.title} className={step.done ? "is-done" : ""}>
                  <span className="sheet-num" aria-hidden="true">{step.done ? "✓" : index + 1}</span>
                  <div>
                    <strong>{step.title}</strong>
                    <p>{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="sheet-status">
              <span className="conn-dot conn-new"><b /></span> Waiting for the first sync from Unity
            </p>
            <div className="sheet-foot">
              <button type="button" className="button button-quiet" onClick={() => setOpen(false)}>
                Close
              </button>
              <Link href={`/dashboard/g/${gameId}`} className="button">
                Open game
              </Link>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
