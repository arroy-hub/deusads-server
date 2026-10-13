"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createBooking, saveDraft } from "../actions";
import UploadForm from "../../creatives/upload-form";
import { FORMATS, coverageByFormat, formatLabel, formatOf, pickImage } from "../../../../lib/formats";
import { ratioLabel as rawRatio } from "../../../../lib/surface-math";

/** "3:1" for a standard shape, otherwise the plain ratio. */
const ratioLabel = (aspect) => {
  const id = formatOf(aspect);
  return id ? (FORMATS.find((format) => format.id === id)?.label.split(" ")[0] ?? rawRatio(aspect)) : rawRatio(aspect);
};
import { FIELDS, PROFILE_KEYS, countFitting, evaluate, hasTargeting, labelOf, targetingSummary, whyNot } from "../../../../lib/targeting";

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
  const startFilters = { genres: start?.targeting?.genres ?? [], exclude_genres: start?.targeting?.exclude_genres ?? [], platforms: start?.targeting?.platforms ?? [], languages: start?.targeting?.languages ?? [] };
  const hasStartFilters = [...PROFILE_KEYS, "exclude_genres"].some((key) => startFilters[key].length > 0);
  const startStep = !planCreative ? 1 : plan?.mode === "manual" ? ((plan.placementIds ?? []).length > 0 ? 3 : 2) : hasStartFilters ? 3 : 2;

  const [creativeId, setCreativeId] = useState(planCreative || usable[0]?.id || "");
  const [justAdded, setJustAdded] = useState("");
  const [campaignId, setCampaignId] = useState(initialCampaignId); // "" = a new campaign
  const [step, setStep] = useState(startStep);
  const [adding, setAdding] = useState(usable.length === 0); // the upload form inside step 1
  const [mode, setMode] = useState(plan?.mode === "manual" ? "manual" : "audience"); // audience | manual
  const [campaignName, setCampaignName] = useState("");
  const [startMode, setStartMode] = useState("approved"); // approved | date
  const [startDate, setStartDate] = useState("");
  const [endMode, setEndMode] = useState("14"); // 7 | 14 | 30 | never | date
  const [endDate, setEndDate] = useState("");
  const [addingGenre, setAddingGenre] = useState(false);
  const [picked, setPicked] = useState(() => new Set(plan?.placementIds ?? []));
  const [filters, setFilters] = useState(startFilters);
  const [fitOnly, setFitOnly] = useState(false);
  const chosen = usable.find((item) => item.id === creativeId);
  const today = new Date().toISOString().slice(0, 10);
  const addDays = (date, count) => {
    const base = new Date(`${date}T00:00:00Z`);
    base.setUTCDate(base.getUTCDate() + count);
    return base.toISOString().slice(0, 10);
  };
  const startsOn = startMode === "date" ? startDate : "";
  const endsOn = endMode === "never" ? "" : endMode === "date" ? endDate : addDays(startsOn || today, Number(endMode));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Which games the chosen creative's audience allows, and which the filters leave in the list.
  const targeting = chosen?.targeting ?? null;
  const aimed = aimable && hasTargeting(targeting);
  const filtering = aimable && [...PROFILE_KEYS, "exclude_genres"].some((key) => filters[key].length > 0);
  const fitOf = (game) => evaluate(game.profile, targeting);
  const fitting = aimed ? countFitting(games.map((game) => game.profile), targeting) : games.length;
  const shownGames = games.filter((game) => {
    if (aimed && fitOnly && !fitOf(game).fits) return false;
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

  const audienceTargeting = filtering ? Object.fromEntries([...PROFILE_KEYS, "exclude_genres"].filter((key) => filters[key].length > 0).map((key) => [key, filters[key]])) : null;
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

  // --- By audience: chips with counts, the reach funnel, what is skipped, how to widen.
  const hasField = (game, field, id) => (game.profile?.[field] ?? []).includes(id);
  const countOf = (field, id) => games.filter((game) => hasField(game, field, id)).length;
  const optionsFor = (field, value, limit) => {
    const all = FIELDS[field].options.map((option) => ({ ...option, count: countOf(field, option.id) }));
    const sorted = all.filter((option) => option.count > 0 || value.includes(option.id)).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    return limit ? sorted.filter((option, index) => index < limit || value.includes(option.id)) : sorted;
  };
  const genreOptions = optionsFor("genres", [...filters.genres, ...filters.exclude_genres]);
  const platformOptions = optionsFor("platforms", filters.platforms);
  const languageOptions = optionsFor("languages", filters.languages, 8);
  const setGenres = (next) => setFilters({ ...filters, genres: next, exclude_genres: filters.exclude_genres.filter((id) => !next.includes(id)) });
  const tagsOf = (game) =>
    [(game.profile?.genres ?? []).slice(0, 2).map((id) => labelOf("genres", id)).join(", "), (game.profile?.platforms ?? []).slice(0, 2).map((id) => labelOf("platforms", id).replace(/ \(.*\)$/, "")).join(", ")].filter(Boolean).join(" · ");

  const FUNNEL = { genres: ["Match your genres", ""], platforms: ["...on ", " or "], languages: ["...in ", " or "] };
  const funnel = [];
  let running = {};
  for (const key of PROFILE_KEYS) {
    if (filters[key].length === 0) continue;
    running = { ...running, [key]: filters[key] };
    const names = filters[key].map((id) => labelOf(key, id)).join(" or ");
    funnel.push({ label: key === "genres" ? FUNNEL.genres[0] : `${FUNNEL[key][0]}${names}`, count: games.filter((game) => evaluate(game.profile, running).fits).length });
  }
  const excludedCount = filters.exclude_genres.length
    ? games.filter((game) => evaluate(game.profile, running).fits && evaluate(game.profile, { exclude_genres: filters.exclude_genres }).problems.some((problem) => problem.kind === "excluded")).length
    : 0;
  const FIELD_WORDS = { genres: ["their genres", "a genre", "genres"], platforms: ["their platforms", "a platform", "platforms"], languages: ["their languages", "a language", "languages"] };
  const unfilled = PROFILE_KEYS.filter((key) => filters[key].length > 0)
    .map((key) => ({ field: key, count: games.filter((game) => (game.profile?.[key] ?? []).length === 0).length, words: FIELD_WORDS[key][0], one: FIELD_WORDS[key][1], plural: FIELD_WORDS[key][2] }))
    .filter((item) => item.count > 0);
  const skippedNote = unfilled.length ? `Skipped: ${unfilled.map((item) => `${item.count} ${item.count === 1 ? "game" : "games"} without ${item.plural} set`).join(", ")}.` : "";
  const audiencePlacements = audienceGames.reduce((sum, game) => sum + game.placements.length, 0);
  let widen = null;
  if (aimable && filters.genres.length > 0) {
    const base = audienceGames.length;
    for (const option of genreOptions) {
      if (filters.genres.includes(option.id) || filters.exclude_genres.includes(option.id)) continue;
      const extra = games.filter((game) => (!aimed || fitOf(game).fits) && evaluate(game.profile, { ...(audienceTargeting ?? {}), genres: [...filters.genres, option.id] }).fits).length - base;
      if (extra > 0 && (!widen || extra > widen.extra)) widen = { id: option.id, label: option.label, extra };
    }
  }

  // --- How the chosen creative covers the placements (manual summary, review).
  const shapeOf = (item) => ({ aspect: item?.width && item?.height ? item.width / item.height : null, safeZone: item?.safe ?? undefined });
  const placementById = new Map(games.flatMap((game) => game.placements.map((placement) => [placement.id, placement])));
  const noPicture = (placement) => chosen && placement?.aspect && pickImage({ creative: shapeOf(chosen), assets: chosen.assets ?? [], surfaceAspect: placement.aspect }).kind === "none";
  const chosenPlacements = chosenIds.map((id) => placementById.get(id)).filter(Boolean);
  const blockedCount = chosenPlacements.filter(noPicture).length;
  const shown_ok = chosenPlacements.length - blockedCount;
  const blockedShapes = [...new Set(chosenPlacements.filter(noPicture).map((placement) => ratioLabel(placement.aspect)))];
  const missingShapes = chosen ? coverageByFormat({ creative: shapeOf(chosen), assets: chosen.assets ?? [] }).filter((row) => row.kind === "none").map((row) => row.format.label.split(" ")[0]) : [];
  const missingPlacements = bookIds.map((id) => placementById.get(id)).filter(noPicture).length;
  const LOOKS = { r16x9: "16:9 menu", r1x1: "1:1 sign", r9x16: "9:16 loading", r3x1: "3:1 banner" };
  const looks = chosen
    ? coverageByFormat({ creative: shapeOf(chosen), assets: chosen.assets ?? [] })
        .filter((row) => LOOKS[row.format.id])
        .map((row) => ({ id: row.format.id, label: LOOKS[row.format.id], aspect: row.format.aspect, kind: row.kind }))
    : [];
  const scheduleWord = endMode === "never" ? "Until stopped" : endMode === "date" ? (endDate ? `Until ${dayText(endDate)}` : "Pick a date") : `${endMode} days`;

  const STEPS = [
    ["Creative", chosen ? chosen.name : "Pick or upload"],
    ["Where", mode === "manual" ? "Pick placements" : "Who should see it"],
    ["Schedule", "Start and end"],
    ["Review", "Check and start"],
  ];
  const subtitles = [
    chosen ? chosen.name : STEPS[0][1],
    step > 2 ? `${reachGames.length} ${reachGames.length === 1 ? "game" : "games"}` : STEPS[1][1],
    step > 3 ? scheduleWord : STEPS[2][1],
    STEPS[3][1],
  ];
  const chosenInList = chosen || usable.find((item) => item.id === justAdded);

  return (
    <>
      <div className="main-head wz-head">
        <div>
          <p className="ch-crumb">
            <Link href="/dashboard/advertising">Campaigns</Link> / New campaign
          </p>
          <h1>New campaign</h1>
        </div>
        <div className="wz-head-actions">
          <button type="button" className="button button-quiet" onClick={draft} disabled={busy || !campaignNameReady} title={campaignNameReady ? undefined : "Name the campaign first"}>
            Save draft
          </button>
          <Link href="/dashboard/advertising" className="button button-quiet">
            Cancel
          </Link>
        </div>
      </div>

      <ol className="wz-steps" aria-label="Steps">
        {STEPS.map(([label], index) => (
          <li key={label} aria-current={step === index + 1 ? "step" : undefined} className={step > index + 1 ? "is-done" : undefined}>
            <span className="wz-dot">{step > index + 1 ? "✓" : index + 1}</span>
            <span className="wz-step-text">
              <strong>{label}</strong>
              <span>{subtitles[index]}</span>
            </span>
          </li>
        ))}
      </ol>

      {step === 1 && (
        <section className="wz-card wz-narrow">
          {campaignId ? (
            <p className="settings-help">
              Adding to <strong>{campaignLabel}</strong>.{" "}
              <button type="button" className="link-button" onClick={() => setCampaignId("")}>
                Start a new campaign instead
              </button>
            </p>
          ) : (
            <label className="wz-label" htmlFor="campaign-name">
              Campaign name
              <input id="campaign-name" className="field wz-name" value={campaignName} onChange={(event) => setCampaignName(event.target.value)} placeholder="Spring launch" maxLength={120} disabled={busy} />
            </label>
          )}

          <div className="wz-row-between">
            <span className="wz-label-text">Creative</span>
            <span className="ovx-muted">Any creative can be used in any campaign.</span>
          </div>
          {usable.length > 0 && (
            <div className="cp-seg wz-seg" role="group" aria-label="Creative source">
              <button type="button" aria-pressed={!adding} onClick={() => setAdding(false)}>
                Use one I have
              </button>
              <button type="button" aria-pressed={adding} onClick={() => setAdding(true)}>
                Upload a new one
              </button>
            </div>
          )}
          {adding && (
            <div className="wz-upload">
              <UploadForm embedded onUploaded={added} />
            </div>
          )}
          {!adding && (
            <div className="wz-creatives" role="radiogroup" aria-label="Creative">
              {usable.map((item) => {
                const shape = { aspect: item.width && item.height ? item.width / item.height : null, safeZone: item.safe ?? undefined };
                const covered = coverageByFormat({ creative: shape, assets: item.assets ?? [] }).filter((row) => row.kind !== "none").length;
                return (
                  <label key={item.id} className={`wz-creative${creativeId === item.id ? " is-picked" : ""}`}>
                    <input type="radio" name="creative" value={item.id} checked={creativeId === item.id} onChange={() => setCreativeId(item.id)} disabled={busy} />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {item.url ? <img className="wz-thumb" src={item.url} alt="" /> : <span className="wz-thumb" />}
                    <span className="wz-creative-text">
                      <strong>{item.name}</strong>
                      <span className="ovx-muted">{[item.size, `${covered} of ${FORMATS.length} formats`].filter(Boolean).join(" · ")}</span>
                    </span>
                    <span className={`ov-pill ${item.status === "approved" ? "ov-live" : "ov-scheduled"}`}>{item.status === "approved" ? "Approved" : "In review"}</span>
                  </label>
                );
              })}
            </div>
          )}
          {chosen && !adding && (
            <p className="ovx-hint">
              Cropping, pictures for other formats and the creative’s own audience are on <Link href={`/dashboard/creatives/${chosen.id}`}>the creative’s page</Link>.
            </p>
          )}
          <div className="wz-foot">
            <span className="ovx-hint">{chosenInList?.status === "pending" || usable.some((item) => item.status === "pending") ? "A creative in review can be booked. Ads start when it is approved." : ""}</span>
            <span className="wz-foot-actions">
              <button type="button" className="button" onClick={() => setStep(2)} disabled={!canNext || busy}>
                Next
              </button>
            </span>
          </div>
        </section>
      )}

      {step === 2 && (
        <div className="wz-grid">
          <div className="wz-main">
            {mode === "manual" && (
              <div className="wz-row-between">
                <ModeSwitch mode={mode} setMode={setMode} />
                {aimed && (
                  <label className="wz-check">
                    <input type="checkbox" checked={fitOnly} onChange={(event) => setFitOnly(event.target.checked)} disabled={busy} />
                    Only games that fit the audience
                  </label>
                )}
              </div>
            )}

            {mode === "audience" ? (
              <section className="wz-card">
                {!campaignId && (
                  <label className="wz-label" htmlFor="campaign-name-2">
                    Campaign name
                    <input id="campaign-name-2" className="field wz-name" value={campaignName} onChange={(event) => setCampaignName(event.target.value)} maxLength={120} disabled={busy} />
                    <span className="settings-help">Only you see this name.</span>
                  </label>
                )}
                <ModeSwitch mode={mode} setMode={setMode} />
                {!aimable || games.length === 0 ? (
                  <p className="settings-help">{games.length === 0 ? "No games have opened placements yet." : "Choosing by audience needs migration 0018."}</p>
                ) : (
                  <>
                    {aimed && (
                      <p className="audience-line">
                        This creative’s own audience: {targetingSummary(targeting)}. <Link href={`/dashboard/creatives/${chosen.id}`}>Change it</Link>
                      </p>
                    )}
                    <ChipSection title="Genres" hint="You choose the audience, not single games or developers. Numbers show how many registered games have the genre." options={genreOptions} value={filters.genres} onChange={(next) => setGenres(next)} disabled={busy} />
                    <section className="wz-section">
                      <h2>Exclude genres</h2>
                      <p>Never show in games with these genres, even if they match above.</p>
                      <div className="wz-chips">
                        {filters.exclude_genres.map((id) => (
                          <button key={id} type="button" className="wz-chip is-excluded" aria-pressed="true" onClick={() => setFilters({ ...filters, exclude_genres: filters.exclude_genres.filter((item) => item !== id) })} disabled={busy}>
                            {labelOf("genres", id)} <span>{countOf("genres", id)}</span>
                          </button>
                        ))}
                        <button type="button" className="wz-chip is-add" aria-expanded={addingGenre} onClick={() => setAddingGenre(!addingGenre)} disabled={busy}>
                          + Add genre
                        </button>
                      </div>
                      {addingGenre && (
                        <div className="wz-chips">
                          {genreOptions
                            .filter((option) => !filters.exclude_genres.includes(option.id))
                            .map((option) => (
                              <button key={option.id} type="button" className="wz-chip" onClick={() => setFilters({ ...filters, exclude_genres: [...filters.exclude_genres, option.id], genres: filters.genres.filter((item) => item !== option.id) })} disabled={busy}>
                                {option.label} <span>{option.count}</span>
                              </button>
                            ))}
                        </div>
                      )}
                    </section>
                    <ChipSection title="Platforms" options={platformOptions} value={filters.platforms} onChange={(next) => setFilters({ ...filters, platforms: next })} disabled={busy} />
                    <ChipSection title="Languages" options={languageOptions} value={filters.languages} onChange={(next) => setFilters({ ...filters, languages: next })} disabled={busy} />
                    {unfilled.map((item) => (
                      <p className="wz-warn" role="status" key={item.field}>
                        <span aria-hidden="true">!</span>
                        {item.count} {item.count === 1 ? "game has" : "games have"} not set {item.words} and {item.count === 1 ? "is" : "are"} skipped while {item.one} is selected. Clear the selection to include {item.count === 1 ? "it" : "them"}.
                      </p>
                    ))}
                  </>
                )}
                <div className="wz-foot">
                  <button type="button" className="button button-quiet" onClick={() => setStep(1)} disabled={busy}>
                    ← Creative
                  </button>
                  <span className="wz-foot-actions">
                    <button type="button" className="button" onClick={() => setStep(3)} disabled={!canNext || busy}>
                      Next: Schedule →
                    </button>
                  </span>
                </div>
              </section>
            ) : (
              <>
                {aimed && (
                  <p className="audience-line">
                    This creative’s audience: {targetingSummary(targeting)}. {fitting} of {games.length} {games.length === 1 ? "game" : "games"} fit{fitting === 1 ? "s" : ""}.{" "}
                    <Link href={`/dashboard/creatives/${chosen.id}`}>Change it</Link>
                  </p>
                )}
                {games.length === 0 ? (
                  <p className="settings-help">No placements are available yet.</p>
                ) : shownGames.length === 0 ? (
                  <p className="settings-help">No game matches. Untick “Only games that fit the audience”.</p>
                ) : (
                  shownGames.map((game) => {
                    const fit = fitOf(game);
                    return (
                      <section key={game.id ?? game.name} className="wz-game">
                        <div className="wz-game-head">
                          <strong>{game.name}</strong>
                          {tagsOf(game) && <span className="ovx-muted">{tagsOf(game)}</span>}
                          {aimed && (
                            <span className={`ov-pill ${fit.fits ? "ov-live" : "ov-paused"}`}>{fit.fits ? "Fits" : `Does not fit: ${whyNot(fit.problems)}`}</span>
                          )}
                        </div>
                        {game.placements.map((placement) => {
                          const note = chosen ? coverageNote(chosen, placement.aspect) : null;
                          return (
                            <label key={placement.id} className="wz-place">
                              <input type="checkbox" checked={picked.has(placement.id)} onChange={() => toggle(placement.id)} disabled={busy} />
                              <span className="wz-shape-cell">
                                <span className="wz-shape" aria-hidden="true" style={{ aspectRatio: placement.aspect ? String(Math.min(4, Math.max(0.5, placement.aspect))) : "16 / 9" }} />
                              </span>
                              <span className="wz-place-name">
                                <strong>{placement.label}</strong> {placement.aspect ? <span className="ovx-muted">{ratioLabel(placement.aspect)}</span> : null}
                              </span>
                              {note && <span className={`wz-note ${note.tone}`}>{note.text}</span>}
                            </label>
                          );
                        })}
                        {aimed && !fit.fits && <p className="wz-place-hint">You can still book: the ad shows once the game fits.</p>}
                      </section>
                    );
                  })
                )}
              </>
            )}
          </div>

          <aside className="wz-aside" aria-label="Summary">
            {mode === "audience" ? (
              <>
                <section className="wz-side">
                  <h2>Estimated reach</h2>
                  <div className="wz-big">
                    <span aria-hidden="true">≈</span> {audienceGames.length} <small>{audienceGames.length === 1 ? "game" : "games"}</small>
                  </div>
                  <p className="ovx-muted">
                    of {games.length} registered · about {audiencePlacements} {audiencePlacements === 1 ? "placement" : "placements"}
                  </p>
                  {funnel.length > 0 && (
                    <div className="wz-funnel">
                      {funnel.map((row) => (
                        <div key={row.label}>
                          <div className="wz-funnel-row">
                            <span>{row.label}</span>
                            <strong>{row.count}</strong>
                          </div>
                          <span className="wz-funnel-bar">
                            <span style={{ width: `${games.length ? Math.round((row.count / games.length) * 100) : 0}%` }} />
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {(skippedNote || excludedCount > 0) && (
                    <p className="ovx-muted wz-skipped">
                      {skippedNote}
                      {skippedNote && excludedCount > 0 ? " " : ""}
                      {excludedCount > 0 ? `Excluded by genre: ${excludedCount} ${excludedCount === 1 ? "game" : "games"}.` : ""}
                    </p>
                  )}
                </section>
                {widen && (
                  <section className="wz-side">
                    <h2>Widen your reach</h2>
                    <p className="ovx-muted">
                      Add <strong>{widen.label}</strong> to reach about {widen.extra} more {widen.extra === 1 ? "game" : "games"}.
                    </p>
                    <div>
                      <button type="button" className="button button-quiet" onClick={() => setGenres([...filters.genres, widen.id])}>
                        Add {widen.label}
                      </button>
                    </div>
                  </section>
                )}
                <section className="wz-side wz-how">
                  <h2>How delivery works</h2>
                  <p>Placements rotate between advertisers. There are no exclusive slots.</p>
                  <p>Developers can pause or block your ads in their game. You will see where, and why if they gave a reason.</p>
                  <p>Changes reach players at their next game launch.</p>
                </section>
              </>
            ) : (
              <>
                <section className="wz-side">
                  <h2>Selected</h2>
                  <div className="wz-big">
                    {chosenIds.length} <small>{chosenIds.length === 1 ? "placement" : "placements"} in {reachGames.length} {reachGames.length === 1 ? "game" : "games"}</small>
                  </div>
                  {chosenIds.length > 0 && chosen && (
                    <p className="ovx-muted">
                      {shown_ok} of them show your image as is or cropped.
                      {blockedShapes.length > 0 ? ` ${blockedCount} would not show until you add a ${blockedShapes.join(" and ")} picture.` : ""}
                    </p>
                  )}
                  {blockedShapes.length > 0 && chosen && (
                    <div>
                      <Link className="button button-quiet button-small" href={`/dashboard/creatives/${chosen.id}`}>
                        Add a {blockedShapes.join(" and ")} picture
                      </Link>
                    </div>
                  )}
                </section>
                <div className="wz-side-actions">
                  <button type="button" className="button button-quiet" onClick={() => setStep(1)} disabled={busy}>
                    ← Back
                  </button>
                  <button type="button" className="button" onClick={() => setStep(3)} disabled={!canNext || busy}>
                    Next: Schedule →
                  </button>
                </div>
              </>
            )}
          </aside>
        </div>
      )}

      {step === 3 && (
        <section className="wz-card wz-narrow">
          <div className="wz-section">
            <h2>Start</h2>
            <label className={`wz-radio${startMode === "approved" ? " is-picked" : ""}`}>
              <input type="radio" name="start" checked={startMode === "approved"} onChange={() => setStartMode("approved")} disabled={busy} />
              <strong>As soon as the creative is approved</strong>
            </label>
            <label className={`wz-radio${startMode === "date" ? " is-picked" : ""}`}>
              <input type="radio" name="start" checked={startMode === "date"} onChange={() => setStartMode("date")} disabled={busy} />
              <strong>On a date</strong>
              <input className="field wz-date" type="date" min={today} value={startDate} onChange={(event) => { setStartDate(event.target.value); setStartMode("date"); }} disabled={busy} aria-label="Start date" />
            </label>
          </div>
          <div className="wz-section">
            <h2>End</h2>
            <div className="wz-chips">
              {[["7", "7 days"], ["14", "14 days"], ["30", "30 days"], ["never", "Until I stop it"], ["date", "Pick a date"]].map(([key, label]) => (
                <button key={key} type="button" className="wz-chip" aria-pressed={endMode === key} onClick={() => setEndMode(key)} disabled={busy}>
                  {label}
                </button>
              ))}
            </div>
            {endMode === "date" && <input className="field wz-date" type="date" min={startsOn || today} value={endDate} onChange={(event) => setEndDate(event.target.value)} disabled={busy} aria-label="End date" />}
          </div>
          <p className="wz-summary">
            <strong>{endMode === "never" ? "Runs until you stop it" : endMode === "date" ? (endDate ? `Runs until ${dayText(endDate)}` : "Pick the last day") : `Runs about ${endMode} days`}</strong>
            {endsOn && endMode !== "never" ? ` · ends ${dayText(endsOn)} at the end of the day (UTC).` : "."} You can extend or stop it any time.
          </p>
          <div className="wz-foot">
            <button type="button" className="button button-quiet" onClick={() => setStep(2)} disabled={busy}>
              ← Back
            </button>
            <span className="wz-foot-actions">
              <button type="button" className="button" onClick={() => setStep(4)} disabled={busy || (startMode === "date" && !startDate) || (endMode === "date" && !endDate)}>
                Next: Review →
              </button>
            </span>
          </div>
        </section>
      )}

      {step === 4 && (
        <div className="wz-grid">
          <div className="wz-main">
            <section className="wz-card">
              <h2 className="wz-title">Before you start</h2>
              <ul className="wz-check-list">
                <li>
                  <span className={`wz-tick ${chosen?.status === "approved" ? "" : "is-wait"}`} aria-hidden="true">{chosen?.status === "approved" ? "✓" : "!"}</span>
                  <span>
                    Creative <strong>{chosen?.name}</strong> {chosen?.status === "approved" ? "is approved." : "is in review. Ads start when it is approved."}
                  </span>
                </li>
                <li>
                  <span className="wz-tick" aria-hidden="true">✓</span>
                  <span>
                    {mode === "audience" && audienceTargeting ? `Audience: ${targetingSummary(audienceTargeting)}. ` : mode === "audience" ? "Audience: every game. " : "Placements picked by hand. "}
                    <strong>{reachGames.length} of {games.length} games</strong> {mode === "audience" ? "fit" : "selected"}.
                  </span>
                </li>
                {missingShapes.length > 0 && (
                  <li>
                    <span className="wz-tick is-wait" aria-hidden="true">!</span>
                    <span>
                      {missingShapes.length === 1 ? "One shape has" : `${missingShapes.length} shapes have`} no picture: <strong>{missingShapes.join(" and ")}</strong>. The ad will not show in <strong>{missingPlacements} of {bookIds.length}</strong> placements.
                    </span>
                    {chosen && (
                      <Link className="button button-small" href={`/dashboard/creatives/${chosen.id}`}>
                        Add pictures
                      </Link>
                    )}
                  </li>
                )}
                <li>
                  <span className="wz-tick" aria-hidden="true">✓</span>
                  <span>
                    {startsOn ? `Starts ${dayText(startsOn)}` : "Starts when the creative is approved"}, {endsOn ? `runs until ${dayText(endsOn)}.` : "runs until you stop it."}
                  </span>
                </li>
              </ul>
            </section>
            <section className="wz-card">
              <div className="wz-row-between">
                <h2 className="wz-title">How it will look</h2>
                <span className="ovx-muted">Your image in typical placements</span>
              </div>
              <div className="wz-looks">
                {looks.map((look) => (
                  <figure key={look.id}>
                    {look.kind === "none" ? (
                      <span className="wz-look is-none" style={{ aspectRatio: String(look.aspect), height: 90 }}>
                        no picture
                      </span>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <span className="wz-look" style={{ aspectRatio: String(look.aspect), height: 90, backgroundImage: chosen?.url ? `url(${chosen.url})` : undefined }} />
                    )}
                    <figcaption>{look.label}</figcaption>
                  </figure>
                ))}
              </div>
            </section>
          </div>
          <aside className="wz-aside" aria-label="Start">
            <section className="wz-side">
              <h2>Estimated reach</h2>
              <div className="wz-big">
                <span aria-hidden="true">≈</span> {reachGames.length} <small>{reachGames.length === 1 ? "game" : "games"}</small>
              </div>
              <p className="ovx-muted">
                {bookIds.length} {bookIds.length === 1 ? "placement" : "placements"}. Based on today’s catalog; numbers change as games join.
              </p>
            </section>
            {error && (
              <div className="error" role="alert">
                {error}
              </div>
            )}
            <button type="button" className="button wz-wide" onClick={submit} disabled={busy || bookIds.length === 0 || needsName || !creativeId}>
              {busy ? "Starting…" : "Start campaign"}
            </button>
            <button type="button" className="button button-quiet wz-wide" onClick={draft} disabled={busy || !campaignNameReady}>
              Save as draft
            </button>
            <button type="button" className="link-button wz-back" onClick={() => setStep(3)} disabled={busy}>
              ← Back
            </button>
            <p className="ovx-muted">Nothing is charged. Developers can still pause or block an ad in their game; you will see where and why.</p>
          </aside>
        </div>
      )}

      {error && step !== 4 && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
    </>
  );
}

function ModeSwitch({ mode, setMode }) {
  return (
    <div className="cp-seg wz-seg" role="group" aria-label="How to choose">
      <button type="button" aria-pressed={mode === "audience"} onClick={() => setMode("audience")}>
        By audience
      </button>
      <button type="button" aria-pressed={mode === "manual"} onClick={() => setMode("manual")}>
        Pick placements
      </button>
    </div>
  );
}

/** A titled row of switch-on chips with the number of games behind each. */
function ChipSection({ title, hint, options, value, onChange, disabled }) {
  const chosen = new Set(value);
  const toggle = (id) => onChange(chosen.has(id) ? value.filter((item) => item !== id) : [...value, id]);
  return (
    <section className="wz-section">
      <h2>{title}</h2>
      {hint && <p>{hint}</p>}
      <div className="wz-chips">
        {options.map((option) => (
          <button key={option.id} type="button" className="wz-chip" aria-pressed={chosen.has(option.id)} onClick={() => toggle(option.id)} disabled={disabled}>
            {chosen.has(option.id) ? "✓ " : ""}
            {option.label} <span>{option.count}</span>
          </button>
        ))}
        {options.length === 0 && <span className="ovx-muted">No game has filled this in yet.</span>}
      </div>
    </section>
  );
}

const dayText = (date) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

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
  if (pick.kind === "asset") return { text: "Your picture for this shape", tone: "is-good" };
  if (pick.kind === "crop") return { text: creative.width && creative.height && Math.abs(creative.width / creative.height - aspect) / aspect < 0.05 ? "Your main image" : "Cropped from your image", tone: "is-good" };
  return { text: `Won't show: add a ${ratioLabel(aspect)} picture`, tone: "is-bad" };
}
