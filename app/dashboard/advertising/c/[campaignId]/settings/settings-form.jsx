"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteCampaign, renameCampaign, setCampaignDates } from "../../../actions";
import { TONE, addD, diff, fmtDay, todayISO } from "../../../../_cabinet/dates";
import { DateRange, PauseDialog, Pop } from "../../../../_cabinet/ui";
import { IcPause, IcStop } from "../../../../_cabinet/icons";
import { navigating } from "../../../../_cabinet/nav";
import { Info } from "../../../../metrics-deck";
import CampaignCard from "./campaign-card";

/**
 * General settings of a campaign: the name and a schedule you can read at a glance (the bar, the two days, quick
 * extend), one Save for both; then Pause or stop, and the danger zone (delete).
 */
export default function SettingsForm({ id, name, starts, ends, status, hasOpen, closedBookings, rules = true, card, coverCss, audience = null, duplicate = null }) {
  const router = useRouter();
  const today = todayISO();
  const [title, setTitle] = useState(name);
  const [from, setFrom] = useState(starts);
  const [until, setUntil] = useState(ends);
  const [asking, setAsking] = useState(false);
  const [pausing, setPausing] = useState(null); // null | "pause" | "stop"
  const delBtn = useRef(null);
  const [why, setWhy] = useState(false); // the bubble that says a running campaign has to be stopped first
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState({ tone: "", text: "" });

  const changed = title.trim() !== name || from !== starts || until !== ends;
  const tone = TONE[status.key] ?? "#8c7f73";
  const bad = from && until && diff(until, from) < 0;
  const length = from && until && !bad ? diff(until, from) + 1 : null;
  const quick = (n) => setUntil(addD(until || (from > today ? from : today), n));
  const endsIn = (n) => setUntil(addD(today, n));
  const running = !["paused", "stopped", "ended"].includes(status.key);

  async function save() {
    setBusy(true);
    setNote({ tone: "", text: "" });
    if (title.trim() !== name) {
      const renamed = await renameCampaign({ campaignId: id, name: title }).catch(() => ({ error: "Connection lost. Try again." }));
      if (renamed?.error) {
        setBusy(false);
        return setNote({ tone: "error", text: renamed.error });
      }
    }
    if ((from !== starts || until !== ends) && hasOpen) {
      const dated = await setCampaignDates({ campaignId: id, startsOn: from, endsOn: until }).catch(() => ({ error: "Connection lost. Try again." }));
      if (dated?.error) {
        setBusy(false);
        return setNote({ tone: "error", text: dated.error });
      }
    }
    setBusy(false);
    setNote({ tone: "ok", text: "Saved." });
    router.refresh();
  }

  async function remove() {
    setBusy(true);
    const result = await deleteCampaign({ campaignId: id }).catch(() => ({ error: "Connection lost. Try again." }));
    setBusy(false);
    if (result?.error) return setNote({ tone: "error", text: result.error });
    navigating();
    router.push("/dashboard/advertising");
  }

  return (
    <div className="cs-wide">
      <section className="st-card st-prop ag-embed" aria-labelledby="camp-card-title">
        <div className="st-prop-head">
          <div>
            <h2 id="camp-card-title">Your campaign</h2>
            <p>The card is how the campaign looks in your list of campaigns. Change anything here and the card follows. Only you see it.</p>
          </div>
          <span className="st-status is-ready"><span className="st-status-dot" aria-hidden="true" />{status.label}</span>
        </div>
        <div className="ag-grid">
          <div className="ag-left">
            <div className="ag-cap">Preview</div>
            <CampaignCard name={title} from={from} until={until} status={status} coverCss={coverCss} chips={card.chips} category={card.category} creatives={card.creatives} games={card.games} placements={card.placements} />
          </div>
          <div className="ag-right">
            <section className="ag-sec">
              <h3>About the campaign</h3>
              <div className="ag-f"><label>Campaign name<i className="req" title="Required" /></label><input className="field" value={title} maxLength={120} disabled={busy} onChange={(e) => setTitle(e.target.value)} /><span className="settings-help">Only you see this name.</span></div>
            </section>
            <section className="ag-sec rd-sched">
              <h3>Schedule {length && <span className="rd-sched-len" style={{ marginLeft: 8 }}>{length} days</span>}{!until && from && <span className="rd-sched-len" style={{ marginLeft: 8 }}>runs until you stop it</span>}</h3>
              {hasOpen ? (
                <>
                  <div className="rd-sched-inputs">
                    <label className="rd-datef"><span>Starts</span><input className="field" type="date" value={from} disabled={busy} onChange={(e) => setFrom(e.target.value)} /><small>{from ? fmtDay(from, true) : "Not set"}</small></label>
                    <span className="rd-datef-arrow" aria-hidden="true">→</span>
                    <label className={`rd-datef${!until ? " is-off" : ""}`}><span>Ends (last day shown)</span><input className="field" type="date" value={until} min={from || undefined} disabled={busy} onChange={(e) => setUntil(e.target.value)} /><small>{until ? fmtDay(until, true) : "No end date"}</small></label>
                    <label className="rd-noend"><input type="checkbox" checked={!until} disabled={busy} onChange={(e) => setUntil(e.target.checked ? "" : addD(from || today, 30))} />No end date</label>
                  </div>
                  {bad && <p className="error" role="alert">The end date is before the start date.</p>}
                  <div className="cs-extend rd-quick"><span className="ovx-muted">Extend by</span>{[7, 14, 30].map((d) => <button key={d} type="button" className="cs-pill-button" disabled={busy || !until} onClick={() => quick(d)}>+{d} days</button>)}<span className="rd-quick-sep" /><span className="ovx-muted">End in</span>{[7, 30].map((d) => <button key={d} type="button" className="cs-pill-button" disabled={busy} onClick={() => endsIn(d)}>{d === 7 ? "1 week" : "1 month"}</button>)}</div>
                </>
              ) : <p className="settings-help">{["stopped", "ended"].includes(status.key) ? "This campaign has ended. Duplicate it to run again." : "Dates are set when you add placements."}</p>}
            </section>
            <p className="settings-help cc-utc"><Info title="Dates are UTC" text="A day runs from 00:00 to 24:00 UTC. The first and the last day of the campaign are counted that way, which may differ from your local day." />Dates are UTC.</p>
            {note.text && !changed && <span className={note.tone === "error" ? "error" : "upload-done"} role="status">{note.text}</span>}
          </div>
        </div>
      </section>
      {changed && (
        <div className="cs-bar" role="region" aria-label="Unsaved changes">
          <strong>Unsaved changes</strong>
          {note.text && note.tone === "error" && <span className="cs-bar-error" role="alert">{note.text}</span>}
          <span className="cs-bar-actions"><button type="button" className="cs-bar-discard" disabled={busy} onClick={() => { setTitle(name); setFrom(starts); setUntil(ends); setNote({ tone: "", text: "" }); }}>Discard</button><button type="button" className="cs-bar-save" disabled={busy || !title.trim() || bad} onClick={save}>{busy ? "Saving…" : "Save"}</button></span>
        </div>
      )}
      {audience}
      {hasOpen && rules && (
        <section className="cs-card cs-rows" aria-label="Pause or stop">
          <div className="cs-row"><div><h2>Pause or stop</h2><p>Hold the ads for a day, a week or until a date, or end the campaign for good. Players see the change at their next launch.</p></div><button type="button" className="button button-quiet" onClick={() => setPausing("pause")}><IcPause size={15} /> {status.key === "paused" ? "Resume or stop…" : "Pause or stop…"}</button></div>
        </section>
      )}
      {duplicate}
      <section className="cs-card cs-rows cs-danger" aria-labelledby="del-title">
        <div className="cs-row">
          <div>
            <h2 id="del-title">Delete the campaign</h2>
            <p>A running campaign has to be stopped before it can be deleted. {closedBookings > 0 ? `The ${closedBookings} closed ${closedBookings === 1 ? "booking" : "bookings"} and their figures leave your reports.` : ""}</p>
            {asking && <p className="settings-help" role="status" style={{ marginTop: 8 }}>Delete “{name}”? This cannot be undone.</p>}
          </div>
          {asking ? (
            <span className="cs-row-confirm"><button type="button" className="button button-danger" disabled={busy} onClick={remove}>{busy ? "Deleting…" : "Delete campaign"}</button><button type="button" className="button button-quiet" disabled={busy} onClick={() => setAsking(false)}>Keep</button></span>
          ) : (
            <span>
              <button ref={delBtn} type="button" className={`button button-quiet${hasOpen ? " is-blocked" : ""}`} aria-haspopup={hasOpen ? "dialog" : undefined} aria-expanded={hasOpen ? why : undefined} onClick={() => (hasOpen ? setWhy((v) => !v) : setAsking(true))}>Delete campaign</button>
              <Pop anchor={delBtn} open={why} onClose={() => setWhy(false)} align="end" width={320} label="Why the campaign cannot be deleted yet">
                <div className="rd-bubble" role="status">
                  <span className="rd-bubble-ic"><IcStop size={16} /></span>
                  <div>
                    <strong>Stop the campaign first</strong>
                    <p>“{name}” is still running, so it cannot be deleted. Stop it, then delete it.</p>
                    {rules && <button type="button" className="button button-small button-danger" onClick={() => { setWhy(false); setPausing("stop"); }}>Stop the campaign…</button>}
                  </div>
                </div>
              </Pop>
            </span>
          )}
        </div>
      </section>
      {pausing && <PauseDialog name={name} campaignId={id} initial={pausing} status={status.key} onClose={() => setPausing(null)} />}
    </div>
  );
}
