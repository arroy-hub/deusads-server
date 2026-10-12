"use client";

import { useEffect, useMemo, useState } from "react";
import { AD_CATEGORIES, categoryLabel } from "../../../../lib/categories";
import { blockedCategories, campaignState, controlMap, planChange } from "../../../../lib/game-controls";
import {
  PERIODS,
  STATS_DAYS,
  addTotals,
  averageText,
  buildChart,
  dayLabel,
  fit,
  number,
  totalsFor,
} from "../../../../lib/campaigns-view";
import { changeAds, markSeen, setCategoryBlocked } from "./campaign-actions";

const PILL = {
  active: ["p-active", "Active"],
  paused: ["p-paused", "Paused"],
  blocked: ["p-blocked", "Blocked"],
  blockedcat: ["p-blocked", "Blocked · category"],
  blockedadv: ["p-blocked", "Blocked · advertiser"],
  mixed: ["p-paused", "Partly active"],
  waiting: ["p-off", "Waiting"],
  ended: ["p-ended", "Ended"],
};
const ROW_CLASS = { paused: "s-paused", blocked: "s-blocked", ended: "s-ended", blockedcat: "s-inactive", blockedadv: "s-inactive" };
const isBlocked = (key) => key === "blocked" || key === "blockedcat" || key === "blockedadv";

const REASONS = ["Not suitable for my audience", "Low quality creative", "Competitor", "Misleading or inappropriate", "Other"];
const SENSITIVE = ["alcohol_tobacco", "gambling", "dating_adult"];
const STATUS_FILTERS = [["all", "All"], ["new", "New"], ["active", "Active"], ["paused", "Paused"], ["blocked", "Blocked"], ["ended", "Ended"]];
const AVATARS = ["#d94625", "#3b6fb6", "#2f9e8f", "#b8862b", "#8a63b8", "#c2527a"];

const ICON_PATHS = {
  games_apps: "M6 11h4M8 9v4M15 12h.01M18 10h.01M17.3 5H6.7a4 4 0 00-3.9 3.2L2 15a3 3 0 005.3 2l1.2-2h7l1.2 2A3 3 0 0022 15l-.8-6.8A4 4 0 0017.3 5z",
  entertainment: "M12 21a9 9 0 100-18 9 9 0 000 18zM10 8.5l5 3.5-5 3.5z",
  food_drink: "M5 8h12v6a5 5 0 01-5 5H10a5 5 0 01-5-5V8zM17 10h2a2 2 0 010 4h-2M8 3v2M12 3v2",
  retail: "M5 8h14l-1 12H6L5 8zM9 8a3 3 0 016 0",
  tech: "M4 5h16v11H4zM9 20h6M12 16v4",
  finance: "M12 21a9 9 0 100-18 9 9 0 000 18zM14.5 9.5c-.5-1-1.5-1.5-2.5-1.5-1.4 0-2.5.8-2.5 2s1 1.7 2.5 2 2.5.8 2.5 2-1.1 2-2.5 2c-1 0-2-.5-2.5-1.5M12 6.5V8M12 16v1.5",
  health_fitness: "M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z",
  education: "M2 9l10-5 10 5-10 5-10-5zM6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5",
  travel: "M21 3L3 10l7 3 3 7 8-17z",
  auto: "M5 16V11l2-5h10l2 5v5M3 16h18M7 19v-3M17 19v-3M7 13h.01M17 13h.01",
  alcohol_tobacco: "M7 3h10l-1 7a4 4 0 01-8 0L7 3zM12 14v7M8 21h8",
  gambling: "M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2zM8 8h.01M16 8h.01M12 12h.01M8 16h.01M16 16h.01",
  dating_adult: "M21 12a8 8 0 01-11.5 7.2L3 21l1.8-5.5A8 8 0 1121 12z",
  other: "M5 12h.01M12 12h.01M19 12h.01",
};
const DESCRIPTION = {
  games_apps: "Mobile and PC games, game launchers, and app installs.",
  entertainment: "Streaming, films, music, TV, news and publishing.",
  food_drink: "Restaurants, delivery, snacks, soft drinks and groceries.",
  retail: "Online shops, fashion, marketplaces and consumer goods.",
  tech: "Gadgets, audio gear, software, VR headsets and accessories.",
  finance: "Banks, cards, loans, investing, trading and crypto services.",
  health_fitness: "Gyms, fitness apps, supplements, wellness and medical services.",
  education: "Courses, schools, language apps and learning platforms.",
  travel: "Airlines, hotels, tours, booking sites and car rental.",
  auto: "Cars, motorbikes, dealers, car sharing and car services.",
  alcohol_tobacco: "Sensitive. Beer, wine, spirits, vaping and tobacco brands.",
  gambling: "Sensitive. Casinos, sports betting, lotteries and poker.",
  dating_adult: "Sensitive. Dating apps and content for adults.",
  other: "Anything that does not fit the categories above.",
};

function iconStyle(category) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${ICON_PATHS[category] ?? ICON_PATHS.other}"/></svg>`;
  const url = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  return { WebkitMaskImage: url, maskImage: url };
}

const PauseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 5v14M15 5v14" /></svg>
);
const BlockIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8" /><path d="M6.5 6.5l11 11" /></svg>
);
const CaretIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 2l4 4-4 4" /></svg>
);

const csvCell = (value) => {
  let text = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`; // a spreadsheet must not run a name as a formula
  return `"${text.replace(/"/g, '""')}"`;
};

const colorOfName = (name) => AVATARS[name.split("").reduce((n, ch) => n + ch.charCodeAt(0), 0) % AVATARS.length];

export default function CampaignsTab({ gameId, model }) {
  const { days } = model;
  const [controls, setControls] = useState(model.controls);
  const [categoryRows, setCategoryRows] = useState(model.categoryRows);
  const [recent, setRecent] = useState(model.recent);
  const [cleared, setCleared] = useState({});
  const [busy, setBusy] = useState(false);

  const [view, setView] = useState("camp");
  const [period, setPeriod] = useState(30);
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState("new");
  const [query, setQuery] = useState("");
  const [advQuery, setAdvQuery] = useState("");
  const [selected, setSelected] = useState({});
  const [open, setOpen] = useState({});
  const [openAdv, setOpenAdv] = useState({});
  const [zoomId, setZoomId] = useState(null);
  const [chartMode, setChartMode] = useState("all");
  const [pick, setPick] = useState({});
  const [flash, setFlash] = useState(null);
  const [note, setNote] = useState(null);
  const [toast, setToast] = useState("");
  const [dialog, setDialog] = useState(null);

  const ctx = useMemo(() => ({ controls: controlMap(controls), blocked: blockedCategories(categoryRows) }), [controls, categoryRows]);

  useEffect(() => {
    if (!flash) return;
    document.getElementById(`cp-${flash}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [flash]);

  // Every campaign with its state and figures for the chosen period.
  const campaigns = useMemo(() => {
    return model.campaigns.map((campaign) => {
      const state = campaignState({ campaignId: campaign.id, advertiserId: campaign.advertiserId, category: campaign.category, base: campaign.base }, ctx);
      const creatives = campaign.creatives.map((creative) => {
        const own = ctx.controls.get(`creative:${creative.id}`);
        return { ...creative, isNew: creative.isNew && !cleared[creative.id], blocked: own?.state === "blocked", reason: own?.reason ?? "", totals: totalsFor(creative.figures, period) };
      });
      return {
        ...campaign,
        isNew: campaign.isNew && !cleared[campaign.id],
        state,
        creatives,
        totals: addTotals(creatives.map((creative) => creative.totals)),
        startedAt: Date.parse(campaign.started) || 0,
      };
    });
  }, [model.campaigns, ctx, period, cleared]);

  const anyNew = (campaign) => campaign.isNew || campaign.creatives.some((creative) => creative.isNew);
  const byId = useMemo(() => new Map(campaigns.map((campaign) => [campaign.id, campaign])), [campaigns]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = campaigns.filter((campaign) => {
      const key = campaign.state.key;
      if (status === "new" && !anyNew(campaign)) return false;
      if (status === "active" && key !== "active") return false;
      if (status === "paused" && key !== "paused") return false;
      if (status === "blocked" && !isBlocked(key)) return false;
      if (status === "ended" && key !== "ended") return false;
      if (category !== "all" && campaign.category !== category) return false;
      if (q && `${campaign.name} ${campaign.advertiser}`.toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    list.sort((a, b) => {
      if (sort === "imp") return b.totals.views - a.totals.views;
      if (sort === "impasc") return a.totals.views - b.totals.views;
      if (sort === "cat") return categoryLabel(a.category).localeCompare(categoryLabel(b.category));
      if (sort === "catdesc") return categoryLabel(b.category).localeCompare(categoryLabel(a.category));
      if (sort === "adv") return a.advertiser.localeCompare(b.advertiser);
      if (sort === "advdesc") return b.advertiser.localeCompare(a.advertiser);
      if (sort === "old") return a.startedAt - b.startedAt;
      return (anyNew(b) ? 1 : 0) - (anyNew(a) ? 1 : 0) || b.startedAt - a.startedAt;
    });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaigns, status, category, query, sort]);

  const advertisers = useMemo(() => {
    const groups = new Map();
    for (const campaign of campaigns) {
      if (!groups.has(campaign.advertiserId)) groups.set(campaign.advertiserId, { id: campaign.advertiserId, name: campaign.advertiser, campaigns: [] });
      groups.get(campaign.advertiserId).campaigns.push(campaign);
    }
    return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [campaigns]);

  const counts = {
    newCampaigns: campaigns.filter(anyNew).length,
    newAdvertisers: advertisers.filter((group) => group.campaigns.some(anyNew)).length,
  };
  const live = campaigns.filter((campaign) => campaign.state.key === "active");
  const totals = addTotals(campaigns.map((campaign) => campaign.totals));
  const brandNew = campaigns.filter((campaign) => campaign.isNew).length;
  const freshCreatives = campaigns.filter((campaign) => !campaign.isNew && campaign.creatives.some((creative) => creative.isNew)).length;
  const newLine = [
    brandNew ? `${brandNew} new ${brandNew === 1 ? "campaign" : "campaigns"}` : "",
    freshCreatives ? `${freshCreatives} new ${freshCreatives === 1 ? "creative" : "creatives"} in an existing campaign` : "",
  ].filter(Boolean).join(" · ");

  const selectedIds = Object.keys(selected).filter((id) => selected[id] && byId.has(id));

  // ------------------------------------------------------------------ changes
  const stateOfControl = (scope, id) => ctx.controls.get(`${scope}:${id}`)?.state ?? "free";
  const anchorsFor = (scope, ids) => {
    if (scope === "campaign") return { campaigns: ids, advertisers: [] };
    if (scope === "advertiser") return { campaigns: [], advertisers: ids };
    return { campaigns: campaigns.filter((campaign) => campaign.creatives.some((creative) => ids.includes(creative.id))).map((campaign) => campaign.id), advertisers: [] };
  };

  // Would this single change be refused for changing too often? Asked before a dialog opens.
  function refusal(scope, id, action, name) {
    const plan = planChange({ action, scope, targets: [{ id, state: stateOfControl(scope, id) }], recent });
    if (plan.apply.length) return null;
    if (plan.limited.length) return `Try again later. The status of ${name} was already changed 2 times in the last hour.`;
    return null;
  }

  async function run({ scope, action, ids, reason = "", comment = "", extra = "" }) {
    if (busy) return;
    setBusy(true);
    const anchors = anchorsFor(scope, ids);
    try {
      const result = await changeAds({ gameId, scope, action, ids, reason, comment });
      if (result.error) {
        setToast(result.error);
        return;
      }
      if (result.applied.length) {
        const gone = new Set(result.applied);
        setControls((previous) => {
          const rest = previous.filter((row) => !(row.scope === scope && gone.has(row.target_id)));
          if (action === "pause" || action === "block") {
            return [...rest, ...result.applied.map((id) => ({ scope, target_id: id, state: action === "pause" ? "paused" : "blocked", reason: result.reason, comment: result.comment }))];
          }
          return rest;
        });
        setRecent((previous) => [...previous, ...result.logged]);
      }
      setNote({ ...anchors, text: result.message + extra, warn: result.applied.length === 0 });
    } catch {
      setToast("Could not save the change. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const campaignAction = (campaign, action) => run({ scope: "campaign", action, ids: [campaign.id] });

  function askBlock(scope, id, name, details) {
    const message = refusal(scope, id, "block", name);
    const anchors = anchorsFor(scope, [id]);
    if (message) {
      setNote({ ...anchors, text: message, warn: true });
      return;
    }
    setDialog({ scope, ids: [id], reason: REASONS[0], comment: "", ...details });
  }

  function bulk(action) {
    const eligible = selectedIds.filter((id) => {
      const key = byId.get(id).state.key;
      if (action === "pause") return key === "active" || key === "waiting";
      if (action === "resume") return key === "paused";
      if (action === "unblock") return key === "blocked";
      return key !== "ended" && key !== "blocked";
    });
    const skipped = selectedIds.length - eligible.length;
    if (!eligible.length) {
      setNote({ campaigns: selectedIds, advertisers: [], text: "Nothing changed: these campaigns are already in this state. Repeated requests are not saved.", warn: true });
      return;
    }
    const tail = skipped ? ` ${skipped} already in this state, not saved again.` : "";
    if (action === "block") {
      setDialog({ scope: "selected", ids: eligible, reason: REASONS[0], comment: "", tail });
      return;
    }
    run({ scope: "campaign", action, ids: eligible, extra: tail });
    setSelected({});
  }

  async function confirmBlock() {
    const d = dialog;
    setDialog(null);
    const scope = d.scope === "selected" ? "campaign" : d.scope;
    await run({ scope, action: "block", ids: d.ids, reason: d.reason, comment: d.comment, extra: d.tail ?? "" });
    if (d.scope === "selected") setSelected({});
  }

  async function toggleCategory(id) {
    if (busy) return;
    setBusy(true);
    try {
      const want = !ctx.blocked.has(id);
      const result = await setCategoryBlocked({ gameId, category: id, blocked: want });
      if (result.error) {
        setToast(result.error);
        return;
      }
      if (result.changed) setCategoryRows((previous) => [...previous.filter((row) => row.category !== id), { category: id, blocked: want }]);
      setToast(result.message);
    } catch {
      setToast("Could not save the category. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function toggleOpen(campaign) {
    const opening = !open[campaign.id];
    setOpen({ ...open, [campaign.id]: opening });
    if (opening && anyNew(campaign)) {
      const ids = campaign.creatives.filter((creative) => creative.isNew).map((creative) => creative.id);
      setCleared((previous) => ({ ...previous, [campaign.id]: true, ...Object.fromEntries(ids.map((id) => [id, true])) }));
      markSeen({ gameId, campaignId: campaign.id, creativeIds: campaign.creatives.map((creative) => creative.id) }).catch(() => {});
    }
  }

  function openInCampaigns(campaign) {
    setView("camp");
    setStatus("all");
    setCategory("all");
    setQuery("");
    setNote(null);
    setFlash(campaign.id);
    if (!open[campaign.id]) toggleOpen(campaign);
  }

  function exportCsv() {
    const rows = [["Campaign", "Advertiser", "Category", "Status", "Creative", "Creative status", "Impressions", "Avg. visible (s)"]];
    for (const campaign of campaigns) {
      for (const creative of campaign.creatives) {
        rows.push([
          campaign.name,
          campaign.advertiser,
          categoryLabel(campaign.category),
          PILL[campaign.state.key][1],
          creative.name,
          creative.blocked ? "Blocked" : "",
          creative.totals.views,
          creative.totals.n ? (creative.totals.sum / creative.totals.n).toFixed(1) : "",
        ]);
      }
    }
    const blob = new Blob([`${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `campaigns-last-${period}-days.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  const periodLabel = `Last ${period} days`;
  const noteFor = (campaignId) => (note && note.campaigns.includes(campaignId) ? note : null);
  const noteForAdv = (advertiserId) => (note && note.advertisers.includes(advertiserId) ? note : null);
  const Note = ({ value }) =>
    value ? (
      <div className={`cp-rnote${value.warn ? " warn" : ""}`} role="status">
        <span>{value.text}</span>
        <button type="button" onClick={() => setNote(null)}>Dismiss</button>
      </div>
    ) : null;

  if (!model.campaigns.length) {
    return (
      <div className="empty">
        <p style={{ margin: "0 auto 0.5rem" }}>No advertiser has booked this game yet.</p>
        <p style={{ margin: "0 auto", fontSize: "0.875rem" }}>
          When an advertiser books one of your open placements, the campaign appears here and you can pause or block it.
        </p>
      </div>
    );
  }

  const dialogCopy = (() => {
    if (!dialog) return null;
    const first = byId.get(dialog.campaignId ?? dialog.ids[0]);
    if (dialog.scope === "creative") {
      return { title: "Block this creative?", subject: `${dialog.name} · ${first?.name ?? ""} · ${first?.advertiser ?? ""}`, body: "Only this creative stops showing in your game. The other creatives of the campaign keep running.", button: "Block creative" };
    }
    if (dialog.scope === "campaign") {
      return { title: "Block this campaign?", subject: `${first.name} · ${first.advertiser}`, body: `All ${first.creatives.length} creatives of this campaign stop showing in your game. Other campaigns of ${first.advertiser} are not affected.`, button: "Block campaign" };
    }
    if (dialog.scope === "advertiser") {
      const group = advertisers.find((item) => item.id === dialog.ids[0]);
      return { title: "Block this advertiser?", subject: group?.name ?? "", body: `All ${group?.campaigns.length ?? 0} campaigns of this advertiser stop showing in your game, including the ones it launches later, until you unblock it.`, button: "Block advertiser" };
    }
    return { title: `Block ${dialog.ids.length} selected campaigns?`, subject: "Selected in the Campaigns list", body: "All creatives of these campaigns stop showing in your game. Campaigns you changed too often in the last hour are skipped.", button: "Block campaigns" };
  })();

  const actionButtons = (campaign, key) => (
    <>
      {key === "active" || key === "waiting" ? (
        <button type="button" className="cp-ib" title="Pause in this game" aria-label={`Pause ${campaign.name}`} disabled={busy} onClick={() => campaignAction(campaign, "pause")}><PauseIcon /></button>
      ) : null}
      {key === "paused" ? (
        <button type="button" className="cp-ib on-pause" title="Paused. Click to resume" aria-pressed="true" aria-label={`Resume ${campaign.name}`} disabled={busy} onClick={() => campaignAction(campaign, "resume")}><PauseIcon /></button>
      ) : null}
      {key !== "ended" && !isBlocked(key) ? (
        <button type="button" className="cp-ib danger" title="Block…" aria-label={`Block ${campaign.name}`} disabled={busy} onClick={() => askBlock("campaign", campaign.id, `"${campaign.name}"`, { campaignId: campaign.id })}><BlockIcon /></button>
      ) : null}
      {key === "blocked" ? (
        <button type="button" className="cp-ib on-block" title="Blocked. Click to unblock" aria-pressed="true" aria-label={`Unblock ${campaign.name}`} disabled={busy} onClick={() => campaignAction(campaign, "unblock")}><BlockIcon /></button>
      ) : null}
    </>
  );

  return (
    <>
      {toast && (
        <div className="cp-toast" role="status">
          <span>{toast}</span>
          <button type="button" onClick={() => setToast("")}>Dismiss</button>
        </div>
      )}

      <div className="cp-top" aria-label="Period and summary">
        <span>
          {periodLabel} · UTC · <strong>{number(totals.views)}</strong> impressions · {live.length} live {live.length === 1 ? "campaign" : "campaigns"} · {new Set(live.map((campaign) => campaign.advertiserId)).size} advertisers · {averageText(totals)} avg. visible
        </span>
        <span className="cp-spacer" />
        <button type="button" className="cp-btn" onClick={exportCsv}>Export CSV</button>
      </div>

      <section className="cp-panel" aria-label="Campaigns">
        <div className="cp-ptabs" role="tablist" aria-label="Campaigns and advertisers">
          <button type="button" role="tab" className="cp-ptab" aria-selected={view === "camp"} onClick={() => { setView("camp"); setFlash(null); setNote(null); }}>
            Campaigns{counts.newCampaigns > 0 && <span className="cp-count" title="Campaigns with something new">{counts.newCampaigns}</span>}
          </button>
          <button type="button" role="tab" className="cp-ptab" aria-selected={view === "adv"} onClick={() => { setView("adv"); setFlash(null); setNote(null); }}>
            Advertisers{counts.newAdvertisers > 0 && <span className="cp-count" title="Advertisers with something new">{counts.newAdvertisers}</span>}
          </button>
          <button type="button" role="tab" className="cp-ptab" aria-selected={view === "cats"} onClick={() => { setView("cats"); setFlash(null); setNote(null); }}>Manage categories</button>
        </div>

        {view === "camp" && (
          <div className="cp-tool">
            <div className="cp-filters">
              <div className="cp-seg" role="group" aria-label="Status">
                {STATUS_FILTERS.map(([key, label]) => (
                  <button key={key} type="button" aria-pressed={status === key} onClick={() => setStatus(key)}>{label}</button>
                ))}
              </div>
              <label htmlFor="cp-cat">Category</label>
              <select id="cp-cat" className="cp-sel" value={category} onChange={(event) => setCategory(event.target.value)}>
                <option value="all">All categories</option>
                {AD_CATEGORIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
              <label htmlFor="cp-sort">Sort</label>
              <select id="cp-sort" className="cp-sel" value={sort} onChange={(event) => setSort(event.target.value)}>
                <option value="new">New first</option>
                <option value="old">Old first</option>
                <option value="imp">Impressions: high to low</option>
                <option value="impasc">Impressions: low to high</option>
                <option value="cat">Category A–Z</option>
                <option value="catdesc">Category Z–A</option>
                <option value="adv">Advertiser A–Z</option>
                <option value="advdesc">Advertiser Z–A</option>
              </select>
              <input className="cp-inp" type="search" placeholder="Search campaign or advertiser" aria-label="Search campaign or advertiser" value={query} onChange={(event) => setQuery(event.target.value)} />
            </div>
            {newLine && <div className="cp-news"><strong>New since your last visit:</strong> {newLine}</div>}
            {selectedIds.length > 0 && (
              <div className="cp-bulk" role="region" aria-label="Bulk actions">
                <strong>{selectedIds.length} selected</strong>
                <button type="button" className="cp-btn cp-btn-sm" disabled={busy} onClick={() => bulk("pause")}>Pause</button>
                <button type="button" className="cp-btn cp-btn-sm" disabled={busy} onClick={() => bulk("resume")}>Resume</button>
                <button type="button" className="cp-btn cp-btn-sm" disabled={busy} onClick={() => bulk("block")}>Block…</button>
                <button type="button" className="cp-btn cp-btn-sm" disabled={busy} onClick={() => bulk("unblock")}>Unblock</button>
                <span className="cp-spacer" />
                <button type="button" className="cp-btn cp-btn-sm" onClick={() => setSelected({})}>Clear selection</button>
              </div>
            )}
          </div>
        )}
        {view === "adv" && (
          <div className="cp-tool">
            <div className="cp-filters">
              <input className="cp-inp" type="search" placeholder="Search advertiser" aria-label="Search advertiser" value={advQuery} onChange={(event) => setAdvQuery(event.target.value)} />
            </div>
          </div>
        )}

        <div className="cp-scroll">
          {view === "camp" && (
            <div className="cp-grid">
              <div className="cp-chead">
                <input type="checkbox" aria-label="Select all shown campaigns" checked={shown.length > 0 && shown.every((campaign) => selected[campaign.id])} onChange={() => {
                  const all = shown.every((campaign) => selected[campaign.id]);
                  const next = { ...selected };
                  shown.forEach((campaign) => { next[campaign.id] = !all; });
                  setSelected(next);
                }} />
                <span>Campaign · advertiser · category</span><span>Status</span><span className="cp-num">Creatives</span><span className="cp-num">Impressions</span><span className="cp-num">Avg. visible</span><span style={{ textAlign: "right" }}>Actions</span>
              </div>
              {shown.map((campaign) => {
                const key = campaign.state.key;
                const isOpen = Boolean(open[campaign.id]);
                const tag = campaign.creatives.some((creative) => creative.isNew) ? "New creative" : campaign.isNew ? "New" : "";
                const [pillClass, pillText] = PILL[key];
                const stopped = key === "paused" || isBlocked(key);
                const chart = isOpen && campaign.totals.views > 0 ? buildChart(campaign.creatives, days, { period, mode: chartMode, pick }) : null;
                const here = noteFor(campaign.id);
                return (
                  <div key={campaign.id} id={`cp-${campaign.id}`}>
                    <div className={`cp-crow ${ROW_CLASS[key] ?? ""}${flash === campaign.id ? " flash" : ""}`}>
                      <input type="checkbox" aria-label={`Select ${campaign.name}`} checked={Boolean(selected[campaign.id])} onChange={() => setSelected({ ...selected, [campaign.id]: !selected[campaign.id] })} />
                      <div className="cp-cname">
                        <button type="button" className={`cp-caret${isOpen ? " open" : ""}`} aria-expanded={isOpen} aria-label={`Show creatives of ${campaign.name}`} onClick={() => toggleOpen(campaign)}><CaretIcon /></button>
                        <i className="cp-cti" style={iconStyle(campaign.category)} title={categoryLabel(campaign.category)} role="img" aria-label={`Category: ${categoryLabel(campaign.category)}`} />
                        <div style={{ minWidth: 0 }}>
                          <div><strong>{campaign.name}</strong> {tag && <span className="cp-tag">{tag}</span>}</div>
                          <div className="cp-meta">{campaign.advertiser} · {categoryLabel(campaign.category)} · started {dayLabel(campaign.started)}</div>
                          <Note value={here} />
                          {key === "blocked" && campaign.state.reason && <div className="cp-meta">Your reason: {campaign.state.reason}</div>}
                          {key === "blockedadv" && <div className="cp-meta">Blocked together with {campaign.advertiser}. Unblock the advertiser to change it.</div>}
                        </div>
                      </div>
                      <div><span className={`cp-pill ${pillClass}`}>{pillText}</span></div>
                      <div className="cp-num">{campaign.creatives.length}</div>
                      <div className="cp-num">{number(campaign.totals.views)}</div>
                      <div className="cp-num">{averageText(campaign.totals)}</div>
                      <div className="cp-acts">
                        {actionButtons(campaign, key)}
                        {key === "blockedcat" && <button type="button" className="cp-btn cp-btn-sm" onClick={() => setView("cats")}>Manage categories</button>}
                        {key === "blockedadv" && <button type="button" className="cp-btn cp-btn-sm" onClick={() => { setView("adv"); setOpenAdv({ ...openAdv, [campaign.advertiserId]: true }); }}>Manage advertiser</button>}
                      </div>
                    </div>

                    {isOpen && (
                      <div className={`cp-crea ${ROW_CLASS[key] ?? ""}`}>
                        {chart && (
                          <section className="cp-chart" aria-label={`Impressions per day for ${campaign.name}`}>
                            <div className="cp-chart-head">
                              <div>
                                <div className="cp-chart-title">Impressions per day</div>
                                <div className="cp-sub">
                                  {periodLabel} · UTC{chartMode === "creative" ? " · one bar per creative, same scale · click colours to compare" : ""}{stopped ? ` · ${key === "paused" ? "Paused" : "Blocked"} in this game now` : ""}
                                </div>
                              </div>
                              <span className="cp-spacer" />
                              <div className="cp-seg" role="group" aria-label="Show">
                                <button type="button" aria-pressed={chartMode === "all"} onClick={() => { setChartMode("all"); setPick({}); }}>Total</button>
                                <button type="button" aria-pressed={chartMode === "creative"} onClick={() => setChartMode("creative")}>By creative</button>
                              </div>
                              <div className="cp-seg" role="group" aria-label="Period">
                                {PERIODS.map((value) => <button key={value} type="button" aria-pressed={period === value} onClick={() => setPeriod(value)}>{value} days</button>)}
                              </div>
                            </div>
                            {chartMode === "creative" && (
                              <div className="cp-legend">
                                <button type="button" className="cp-lg all" aria-pressed={!chart.anyPick} onClick={() => setPick({})}>All creatives</button>
                                {chart.legend.map((item) => (
                                  <button key={item.id} type="button" className="cp-lg" aria-pressed={item.on} onClick={() => setPick({ ...pick, [item.id]: !pick[item.id] })}>
                                    <i style={{ background: item.color }} />{item.name}<b>{item.total}</b>
                                  </button>
                                ))}
                              </div>
                            )}
                            <div className="cp-plot">
                              <div className="cp-y"><span>{chart.yTop}</span><span>{chart.yMid}</span><span>0</span></div>
                              <div className="cp-area">
                                <div className="cp-gl" style={{ top: 0 }} /><div className="cp-gl" style={{ top: "50%" }} />
                                <div className="cp-bars">
                                  {chart.cols.map((col, index) => (
                                    <div key={index} className="cp-col" title={col.tip}>
                                      <div className={`cp-stack ${col.cls}`} style={{ height: `${col.h}%` }}>
                                        {col.segs.map((seg, i) => <span key={i} title={seg.tip} style={{ height: `${seg.h}%`, background: seg.c }} />)}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                            <div className="cp-x"><span>{dayLabel(days[STATS_DAYS - period])}</span><span>{dayLabel(days[STATS_DAYS - Math.ceil(period / 2)])}</span><span>{dayLabel(days[STATS_DAYS - 1])}</span></div>
                          </section>
                        )}
                        {campaign.totals.views > 0 && (
                          <>
                            <div className="cp-clh"><strong>Creatives</strong><span className="cp-sub">{periodLabel}{chartMode === "creative" && chart ? " · colours match the chart" : ""}</span></div>
                            <div className="cp-sub" style={{ margin: "2px 0", fontSize: "12.5px" }}>
                              <strong style={{ color: "var(--ink)" }}>Impressions</strong> is how many times players saw the creative in the period. <strong style={{ color: "var(--ink)" }}>Avg. visible</strong> is how long, on average, it stayed in view each time.
                            </div>
                            {chart?.many && chartMode === "creative" && <div className="cp-sub" style={{ margin: "2px 0 4px" }}>{campaign.creatives.length} creatives: the 5 with the most impressions get their own colour, the rest are grouped as Other.</div>}
                          </>
                        )}
                        <div className="cp-srow shead" aria-hidden="true"><span /><span /><span>Creative</span><span>Status</span><span className="cp-num">Impressions</span><span className="cp-num">Avg. visible</span><span /></div>
                        {campaign.creatives.map((creative) => {
                          const campaignOff = key !== "active" && key !== "ended" && key !== "waiting";
                          const label = creative.blocked ? "Blocked" : creative.base === "ended" || key === "ended" ? "Ended" : campaignOff || key === "waiting" ? (key === "waiting" ? "Waiting" : "Not shown") : creative.base === "waiting" ? "Waiting" : "Showing";
                          const pill = creative.blocked ? "p-blocked" : label === "Showing" ? "p-active" : label === "Ended" ? "p-ended" : "p-off";
                          const zooming = zoomId === creative.id;
                          const small = fit(creative.aspect, 72, 50);
                          const big = fit(creative.aspect, 520, 356);
                          const canBlock = !creative.blocked && key !== "ended" && key !== "blockedcat" && key !== "blockedadv";
                          return (
                            <div className="cp-srw" key={creative.id}>
                              <div className="cp-srow">
                                <span />
                                <span>
                                  <button type="button" className={`cp-thb${zooming ? " on" : ""}`} title="Click to enlarge" aria-label={`Enlarge ${creative.name}`} onClick={() => setZoomId(zooming ? null : creative.id)}>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    {creative.url ? <img className="cp-th" src={creative.url} alt={`Preview of ${creative.name}`} width={small.width} height={small.height} loading="lazy" /> : <span className="cp-th" style={small} />}
                                  </button>
                                </span>
                                <div>
                                  {chartMode === "creative" && chart && <i className="cp-dot" style={{ background: chart.colorOf.get(creative.id) }} />}
                                  <strong>{creative.name}</strong>{creative.format && <span className="cp-fmt">{creative.format}</span>} {creative.isNew && <span className="cp-tag">New</span>}
                                  {creative.blocked && creative.reason && <div className="cp-meta cp-sub">Your reason: {creative.reason}</div>}
                                </div>
                                <div><span className={`cp-pill ${pill}`}>{label}</span></div>
                                <div className="cp-num">{number(creative.totals.views)}</div>
                                <div className="cp-num">{averageText(creative.totals)}</div>
                                <div className="cp-acts">
                                  {canBlock && <button type="button" className="cp-ib danger" title="Block this creative…" aria-label={`Block ${creative.name}`} disabled={busy} onClick={() => askBlock("creative", creative.id, `creative "${creative.name}"`, { campaignId: campaign.id, name: creative.name })}><BlockIcon /></button>}
                                  {creative.blocked && <button type="button" className="cp-ib on-block" title="Blocked. Click to unblock" aria-pressed="true" aria-label={`Unblock ${creative.name}`} disabled={busy} onClick={() => run({ scope: "creative", action: "unblock", ids: [creative.id] })}><BlockIcon /></button>}
                                </div>
                              </div>
                              {zooming && creative.url && (
                                <div className="cp-bubble" role="img" aria-label="Enlarged creative" onClick={() => setZoomId(null)}>
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={creative.url} alt={creative.name} width={big.width} height={big.height} />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
              {shown.length === 0 && <div className="cp-empty">No campaigns match these filters.</div>}
            </div>
          )}

          {view === "adv" && (
            <>
              <div className="cp-rule">
                An advertiser can run several campaigns in your game. <strong>Pausing or blocking one campaign does not touch the others.</strong> <strong>Blocking the advertiser</strong> stops all its campaigns here, including any it launches later, until you unblock it. This applies to this game only.
              </div>
              <div className="cp-grid">
                <div className="cp-chead">
                  <span /><span>Advertiser · categories</span><span>Status</span><span className="cp-num">Campaigns</span><span className="cp-num">Impressions</span><span className="cp-num">Avg. visible</span><span style={{ textAlign: "right" }}>Actions</span>
                </div>
                {advertisers.filter((group) => !advQuery.trim() || group.name.toLowerCase().includes(advQuery.trim().toLowerCase())).map((group) => {
                  const advBlocked = ctx.controls.get(`advertiser:${group.id}`);
                  const states = group.campaigns.map((campaign) => campaign.state.key);
                  const liveN = states.filter((state) => state === "active").length;
                  let key;
                  if (advBlocked?.state === "blocked") key = "blockedadv";
                  else if (liveN === group.campaigns.length) key = "active";
                  else if (liveN > 0) key = "mixed";
                  else if (states.includes("paused")) key = "paused";
                  else if (states.every((state) => state === "blockedcat")) key = "blockedcat";
                  else if (states.every(isBlocked)) key = "blocked";
                  else if (states.every((state) => state === "waiting")) key = "waiting";
                  else key = "ended";
                  const total = addTotals(group.campaigns.map((campaign) => campaign.totals));
                  const isOpen = Boolean(openAdv[group.id]);
                  const parts = [`${group.campaigns.length} ${group.campaigns.length === 1 ? "campaign" : "campaigns"}`];
                  if (key === "blockedadv") parts.push("all stopped by the advertiser block");
                  else {
                    if (liveN) parts.push(`${liveN} live`);
                    const paused = states.filter((state) => state === "paused").length;
                    const blockedN = states.filter(isBlocked).length;
                    if (paused) parts.push(`${paused} paused`);
                    if (blockedN) parts.push(`${blockedN} blocked`);
                  }
                  const [pillClass, pillText] = PILL[key];
                  const allStopped = states.every((state) => state !== "active" && state !== "waiting" && state !== "paused");
                  const here = noteForAdv(group.id);
                  return (
                    <div key={group.id}>
                      <div className="cp-crow">
                        <button type="button" className={`cp-caret${isOpen ? " open" : ""}`} aria-expanded={isOpen} aria-label={`Show campaigns of ${group.name}`} onClick={() => setOpenAdv({ ...openAdv, [group.id]: !isOpen })}><CaretIcon /></button>
                        <div className="cp-cname">
                          <span className="cp-avt" style={{ background: colorOfName(group.name) }} aria-hidden="true">{group.name.charAt(0).toUpperCase()}</span>
                          <div>
                            <strong>{group.name}</strong>
                            <div className="cp-meta">{parts.join(" · ")}</div>
                            <div className="cp-meta">{[...new Set(group.campaigns.map((campaign) => categoryLabel(campaign.category)))].join(", ")}</div>
                            <Note value={here} />
                          </div>
                        </div>
                        <div><span className={`cp-pill ${pillClass}`}>{pillText}</span></div>
                        <div className="cp-num">{group.campaigns.length}</div>
                        <div className="cp-num">{number(total.views)}</div>
                        <div className="cp-num">{averageText(total)}</div>
                        <div className="cp-acts">
                          {!advBlocked && !allStopped && <button type="button" className="cp-ib danger" title="Block advertiser…" aria-label={`Block ${group.name}`} disabled={busy} onClick={() => askBlock("advertiser", group.id, group.name, {})}><BlockIcon /></button>}
                          {advBlocked && <button type="button" className="cp-ib on-block" title="Blocked. Click to unblock" aria-pressed="true" aria-label={`Unblock ${group.name}`} disabled={busy} onClick={() => run({ scope: "advertiser", action: "unblock", ids: [group.id], extra: " Campaigns you paused or blocked one by one stay as they were." })}><BlockIcon /></button>}
                        </div>
                      </div>
                      {isOpen && (
                        <div className="cp-crea">
                          {advBlocked && <div className="cp-meta cp-sub" style={{ marginBottom: 6 }}>Blocked in this game{advBlocked.reason ? ` · your reason: ${advBlocked.reason}` : ""}. All campaigns below are stopped, and so will be any new ones.</div>}
                          <div className="cp-nhead"><span>Campaign</span><span>Status</span><span className="cp-num">Creatives</span><span className="cp-num">Impressions</span><span style={{ textAlign: "right" }}>Actions</span></div>
                          {group.campaigns.map((campaign) => {
                            const [campPill, campText] = PILL[campaign.state.key];
                            return (
                              <div className="cp-nrow" key={campaign.id}>
                                <div>
                                  <button type="button" className="cp-lnk" title="Open in Campaigns" onClick={() => openInCampaigns(campaign)}>{campaign.name}<i>↗</i></button>
                                  <div className="cp-meta cp-sub">{categoryLabel(campaign.category)} · started {dayLabel(campaign.started)}</div>
                                  <Note value={noteFor(campaign.id)} />
                                </div>
                                <div><span className={`cp-pill ${campPill}`}>{campText}</span></div>
                                <div className="cp-num">{campaign.creatives.length}</div>
                                <div className="cp-num">{number(campaign.totals.views)}</div>
                                <div className="cp-acts">{actionButtons(campaign, campaign.state.key)}</div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {view === "cats" && (
          <div className="cp-cats">
            <div className="cp-top" style={{ margin: 0 }}>
              <h2 style={{ fontSize: 16, color: "var(--ink)" }}>Blocked categories</h2>
              <span>{ctx.blocked.size} of {AD_CATEGORIES.length} blocked in this game · applies to this game only</span>
            </div>
            <p className="cp-hint">Advertisers in a blocked category do not show in this game. Alcohol and tobacco, gambling, and dating and adult are blocked by default. Click a category to block it. A dark tile means it is blocked; click again to allow it. Hover a category for a short description.</p>
            <div className="cp-cgh" style={{ marginTop: 14 }}>Everyday categories</div>
            <div className="cp-tiles">
              {AD_CATEGORIES.filter((item) => !SENSITIVE.includes(item.id)).map((item) => (
                <button key={item.id} type="button" className="cp-tile" title={DESCRIPTION[item.id]} aria-pressed={ctx.blocked.has(item.id)} disabled={busy} onClick={() => toggleCategory(item.id)}>
                  <i className="cp-cti" style={iconStyle(item.id)} /><span className="nm">{item.label}</span><span className="st">{ctx.blocked.has(item.id) ? "Blocked" : "Allowed"}</span>
                </button>
              ))}
            </div>
            <div className="cp-cgh" style={{ marginTop: 22 }}>Sensitive categories <span className="cp-sub" style={{ fontWeight: 400 }}>· blocked by default, check before you allow them</span></div>
            <div className="cp-tiles">
              {AD_CATEGORIES.filter((item) => SENSITIVE.includes(item.id)).map((item) => (
                <button key={item.id} type="button" className="cp-tile sens" title={DESCRIPTION[item.id]} aria-pressed={ctx.blocked.has(item.id)} disabled={busy} onClick={() => toggleCategory(item.id)}>
                  <i className="cp-cti" style={iconStyle(item.id)} /><span className="nm">{item.label}</span><span className="st">{ctx.blocked.has(item.id) ? "Blocked" : "Allowed"}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {zoomId && <div className="cp-zback" onClick={() => setZoomId(null)} aria-hidden="true" />}

      {dialog && dialogCopy && (
        <div className="cp-veil">
          <div className="cp-dlg" role="dialog" aria-modal="true" aria-labelledby="cp-dlg-title">
            <h2 id="cp-dlg-title">{dialogCopy.title}</h2>
            <p style={{ fontWeight: 600, margin: "0 0 4px" }}>{dialogCopy.subject}</p>
            <p className="cp-sub" style={{ margin: "0 0 6px" }}>{dialogCopy.body}</p>
            <label className="fl" htmlFor="cp-reason">Reason <span className="cp-sub" style={{ fontWeight: 400 }}>(optional)</span></label>
            <select id="cp-reason" className="cp-sel" value={dialog.reason} onChange={(event) => setDialog({ ...dialog, reason: event.target.value })}>
              {REASONS.map((reason) => <option key={reason}>{reason}</option>)}
            </select>
            <label className="fl" htmlFor="cp-comment">Comment <span className="cp-sub" style={{ fontWeight: 400 }}>(optional)</span></label>
            <textarea id="cp-comment" className="cp-ta" maxLength={500} value={dialog.comment} onChange={(event) => setDialog({ ...dialog, comment: event.target.value })} />
            <p className="cp-hint">The advertiser will see that this is blocked and the reason you give. Players get the change the next time they start the game. To keep the history clean, the same item can change its status up to 2 times per hour, and repeated identical requests are saved only once.</p>
            <div className="foot">
              <button type="button" className="cp-btn" onClick={() => setDialog(null)}>Cancel</button>
              <button type="button" className="cp-btn cp-btn-primary" disabled={busy} onClick={confirmBlock}>{dialogCopy.button}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
