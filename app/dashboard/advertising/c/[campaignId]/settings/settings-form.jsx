"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteCampaign, renameCampaign, setCampaignDates } from "../../../actions";
import { TONE, addD, diff, fmtDay, todayISO } from "../../../../_cabinet/dates";
import { DateRange, PauseDialog } from "../../../../_cabinet/ui";
import { IcPause } from "../../../../_cabinet/icons";

/**
 * General settings of a campaign: the name and a schedule you can read at a glance (the bar, the two days, quick
 * extend), one Save for both; then Pause or stop, and the danger zone (delete).
 */
export default function SettingsForm({ id, name, starts, ends, status, hasOpen, closedBookings, rules = true }) {
  const router = useRouter();
  const today = todayISO();
  const [title, setTitle] = useState(name);
  const [from, setFrom] = useState(starts);
  const [until, setUntil] = useState(ends);
  const [asking, setAsking] = useState(false);
  const [pausing, setPausing] = useState(false);
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
    router.push("/dashboard/advertising");
  }

  return (
    <>
      <section className="cs-card" aria-label="General">
        <label className="cs-label">Campaign name<input className="field cs-name" value={title} maxLength={120} disabled={busy} onChange={(e) => setTitle(e.target.value)} /><span className="settings-help">Only you see this name.</span></label>
      </section>
      <section className="cs-card rd-sched" aria-label="Schedule">
        <div className="rd-sched-head"><h2>Schedule</h2>{length && <span className="rd-sched-len">{length} days</span>}{!until && from && <span className="rd-sched-len">runs until you stop it</span>}</div>
        <DateRange start={from} end={until || null} tone={tone} size="lg" paused={status.key === "paused"} animated={running} />
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
        ) : <p className="settings-help">Dates are set when you add placements.</p>}
        <p className="settings-help">Days are UTC. Leave the end empty to run until you stop the campaign.</p>
        {note.text && !changed && <span className={note.tone === "error" ? "error" : "upload-done"} role="status">{note.text}</span>}
      </section>
      {changed && (
        <div className="cs-bar" role="region" aria-label="Unsaved changes">
          <strong>Unsaved changes</strong>
          {note.text && note.tone === "error" && <span className="cs-bar-error" role="alert">{note.text}</span>}
          <span className="cs-bar-actions"><button type="button" className="cs-bar-discard" disabled={busy} onClick={() => { setTitle(name); setFrom(starts); setUntil(ends); setNote({ tone: "", text: "" }); }}>Discard</button><button type="button" className="cs-bar-save" disabled={busy || !title.trim() || bad} onClick={save}>{busy ? "Saving…" : "Save"}</button></span>
        </div>
      )}
      {hasOpen && rules && (
        <section className="cs-card cs-rows" aria-label="Running">
          <div className="cs-row"><div><h2>Pause or stop</h2><p>Hold the ads for a day, a week or until a date, or end the campaign for good. Players see the change at their next launch.</p></div><button type="button" className="button button-quiet" onClick={() => setPausing(true)}><IcPause size={15} /> Pause or stop…</button></div>
        </section>
      )}
      <section className="cs-card cs-danger" aria-labelledby="del-title">
        <h2 id="del-title">Delete the campaign</h2>
        <p className="settings-help">Possible only when nothing in it is running: stop it first. {closedBookings > 0 ? `The ${closedBookings} closed ${closedBookings === 1 ? "booking" : "bookings"} and their figures leave your reports.` : ""}</p>
        {asking ? <div className="confirm-inline"><span className="confirm-text">Delete “{name}”? This cannot be undone.</span><button type="button" className="button button-danger" disabled={busy} onClick={remove}>{busy ? "Deleting…" : "Delete campaign"}</button><button type="button" className="button button-quiet" disabled={busy} onClick={() => setAsking(false)}>Keep</button></div> : <div><button type="button" className="button button-quiet" onClick={() => setAsking(true)}>Delete campaign</button></div>}
      </section>
      {pausing && <PauseDialog name={name} campaignId={id} initial="pause" status={status.key} onClose={() => setPausing(false)} />}
    </>
  );
}
