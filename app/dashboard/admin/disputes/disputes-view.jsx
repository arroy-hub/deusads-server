"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { nextSort, sortRows } from "../../../../lib/sort";
import { DeckShell, DeckToggle } from "../admin-deck";
import { Band, Dropdown, IconBtn, Pill, SortTh, Tab } from "../ui";
import { useCards } from "../cards";
import { resolveDispute } from "../actions";

const COLS = "minmax(0,1.5fr) minmax(0,1fr) 84px 96px 112px";
const SORT_DEFAULTS = { reason: "asc", from: "asc", opened: "desc", status: "asc" };
const SHORT = { removed: "Removed", paused: "Paused", dismissed: "Dismissed" };
const FROM = [["all", "Everyone"], ["developer", "Developers"], ["advertiser", "Advertisers"]];
const sortValue = (r, k) => (k === "reason" ? r.reason : k === "from" ? r.initiator : k === "opened" ? r.createdAt : r.status);

export default function DisputesView({ rows, widgets, groups, defaults, layout }) {
  const router = useRouter();
  const { open: openCard } = useCards();
  const [tab, setTab] = useState("open");
  const [from, setFrom] = useState("all");
  const [sort, setSort] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");

  const inTab = (r) => (tab === "open" ? r.open : tab === "acted" ? r.status === "removed" || r.status === "paused" : r.status === "dismissed");
  const shown = sortRows(rows.filter((r) => inTab(r) && (from === "all" || r.initiator === from)), sort, sortValue);
  const count = (t) => rows.filter((r) => (t === "open" ? r.open : t === "acted" ? r.status === "removed" || r.status === "paused" : r.status === "dismissed")).length;

  async function decide(r, decision) {
    setBusy(r.id);
    setError("");
    const result = await resolveDispute({ disputeId: r.id, decision, note: "" }).catch(() => ({ error: "Connection lost. Try again." }));
    setBusy(null);
    if (result?.error) return setError(result.error);
    router.refresh();
  }
  const onSort = (k) => setSort((s) => nextSort(s, k, SORT_DEFAULTS));

  return (
    <>
      <Band
        title="Disputes"
        info="Developers report creatives that run in their games, and advertisers report problems with a game. Open a row to see the history. Remove the creative, pause the booking, or dismiss. Both sides are told."
        sub="Reports from developers and advertisers."
        tabs={<>
          <Tab current={tab === "open"} count={count("open")} hot={count("open") > 0} onClick={() => setTab("open")}>Open</Tab>
          <Tab current={tab === "acted"} count={count("acted")} onClick={() => setTab("acted")}>Action taken</Tab>
          <Tab current={tab === "dismissed"} count={count("dismissed")} onClick={() => setTab("dismissed")}>Dismissed</Tab>
        </>}
      />
      <DeckShell kind="admin_disputes" widgets={widgets} groups={groups} defaults={defaults} initial={layout} sub="All disputes. Drag the grip to move a widget.">
        <div className="cb-unit">
          <div className="cb-bar">
            <Dropdown label="From" value={from} onChange={setFrom} options={FROM.map(([k, l]) => [k, l])} />
            <span className="cb-sp" />
            <span className="cb-mute">{shown.length} dispute{shown.length === 1 ? "" : "s"}</span>
            <DeckToggle />
          </div>
          {error && <p className="cb-err" role="alert" style={{ margin: "0 16px 8px" }}>{error}</p>}
          {shown.length ? (
            <div className="cb-list" style={{ overflowX: "auto" }}>
              <div style={{ minWidth: 640 }}>
                <div className="cb-lh" style={{ gridTemplateColumns: COLS }}>
                  <SortTh label="Dispute" k="reason" sort={sort} onSort={onSort} />
                  <SortTh label="From → about" k="from" sort={sort} onSort={onSort} />
                  <SortTh label="Opened" k="opened" sort={sort} onSort={onSort} />
                  <SortTh label="Status" k="status" sort={sort} onSort={onSort} />
                  <span />
                </div>
                {shown.map((r) => (
                  <div key={r.id} className="cb-lr click" role="button" tabIndex={0} style={{ gridTemplateColumns: COLS }} onClick={() => openCard("dispute", r.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openCard("dispute", r.id); } }}>
                    <div className="cb-who">
                      <span className="cb-th" style={{ width: 38, height: 38, backgroundImage: r.creativeUrl ? `url(${r.creativeUrl})` : undefined }} />
                      <div><strong>{r.reason}</strong><span className="cb-mute">{r.creative} · {r.game}</span></div>
                    </div>
                    <div className="cb-who"><div><strong style={{ fontSize: ".8125rem" }}>{r.by}</strong><span className="cb-mute">{r.initiator === "advertiser" ? "Advertiser" : "Developer"} → {r.against}</span></div></div>
                    <div className="cb-mute">{r.created.slice(5).replace("-", "/")}</div>
                    <div><Pill tone={r.open ? "warn" : r.status === "dismissed" ? "good" : "bad"}>{r.open ? "Open" : SHORT[r.status]}</Pill></div>
                    <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                      {r.open && <>
                        <IconBtn icon="trash" danger tip="Remove creative" disabled={busy === r.id} onClick={() => decide(r, "remove")} />
                        <IconBtn icon="pause" tip="Pause booking" disabled={busy === r.id} onClick={() => decide(r, "pause")} />
                        <IconBtn icon="dismiss" tip="Dismiss" disabled={busy === r.id} onClick={() => decide(r, "dismiss")} />
                      </>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : <div className="cb-list"><div className="cb-empty">{tab === "open" ? "No open disputes." : "Nothing here yet."}</div></div>}
        </div>
      </DeckShell>
    </>
  );
}
