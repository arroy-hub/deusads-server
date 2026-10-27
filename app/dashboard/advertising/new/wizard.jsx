"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { launchCampaign, saveDraft, setCampaignCover } from "../actions";
import { moveCreative, openCreativeEditor } from "../../creatives/actions";
import UploadDialog from "../../creatives/upload-dialog";
import CreativeEditor from "../../creatives/[id]/creative-editor";
import CampaignCard from "../c/[campaignId]/settings/campaign-card";
import CategoryIcon from "../category-icon";
import { FORMATS, coverageByFormat, pickImage } from "../../../../lib/formats";
import { AD_CATEGORIES } from "../../../../lib/categories";
import { COVERS, COVER_MAX_BYTES } from "../../../../lib/game-cover";
import { cropToStrip } from "../../../../lib/cover-image";
import { browserClient } from "../../../../lib/supabase-browser";
import { planCreativeIds } from "../../../../lib/campaign-plan";
import { FIELDS, PROFILE_KEYS, evaluate, labelOf, targetingSummary } from "../../../../lib/targeting";
import { gamesByTier, reachedCountries, tierSummary } from "../../../../lib/country-tiers";
import { CountryAudience } from "../../country-tiers";
import { addD, diff, fmtDay, todayISO } from "../../_cabinet/dates";
import { Tip } from "../../_cabinet/ui";
import { IcCheck, IcPlus, IcWarn } from "../../_cabinet/icons";
import { navigating } from "../../_cabinet/nav";

const POPULAR_LANGUAGES = ["en", "es", "de", "fr", "ru", "pt", "zh", "ja", "ko", "it", "tr", "pl"];
const ALL_KEYS = [...PROFILE_KEYS, "exclude_genres", "exclude_countries"];
const shapeOf = (item) => ({ aspect: item?.width && item?.height ? item.width / item.height : null, safeZone: item?.safe ?? undefined });
const word = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const TITLES = ["Set up the campaign", "Choose who should see it", "Choose when it runs", "Check everything and start"];
const SUBS = [
  "Name it, pick a category and the creatives it will run. The card on the right is how it looks in your list.",
  "Pick genres, platforms, languages and countries. Pick nothing to run in every game.",
  "Set the start and the end. You can extend or stop it at any time.",
  "Here is what you are about to start.",
];
const STEP_NAMES = ["Create", "Where", "Schedule", "Review"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Calls `close` when a press lands outside `ref` while `open`. */
function useAway(open, ref, close) {
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (ref.current && !ref.current.contains(e.target)) close(); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** The month calendar of the mockup: Monday first, days before `min` are off. Days are "YYYY-MM-DD". */
function Calendar({ value, min, onPick, align = "r", label }) {
  const today = todayISO();
  const [view, setView] = useState((value || min || today).slice(0, 7));
  const [y, m] = view.split("-").map(Number);
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const go = (n) => setView(new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7));
  return (
    <div className={`nwc-cal is-${align}`} role="dialog" aria-label={label}>
      <div className="nwc-cal-head"><button type="button" aria-label="Previous month" onClick={() => go(-1)}>‹</button><span>{MONTHS[m - 1]} {y}</span><button type="button" aria-label="Next month" onClick={() => go(1)}>›</button></div>
      <div className="nwc-cal-grid">
        {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => <span key={d}>{d}</span>)}
        {Array.from({ length: lead }, (_, i) => <span key={`l${i}`} />)}
        {Array.from({ length: days }, (_, i) => {
          const day = `${view}-${String(i + 1).padStart(2, "0")}`;
          return <button key={day} type="button" disabled={Boolean(min) && day < min} className={`${day === value ? "is-sel " : ""}${day === today ? "is-today" : ""}`} onClick={() => onPick(day)}>{i + 1}</button>;
        })}
      </div>
    </div>
  );
}

/** Which of the standard ad shapes the creative has a picture for (its own, or one the automatic crop can make). */
function shapesReady(item) {
  const c = coverageByFormat({ creative: shapeOf(item), assets: item.assets ?? [] });
  return FORMATS.map((f) => c.find((r) => r.format.id === f.id)?.kind !== "none");
}

/**
 * The new-campaign wizard: category and creatives, who should see it, schedule, review. The campaign is chosen by
 * audience only: it books every open placement in a game that fits, now and whenever one appears, and waits when none
 * does yet. The card on the right is the real campaign card, drawn live; its header colour or picture is set here.
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
  const planPicked = planCreativeIds(plan).filter((id) => usable.some((c) => c.id === id));
  const startFilters = { genres: start?.targeting?.genres ?? [], exclude_genres: start?.targeting?.exclude_genres ?? [], platforms: start?.targeting?.platforms ?? [], languages: start?.targeting?.languages ?? [], countries: start?.targeting?.countries ?? [], exclude_countries: start?.targeting?.exclude_countries ?? [] };
  const hasStart = ALL_KEYS.some((k) => startFilters[k].length > 0);

  const [creativeIds, setCreativeIds] = useState(planPicked.length ? planPicked : usable[0] ? [usable[0].id] : []); // the first is the main one
  const [campaignId, setCampaignId] = useState(initialCampaignId); // "" = a new campaign
  const [step, setStep] = useState(!planPicked.length ? 1 : hasStart ? 3 : 2);
  const [uploading, setUploading] = useState(initial.length === 0);
  const [name, setName] = useState(start?.name ?? "");
  const [category, setCategory] = useState(start?.category || usable.find((c) => c.id === (planPicked[0] ?? usable[0]?.id))?.category || "games_apps");
  const [startMode, setStartMode] = useState("approved"); // approved | date
  const [startDate, setStartDate] = useState("");
  const [startCal, setStartCal] = useState(false);
  const [endMode, setEndMode] = useState("14"); // 7 | 14 | 30 | never | date
  const [endDate, setEndDate] = useState("");
  const [endCal, setEndCal] = useState(false);
  const startWrap = useRef(null);
  const endWrap = useRef(null);
  useAway(startCal, startWrap, () => setStartCal(false));
  useAway(endCal, endWrap, () => setEndCal(false));
  const [filters, setFilters] = useState(startFilters);
  const [addingGenre, setAddingGenre] = useState(false);
  const [moreLang, setMoreLang] = useState(false);
  const [langQ, setLangQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState(null); // { data, tab } while the creative editor is open

  // The header of the campaign card: a colour, or a picture that is stored once the campaign exists.
  const savedColour = start?.cover?.colourId ?? "";
  const [header, setHeader] = useState({ pick: savedColour || (start?.cover?.imageUrl ? null : COVERS[0].id), blob: null, preview: "" });
  const fileRef = useRef(null);
  useEffect(() => () => header.preview && URL.revokeObjectURL(header.preview), [header.preview]);
  const savedImage = !header.blob && header.pick === null ? start?.cover?.imageUrl ?? "" : "";
  const hasPicture = Boolean(header.preview) || Boolean(savedImage);
  const coverCss = header.preview ? `center / cover no-repeat url("${header.preview}")` : savedImage ? `center / cover no-repeat url("${savedImage}")` : (COVERS.find((item) => item.id === header.pick) ?? COVERS[0]).css;
  async function chooseCover(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/png", "image/jpeg"].includes(file.type)) return setError("Use a PNG or a JPG picture for the header.");
    if (file.size > COVER_MAX_BYTES) return setError("That picture is over 8 MB.");
    try {
      const blob = await cropToStrip(file);
      setHeader({ pick: null, blob, preview: URL.createObjectURL(blob) });
      setError("");
    } catch {
      setError("Could not read that picture.");
    }
  }
  /** Stores the header once the campaign exists. A failure here never undoes the campaign. */
  async function storeCover(id) {
    try {
      if (header.blob) {
        const db = browserClient();
        const { data } = await db.auth.getSession();
        const userId = data?.session?.user?.id;
        if (!userId) return;
        const path = `${userId}/campaign-cover-${id}-${Date.now()}.jpg`;
        const { error: uploadError } = await db.storage.from("creatives").upload(path, header.blob, { contentType: "image/jpeg", cacheControl: "31536000", upsert: false });
        if (!uploadError) await setCampaignCover({ campaignId: id, path });
      } else if (header.pick && header.pick !== savedColour) {
        await setCampaignCover({ campaignId: id, preset: header.pick });
      }
    } catch {
      /* the campaign stays; the header can be set again in its settings */
    }
  }

  const picked = creativeIds.map((id) => usable.find((c) => c.id === id)).filter(Boolean);
  const chosen = picked[0];
  // A picked creative can disappear from the server list (deleted in the editor): drop it from the choice.
  useEffect(() => {
    const left = creativeIds.filter((id) => usable.some((c) => c.id === id));
    if (left.length !== creativeIds.length) setCreativeIds(left.length ? left : usable[0] ? [usable[0].id] : []);
  }, [library]); // eslint-disable-line react-hooks/exhaustive-deps
  const today = todayISO();
  const startsOn = startMode === "date" ? startDate : "";
  const endsOn = endMode === "never" ? "" : endMode === "date" ? endDate : addD(startsOn || today, Number(endMode) - 1);
  const filtering = ALL_KEYS.some((k) => filters[k].length > 0);
  const audienceTargeting = filtering ? Object.fromEntries(ALL_KEYS.filter((k) => filters[k].length > 0).map((k) => [k, filters[k]])) : null;
  // A game fits when the campaign's audience fits it and at least one picked creative may run there.
  const creativeFits = (g) => picked.length === 0 || picked.some((c) => evaluate(g.profile, c.targeting ?? null).fits);
  const audienceGames = aimable ? games.filter((g) => creativeFits(g) && evaluate(g.profile, audienceTargeting).fits) : games;
  const audiencePlacements = audienceGames.reduce((s, g) => s + g.placements.length, 0);
  const effectiveName = name.trim() || chosen?.name || "";
  const nameReady = Boolean(effectiveName);
  const planOf = () => ({ creativeId: creativeIds[0], moreCreativeIds: creativeIds.slice(1), mode: "audience", placementIds: [] });

  async function draft() {
    if (busy || !nameReady) return;
    setBusy(true); setError("");
    const r = await saveDraft({ campaignId: campaignId || undefined, campaignName: effectiveName, category, targeting: audienceTargeting, plan: planOf() }).catch(() => ({ error: "Connection lost. Try again." }));
    if (r?.error) { setBusy(false); return setError(r.error); }
    await storeCover(r.campaignId);
    setBusy(false);
    navigating();
    router.push("/dashboard/advertising");
    router.refresh();
  }
  async function submit() {
    if (busy) return;
    setBusy(true); setError("");
    const r = await launchCampaign({ campaignId: campaignId || undefined, campaignName: effectiveName, creativeIds, category, targeting: audienceTargeting, startsOn, endsOn }).catch(() => ({ error: "Connection lost. Try again." }));
    if (r?.error) { setBusy(false); return setError(r.error); }
    await storeCover(r.id);
    setBusy(false);
    navigating();
    router.push("/dashboard/advertising");
    router.refresh();
  }

  /** The creative editor opens over the wizard (on the Audience tab when asked); the wizard stays as it is. */
  async function openEditor(tab = "picture", shape = null) {
    if (!chosen || busy) return;
    setBusy(true); setError("");
    const r = await openCreativeEditor({ creativeId: chosen.id }).catch(() => ({ error: "Connection lost. Try again." }));
    setBusy(false);
    if (r?.error) return setError(r.error);
    setEditor({ data: r.editor, tab, shape });
  }

  /** A picture was uploaded in the pop-up: it joins the library (at the top) and is picked here. */
  async function uploaded(creative) {
    const first = library[0]?.id ?? null;
    setLibrary((l) => [{ id: creative.id, name: creative.name, url: creative.url, status: "pending", approved: false, size: `${creative.width} × ${creative.height}`, width: creative.width, height: creative.height, safe: null, assets: [], targeting: null, category: "" }, ...l]);
    setCreativeIds((ids) => [...ids, creative.id]);
    if (!name.trim()) setName(creative.name);
    await moveCreative({ creativeId: creative.id, folderId: null, beforeId: first }).catch(() => null);
    router.refresh(); // the server list now holds the new creative
  }
  const toggleCreative = (id) => setCreativeIds((ids) => (ids.includes(id) ? (ids.length > 1 ? ids.filter((x) => x !== id) : ids) : [...ids, id]));

  const optionsOf = (field, ids) => ids.map((id) => ({ id, label: labelOf(field, id) }));
  const genreOptions = optionsOf("genres", FIELDS.genres.options.map((o) => o.id));
  const platformOptions = optionsOf("platforms", FIELDS.platforms.options.map((o) => o.id));
  const featured = [...new Set([...POPULAR_LANGUAGES, ...filters.languages])];
  const languageOptions = optionsOf("languages", featured);
  const needle = langQ.trim().toLowerCase();
  const otherLanguages = FIELDS.languages.options.filter((o) => !featured.includes(o.id) && (!needle || o.label.toLowerCase().includes(needle)));
  const setCountries = (next) => setFilters({ ...filters, countries: next, exclude_countries: filters.exclude_countries.filter((id) => !next.includes(id)) });
  const setGenres = (next) => setFilters({ ...filters, genres: next, exclude_genres: filters.exclude_genres.filter((id) => !next.includes(id)) });
  const toggleIn = (key, id) => (key === "genres" ? setGenres : key === "countries" ? setCountries : (next) => setFilters({ ...filters, [key]: next }))(filters[key].includes(id) ? filters[key].filter((x) => x !== id) : [...filters[key], id]);

  // The reach funnel on the right: how many registered games each choice keeps.
  const funnel = [];
  let running = {};
  for (const key of PROFILE_KEYS) {
    if (filters[key].length === 0) continue;
    running = { ...running, [key]: filters[key] };
    const names = key === "countries" ? `${tierSummary(filters.countries)} (${filters.countries.length})` : filters[key].map((id) => labelOf(key, id)).join(" or ");
    funnel.push({ label: key === "genres" ? "Match your genres" : `${key === "platforms" ? "…on " : "…in "}${names}`, count: games.filter((g) => evaluate(g.profile, running).fits).length });
  }
  const skippedBy = (key) => (filters[key].length ? games.filter((g) => evaluate(g.profile, running).fits && evaluate(g.profile, { [key]: filters[key] }).problems.some((p) => p.kind === "excluded")).length : 0);
  const excludedCount = skippedBy("exclude_genres");
  const byTier = gamesByTier(audienceGames.map((g) => g.profile), reachedCountries(filters));
  const excludedCountries = skippedBy("exclude_countries");
  const unfilled = PROFILE_KEYS.filter((k) => filters[k].length > 0).map((k) => ({ field: k, count: games.filter((g) => (g.profile?.[k] ?? []).length === 0).length, plural: k })).filter((i) => i.count > 0);
  let widen = null;
  if (aimable && filters.genres.length > 0) {
    for (const o of genreOptions) {
      if (filters.genres.includes(o.id) || filters.exclude_genres.includes(o.id)) continue;
      const extra = games.filter((g) => creativeFits(g) && evaluate(g.profile, { ...(audienceTargeting ?? {}), genres: [...filters.genres, o.id] }).fits).length - audienceGames.length;
      if (extra > 0 && (!widen || extra > widen.extra)) widen = { id: o.id, label: o.label, extra };
    }
  }

  // How the picked creatives cover the shapes of the audience's placements (review): a shape is covered when any of them has a picture for it.
  const noPicture = (aspect) => picked.length > 0 && aspect && picked.every((c) => pickImage({ creative: shapeOf(c), assets: c.assets ?? [], surfaceAspect: aspect }).kind === "none");
  const reachPlacements = audienceGames.flatMap((g) => g.placements);
  const covers = picked.map((c) => coverageByFormat({ creative: shapeOf(c), assets: c.assets ?? [] }));
  const cover = FORMATS.map((f) => {
    const rows = covers.map((cv) => cv.find((r) => r.format.id === f.id));
    const at = rows.findIndex((r) => r && r.kind !== "none");
    return { format: f, kind: at >= 0 ? rows[at].kind : "none", url: at >= 0 ? picked[at].url : "" };
  });
  const missing = cover.filter((r) => r.kind === "none").map((r) => ({ id: r.format.id, label: r.format.label.split(" ")[0] }));
  const missingPlacements = reachPlacements.filter((p) => noPicture(p.aspect)).length;
  const coveredFormats = cover.length - missing.length;
  const inReview = picked.filter((c) => c.status !== "approved");

  const lengthDays = endMode === "never" ? null : endMode === "date" ? (endDate ? diff(endDate, startsOn || today) + 1 : null) : Number(endMode);
  const nextLabel = ["Next: Where", "Next: Schedule", "Next: Review"][step - 1];
  const canNext = step === 1 ? picked.length > 0 && !uploading : step === 3 ? !((startMode === "date" && !startDate) || (endMode === "date" && !endDate)) : true;

  const issues = [];
  if (aimable) for (const u of unfilled) issues.push({ kind: "warn", text: `${word(u.count, "game has", "games have")} not set ${u.plural} and ${u.count === 1 ? "is" : "are"} skipped while ${u.plural} ${u.count === 1 ? "is" : "are"} chosen.` });
  if (audienceGames.length === 0) issues.push({ kind: "warn", text: "No game fits yet. You can still start: the campaign waits and begins showing by itself as soon as a matching game appears." });

  // What the campaign card shows (the same chips as the campaign's settings).
  const chips = [];
  for (const id of filters.genres) chips.push({ key: `g:${id}`, text: labelOf("genres", id) });
  for (const id of filters.platforms) chips.push({ key: `p:${id}`, text: labelOf("platforms", id).replace(/ \(.*\)$/, "") });
  for (const id of filters.languages) chips.push({ key: `l:${id}`, text: labelOf("languages", id) });
  for (const id of filters.countries) chips.push({ key: `c:${id}`, text: labelOf("countries", id) });
  for (const id of filters.exclude_genres) chips.push({ key: `x:${id}`, text: `not ${labelOf("genres", id)}` });
  for (const id of filters.exclude_countries) chips.push({ key: `xc:${id}`, text: `not ${labelOf("countries", id)}` });

  const scheduleLabel = (key, big, cap) => ({ big: key === "date" && endDate ? fmtDay(endDate) : big, cap: key === "date" && endDate ? "ends on this day" : cap });

  return (
    <div className="nwc">
      <div className="nwc-pg">
        <div className="nwc-pt">
          <p className="nwc-crumb"><Link href="/dashboard/advertising">Campaigns</Link> / New campaign</p>
          <h1>New campaign</h1>
        </div>
        <div className="nwc-pb">
          <button type="button" className="nwc-btn" onClick={draft} disabled={busy || !nameReady} title={nameReady ? undefined : "Name the campaign first"}>Save draft</button>
          <Link href="/dashboard/advertising" className="nwc-btn">Cancel</Link>
        </div>

        <ol className="nwc-steps" aria-label="Progress">
          {STEP_NAMES.map((label, i) => {
            const n = i + 1;
            const state = step > n ? "done" : step === n ? "on" : "todo";
            return (
              <li key={label} className={`nwc-step is-${state}`} aria-current={state === "on" ? "step" : undefined}>
                <span className="nwc-node">{state === "done" ? <IcCheck size={14} /> : n}</span>
                <strong>{label}</strong>
              </li>
            );
          })}
        </ol>

        <section className="nwc-card">
          <header className="nwc-ch">
            <h2>{TITLES[step - 1]}</h2>
            <p>{SUBS[step - 1]}</p>
          </header>

          {step === 1 && (
            <div className="nwc-body">
              <section className="nwc-panel">
                {campaignId ? (
                  <p className="nwc-hint">Continuing <strong>{start?.name}</strong>. <button type="button" className="link-button" onClick={() => setCampaignId("")}>Start a new campaign instead</button></p>
                ) : null}
                <label className="nwc-f">Campaign name<input id="campaign-name" className="nwc-in" value={name} onChange={(e) => setName(e.target.value)} placeholder={chosen?.name ?? "Spring launch"} maxLength={120} disabled={busy} /><small>Only you see this name. Left empty, the creative’s name is used.</small></label>
                <div className="nwc-bh" style={{ marginTop: 4 }}><h3>Category</h3><span>What the campaign is about. It sets the icon on the campaign card and in your list.</span></div>
                <div className="nwc-cats" role="radiogroup" aria-label="Category">
                  {AD_CATEGORIES.map((c) => (
                    <button key={c.id} type="button" role="radio" aria-checked={category === c.id} className={`nwc-cat${category === c.id ? " is-picked" : ""}`} onClick={() => setCategory(c.id)} disabled={busy}>
                      <CategoryIcon category={c.id} label={c.label} />{c.label}{c.restricted && <em>restricted</em>}
                    </button>
                  ))}
                </div>
              </section>
              <section className="nwc-panel">
                <div className="nwc-bh"><h3>Creatives</h3><span>{picked.length} selected · {word(usable.length, "picture", "pictures")} in your library · a campaign can use several</span></div>
                <div className="nwc-crs" role="group" aria-label="Creatives">
                  {usable.map((item) => {
                    const ready = shapesReady(item);
                    const on = creativeIds.includes(item.id);
                    return (
                      <label key={item.id} className={`nwc-cr${on ? " is-picked" : ""}`}>
                        <input type="checkbox" checked={on} onChange={() => toggleCreative(item.id)} disabled={busy} />
                        <span className="nwc-cr-img">{/* eslint-disable-next-line @next/next/no-img-element */}{item.url ? <img src={item.url} alt="" /> : null}<span className={`nwc-pill ${item.status === "approved" ? "is-ok" : "is-wait"}`}>{item.status === "approved" ? "Approved" : "In review"}</span></span>
                        <span className="nwc-tick" aria-hidden="true">✓</span>
                        <strong>{item.name}</strong>
                        <span className="nwc-cr-m">{[item.size, `${ready.filter(Boolean).length} of ${FORMATS.length} shapes`].filter(Boolean).join(" · ")}</span>
                        <span className="nwc-shapes" aria-hidden="true">{ready.map((r, k) => <i key={k} className={r ? "" : "is-miss"} />)}</span>
                      </label>
                    );
                  })}
                  <button type="button" className="nwc-cr is-new" onClick={() => setUploading(true)}><span className="nwc-plus"><IcPlus size={18} /></span><strong>Upload a new one</strong><span className="nwc-cr-m">PNG or JPG under 8 MB</span></button>
                </div>
                {inReview.length > 0 && <p className="nwc-hint">{inReview.length === 1 ? "One creative is" : `${inReview.length} creatives are`} in review: ads start once {inReview.length === 1 ? "it is" : "they are"} approved.</p>}
              </section>
            </div>
          )}

          {step === 2 && (
            <div className="nwc-body nwc-where">
              <div className="nwc-flag">
                <Tip wide align="end" content={issues.length ? <>{issues.map((it, i) => <span key={i}><b>Heads-up</b> {it.text}</span>)}</> : <><b>Everything fits</b><span>{word(audienceGames.length, "game", "games")} match today. New games that fit are added automatically while the campaign runs.</span></>}>
                  <span className={`nw-flag ${issues.length ? "is-warn" : "is-ok"}`} tabIndex={0} aria-label={issues.length ? `${issues.length} notes about the audience` : "Audience is fine"}>{issues.length ? <><IcWarn size={16} /><b>{issues.length}</b></> : <IcCheck size={16} />}</span>
                </Tip>
              </div>
              <div className="nwc-where-main">
                <section className="nwc-sec"><div className="nwc-bh"><h3>Genres</h3><span>The kinds of games</span></div><div className="nwc-chips">{genreOptions.map((o) => <button key={o.id} type="button" className={`nwc-chip${filters.genres.includes(o.id) ? " is-picked" : ""}`} aria-pressed={filters.genres.includes(o.id)} onClick={() => toggleIn("genres", o.id)} disabled={busy}>{o.label}</button>)}</div></section>
                <section className="nwc-sec">
                  <div className="nwc-bh"><h3>Exclude genres</h3><span>Never show in games with these genres</span></div>
                  <div className="nwc-chips">
                    {filters.exclude_genres.map((id) => <button key={id} type="button" className="nwc-chip is-excluded" aria-pressed="true" onClick={() => setFilters({ ...filters, exclude_genres: filters.exclude_genres.filter((x) => x !== id) })}>{labelOf("genres", id)} ×</button>)}
                    <button type="button" className="nwc-chip is-add" aria-expanded={addingGenre} onClick={() => setAddingGenre(!addingGenre)}>+ Add genre</button>
                  </div>
                  {addingGenre && <div className="nwc-chips">{genreOptions.filter((o) => !filters.exclude_genres.includes(o.id)).map((o) => <button key={o.id} type="button" className="nwc-chip" onClick={() => setFilters({ ...filters, exclude_genres: [...filters.exclude_genres, o.id], genres: filters.genres.filter((x) => x !== o.id) })}>{o.label}</button>)}</div>}
                </section>
                <section className="nwc-sec"><div className="nwc-bh"><h3>Platforms</h3></div><div className="nwc-chips">{platformOptions.map((o) => <button key={o.id} type="button" className={`nwc-chip${filters.platforms.includes(o.id) ? " is-picked" : ""}`} aria-pressed={filters.platforms.includes(o.id)} onClick={() => toggleIn("platforms", o.id)} disabled={busy}>{o.label}</button>)}</div></section>
                <section className="nwc-sec">
                  <div className="nwc-bh"><h3>Languages</h3></div>
                  <div className="nwc-chips">
                    {languageOptions.map((o) => <button key={o.id} type="button" className={`nwc-chip${filters.languages.includes(o.id) ? " is-picked" : ""}`} aria-pressed={filters.languages.includes(o.id)} onClick={() => toggleIn("languages", o.id)} disabled={busy}>{o.label}</button>)}
                    <button type="button" className="nwc-chip is-add" aria-expanded={moreLang} onClick={() => setMoreLang(!moreLang)}>+ More languages</button>
                  </div>
                  {moreLang && <div className="nwc-more"><input className="nwc-in" type="search" placeholder="Search" aria-label="Search languages" value={langQ} onChange={(e) => setLangQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && e.preventDefault()} /><div className="nwc-chips">{otherLanguages.map((o) => <button key={o.id} type="button" className="nwc-chip" onClick={() => setFilters({ ...filters, languages: [...filters.languages, o.id] })}>{o.label}</button>)}{otherLanguages.length === 0 && <span className="nwc-hint">Nothing found.</span>}</div></div>}
                </section>
                <section className="nwc-sec">
                  <div className="nwc-bh"><h3>Countries</h3><span>Where the game's players are</span></div>
                  <CountryAudience value={{ countries: filters.countries, exclude_countries: filters.exclude_countries }} onChange={(next) => setFilters({ ...filters, ...next })} disabled={busy} />
                </section>
              </div>
              <aside className="nwc-reach" aria-label="Estimated reach">
                <h3>Estimated reach</h3>
                <div className="nwc-big"><span>≈</span>{audienceGames.length}<small>{audienceGames.length === 1 ? "game" : "games"}</small></div>
                <p className="nwc-note">{aimable ? `of ${games.length} registered · about ${word(audiencePlacements, "placement", "placements")}` : "Games are not described yet."}</p>
                {funnel.length > 0 && (
                  <div className="nwc-fn">
                    <div><div className="nwc-fr"><span>Registered</span><b>{games.length}</b></div><span className="nwc-fb"><span style={{ width: "100%" }} /></span></div>
                    {funnel.map((row) => <div key={row.label}><div className="nwc-fr"><span>{row.label}</span><b>{row.count}</b></div><span className="nwc-fb"><span style={{ width: `${games.length ? Math.round((row.count / games.length) * 100) : 0}%` }} /></span></div>)}
                  </div>
                )}
                {aimable && audienceGames.length > 0 && (
                  <div className="nwc-fn" aria-label="Games by tier">
                    {byTier.map((row) => <div key={row.id}><div className="nwc-fr"><span>{row.label}</span><b>{word(row.games, "game", "games")}</b></div></div>)}
                  </div>
                )}
                {excludedCount > 0 && <p className="nwc-note">Excluded by genre: {word(excludedCount, "game", "games")}.</p>}
                {excludedCountries > 0 && <p className="nwc-note">Excluded by country: {word(excludedCountries, "game", "games")}.</p>}
                {widen && <div className="nwc-widen"><p>Add <strong>{widen.label}</strong> to reach about {word(widen.extra, "more game", "more games")}.</p><button type="button" className="nwc-btn" onClick={() => setGenres([...filters.genres, widen.id])}>Add {widen.label}</button></div>}
                <p className="nwc-how">Placements rotate between advertisers. Developers can pause or block your ads in their game; you see where, and why if they gave a reason.</p>
              </aside>
            </div>
          )}

          {step === 3 && (
            <div className="nwc-body">
              <dl className="nwc-prev">
                <div><dt>Starts</dt><dd>{startsOn ? fmtDay(startsOn) : "When approved"}</dd></div>
                <div><dt>Ends</dt><dd>{endsOn ? fmtDay(endsOn) : endMode === "date" ? "Pick the last day" : "Until you stop it"}</dd></div>
                <div><dt>Length</dt><dd>{lengthDays != null ? word(lengthDays, "day", "days") : "Open-ended"}</dd></div>
              </dl>
              <div className="nwc-sc">
                <section>
                  <div className="nwc-bh" style={{ marginBottom: 8 }}><h3>When to start</h3></div>
                  <div role="radiogroup" aria-label="When to start">
                    <div role="radio" aria-checked={startMode === "approved"} tabIndex={0} className={`nwc-opt${startMode === "approved" ? " is-picked" : ""}`} onClick={() => { setStartMode("approved"); setStartCal(false); }} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setStartMode("approved"))}><span className="nwc-dot" /><span><b>As soon as the creative is approved</b><small>Ads begin by themselves</small></span></div>
                    <div role="radio" aria-checked={startMode === "date"} tabIndex={0} className={`nwc-opt${startMode === "date" ? " is-picked" : ""}`} onClick={() => { setStartMode("date"); if (!startDate) setStartCal(true); }} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setStartMode("date"), !startDate && setStartCal(true))}>
                      <span className="nwc-dot" /><span><b>On a date</b><small>Pick the first day</small></span>
                      {startMode === "date" && (
                        <span className="nwc-dw" ref={startWrap} onClick={(e) => e.stopPropagation()}>
                          <button type="button" className="nwc-dbtn" aria-haspopup="dialog" aria-expanded={startCal} onClick={() => setStartCal(!startCal)}><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4m8-4v4" /></svg><span>{startDate ? fmtDay(startDate, true) : "Pick a date"}</span></button>
                          {startCal && <Calendar label="Start date" value={startDate} min={today} onPick={(d) => { setStartDate(d); if (endDate && endDate < d) setEndDate(""); setStartCal(false); }} />}
                        </span>
                      )}
                    </div>
                  </div>
                </section>
                <section>
                  <div className="nwc-bh" style={{ marginBottom: 8 }}><h3>How long</h3></div>
                  <div className="nwc-tiles">
                    {[["7", "7", "days"], ["14", "14", "days"], ["30", "30", "days"], ["never", "∞", "until I stop it"]].map(([key, big, cap]) => (
                      <button key={key} type="button" className={`nwc-tile${endMode === key ? " is-picked" : ""}`} aria-pressed={endMode === key} onClick={() => { setEndMode(key); setEndCal(false); }}>
                        <b>{big}</b><span>{cap}</span>{key !== "never" && <small>ends {fmtDay(addD(startsOn || today, Number(key) - 1))}</small>}
                      </button>
                    ))}
                    <span className="nwc-dw" style={{ display: "flex" }} ref={endWrap}>
                      <button type="button" className={`nwc-tile${endMode === "date" ? " is-picked" : ""}`} style={{ flex: 1 }} aria-pressed={endMode === "date"} aria-haspopup="dialog" onClick={() => { setEndMode("date"); setEndCal(!endCal || endMode !== "date"); }}>
                        <b>{scheduleLabel("date", "…", "pick a date").big}</b><span>{scheduleLabel("date", "…", "pick a date").cap}</span>
                      </button>
                      {endCal && <Calendar label="End date" value={endDate} min={startsOn || today} onPick={(d) => { setEndDate(d); setEndCal(false); }} />}
                    </span>
                  </div>
                </section>
              </div>
              <p className="nwc-sum"><b>{endMode === "never" ? "Runs until you stop it" : endMode === "date" ? (endDate ? `Runs until ${fmtDay(endDate)}` : "Pick the last day") : `Runs about ${endMode} days`}</b>{endsOn && endMode !== "never" ? ` · ends ${fmtDay(endsOn)} at the end of the day (UTC).` : "."} You can extend or stop it at any time.</p>
            </div>
          )}

          {step === 4 && (
            <div className="nwc-body">
              <label className="nwc-f"><span className="nwc-eb">Campaign name</span><input className="nwc-in" value={name} placeholder={chosen?.name} onChange={(e) => setName(e.target.value)} maxLength={120} disabled={busy} /><small>Only you see this name. Left empty, the creative’s name is used.</small></label>
              <div className="nwc-facts" aria-label="Summary">
                <div className="nwc-fact"><span className="nwc-eb">Estimated reach</span><div className="nwc-num">≈ {audienceGames.length}<small>{audienceGames.length === 1 ? "game" : "games"}</small></div><p>{audienceTargeting ? targetingSummary(audienceTargeting) : "No filters: any registered game can show it"}</p></div>
                <div className="nwc-fact"><span className="nwc-eb">Placements</span><div className="nwc-num">{audiencePlacements}<small>today</small></div><p>of {games.length} registered games; grows as games join</p></div>
                <div className="nwc-fact"><span className="nwc-eb">Schedule</span><div className="nwc-num">{lengthDays != null ? lengthDays : "∞"}<small>{lengthDays != null ? (lengthDays === 1 ? "day" : "days") : "until stopped"}</small></div><p>{startsOn ? `Starts ${fmtDay(startsOn)}` : "Starts when approved"}{endsOn ? ` · ends ${fmtDay(endsOn)}` : ""}</p></div>
              </div>
              <section className="nwc-panel">
                <div className="nwc-bh"><span className="nwc-eb">How it will look</span><span>Your image in each placement shape · {coveredFormats} of {FORMATS.length} covered</span></div>
                <div className="nwc-lgrid">
                  {cover.map((row) => (
                    <div key={row.format.id} className="nwc-lt">
                      <span className="nwc-lbox">
                        {row.kind === "none"
                          ? <span className="nwc-look is-none" style={{ "--a": row.format.aspect }}><button type="button" className="nwc-addpic" disabled={busy} aria-label={`Add a picture for the ${row.format.label}`} title="Add a picture for this shape" onClick={() => openEditor("picture", row.format.id)}><IcPlus size={16} /></button></span>
                          : <span className="nwc-look" style={{ "--a": row.format.aspect, backgroundImage: row.url ? `url("${row.url}")` : undefined }} />}
                      </span>
                      <b>{row.format.label.split(" ")[0]}</b>
                    </div>
                  ))}
                </div>
              </section>
              <section className="nwc-ready">
                <div className="nwc-bh"><span className="nwc-eb">Ready to start</span></div>
                <ul className="nwc-chk">
                  <li><span className={`nwc-tk ${inReview.length === 0 ? "" : "is-wait"}`}>{inReview.length === 0 ? "✓" : "!"}</span><span>{picked.length === 1 ? <>Creative <b>{chosen?.name}</b> {inReview.length === 0 ? "is approved." : "is in review. Ads start when it is approved."}</> : inReview.length === 0 ? <><b>{picked.length} creatives</b> are approved.</> : <><b>{inReview.length} of {picked.length} creatives</b> are in review. They start when approved.</>}</span></li>
                  <li><span className={`nwc-tk ${audienceGames.length > 0 ? "" : "is-wait"}`}>{audienceGames.length > 0 ? "✓" : "!"}</span><span>{audienceGames.length > 0 ? <><b>{audienceGames.length} of {games.length} games</b> fit today; new ones are added automatically.</> : "No game fits yet. The campaign waits and starts showing by itself when one does."}</span></li>
                  {missing.length > 0 && <li><span className="nwc-tk is-wait">!</span><span>{missing.length === 1 ? "One shape has" : `${missing.length} shapes have`} no picture.{missingPlacements > 0 ? ` The ad will not show in ${missingPlacements} of ${reachPlacements.length} placements today.` : " Placements of those shapes will not show it."}<span className="nwc-gaps">{missing.map((m) => <button key={m.id} type="button" className="nwc-gap" disabled={busy} title={`Add a picture for ${m.label}`} onClick={() => openEditor("picture", m.id)}><IcPlus size={12} />{m.label}</button>)}</span></span></li>}
                  <li><span className="nwc-tk">✓</span><span>{startsOn ? `Starts ${fmtDay(startsOn)}` : "Starts when the creative is approved"}, {endsOn ? `runs until ${fmtDay(endsOn)}.` : "runs until you stop it."}</span></li>
                </ul>
              </section>
            </div>
          )}

          {error && <p className="nwc-err" role="alert">{error}</p>}

          <footer className="nwc-foot">
            <button type="button" className="nwc-btn" style={{ visibility: step > 1 ? "visible" : "hidden" }} onClick={() => setStep(step - 1)} disabled={busy}>← Back</button>
            <span className="nwc-mid">Step {step} of 4</span>
            <span className="nwc-fa">
              {step === 4 ? (
                <>
                  <button type="button" className="nwc-btn is-quiet" onClick={draft} disabled={busy || !nameReady}>Save as draft</button>
                  <button type="button" className="nwc-btn is-primary" onClick={submit} disabled={busy || picked.length === 0 || !nameReady}>{busy ? "Starting…" : "Start campaign"}</button>
                </>
              ) : (
                <button type="button" className="nwc-btn is-primary" onClick={() => { if (step === 1 && !name.trim() && chosen) setName(chosen.name); setStep(step + 1); }} disabled={!canNext || busy}>{nextLabel} →</button>
              )}
            </span>
          </footer>
        </section>

        <aside className="nwc-side" aria-label="Campaign card">
          <p className="nwc-cap">Campaign card · how it looks in your list. Header colour and picture are set here, as in the campaign’s settings.</p>
          <div className="ag-left">
            <CampaignCard
              name={name || ""}
              from={startsOn}
              until={endsOn}
              status={{ key: "draft", label: "Draft" }}
              coverCss={coverCss}
              chips={chips}
              category={category}
              creatives={picked.length}
              games={audienceGames.length}
              placements={audiencePlacements}
              header={{ hasPicture, colourId: header.pick, onColour: (pick) => setHeader({ pick, blob: null, preview: "" }), onCover: () => fileRef.current?.click(), onRemoveCover: () => setHeader({ pick: COVERS[0].id, blob: null, preview: "" }) }}
            />
          </div>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg" hidden onChange={chooseCover} />
        </aside>
      </div>

      {editor && <CreativeEditor editor={editor.data} initialShape={editor.shape} onClose={() => setEditor(null)} />}
      {uploading && <UploadDialog title="Upload a creative" lede="A PNG or JPG under 8 MB. It joins your library and is picked here." submit="Upload and pick" onClose={() => setUploading(false)} onUploaded={uploaded} />}
    </div>
  );
}
