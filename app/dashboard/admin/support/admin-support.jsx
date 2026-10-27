"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AdminRequestWindow, { camel } from "./admin-request-window";
import { CaretIcon, StripFace, toneStyle, useNow } from "../../support/support-ui";
import { IcMore } from "../../_cabinet/icons";
import { STATUS_LABEL, TYPE_LABEL, bulkAllowed, groupByPerson, waitHours, waitLabel } from "../../../../lib/support-rules";
import { changeStatusMany } from "../../support/actions";

const PAGE = 30;
const SORTS = { queue: [["wait", "Longest waiting"], ["count", "Most requests"], ["name", "Name A–Z"]], all: [["wait", "Waiting first"], ["recent", "Most recent"], ["count", "Most requests"], ["name", "Name A–Z"]] };
const INNER = [["new", "New first"], ["answered", "Answered first"], ["noted", "Noted first"], ["resolved", "Resolved first"], ["recent", "Newest first"]];
const COLORS = ["#c94a24", "#3b6fb6", "#2f9e8f", "#b8862b", "#8a63b8", "#c2527a"];
const colorOf = (name) => COLORS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];

const noun = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const mixOf = (items, all) => (all
  ? ["new", "answered", "noted", "resolved"].map((k) => { const n = items.filter((r) => r.status === k).length; return n ? `${n} ${STATUS_LABEL[k].toLowerCase()}` : ""; })
  : ["bug", "question", "idea"].map((k) => { const n = items.filter((r) => r.type === k).length; return n ? noun(n, TYPE_LABEL[k].toLowerCase(), `${TYPE_LABEL[k].toLowerCase()}s`) : ""; })
).filter(Boolean).join(" · ");

/**
 * Support for the admin: "Needs attention" (only what a person must answer) and "All requests". Each is a table with one
 * row per person, the longest waiting on top; a row opens into that person's requests as strips, a strip opens the request.
 */
export default function AdminSupport({ requests, outdated, serverNow, initialTab, initialOpen }) {
  const router = useRouter();
  const clock = useNow();
  const now = clock ?? serverNow;
  const [tab, setTab] = useState(initialTab);
  const [openId, setOpenId] = useState(initialOpen);
  const [filters, setFilters] = useState({ query: "", type: "all", role: "all", status: "all", reason: "all", sort: "wait", inner: "new" });
  const [expanded, setExpanded] = useState(() => new Set());
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState(() => new Set());
  const [shown, setShown] = useState(PAGE);
  const [menu, setMenu] = useState(null); // owner id
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const all = tab === "all";

  useEffect(() => { if (initialOpen) setOpenId(initialOpen); }, [initialOpen]);
  useEffect(() => {
    if (!menu) return;
    const away = (e) => { if (!e.target.closest?.(".sq-menu-zone")) setMenu(null); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [menu]);

  const waiting = useMemo(() => requests.filter((r) => r.status === "new"), [requests]);
  const base = all ? requests : waiting;
  const set = (patch) => { setFilters((f) => ({ ...f, ...patch })); setShown(PAGE); };
  const visible = useMemo(() => {
    const q = filters.query.trim().toLowerCase();
    return base.filter((r) => (filters.type === "all" || r.type === filters.type)
      && (filters.role === "all" || r.owner_role === filters.role)
      && (all ? (filters.status === "all" || r.status === filters.status) : (filters.reason === "all" || r.escalation === filters.reason))
      && (!q || `${r.title} ${r.owner_name} #${r.number}`.toLowerCase().includes(q)));
  }, [base, filters, all]);
  const people = useMemo(() => groupByPerson(visible, { sort: filters.sort, inner: all ? filters.inner : "new", now }), [visible, filters.sort, filters.inner, all, now]);
  const count = (key, value) => base.filter((r) => (key === "type" ? r.type : key === "role" ? r.owner_role : key === "status" ? r.status : r.escalation) === value).length;
  const reasons = [...new Set(waiting.map((r) => r.escalation).filter(Boolean))];
  const filtered = filters.query || filters.type !== "all" || filters.role !== "all" || (all ? filters.status !== "all" : filters.reason !== "all");

  // The selection only holds what is still on screen.
  useEffect(() => { const ids = new Set(visible.map((r) => r.id)); setPicked((p) => (p.size && [...p].some((id) => !ids.has(id)) ? new Set([...p].filter((id) => ids.has(id))) : p)); }, [visible]);

  const selectedRows = requests.filter((r) => picked.has(r.id));
  const allowed = bulkAllowed(selectedRows);
  const toggle = (ids, on) => setPicked((p) => { const n = new Set(p); ids.forEach((id) => (on ? n.add(id) : n.delete(id))); return n; });

  async function bulk(status) {
    setBusy(true);
    const result = await changeStatusMany({ ids: [...picked], status }).catch(() => ({ error: "Connection lost. Try again." }));
    setBusy(false);
    if (result?.error) return setNotice(result.error);
    setNotice(`${noun(result.updated, "request", "requests")} updated${result.skipped ? `, ${result.skipped} skipped` : ""}.`);
    setPicked(new Set());
    router.refresh();
  }

  const openRequest = (id) => { setOpenId(id); try { const u = new URL(window.location.href); u.searchParams.set("open", id); window.history.replaceState(null, "", u); } catch {} };
  const closeRequest = () => { setOpenId(null); try { const u = new URL(window.location.href); u.searchParams.delete("open"); window.history.replaceState(null, "", u); } catch {} router.refresh(); };
  const choose = (next) => { setTab(next); setShown(PAGE); setPicked(new Set()); setFilters((f) => ({ ...f, sort: "wait" })); try { const u = new URL(window.location.href); if (next === "all") u.searchParams.set("tab", "all"); else u.searchParams.delete("tab"); window.history.replaceState(null, "", u); } catch {} };

  const medianOld = (() => { const ws = waiting.map((r) => waitHours(r, now)).sort((a, b) => a - b); return ws.length ? { old: ws.at(-1), med: ws[Math.floor(ws.length / 2)] } : null; })();
  const personCount = new Set(requests.map((r) => r.owner_id)).size;

  const sel = (label, value, onChange, options) => (
    <label className="sq-f">{label}
      <select className="sq-sel" value={value} onChange={(e) => onChange(e.target.value)}>{options}</select>
    </label>
  );
  const opts = (list, counter) => list.map(([k, text]) => <option key={k} value={k}>{text}{counter ? ` (${counter(k)})` : ""}</option>);

  function renderStrip(r) {
    const w = waitHours(r, now);
    return (
      <article key={r.id} className="cx-strip sq-strip" style={toneStyle(r)} tabIndex={0} aria-label={r.title} onClick={(e) => { if (!e.target.closest("input")) openRequest(r.id); }} onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) { e.preventDefault(); openRequest(r.id); } }}>
        <StripFace request={camel(r)} now={clock} admin />
        <div className="cx-right">
          {r.status === "new"
            ? <><span className="sq-reason">{r.escalation || "Needs a reply"}</span><span className={`sq-wait${w > 24 ? " is-late" : ""}`} title="Waiting for a reply">{waitLabel(w)}</span></>
            : <><span className="sq-reason">{r.status === "resolved" ? (r.resolved_by === "assistant" ? "Resolved by the assistant" : "Resolved by you") : r.status === "answered" ? "Waiting for the person" : "Noted"}</span><span className="sq-wait" title="Sent">{waitLabel(w)} ago</span></>}
          {selecting && <input type="checkbox" aria-label={`Select #${r.number}`} checked={picked.has(r.id)} onChange={(e) => toggle([r.id], e.target.checked)} />}
        </div>
      </article>
    );
  }

  function renderPerson(p) {
    const open = expanded.has(p.ownerId);
    const late = p.waiting > 0 && p.wait > 24;
    const ids = p.items.map((r) => r.id);
    const full = ids.every((id) => picked.has(id));
    const oldest = p.items.find((r) => r.status === "new");
    const pill = p.waiting ? <span className={`sq-pill ${late ? "is-late" : "is-wait"}`}>{late ? "Overdue" : "Waiting"}</span>
      : p.items.some((r) => r.status === "answered") ? <span className="sq-pill is-ans">Answered</span>
      : p.items.some((r) => r.status === "noted") ? <span className="sq-pill is-info">Noted</span> : <span className="sq-pill is-done">Resolved</span>;
    return (
      <div key={p.ownerId}>
        <div className={`sq-row${late ? " is-late" : ""}`} onClick={(e) => { if (!e.target.closest("input,.sq-menu-zone")) setExpanded((s) => { const n = new Set(s); n.has(p.ownerId) ? n.delete(p.ownerId) : n.add(p.ownerId); return n; }); }}>
          <div className="sq-name">
            {selecting && <input type="checkbox" aria-label={`Select all requests of ${p.name}`} checked={full} onChange={(e) => toggle(ids, e.target.checked)} />}
            <button type="button" className={`sq-caret${open ? " is-open" : ""}`} aria-expanded={open} aria-label={`Show requests of ${p.name}`} onClick={() => setExpanded((s) => { const n = new Set(s); n.has(p.ownerId) ? n.delete(p.ownerId) : n.add(p.ownerId); return n; })}><CaretIcon size={14} /></button>
            <span className="sq-avt" style={{ background: colorOf(p.name) }} aria-hidden="true">{p.name.charAt(0).toUpperCase()}</span>
            <div><strong>{p.name}</strong><div className="sq-meta">{p.role} · {mixOf(p.items, all)}</div></div>
          </div>
          <div className="sq-c-st">{pill}</div>
          <div className="sq-num">{p.items.length}</div>
          <div className={`sq-num${late ? " is-late" : ""}`}>{p.waiting ? waitLabel(p.wait) : "—"}</div>
          <div className="sq-num sq-c-new">{waitLabel(p.recent)}{all ? " ago" : ""}</div>
          <div className="sq-acts sq-menu-zone">
            <button type="button" className="rd-more" aria-haspopup="menu" aria-expanded={menu === p.ownerId} aria-label={`Actions for ${p.name}`} onClick={() => setMenu(menu === p.ownerId ? null : p.ownerId)}><IcMore /></button>
            {menu === p.ownerId && (
              <div className="sp-menu" role="menu">
                {oldest && <button type="button" role="menuitem" className="fl-opt" onClick={() => { setMenu(null); openRequest(oldest.id); }}>Open oldest request</button>}
                <Link role="menuitem" className="fl-opt" href={`/dashboard/admin/users/${p.ownerId}`}>Open user page<span className="sp-chev" aria-hidden="true">↗</span></Link>
              </div>
            )}
          </div>
        </div>
        {open && <div className="sq-kids cx-strips">{p.items.map(renderStrip)}</div>}
      </div>
    );
  }

  const shownPeople = people.slice(0, shown);
  return (
    <div className="pg-ic cx-win sp-win sq-win" data-tab={tab}>
      <header className="main-head cx-head">
        <div><h1>Support</h1><p className="lede">Messages from developers and advertisers.</p></div>
        <div className="cx-tabs" role="tablist" aria-label="Support sections">
          <button type="button" className="cx-tab" role="tab" aria-selected={!all} onClick={() => choose("queue")}>Needs attention{waiting.length > 0 && <i>{waiting.length}</i>}</button>
          <button type="button" className="cx-tab" role="tab" aria-selected={all} onClick={() => choose("all")}>All requests</button>
        </div>
      </header>

      <div className="cx-body sq-body">
        {outdated && <p className="notice" role="status">The database needs update <code>0052_support.sql</code> before support works.</p>}
        <div className="sq-top">
          {all
            ? <span><strong>{requests.length}</strong> requests from <strong>{personCount}</strong> people · <strong>{waiting.length}</strong> waiting for you · <strong>{requests.filter((r) => r.status === "resolved").length}</strong> resolved</span>
            : <span><strong>{waiting.length}</strong> {waiting.length === 1 ? "request is" : "requests are"} waiting for you{medianOld ? <> · longest wait <strong>{waitLabel(medianOld.old)}</strong> · median <strong>{waitLabel(medianOld.med)}</strong></> : null}</span>}
          <span className="cx-spacer" />
          <span aria-live="polite">{noun(people.length, "person", "people")} · {noun(visible.length, "request", "requests")}</span>
        </div>

        <section className="sq-panel" aria-label={all ? "All requests" : "Needs attention"}>
          <div className="sq-tool">
            <input className="sq-inp" type="search" placeholder="Search person or request" aria-label="Search" value={filters.query} onChange={(e) => set({ query: e.target.value })} />
            {sel("Type", filters.type, (v) => set({ type: v }), <><option value="all">All</option>{opts(Object.entries(TYPE_LABEL), (k) => count("type", k))}</>)}
            {sel("From", filters.role, (v) => set({ role: v }), <><option value="all">All</option>{opts([["Developer", "Developers"], ["Advertiser", "Advertisers"]], (k) => count("role", k))}</>)}
            {all
              ? sel("Status", filters.status, (v) => set({ status: v }), <><option value="all">All</option>{opts(Object.entries(STATUS_LABEL), (k) => count("status", k))}</>)
              : sel("Why it’s here", filters.reason, (v) => set({ reason: v }), <><option value="all">All</option>{opts(reasons.map((x) => [x, x]), (k) => count("reason", k))}</>)}
            {sel("Sort people", filters.sort, (v) => set({ sort: v }), opts(SORTS[tab]))}
            {all && sel("Inside a person", filters.inner, (v) => set({ inner: v }), opts(INNER))}
            {filtered && <button type="button" className="button button-quiet" onClick={() => set({ query: "", type: "all", role: "all", status: "all", reason: "all" })}>Clear</button>}
            <span className="cx-spacer" />
            <button type="button" className={`button ${selecting ? "" : "button-quiet"}`} aria-pressed={selecting} onClick={() => { setSelecting((v) => !v); setPicked(new Set()); }}>{selecting ? "Done selecting" : "Select…"}</button>
          </div>

          {picked.size > 0 && (
            <div className="sq-bulk">
              <strong>{picked.size} selected</strong>
              <button type="button" className="button" disabled={busy || !allowed.resolve} title={allowed.resolve ? "" : "Ideas can’t be resolved: they are answered or noted. Deselect the ideas first."} onClick={() => bulk("resolved")}>Mark as resolved</button>
              <button type="button" className="button" disabled={busy || !allowed.note} title={allowed.note ? "" : "Only ideas can be noted. Deselect the problems and questions first."} onClick={() => bulk("noted")}>Mark as noted</button>
              <span className="cx-spacer" />
              <button type="button" className="button button-quiet" onClick={() => setPicked(new Set())}>Clear selection</button>
            </div>
          )}
          {notice && <p className="sq-notice" role="status">{notice}</p>}

          <div className="sq-scroll">
            <div className="sq-grid">
              <div className="sq-th">
                <span>Person · requests</span><span className="sq-c-st">Status</span><span className="sq-num">Requests</span><span className="sq-num">Longest wait</span><span className="sq-num sq-c-new">{all ? "Last sent" : "Newest"}</span><span />
              </div>
              {shownPeople.length ? shownPeople.map(renderPerson) : <div className="sq-empty">{base.length ? "No requests match the filters." : all ? "No requests yet." : "Nothing needs you right now."}</div>}
              {people.length > shownPeople.length && <div className="sq-more"><button type="button" className="button button-quiet" onClick={() => setShown((n) => n + PAGE)}>Show {Math.min(PAGE, people.length - shownPeople.length)} more · {people.length - shownPeople.length} left</button></div>}
            </div>
          </div>
        </section>
      </div>

      {openId && <AdminRequestWindow key={openId} id={openId} summary={requests.find((r) => r.id === openId) ?? null} onClose={closeRequest} />}
    </div>
  );
}
