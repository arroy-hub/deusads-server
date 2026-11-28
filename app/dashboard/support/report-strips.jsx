"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Modal from "../modal";
import { COVER, dayOf, stampOf } from "./support-ui";
import { changeAds } from "../g/[gameId]/campaign-actions";
import { pictureId } from "../../../lib/game-pictures";
import { NEUTRAL_BLOCK_REASON, PENDING_BLOCK_REASON, STEP_TEXT } from "../../../lib/report-rules";
import { rulesLink } from "../../../lib/platform-rules";
import { refreshPage } from "../wait";

const TONE = { open: "warn", changes: "warn", uploaded: "warn", declined: "warn", replaced: "live", removed: "stop", paused: "stop", dismissed: "sched" };
/** How far a report is: a report that waits for somebody is not at its end yet. */
const PROGRESS = { open: 34, changes: 60, declined: 60, uploaded: 80 };
const FlagIcon = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 21V4m0 0h11l-2 4 2 4H5" /></svg>
);

/**
 * The developer's reports on creatives, under My requests: one strip per report with its status, and a window with the
 * whole story: what was sent, what DeusADS decided and wrote, and the choice that stays the developer's (to block the
 * picture in the game or not).
 */
export default function ReportStrips({ reports, initialOpen = null }) {
  const router = useRouter();
  const [list, setList] = useState(reports);
  const [openId, setOpenId] = useState(initialOpen);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  useEffect(() => setList(reports), [reports]);
  if (!list.length) return null;
  const r = list.find((x) => x.id === openId) ?? null;
  const gone = r && (r.status === "removed" || (r.status === "changes" && r.stage !== "replaced")); // nothing of it is shown anywhere: there is nothing to block

  async function block(on) {
    setBusy(true);
    setProblem("");
    const whole = !r.shape || (r.blockedWhole && !on);
    const result = await changeAds({ gameId: r.gameId, scope: whole ? "creative" : "picture", action: on ? "block" : "unblock", ids: [whole ? r.creativeId : pictureId(r.creativeId, r.shape)], reason: on ? (r.status === "open" ? PENDING_BLOCK_REASON : NEUTRAL_BLOCK_REASON) : "", comment: "" }).catch(() => ({ error: "Connection lost. Try again." }));
    setBusy(false);
    if (result?.error) return setProblem(result.error);
    setList((items) => items.map((x) => (x.gameId === r.gameId && x.creativeId === r.creativeId && (whole || x.shape === r.shape) ? { ...x, blocked: on, blockedWhole: on ? x.blockedWhole : false } : x)));
    refreshPage(router);
  }

  return (
    <section className="sp-reports" aria-label="Reports on creatives">
      <h2 className="sp-reports-h">Reports on creatives <span>{list.length}</span></h2>
      <div className="cx-strips sp-strips">
        {list.map((x) => (
          <article key={x.id} className="cx-strip sp-strip sp-rstrip" style={{ "--tone": `var(--cx-${TONE[x.stage ?? x.status] ?? "sched"})` }} tabIndex={0} role="button" aria-label={`Report on ${x.picture}: ${x.label}`}
            onClick={() => setOpenId(x.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpenId(x.id); } }}>
            <div className="cx-scover"><div className="cx-pic" style={{ background: COVER }} /></div>
            <div className="cx-splate">
              <span className="cx-ic">{x.url ? <span className="rd-tile sp-rpic" style={{ backgroundImage: `url(${x.url})` }} /> : <span className="rd-tile"><FlagIcon /></span>}</span>
              <div className="cx-txt">
                <h3>{x.picture}</h3>
                <div className="cx-sub"><b>{x.label}</b> · Report · {x.game}</div>
              </div>
              <div className="cx-dates">
                <div className={`cx-dr${PROGRESS[x.stage ?? x.status] ? " is-running" : ""}`}>
                  <div className="cx-dl"><b>Sent {dayOf(x.sentAt)}</b><span>{x.status === "open" ? "DeusADS is reviewing it" : x.steps?.length > 1 ? `Updated ${dayOf(x.steps[x.steps.length - 1].at ?? x.decidedAt ?? x.sentAt)}` : `Decided ${dayOf(x.decidedAt ?? x.sentAt)}`}</span></div>
                  <div className="cx-dr-track"><i className="cx-dr-fill" style={{ width: `${PROGRESS[x.stage ?? x.status] ?? 100}%` }} /></div>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>

      <Modal open={Boolean(r)} onClose={() => { setOpenId(null); setProblem(""); }} title="Your report" lightClose footer={<button type="button" className="button" onClick={() => setOpenId(null)}>Close</button>}>
        {r && (() => {
          // what happened after the report was sent; a dismissal from before the steps were kept has none
          const later = r.steps?.length ? r.steps : [];
          return (
          <div className="sp-report">
            <p className="sp-report-what"><b>{r.picture}</b>{r.campaign ? ` · ${r.campaign}` : ""} · in <Link href={`/dashboard/g/${r.gameId}?tab=campaigns`}>{r.game}</Link></p>
            <ol className="sp-report-steps">
              <li>
                <b>You reported it · {r.reason}</b>
                <small suppressHydrationWarning>{stampOf(r.sentAt)}</small>
                {r.comment && <p>{r.comment}</p>}
              </li>
              {r.status === "open" ? (
                <li className="is-now"><b>In review</b><p>{r.text}</p></li>
              ) : later.length === 0 ? (
                <li className="is-now">
                  <b>DeusADS decided · {r.label}</b>
                  <small suppressHydrationWarning>{stampOf(r.decidedAt ?? r.sentAt)}</small>
                  <p>{r.text}</p>
                  {r.note && <div className="sp-report-msg"><b>Message from DeusADS</b><p>{r.note}</p></div>}
                </li>
              ) : later.map((step, index) => {
                const [title, text] = STEP_TEXT[step.key];
                const now = index === later.length - 1;
                return (
                  <li key={index} className={now ? "is-now" : undefined}>
                    <b>{title}</b>
                    <small suppressHydrationWarning>{stampOf(step.at ?? r.decidedAt ?? r.sentAt)}</small>
                    <p>{now ? r.text : text}</p>
                    {index === 0 && r.note && <div className="sp-report-msg"><b>Message from DeusADS</b><p>{r.note}</p></div>}
                    {step.key === "replaced" && now && r.newUrl && (
                      <div className="sp-report-pics">
                        <figure><span style={{ backgroundImage: `url(${r.reportedUrl})` }} /><figcaption>Reported</figcaption></figure>
                        <figure><span style={{ backgroundImage: `url(${r.newUrl})` }} /><figcaption>New, approved</figcaption></figure>
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
            {!gone && (
              <div className="sp-report-block">
                <span>{r.blocked ? (r.stage === "replaced" ? "It is still blocked in your game: the block you set stays until you lift it." : "It is blocked in your game.") : r.status === "open" ? "It keeps showing in your game while DeusADS reviews it." : "Whether it shows in your game is up to you."}</span>
                <button type="button" className="button button-quiet button-small" disabled={busy} onClick={() => block(!r.blocked)}>{r.blocked ? "Unblock" : "Block in my game"}</button>
              </div>
            )}
            {problem && <p className="error" role="alert">{problem}</p>}
            <p className="sp-report-hint">{r.status === "open" || gone ? "" : r.again ? "The picture changed since the decision: you can report it again from the game’s Campaigns tab. " : "The decision is final for this picture. You can report it again if the advertiser changes it. "}A report is checked against the <Link href={rulesLink("adv")}>platform rules</Link>.</p>
          </div>
          );
        })()}
      </Modal>
    </section>
  );
}
