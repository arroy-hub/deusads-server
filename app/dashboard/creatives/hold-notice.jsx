"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { browserClient } from "../../../lib/supabase-browser";
import { rulesLink } from "../../../lib/platform-rules";
import { fdt } from "../../../lib/admin-format";
import { replaceMainPicture, replyToDeusADS, sendNewVersion } from "./actions";
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
 * and what can be done. `hold` is lib/report-rules.js holdOf() plus `replied` and (on the creative's own page) `changed`.
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
  const [replied, setReplied] = useState(Boolean(hold.replied));
  const blocked = hold.kind === "blocked";
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
      return replaceMainPicture({ creativeId, path, type: picked.type, size: picked.size, width: size.width, height: size.height });
    });
    if (result?.ok) {
      setDone("The main picture is replaced. Check the shapes below, then send the new version for review.");
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
    const result = await act("reply", () => replyToDeusADS({ creativeId, text }));
    if (result?.ok) {
      setReplied(true);
      setWriting(false);
      setDone("Your reply was sent to DeusADS.");
    }
  }

  return (
    <div className={`hold-note ${blocked ? "is-blocked" : "is-change"}`}>
      <b>{blocked ? "DeusADS blocked this creative: it breaks a platform rule" : hold.sent ? "The new version is in review" : "DeusADS asks you to change this creative"}</b>
      <dl>
        {hold.rule && <div><dt>{blocked ? "Rule broken" : "Rule"}</dt><dd>{hold.rule}</dd></div>}
        <div><dt>{blocked ? "What it means" : hold.sent ? "Now" : "Until then"}</dt><dd>{blocked
          ? "It is not shown anywhere and cannot be put back. Campaigns keep running with their other creatives, and nothing is charged for what is not shown. You can add a different creative."
          : hold.sent ? "DeusADS is checking the new version. Once it is approved the creative runs again in the same games."
            : "It is not shown in any game. Campaigns keep running with their other creatives, and nothing is charged for what is not shown."}</dd></div>
        {hold.at && <div><dt>{blocked ? "Decided" : "Why now"}</dt><dd>{blocked ? `${fdt(hold.at)}, after a report from a game where it ran.` : `A game where it runs reported it, and DeusADS checked it. ${fdt(hold.at)}.`}</dd></div>}
      </dl>
      {hold.note && <div className="hold-msg"><span className="hold-msg-h"><b>Message from DeusADS</b>{hold.at && <small>{fdt(hold.at)}</small>}</span><p>{hold.note}</p></div>}
      {writing && (
        <div className="hold-reply">
          <label htmlFor={`hold-reply-${creativeId}`}>Your reply to DeusADS <small>one message; the review team reads it</small></label>
          <textarea id={`hold-reply-${creativeId}`} className="field" rows={3} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} />
        </div>
      )}
      {problem && <p className="error" role="alert">{problem}</p>}
      {done && <p className="upload-done" role="status">{done}</p>}
      <div className="hold-acts">
        {!blocked && !hold.sent && (onPage ? (
          <>
            <input ref={file} type="file" accept="image/png,image/jpeg" hidden onChange={(e) => { const picked = e.target.files?.[0]; e.target.value = ""; replace(picked); }} />
            <button type="button" className="button button-small" disabled={Boolean(busy)} onClick={() => file.current?.click()}>{busy === "picture" ? <Busy>Uploading…</Busy> : "Replace the main picture"}</button>
            <button type="button" className="button button-quiet button-small" disabled={Boolean(busy) || !hold.changed} title={hold.changed ? undefined : "Replace the main picture or a shape’s picture first"} onClick={send}>{busy === "send" ? <Busy>Sending…</Busy> : "Send for review"}</button>
          </>
        ) : <Link href={`/dashboard/creatives/${creativeId}`} className="button button-small">Upload a new version</Link>)}
        {writing
          ? <><button type="button" className="button button-small" disabled={Boolean(busy) || !text.trim()} onClick={reply}>{busy === "reply" ? <Busy>Sending…</Busy> : "Send reply"}</button><button type="button" className="button button-quiet button-small" disabled={Boolean(busy)} onClick={() => setWriting(false)}>Cancel</button></>
          : replied ? <span className="hold-replied">You replied to DeusADS</span>
            : <button type="button" className="button button-quiet button-small" onClick={() => setWriting(true)}>Reply to DeusADS</button>}
        <Link href={rulesLink("adv")} className="link-button">Platform rules</Link>
      </div>
      {onPage && !blocked && !hold.sent && <p className="hold-hint">Replace the main picture here, or a single shape’s picture below. Then send the new version for review.</p>}
    </div>
  );
}
