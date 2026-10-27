"use client";

import { useEffect, useRef, useState } from "react";
import { Info } from "../metrics-deck";
import { PROGRESS, STATUS_LABEL, TYPE_LABEL, LIMITS, lockOf, toneOf, waitLabel } from "../../../lib/support-rules";

/** Small pieces used by the page, the corner pop-ups and the request window. */

const svg = (children, size = 16, extra = {}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...extra}>{children}</svg>
);

export const ChatIcon = ({ size = 18 }) => svg(<path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z" />, size);
export const SendIcon = ({ size = 18 }) => svg(<path d="M4 12l16-8-6 17-3-7-7-2z" />, size);
export const ClipIcon = ({ size = 18 }) => svg(<path d="M20 11l-8.5 8.5a5 5 0 01-7-7L13 4a3.3 3.3 0 014.7 4.7L9.2 17.2a1.7 1.7 0 01-2.4-2.4L14 7.5" />, size);
export const PenIcon = ({ size = 18 }) => svg(<><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" /></>, size);
export const CloseIcon = ({ size = 18 }) => svg(<path d="M6 6l12 12M18 6L6 18" />, size, { strokeWidth: 2.2 });
export const LockIcon = ({ size = 16 }) => svg(<><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></>, size);
export const FolderIcon = ({ size = 18 }) => svg(<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />, size);
export const FolderPlusIcon = ({ size = 16 }) => svg(<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2zM12 11v5M9.5 13.5h5" />, size);
export const TrashIcon = ({ size = 16 }) => svg(<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />, size);
export const CaretIcon = ({ size = 16 }) => svg(<path d="M6 9l6 6 6-6" />, size, { strokeWidth: 2.4 });

const TYPE_ICON = {
  bug: (size) => svg(<path d="M8 8h8v7a4 4 0 01-8 0V8zM9 8a3 3 0 016 0M3 12h5M16 12h5M4 19l4-3M20 19l-4-3M4 5l4 3M20 5l-4 3" />, size),
  idea: (size) => svg(<path d="M9 18h6M10 21h4M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0012 3z" />, size),
  question: (size) => svg(<><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 115 0c0 1.5-2.5 2-2.5 3.5M12 17h.01" /></>, size),
};
export const TypeIcon = ({ type, size = 16 }) => (TYPE_ICON[type] ?? TYPE_ICON.question)(size);

/** The time "now", known only in the browser (null while the page is built on the server), so relative times cannot mismatch. */
export function useNow() {
  const [now, setNow] = useState(null);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "27 Oct" (in UTC, so the server and the browser agree). */
export const dayOf = (iso) => { const d = new Date(iso); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; };
/** "27 Oct, 14:05" in the viewer's time zone (only rendered after the page is in the browser). */
export const stampOf = (iso) => { const d = new Date(iso); return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const agoOf = (iso, now) => (now ? `${waitLabel(Math.max(0, now - new Date(iso).getTime()) / 3600000)} ago` : dayOf(iso));

const NOTE = (request, now, admin) => (admin ? {
  new: "Waiting for your reply",
  answered: `You replied · ${agoOf(request.lastMessageAt, now)}`,
  noted: `Noted · ${agoOf(request.statusChangedAt, now)}`,
  resolved: `Resolved · ${agoOf(request.statusChangedAt, now)}`,
} : {
  new: "Waiting for the developer",
  answered: `Developer replied · ${agoOf(request.lastMessageAt, now)}`,
  noted: `Noted · ${agoOf(request.statusChangedAt, now)}`,
  resolved: `Resolved · ${agoOf(request.statusChangedAt, now)}`,
})[request.status];

/** The picture-less cover of a strip: the tone fading into white. */
const COVER = "linear-gradient(105deg,color-mix(in srgb,var(--tone) 34%,#fff),color-mix(in srgb,var(--tone) 22%,#fff) 55%,color-mix(in srgb,var(--tone) 9%,#fff))";

/**
 * The cover, the white plate with the type icon, title, status and the progress bar. The same markup as a campaign
 * strip, so the request list looks like the Campaigns list; the request window uses it as its header.
 */
export function StripFace({ request, now, admin = false, typeSlot = null }) {
  const running = request.status === "new" || request.status === "answered";
  return (
    <>
      <div className="cx-scover"><div className="cx-pic" style={{ background: COVER }} /></div>
      <div className="cx-splate">
        <span className="cx-ic">{typeSlot ?? <span className="rd-tile"><TypeIcon type={request.type} size={20} /></span>}</span>
        <div className="cx-txt">
          <h3>{request.title}</h3>
          <div className="cx-sub"><b>{STATUS_LABEL[request.status]}</b> · {TYPE_LABEL[request.type]} · #{request.number}</div>
        </div>
        <div className="cx-dates">
          <div className={`cx-dr${running ? " is-running" : ""}`}>
            <div className="cx-dl"><b>Sent {dayOf(request.createdAt)}</b><span suppressHydrationWarning>{NOTE(request, now, admin)}</span></div>
            <div className="cx-dr-track"><i className="cx-dr-fill" style={{ width: `${PROGRESS[request.status]}%` }} /></div>
          </div>
        </div>
      </div>
    </>
  );
}

export const toneStyle = (request) => ({ "--tone": `var(--cx-${toneOf(request)})` });

/** Read a user's browser from its user-agent string: "Chrome 130 · macOS". */
export function browserLabel() {
  const ua = navigator.userAgent;
  const pick = (patterns) => patterns.map(([name, re]) => { const m = ua.match(re); return m ? `${name} ${m[1].split(".")[0]}` : null; }).find(Boolean);
  const browser = pick([["Edge", /Edg\/([\d.]+)/], ["Firefox", /Firefox\/([\d.]+)/], ["Chrome", /Chrome\/([\d.]+)/], ["Safari", /Version\/([\d.]+).*Safari/]]) ?? "Browser";
  const system = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return system ? `${browser} · ${system}` : browser;
}

/** The technical details a request may carry. `withPage` adds the address of the page the person is on. */
export function buildContext({ role, withPage }) {
  const context = { Browser: browserLabel(), Role: role === "advertiser" ? "Advertiser" : role === "admin" ? "Admin" : "Developer" };
  if (withPage) context.Page = window.location.pathname;
  return context;
}

/** Sends a new request or a message with screenshots to the server. Resolves { ok, ... } or { error }. */
export async function submitSupport(fields, files = []) {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) body.append(key, typeof value === "string" ? value : JSON.stringify(value));
  for (const file of files) body.append("files", file, file.name || "screenshot");
  try {
    const response = await fetch("/dashboard/support/send", { method: "POST", body });
    const data = await response.json().catch(() => ({}));
    return response.ok ? data : { error: data.error || "Could not send. Try again." };
  } catch {
    return { error: "Connection lost. Try again." };
  }
}

/** Screenshots chosen for a message: paste, drop or file picker, shown as small thumbnails. */
export function useShots() {
  const [shots, setShots] = useState([]); // { file, url }
  const [problem, setProblem] = useState("");
  const urls = useRef([]);
  useEffect(() => () => urls.current.forEach((url) => URL.revokeObjectURL(url)), []);
  function add(list) {
    const images = [...list].filter((file) => file.type.startsWith("image/"));
    if (!images.length) return;
    setProblem("");
    setShots((current) => {
      const next = [...current];
      for (const file of images) {
        if (next.length >= LIMITS.screenshots) { setProblem(`Up to ${LIMITS.screenshots} screenshots.`); break; }
        if (file.size > LIMITS.screenshotBytes) { setProblem("A screenshot can be up to 5 MB."); continue; }
        const url = URL.createObjectURL(file);
        urls.current.push(url);
        next.push({ file, url });
      }
      return next;
    });
  }
  const remove = (index) => setShots((current) => current.filter((_, i) => i !== index));
  const clear = () => { setShots([]); setProblem(""); };
  return { shots, add, remove, clear, problem, files: shots.map((shot) => shot.file) };
}

/** The drop zone and thumbnails of the screenshots in a form. Pasting anywhere in the form also adds one. */
export function ShotPicker({ picker }) {
  const input = useRef(null);
  const [over, setOver] = useState(false);
  return (
    <>
      {picker.shots.length > 0 && (
        <div className="sp-thumbs">
          {picker.shots.map((shot, index) => (
            <div key={shot.url} className="sp-th" style={{ backgroundImage: `url(${shot.url})` }}>
              <button type="button" aria-label="Remove screenshot" onClick={() => picker.remove(index)}>×</button>
            </div>
          ))}
        </div>
      )}
      <div
        className={`sp-drop${over ? " is-over" : ""}`}
        role="button"
        tabIndex={0}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), input.current?.click())}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); picker.add(e.dataTransfer.files); }}
      >
        Paste a screenshot with <b>Ctrl+V</b>, drop it here or <u>choose a file</u>
        <span>PNG, JPG or WebP up to 5 MB</span>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => { picker.add(e.target.files); e.target.value = ""; }} />
      </div>
      {picker.problem && <p className="sp-problem" role="alert">{picker.problem}</p>}
    </>
  );
}

const FORM_TYPES = [["question", "Question"], ["bug", "Problem"], ["idea", "Idea"]];
const PLACEHOLDER = { bug: "What happened? What did you expect?", idea: "What would you like to see, and why?", question: "Your question" };

/**
 * The message to the developer: type, title, text, screenshots. `withContext` shows the "include the page and technical
 * details" box (pop-up); otherwise the technical details are attached without the page address.
 * `onSent(result, fields)` gets what the server answered.
 */
export function RequestForm({ role, seed, withContext = false, onSent, onCancel, cancelLabel = "Cancel" }) {
  const [type, setType] = useState(seed?.type ?? "question");
  const [title, setTitle] = useState(seed?.title ?? "");
  const [text, setText] = useState(seed?.text ?? "");
  const [withPage, setWithPage] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const picker = useShots();

  async function send() {
    if (busy) return;
    if (!title.trim()) return setError("Add a short title.");
    if (!text.trim() && !picker.files.length) return setError("Describe what happened.");
    setBusy(true);
    setError("");
    const context = buildContext({ role, withPage: withContext && withPage });
    const result = await submitSupport({ action: "create", type, title: title.trim(), text: text.trim(), context, via: seed?.via ?? "form" }, picker.files);
    setBusy(false);
    if (result.error) return setError(result.error);
    onSent(result, { type, title: title.trim(), text: text.trim(), shots: picker.shots.map((s) => s.url) });
    picker.clear();
  }

  return (
    <form className="sp-form-card" onSubmit={(e) => { e.preventDefault(); send(); }} onPaste={(e) => { const files = [...(e.clipboardData?.files ?? [])]; if (files.some((f) => f.type.startsWith("image/"))) { e.preventDefault(); picker.add(files); } }}>
      <div className="sp-seg" role="group" aria-label="Kind of message">
        {FORM_TYPES.map(([key, label]) => <button key={key} type="button" aria-pressed={type === key} onClick={() => setType(key)}>{label}</button>)}
      </div>
      <input className="field" placeholder="Short title" maxLength={LIMITS.title} value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Short title" />
      <textarea className="field" rows={4} maxLength={LIMITS.text} placeholder={PLACEHOLDER[type]} value={text} onChange={(e) => setText(e.target.value)} aria-label="Message" />
      <ShotPicker picker={picker} />
      {withContext && (
        <label className="sp-chk">
          <input type="checkbox" checked={withPage} onChange={(e) => setWithPage(e.target.checked)} />
          <span>Include the page I’m on and technical details <Info title="What is attached" text="Attached automatically: the address of the page you are on, your browser and system, and your role. Never passwords or keys." /></span>
        </label>
      )}
      {error && <p className="sp-problem" role="alert">{error}</p>}
      <div className="sp-form-actions">
        <button type="button" className="button button-quiet" onClick={onCancel} disabled={busy}>{cancelLabel}</button>
        <button type="submit" className="button" disabled={busy}>{busy ? "Sending…" : "Send"}</button>
      </div>
    </form>
  );
}

/** One message in a conversation. `mine` messages are the person's own. */
export function Message({ message, admin = false, ownerName = "User" }) {
  if (message.kind === "system") return <div className="sp-sys">{message.body}</div>;
  // The admin reads from the other side: the person is on the left, the developer (the admin) on the right.
  const mine = admin ? message.kind === "developer" || message.kind === "note" : message.kind === "user";
  const who = message.kind === "bot" ? "Assistant" : message.kind === "note" ? "Internal note" : message.kind === "developer" ? (admin ? "You" : "Developer") : admin ? ownerName : "You";
  const mark = message.kind === "bot" ? "D" : message.kind === "developer" || message.kind === "note" ? (admin ? "You" : "Dev") : admin ? ownerName.charAt(0).toUpperCase() : "You";
  return (
    <div className={`sp-m is-${message.kind}${mine ? " is-me" : ""}`}>
      <span className="sp-who" aria-hidden="true">{mark}</span>
      <div className={`sp-bub${message.kind === "note" ? " is-note" : ""}`}>
        <span className="sp-by">{who}</span>
        {message.body && <span className="sp-text">{message.body}</span>}
        {message.screenshots?.map((shot) => (
          // eslint-disable-next-line @next/next/no-img-element
          <a key={shot.id} href={shot.url} target="_blank" rel="noreferrer"><img className="sp-shot" src={shot.url} alt="Screenshot" /></a>
        ))}
        {message.at && <span className="sp-tm" suppressHydrationWarning>{stampOf(message.at)}</span>}
      </div>
    </div>
  );
}

export { lockOf };

const TOP_COVER = "linear-gradient(105deg, #5a2a1e 0%, #a2432a 38%, #d9744f 70%, #f0b293 100%)";

/**
 * The window header of Help & feedback (and Support for the admin), as in the mockup and the game window: a warm cover
 * behind a white plate with the red chat icon, the title and one line under it, then the tabs like browser tabs.
 * The tabs are passed as children (a <nav className="tabs">).
 */
export function SupportTop({ title, sub, children }) {
  return (
    <div className="gp-top gp-top-card sp-top">
      <div className="gp-cover"><div className="gp-pic" style={{ background: TOP_COVER }} /></div>
      <div className="gp-plate-row">
        <div className="gm-plate gp-plate">
          <span className="gm-icon"><span className="sp-plate-ic"><ChatIcon size={26} /></span></span>
          <div><h1>{title}</h1><div className="gm-sub">{sub}</div></div>
        </div>
      </div>
      {children}
    </div>
  );
}
