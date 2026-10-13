"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import GameIcon from "../game-icon";

const GIT_URL = "https://github.com/arroy-hub/DeusAdsSDK.git";

const Chevron = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 6l6 6-6 6" />
  </svg>
);

/**
 * "Set up the SDK" on the card of a game that has not synced yet: a panel from the right over the list with the
 * steps. The game's key is not shown here; the panel points to the game's Settings, where it lives. While it is
 * open the page is refreshed every few seconds, so the first sync from Unity shows up on its own.
 */
export default function SetupPanel({ gameId, gameName, iconUrl }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const timer = setInterval(() => router.refresh(), 10000);
    return () => clearInterval(timer);
  }, [open, router]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(GIT_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Copying is a convenience: the address is on the screen.
    }
  }

  return (
    <>
      <button type="button" className="mg-setup-btn" onClick={() => setOpen(true)}>
        <span>Set up the SDK</span>
        <Chevron />
      </button>
      <dialog ref={ref} className="mg-sheet" aria-label={`Set up the SDK for ${gameName}`} onClose={() => setOpen(false)}>
        {open && (
          <aside className="mg-sheet-box">
            <div className="mg-sheet-head">
              <GameIcon name={gameName} url={iconUrl} size="sm" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2>Set up the SDK</h2>
                <div>for {gameName} · takes about 5 minutes</div>
              </div>
              <button type="button" className="mg-sheet-x" aria-label="Close" onClick={() => setOpen(false)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            <div className="mg-sheet-body">
              <div className="mg-progress-row">
                <b>Progress</b>
                <span>1 of 4 done</span>
              </div>
              <div className="mg-progress">
                <div style={{ width: "25%" }} />
              </div>

              <ol className="mg-steps">
                <li>
                  <span className="mg-step is-done">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M5 12l5 5 9-10" />
                    </svg>
                  </span>
                  <div>
                    <b>Game created</b>
                    <p>It already has its own API key.</p>
                  </div>
                </li>
                <li>
                  <span className="mg-step is-now">2</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b>Install the SDK in Unity</b>
                    <p style={{ marginBottom: 10 }}>Window → Package Manager → + → Add package from git URL.</p>
                    <div className="mg-code">
                      <code>{GIT_URL}</code>
                      <button type="button" aria-label={copied ? "Copied" : "Copy URL"} onClick={copy}>
                        {copied ? (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M5 12l5 5 9-10" />
                          </svg>
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <rect x="9" y="9" width="11" height="11" rx="2" />
                            <path d="M5 15V6a2 2 0 012-2h9" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                </li>
                <li>
                  <span className="mg-step">3</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b>Connect Unity to this game</b>
                    <p style={{ marginBottom: 10 }}>
                      In Unity open Tools → DeusADS → Settings and paste the game&apos;s API key. You&apos;ll find the key in the game&apos;s Settings.
                    </p>
                    <Link href={`/dashboard/g/${gameId}?tab=settings`} className="mg-ghost">
                      Open game settings <Chevron size={14} />
                    </Link>
                  </div>
                </li>
                <li>
                  <span className="mg-step">4</span>
                  <div>
                    <b>Send placements</b>
                    <p>Tools → DeusADS → Send placements. They appear in the game right after.</p>
                  </div>
                </li>
              </ol>

              <div className="mg-wait">
                <span />
                Waiting for the first sync from Unity. This panel updates on its own.
              </div>
            </div>

            <div className="mg-sheet-foot">
              <button type="button" className="mg-ghost" onClick={() => setOpen(false)}>
                Close
              </button>
              <Link href={`/dashboard/g/${gameId}`} className="mg-primary">
                Open game
              </Link>
            </div>
          </aside>
        )}
      </dialog>
    </>
  );
}
