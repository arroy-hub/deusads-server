"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteCampaign, renameCampaign, setCampaignDates } from "../../../actions";

const addDays = (date, days) => {
  const base = date ? new Date(`${date}T00:00:00Z`) : new Date();
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
};

/** General settings of a campaign (name, dates, quick extend) and the danger zone (delete). One Save for the name and dates. */
export default function SettingsForm({ id, name, starts, ends, hasOpen, closedBookings }) {
  const router = useRouter();
  const [title, setTitle] = useState(name);
  const [from, setFrom] = useState(starts);
  const [until, setUntil] = useState(ends);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState({ tone: "", text: "" });
  const [asking, setAsking] = useState(false);

  const changed = title.trim() !== name || from !== starts || until !== ends;

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

  const left = until ? Math.round((Date.parse(`${until}T00:00:00Z`) - Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`)) / 86_400_000) : null;

  return (
    <>
      <section className="panel stack" aria-labelledby="gen-title">
        <h2 id="gen-title">General</h2>
        <label>
          Campaign name
          <input className="field" value={title} maxLength={120} disabled={busy} onChange={(event) => setTitle(event.target.value)} />
          <span className="settings-help">Only you see this name.</span>
        </label>
        <div className="row">
          <label>
            From
            <input className="field" type="date" value={from} disabled={busy || !hasOpen} onChange={(event) => setFrom(event.target.value)} />
          </label>
          <label>
            Until (last day shown)
            <input className="field" type="date" value={until} disabled={busy || !hasOpen} onChange={(event) => setUntil(event.target.value)} />
          </label>
        </div>
        {hasOpen ? (
          <div className="row">
            {left != null && left >= 0 && left <= 3 && <span className="ov-pill ov-scheduled">{left === 0 ? "Ends today" : `Ends in ${left} ${left === 1 ? "day" : "days"}`}</span>}
            <span className="settings-help">Extend by</span>
            {[7, 14, 30].map((days) => (
              <button key={days} type="button" className="button button-quiet button-small" disabled={busy || !until} onClick={() => setUntil(addDays(until, days))}>
                {days} days
              </button>
            ))}
          </div>
        ) : (
          <p className="settings-help">Dates are set when you add placements.</p>
        )}
        <p className="settings-help">Days are UTC. Leave a date empty for no start or no end.</p>
        <div className="row">
          <button type="button" className="button" disabled={busy || !changed || !title.trim()} onClick={save}>
            {busy ? "Saving…" : "Save"}
          </button>
          <button type="button" className="button button-quiet" disabled={busy || !changed} onClick={() => { setTitle(name); setFrom(starts); setUntil(ends); setNote({ tone: "", text: "" }); }}>
            Discard
          </button>
          {note.text && (
            <span className={note.tone === "error" ? "error" : "upload-done"} role="status">
              {note.text}
            </span>
          )}
        </div>
      </section>

      <section className="panel stack" aria-labelledby="del-title">
        <h2 id="del-title">Delete the campaign</h2>
        <p className="settings-help">
          Possible only when nothing in it is running: withdraw or stop its open bookings first.{" "}
          {closedBookings > 0 ? `The ${closedBookings} closed ${closedBookings === 1 ? "booking" : "bookings"} and their figures leave your reports.` : ""}
        </p>
        {asking ? (
          <div className="confirm-inline">
            <span className="confirm-text">Delete “{name}”? This cannot be undone.</span>
            <button type="button" className="button button-danger" disabled={busy} onClick={remove}>
              {busy ? "Deleting…" : "Delete campaign"}
            </button>
            <button type="button" className="button button-quiet" disabled={busy} onClick={() => setAsking(false)}>
              Keep
            </button>
          </div>
        ) : (
          <div>
            <button type="button" className="button button-quiet" onClick={() => setAsking(true)}>
              Delete campaign
            </button>
          </div>
        )}
      </section>
    </>
  );
}
