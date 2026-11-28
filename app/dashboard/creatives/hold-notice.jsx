"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { browserClient } from "../../../lib/supabase-browser";
import { rulesLink } from "../../../lib/platform-rules";
import { fdt, fdtTime } from "../../../lib/admin-format";
import { registerAsset, replaceMainPicture, replyToDeusADS, sendHeldPicture, sendNewVersion } from "./actions";
import { Busy, refreshPage, useWaitMark } from "../wait";

const TYPES = { "image/png": "png", "image/jpeg": "jpg" };
const measure = (file) => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => { URL.revokeObjectURL(url); resolve({ width: img.naturalWidth, height: img.naturalHeight }); };
  img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("This file does not open as an image.")); };
  img.src = url;
});

/**
 * What DeusADS decided on a creative after a report, as its advertiser reads it: the rule, the message, what it means,
 * and what can be done. `hold` is lib/report-rules.js holdOf() plus `thread` (the conversation with DeusADS) and (on the creative's own page) `changed`.
 * On the creative's page (`onPage`) a creative that waits for a change gets its tools: a new main picture, and sending
 * the new version for review. Elsewhere the button leads to that page.
 */
export function HoldNotice({ creativeId, hold, onPage = false, onPicture }) {
  const router = useRouter();
  const file = useRef(null);
  const [busy, setBusy] = useState("");
  useWaitMark(Boolean(busy));
  const [problem, setProblem] = useState("");
  const [done, setDone] = useState("");
  const [writing, setWriting] = useState(false);
  const [text, setText] = useState("");
  // The box to write in opens at the end of the conversation, which may be below what is on screen: it is brought into
  // view and takes the cursor, so "Write again" always leads to a place to type.
  const box = useRef(null);
  useEffect(() => {
    if (!writing) return;
    box.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    box.current?.focus({ preventScroll: true });
  }, [writing]);
  // what was said since the decision; a message just sent shows at once
  const [thread, setThread] = useState(hold.thread ?? []);
  const last = thread.at(-1)?.side ?? null;
  const blocked = hold.kind === "blocked";
  // a hold of one picture (a creative in one shape) or of the whole creative (an old report without a shape)
  const picture = Boolean(hold.shape);
  const what = picture ? `${hold.shapeLabel} picture` : "creative";
  const [sentNow, setSentNow] = useState(false);
  // the new picture that waits for review: the one just uploaded, or the one sent earlier
  const [sentPicture, setSentPicture] = useState(hold.sentPicture ?? null);
  const sent = hold.sent || sentNow;
  const act = async (name, work) => {
    setBusy(name);
    setProblem("");
    setDone("");
    try {
      const result = await work();
      if (result?.error) setProblem(result.error);
      else return result;
    } catch (error) {
      setProblem(error?.message || "Connection lost. Try again.");
    } finally {
      setBusy("");
    }
    return null;
  };

  async function replace(picked) {
    if (!picked) return;
    const result = await act("picture", async () => {
      if (!TYPES[picked.type]) return { error: "Images must be PNG or JPG." };
      const size = await measure(picked);
      const db = browserClient();
      const { data } = await db.auth.getSession();
      const userId = data?.session?.user?.id;
      if (!userId) return { error: "Your session expired. Sign in again." };
      const path = `${userId}/${crypto.randomUUID()}.${TYPES[picked.type]}`;
      const { error } = await db.storage.from("creatives").upload(path, picked, { contentType: picked.type, cacheControl: "31536000", upsert: false });
      if (error) return { error: "Upload failed. Try again." };
      // for a held shape: a picture made for that shape, which goes to review by itself; otherwise a new main picture
      return picture
        ? registerAsset({ creativeId, formatId: /^r\d+x\d+$/.test(hold.shape) ? hold.shape : "custom", forShape: hold.shape, path, type: picked.type, size: picked.size, width: size.width, height: size.height })
        : replaceMainPicture({ creativeId, path, type: picked.type, size: picked.size, width: size.width, height: size.height });
    });
    if (result?.ok) {
      if (picture && result.url) {
        // uploaded, not sent yet: the advertiser looks at it first
        setSentPicture({ url: result.url, size: `${result.width} × ${result.height}`, at: new Date().toISOString() });
        // the editor next to this note shows the new picture in that shape at once
        onPicture?.(hold.shape, { id: result.id, url: result.url });
      }
      setDone(picture ? "" : "The main picture is replaced. Check the shapes below, then send the new version for review.");
      refreshPage(router);
    }
  }
  async function sendPicture() {
    const result = await act("send", () => sendHeldPicture({ creativeId, shape: hold.shape }));
    if (result?.ok) {
      setSentNow(true);
      setDone(`Sent. DeusADS is checking the new ${what}; it runs again once it is approved.`);
      refreshPage(router);
    }
  }
  async function send() {
    const result = await act("send", () => sendNewVersion({ creativeId }));
    if (result?.ok) {
      setDone("Sent for review. It runs again in the same games once it is approved.");
      refreshPage(router);
    }
  }
  async function reply() {
    const result = await act("reply", () => replyToDeusADS({ creativeId, disputeId: hold.disputeId ?? null, text }));
    if (result?.ok) {
      setThread((list) => [...list, result.message]);
      setWriting(false);
      setText("");
    }
  }

  // a new picture is uploaded and waits for the advertiser to send it
  const draft = picture && !blocked && !sent && Boolean(sentPicture);
  const title = blocked ? `DeusADS blocked ${picture ? `the ${what}` : "this creative"}`
    : sent ? `Your new ${picture ? what : "version"} is in review`
      : draft ? `Send the new ${what} for review`
        : `DeusADS asks you to change ${picture ? `the ${what}` : "this creative"}`;
  const lead = blocked ? `It breaks a platform rule and is not shown anywhere. ${picture ? "The creative’s other shapes keep running." : "Campaigns keep running with their other creatives."} Nothing is charged for what is not shown.`
    : sent ? `DeusADS is checking it. Once it is approved, ${picture ? "this shape" : "the creative"} runs again in the same games.`
      : draft ? "The picture is uploaded but not sent yet. Look at it, then send it. Until it is approved this shape is shown in no game."
        : `Until a new one is approved, ${picture ? "this shape is" : "it is"} not shown in any game. ${picture ? "The creative’s other shapes keep running." : "Campaigns keep running with their other creatives."}`;
  const picker = <input ref={file} type="file" accept="image/png,image/jpeg" hidden onChange={(e) => { const picked = e.target.files?.[0]; e.target.value = ""; replace(picked); }} />;

  return (
    <div className={`hold-note ${blocked ? "is-blocked" : sent ? "is-sent" : "is-change"}`}>
      <div className="hold-top">
        <span className={`hold-tag ${blocked ? "is-bad" : sent ? "is-wait" : "is-act"}`}>{blocked ? "Blocked" : sent ? "In review" : draft ? "Not sent yet" : "Needs changes"}</span>
        <h3>{title}</h3>
        <p>{lead}</p>
      </div>

      {(hold.rule || hold.note) && (
        <div className="hold-why">
          {hold.rule && <div className="hold-row"><span className="hold-label">{blocked ? "Rule broken" : "Rule"}</span><b>{hold.rule}</b></div>}
          {hold.note && <div className="hold-row"><span className="hold-label">What DeusADS wrote</span><p>{hold.note}</p></div>}
          {hold.at && <small>{fdt(hold.at)} · after a report from a game where it {blocked ? "ran" : "runs"}</small>}
        </div>
      )}

      {!blocked && picture && sentPicture && (
        <div className={`hold-sent${draft ? " is-draft" : ""}`}>
          <a href={sentPicture.url} target="_blank" rel="noreferrer" className="hold-sent-img" style={{ backgroundImage: `url(${sentPicture.url})` }} aria-label="Open your new picture in full size" />
          <div>
            <span className="hold-label">Your new {what}</span>
            <span>{sentPicture.size}</span>
            <span>{draft ? "Not sent yet." : "In review. It replaces the reported picture once DeusADS approves it."}</span>
          </div>
        </div>
      )}

      {problem && <p className="error" role="alert">{problem}</p>}
      {done && <p className="upload-done" role="status">{done}</p>}
      {!blocked && !sent && (
        <div className="hold-acts">
          {picture ? (draft ? (
            <>
              {picker}
              <button type="button" className="button button-small" disabled={Boolean(busy)} onClick={sendPicture}>{busy === "send" ? <Busy>Sending…</Busy> : "Send this picture for review"}</button>
              <button type="button" className="button button-quiet button-small" disabled={Boolean(busy)} onClick={() => file.current?.click()}>{busy === "picture" ? <Busy>Uploading…</Busy> : "Choose another picture"}</button>
            </>
          ) : (
            <>
              {picker}
              <button type="button" className="button button-small" disabled={Boolean(busy)} onClick={() => file.current?.click()}>{busy === "picture" ? <Busy>Uploading…</Busy> : `Upload a new ${what}`}</button>
            </>
          )) : onPage ? (
            <>
              {picker}
              <button type="button" className="button button-small" disabled={Boolean(busy)} onClick={() => file.current?.click()}>{busy === "picture" ? <Busy>Uploading…</Busy> : "Replace the main picture"}</button>
              <button type="button" className="button button-quiet button-small" disabled={Boolean(busy) || !hold.changed} title={hold.changed ? undefined : "Replace the main picture or a shape’s picture first"} onClick={send}>{busy === "send" ? <Busy>Sending…</Busy> : "Send for review"}</button>
            </>
          ) : <Link href={`/dashboard/creatives/${creativeId}`} className="button button-small">Upload a new version</Link>}
        </div>
      )}
      {picture && !blocked && !sent && !draft && <p className="hold-hint">A PNG or JPG made for the {hold.shapeLabel} shape. Nothing is sent until you press Send.</p>}
      {!picture && onPage && !blocked && !sent && <p className="hold-hint">Replace the main picture here, or a single shape’s picture below. Then send the new version for review.</p>}

      <div className="hold-talk">
        <div className="hold-talk-h"><span className="hold-label">Conversation with DeusADS</span><Link href={rulesLink("adv")} className="link-button">Platform rules</Link></div>
        {thread.length === 0 && !writing && <p className="hold-state">{blocked ? "If you think the decision is a mistake, write to DeusADS here." : "A question, or you think the decision is wrong? Write to DeusADS here."}</p>}
        {thread.map((message, index) => (
          <div key={index} className={`hold-msg${message.side === "advertiser" ? " is-mine" : ""}`}><span className="hold-msg-h"><b>{message.side === "advertiser" ? "You" : "DeusADS"}</b><small suppressHydrationWarning>{fdtTime(message.at)} UTC</small></span><p>{message.text}</p></div>
        ))}
        {last && <p className={`hold-state${last === "admin" ? " is-new" : ""}`} role="status">{last === "advertiser" ? "Waiting for DeusADS: the review team has your message and will answer here." : "DeusADS replied. You can answer here."}</p>}
        {writing && (
          <div className="hold-reply">
            <label htmlFor={`hold-reply-${creativeId}-${hold.shape ?? "whole"}`}>Your message to DeusADS</label>
            <textarea ref={box} id={`hold-reply-${creativeId}-${hold.shape ?? "whole"}`} className="field" rows={3} placeholder="Write your message here" maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} />
          </div>
        )}
        <div className="hold-acts">
          {writing
            ? <><button type="button" className="button button-small" disabled={Boolean(busy) || !text.trim()} onClick={reply}>{busy === "reply" ? <Busy>Sending…</Busy> : "Send message"}</button><button type="button" className="button button-quiet button-small" disabled={Boolean(busy)} onClick={() => setWriting(false)}>Cancel</button></>
            : <button type="button" className="button button-quiet button-small" onClick={() => setWriting(true)}>{thread.length ? "Write again" : "Write to DeusADS"}</button>}
        </div>
      </div>
    </div>
  );
}
