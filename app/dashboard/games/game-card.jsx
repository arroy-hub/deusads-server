"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import GameIcon from "../game-icon";
import { browserClient } from "../../../lib/supabase-browser";
import { COVERS, COVER_MAX_BYTES } from "../../../lib/game-cover";
import { cropToStrip } from "../../../lib/cover-image";
import { setGameCover } from "../actions";

const Chevron = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 6l6 6-6 6" />
  </svg>
);
const Svg = ({ size = 17, width = 2, children }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);
const IcImage = ({ size }) => <Svg size={size}><path d="M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M9 9h.01" /></Svg>;
const IcChart = ({ size }) => <Svg size={size}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></Svg>;
const IcPlug = ({ size }) => <Svg size={size}><path d="M9 7V3M15 7V3M7 7h10v5a5 5 0 01-10 0zM12 17v4" /></Svg>;
const IcKey = ({ size, width }) => <Svg size={size} width={width}><circle cx="8" cy="15" r="4.2" /><path d="M11.2 11.8L20.5 2.5M16.5 6.5l3 3" /></Svg>;
const IcGear = ({ size }) => <Svg size={size}><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" /></Svg>;
const IcClose = () => <Svg size={18} width={2.2}><path d="M6 6l12 12M18 6L6 18" /></Svg>;

/** A modal in the browser's own <dialog>: dims the page, traps focus, closes on Escape and on a click outside the box. */
function Modal({ label, onClose, children, width }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="gm-dlg"
      aria-label={label}
      style={{ width }}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) ref.current.close();
      }}
    >
      {children(() => ref.current?.close())}
    </dialog>
  );
}

function DialogHead({ icon, title, name, close }) {
  return (
    <div className="gm-dhead">
      <span className="gm-dicon">{icon}</span>
      <div>
        <h2>{title}</h2>
        <div>for {name}</div>
      </div>
      <button type="button" aria-label="Close" className="gm-dx" onClick={close}>
        <IcClose />
      </button>
    </div>
  );
}

function ConnectionDialog({ game, onClose }) {
  const router = useRouter();
  const ok = game.mode === "ok";
  // Until the SDK is heard from, the pop-up refreshes itself so the first signal shows up without a reload.
  useEffect(() => {
    if (ok) return undefined;
    const timer = setInterval(() => router.refresh(), 10000);
    return () => clearInterval(timer);
  }, [ok, router]);
  const sent = game.placementsTotal > 0;
  const steps = [
    { title: "API key issued", done: true, when: game.createdText },
    { title: "Placements sent from Unity (Send placements)", done: sent, when: sent ? `${game.placementsTotal} ${game.placementsTotal === 1 ? "placement" : "placements"}` : "Paste the key into Tools → DeusADS → Settings, then press Send placements" },
    { title: "SDK asked for the manifest", done: game.mode !== "new", when: game.mode !== "new" ? game.signalText : "Run the game once with the SDK in it" },
    { title: "First impression received", done: Boolean(game.firstText), when: game.firstText || "Appears after a placement is on screen" },
  ];
  const chip = ok
    ? { bg: "#e9f6ee", ink: "#1f6b3a", dot: "#3fb577", text: "Connected", line: "The SDK in Unity is talking to DeusADS." }
    : game.mode === "silent"
      ? { bg: "#fbf1dc", ink: "#8a5a00", dot: "#e0a23a", text: "Out of sync", line: `${game.signalText}. Run the game once with the SDK in it.` }
      : { bg: "#f1ece6", ink: "#5b524a", dot: "#9aa0a6", text: "Not connected", line: "Follow the steps below; this window updates on its own." };
  return (
    <Modal label="Connection details" onClose={onClose} width={440}>
      {(close) => (
        <>
          <DialogHead icon={<IcPlug size={24} />} title="Connection details" name={game.name} close={close} />
          <div className="gm-dbody">
            <div className="gm-chip" style={{ background: chip.bg, color: chip.ink }}>
              <i style={{ background: chip.dot }} />
              <div>
                <b>{chip.text}.</b> {chip.line}
              </div>
            </div>
            <div>
              <div className="gm-cap">Status</div>
              <div className="gm-row"><span>Last signal</span><b>{game.signalText}</b></div>
              <div className="gm-row"><span>Placements sent</span><b>{game.placementsTotal}</b></div>
              <div className="gm-row"><span>First impression</span><b>{game.firstText || "—"}</b></div>
            </div>
            <div>
              <div className="gm-cap" style={{ marginBottom: 10 }}>Steps</div>
              <ol className="gm-steps">
                {steps.map((step) => (
                  <li key={step.title}>
                    <span className="gm-mark" style={{ background: step.done ? "#e1f1e8" : "#efe7de", color: step.done ? "#1b6240" : "#6b5f56" }}>{step.done ? "✓" : "–"}</span>
                    <span>
                      <b>{step.title}</b>
                      <br />
                      <span className="gm-when">{step.when}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
          <div className="gm-dfoot gm-dfoot-end">
            <button type="button" className="gm-btn" onClick={close}>Close</button>
          </div>
        </>
      )}
    </Modal>
  );
}

function KeyDialog({ game, onClose }) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);
  const codeRef = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    let ok = false;
    try {
      await navigator.clipboard.writeText(game.apiKey);
      ok = true;
    } catch {
      setShown(true);
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (codeRef.current) {
        const range = document.createRange();
        range.selectNodeContents(codeRef.current);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        ok = document.execCommand?.("copy") ?? false;
      }
    }
    if (!ok) return;
    clearTimeout(timer.current);
    setCopied(true);
    timer.current = setTimeout(() => setCopied(false), 1600);
  }

  return (
    <Modal label="SDK key" onClose={onClose} width={440}>
      {(close) => (
        <div className="gm-key">
          <div className="gm-key-head">
            <span className="gm-key-icon"><IcKey size={20} width={3} /></span>
            <h2>SDK key</h2>
            <button type="button" aria-label="Close" className="gm-key-x" onClick={close}><IcClose /></button>
          </div>
          <p>
            Paste the key into <strong>Tools → DeusADS → Settings</strong> in Unity, then press Send placements.
          </p>
          <div className="gm-key-row">
            <code ref={codeRef} className="gm-key-code">{shown ? game.apiKey : "•".repeat(24)}</code>
            <button type="button" className="gm-key-btn" aria-label="Show or hide key" title="Show or hide key" aria-pressed={shown} onClick={() => setShown((value) => !value)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 100 6 3 3 0 000-6z" />
                {!shown && <path d="M3 3l18 18" />}
              </svg>
            </button>
            <button type="button" className="gm-key-btn gm-key-copy" aria-label="Copy key" onClick={copy}>
              {copied ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5" /><path d="M10.5 3.2V3A1.5 1.5 0 009 1.5H4A1.5 1.5 0 002.5 3v5A1.5 1.5 0 004 9.5h.2" strokeLinecap="round" /></svg>
              )}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function CoverDialog({ game, onClose }) {
  const router = useRouter();
  const fileRef = useRef(null);
  // pend: { preset: id | null (the default colour), blob?, preview? } until Save.
  const [pend, setPend] = useState({ preset: game.coverKind === "preset" ? game.coverId : null, blob: null, preview: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [keepImage, setKeepImage] = useState(game.coverKind === "image");
  useEffect(() => () => pend.preview && URL.revokeObjectURL(pend.preview), [pend.preview]);

  const background = pend.preview
    ? `center / cover no-repeat url("${pend.preview}")`
    : keepImage
      ? game.coverCss
      : pend.preset
        ? COVERS.find((cover) => cover.id === pend.preset).css
        : game.defaultCss;

  async function pick(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    if (!["image/png", "image/jpeg"].includes(file.type)) return setError("Use a PNG or a JPG picture.");
    if (file.size > COVER_MAX_BYTES) return setError("That picture is over 8 MB.");
    try {
      const blob = await cropToStrip(file);
      setPend({ preset: null, blob, preview: URL.createObjectURL(blob) });
      setKeepImage(false);
    } catch {
      setError("That file could not be read as a picture.");
    }
  }

  async function save(close) {
    setBusy(true);
    setError("");
    let result;
    if (pend.blob) {
      const db = browserClient();
      const { data } = await db.auth.getSession();
      const userId = data?.session?.user?.id;
      if (!userId) {
        setBusy(false);
        return setError("Your session expired. Sign in again.");
      }
      const path = `${userId}/game-cover-${game.id}-${Date.now()}.jpg`;
      const { error: uploadError } = await db.storage.from("creatives").upload(path, pend.blob, { contentType: "image/jpeg", cacheControl: "31536000", upsert: false });
      if (uploadError) {
        setBusy(false);
        return setError("The upload failed. Try again.");
      }
      result = await setGameCover({ gameId: game.id, path }).catch(() => ({ error: "Connection lost. Try again." }));
    } else if (keepImage) {
      setBusy(false);
      return close();
    } else {
      result = await setGameCover({ gameId: game.id, preset: pend.preset }).catch(() => ({ error: "Connection lost. Try again." }));
    }
    setBusy(false);
    if (result?.error) return setError(result.error);
    router.refresh();
    close();
  }

  return (
    <Modal label="Header image" onClose={onClose} width={520}>
      {(close) => (
        <>
          <DialogHead icon={<IcImage size={24} />} title="Header image" name={game.name} close={close} />
          <div className="gm-dbody" style={{ gap: 18 }}>
            <div className="gm-preview" style={{ background }}>
              <span>Preview</span>
            </div>
            <div>
              <div className="gm-cap" style={{ marginBottom: 10 }}>Colours</div>
              <div className="gm-swatches">
                {COVERS.map((cover) => {
                  const on = !pend.blob && !keepImage && pend.preset === cover.id;
                  return (
                    <button
                      key={cover.id}
                      type="button"
                      aria-label={cover.name}
                      aria-pressed={on}
                      className="gm-swatch"
                      style={{ background: cover.css, borderColor: on ? "#241d19" : "#fff" }}
                      onClick={() => {
                        setPend({ preset: cover.id, blob: null, preview: "" });
                        setKeepImage(false);
                        setError("");
                      }}
                    />
                  );
                })}
              </div>
            </div>
            <div>
              <div className="gm-cap" style={{ marginBottom: 10 }}>Or your own picture</div>
              <div className="gm-upload">
                <span>
                  <Svg size={20}><path d="M12 16V4M7 9l5-5 5 5M4 20h16" /></Svg>
                </span>
                <div>
                  <b>Upload a picture</b>
                  <br />
                  <span className="gm-when">PNG or JPG, wide, under 8 MB. It is cropped to the strip.</span>
                </div>
                <button type="button" className="gm-btn gm-btn-sm" onClick={() => fileRef.current?.click()}>Choose file</button>
                <input ref={fileRef} type="file" accept="image/png,image/jpeg" hidden onChange={pick} />
              </div>
            </div>
            {error && <p className="error" role="alert" style={{ margin: 0 }}>{error}</p>}
          </div>
          <div className="gm-dfoot">
            <button
              type="button"
              className="gm-reset"
              disabled={busy}
              onClick={() => {
                setPend({ preset: null, blob: null, preview: "" });
                setKeepImage(false);
                setError("");
              }}
            >
              Back to default
            </button>
            <span>
              <button type="button" className="gm-btn" disabled={busy} onClick={close}>Cancel</button>
              <button type="button" className="gm-btn gm-btn-primary" disabled={busy} onClick={() => save(close)}>{busy ? "Saving…" : "Save"}</button>
            </span>
          </div>
        </>
      )}
    </Modal>
  );
}

/** One game on My games: its header, the name plate with the connection, two counts, the link in, and the three-dot menu. */
export default function GameCard({ game }) {
  const [menu, setMenu] = useState(false);
  const [dlg, setDlg] = useState("");
  const box = useRef(null);

  useEffect(() => {
    if (!menu) return undefined;
    const away = (event) => {
      if (box.current && !box.current.contains(event.target)) setMenu(false);
    };
    const escape = (event) => event.key === "Escape" && setMenu(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [menu]);

  const open = (kind) => {
    setMenu(false);
    setDlg(kind);
  };
  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

  return (
    <article className="gm-card">
      <div className="gm-cover" style={{ background: game.coverCss }} />
      <div className="gm-menu" ref={box}>
        <button type="button" className="gm-dots" aria-label="Game actions" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((value) => !value)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="12" cy="5" r="1.9" />
            <circle cx="12" cy="12" r="1.9" />
            <circle cx="12" cy="19" r="1.9" />
          </svg>
        </button>
        {menu && (
          <div role="menu" className="gm-pop">
            <Link role="menuitem" className="gm-mi" href={`/dashboard/games?tab=performance&game=${game.id}`} onClick={() => setMenu(false)}><IcChart /><span>Performance</span></Link>
            <Link role="menuitem" className="gm-mi" href={`/dashboard/g/${game.id}?tab=settings`} onClick={() => setMenu(false)}><IcGear /><span>Settings</span></Link>
            <button type="button" role="menuitem" className="gm-mi" onClick={() => open("img")}><IcImage /><span>Change header image</span></button>
            <button type="button" role="menuitem" className="gm-mi" onClick={() => open("conn")}><IcPlug /><span>Connection details</span></button>
            <button type="button" role="menuitem" className="gm-mi" onClick={() => open("key")}><IcKey /><span>Show key</span></button>
          </div>
        )}
      </div>
      <div className="gm-body">
        <div className="gm-plate">
          <span className="gm-icon">
            <GameIcon name={game.name} url={game.iconUrl} />
            <i className="gm-status" style={{ background: game.dot }} role="img" aria-label={`SDK: ${game.label}`} />
          </span>
          <div>
            <h2>{game.name}</h2>
            <div className="gm-sub">
              <b style={{ color: game.word }}>{game.label}</b> · {game.sub}
            </div>
          </div>
        </div>
        <div className="gm-chips">
          <span>{plural(game.placements, "placement")}</span>
          <span>{plural(game.campaigns, "campaign")}</span>
        </div>
      </div>
      <Link href={game.mode === "new" ? `/dashboard/g/${game.id}?tab=settings` : `/dashboard/g/${game.id}`} className="gm-link">
        {game.mode === "new" ? "Set up SDK" : "Open game"}
        <Chevron />
      </Link>
      {dlg === "conn" && <ConnectionDialog game={game} onClose={() => setDlg("")} />}
      {dlg === "key" && <KeyDialog game={game} onClose={() => setDlg("")} />}
      {dlg === "img" && <CoverDialog game={game} onClose={() => setDlg("")} />}
    </article>
  );
}
