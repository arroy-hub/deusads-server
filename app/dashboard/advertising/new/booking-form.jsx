"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createBooking, saveDraft } from "../actions";
import UploadForm from "../../creatives/upload-form";
import MultiPick from "../../multi-pick";
import { formatLabel, formatOf, pickImage } from "../../../../lib/formats";
import { FIELDS, PROFILE_KEYS, countFitting, evaluate, hasTargeting, targetingSummary, whyNot } from "../../../../lib/targeting";

/**
 * Creative + campaign + a checklist of placements grouped by game.
 * `aimable`: the database knows what each game is (migration 0018), so the list can say which games
 * fit the creative's audience and can be filtered. A booking is accepted for any game: the audience
 * only decides where the ad appears.
 */
export default function BookingForm({ creatives, campaigns, games, aimable = false, initialCampaignId = "" }) {
  const router = useRouter();
  // Creatives still in review can be booked: the booking starts when the creative is approved.
  const usable = creatives.filter((item) => item.status !== "rejected");

  // A draft, or a copy of a campaign, opens where it was left: its creative, choices and audience come back.
  const start = campaigns.find((item) => item.id === initialCampaignId);
  const plan = start?.plan ?? null;
  const planCreative = plan?.creativeId && usable.some((item) => item.id === plan.creativeId) ? plan.creativeId : "";
  const startFilters = { genres: start?.targeting?.genres ?? [], platforms: start?.targeting?.platforms ?? [], languages: start?.targeting?.languages ?? [] };
  const hasStartFilters = PROFILE_KEYS.some((key) => startFilters[key].length > 0);
  const startStep = !planCreative ? 1 : plan?.mode === "manual" ? ((plan.placementIds ?? []).length > 0 ? 3 : 2) : hasStartFilters ? 3 : 2;

  const [creativeId, setCreativeId] = useState(planCreative || usable[0]?.id || "");
  const [justAdded, setJustAdded] = useState("");
  const [campaignId, setCampaignId] = useState(initialCampaignId); // "" = a new campaign
  const [step, setStep] = useState(startStep);
  const [adding, setAdding] = useState(usable.length === 0); // the upload form inside step 1
  const [mode, setMode] = useState(plan?.mode === "manual" ? "manual" : "audience"); // audience | manual
  const [campaignName, setCampaignName] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [picked, setPicked] = useState(() => new Set(plan?.placementIds ?? []));
  const [filters, setFilters] = useState(startFilters);
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

  // By audience: every open placement in the games that match the filters (and the creative's own audience).
  const audienceGames = games.filter((game) => (!aimed || fitOf(game).fits) && (!filtering || evaluate(game.profile, filters).fits));
  const audienceIds = audienceGames.flatMap((game) => game.placements.map((placement) => placement.id));
  const bookIds = mode === "audience" ? audienceIds : chosenIds;
  const reachGames = mode === "audience" ? audienceGames : games.filter((game) => game.placements.some((placement) => chosenIds.includes(placement.id)));

  const needsName = !campaignId && !campaignName.trim();
  const canNext = step === 1 ? Boolean(creativeId) && !needsName : step === 2 ? bookIds.length > 0 : true;
  const campaignLabel = campaignId ? campaigns.find((item) => item.id === campaignId)?.name : campaignName.trim();

  function added(creative) {
    setJustAdded(creative.id);
    setCreativeId(creative.id);
    setAdding(false);
    router.refresh(); // the server list now holds the new creative
  }

  const audienceTargeting = filtering ? Object.fromEntries(PROFILE_KEYS.filter((key) => filters[key].length > 0).map((key) => [key, filters[key]])) : null;
  const campaignNameReady = Boolean(campaignId || campaignName.trim());

  async function draft() {
    if (busy || !campaignNameReady) return;
    setBusy(true);
    setError("");
    const result = await saveDraft({
      campaignId: campaignId || undefined,
      campaignName: campaignId ? campaignLabel : campaignName,
      targeting: audienceTargeting,
      plan: { creativeId, mode, placementIds: mode === "manual" ? chosenIds : [] },
    }).catch(() => ({ error: "Connection lost. Try again." }));
    setBusy(false);
    if (result?.error) return setError(result.error);
    router.push("/dashboard/advertising");
    router.refresh();
  }

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError("");
    const result = await createBooking({
      campaignId: campaignId || undefined,
      campaignName,
      creativeId,
      placementIds: bookIds,
      startsOn,
      endsOn,
      // Choosing by audience makes the filters the campaign's audience; choosing by hand leaves it as it was.
      targeting: mode === "audience" ? audienceTargeting : undefined,
    }).catch(() => ({ error: "Connection lost. Try again." }));
    setBusy(false);
    if (result?.error) return setError(result.error);
    router.push("/dashboard/advertising");
    router.refresh();
  }

  const STEPS = ["Creative", "Where", "Schedule", "Review"];
  const chosenInList = chosen || usable.find((item) => item.id === justAdded);

  return (
    <div className="panel stack wizard">
      <ol className="wizard-steps" aria-label="Steps">
        {STEPS.map((label, index) => (
          <li key={label} aria-current={step === index + 1 ? "step" : undefined} className={step > index + 1 ? "is-done" : undefined}>
            <span className="num">{index + 1}</span> {label}
          </li>
        ))}
      </ol>

      {step === 1 && (
        <div className="stack">
          {campaignId ? (
            <p className="settings-help">
              Adding to <strong>{campaignLabel}</strong>.{" "}
              <button type="button" className="link-button" onClick={() => setCampaignId("")}>
                Start a new campaign instead
              </button>
            </p>
          ) : (
            <>
              <label htmlFor="campaign-name">Campaign name</label>
              <input
                id="campaign-name"
                className="field"
                value={campaignName}
                onChange={(event) => setCampaignName(event.target.value)}
                placeholder="Spring launch"
                maxLength={120}
                disabled={busy}
              />
            </>
          )}

          <div className="settings-title">Creative</div>
          {usable.length > 0 && !adding && (
            <>
              <select id="creative" className="field" value={creativeId} onChange={(event) => setCreativeId(event.target.value)} disabled={busy} aria-label="Creative">
                {usable.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                    {item.size ? ` (${item.size})` : ""}
                    {item.status === "pending" ? " — in review" : ""}
                  </option>
                ))}
              </select>
              <p className="settings-help">
                Your creatives can be used in any campaign.{" "}
                <button type="button" className="link-button" onClick={() => setAdding(true)}>
                  Upload a new one
                </button>
              </p>
            </>
          )}
          {adding && (
            <div className="audience-box">
              <UploadForm embedded onUploaded={added} />
              {usable.length > 0 && (
                <button type="button" className="link-button" onClick={() => setAdding(false)}>
                  Use one I already have
                </button>
              )}
            </div>
          )}
          {chosenInList?.status === "pending" && (
            <p className="settings-help">This creative is in review. You can set the campaign up now; ads start when it is approved.</p>
          )}
          {chosen && (
            <p className="settings-help">
              Cropping, pictures for other formats and the creative's own audience are on{" "}
              <Link href={`/dashboard/creatives/${chosen.id}`}>the creative's page</Link>.
            </p>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="stack">
          <div className="subnav" role="group" aria-label="How to choose">
            <button type="button" className="link-button" aria-pressed={mode === "audience"} onClick={() => setMode("audience")}>
              By audience
            </button>
            <button type="button" className="link-button" aria-pressed={mode === "manual"} onClick={() => setMode("manual")}>
              Pick placements
            </button>
          </div>

          {aimable && games.length > 0 && (
            <div className="audience-box">
              {aimed ? (
                <p className="audience-line">
                  This creative's audience: {targetingSummary(targeting)}.{" "}
                  <span className="muted-line">
                    {fitting} of {games.length} {games.length === 1 ? "game" : "games"} fit{fitting === 1 ? "s" : ""}.
                  </span>{" "}
                  <Link href={`/dashboard/creatives/${chosen.id}`}>Change it</Link>
                </p>
              ) : (
                <p className="settings-help">No audience on this creative: it can show in every game.</p>
              )}
              {mode === "manual" && aimed && (
                <label className="pick-item">
                  <input type="checkbox" checked={fitOnly} onChange={(event) => setFitOnly(event.target.checked)} disabled={busy} />
                  <span>Show only games that fit</span>
                </label>
              )}
              <details className="filter-box" open={mode === "audience" || filtering || undefined}>
                <summary>{mode === "audience" ? "Games to reach" : "Filter the games"}{filtering ? " (on)" : ""}</summary>
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
                      <span className="muted-line">Games that have not filled in a list you filter by are left out.</span>
                    </div>
                  )}
                </div>
              </details>
            </div>
          )}

          {mode === "audience" ? (
            <p className="audience-line">
              {audienceIds.length === 0
                ? "No open placement matches yet. Change the audience, or pick placements by hand."
                : `${audienceIds.length} ${audienceIds.length === 1 ? "placement" : "placements"} in ${audienceGames.length} ${audienceGames.length === 1 ? "game" : "games"}: ${audienceGames.map((game) => game.name).slice(0, 6).join(", ")}${audienceGames.length > 6 ? "…" : ""}`}
              <span className="muted-line"> Placements opened later are not added automatically.</span>
            </p>
          ) : games.length === 0 ? (
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
                    <input type="checkbox" checked={picked.has(placement.id)} onChange={() => toggle(placement.id)} disabled={busy} />
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
        </div>
      )}

      {step === 3 && (
        <div className="stack">
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
        </div>
      )}

      {step === 4 && (
        <div className="stack">
          <dl className="review-list">
            <dt>Campaign</dt>
            <dd>{campaignLabel}</dd>
            <dt>Creative</dt>
            <dd>
              {chosen?.name}
              {chosen?.status === "pending" ? " (in review)" : ""}
            </dd>
            <dt>Placements</dt>
            <dd>
              {bookIds.length} {mode === "audience" ? "by audience" : "picked by hand"}
            </dd>
            <dt>Reach</dt>
            <dd>
              {reachGames.length} of {games.length} {games.length === 1 ? "game" : "games"} open to advertisers
              {games.length > 0 ? ` (${Math.round((reachGames.length / games.length) * 100)}%)` : ""}
              {mode === "audience" && audienceTargeting ? ` · audience: ${targetingSummary(audienceTargeting)}` : ""}
            </dd>
            <dt>Dates</dt>
            <dd>{startsOn || endsOn ? `${startsOn || "now"} → ${endsOn || "until stopped"}` : "Starts right away, runs until you stop it"}</dd>
          </dl>
          <p className="settings-help">Several advertisers can share a placement and take turns; a developer can switch an ad off.</p>
        </div>
      )}

      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <div className="row">
        {step > 1 && (
          <button type="button" className="button button-quiet" onClick={() => setStep(step - 1)} disabled={busy}>
            Back
          </button>
        )}
        {step < 4 ? (
          <button type="button" className="button" onClick={() => setStep(step + 1)} disabled={!canNext || busy}>
            Next
          </button>
        ) : (
          <button type="button" className="button" onClick={submit} disabled={busy || bookIds.length === 0 || needsName || !creativeId}>
            {busy ? "Starting…" : "Start campaign"}
          </button>
        )}
        <button type="button" className="button button-quiet" onClick={draft} disabled={busy || !campaignNameReady} title={campaignNameReady ? undefined : "Name the campaign first"}>
          Save as draft
        </button>
      </div>
    </div>
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
