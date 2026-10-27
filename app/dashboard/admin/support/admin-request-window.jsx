"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CaretIcon, CloseIcon, Message, ShotPicker, StripFace, TypeIcon, submitSupport, toneStyle, useNow, useShots } from "../../support/support-ui";
import { STATUS_LABEL, TYPES, TYPE_LABEL, allowedStatuses } from "../../../../lib/support-rules";
import { changeStatus, changeType, openRequest } from "../../support/actions";

const POLL_MS = 8000;
const QUICK = [
  ["Looking into it", "Thanks for the report — I’m looking into it."],
  ["Ask for screenshot", "Could you send a screenshot of the page where this happens?"],
  ["Fixed", "Fixed. It reaches players at their next launch."],
];

/** The request as the admin's other pop-up needs it: the strip reads camelCase fields. */
export const camel = (r) => ({
  id: r.id, number: r.number, type: r.type, title: r.title, status: r.status,
  createdAt: r.created_at, lastMessageAt: r.last_message_at, statusChangedAt: r.status_changed_at, unread: false,
});

const signature = (c) => `${c.request.status}|${c.request.type}|${c.messages.length}|${c.messages.at(-1)?.id ?? ""}`;

/**
 * A request for the admin: the strip is the header (click the icon to change the type, the select changes the status),
 * the technical details the person sent, the conversation (internal notes included), then the reply box with quick
 * replies and an "Internal note" switch.
 */
export default function AdminRequestWindow({ id, summary, onClose }) {
  const router = useRouter();
  const now = useNow();
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState("");
  const [text, setText] = useState("");
  const [note, setNote] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [typeMenu, setTypeMenu] = useState(false);
  const picker = useShots();
  const list = useRef(null);
  const last = useRef("");
  const seen = useRef(false);

  const load = useCallback(async (quiet) => {
    try {
      const response = await fetch(`/dashboard/support/conversation?id=${encodeURIComponent(id)}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) return quiet ? null : setFailed(body.error || "Could not open this request.");
      if (signature(body) !== last.current) {
        const stuck = !list.current || list.current.scrollHeight - list.current.scrollTop - list.current.clientHeight < 80;
        last.current = signature(body);
        setData(body);
        if (stuck) requestAnimationFrame(() => list.current?.scrollTo({ top: list.current.scrollHeight }));
        if (quiet) router.refresh();
      }
      if (!seen.current) { seen.current = true; if (body.request.admin_unread) openRequest({ requestId: id }).then(() => router.refresh()); }
    } catch {
      if (!quiet) setFailed("Connection lost. Close this window and try again.");
    }
  }, [id]);

  useEffect(() => {
    load(false);
    const timer = setInterval(() => { if (!document.hidden) load(true); }, POLL_MS);
    const key = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", key);
    return () => { clearInterval(timer); document.removeEventListener("keydown", key); };
  }, [load]);

  const row = data?.request ?? summary;
  const request = row ? camel(row) : null;

  async function act(call) {
    setError("");
    const result = await call().catch(() => ({ error: "Connection lost. Try again." }));
    if (result?.error) return setError(result.error);
    last.current = "";
    await load(false);
    router.refresh();
  }

  async function send() {
    if (busy || (!text.trim() && !picker.files.length)) return;
    setBusy(true);
    setError("");
    const fields = { action: "reply", requestId: id, text: text.trim() };
    if (note) fields.note = "1";
    const result = await submitSupport(fields, picker.files);
    setBusy(false);
    if (result.error) return setError(result.error);
    setText("");
    picker.clear();
    last.current = "";
    await load(false);
    router.refresh();
  }

  const typeTile = request && (
    <span className="sq-type">
      <button type="button" className="rd-tile sq-tile" title="Change the type of this request" aria-haspopup="menu" aria-expanded={typeMenu} aria-label="Change type" onClick={() => setTypeMenu((v) => !v)}>
        <TypeIcon type={request.type} size={20} /><i className="sq-tcar"><CaretIcon size={8} /></i>
      </button>
      {typeMenu && (
        <div className="sp-menu sq-typemenu" role="menu">
          {TYPES.map((t) => (
            <button key={t} type="button" role="menuitemradio" aria-checked={request.type === t} className="fl-opt" onClick={() => { setTypeMenu(false); if (t !== request.type) act(() => changeType({ requestId: id, type: t })); }}>
              <span className="sq-ti"><TypeIcon type={t} size={16} /></span>{TYPE_LABEL[t]}{request.type === t && <span className="sp-tick">✓</span>}
            </button>
          ))}
        </div>
      )}
    </span>
  );

  const statuses = request ? [...new Set([...allowedStatuses(request.type), request.status])] : [];
  const ctx = Object.entries(data?.context ?? {});

  return (
    <div className="sp-veil" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sp-dlg" role="dialog" aria-modal="true" aria-label={row?.title ?? "Request"}>
        <div className="cx-strip sp-head" style={request ? toneStyle(request) : undefined}>
          {request && <StripFace request={request} now={now} admin typeSlot={typeTile} />}
          <div className="cx-right">
            {request && (
              <select className="field sq-status" aria-label="Status" value={request.status} onChange={(e) => act(() => changeStatus({ requestId: id, status: e.target.value }))}>
                {statuses.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            )}
            <button type="button" className="rd-more" aria-label="Close" onClick={onClose}><CloseIcon /></button>
          </div>
        </div>
        {row && (
          <div className="sq-ctx">
            <div><b>From</b><Link href={`/dashboard/admin/users/${row.owner_id}`}>{row.owner_name}</Link> · {row.owner_role}</div>
            {row.owner_email && <div><b>Email</b>{row.owner_email}</div>}
            {ctx.map(([k, v]) => <div key={k}><b>{k}</b>{String(v)}</div>)}
          </div>
        )}
        <div className="sp-msgs sp-conv" ref={list}>
          {failed ? <p className="sp-problem" role="alert">{failed}</p>
            : !data ? <div className="sp-wait"><span className="spinner" aria-hidden="true" /> Opening…</div>
            : data.messages.map((m) => <Message key={m.id} message={m} admin ownerName={row.owner_name} />)}
        </div>
        {data && (
          <div className="sp-reply">
            <div className="sq-quick">
              <span>Quick replies:</span>
              {QUICK.map(([label, body]) => <button key={label} type="button" className="sp-chip" onClick={() => { setNote(false); setText(body); }}>{label}</button>)}
            </div>
            <ShotPicker picker={picker} />
            <div className="sp-reply-row">
              <textarea
                className="field"
                rows={2}
                maxLength={6000}
                value={text}
                placeholder={note ? "Internal note — the person will not see it" : "Reply to the person…"}
                aria-label="Your reply"
                onChange={(e) => setText(e.target.value)}
                onPaste={(e) => { const files = [...(e.clipboardData?.files ?? [])]; if (files.some((f) => f.type.startsWith("image/"))) { e.preventDefault(); picker.add(files); } }}
                onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } }}
              />
              <button type="button" className="button" disabled={busy || (!text.trim() && !picker.files.length)} onClick={send}>{busy ? "Sending…" : note ? "Save note" : "Send"}</button>
            </div>
            <label className="sq-note-toggle">
              <input type="checkbox" checked={note} onChange={(e) => setNote(e.target.checked)} />
              <span>Internal note</span>
              <small>{note ? "Only admins see it." : "The person gets a bell notification (and an email, if they chose so) for every reply."}</small>
            </label>
            {error && <p className="sp-problem" role="alert">{error}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

