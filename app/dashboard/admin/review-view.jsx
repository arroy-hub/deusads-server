"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AD_CATEGORIES } from "../../../lib/categories";
import { reviewAsset, reviewCreative } from "./actions";
import { DeckShell, DeckToggle } from "./admin-deck";
import { Band, Dropdown, IconBtn, Pill, Tab } from "./ui";
import { useCards } from "./cards";

const COLS = "60px minmax(0,1.6fr) minmax(0,1.1fr) 92px 84px";
const SUGGESTIONS = ["Category not accepted", "Misleading claim", "Image quality or wrong size", "Brand or trademark issue", "Landing page problem"];
const INFO = "Only approved creatives reach the SDK. Rejecting one that is already showing takes it off its placements at once. Hover an icon to see what it does: the tick approves, the crossed circle rejects and asks for a reason.";

function Thumb({ row, w = 52, h = 34, onClick }) {
  const style = { width: w, height: h, backgroundImage: row.url ? `url(${row.url})` : undefined, background: row.url ? undefined : "#8c7f73" };
  const inner = row.url ? null : <b>{row.name.slice(0, 8)}</b>;
  return onClick
    ? <button type="button" className="cb-th" aria-label={`Open ${row.name}`} style={{ ...style, cursor: "zoom-in", padding: 0 }} onClick={(e) => { e.stopPropagation(); onClick(); }}>{inner}</button>
    : <span className="cb-th" style={style}>{inner}</span>;
}

const catPill = (row) => <Pill tone={row.restricted ? "warn" : ""} dot={row.restricted}>{row.restricted ? "⚠ " : ""}{row.categoryLabel}</Pill>;
const statusPill = (row) => <Pill tone={row.out === "approved" ? "good" : "bad"} dot={false}>{row.out === "approved" ? "Approved" : "Rejected"}</Pill>;

export default function ReviewView({ rows, widgets, groups, defaults, layout, canNote }) {
  const router = useRouter();
  const [tab, setTab] = useState("new");
  const [cat, setCat] = useState("all");
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");
  const { open: openCard } = useCards();

  const waiting = rows.filter((r) => r.out === "waiting" && r.kind === "creative");
  const assets = rows.filter((r) => r.kind === "asset");
  const reviewed = rows.filter((r) => r.out !== "waiting").sort((a, b) => String(b.reviewedAt).localeCompare(String(a.reviewedAt)));
  const list = (tab === "new" ? waiting : tab === "assets" ? assets : reviewed).filter((r) => cat === "all" || r.category === cat);

  async function decide(row, decision, note) {
    setBusy(row.id);
    setError("");
    const run = row.kind === "asset" ? reviewAsset({ assetId: row.id, decision, note }) : reviewCreative({ creativeId: row.id, decision, note });
    const result = await run.catch(() => ({ error: "Connection lost. Try again." }));
    setBusy(null);
    if (result?.error) return setError(result.error);
    setRejecting(null);
    setReason("");
    router.refresh();
  }
  const startReject = (row) => { setRejecting(row.id); setReason(""); setError(""); };

  const rejectForm = (row) => (
    <div className="cb-subrow">
      <input className="cb-fld" placeholder={`Reason shown to ${row.owner}`} aria-label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} autoFocus />
      <button type="button" className="cb-btn d" disabled={busy === row.id} onClick={() => decide(row, "rejected", reason)}>Reject creative</button>
      <button type="button" className="cb-btn" onClick={() => setRejecting(null)}>Cancel</button>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", width: "100%" }}>
        {SUGGESTIONS.map((s) => <button key={s} type="button" className="cb-btn" style={{ minHeight: 26, padding: "0 10px", fontWeight: 500 }} onClick={() => setReason(s)}>{s}</button>)}
      </div>
    </div>
  );

  const body = list.length ? (
    <div className="cb-list" style={{ overflowX: "auto" }}>
      <div style={{ minWidth: 560 }}>
        <div className="cb-lh" style={{ gridTemplateColumns: COLS }}><span /><span>Creative</span><span>Category</span><span>Size · sent</span><span /></div>
        {list.map((row) => {
          const done = row.out !== "waiting";
          const clickable = row.kind === "creative";
          return (
            <div key={`${row.kind}${row.id}`} className={`cb-lr${clickable ? " click" : ""}`} style={{ gridTemplateColumns: COLS }} role={clickable ? "button" : undefined} tabIndex={clickable ? 0 : undefined} onClick={clickable ? () => openCard("creative", row.id) : undefined} onKeyDown={clickable ? (e) => { if (e.key === "Enter") openCard("creative", row.id); } : undefined}>
              <Thumb row={row} onClick={clickable ? () => openCard("creative", row.id) : undefined} />
              <div className="cb-who"><div><strong>{row.name}</strong><span className="cb-mute">{row.owner}</span>{row.out === "rejected" && row.note && <span className="cb-mute cb-clamp">Reason: {row.note}</span>}</div></div>
              <div>{catPill(row)}</div>
              <div className="cb-mute" style={{ lineHeight: 1.35 }}>{row.size}<br />{row.created.slice(5).replace("-", "/")}</div>
              <div className="cb-acts">
                {done ? statusPill(row) : (
                  <>
                    <IconBtn icon="check" tip="Approve" disabled={busy === row.id} onClick={() => decide(row, "approved")} />
                    <IconBtn icon="dismiss" tip="Reject…" danger onClick={() => startReject(row)} />
                  </>
                )}
              </div>
              {rejecting === row.id && <div style={{ gridColumn: "1/-1" }} onClick={(e) => e.stopPropagation()}>{rejectForm(row)}</div>}
            </div>
          );
        })}
      </div>
    </div>
  ) : <div className="cb-list"><div className="cb-empty">Nothing here. New creatives appear as advertisers upload them.</div></div>;

  return (
    <>
      <Band
        title="Review creatives"
        info={INFO}
        sub="Approve or reject what advertisers upload."
        tabs={<>
          <Tab current={tab === "new"} count={waiting.length} hot={waiting.length > 0} onClick={() => setTab("new")}>Waiting</Tab>
          <Tab current={tab === "assets"} count={assets.length} onClick={() => setTab("assets")}>Format images</Tab>
          <Tab current={tab === "done"} count={reviewed.length} onClick={() => setTab("done")}>Reviewed</Tab>
        </>}
      />
      <div>
        <DeckShell kind="admin_review" widgets={widgets} groups={groups} defaults={defaults} initial={layout} sub="Last 90 days. Drag the grip to move a widget.">
          <div className="cb-bar">
            <Dropdown label="Category" value={cat} onChange={setCat} options={[["all", "All categories"], ...AD_CATEGORIES.map((c) => [c.id, c.label])]} />
            <span className="cb-sp" />
            <DeckToggle />
          </div>
          {error && <p className="cb-err" role="alert">{error}</p>}
          {!canNote && <p className="notice">Run <code>supabase/migrations/0008_roles_and_moderation.sql</code> in the Supabase SQL editor to enable rejection notes and the reviewed list.</p>}
          {body}
        </DeckShell>
      </div>
    </>
  );
}

