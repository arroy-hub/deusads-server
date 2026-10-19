"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import GameIcon from "../game-icon";
import { resolveDispute, resumeBooking, reviewCreative, setAccountRole, setSuspended } from "./actions";
import { loadCard } from "./card-actions";
import { History } from "./history";
import { CardPopup, Pill } from "./ui";
import { STATES } from "../../../lib/admin-bookings";

const Ctx = createContext({ open: () => {}, close: () => {} });
/** Open any admin card from any admin screen: `const { open } = useCards(); open("booking", id)`. */
export const useCards = () => useContext(Ctx);

const ROLE_NAME = { developer: "Developer", advertiser: "Advertiser", admin: "Admin" };
const WIDTHS = { user: 640, creative: 920, booking: 920, game: 440, dispute: 920 };

/**
 * Keeps the open card in the address (?card=kind:id) so a link opens it, and shows it over whatever screen is up.
 * A card opened from another card replaces it; Back or Escape closes it.
 */
export function CardsProvider({ children }) {
  const router = useRouter();
  const [card, setCard] = useState(null); // { kind, id }
  const [state, setState] = useState({ status: "idle" }); // idle | loading | ready | error
  const seq = useRef(0);

  const read = useCallback(() => {
    const raw = new URL(window.location.href).searchParams.get("card") ?? "";
    const at = raw.indexOf(":");
    setCard(at > 0 ? { kind: raw.slice(0, at), id: raw.slice(at + 1) } : null);
  }, []);
  useEffect(() => {
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, [read]);

  const write = useCallback((next) => {
    const url = new URL(window.location.href);
    if (next) url.searchParams.set("card", `${next.kind}:${next.id}`);
    else url.searchParams.delete("card");
    window.history.pushState(null, "", url);
    setCard(next);
  }, []);

  const load = useCallback(async (target, quiet = false) => {
    const mine = ++seq.current;
    if (!quiet) setState({ status: "loading" });
    const result = await loadCard(target).catch(() => ({ error: "Connection lost. Try again." }));
    if (mine !== seq.current) return;
    setState(result?.error ? { status: "error", error: result.error } : { status: "ready", kind: result.kind, data: result.data });
  }, []);

  useEffect(() => {
    if (card) load(card);
    else { seq.current++; setState({ status: "idle" }); }
  }, [card, load]);

  const api = {
    open: (kind, id) => write({ kind, id: String(id) }),
    close: () => write(null),
    // after a change inside a card: the page behind it and the card itself are read again
    changed: () => { router.refresh(); if (card) load(card, true); },
  };

  return (
    <Ctx.Provider value={api}>
      {children}
      <CardPopup open={Boolean(card)} onClose={api.close} label="Details" width={WIDTHS[card?.kind] ?? 920}>
        {state.status === "loading" && <div className="ad-empty" style={{ background: "#fff" }}>Loading…</div>}
        {state.status === "error" && <div className="ad-empty" style={{ background: "#fff" }}>{state.error}<div style={{ marginTop: 12 }}><button type="button" className="ad-btn" onClick={api.close}>Close</button></div></div>}
        {state.status === "ready" && state.kind === "user" && <UserCard u={state.data} api={api} />}
        {state.status === "ready" && state.kind === "creative" && <CreativeCard d={state.data} api={api} />}
        {state.status === "ready" && state.kind === "booking" && <BookingCard d={state.data} api={api} />}
        {state.status === "ready" && state.kind === "dispute" && <DisputeCard d={state.data} api={api} />}
        {state.status === "ready" && state.kind === "game" && <GameCard g={state.data} api={api} />}
      </CardPopup>
    </Ctx.Provider>
  );
}

const Linkish = ({ onClick, children }) => <button type="button" className="ad-lnk" onClick={onClick}>{children}</button>;
const statusTone = (st) => STATES[st]?.tone ?? "";
const statusLabel = (st) => STATES[st]?.short ?? st;
const OUTCOME_NAME = { removed: "Creative removed", paused: "Booking paused", dismissed: "Dismissed" };
const disputeTone = (d) => (d.status === "open" ? "warn" : d.outcome === "dismissed" ? "good" : "bad");
const disputeLabel = (d) => (d.status === "open" ? "Open" : d.outcome === "removed" ? "Removed" : d.outcome === "paused" ? "Paused" : "Dismissed");

function Head({ eyebrow, title, sub, pill, children }) {
  return (
    <div style={{ minWidth: 0, flex: 1 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="ad-eyebrow">{eyebrow}</div>
          <h2 style={{ margin: "2px 0 0", fontSize: "1.3rem" }}>{title}</h2>
          {sub && <div className="ad-mute">{sub}</div>}
        </div>
        {pill}
      </div>
      {children}
    </div>
  );
}

function Facts({ items }) {
  return (
    <dl style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: "12px 18px", margin: "16px 0 0" }}>
      {items.map(([k, v]) => <div key={k}><dt className="ad-eyebrow" style={{ fontSize: ".7rem" }}>{k}</dt><dd style={{ margin: "2px 0 0", fontWeight: 600, overflowWrap: "anywhere" }}>{v}</dd></div>)}
    </dl>
  );
}

function RowButton({ onClick, main, sub, pill }) {
  return (
    <button type="button" className="ad-lr click" onClick={onClick} style={{ gridTemplateColumns: "minmax(0,1fr) auto", border: "1px solid var(--line)", borderRadius: 10, minHeight: 0, padding: "9px 12px" }}>
      <span>{main}<span className="ad-mute" style={{ display: "block" }}>{sub}</span></span>
      {pill}
    </button>
  );
}

function Picture({ url, label }) {
  return <div className="ad-th" role="img" aria-label={label} style={{ width: "100%", aspectRatio: "1/1", borderRadius: 12, backgroundImage: url ? `url(${url})` : undefined, backgroundColor: "#8c7f73", backgroundSize: "contain", backgroundRepeat: "no-repeat" }} />;
}

/* ------------------------------------------------------------------ user */
function UserCard({ u, api }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run(action) {
    setBusy(true);
    setError("");
    const result = await action().catch(() => ({ error: "Connection lost. Try again." }));
    setBusy(false);
    if (result?.error) return setError(result.error);
    api.changed();
  }
  const initial = (u.company || u.email).trim().charAt(0).toUpperCase();
  return (
    <>
      <div className="ad-pop-head" style={{ background: "#fff" }}>
        <span className="ad-av" style={{ width: 56, height: 56, fontSize: 22, backgroundImage: u.avatarUrl ? `url(${u.avatarUrl})` : undefined }}>{u.avatarUrl ? "" : initial}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="ad-eyebrow">Account · admin view</div>
          <h2>{u.company || "No company name"}</h2>
          <div className="ad-mute">{u.email} · joined {u.joined}</div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <Pill tone={u.role === "admin" ? "info" : ""} dot={false}>{ROLE_NAME[u.role]}</Pill>
          {u.suspended ? <Pill tone="warn">Switched off</Pill> : u.active ? <Pill tone="good">Active</Pill> : <Pill dot={false}>Inactive</Pill>}
        </div>
      </div>
      <div className="ad-pop-body">
        <div className="ad-panel">
          <div className="ad-row"><div><b>Doing now</b></div><div>{u.doing}</div><div /></div>
          {u.games.length > 0 && <div className="ad-row"><div><b>Games</b></div><div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>{u.games.map((g) => <Linkish key={g.id} onClick={() => api.open("game", g.id)}>{g.name}</Linkish>)}</div><div /></div>}
          <div className="ad-row">
            <div><b>Role</b><small>{u.self ? "You cannot change your own role." : "Takes effect at once."}</small></div>
            <div>
              <select className="ad-fld" aria-label="Role" disabled={u.self || busy} value={u.role} onChange={(e) => run(() => setAccountRole({ accountId: u.id, role: e.target.value }))}>
                {Object.entries(ROLE_NAME).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
            <div />
          </div>
          <div className="ad-row">
            <div><b>Account</b><small>Company, picture, sign-in and notifications are on the full account page.</small></div>
            <div><Link className="ad-lnk" href={`/dashboard/admin/users/${u.id}`}>Open full account →</Link></div>
            <div />
          </div>
        </div>
        {error && <p className="ad-err" role="alert" style={{ marginTop: 10 }}>{error}</p>}
      </div>
      <div className="ad-pop-foot">
        <span className="ad-mute">{u.role === "admin" ? "Admins cannot be switched off." : u.suspended ? "Switched off: cannot sign in, ads stopped." : ""}</span>
        <span style={{ flex: 1 }} />
        <button type="button" className="ad-btn" disabled={busy || u.self || u.role === "admin"} onClick={() => run(() => setSuspended({ accountId: u.id, suspended: !u.suspended }))}>{u.suspended ? "Switch on" : "Switch off"}</button>
      </div>
    </>
  );
}

/* -------------------------------------------------------------- creative */
const SUGGESTIONS = ["Category not accepted", "Misleading claim", "Image quality or wrong size", "Brand or trademark issue", "Landing page problem"];

function CreativeCard({ d, api }) {
  const row = d.row;
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function decide(decision) {
    setBusy(true);
    setError("");
    const result = await reviewCreative({ creativeId: row.id, decision, note: reason }).catch(() => ({ error: "Connection lost. Try again." }));
    setBusy(false);
    if (result?.error) return setError(result.error);
    setRejecting(false);
    setReason("");
    api.changed();
  }
  const tone = row.out === "approved" ? "good" : row.out === "rejected" ? "bad" : "warn";
  const label = row.out === "approved" ? "Approved" : row.out === "rejected" ? "Rejected" : "Waiting";
  return (
    <>
      <div style={{ background: "#fff", display: "grid", gridTemplateColumns: "minmax(0,240px) minmax(0,1fr)", gap: 20, padding: 18 }}>
        <Picture url={row.url} label={row.name} />
        <Head eyebrow="Creative" title={row.name} sub={`${row.categoryLabel}${row.restricted ? " · restricted category" : ""}`} pill={<Pill tone={tone}>{label}</Pill>}>
          <Facts items={[["Advertiser", row.ownerId ? <Linkish onClick={() => api.open("user", row.ownerId)}>{row.owner}</Linkish> : row.owner], ["Contact", row.email || "—"], ["Size", row.size], ["Uploaded", row.created]]} />
        </Head>
      </div>
      <div className="ad-note"><b>Now:</b> {row.out === "waiting" ? "Waiting for review." : row.out === "approved" ? "Approved and reaching the SDK." : `Rejected${row.note ? `: ${row.note}` : "."}`} {d.bookings.length} booking{d.bookings.length === 1 ? "" : "s"}, {d.openDisputes} open dispute{d.openDisputes === 1 ? "" : "s"}.</div>
      <div className="ad-pop-body">
        <h3 style={{ margin: "4px 0 10px", fontSize: ".9rem" }}>Where it runs</h3>
        {d.bookings.length ? (
          <div style={{ display: "grid", gap: 8 }}>
            {d.bookings.map((b) => <RowButton key={b.id} onClick={() => api.open("booking", b.id)} main={<><b>{b.game}</b> · {b.placement}</>} sub={`${b.advertiser} → ${b.developer} · ${b.dates || "No dates"}`} pill={<Pill tone={statusTone(b.state)}>{statusLabel(b.state)}</Pill>} />)}
          </div>
        ) : <p className="ad-mute" style={{ margin: 0 }}>Not booked anywhere yet.</p>}
        {d.disputes.length > 0 && (
          <>
            <h3 style={{ margin: "18px 0 10px", fontSize: ".9rem" }}>Disputes about it</h3>
            <div style={{ display: "grid", gap: 8 }}>
              {d.disputes.map((x) => <RowButton key={x.id} onClick={() => api.open("dispute", x.id)} main={x.reason} sub={`From ${x.initiator} · ${x.game} · ${x.when}`} pill={<Pill tone={disputeTone(x)}>{disputeLabel(x)}</Pill>} />)}
            </div>
          </>
        )}
        <h3 style={{ margin: "18px 0 10px", fontSize: ".9rem" }}>History <span className="ad-mute" style={{ fontWeight: 400 }}>· click a step for details</span></h3>
        <History events={d.events} />
      </div>
      <div className="ad-pop-foot">
        {row.out === "waiting" && row.kind === "creative" ? (
          rejecting ? (
            <>
              <input className="ad-fld" style={{ flex: 1, minWidth: 200 }} placeholder={`Reason shown to ${row.owner}`} aria-label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
              <button type="button" className="ad-btn d" disabled={busy} onClick={() => decide("rejected")}>Reject creative</button>
              <button type="button" className="ad-btn" onClick={() => setRejecting(false)}>Cancel</button>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", width: "100%" }}>
                {SUGGESTIONS.map((s) => <button key={s} type="button" className="ad-btn" style={{ minHeight: 26, padding: "0 10px", fontWeight: 500 }} onClick={() => setReason(s)}>{s}</button>)}
              </div>
            </>
          ) : (
            <>
              <button type="button" className="ad-btn main" disabled={busy} onClick={() => decide("approved")}>Approve</button>
              <button type="button" className="ad-btn" onClick={() => setRejecting(true)}>Reject…</button>
            </>
          )
        ) : <span className="ad-mute">Reviewed. To take an approved creative off the platform, use a dispute.</span>}
        {error && <span className="ad-err" role="alert">{error}</span>}
      </div>
    </>
  );
}

/* --------------------------------------------------------------- booking */
function BookingCard({ d, api }) {
  const b = d.row;
  const fmt = (n) => (n == null ? "—" : n.toLocaleString("en-US").replace(/,/g, " "));
  return (
    <>
      <div style={{ background: "#fff", display: "grid", gridTemplateColumns: "minmax(0,240px) minmax(0,1fr)", gap: 20, padding: 18 }}>
        <Picture url={b.creativeUrl} label={b.creative} />
        <Head eyebrow={`Booking`} title={<Linkish onClick={() => api.open("creative", b.creativeId)}>{b.creative}</Linkish>} sub={`${b.campaign} · ${b.categoryLabel}`} pill={<Pill tone={statusTone(b.state)}>{STATES[b.state].label}</Pill>}>
          <Facts items={[
            ["Advertiser", <Linkish key="a" onClick={() => api.open("user", b.advertiserId)}>{b.advertiser}</Linkish>],
            ["Developer", <Linkish key="d" onClick={() => api.open("user", b.developerId)}>{b.developer}</Linkish>],
            ["Game", b.gameId ? <Linkish onClick={() => api.open("game", b.gameId)}>{b.game}</Linkish> : b.game],
            ["Placement", b.placement],
            ["Period", b.dates || "No dates"],
            ["Impressions", fmt(b.impressions)],
          ]} />
          {b.progress != null && <div style={{ marginTop: 12, height: 6, borderRadius: 99, background: "#ece5dd", overflow: "hidden" }}><i style={{ display: "block", height: "100%", width: `${b.progress}%`, background: b.state === "paused" ? "#b87400" : b.state === "ended" ? "#b8ada1" : "#1b8a50" }} /></div>}
        </Head>
      </div>
      <div className="ad-note"><b>Now:</b> {d.now}</div>
      <div className="ad-pop-body">
        {d.disputes.length > 0 && (
          <>
            <h3 style={{ margin: "4px 0 10px", fontSize: ".9rem" }}>Disputes about this booking</h3>
            <div style={{ display: "grid", gap: 8 }}>
              {d.disputes.map((x) => <RowButton key={x.id} onClick={() => api.open("dispute", x.id)} main={<><b>#{String(x.id).slice(0, 6)}</b> · {x.reason}</>} sub={`From ${x.initiator} · ${x.when}`} pill={<Pill tone={disputeTone(x)}>{disputeLabel(x)}</Pill>} />)}
            </div>
          </>
        )}
        <h3 style={{ margin: `${d.disputes.length ? 18 : 4}px 0 10px`, fontSize: ".9rem" }}>History <span className="ad-mute" style={{ fontWeight: 400 }}>· click a step for details</span></h3>
        <History events={d.events} />
      </div>
      <div className="ad-pop-foot"><span className="ad-mute">A booking is made between the advertiser and the developer. To pause one, use a dispute.</span></div>
    </>
  );
}

/* ------------------------------------------------------------------ game */
function GameCard({ g, api }) {
  const c = g.conn;
  const mode = c.mode === "ok" ? ["#3fb577", "#1f6b3a"] : c.mode === "new" ? ["#9aa0a6", "#5b524a"] : ["#e0a23a", "#8a5a00"];
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
  return (
    <div style={{ background: "#fff", overflow: "auto" }}>
      <article className="gm-card" style={{ position: "relative" }}>
        <div className="gm-cover" style={{ background: g.coverCss }} />
        <div className="gm-body">
          <div className="gm-plate">
            <span className="gm-icon"><GameIcon name={g.name} url={g.iconUrl} /><i className="gm-status" style={{ background: mode[0] }} role="img" aria-label={`SDK: ${c.label}`} /></span>
            <div><h2>{g.name}</h2><div className="gm-sub"><b style={{ color: mode[1] }}>{c.label}</b> · {c.line}</div></div>
          </div>
          <div className="gm-chips"><span>{plural(g.placements, "placement")}</span><span>{plural(g.campaigns, "campaign")}</span></div>
        </div>
        <button type="button" className="gm-link" onClick={() => api.open("user", g.developer.id)}>Developer: {g.developer.name}<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg></button>
      </article>
      <div style={{ padding: "16px 24px 22px", background: "var(--surface)", borderTop: "1px solid var(--line)" }}>
        {g.facts.length > 0 && <div className="ad-mute">{g.facts.join(" · ")}</div>}
        <h3 style={{ margin: "14px 0 8px", fontSize: ".9rem" }}>Bookings</h3>
        {g.bookings.length ? <div style={{ display: "grid", gap: 8 }}>{g.bookings.map((b) => <RowButton key={b.id} onClick={() => api.open("booking", b.id)} main={b.creative} sub={`${b.advertiser} · ${b.placement}`} pill={<Pill tone={statusTone(b.state)}>{statusLabel(b.state)}</Pill>} />)}</div> : <p className="ad-mute" style={{ margin: 0 }}>No bookings.</p>}
        <h3 style={{ margin: "14px 0 8px", fontSize: ".9rem" }}>Disputes</h3>
        {g.disputes.length ? <div style={{ display: "grid", gap: 8 }}>{g.disputes.map((x) => <RowButton key={x.id} onClick={() => api.open("dispute", x.id)} main={x.reason} sub={`From ${x.initiator} · ${x.when}`} pill={<Pill tone={disputeTone(x)}>{disputeLabel(x)}</Pill>} />)}</div> : <p className="ad-mute" style={{ margin: 0 }}>No disputes.</p>}
        <div style={{ marginTop: 14 }}><Link className="ad-btn" href={`/dashboard/admin/traffic?game=${g.id}`}>Show in Traffic</Link></div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- dispute */
function DisputeCard({ d, api }) {
  const r = d.row;
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function decide(decision) {
    setBusy(true);
    setError("");
    const result = await resolveDispute({ disputeId: r.id, decision, note }).catch(() => ({ error: "Connection lost. Try again." }));
    setBusy(false);
    if (result?.error) return setError(result.error);
    setNote("");
    api.changed();
  }
  const tone = r.open ? "warn" : r.status === "dismissed" ? "good" : "bad";
  const label = r.open ? "Open" : OUTCOME_NAME[r.status];
  return (
    <>
      <div style={{ background: "#fff", display: "grid", gridTemplateColumns: "minmax(0,240px) minmax(0,1fr)", gap: 20, padding: 18 }}>
        <Picture url={r.creativeUrl} label={r.creative} />
        <Head eyebrow={`Dispute · from ${r.initiator}`} title={r.reason} sub={r.comment || "No comment."} pill={<Pill tone={tone}>{label}</Pill>}>
          <Facts items={[
            ["Reported by", <Linkish key="by" onClick={() => api.open("user", r.byId)}>{r.by}</Linkish>],
            ["Reported", r.againstId ? <Linkish onClick={() => api.open("user", r.againstId)}>{r.against}</Linkish> : r.against],
            ["Creative", <Linkish key="c" onClick={() => api.open("creative", r.creativeId)}>{r.creative}</Linkish>],
            ["Game", <Linkish key="g" onClick={() => api.open("game", r.gameId)}>{r.game}</Linkish>],
            ["Opened", r.created],
            ["Category", r.categoryLabel],
          ]} />
          {d.booking && <div style={{ marginTop: 12 }}><Linkish onClick={() => api.open("booking", d.booking.id)}>Open the booking ({d.booking.placement}) →</Linkish></div>}
        </Head>
      </div>
      <div className="ad-pop-body">
        <h3 style={{ margin: "4px 0 10px", fontSize: ".9rem" }}>History <span className="ad-mute" style={{ fontWeight: 400 }}>· click a step for details</span></h3>
        <History events={d.events} />
      </div>
      <div className="ad-pop-foot">
        {r.open ? (
          <>
            <input className="ad-fld" style={{ flex: 1, minWidth: 200 }} placeholder="Note for the record (optional)" aria-label="Note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
            <button type="button" className="ad-btn d" disabled={busy} onClick={() => decide("remove")}>Remove creative</button>
            <button type="button" className="ad-btn" disabled={busy} onClick={() => decide("pause")}>Pause booking</button>
            <button type="button" className="ad-btn" disabled={busy} onClick={() => decide("dismiss")}>Dismiss</button>
          </>
        ) : (
          <>
            <span className="ad-mute">Settled: {OUTCOME_NAME[r.status].toLowerCase()}.{r.adminNote ? ` ${r.adminNote}` : ""}</span>
            {r.status === "paused" && d.booking && <button type="button" className="ad-btn" disabled={busy} onClick={async () => { setBusy(true); const x = await resumeBooking({ bookingId: d.booking.id }).catch(() => ({ error: "Connection lost." })); setBusy(false); x?.error ? setError(x.error) : api.changed(); }}>Resume booking</button>}
          </>
        )}
        {error && <span className="ad-err" role="alert">{error}</span>}
      </div>
    </>
  );
}
