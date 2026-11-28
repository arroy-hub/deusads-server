"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { browserClient } from "../../../lib/supabase-browser";
import { rulesLink } from "../../../lib/platform-rules";
import { fdt, fdtTime } from "../../../lib/admin-format";
import { registerAsset, replaceMainPicture, replyToDeusADS, sendNewVersion } from "./actions";
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
export function HoldNotice({ creativeId, hold, onPage = false }) {
  const router = useRouter();
  const file = useRef(null);
  const [busy, setBusy] = useState("");
  useWaitMark(Boolean(busy));
  const [problem, setProblem] = useState("");
  const [done, setDone] = useState("");
  const [writing, setWriting] = useState(false);
  const [text, setText] = useState("");
  // what was said since the decision; a message just sent shows at once
  const [thread, setThread] = useState(hold.thread ?? []);
  const last = thread.at(-1)?.side ?? null;
  const blocked = hold.kind === "blocked";
  // a hold of one picture (a creative in one shape) or of the whole creative (an old report without a shape)
  const picture = Boolean(hold.shape);
  const what = picture ? `${hold.shapeLabel} picture` : "creative";
  const [sentNow, setSentNow] = useState(false);
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
        ? registerAsset({ creativeId, formatId: /^r\d+x\d+$/.test(hold.shape) ? hold.shape : "custom", path, type: picked.type, size: picked.size, width: size.width, height: size.height })
        : replaceMainPicture({ creativeId, path, type: picked.type, size: picked.size, width: size.width, height: size.height });
    });
    if (result?.ok) {
      if (picture) setSentNow(true);
      setDone(picture ? `The new ${what} was sent for review. It runs again once it is approved.` : "The main picture is replaced. Check the shapes below, then send the new version for review.");
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

  return (
    <div className={`hold-note ${blocked ? "is-blocked" : "is-change"}`}>
      <b>{blocked ? `DeusADS blocked ${picture ? `the ${what}` : "this creative"}: it breaks a platform rule` : sent ? `The new ${picture ? what : "version"} is in review` : `DeusADS asks you to change ${picture ? `the ${what}` : "this creative"}`}</b>
      <dl>
        {picture && <div><dt>Picture</dt><dd>This creative in the {hold.shapeLabel} shape. Its other shapes keep running.</dd></div>}
        {hold.rule && <div><dt>{blocked ? "Rule broken" : "Rule"}</dt><dd>{hold.rule}</dd></div>}
        <div><dt>{blocked ? "What it means" : sent ? "Now" : "Until then"}</dt><dd>{blocked
          ? `${picture ? `The ${what} is` : "It is"} not shown anywhere. ${picture ? "Placements of that shape show nothing of this creative" : "Campaigns keep running with their other creatives"}, and nothing is charged for what is not shown. If you think the decision is a mistake, write to DeusADS here.`
          : sent ? `DeusADS is checking the new ${picture ? "picture" : "version"}. Once it is approved it runs again in the same games.`
            : `${picture ? `The ${what} is` : "It is"} not shown in any game. ${picture ? "Placements of that shape show nothing of this creative until then" : "Campaigns keep running with their other creatives"}, and nothing is charged for what is not shown.`}</dd></div>
        {hold.at && <div><dt>{blocked ? "Decided" : "Why now"}</dt><dd>{blocked ? `${fdt(hold.at)}, after a report from a game where it ran.` : `A game where it runs reported it, and DeusADS checked it. ${fdt(hold.at)}.`}</dd></div>}
      </dl>
      {hold.note && <div className="hold-msg"><span className="hold-msg-h"><b>Message from DeusADS</b>{hold.at && <small>{fdt(hold.at)}</small>}</span><p>{hold.note}</p></div>}
      {thread.map((message, index) => (
        <div key={index} className={`hold-msg${message.side === "advertiser" ? " is-mine" : ""}`}><span className="hold-msg-h"><b>{message.side === "advertiser" ? "You" : "DeusADS"}</b><small suppressHydrationWarning>{fdtTime(message.at)} UTC</small></span><p>{message.text}</p></div>
      ))}
      {last && <p className={`hold-state${last === "admin" ? " is-new" : ""}`} role="status">{last === "advertiser" ? "Waiting for DeusADS: the review team has your message and will answer here." : "DeusADS replied. You can answer here."}</p>}
      {writing && (
        <div className="hold-reply">
          <label htmlFor={`hold-reply-${creativeId}`}>Your message to DeusADS <small>a question, or why you think the decision is wrong</small></label>
          <textarea id={`hold-reply-${creativeId}`} className="field" rows={3} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} />
        </div>
      )}
      {problem && <p className="error" role="alert">{problem}</p>}
      {done && <p className="upload-done" role="status">{done}</p>}
      <div className="hold-acts">
        {!blocked && !sent && (picture ? (
          <>
            <input ref={file} type="file" accept="image/png,image/jpeg" hidden onChange={(e) => { const picked = e.target.files?.[0]; e.target.value = ""; replace(picked); }} />
            <button type="button" className="button button-small" disabled={Boolean(busy)} onClick={() => file.current?.click()}>{busy === "picture" ? <Busy>Uploading…</Busy> : `Upload a new ${what}`}</button>
          </>
        ) : onPage ? (
          <>
            <input ref={file} type="file" accept="image/png,image/jpeg" hidden onChange={(e) => { const picked = e.target.files?.[0]; e.target.value = ""; replace(picked); }} />
            <button type="button" className="button button-small" disabled={Boolean(busy)} onClick={() => file.current?.click()}>{busy === "picture" ? <Busy>Uploading…</Busy> : "Replace the main picture"}</button>
            <button type="button" className="button button-quiet button-small" disabled={Boolean(busy) || !hold.changed} title={hold.changed ? undefined : "Replace the main picture or a shape’s picture first"} onClick={send}>{busy === "send" ? <Busy>Sending…</Busy> : "Send for review"}</button>
          </>
        ) : <Link href={`/dashboard/creatives/${creativeId}`} className="button button-small">Upload a new version</Link>)}
        {writing
          ? <><button type="button" className="button button-small" disabled={Boolean(busy) || !text.trim()} onClick={reply}>{busy === "reply" ? <Busy>Sending…</Busy> : "Send reply"}</button><button type="button" className="button button-quiet button-small" disabled={Boolean(busy)} onClick={() => setWriting(false)}>Cancel</button></>
          : <button type="button" className="button button-quiet button-small" onClick={() => setWriting(true)}>{thread.length ? "Write again" : "Reply to DeusADS"}</button>}
        <Link href={rulesLink("adv")} className="link-button">Platform rules</Link>
      </div>
      {picture && !blocked && !sent && <p className="hold-hint">Upload a PNG or JPG made for the {hold.shapeLabel} shape. It goes to review at once, and replaces the reported picture when it is approved.</p>}
      {!picture && onPage && !blocked && !sent && <p className="hold-hint">Replace the main picture here, or a single shape’s picture below. Then send the new version for review.</p>}
    </div>
  );
}
