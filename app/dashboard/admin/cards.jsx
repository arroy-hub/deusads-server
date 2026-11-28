"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { resolveDispute, reviewCreative, reviewAsset, addDisputeNote, replyToAdvertiser, withdrawDecision } from "./actions";
import { loadCard } from "./card-actions";
import { History } from "./history";
import { BigPv, CardPopup, CatPill, Lnk, Pill, toast } from "./ui";
import { UserCard } from "./user-card";
import { STATES } from "../../../lib/admin-bookings";
import { refreshPage, useWaitMark } from "../wait";
import { outcomePill } from "../../../lib/admin-disputes";
import { EFFECT, needsRule } from "../../../lib/report-rules";
import { ADVERTISER_RULES, ruleForReason } from "../../../lib/platform-rules";

const Ctx = createContext({ open: () => {}, closeAll: () => {} });
/** Open any admin card from any admin screen: `const { open } = useCards(); open("booking", id)`. */
export const useCards = () => useContext(Ctx);

const BASE = new Set(["dispute", "user"]); // the card under: a dispute or an account
const read = (raw) => {
  const at = (raw ?? "").indexOf(":");
  return at > 0 ? { kind: raw.slice(0, at), id: raw.slice(at + 1) } : null;
};

/**
 * Keeps the open cards in the address (?card=dispute:ID&over=booking:ID) so a link opens them, and shows them over whatever
 * screen is up, as in the mockup: a dispute or an account is the card underneath; a booking, a game or a creative opens over it
 * (and replaces another of those). Closing the top card shows the one underneath again.
 */
export function CardsProvider({ children }) {
  const router = useRouter();
  const [base, setBase] = useState(null);
  const [over, setOver] = useState(null);

  const sync = useCallback(() => {
    const q = new URL(window.location.href).searchParams;
    setBase(read(q.get("card")));
    setOver(read(q.get("over")));
  }, []);
  useEffect(() => {
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [sync]);

  const write = useCallback((nextBase, nextOver) => {
    const url = new URL(window.location.href);
    if (nextBase) url.searchParams.set("card", `${nextBase.kind}:${nextBase.id}`); else url.searchParams.delete("card");
    if (nextOver) url.searchParams.set("over", `${nextOver.kind}:${nextOver.id}`); else url.searchParams.delete("over");
    window.history.pushState(null, "", url);
    setBase(nextBase);
    setOver(nextOver);
  }, []);

  const api = {
    open: (kind, id) => {
      const target = { kind, id: String(id) };
      if (kind === "dispute") {
        // a dispute lives on the Disputes screen
        if (!window.location.pathname.startsWith("/dashboard/admin/disputes")) { router.push(`/dashboard/admin/disputes?card=dispute:${target.id}`); return; }
        write(target, null);
      } else if (kind === "user") {
        let mode = "popup";
        try { mode = window.localStorage.getItem("cb-user-mode") || "popup"; } catch {}
        if (mode === "page") { router.push(`/dashboard/admin/users/${target.id}`); return; }
        write(target, null);
      } else write(base, target);
    },
    // the ✕ of a top card closes it and the account under it (the mockup's bkclose); a dispute stays
    closeOver: () => write(base && base.kind === "user" ? null : base, null),
    closeBase: () => write(null, over),
    closeAll: () => write(null, null),
    // after a change inside a card: the page behind it and the cards are read again
    changed: () => refreshPage(router),
  };

  return (
    <Ctx.Provider value={api}>
      {children}
      <Layer target={base} label={base?.kind === "user" ? "Account" : "Dispute"} width={base?.kind === "user" ? 760 : 920} onClose={api.closeBase} api={api} version={0} />
      <Layer target={over} label="Details" width={over?.kind === "game" ? 440 : 920} onClose={api.closeOver} api={api} version={0} />
    </Ctx.Provider>
  );
}

/** One dialog showing one card; the card's data is read when it opens and again when something in it changed. */
function Layer({ target, label, width, onClose, api }) {
  const [state, setState] = useState({ status: "idle" });
  const seq = useRef(0);
  const key = target ? `${target.kind}:${target.id}` : "";
  const load = useCallback(async (quiet) => {
    if (!target) return;
    const mine = ++seq.current;
    if (!quiet) setState({ status: "loading" });
    const result = await loadCard(target).catch(() => ({ error: "Connection lost. Try again." }));
    if (mine !== seq.current) return;
    setState(result?.error ? { status: "error", error: result.error } : { status: "ready", kind: result.kind, data: result.data });
  }, [target]);
  useEffect(() => {
    if (key) load(false);
    else { seq.current++; setState({ status: "idle" }); }
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const layerApi = { ...api, changed: () => { api.changed(); load(true); } };

  return (
    <CardPopup open={Boolean(target)} onClose={onClose} label={label} width={width} outside={false}>
      {state.status === "loading" && <div className="cb-card-load">Loading…</div>}
      {state.status === "error" && <div className="cb-card-load">{state.error}<div style={{ marginTop: 12 }}><button type="button" className="cb-btn cb-q cb-s" onClick={onClose}>Close</button></div></div>}
      {state.status === "ready" && state.kind === "user" && <UserCard key={key} u={state.data} api={layerApi} onClose={onClose} />}
      {state.status === "ready" && state.kind === "creative" && <CreativeCard key={key} d={state.data} api={layerApi} onClose={onClose} />}
      {state.status === "ready" && state.kind === "booking" && <BookingCard key={key} d={state.data} api={layerApi} onClose={onClose} />}
      {state.status === "ready" && state.kind === "dispute" && <DisputeCard key={key} d={state.data} api={layerApi} onClose={onClose} />}
      {state.status === "ready" && state.kind === "game" && <GameCard key={key} g={state.data} api={layerApi} onClose={onClose} />}
    </CardPopup>
  );
}

const eyebrow = { fontSize: 12, letterSpacing: ".06em", textTransform: "uppercase", fontWeight: 600 };
const subNote = { display: "block", fontSize: 12.5 };
const settled = (x) => outcomePill({ status: x.outcome ?? "dismissed", initiator: x.initiator });
const disputeTone = (x) => (x.status === "open" ? "warn" : settled(x)[1]);
const disputeLabel = (x) => (x.status === "open" ? "Open" : settled(x)[0]);
const CloseX = ({ onClose }) => <button type="button" className="cb-btn cb-q cb-s" aria-label="Close" style={{ padding: "0 10px" }} onClick={onClose}>✕</button>;
const HistoryHead = ({ first }) => <h3 className="cb-dm-h" style={first ? { marginTop: 4 } : undefined}>History <span className="cb-mute" style={{ fontWeight: 400, fontSize: 12.5 }}>· click a step for details</span></h3>;

/** The mockup's .bkds list: a button per related booking or dispute. */
function Related({ items, onOpen }) {
  return (
    <div className="cb-bkds">
      {items.map((x) => (
        <button key={x.key} type="button" className="cb-bkd" onClick={() => onOpen(x)}>
          <span>{x.main}<span className="cb-mute" style={subNote}>{x.sub}</span></span>
          <span className={`cb-pill${x.tone ? ` cb-${x.tone}` : ""}`}>{x.label}</span>
        </button>
      ))}
    </div>
  );
}
const disputeItems = (list) => list.map((x) => ({ key: x.id, main: <><b>#{String(x.id).slice(0, 6)}</b> · {x.reason}</>, sub: `From ${x.initiator} · ${x.when}`, tone: disputeTone(x), label: disputeLabel(x), kind: "dispute", id: x.id }));

/* --------------------------------------------------------------- dispute */
export function DisputeCard({ d, api, onClose }) {
  const r = d.row;
  const adv = r.initiator === "advertiser";
  const [busy, setBusy] = useState(false);
  useWaitMark(Boolean(busy));
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const noteRef = useRef(null);
  useEffect(() => { if (noteOpen) noteRef.current?.focus(); }, [noteOpen]);
  const bk = d.booking;
  const bookingWord = (text) => {
    const m = bk ? /\bbooking\b/i.exec(text) : null;
    return m ? <>{text.slice(0, m.index)}<Lnk onClick={() => api.open("booking", bk.id)}>{m[0]}</Lnk>{text.slice(m.index + m[0].length)}</> : text;
  };

  // A developer's report is decided in a form: the rule, a message to the advertiser, a message to the developer.
  const [choice, setChoice] = useState(null); // dismiss | change | remove
  const [rule, setRule] = useState(() => ruleForReason(r.reason));
  const [toAdv, setToAdv] = useState("");
  const [toDev, setToDev] = useState("");
  const [problem, setProblem] = useState("");
  const formRef = useRef(null);
  useEffect(() => { if (choice) formRef.current?.scrollIntoView({ block: "nearest" }); }, [choice]);
  const pick = (next) => { setChoice(next); setProblem(""); };

  async function decide(decision) {
    if (!adv && needsRule(decision) && !toAdv.trim()) return setProblem("Write to the advertiser what is wrong: they see the rule and this message.");
    setBusy(true);
    const result = await resolveDispute({ disputeId: r.id, decision, note: "", rule: adv ? null : rule, advNote: adv ? "" : toAdv, devNote: adv ? "" : toDev }).catch(() => ({ error: "Connection lost. Try again." }));
    setBusy(false);
    if (result?.error) return adv ? toast(result.error) : setProblem(result.error);
    toast(decision === "remove" ? `${r.shape ? "Picture" : "Creative"} blocked. Advertiser and developer notified` : decision === "change" ? "Change requested. Advertiser and developer notified" : decision === "pause" ? "Booking paused. Both sides notified" : adv ? "Report dismissed. Both sides notified" : "No violation found. Developer notified");
    setChoice(null);
    api.changed();
  }
  // While the creative is held by this decision: DeusADS can answer its advertiser, or take the decision back.
  const [replyOpen, setReplyOpen] = useState(false);
  const [reply, setReply] = useState("");
  const [backing, setBacking] = useState(false);
  const replyRef = useRef(null);
  useEffect(() => { if (replyOpen) replyRef.current?.focus(); }, [replyOpen]);
  async function sendReply() {
    const text = reply.trim();
    if (!text) return;
    setBusy(true);
    const result = await replyToAdvertiser({ disputeId: r.id, text }).catch(() => ({ error: "Connection lost. Try again." }));
    setBusy(false);
    if (result?.error) return toast(result.error);
    setReply("");
    setReplyOpen(false);
    toast("Reply sent. Advertiser notified");
    api.changed();
  }
  async function takeBack() {
    setBusy(true);
    const result = await withdrawDecision({ disputeId: r.id, note: "" }).catch(() => ({ error: "Connection lost. Try again." }));
    setBusy(false);
    setBacking(false);
    if (result?.error) return toast(result.error);
    toast(`Decision taken back. The ${r.shape ? "picture" : "creative"} runs again; both sides notified`);
    api.changed();
  }
  async function addNote() {
    const text = note.trim();
    setNoteOpen(false);
    if (!text) return;
    const result = await addDisputeNote({ disputeId: r.id, text }).catch(() => ({ error: "Connection lost. Try again." }));
    if (result?.error) return toast(result.error);
    setNote("");
    toast("Note added");
    api.changed();
  }
  const [pillLabel, pillTone] = r.open ? ["Open", "warn"] : outcomePill(r);
  const title = { dismiss: "No violation", change: "Ask the advertiser to change it", remove: r.shape ? "Block this picture for a violation" : "Block the creative for a violation" }[choice];
  const lede = { dismiss: "The report is closed, the creative keeps running.", change: r.shape ? "For something easy to fix: this picture waits for a new one; other shapes keep running." : "For something easy to fix: the creative waits for a new version.", remove: r.shape ? "For a clear violation: this picture is removed for good; other shapes keep running." : "For a clear violation: the creative is removed for good." }[choice];
  return (
    <div className="cb-box cb-dm" role="dialog" aria-label="Dispute">
      <div className="cb-dm-top"><div className="cb-dm-card">
        <div className="cb-dm-main">
          <BigPv className="cb-dm-pv" seed={r.creativeId} tag={r.creative} url={r.creativeUrl} whole />
          <div className="cb-dm-info">
            <div style={{ display: "flex", alignItems: "start", gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="cb-mute" style={eyebrow}>Dispute #{String(r.id).slice(0, 6)}</div>
                <h2><Lnk onClick={() => api.open("creative", r.creativeId)}>{r.picture ?? r.creative}</Lnk></h2>
                <div className="cb-mute">{r.adv} · {d.campaign || "No campaign"} · {adv ? bookingWord(`booking in ${r.game}`) : <>{r.categoryLabel}{d.creative.size ? ` · ${d.creative.size}` : ""}</>}</div>
              </div>
              <Pill tone={pillTone}>{r.status === "paused" ? "Booking paused" : pillLabel}</Pill>
              <CloseX onClose={onClose} />
            </div>
            <div className="cb-dm-prob">
              <span className="cb-pill cb-bad">{r.reason}</span> <span className={`cb-pill cb-${adv ? "info" : "warn"} cb-nodot`}>From {r.initiator}</span>
              <span className="cb-mute" style={{ display: "block", margin: "6px 0 2px" }}>
                {adv ? <>{r.adv} reported {bookingWord("its booking in " + r.game)} ({r.dev})</> : <>Reported in <Lnk onClick={() => api.open("game", r.gameId)}>{r.game}</Lnk> by {r.dev}</>} · {d.events[0]?.when}
              </span>
              {r.comment && <div style={{ fontSize: 14 }}>{r.comment}</div>}
            </div>
          </div>
        </div>
        <div className="cb-dm-now"><b>Now:</b> {d.now}{bk && <> <span className="cb-mute">·</span> <Lnk onClick={() => api.open("booking", bk.id)}>Open the booking</Lnk></>}</div>
      </div></div>
      <div className="cb-dm-body">
        <HistoryHead first /><History events={d.events} />
        {r.open && !adv && choice && (
          <div className="cb-dform" ref={formRef}>
            <div className="cb-dform-h"><b>{title}</b><span className="cb-mute">{lede}</span></div>
            {needsRule(choice) && <>
              <label className="cb-dfl" htmlFor="dm-rule">Rule {choice === "remove" ? "broken" : "involved"} <span className="cb-mute">shown to the advertiser</span></label>
              <select id="dm-rule" className="cb-fld" value={rule} onChange={(e) => setRule(e.target.value)}>{ADVERTISER_RULES.map((x) => <option key={x}>{x}</option>)}</select>
              <label className="cb-dfl" htmlFor="dm-adv">Message to the advertiser <span className="cb-dreq">required</span></label>
              <textarea id="dm-adv" rows={3} className="cb-fld" maxLength={500} placeholder={choice === "remove" ? "What exactly breaks the rule" : "What to change so it can run again"} value={toAdv} onChange={(e) => { setToAdv(e.target.value); setProblem(""); }} />
            </>}
            <label className="cb-dfl" htmlFor="dm-dev">Message to the developer <span className="cb-mute">optional</span></label>
            <textarea id="dm-dev" rows={2} className="cb-fld" maxLength={500} placeholder="Shown in the developer’s report, under the outcome" value={toDev} onChange={(e) => setToDev(e.target.value)} />
            <p className="cb-dwhat"><b>What happens:</b> {EFFECT[choice]}</p>
            {problem && <p className="cb-derr" role="alert">{problem}</p>}
          </div>
        )}
      </div>
      <div className="cb-dm-foot">
        {r.open && adv && <>
          <button type="button" className="cb-btn cb-d" disabled={busy} onClick={() => decide("pause")}>Pause booking</button>
          <button type="button" className="cb-btn cb-q" disabled={busy} onClick={() => decide("dismiss")}>Dismiss report</button>
        </>}
        {r.open && !adv && (choice ? <>
          <button type="button" className={`cb-btn${choice === "remove" ? " cb-d" : ""}`} disabled={busy} onClick={() => decide(choice)}>{{ dismiss: "Confirm: no violation", change: "Send to the advertiser", remove: r.shape ? "Block the picture" : "Block the creative" }[choice]}</button>
          <button type="button" className="cb-btn cb-q" disabled={busy} onClick={() => pick(null)}>Back</button>
        </> : <>
          <button type="button" className="cb-btn cb-d" onClick={() => pick("remove")}>{r.shape ? "Block the picture" : "Block the creative"}</button>
          <button type="button" className="cb-btn cb-q" onClick={() => pick("change")}>Ask to change it</button>
          <button type="button" className="cb-btn cb-q" onClick={() => pick("dismiss")}>No violation</button>
        </>)}
        {!r.open && !adv && r.heldHere && (backing ? <>
          <span style={{ fontSize: 13.5 }}>Take the decision back? The {r.shape ? "picture" : "creative"} runs again where it ran.</span>
          <button type="button" className="cb-btn cb-s" disabled={busy} onClick={takeBack}>Yes, take it back</button>
          <button type="button" className="cb-btn cb-q cb-s" disabled={busy} onClick={() => setBacking(false)}>Keep</button>
        </> : <>
          <span style={{ position: "relative" }}>
            <button type="button" className="cb-btn" aria-expanded={replyOpen} onClick={() => setReplyOpen(!replyOpen)}>Reply to the advertiser</button>
            {replyOpen && (
              <div className="cb-npop cb-npop-l" role="dialog" aria-label="Reply to the advertiser">
                <b>Reply to {r.adv}</b><span className="cb-mute">They read it under the decision, on the creative</span>
                <textarea ref={replyRef} rows={4} className="cb-fld" style={{ width: "100%", height: "auto", padding: "8px 10px" }} aria-label="Reply to the advertiser" value={reply} maxLength={1000} onChange={(e) => setReply(e.target.value)} />
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button type="button" className="cb-btn cb-q cb-s" onClick={() => setReplyOpen(false)}>Cancel</button>
                  <button type="button" className="cb-btn cb-s" disabled={busy || !reply.trim()} onClick={sendReply}>Send</button>
                </div>
              </div>
            )}
          </span>
          <button type="button" className="cb-btn cb-q" disabled={busy} onClick={() => setBacking(true)}>Take the decision back</button>
        </>)}
        <span style={{ flex: 1 }} />
        <span style={{ position: "relative" }}>
          <button type="button" className="cb-btn cb-q" aria-expanded={noteOpen} onClick={() => setNoteOpen(!noteOpen)}>Add note</button>
          {noteOpen && (
            <div className="cb-npop" role="dialog" aria-label="Internal note">
              <b>Internal note</b><span className="cb-mute">Visible only to admins</span>
              <textarea ref={noteRef} rows={3} className="cb-fld" style={{ width: "100%", height: "auto", padding: "8px 10px" }} aria-label="Internal note" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button type="button" className="cb-btn cb-q cb-s" onClick={() => setNoteOpen(false)}>Cancel</button>
                <button type="button" className="cb-btn cb-s" onClick={addNote}>Add</button>
              </div>
            </div>
          )}
        </span>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- booking */
function BookingCard({ d, api, onClose }) {
  const b = d.row;
  const st = STATES[b.state];
  const items = disputeItems(d.disputes);
  return (
    <div className="cb-box cb-dm" role="dialog" aria-label="Booking">
      <div className="cb-dm-top"><div className="cb-dm-card">
        <div className="cb-dm-main">
          <BigPv className="cb-dm-pv" seed={b.creativeId} tag={String(b.creative).split(" ")[0]} url={b.creativeUrl} />
          <div className="cb-dm-info">
            <div style={{ display: "flex", alignItems: "start", gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="cb-mute" style={eyebrow}>Booking #{String(b.id).slice(0, 6)}</div>
                <h2><Lnk onClick={() => api.open("creative", b.creativeId)}>{b.creative}</Lnk></h2>
                <div className="cb-mute">{b.campaign} · {b.categoryLabel}</div>
              </div>
              <Pill tone={st.tone}>{b.statusLabel}</Pill>
              <CloseX onClose={onClose} />
            </div>
            <dl className="cb-facts" style={{ gridTemplateColumns: "repeat(2,minmax(0,1fr))" }}>
              <div><dt>Advertiser</dt><dd><Lnk onClick={() => api.open("user", b.advertiserId)}>{b.advertiser}</Lnk></dd></div>
              <div><dt>Developer</dt><dd><Lnk onClick={() => api.open("user", b.developerId)}>{b.developer}</Lnk></dd></div>
              <div><dt>Game</dt><dd>{b.gameId ? <Lnk onClick={() => api.open("game", b.gameId)}>{b.game}</Lnk> : b.game}</dd></div>
              <div><dt>Placement</dt><dd>{b.placement}</dd></div>
              <div><dt>Period</dt><dd>{b.period}</dd></div>
              <div><dt>Size</dt><dd>{b.creativeSize || "—"}</dd></div>
            </dl>
            <div className={`cb-dr${b.state === "paused" ? " cb-paused" : b.state === "ended" ? " cb-over" : ""}`} style={{ minWidth: 0 }}>
              <span>{b.impressions != null ? `${Number(b.impressions).toLocaleString("en-US").replace(/,/g, " ")} impressions` : "Impressions not counted yet"}</span>
              <div className="cb-tr"><i style={{ width: `${b.state === "scheduled" ? 0 : b.progress ?? 0}%` }} /></div>
            </div>
          </div>
        </div>
        <div className="cb-dm-now"><b>Now:</b> {d.now}</div>
      </div></div>
      <div className="cb-dm-body">
        {items.length > 0 && <><h3 className="cb-dm-h" style={{ marginTop: 4 }}>Disputes about this booking</h3><Related items={items} onOpen={(x) => api.open("dispute", x.id)} /></>}
        <h3 className="cb-dm-h" style={items.length ? undefined : { marginTop: 4 }}>History <span className="cb-mute" style={{ fontWeight: 400, fontSize: 12.5 }}>· click a step for details</span></h3>
        <History events={d.events} />
      </div>
      <div className="cb-dm-foot"><span className="cb-mute">Read-only. A booking is made between the advertiser and the developer.</span></div>
    </div>
  );
}

/* ------------------------------------------------------------------ game */
function GameCard({ g, api, onClose }) {
  const c = g.conn;
  const mode = c.mode === "ok" ? ["#3fb577", "#1f6b3a"] : c.mode === "new" ? ["#9aa0a6", "#5b524a"] : ["#e0a23a", "#8a5a00"];
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const bookings = g.bookings.map((b) => ({ key: b.id, main: <b>{b.creative}</b>, sub: `${b.advertiser} · ${b.placement}`, tone: STATES[b.state].tone, label: b.label, id: b.id }));
  return (
    <div className="cb-box cb-dm cb-gmx" role="dialog" aria-label="Game card">
      <article className="cb-gm-card">
        <div className="cb-gm-cover" style={{ background: g.coverCss }} />
        <button type="button" className="cb-btn cb-q cb-s cb-gm-x" aria-label="Close" onClick={onClose}>✕</button>
        <div className="cb-gm-body">
          <div className="cb-gm-plate">
            <span className="cb-gm-icon">
              {g.iconUrl ? /* eslint-disable-next-line @next/next/no-img-element */ <img className="cb-gicon" src={g.iconUrl} alt="" style={{ objectFit: "cover" }} /> : <span className="cb-gicon">{g.name.trim().charAt(0).toUpperCase() || "?"}</span>}
              <i className="cb-gm-status" style={{ background: mode[0] }} role="img" aria-label={`SDK: ${c.label}`} />
            </span>
            <div><h2>{g.name}</h2><div className="cb-gm-sub"><b style={{ color: mode[1] }}>{c.label}</b> · {c.line}</div></div>
          </div>
          <div className="cb-gm-chips"><span>{plural(g.placements, "placement")}</span><span>{plural(g.campaigns, "campaign")}</span></div>
        </div>
        <button type="button" className="cb-gm-link" onClick={() => api.open("user", g.developer.id)}>
          <span>Developer: {g.developer.name}</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
        </button>
      </article>
      <div className="cb-gmx-more">
        {g.facts.length > 0 && <div className="cb-mute" style={{ fontSize: 12.5 }}>{g.facts.join(" · ")}</div>}
        <h3 className="cb-dm-h" style={{ margin: "14px 0 8px" }}>Bookings</h3>
        {bookings.length ? <Related items={bookings} onOpen={(x) => api.open("booking", x.id)} /> : <p className="cb-mute" style={{ margin: 0 }}>No bookings.</p>}
        <h3 className="cb-dm-h" style={{ margin: "14px 0 8px" }}>Disputes</h3>
        {g.disputes.length ? <Related items={disputeItems(g.disputes)} onOpen={(x) => api.open("dispute", x.id)} /> : <p className="cb-mute" style={{ margin: 0 }}>No disputes.</p>}
        <div style={{ marginTop: 14 }}><button type="button" className="cb-btn cb-q cb-s" onClick={() => { api.closeAll(); window.location.assign(`/dashboard/admin/traffic?game=${g.id}`); }}>Show in Traffic</button></div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- creative */
function CreativeCard({ d, api, onClose }) {
  const row = d.row;
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  useWaitMark(Boolean(busy));
  async function decide(decision) {
    setBusy(true);
    const call = row.kind === "asset" ? reviewAsset({ assetId: row.id, decision, note: reason }) : reviewCreative({ creativeId: row.id, decision, note: reason });
    const result = await call.catch(() => ({ error: "Connection lost. Try again." }));
    setBusy(false);
    if (result?.error) return toast(result.error);
    setRejecting(false);
    setReason("");
    toast(decision === "approved" ? "Approved: now reaches the SDK" : "Rejected: the owner will see the reason");
    api.changed();
  }
  const pending = row.out === "waiting";
  const tone = row.out === "approved" ? "good" : row.out === "rejected" ? "bad" : "warn";
  const bookings = d.bookings.map((b) => ({ key: b.id, main: <><b>{b.game}</b> · {b.placement}</>, sub: `${b.advertiser} → ${b.developer} · ${b.period}`, tone: STATES[b.state].tone, label: b.label, id: b.id }));
  return (
    <div className="cb-box cb-dm" role="dialog" aria-label="Creative">
      <div className="cb-dm-top"><div className="cb-dm-card">
        <div className="cb-dm-main">
          <BigPv className="cb-dm-pv" seed={row.id} tag={row.name} url={row.url} />
          <div className="cb-dm-info">
            <div style={{ display: "flex", alignItems: "start", gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="cb-mute" style={eyebrow}>Creative</div>
                <h2>{row.name}</h2>
                <div className="cb-mute">{row.categoryLabel}{row.restricted ? " · restricted category" : ""}</div>
              </div>
              <Pill tone={tone}>{row.out === "approved" ? "Approved" : row.out === "rejected" ? "Rejected" : "Waiting"}</Pill>
              <CloseX onClose={onClose} />
            </div>
            <dl className="cb-facts">
              <div><dt>Advertiser</dt><dd>{row.ownerId ? <Lnk onClick={() => api.open("user", row.ownerId)}>{row.owner}</Lnk> : row.owner}</dd></div>
              <div><dt>Contact</dt><dd>{row.email || "—"}</dd></div>
              <div><dt>Size</dt><dd>{row.size}</dd></div>
              <div><dt>Uploaded</dt><dd>{row.uploaded}</dd></div>
            </dl>
          </div>
        </div>
        <div className="cb-dm-now"><b>Now:</b> {pending ? "Waiting for review." : row.out === "approved" ? "Approved and reaching the SDK." : `Rejected${row.note ? `: ${row.note}` : "."}`} {d.bookings.length} booking{d.bookings.length === 1 ? "" : "s"}, {d.openDisputes} open dispute{d.openDisputes === 1 ? "" : "s"}.</div>
      </div></div>
      <div className="cb-dm-body">
        <h3 className="cb-dm-h" style={{ marginTop: 4 }}>Where it runs</h3>
        {bookings.length ? <Related items={bookings} onOpen={(x) => api.open("booking", x.id)} /> : <p className="cb-mute" style={{ margin: 0 }}>Not booked anywhere yet.</p>}
        <h3 className="cb-dm-h">History <span className="cb-mute" style={{ fontWeight: 400, fontSize: 12.5 }}>· click a step for details</span></h3>
        <History events={d.events} />
      </div>
      <div className="cb-dm-foot">
        {pending ? (rejecting ? (
          <>
            <input className="cb-fld" style={{ flex: 1, minWidth: 200 }} placeholder={`Reason shown to ${row.owner}`} aria-label="Reason" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
            <button type="button" className="cb-btn cb-d" disabled={busy} onClick={() => decide("rejected")}>Reject creative</button>
            <button type="button" className="cb-btn cb-q" onClick={() => setRejecting(false)}>Cancel</button>
          </>
        ) : (
          <>
            <button type="button" className="cb-btn" disabled={busy} onClick={() => decide("approved")}>Approve</button>
            <button type="button" className="cb-btn cb-q" onClick={() => setRejecting(true)}>Reject…</button>
          </>
        )) : <span className="cb-mute">Reviewed. To take an approved creative off the platform, use a dispute.</span>}
      </div>
    </div>
  );
}
