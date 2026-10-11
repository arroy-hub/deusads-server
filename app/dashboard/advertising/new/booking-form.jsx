"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createBooking } from "../actions";
import MultiPick from "../../multi-pick";
import { formatLabel, formatOf, pickImage } from "../../../../lib/formats";
import { FIELDS, PROFILE_KEYS, countFitting, evaluate, hasTargeting, targetingSummary, whyNot } from "../../../../lib/targeting";

/**
 * Creative + campaign + a checklist of placements grouped by game.
 * `aimable`: the database knows what each game is (migration 0018), so the list can say which games
 * fit the creative's audience and can be filtered. A booking is accepted for any game: the audience
 * only decides where the ad appears.
 */
export default function BookingForm({ creatives, campaigns, games, aimable = false }) {
  const router = useRouter();
  // Creatives still in review can be booked: the booking starts when the creative is approved.
  const usable = creatives.filter((item) => item.status !== "rejected");

  const [creativeId, setCreativeId] = useState(usable[0]?.id ?? "");
  const [campaignId, setCampaignId] = useState(""); // "" = a new campaign
  const [campaignName, setCampaignName] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [picked, setPicked] = useState(() => new Set());
  const [filters, setFilters] = useState({ genres: [], platforms: [], languages: [] });
  const [fitOnly, setFitOnly] = useState(false);
  const chosen = usable.find((item) => item.id === creativeId);
  const today = new Date().toISOString().slice(0, 10);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Which games the chosen creative's audience allows, and which the filters leave in the list.
  const targeting = chosen?.targeting ?? null;
  const aimed = aimable && hasTargeting(targeting);
  const filtering = aimable && PROFILE_KEYS.some((key) => filters[key].length > 0);
  const fitOf = (game) => evaluate(game.profile, targeting);
  const fitting = aimed ? countFitting(games.map((game) => game.profile), targeting) : games.length;
  const shownGames = games.filter((game) => {
    if (aimed && fitOnly && !fitOf(game).fits) return false;
    if (filtering && !evaluate(game.profile, filters).fits) return false;
    return true;
  });
  // A placement hidden by a filter is not booked, even if it was ticked before.
  const visibleIds = new Set(shownGames.flatMap((game) => game.placements.map((placement) => placement.id)));
  const chosenIds = [...picked].filter((id) => visibleIds.has(id));

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
      placementIds: chosenIds,
      startsOn,
      endsOn,
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
          You have no usable creatives yet. Upload one under Creatives.
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
            {item.status === "pending" ? " — in review" : ""}
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

      <div className="settings-title">Dates (optional)</div>
      <div className="row">
        <label htmlFor="starts-on">From</label>
        <input id="starts-on" className="field" type="date" min={today} value={startsOn} onChange={(event) => setStartsOn(event.target.value)} disabled={busy} />
        <label htmlFor="ends-on">Until (last day shown)</label>
        <input id="ends-on" className="field" type="date" min={startsOn || today} value={endsOn} onChange={(event) => setEndsOn(event.target.value)} disabled={busy} />
      </div>
      <p className="settings-help">
        Leave empty to start right away and run until you stop it. Days are UTC. If the creative is still in review, the ads start when it is approved.
      </p>

      <div className="settings-title">Placements</div>
      {aimable && games.length > 0 && chosen && (
        <div className="audience-box">
          {aimed ? (
            <>
              <p className="audience-line">
                This creative's audience: {targetingSummary(targeting)}.{" "}
                <span className="muted-line">
                  {fitting} of {games.length} {games.length === 1 ? "game" : "games"} in the catalog fit{fitting === 1 ? "s" : ""}.
                </span>{" "}
                <Link href={`/dashboard/creatives/${chosen.id}`}>Change the audience</Link>
              </p>
              {fitting === 0 && (
                <p className="notice">
                  No game fits this audience yet. You can still book: the booking is accepted and the creative
                  starts showing as soon as a matching game opens a placement.
                </p>
              )}
              <label className="pick-item">
                <input type="checkbox" checked={fitOnly} onChange={(event) => setFitOnly(event.target.checked)} disabled={busy} />
                <span>Show only games that fit</span>
              </label>
            </>
          ) : (
            <p className="settings-help">
              No audience set: this creative can show in every game.{" "}
              <Link href={`/dashboard/creatives/${chosen.id}`}>Aim it at certain games</Link>
            </p>
          )}
          <details className="filter-box" open={filtering || undefined}>
            <summary>Filter the games{filtering ? " (on)" : ""}</summary>
            <div className="stack">
              {PROFILE_KEYS.map((key) => (
                <MultiPick
                  key={key}
                  label={FIELDS[key].label}
                  options={FIELDS[key].options}
                  value={filters[key]}
                  onChange={(next) => setFilters({ ...filters, [key]: next })}
                  searchable={key === "languages"}
                  disabled={busy}
                />
              ))}
              {filtering && (
                <div className="row">
                  <button type="button" className="button button-quiet" onClick={() => setFilters({ genres: [], platforms: [], languages: [] })}>
                    Clear filters
                  </button>
                  <span className="muted-line">Games that have not filled in a list you filter by are hidden.</span>
                </div>
              )}
            </div>
          </details>
        </div>
      )}
      {games.length === 0 ? (
        <p className="settings-help">No placements are available yet.</p>
      ) : shownGames.length === 0 ? (
        <p className="settings-help">No game matches. Change or clear the filters.</p>
      ) : (
        shownGames.map((game) => (
          <fieldset key={game.id ?? game.name} className="pick-group">
            <legend>
              {game.name}
              {aimed && (
                <span className={`fit-badge ${fitOf(game).fits ? "is-fit" : "is-miss"}`}>
                  {fitOf(game).fits ? "fits the audience" : `won't show here: ${whyNot(fitOf(game).problems)}`}
                </span>
              )}
            </legend>
            {game.placements.map((placement) => (
              <label key={placement.id} className="pick-item">
                <input
                  type="checkbox"
                  checked={picked.has(placement.id)}
                  onChange={() => toggle(placement.id)}
                  disabled={busy}
                />
                <span
                  className="pick-shape"
                  aria-hidden="true"
                  style={{ aspectRatio: placement.aspect ? String(Math.min(4, Math.max(0.5, placement.aspect))) : "16 / 9" }}
                />
                <span>
                  {placement.label}
                  <span className="muted-line">
                    {[
                      placement.scene && `scene ${placement.scene}`,
                      placement.aspect && `${placement.aspect.toFixed(2)}:1`,
                      placement.aspect && formatLabel(formatOf(placement.aspect)),
                      chosen && coverageNote(chosen, placement.aspect),
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
        <button className="button" type="submit" disabled={busy || chosenIds.length === 0 || (!campaignId && !campaignName.trim())}>
          {busy ? "Booking…" : `Book ${chosenIds.length || ""} ${chosenIds.length === 1 ? "placement" : "placements"}`.replace("  ", " ")}
        </button>
      </div>
    </form>
  );
}

/** How the chosen creative would appear on a placement of this shape. */
function coverageNote(creative, aspect) {
  if (!aspect) return null;
  const pick = pickImage({
    creative: {
      aspect: creative.width && creative.height ? creative.width / creative.height : null,
      safeZone: creative.safe,
    },
    assets: creative.assets ?? [],
    surfaceAspect: aspect,
  });
  if (pick.kind === "asset") return "your image for this format";
  if (pick.kind === "crop") return "your image, auto-cropped";
  return "won't be shown here: add an image for this format";
}
