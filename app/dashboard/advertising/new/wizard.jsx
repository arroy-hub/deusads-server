"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { launchCampaign, saveDraft } from "../actions";
import { moveCreative, openCreativeEditor } from "../../creatives/actions";
import UploadDialog from "../../creatives/upload-dialog";
import CreativeEditor from "../../creatives/[id]/creative-editor";
import { FORMATS, coverageByFormat, pickImage } from "../../../../lib/formats";
import { FIELDS, PROFILE_KEYS, evaluate, labelOf, targetingSummary } from "../../../../lib/targeting";
import { addD, diff, fmtDay, todayISO } from "../../_cabinet/dates";
import { CalendarPop, DatePick, DateRange, Tip } from "../../_cabinet/ui";
import { IcCheck, IcPlus, IcWarn } from "../../_cabinet/icons";

const POPULAR_LANGUAGES = ["en", "es", "de", "fr", "ru", "pt", "zh", "ja", "ko", "it", "tr", "pl"];
const ALL_KEYS = [...PROFILE_KEYS, "exclude_genres"];
const shapeOf = (item) => ({ aspect: item?.width && item?.height ? item.width / item.height : null, safeZone: item?.safe ?? undefined });
const word = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** A titled row of switch-on chips; the number is how many registered games have that value (a hint only). */
function Chips({ title, hint, options, value, onChange, disabled, extra = null }) {
  const set = new Set(value);
  const toggle = (id) => onChange(set.has(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <section className="nw-block">
      <div className="nw-block-head"><h3>{title}</h3>{hint && <span>{hint}</span>}{value.length > 0 && <b className="nw-count">{value.length} chosen</b>}</div>
      <div className="wz-chips">
        {options.map((o) => (
          <button key={o.id} type="button" className="wz-chip" aria-pressed={set.has(o.id)} onClick={() => toggle(o.id)} disabled={disabled}>
            {set.has(o.id) ? "✓ " : ""}{o.label}{o.count > 0 && <span>{o.count}</span>}
          </button>
        ))}
      </div>
      {extra}
    </section>
  );
}

/** Which of the standard ad shapes the creative has a picture for (its own, or one the automatic crop can make). */
function shapesReady(item) {
  const c = coverageByFormat({ creative: shapeOf(item), assets: item.assets ?? [] });
  return FORMATS.map((f) => c.find((r) => r.format.id === f.id)?.kind !== "none");
}

/**
 * The new-campaign wizard: creative, who should see it, schedule, review. The campaign is chosen by audience only:
 * it books every open placement in a game that fits, now and whenever one appears, and waits when none does yet.
 * `aimable`: the database knows what each game is (migration 0018). The creative editor and the upload pop-up open
 * over the wizard, so nothing typed here is lost.
 */
export default function Wizard({ creatives: initial, campaigns, games, aimable = false, initialCampaignId = "" }) {
  const router = useRouter();
  const [library, setLibrary] = useState(initial);
  useEffect(() => setLibrary(initial), [initial]); // the server list after an upload or an editor save
  const usable = library.filter((c) => c.status !== "rejected");
  const start = campaigns.find((c) => c.id === initialCampaignId);
  const plan = start?.plan ?? null;
  const planCreative = plan?.creativeId && usable.some((c) => c.id === plan.creativeId) ? plan.creativeId : "";
  const startFilters = { genres: start?.targeting?.genres ?? [], exclude_genres: start?.targeting?.exclude_genres ?? [], platforms: start?.targeting?.platforms ?? [], languages: start?.targeting?.languages ?? [] };
  const hasStart = ALL_KEYS.some((k) => startFilters[k].length > 0);

  const [creativeId, setCreativeId] = useState(planCreative || usable[0]?.id || "");
  const [campaignId, setCampaignId] = useState(initialCampaignId); // "" = a new campaign
  const [step, setStep] = useState(!planCreative ? 1 : hasStart ? 3 : 2);
  const [uploading, setUploading] = useState(initial.length === 0);
  const [name, setName] = useState(start?.name ?? "");
  const [startMode, setStartMode] = useState("approved"); // approved | date
  const [startDate, setStartDate] = useState("");
  const [endMode, setEndMode] = useState("14"); // 7 | 14 | 30 | never | date
  const [endDate, setEndDate] = useState("");
  const [endCal, setEndCal] = useState(false);
  const endTile = useRef(null);
  const [filters, setFilters] = useState(startFilters);
  const [addingGenre, setAddingGenre] = useState(false);
  const [moreLang, setMoreLang] = useState(false);
  const [langQ, setLangQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState(null); // { data, tab } while the creative editor is open

  const chosen = usable.find((c) => c.id === creativeId);
  // The picked creative can disappear from the server list (deleted in the editor): fall back to the first one.
  useEffect(() => {
    if (creativeId && !chosen) setCreativeId(usable[0]?.id ?? "");
  }, [library]); // eslint-disable-line react-hooks/exhaustive-deps
  const today = todayISO();
  const startsOn = startMode === "date" ? startDate : "";
  const endsOn = endMode === "never" ? "" : endMode === "date" ? endDate : addD(startsOn || today, Number(endMode));
  const targeting = chosen?.targeting ?? null;
  const filtering = ALL_KEYS.some((k) => filters[k].length > 0);
  const audienceTargeting = filtering ? Object.fromEntries(ALL_KEYS.filter((k) => filters[k].length > 0).map((k) => [k, filters[k]])) : null;
  const audienceGames = aimable ? games.filter((g) => evaluate(g.profile, targeting).fits && evaluate(g.profile, audienceTargeting).fits) : games;
  const audiencePlacements = audienceGames.reduce((s, g) => s + g.placements.length, 0);
  const effectiveName = name.trim() || chosen?.name || "";
  const nameReady = Boolean(effectiveName);

  async function draft() {
    if (busy || !nameReady) return;
    setBusy(true); setError("");
    const r = await saveDraft({ campaignId: campaignId || undefined, campaignName: effectiveName, targeting: audienceTargeting, plan: { creativeId, mode: "audience", placementIds: [] } }).catch(() => ({ error: "Connection lost. Try again." }));
    setBusy(false);
    if (r?.error) return setError(r.error);
    router.push("/dashboard/advertising");
    router.refresh();
  }
  async function submit() {
    if (busy) return;
    setBusy(true); setError("");
    const r = await launchCampaign({ campaignId: campaignId || undefined, campaignName: effectiveName, creativeId, targeting: audienceTargeting, startsOn, endsOn }).catch(() => ({ error: "Connection lost. Try again." }));
    setBusy(false);
    if (r?.error) return setError(r.error);
    router.push("/dashboard/advertising");
    router.refresh();
  }

  /** The creative editor opens over the wizard (on the Audience tab when asked); the wizard stays as it is. */
  async function openEditor(tab = "picture") {
    if (!chosen || busy) return;
    setBusy(true); setError("");
    const r = await openCreativeEditor({ creativeId: chosen.id }).catch(() => ({ error: "Connection lost. Try again." }));
    setBusy(false);
    if (r?.error) return setError(r.error);
    setEditor({ data: r.editor, tab });
  }

  /** A picture was uploaded in the pop-up: it joins the library (at the top) and is picked here. */
  async function uploaded(creative) {
    const first = library[0]?.id ?? null;
    setLibrary((l) => [{ id: creative.id, name: creative.name, url: creative.url, status: "pending", approved: false, size: `${creative.width} × ${creative.height}`, width: creative.width, height: creative.height, safe: null, assets: [], targeting: null }, ...l]);
    setCreativeId(creative.id);
    if (!name.trim()) setName(creative.name);
    await moveCreative({ creativeId: creative.id, folderId: null, beforeId: first }).catch(() => null);
    router.refresh(); // the server list now holds the new creative
  }

  const countOf = (field, id) => games.filter((g) => (g.profile?.[field] ?? []).includes(id)).length;
  const optionsOf = (field, ids) => ids.map((id) => ({ id, label: labelOf(field, id), count: countOf(field, id) }));
  const genreOptions = optionsOf("genres", FIELDS.genres.options.map((o) => o.id));
  const platformOptions = optionsOf("platforms", FIELDS.platforms.options.map((o) => o.id));
  const featured = [...new Set([...POPULAR_LANGUAGES, ...filters.languages])];
  const languageOptions = optionsOf("languages", featured);
  const needle = langQ.trim().toLowerCase();
  const otherLanguages = FIELDS.languages.options.filter((o) => !featured.includes(o.id) && (!needle || o.label.toLowerCase().includes(needle)));
  const setGenres = (next) => setFilters({ ...filters, genres: next, exclude_genres: filters.exclude_genres.filter((id) => !next.includes(id)) });

  // The reach funnel on the right: how many registered games each choice keeps.
  const funnel = [];
  let running = {};
  for (const key of PROFILE_KEYS) {
    if (filters[key].length === 0) continue;
    running = { ...running, [key]: filters[key] };
    const names = filters[key].map((id) => labelOf(key, id)).join(" or ");
    funnel.push({ label: key === "genres" ? "Match your genres" : `${key === "platforms" ? "…on " : "…in "}${names}`, count: games.filter((g) => evaluate(g.profile, running).fits).length });
  }
  const excludedCount = filters.exclude_genres.length ? games.filter((g) => evaluate(g.profile, running).fits && evaluate(g.profile, { exclude_genres: filters.exclude_genres }).problems.some((p) => p.kind === "excluded")).length : 0;
  const unfilled = PROFILE_KEYS.filter((k) => filters[k].length > 0).map((k) => ({ field: k, count: games.filter((g) => (g.profile?.[k] ?? []).length === 0).length, plural: k })).filter((i) => i.count > 0);
  let widen = null;
  if (aimable && filters.genres.length > 0) {
    for (const o of genreOptions) {
      if (filters.genres.includes(o.id) || filters.exclude_genres.includes(o.id)) continue;
      const extra = games.filter((g) => evaluate(g.profile, targeting).fits && evaluate(g.profile, { ...(audienceTargeting ?? {}), genres: [...filters.genres, o.id] }).fits).length - audienceGames.length;
      if (extra > 0 && (!widen || extra > widen.extra)) widen = { id: o.id, label: o.label, extra };
    }
  }

  // How the chosen creative covers the shapes of the audience's placements (review).
  const noPicture = (aspect) => chosen && aspect && pickImage({ creative: shapeOf(chosen), assets: chosen.assets ?? [], surfaceAspect: aspect }).kind === "none";
  const reachPlacements = audienceGames.flatMap((g) => g.placements);
  const cover = chosen ? coverageByFormat({ creative: shapeOf(chosen), assets: chosen.assets ?? [] }) : [];
  const missingShapes = cover.filter((r) => r.kind === "none").map((r) => r.format.label.split(" ")[0]);
  const missingPlacements = reachPlacements.filter((p) => noPicture(p.aspect)).length;
  const coveredFormats = cover.filter((r) => r.kind !== "none").length;
  const LOOKS = { r16x9: "16:9 menu board", r1x1: "1:1 sign", r9x16: "9:16 loading screen", r3x1: "3:1 banner" };
  const looks = cover.filter((r) => LOOKS[r.format.id]).map((r) => ({ id: r.format.id, label: LOOKS[r.format.id], aspect: r.format.aspect, kind: r.kind }));

  const scheduleWord = endMode === "never" ? "Until stopped" : endMode === "date" ? (endDate ? `Until ${fmtDay(endDate)}` : "Pick a date") : `${endMode} days`;
  const lengthDays = endMode === "never" ? null : endMode === "date" ? (endDate ? diff(endDate, startsOn || today) : null) : Number(endMode);
  const previewNote = `${startsOn ? `Starts ${fmtDay(startsOn, true)}` : "Starts when the creative is approved"} · ${lengthDays != null ? `runs ${word(lengthDays, "day", "days")}` : endMode === "date" ? "pick the last day" : "runs until you stop it"}`;
  const STEPS = [
    ["Create", chosen ? chosen.name : "Pick or upload a picture"],
    ["Where", step > 2 ? word(audienceGames.length, "game", "games") : "Who should see it"],
    ["Schedule", step > 3 ? scheduleWord : "Start and end"],
    ["Review", "Check and start"],
  ];
  const nextLabel = ["Next: Where", "Next: Schedule", "Next: Review"][step - 1];
  const canNext = step === 1 ? Boolean(creativeId) && !uploading : step === 3 ? !((startMode === "date" && !startDate) || (endMode === "date" && !endDate)) : true;

  const issues = [];
  if (aimable) for (const u of unfilled) issues.push({ kind: "warn", text: `${word(u.count, "game has", "games have")} not set ${u.plural} and ${u.count === 1 ? "is" : "are"} skipped while ${u.plural} ${u.count === 1 ? "is" : "are"} chosen.` });
  if (audienceGames.length === 0) issues.push({ kind: "warn", text: "No game fits yet. You can still start: the campaign waits and begins showing by itself as soon as a matching game appears." });

  return (
    <>
      <div className="main-head wz-head">
        <div>
          <p className="ch-crumb"><Link href="/dashboard/advertising">Campaigns</Link> / New campaign</p>
          <h1>New campaign</h1>
        </div>
        <div className="wz-head-actions">
          <button type="button" className="button button-quiet" onClick={draft} disabled={busy || !nameReady} title={nameReady ? undefined : "Name the campaign first"}>Save draft</button>
          <Link href="/dashboard/advertising" className="button button-quiet">Cancel</Link>
        </div>
      </div>

      <ol className="nw-steps" aria-label="Progress" style={{ "--step": step }}>
        {STEPS.map(([label, sub], i) => {
          const n = i + 1;
          const state = step > n ? "done" : step === n ? "active" : "todo";
          return (
            <li key={label} className={`nw-step is-${state}`} aria-current={state === "active" ? "step" : undefined}>
              <span className="nw-node">{state === "done" ? <IcCheck size={16} /> : n}</span>
              <span className="nw-step-text"><small>Step {n} of 4</small><strong>{label}</strong><span>{sub}</span></span>
            </li>
          );
        })}
      </ol>

      <section className={`nw-card nw-s${step}`} style={{ "--step": step }}>
        <header className="nw-card-head">
          <div>
            <h2>{["Choose the picture to advertise with", "Choose who should see it", "Choose when it runs", "Check everything and start"][step - 1]}</h2>
            <p>{["Name the campaign and pick one of your creatives, or upload a new one.", "Pick genres, platforms and languages. Pick nothing to run in every game.", "Set the start and the end. You can extend or stop it at any time.", "Here is what you are about to start."][step - 1]}</p>
          </div>
        </header>

        {step === 1 && (
          <div className="nw-body">
            <section className="nw-panel nw-panel-name">
              {campaignId ? (
                <p className="settings-help" style={{ margin: 0 }}>Continuing <strong>{start?.name}</strong>. <button type="button" className="link-button" onClick={() => setCampaignId("")}>Start a new campaign instead</button></p>
              ) : (
                <label className="nw-field">Campaign name<input id="campaign-name" className="field nw-name-input" value={name} onChange={(e) => setName(e.target.value)} placeholder={chosen?.name ?? "Spring launch"} maxLength={120} disabled={busy} /><span className="settings-help">Only you see this name. Left empty, the creative’s name is used.</span></label>
              )}
            </section>
            <section className="nw-panel">
              <div className="nw-block-head"><h3>Creative</h3><span>{word(usable.length, "picture", "pictures")} in your library</span></div>
              <div className="nw-crs" role="radiogroup" aria-label="Creative">
                {usable.map((item) => {
                  const ready = shapesReady(item);
                  const picked = creativeId === item.id;
                  return (
                    <label key={item.id} className={`nw-cr${picked ? " is-picked" : ""}`}>
                      <input type="radio" name="creative" value={item.id} checked={picked} onChange={() => setCreativeId(item.id)} disabled={busy} />
                      <span className="nw-cr-img">{/* eslint-disable-next-line @next/next/no-img-element */}{item.url ? <img src={item.url} alt="" /> : null}<span className={`ov-pill ${item.status === "approved" ? "ov-live" : "ov-scheduled"}`}>{item.status === "approved" ? "Approved" : "In review"}</span></span>
                      <span className="nw-cr-text"><strong>{item.name}</strong><span className="ovx-muted">{[item.size, `${ready.filter(Boolean).length} of ${FORMATS.length} shapes`].filter(Boolean).join(" · ")}</span></span>
                      <span className="lib-bar" aria-hidden="true">{ready.map((r, k) => <span key={k} className={r ? "" : "is-missing"} />)}</span>
                      {picked && <button type="button" className="wz-link nw-cr-link" disabled={busy} onClick={(e) => { e.preventDefault(); openEditor(); }}>Add pictures for other shapes</button>}
                    </label>
                  );
                })}
                <button type="button" className="nw-cr is-new" onClick={() => setUploading(true)}><span className="nw-cr-plus"><IcPlus size={22} /></span><strong>Upload a new one</strong><span className="ovx-muted">PNG or JPG under 8 MB</span></button>
              </div>
              {chosen?.status === "pending" && <p className="nw-hint">In review: ads start once it is approved.</p>}
            </section>
          </div>
        )}

        {step === 2 && (
          <div className="nw-body nw-where">
            <div className="nw-where-main">
              {chosen?.targeting && aimable && <p className="audience-line" style={{ margin: 0 }}>This creative’s own audience: {targetingSummary(chosen.targeting)}. <button type="button" className="link-button" disabled={busy} onClick={() => openEditor("audience")}>Change it</button></p>}
              <div className="nw-flagrow">
                <Tip wide align="end" content={issues.length ? <>{issues.map((it, i) => <span key={i}><b>Heads-up</b> {it.text}</span>)}</> : <><b>Everything fits</b><span>{word(audienceGames.length, "game", "games")} match today. New games that fit are added automatically while the campaign runs.</span></>}>
                  <span className={`nw-flag ${issues.length ? "is-warn" : "is-ok"}`} tabIndex={0} aria-label={issues.length ? `${issues.length} notes about the audience` : "Audience is fine"}>{issues.length ? <><IcWarn size={16} /><b>{issues.length}</b></> : <IcCheck size={16} />}</span>
                </Tip>
              </div>
              <Chips title="Genres" hint="The kinds of games" options={genreOptions} value={filters.genres} onChange={setGenres} disabled={busy} />
              <section className="nw-block">
                <div className="nw-block-head"><h3>Exclude genres</h3><span>Never show in games with these genres</span></div>
                <div className="wz-chips">
                  {filters.exclude_genres.map((id) => <button key={id} type="button" className="wz-chip is-excluded" aria-pressed="true" onClick={() => setFilters({ ...filters, exclude_genres: filters.exclude_genres.filter((x) => x !== id) })}>{labelOf("genres", id)} ×</button>)}
                  <button type="button" className="wz-chip is-add" aria-expanded={addingGenre} onClick={() => setAddingGenre(!addingGenre)}>+ Add genre</button>
                </div>
                {addingGenre && <div className="wz-chips">{genreOptions.filter((o) => !filters.exclude_genres.includes(o.id)).map((o) => <button key={o.id} type="button" className="wz-chip" onClick={() => setFilters({ ...filters, exclude_genres: [...filters.exclude_genres, o.id], genres: filters.genres.filter((x) => x !== o.id) })}>{o.label}</button>)}</div>}
              </section>
              <Chips title="Platforms" options={platformOptions} value={filters.platforms} onChange={(next) => setFilters({ ...filters, platforms: next })} disabled={busy} />
              <Chips title="Languages" options={languageOptions} value={filters.languages} onChange={(next) => setFilters({ ...filters, languages: next })} disabled={busy} extra={<>
                <button type="button" className="wz-chip is-add" aria-expanded={moreLang} onClick={() => setMoreLang(!moreLang)}>+ More languages</button>
                {moreLang && <div className="wz-more"><input className="field" type="search" placeholder="Search" aria-label="Search languages" value={langQ} onChange={(e) => setLangQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && e.preventDefault()} /><div className="wz-chips">{otherLanguages.map((o) => <button key={o.id} type="button" className="wz-chip" onClick={() => setFilters({ ...filters, languages: [...filters.languages, o.id] })}>{o.label}</button>)}{otherLanguages.length === 0 && <span className="ovx-muted">Nothing found.</span>}</div></div>}
              </>} />
            </div>
            <aside className="nw-reach" aria-label="Estimated reach">
              <h3>Estimated reach</h3>
              <div className="nw-big"><span>≈</span>{audienceGames.length}<small>{audienceGames.length === 1 ? "game" : "games"}</small></div>
              <p className="ovx-muted">{aimable ? `of ${games.length} registered · about ${word(audiencePlacements, "placement", "placements")}` : "Games are not described yet."}</p>
              {funnel.length > 0 && <div className="wz-funnel">{funnel.map((row) => <div key={row.label}><div className="wz-funnel-row"><span>{row.label}</span><strong>{row.count}</strong></div><span className="wz-funnel-bar"><span style={{ width: `${games.length ? Math.round((row.count / games.length) * 100) : 0}%` }} /></span></div>)}</div>}
              {excludedCount > 0 && <p className="ovx-muted wz-skipped">Excluded by genre: {word(excludedCount, "game", "games")}.</p>}
              {widen && <div className="nw-widen"><p>Add <strong>{widen.label}</strong> to reach about {word(widen.extra, "more game", "more games")}.</p><button type="button" className="button button-quiet button-small" onClick={() => setGenres([...filters.genres, widen.id])}>Add {widen.label}</button></div>}
              <p className="nw-how">Placements rotate between advertisers. Developers can pause or block your ads in their game; you see where, and why if they gave a reason.</p>
            </aside>
          </div>
        )}

        {step === 3 && (
          <div className="nw-body">
            <div className="nw-sched-preview">
              <div className="nw-sched-dates"><DateRange start={startsOn || today} end={endsOn || null} tone="#1b8a50" size="lg" today={today} preview={previewNote} /></div>
              <dl className="nw-facts">
                <div><dt>Starts</dt><dd>{startsOn ? fmtDay(startsOn, true) : "When approved"}</dd></div>
                <div><dt>Ends</dt><dd>{endsOn ? fmtDay(endsOn, true) : endMode === "date" ? "Pick the last day" : "Until you stop it"}</dd></div>
                <div><dt>Length</dt><dd>{lengthDays != null ? word(lengthDays, "day", "days") : "Open-ended"}</dd></div>
              </dl>
            </div>
            <div className="nw-sched-cols">
              <section className="nw-block">
                <div className="nw-block-head"><h3>When to start</h3></div>
                <label className={`nw-opt${startMode === "approved" ? " is-picked" : ""}`}><input type="radio" name="start" checked={startMode === "approved"} onChange={() => setStartMode("approved")} /><span><strong>As soon as the creative is approved</strong><small>Ads begin by themselves</small></span></label>
                <label className={`nw-opt${startMode === "date" ? " is-picked" : ""}`}><input type="radio" name="start" checked={startMode === "date"} onChange={() => setStartMode("date")} /><span><strong>On a date</strong><small>Pick the first day</small></span><span className="wz-date-wrap" onClick={(e) => e.preventDefault()}><DatePick label="Start date" min={today} value={startDate} onChange={(d) => { setStartDate(d); setStartMode("date"); }} /></span></label>
              </section>
              <section className="nw-block nw-end">
                <div className="nw-block-head"><h3>How long</h3></div>
                <div className="nw-tiles">
                  {[["7", "7", "days"], ["14", "14", "days"], ["30", "30", "days"], ["never", "∞", "until I stop it"], ["date", "…", "pick a date"]].map(([key, big, cap]) => (
                    <button key={key} ref={key === "date" ? endTile : undefined} type="button" className={`nw-tile${endMode === key ? " is-picked" : ""}`} aria-pressed={endMode === key} onClick={() => { setEndMode(key); if (key === "date") setEndCal(true); }}>
                      <b>{key === "date" && endDate ? fmtDay(endDate) : big}</b><span>{key === "date" && endDate ? "ends on this day" : cap}</span>{!["never", "date"].includes(key) && <small>ends {fmtDay(addD(startsOn || today, Number(key)))}</small>}
                    </button>
                  ))}
                </div>
                <CalendarPop anchor={endTile} open={endCal} onClose={() => setEndCal(false)} value={endDate} min={startsOn || today} onChange={setEndDate} label="End date" align="end" />
              </section>
            </div>
            <p className="wz-summary"><strong>{endMode === "never" ? "Runs until you stop it" : endMode === "date" ? (endDate ? `Runs until ${fmtDay(endDate)}` : "Pick the last day") : `Runs about ${endMode} days`}</strong>{endsOn && endMode !== "never" ? ` · ends ${fmtDay(endsOn)} at the end of the day (UTC).` : "."} You can extend or stop it at any time.</p>
          </div>
        )}

        {step === 4 && (
          <div className="nw-body">
            <section className="rv-sec rv-name">
              <label className="nw-field"><span className="nw-eyebrow">Campaign name</span><input className="field nw-name-input is-xl" value={name} placeholder={chosen?.name} onChange={(e) => setName(e.target.value)} maxLength={120} disabled={busy} /><span className="settings-help">Only you see this name. Left empty, the creative’s name is used.</span></label>
            </section>
            <section className="rv-sec rv-facts" aria-label="Summary">
              <div className="rv-fact"><span className="nw-eyebrow">Estimated reach</span><div className="rv-num"><span>≈</span>{audienceGames.length}<small>{audienceGames.length === 1 ? "game" : "games"}</small></div><p>{audienceTargeting ? targetingSummary(audienceTargeting) : "No filters: any registered game can show it"}</p></div>
              <div className="rv-fact"><span className="nw-eyebrow">Placements</span><div className="rv-num">{audiencePlacements}<small>today</small></div><p>of {games.length} registered games; grows as games join</p></div>
              <div className="rv-fact"><span className="nw-eyebrow">Schedule</span><div className="rv-num">{lengthDays != null ? lengthDays : "∞"}<small>{lengthDays != null ? (lengthDays === 1 ? "day" : "days") : "until stopped"}</small></div><p>{startsOn ? `Starts ${fmtDay(startsOn)}` : "Starts when approved"}{endsOn ? ` · ends ${fmtDay(endsOn)}` : ""}</p></div>
            </section>
            <section className="rv-sec rv-looks">
              <div className="nw-hero-head"><span className="nw-eyebrow">How it will look</span><span className="ovx-muted">Your image in typical placements · {coveredFormats} of {FORMATS.length} shapes covered</span></div>
              <div className="rv-stage">
                {looks.map((look) => {
                  const h = Math.round(Math.min(180, 280 / look.aspect));
                  return (
                    <figure key={look.id}>
                      {look.kind === "none" ? <span className="wz-look is-none" style={{ aspectRatio: String(look.aspect), height: h }}>no picture</span> : <span className="wz-look" style={{ aspectRatio: String(look.aspect), height: h, backgroundImage: chosen?.url ? `url("${chosen.url}")` : undefined }} />}
                      <figcaption>{look.label}</figcaption>
                    </figure>
                  );
                })}
              </div>
            </section>
            <div className="nw-rev-cols">
              <section className="rv-sec rv-ready">
                <div className="nw-block-head"><h3>Ready to start</h3></div>
                <ul className="wz-check-list">
                  <li><span className={`wz-tick ${chosen?.status === "approved" ? "" : "is-wait"}`}>{chosen?.status === "approved" ? "✓" : "!"}</span><span>Creative <strong>{chosen?.name}</strong> {chosen?.status === "approved" ? "is approved." : "is in review. Ads start when it is approved."}</span></li>
                  <li><span className={`wz-tick ${audienceGames.length > 0 ? "" : "is-wait"}`}>{audienceGames.length > 0 ? "✓" : "!"}</span><span>{audienceGames.length > 0 ? <><strong>{audienceGames.length} of {games.length} games</strong> fit today; new ones are added automatically.</> : "No game fits yet. The campaign waits and starts showing by itself when one does."}</span></li>
                  {missingShapes.length > 0 && <li><span className="wz-tick is-wait">!</span><span>{missingShapes.length === 1 ? "One shape has" : `${missingShapes.length} shapes have`} no picture: <strong>{missingShapes.join(", ")}</strong>.{missingPlacements > 0 ? ` The ad will not show in ${missingPlacements} of ${reachPlacements.length} placements today.` : " Placements of those shapes will not show it."}</span><button type="button" className="button button-small" disabled={busy} onClick={() => openEditor()}>Add pictures</button></li>}
                  <li><span className="wz-tick">✓</span><span>{startsOn ? `Starts ${fmtDay(startsOn)}` : "Starts when the creative is approved"}, {endsOn ? `runs until ${fmtDay(endsOn)}.` : "runs until you stop it."}</span></li>
                </ul>
              </section>
            </div>
          </div>
        )}

        {error && <div className="error nw-error" role="alert">{error}</div>}

        <footer className="nw-foot">
          {step > 1 ? <button type="button" className="button nw-back" onClick={() => setStep(step - 1)} disabled={busy}>← Back</button> : <span />}
          <span className="nw-foot-mid">Step {step} of 4</span>
          <span className="nw-foot-actions">
            {step === 4 ? (
              <>
                <button type="button" className="button button-quiet" onClick={draft} disabled={busy || !nameReady}>Save as draft</button>
                <button type="button" className="button nw-next" onClick={submit} disabled={busy || !creativeId || !nameReady}>{busy ? "Starting…" : "Start campaign"}</button>
              </>
            ) : (
              <button type="button" className="button nw-next" onClick={() => { if (step === 1 && !name.trim() && chosen) setName(chosen.name); setStep(step + 1); }} disabled={!canNext || busy}>{nextLabel} →</button>
            )}
          </span>
        </footer>
      </section>

      {editor && <CreativeEditor editor={editor.data} initialTab={editor.tab} onClose={() => setEditor(null)} />}
      {uploading && <UploadDialog title="Upload a creative" lede="A PNG or JPG under 8 MB. It joins your library and is picked here." submit="Upload and pick" onClose={() => setUploading(false)} onUploaded={uploaded} />}
    </>
  );
}
