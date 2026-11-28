"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DeckShell, DeckToggle } from "../admin-deck";
import { Band, Dropdown, IconBtn, Lnk, Seg, Th, toast } from "../ui";
import { useCards } from "../cards";
import { resolveDispute } from "../actions";
import { outcomePill, outcomeText } from "../../../../lib/admin-disputes";
import { refreshPage, useWaitMark } from "../../wait";

// the last column holds two icon buttons or the outcome; the longest outcome is "Change requested"
const COLS = "56px minmax(0,1.2fr) minmax(230px,1.3fr) 58px 140px";
const INFO = "Developer reports are about a creative: you can find no violation, ask the advertiser to change it, or block it for a violation. Advertiser reports are about where their ad is shown: you can pause that booking. Hover an icon to see its name.";
const kindOf = (r) => (r.open ? "open" : r.status === "dismissed" ? "dismissed" : "acted");

export default function DisputesView({ rows, widgets, groups, defaults, layout }) {
  const router = useRouter();
  const { open: openCard } = useCards();
  const [tab, setTab] = useState("open");
  const [from, setFrom] = useState("all");
  const [busy, setBusy] = useState(null);
  useWaitMark(Boolean(busy));

  const inFrom = (r) => from === "all" || r.initiator === from;
  const count = (k) => rows.filter((r) => kindOf(r) === k && inFrom(r)).length;
  const shown = rows.filter((r) => kindOf(r) === tab && inFrom(r));

  async function decide(r, decision) {
    setBusy(r.id);
    const adv = r.initiator === "advertiser";
    const result = await resolveDispute({ disputeId: r.id, decision, note: "" }).catch(() => ({ error: "Connection lost. Try again." }));
    setBusy(null);
    if (result?.error) return toast(result.error);
    toast(decision === "pause" ? "Booking paused. Both sides notified" : adv ? "Report dismissed. Both sides notified" : "No violation found. Developer notified");
    refreshPage(router);
  }

  const list = shown.length ? (
    <div className="cb-list cb-scroll">
      <div style={{ minWidth: 740 }}>
        <div className="cb-lh" style={{ gridTemplateColumns: COLS }}><span /><span>Creative and source</span><span>Reason</span><span className="cb-ctr">Date</span><span /></div>
        {shown.map((r) => {
          const adv = r.initiator === "advertiser";
          return (
            <div key={r.id} className="cb-lr cb-click" role="button" tabIndex={0} style={{ gridTemplateColumns: COLS, minHeight: 60 }}
              onClick={() => openCard("dispute", r.id)}
              onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openCard("dispute", r.id); } }}>
              <Th seed={r.creativeId} w={52} h={34} tag={r.creative} url={r.creativeUrl} />
              <div className="cb-who"><div>
                <strong><Lnk onClick={() => openCard("creative", r.creativeId)}>{r.picture ?? r.creative}</Lnk></strong>
                <span className="cb-mute"><span className={`cb-pill cb-${adv ? "info" : "warn"} cb-nodot`} style={{ padding: "0 8px", fontSize: 11.5 }}>{adv ? "Advertiser" : "Developer"}</span> {adv ? r.adv : r.dev}</span>
                <span className="cb-mute">{adv ? <>{r.bookingId ? <Lnk onClick={() => openCard("booking", r.bookingId)}>booking in {r.game}</Lnk> : `booking in ${r.game}`} · {r.dev}</> : `${r.adv} · in ${r.game}`}</span>
              </div></div>
              <div className="cb-rcl"><span className="cb-pill cb-bad">{r.reason}</span>{r.comment && <div className="cb-mute cb-clamp" style={{ marginTop: 4 }}>{r.comment}</div>}</div>
              <div className="cb-mute cb-ctr" title={r.when}>{r.day}</div>
              <div className="cb-acts" style={{ flexWrap: "nowrap" }}>
                {r.open ? (
                  <>
                    {adv
                      ? <IconBtn icon="pause" tip="Pause booking" danger disabled={busy === r.id} onClick={() => decide(r, "pause")} />
                      : <IconBtn icon="flag" tip="Decide: change or block" danger onClick={() => openCard("dispute", r.id)} />}
                    <IconBtn icon="dismiss" tip={adv ? "Dismiss report" : "No violation"} disabled={busy === r.id} onClick={() => decide(r, "dismiss")} />
                  </>
                ) : <span className={`cb-pill cb-${outcomePill(r)[1]} cb-nodot`} title={outcomeText(r)}>{outcomePill(r)[0]}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  ) : <div className="cb-list" style={{ padding: 34, textAlign: "center", color: "var(--ink-2)" }}>{tab === "dismissed" ? "No reports without a violation yet." : tab === "acted" ? "No actions taken yet." : "No open disputes."}</div>;

  return (
    <>
      <Band icon="disputes" title="Disputes" info={INFO} sub="Reports in both directions: developers about creatives in their games, advertisers about where their ads are shown." />
      <DeckShell kind="admin_disputes" widgets={widgets} groups={groups} defaults={defaults} initial={layout} sub="Last 90 days. Drag the grip to move a widget.">
        <div className="cb-tbar">
          <Seg label="Status" value={tab} onChange={setTab} items={[["open", "Open", count("open")], ["acted", "Action taken", count("acted")], ["dismissed", "No violation", count("dismissed")]]} />
          <Dropdown id="dfrom" label="From" value={from} onChange={setFrom} options={[["all", "Everyone"], ["developer", "Developers"], ["advertiser", "Advertisers"]]} />
          <span className="cb-sp" />
          <DeckToggle />
        </div>
        {list}
      </DeckShell>
    </>
  );
}
