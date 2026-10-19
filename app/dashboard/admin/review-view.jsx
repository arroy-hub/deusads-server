"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AD_CATEGORIES } from "../../../lib/categories";
import { reviewAsset, reviewCreative } from "./actions";
import { DeckShell, DeckToggle } from "./admin-deck";
import { Band, CatPill, Dropdown, IconBtn, Lnk, Pill, Tab, Th, toast } from "./ui";
import { useCards } from "./cards";

const COLS = "60px minmax(0,1.6fr) minmax(0,1.1fr) 92px 84px";
const INFO = "Only approved creatives reach the SDK. Rejecting one that is already showing takes it off its placements at once. Hover an icon to see what it does: the tick approves, the crossed circle rejects and asks for a reason.";

export default function ReviewView({ rows, widgets, groups, defaults, layout, canNote }) {
  const router = useRouter();
  const { open: openCard } = useCards();
  const [tab, setTab] = useState("new");
  const [cat, setCat] = useState("all");
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(null);

  const waiting = rows.filter((r) => r.out === "waiting" && r.kind === "creative");
  const assets = rows.filter((r) => r.kind === "asset");
  const reviewed = rows.filter((r) => r.out !== "waiting").sort((a, b) => String(b.reviewedAt).localeCompare(String(a.reviewedAt)));
  const list = (tab === "new" ? waiting : tab === "assets" ? assets : reviewed).filter((r) => cat === "all" || r.category === cat);
  // an extra picture opens the creative it belongs to
  const cardOf = (row) => (row.kind === "asset" ? row.creativeId : row.id);

  async function decide(row, decision, note) {
    setBusy(row.id);
    const run = row.kind === "asset" ? reviewAsset({ assetId: row.id, decision, note }) : reviewCreative({ creativeId: row.id, decision, note });
    const result = await run.catch(() => ({ error: "Connection lost. Try again." }));
    setBusy(null);
    if (result?.error) return toast(result.error);
    setRejecting(null);
    setReason("");
    toast(decision === "approved" ? "Approved: now reaches the SDK" : "Rejected: the owner will see the reason");
    router.refresh();
  }

  const body = list.length ? (
    <div className="cb-list cb-scroll">
      <div style={{ minWidth: 560 }}>
        <div className="cb-lh" style={{ gridTemplateColumns: COLS }}><span /><span>Creative</span><span>Category</span><span>Size · sent</span><span /></div>
        {list.map((row) => {
          const done = row.out !== "waiting";
          const card = cardOf(row);
          return (
            <div key={`${row.kind}${row.id}`} className="cb-lr" style={{ gridTemplateColumns: COLS, minHeight: 60 }}>
              <Th seed={row.id} w={52} h={34} tag={row.name} url={row.url} label={`Open ${row.name}`} zoom onClick={card ? () => openCard("creative", card) : undefined} />
              <div className="cb-who"><div>
                <strong>{card ? <Lnk onClick={() => openCard("creative", card)}>{row.name}</Lnk> : row.name}</strong>
                <span className="cb-mute">{row.owner}</span>
                {row.out === "rejected" && row.note && <span className="cb-mute cb-clamp">Reason: {row.note}</span>}
              </div></div>
              <div><CatPill label={row.categoryLabel} restricted={row.restricted} /></div>
              <div className="cb-mute" style={{ lineHeight: 1.35 }}><span className="cb-mono" style={{ background: "none", padding: 0 }}>{row.size}</span><br />{row.short}</div>
              <div className="cb-acts" style={{ flexWrap: "nowrap" }}>
                {done ? <Pill tone={row.out === "approved" ? "good" : "bad"} dot={false}>{row.out === "approved" ? "Approved" : "Rejected"}</Pill> : (
                  <>
                    <IconBtn icon="check" tip="Approve" disabled={busy === row.id} onClick={() => decide(row, "approved")} />
                    <IconBtn icon="dismiss" tip="Reject…" danger onClick={() => { setRejecting(row.id); setReason(""); }} />
                  </>
                )}
              </div>
              {rejecting === row.id && (
                <div className="cb-subrow">
                  <input className="cb-fld" placeholder={`Reason shown to ${row.owner}`} aria-label="Reason" value={reason} maxLength={500} autoFocus onChange={(e) => setReason(e.target.value)} />
                  <button type="button" className="cb-btn cb-d cb-s" disabled={busy === row.id} onClick={() => decide(row, "rejected", reason)}>Reject creative</button>
                  <button type="button" className="cb-btn cb-q cb-s" onClick={() => setRejecting(null)}>Cancel</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  ) : <div className="cb-list" style={{ padding: 34, textAlign: "center", color: "var(--ink-2)" }}>Nothing here. New creatives appear as advertisers upload them.</div>;

  return (
    <>
      <Band
        title="Review creatives"
        info={INFO}
        sub="Approve or reject what advertisers upload."
        tabs={<>
          <Tab current={tab === "new"} count={waiting.length} hot={waiting.length > 0} onClick={() => { setTab("new"); setRejecting(null); }}>Waiting</Tab>
          <Tab current={tab === "assets"} count={assets.length} onClick={() => { setTab("assets"); setRejecting(null); }}>Format images</Tab>
          <Tab current={tab === "done"} count={reviewed.length} onClick={() => { setTab("done"); setRejecting(null); }}>Reviewed</Tab>
        </>}
      />
      <DeckShell kind="admin_review" widgets={widgets} groups={groups} defaults={defaults} initial={layout} sub="Last 90 days. Drag the grip to move a widget.">
        <div className="cb-tbar">
          <Dropdown id="rcat" label="Category" value={cat} onChange={setCat} options={[["all", "All categories"], ...AD_CATEGORIES.map((c) => [c.id, c.label])]} />
          <span className="cb-sp" />
          <DeckToggle />
        </div>
        {!canNote && <p className="notice">Run <code>supabase/migrations/0008_roles_and_moderation.sql</code> in the Supabase SQL editor to enable rejection notes and the reviewed list.</p>}
        {body}
      </DeckShell>
    </>
  );
}
