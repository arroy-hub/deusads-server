"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBooking } from "../actions";

/** Creative + campaign + a checklist of placements grouped by game. */
export default function BookingForm({ creatives, campaigns, games }) {
  const router = useRouter();
  const usable = creatives.filter((item) => item.approved);

  const [creativeId, setCreativeId] = useState(usable[0]?.id ?? "");
  const [campaignId, setCampaignId] = useState(""); // "" = a new campaign
  const [campaignName, setCampaignName] = useState("");
  const [picked, setPicked] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const toggle = (id) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const result = await createBooking({
      campaignId: campaignId || undefined,
      campaignName,
      creativeId,
      placementIds: [...picked],
    }).catch(() => ({ error: "Connection lost. Try again." }));
    setBusy(false);
    if (result?.error) return setError(result.error);
    router.push("/dashboard/advertising");
    router.refresh();
  }

  if (usable.length === 0) {
    return (
      <div className="empty">
        <p style={{ margin: "0 auto" }}>
          You have no approved creatives yet.{" "}
          {creatives.some((item) => item.status === "pending")
            ? "Yours are waiting for review."
            : "Upload one under Library → Creatives."}
        </p>
      </div>
    );
  }

  return (
    <form className="panel stack" onSubmit={submit}>
      <label htmlFor="creative">Creative</label>
      <select id="creative" className="field" value={creativeId} onChange={(event) => setCreativeId(event.target.value)} disabled={busy}>
        {usable.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
            {item.size ? ` (${item.size})` : ""}
          </option>
        ))}
      </select>

      <label htmlFor="campaign">Campaign</label>
      <div className="row">
        <select id="campaign" className="field" value={campaignId} onChange={(event) => setCampaignId(event.target.value)} disabled={busy}>
          <option value="">New campaign…</option>
          {campaigns.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        {!campaignId && (
          <input
            className="field"
            value={campaignName}
            onChange={(event) => setCampaignName(event.target.value)}
            placeholder="Campaign name"
            aria-label="Campaign name"
            maxLength={120}
            disabled={busy}
          />
        )}
      </div>

      <div className="settings-title">Placements</div>
      {games.length === 0 ? (
        <p className="settings-help">No placements are available yet.</p>
      ) : (
        games.map((game) => (
          <fieldset key={game.name} className="pick-group">
            <legend>{game.name}</legend>
            {game.placements.map((placement) => (
              <label key={placement.id} className={`pick-item ${placement.booked ? "is-booked" : ""}`}>
                <input
                  type="checkbox"
                  checked={picked.has(placement.id)}
                  onChange={() => toggle(placement.id)}
                  disabled={busy || placement.booked}
                />
                <span>
                  {placement.label}
                  <span className="muted-line">
                    {[
                      placement.scene && `scene ${placement.scene}`,
                      placement.aspect && `${placement.aspect.toFixed(2)}:1`,
                      placement.booked && "already booked",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
        ))
      )}

      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <div className="row">
        <button className="button" type="submit" disabled={busy || picked.size === 0 || (!campaignId && !campaignName.trim())}>
          {busy ? "Sending…" : `Request ${picked.size || ""} ${picked.size === 1 ? "placement" : "placements"}`.replace("  ", " ")}
        </button>
      </div>
    </form>
  );
}
