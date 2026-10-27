"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CloseIcon, LockIcon, Message, SendIcon, ShotPicker, StripFace, submitSupport, toneStyle, useNow, useShots } from "./support-ui";
import { lockOf } from "../../../lib/support-rules";
import { openRequest } from "./actions";

const POLL_MS = 8000;

/** What changed in a conversation, cheap to compare: a new message or a new status. */
const signature = (c) => `${c.request.status}|${c.request.type}|${c.messages.length}|${c.messages.at(-1)?.id ?? ""}`;

/**
 * One request as a large pop-up: the request's strip is the header, then the conversation, then the reply box (or the
 * reason the conversation is closed, with "Start a follow-up request" when a new one makes sense). The conversation is
 * checked every few seconds while the window is open.
 */
export default function RequestWindow({ id, summary, onClose, onFollowUp, onSeen }) {
  const router = useRouter();
  const now = useNow();
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
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
      if (!seen.current) {
        seen.current = true;
        if (body.request.unread) { openRequest({ requestId: id }).then(() => onSeen?.(id)); }
      }
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

  const request = data?.request ?? summary;
  const lock = data ? lockOf(data.request) : null;

  async function reply() {
    if (busy || (!text.trim() && !picker.files.length)) return;
    setBusy(true);
    setError("");
    const result = await submitSupport({ action: "reply", requestId: id, text: text.trim() }, picker.files);
    setBusy(false);
    if (result.error) {
      if (result.followUp) await load(false);
      return setError(result.error);
    }
    setText("");
    picker.clear();
    last.current = "";
    await load(false);
    router.refresh();
  }

  return (
    <div className="sp-veil" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sp-dlg" role="dialog" aria-modal="true" aria-label={request?.title ?? "Request"}>
        {request ? (
          <div className="cx-strip sp-head" style={toneStyle(request)}>
            <StripFace request={request} now={now} />
            <div className="cx-right"><button type="button" className="rd-more" aria-label="Close" onClick={onClose}><CloseIcon /></button></div>
          </div>
        ) : (
          <div className="cx-strip sp-head"><div className="cx-right"><button type="button" className="rd-more" aria-label="Close" onClick={onClose}><CloseIcon /></button></div></div>
        )}
        <div className="sp-msgs sp-conv" ref={list}>
          {failed ? <p className="sp-problem" role="alert">{failed}</p>
            : !data ? <div className="sp-wait"><span className="spinner" aria-hidden="true" /> Opening…</div>
            : data.messages.map((m) => <Message key={m.id} message={m} />)}
        </div>
        {data && (lock ? (
          <div className="sp-locked">
            <LockIcon />
            <span>{lock.why}</span>
            {lock.followUp && <button type="button" className="button button-quiet" onClick={() => onFollowUp(data.request)}>Start a follow-up request</button>}
          </div>
        ) : (
          <div className="sp-reply">
            <ShotPicker picker={picker} />
            <div className="sp-reply-row">
              <textarea
                className="field"
                rows={2}
                maxLength={6000}
                value={text}
                placeholder="Reply to the developer…"
                aria-label="Your reply"
                onChange={(e) => setText(e.target.value)}
                onPaste={(e) => { const files = [...(e.clipboardData?.files ?? [])]; if (files.some((f) => f.type.startsWith("image/"))) { e.preventDefault(); picker.add(files); } }}
                onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); reply(); } }}
              />
              <button type="button" className="sp-ib is-primary" aria-label="Send reply" title="Send (Ctrl+Enter)" disabled={busy || (!text.trim() && !picker.files.length)} onClick={reply}>
                {busy ? <span className="spinner" aria-hidden="true" /> : <SendIcon />}
              </button>
            </div>
            {error && <p className="sp-problem" role="alert">{error}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

