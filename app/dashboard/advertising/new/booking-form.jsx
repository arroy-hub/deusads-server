"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { launchCampaign, saveDraft } from "../actions";
import UploadForm from "../../creatives/upload-form";
import { FORMATS, coverageByFormat, formatOf, pickImage } from "../../../../lib/formats";
import { ratioLabel as rawRatio } from "../../../../lib/surface-math";
import { FIELDS, PROFILE_KEYS, evaluate, labelOf, targetingSummary } from "../../../../lib/targeting";

const STORE = "deusads-new-campaign";
const POPULAR_LANGUAGES = ["en", "es", "de", "fr", "ru", "pt", "zh", "ja", "ko", "it", "tr", "pl"];
const ALL_KEYS = [...PROFILE_KEYS, "exclude_genres"];

/** "3:1" for a standard shape, otherwise the plain ratio. */
const ratioLabel = (aspect) => {
  const id = formatOf(aspect);
  return id ? (FORMATS.find((format) => format.id === id)?.label.split(" ")[0] ?? rawRatio(aspect)) : rawRatio(aspect);
};
const dayText = (date) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const shapeOf = (item) => ({ aspect: item?.width && item?.height ? item.width / item.height : null, safeZone: item?.safe ?? undefined });

/**
 * The new-campaign wizard: creative, who should see it, schedule, review. The campaign is chosen by audience only:
 * it books every open placement in a game that fits, now and whenever one appears, and waits when none does yet.
 * `aimable`: the database knows what each game is (migration 0018).
 */
export default function BookingForm({ creatives, campaigns, games, aimable = false, initialCampaignId = "" }) {
  const router = useRouter();
  // Creatives still in review can be used: the campaign starts when the creative is approved.
  const usable = creatives.filter((item) => item.status !== "rejected");

  // A draft, or a copy of a campaign, opens where it was left: its creative, choices and audience come back.
  const start = campaigns.find((item) => item.id === initialCampaignId);
  const plan = start?.plan ?? null;
  const planCreative = plan?.creativeId && usable.some((item) => item.id === plan.creativeId) ? plan.creativeId : "";
  const startFilters = { genres: start?.targeting?.genres ?? [], exclude_genres: start?.targeting?.exclude_genres ?? [], platforms: start?.targeting?.platforms ?? [], languages: start?.targeting?.languages ?? [] };
  const hasStartFilters = ALL_KEYS.some((key) => startFilters[key].length > 0);
  const startStep = !planCreative ? 1 : hasStartFilters ? 3 : 2;

  const [creativeId, setCreativeId] = useState(planCreative || usable[0]?.id || "");
  const [campaignId, setCampaignId] = useState(initialCampaignId); // "" = a new campaign
  const [step, setStep] = useState(startStep);
  const [adding, setAdding] = useState(usable.length === 0);
  const [campaignName, setCampaignName] = useState(start?.name ?? "");
  const [startMode, setStartMode] = useState("approved"); // approved | date
  const [startDate, setStartDate] = useState("");
  const [endMode, setEndMode] = useState("14"); // 7 | 14 | 30 | never | date
  const [endDate, setEndDate] = useState("");
  const [filters, setFilters] = useState(startFilters);
  const [addingGenre, setAddingGenre] = useState(false);
  const [moreLanguages, setMoreLanguages] = useState(false);
  const [languageQuery, setLanguageQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Coming back from the creative editor: the wizard is put back as it was left.
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORE) ?? "null");
      if (!saved || !new URLSearchParams(window.location.search).has("resume")) return;
      sessionStorage.removeItem(STORE);
      setStep(saved.step ?? 1);
      setCampaignName(saved.campaignName ?? "");
      setFilters({ ...startFilters, ...(saved.filters ?? {}) });
      setStartMode(saved.startMode ?? "approved");
      setStartDate(saved.startDate ?? "");
      setEndMode(saved.endMode ?? "14");
      setEndDate(saved.endDate ?? "");
      if (saved.creativeId && usable.some((item) => item.id === saved.creativeId)) setCreativeId(saved.creativeId);
      setAdding(false);
    } catch {
      // storage can be blocked; the wizard just starts again
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chosen = usable.find((item) => item.id === creativeId);
  const today = new Date().toISOString().slice(0, 10);
  const addDays = (date, count) => {
    const base = new Date(`${date}T00:00:00Z`);
    base.setUTCDate(base.getUTCDate() + count);
    return base.toISOString().slice(0, 10);
  };
  const startsOn = startMode === "date" ? startDate : "";
  const endsOn = endMode === "never" ? "" : endMode === "date" ? endDate : addDays(startsOn || today, Number(endMode));

  // Which games the audience reaches today (information only: the campaign starts either way).
  const targeting = chosen?.targeting ?? null;
  const filtering = ALL_KEYS.some((key) => filters[key].length > 0);
  const audienceTargeting = filtering ? Object.fromEntries(ALL_KEYS.filter((key) => filters[key].length > 0).map((key) => [key, filters[key]])) : null;
  const audienceGames = aimable ? games.filter((game) => evaluate(game.profile, targeting).fits && evaluate(game.profile, audienceTargeting).fits) : games;
  const audiencePlacements = audienceGames.reduce((sum, game) => sum + game.placements.length, 0);

  const nameReady = Boolean(campaignName.trim() || chosen?.name);
  const effectiveName = campaignName.trim() || chosen?.name || "";

  function persist() {
    try {
      sessionStorage.setItem(STORE, JSON.stringify({ step, campaignName, filters, startMode, startDate, endMode, endDate, creativeId }));
    } catch {
      // not fatal
    }
  }

  /** The creative editor opens over the Creatives tab; the wizard is saved and put back when it closes. */
  function openEditor() {
    if (!chosen) return;
    persist();
    const back = `/dashboard/advertising/new?resume=1${campaignId ? `&campaign=${campaignId}` : ""}`;
    router.push(`/dashboard/creatives/${chosen.id}?back=${encodeURIComponent(back)}`);
  }

  function added(creative) {
    setCreativeId(creative.id);
    setAdding(false);
    if (!campaignName.trim()) setCampaignName(creative.name);
    setStep(2);
    router.refresh(); // the server list now holds the new creative
  }

  async function draft() {
    if (busy || !nameReady) return;
    setBusy(true);
    setError("");
    const result = await saveDraft({
      campaignId: campaignId || undefined,
      campaignName: effectiveName,
      targeting: audienceTargeting,
      plan: { creativeId, mode: "audience", placementIds: [] },
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
    const result = await launchCampaign({
      campaignId: campaignId || undefined,
      campaignName: effectiveName,
      creativeId,
      targeting: audienceTargeting,
      startsOn,
      endsOn,
    }).catch(() => ({ error: "Connection lost. Try again." }));
    setBusy(false);
    if (result?.error) return setError(result.error);
    router.push("/dashboard/advertising");
    router.refresh();
  }

  // --- Chips with the number of games behind each (a hint: every option can be chosen, games or not).
  const countOf = (field, id) => games.filter((game) => (game.profile?.[field] ?? []).includes(id)).length;
  const optionsOf = (field, ids) => ids.map((id) => ({ id, label: labelOf(field, id), count: countOf(field, id) }));
  const genreOptions = optionsOf("genres", FIELDS.genres.options.map((option) => option.id));
  const platformOptions = optionsOf("platforms", FIELDS.platforms.options.map((option) => option.id));
  const featured = [...new Set([...POPULAR_LANGUAGES, ...filters.languages])];
  const languageOptions = optionsOf("languages", featured);
  const needle = languageQuery.trim().toLowerCase();
  const otherLanguages = FIELDS.languages.options.filter((option) => !featured.includes(option.id) && (!needle || option.label.toLowerCase().includes(needle)));
  const setGenres = (next) => setFilters({ ...filters, genres: next, exclude_genres: filters.exclude_genres.filter((id) => !next.includes(id)) });

  // --- The reach funnel on the right: how many registered games each choice keeps.
  const funnel = [];
  let running = {};
  for (const key of PROFILE_KEYS) {
    if (filters[key].length === 0) continue;
    running = { ...running, [key]: filters[key] };
    const names = filters[key].map((id) => labelOf(key, id)).join(" or ");
    funnel.push({ label: key === "genres" ? "Match your genres" : `${key === "platforms" ? "...on " : "...in "}${names}`, count: games.filter((game) => evaluate(game.profile, running).fits).length });
  }
  const excludedCount = filters.exclude_genres.length
    ? games.filter((game) => evaluate(game.profile, running).fits && evaluate(game.profile, { exclude_genres: filters.exclude_genres }).problems.some((problem) => problem.kind === "excluded")).length
    : 0;
  const FIELD_WORDS = { genres: ["a genre", "genres"], platforms: ["a platform", "platforms"], languages: ["a language", "languages"] };
  const unfilled = PROFILE_KEYS.filter((key) => filters[key].length > 0)
    .map((key) => ({ field: key, count: games.filter((game) => (game.profile?.[key] ?? []).length === 0).length, plural: FIELD_WORDS[key][1] }))
    .filter((item) => item.count > 0);
  let widen = null;
  if (aimable && filters.genres.length > 0) {
    for (const option of genreOptions) {
      if (filters.genres.includes(option.id) || filters.exclude_genres.includes(option.id)) continue;
      const extra = games.filter((game) => evaluate(game.profile, targeting).fits && evaluate(game.profile, { ...(audienceTargeting ?? {}), genres: [...filters.genres, option.id] }).fits).length - audienceGames.length;
      if (extra > 0 && (!widen || extra > widen.extra)) widen = { id: option.id, label: option.label, extra };
    }
  }

  // --- How the chosen creative covers the shapes of the audience's placements (review).
  const noPicture = (aspect) => chosen && aspect && pickImage({ creative: shapeOf(chosen), assets: chosen.assets ?? [], surfaceAspect: aspect }).kind === "none";
  const reachPlacements = audienceGames.flatMap((game) => game.placements);
  const missingShapes = chosen ? coverageByFormat({ creative: shapeOf(chosen), assets: chosen.assets ?? [] }).filter((row) => row.kind === "none").map((row) => row.format.label.split(" ")[0]) : [];
  const missingPlacements = reachPlacements.filter((placement) => noPicture(placement.aspect)).length;
  const coveredFormats = chosen ? coverageByFormat({ creative: shapeOf(chosen), assets: chosen.assets ?? [] }).filter((row) => row.kind !== "none").length : 0;
  const LOOKS = { r16x9: "16:9 menu", r1x1: "1:1 sign", r9x16: "9:16 loading", r3x1: "3:1 banner" };
  const looks = chosen
    ? coverageByFormat({ creative: shapeOf(chosen), assets: chosen.assets ?? [] })
        .filter((row) => LOOKS[row.format.id])
        .map((row) => ({ id: row.format.id, label: LOOKS[row.format.id], aspect: row.format.aspect, kind: row.kind }))
    : [];
  const scheduleWord = endMode === "never" ? "Until stopped" : endMode === "date" ? (endDate ? `Until ${dayText(endDate)}` : "Pick a date") : `${endMode} days`;
  const reachWord = (count) => `${count} ${count === 1 ? "game" : "games"}`;

  const STEPS = [
    ["Creative", chosen ? chosen.name : "Pick or upload"],
    ["Where", step > 2 ? reachWord(audienceGames.length) : "Who should see it"],
    ["Schedule", step > 3 ? scheduleWord : "Start and end"],
    ["Review", "Check and start"],
  ];

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
          <button type="button" className="button button-quiet" onClick={draft} disabled={busy || !nameReady} title={nameReady ? undefined : "Name the campaign first"}>
            Save draft
          </button>
          <Link href="/dashboard/advertising" className="button button-quiet">
            Cancel
          </Link>
        </div>
      </div>

      <ol className="wz-steps" aria-label="Steps">
        {STEPS.map(([label, sub], index) => (
          <li key={label} aria-current={step === index + 1 ? "step" : undefined} className={step > index + 1 ? "is-done" : undefined}>
            <span className="wz-dot">{step > index + 1 ? "✓" : index + 1}</span>
            <span className="wz-step-text">
              <strong>{label}</strong>
              <span>{sub}</span>
            </span>
          </li>
        ))}
      </ol>

      {step === 1 && (
        <section className="wz-card wz-narrow wz-compact">
          {campaignId ? (
            <p className="settings-help">
              Continuing <strong>{start?.name}</strong>.{" "}
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
          </div>

          {adding ? (
            <div className="wz-upload">
              <UploadForm embedded onUploaded={added} />
            </div>
          ) : (
            <div className="wz-creatives" role="radiogroup" aria-label="Creative">
              {usable.map((item) => {
                const covered = coverageByFormat({ creative: shapeOf(item), assets: item.assets ?? [] }).filter((row) => row.kind !== "none").length;
                const picked = creativeId === item.id;
                return (
                  <label key={item.id} className={`wz-creative${picked ? " is-picked" : ""}`}>
                    <input type="radio" name="creative" value={item.id} checked={picked} onChange={() => setCreativeId(item.id)} disabled={busy} />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {item.url ? <img className="wz-thumb" src={item.url} alt="" /> : <span className="wz-thumb" />}
                    <span className="wz-creative-text">
                      <strong>{item.name}</strong>
                      <span className="ovx-muted">{[item.size, `${covered} of ${FORMATS.length} shapes`].filter(Boolean).join(" · ")}</span>
                    </span>
                    {picked && (
                      <button type="button" className="wz-link" onClick={(event) => { event.preventDefault(); openEditor(); }} disabled={busy}>
                        Add pictures for other shapes
                      </button>
                    )}
                    <span className={`ov-pill ${item.status === "approved" ? "ov-live" : "ov-scheduled"}`}>{item.status === "approved" ? "Approved" : "In review"}</span>
                  </label>
                );
              })}
            </div>
          )}

          <div className="wz-foot">
            <span className="ovx-hint">{chosen?.status === "pending" && !adding ? "In review: ads start once it is approved." : ""}</span>
            <span className="wz-foot-actions">
              <button type="button" className="button" onClick={() => { if (!campaignName.trim() && chosen) setCampaignName(chosen.name); setStep(2); }} disabled={!creativeId || adding || busy}>
                Next
              </button>
            </span>
          </div>
        </section>
      )}

      {step === 2 && (
        <div className="wz-grid">
          <section className="wz-card">
            {!campaignId && (
              <label className="wz-label" htmlFor="campaign-name-2">
                Campaign name
                <input id="campaign-name-2" className="field wz-name" value={campaignName} onChange={(event) => setCampaignName(event.target.value)} maxLength={120} disabled={busy} />
              </label>
            )}
            {chosen?.targeting && aimable && (
              <p className="audience-line">
                This creative’s own audience: {targetingSummary(chosen.targeting)}. <Link href={`/dashboard/creatives/${chosen.id}`}>Change it</Link>
              </p>
            )}
            <ChipSection title="Genres" hint="Pick the kinds of games. Pick nothing to run in every game." options={genreOptions} value={filters.genres} onChange={setGenres} disabled={busy} />
            <section className="wz-section">
              <h2>Exclude genres</h2>
              <p>Never show in games with these genres, even if they match above.</p>
              <div className="wz-chips">
                {filters.exclude_genres.map((id) => (
                  <button key={id} type="button" className="wz-chip is-excluded" aria-pressed="true" onClick={() => setFilters({ ...filters, exclude_genres: filters.exclude_genres.filter((item) => item !== id) })} disabled={busy}>
                    {labelOf("genres", id)} ×
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
                        {option.label}
                      </button>
                    ))}
                </div>
              )}
            </section>
            <ChipSection title="Platforms" options={platformOptions} value={filters.platforms} onChange={(next) => setFilters({ ...filters, platforms: next })} disabled={busy} />
            <ChipSection
              title="Languages"
              options={languageOptions}
              value={filters.languages}
              onChange={(next) => setFilters({ ...filters, languages: next })}
              disabled={busy}
              extra={
                <>
                  <button type="button" className="wz-chip is-add" aria-expanded={moreLanguages} onClick={() => setMoreLanguages(!moreLanguages)} disabled={busy}>
                    + More languages
                  </button>
                  {moreLanguages && (
                    <div className="wz-more">
                      <input className="field" type="search" placeholder="Search" aria-label="Search languages" value={languageQuery} onChange={(event) => setLanguageQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && event.preventDefault()} />
                      <div className="wz-chips">
                        {otherLanguages.map((option) => (
                          <button key={option.id} type="button" className="wz-chip" onClick={() => setFilters({ ...filters, languages: [...filters.languages, option.id] })} disabled={busy}>
                            {option.label}
                          </button>
                        ))}
                        {otherLanguages.length === 0 && <span className="ovx-muted">Nothing found.</span>}
                      </div>
                    </div>
                  )}
                </>
              }
            />
            {aimable &&
              unfilled.map((item) => (
                <p className="wz-warn" role="status" key={item.field}>
                  <span aria-hidden="true">!</span>
                  {item.count} {item.count === 1 ? "game has" : "games have"} not set {item.plural} and {item.count === 1 ? "is" : "are"} skipped while {item.plural} {item.count === 1 ? "is" : "are"} chosen.
                </p>
              ))}
            <div className="wz-foot">
              <button type="button" className="button button-quiet" onClick={() => setStep(1)} disabled={busy}>
                ← Creative
              </button>
              <span className="wz-foot-actions">
                <button type="button" className="button" onClick={() => setStep(3)} disabled={busy}>
                  Next: Schedule →
                </button>
              </span>
            </div>
          </section>

          <aside className="wz-aside" aria-label="Summary">
            <section className="wz-side">
              <h2>Estimated reach</h2>
              <div className="wz-big">
                <span aria-hidden="true">≈</span> {audienceGames.length} <small>{audienceGames.length === 1 ? "game" : "games"}</small>
              </div>
              <p className="ovx-muted">
                {aimable ? `of ${games.length} registered · about ${audiencePlacements} ${audiencePlacements === 1 ? "placement" : "placements"}` : "Games are not described yet."}
              </p>
              {audienceGames.length === 0 && <p className="wz-note-box">No game fits yet. You can still start: the campaign waits and begins showing by itself as soon as a matching game appears.</p>}
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
              {excludedCount > 0 && <p className="ovx-muted wz-skipped">Excluded by genre: {reachWord(excludedCount)}.</p>}
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
              <p>New games that fit are added automatically while the campaign runs.</p>
              <p>Placements rotate between advertisers. Developers can pause or block your ads in their game; you see where, and why if they gave a reason.</p>
            </section>
          </aside>
        </div>
      )}

      {step === 3 && (
        <section className="wz-card wz-schedule">
          <div className="wz-schedule-grid">
            <div className="wz-section wz-col">
              <h2>Start</h2>
              <label className={`wz-radio${startMode === "approved" ? " is-picked" : ""}`}>
                <input type="radio" name="start" checked={startMode === "approved"} onChange={() => setStartMode("approved")} disabled={busy} />
                <span>As soon as the creative is approved</span>
              </label>
              <label className={`wz-radio${startMode === "date" ? " is-picked" : ""}`}>
                <input type="radio" name="start" checked={startMode === "date"} onChange={() => setStartMode("date")} disabled={busy} />
                <span>On a date</span>
                <input className="field wz-date" type="date" min={today} value={startDate} onChange={(event) => { setStartDate(event.target.value); setStartMode("date"); }} disabled={busy} aria-label="Start date" />
              </label>
            </div>
            <div className="wz-section wz-col">
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
          </div>
          <p className="wz-summary">
            <strong>{endMode === "never" ? "Runs until you stop it" : endMode === "date" ? (endDate ? `Runs until ${dayText(endDate)}` : "Pick the last day") : `Runs about ${endMode} days`}</strong>
            {endsOn && endMode !== "never" ? ` · ends ${dayText(endsOn)} at the end of the day (UTC).` : "."} You can extend or stop it at any time.
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
                  <span className={`wz-tick ${audienceGames.length > 0 ? "" : "is-wait"}`} aria-hidden="true">{audienceGames.length > 0 ? "✓" : "!"}</span>
                  <span>
                    {audienceTargeting ? `Audience: ${targetingSummary(audienceTargeting)}. ` : "Audience: every game. "}
                    {audienceGames.length > 0 ? (
                      <>
                        <strong>{audienceGames.length} of {games.length} games</strong> fit today; new ones are added automatically.
                      </>
                    ) : (
                      "No game fits yet. The campaign waits and starts showing by itself when one does."
                    )}
                  </span>
                </li>
                {missingShapes.length > 0 && (
                  <li>
                    <span className="wz-tick is-wait" aria-hidden="true">!</span>
                    <span>
                      {missingShapes.length === 1 ? "One shape has" : `${missingShapes.length} shapes have`} no picture: <strong>{missingShapes.join(", ")}</strong>.
                      {missingPlacements > 0 ? ` The ad will not show in ${missingPlacements} of ${reachPlacements.length} placements today.` : " Placements of those shapes will not show it."}
                    </span>
                    <button type="button" className="button button-small" onClick={openEditor} disabled={busy}>
                      Add pictures
                    </button>
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
                <span className="ovx-muted">Your image in typical placements · {coveredFormats} of {FORMATS.length} shapes covered</span>
              </div>
              <div className="wz-looks">
                {looks.map((look) => (
                  <figure key={look.id}>
                    {look.kind === "none" ? (
                      <span className="wz-look is-none" style={{ aspectRatio: String(look.aspect), height: 90 }}>
                        no picture
                      </span>
                    ) : (
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
                <span aria-hidden="true">≈</span> {audienceGames.length} <small>{audienceGames.length === 1 ? "game" : "games"}</small>
              </div>
              <p className="ovx-muted">{audiencePlacements} {audiencePlacements === 1 ? "placement" : "placements"} today. Based on the current catalog; it grows as games join.</p>
            </section>
            {error && (
              <div className="error" role="alert">
                {error}
              </div>
            )}
            <button type="button" className="button wz-wide" onClick={submit} disabled={busy || !creativeId || !nameReady}>
              {busy ? "Starting…" : "Start campaign"}
            </button>
            <button type="button" className="button button-quiet wz-wide" onClick={draft} disabled={busy || !nameReady}>
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

/** A titled row of switch-on chips; the number is how many registered games have that value (a hint only). */
function ChipSection({ title, hint, options, value, onChange, disabled, extra = null }) {
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
            {option.label}
            {option.count > 0 && <span>{option.count}</span>}
          </button>
        ))}
      </div>
      {extra}
    </section>
  );
}
