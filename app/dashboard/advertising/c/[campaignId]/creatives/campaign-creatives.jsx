"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import UploadDialog from "../../../../creatives/upload-dialog";
import { formatCount } from "../../../../../../lib/analytics";
import { MenuItem, Pop } from "../../../../_cabinet/ui";
import { IcChevron, IcLibrary, IcPlus, IcUpload } from "../../../../_cabinet/icons";
import { addCreativesToCampaign, removeCreativeFromCampaign } from "../../../actions";
import { Busy, refreshPage, useWaitMark } from "../../../../wait";
import { HoldNotice } from "../../../../creatives/hold-notice";
import { rulesLink } from "../../../../../../lib/platform-rules";

const STATUS = { approved: ["Approved", "ov-live"], pending: ["In review", "ov-scheduled"], rejected: ["Rejected", "ov-bad"] };
const SHORT = { r16x9: "16:9", r4x3: "4:3", r1x1: "1:1", r3x4: "3:4", r9x16: "9:16", r2x1: "2:1", r21x9: "21:9", r3x1: "3:1" };

/** Choose creatives from the library, in a pop-up. */
function Picker({ library, taken, onClose, onAdd }) {
  const ref = useRef(null);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState([]);
  const [busy, setBusy] = useState(false);
  useWaitMark(Boolean(busy));
  useState(() => { setTimeout(() => ref.current && !ref.current.open && ref.current.showModal(), 0); });
  const pool = library.filter((c) => c.status !== "rejected" && !taken.includes(c.id) && (!q || c.name.toLowerCase().includes(q.toLowerCase())));
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  return (
    <dialog ref={ref} className="modal rd-dialog rd-pickdlg" aria-labelledby="rd-pick-title" onClose={onClose}>
      <div className="modal-box">
        <div className="rd-dhead"><div><h2 id="rd-pick-title">Choose from my library</h2><p className="rd-dsub">Tick the creatives this campaign should rotate.</p></div><button type="button" className="modal-close" aria-label="Close" onClick={() => ref.current?.close()}>×</button></div>
        <div className="rd-dbody">
          <input type="search" className="field" placeholder="Search by name" aria-label="Search library" value={q} onChange={(e) => setQ(e.target.value)} />
          {pool.length === 0 ? <p className="rd-dsub" style={{ margin: "14px 0 0" }}>Nothing left to add. Every creative that can be booked is already in this campaign.</p> : (
            <div className="rd-pick">
              {pool.map((c) => {
                const on = picked.includes(c.id);
                const [label, tone] = STATUS[c.status] ?? STATUS.pending;
                const missing = c.formats.filter((f) => !f.ready).length;
                return (
                  <button key={c.id} type="button" className={`rd-pick-item${on ? " is-on" : ""}`} aria-pressed={on} onClick={() => toggle(c.id)}>
                    <span className="rd-pick-img">{c.url ? <img src={c.url} alt="" /> : null}</span>
                    <b>{c.name}</b>
                    <span className="rd-pick-meta"><span className={`ov-pill ${tone}`}>{label}</span><small>{missing ? `${missing} ${missing === 1 ? "shape" : "shapes"} missing` : "All shapes"}</small></span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="rd-dfoot"><button type="button" className="button button-quiet" disabled={busy} onClick={() => ref.current?.close()}>Cancel</button><button type="button" className="button" disabled={!picked.length || busy} onClick={async () => { setBusy(true); await onAdd(picked); ref.current?.close(); }}>{busy ? <Busy>Adding…</Busy> : picked.length ? `Add ${picked.length} ${picked.length === 1 ? "creative" : "creatives"}` : "Add"}</button></div>
      </div>
    </dialog>
  );
}

/** The Creatives tab of a campaign: one "Add creative" button, a menu for how, and pop-ups instead of page changes. */
export default function CampaignCreatives({ id, list, library, draft = false }) {
  const router = useRouter();
  const [dlg, setDlg] = useState(null); // library | upload
  const [flash, setFlash] = useState({ tone: "", text: "" });
  const [fresh, setFresh] = useState([]);
  const [asking, setAsking] = useState(null);
  const [busy, setBusy] = useState(false);
  useWaitMark(Boolean(busy));
  const [problem, setProblem] = useState("");
  const btn = useRef(null);
  const [menu, setMenu] = useState(false);
  // the block under a row (the signal, what to change, why it was blocked): open for a creative on hold, shut for a signal
  const [more, setMore] = useState(() => Object.fromEntries(list.filter((item) => item.holds?.length).map((item) => [item.id, true])));

  async function add(ids, names) {
    const result = await addCreativesToCampaign({ campaignId: id, creativeIds: ids }).catch(() => ({ error: "Connection lost. Try again." }));
    if (result?.error) return setFlash({ tone: "error", text: result.error });
    setFresh(ids);
    setFlash({ tone: "ok", text: result.added === 0 ? "Already in this campaign." : names.length === 1 ? `“${names[0]}” added to this campaign.` : `${names.length} creatives added to this campaign.` });
    refreshPage(router);
  }
  async function remove(item) {
    setBusy(true);
    setProblem("");
    const result = await removeCreativeFromCampaign({ campaignId: id, creativeId: item.id }).catch(() => ({ error: "Connection lost. Try again." }));
    setBusy(false);
    if (result?.error) return setProblem(result.error);
    setAsking(null);
    refreshPage(router);
  }

  return (
    <>
      <div className="cc-head">
        <p>Creatives this campaign rotates, with their numbers for the last 30 days.</p>
        <div className="cc-head-actions">
          <button ref={btn} type="button" className="button rd-addbtn" aria-haspopup="menu" aria-expanded={menu} disabled={draft} title={draft ? "Continue the setup first: this campaign has no placements yet" : undefined} onClick={() => setMenu((v) => !v)}><IcPlus size={16} />Add creative<IcChevron size={14} /></button>
          <Pop anchor={btn} open={menu} onClose={() => setMenu(false)} width={250} label="Add a creative">
            <MenuItem icon={<IcLibrary />} hint="Pick ones you already have" onClick={() => { setMenu(false); setDlg("library"); }}>Choose from my library</MenuItem>
            <MenuItem icon={<IcUpload />} hint="PNG or JPG, added here" onClick={() => { setMenu(false); setDlg("upload"); }}>Upload new…</MenuItem>
          </Pop>
        </div>
      </div>
      {flash.text && <p className={`${flash.tone === "error" ? "error" : "upload-done"} rd-flash`} role="status">{flash.text}</p>}
      {problem && <p className="error" role="alert">{problem}</p>}
      {list.length === 0 ? (
        <div className="empty">
          <p style={{ margin: "0 auto 12px" }}>{draft ? "This campaign is still a draft. Continue the setup to choose its creative." : "No creatives in this campaign yet."}</p>
          {draft ? <Link href={`/dashboard/advertising/new?campaign=${id}`} className="button">Continue setup</Link> : (
            <><button type="button" className="button" onClick={() => setDlg("library")}>Choose from my library</button> <button type="button" className="button button-quiet" onClick={() => setDlg("upload")}>Upload new…</button></>
          )}
        </div>
      ) : (
        <section className="cc-list" aria-label="Creatives in this campaign">
          {list.map((item) => {
            const hold = item.holds?.[0] ?? null;
            const signal = item.signal;
            // a hold of the whole creative replaces its status; a held picture is said next to it (the creative still runs)
            const [label, tone] = hold && !hold.shape ? hold.pill : STATUS[item.status] ?? STATUS.pending;
            const ready = item.ready.filter(Boolean).length;
            const note = hold ? hold.line : signal?.line ? signal.line : item.status === "pending" ? "Ads start once it is approved" : item.status === "rejected" ? item.note || "Rejected" : "";
            const toggle = hold ? hold.toggle : signal?.blocked > 0 ? "How developers react" : "";
            const open = Boolean(toggle && more[item.id]);
            return (
              <div key={item.id} className="cc-item">
                <div className={`cc-row${fresh.includes(item.id) ? " is-fresh" : ""}${open ? " is-open" : ""}`}>
                  {item.url ? <img className="cc-thumb" src={item.url} alt="" loading="lazy" /> : <span className="cc-thumb" />}
                  <span className="cc-main">
                    <span className="cc-name"><Link href={`/dashboard/creatives/${item.id}`}>{item.name}</Link>{item.longer && <span className="ov-pill ov-live">Longer views</span>}</span>
                    {note && <span className="ovx-muted">{note}</span>}
                    {toggle && <button type="button" className="link-button cc-more-btn" aria-expanded={open} onClick={() => setMore((m) => ({ ...m, [item.id]: !m[item.id] }))}>{toggle}<i /></button>}
                  </span>
                  <span className="cc-state"><span className={`ov-pill ${tone}`}>{label}</span>{(item.holds ?? []).filter((x) => x.shape).map((x) => <span key={x.shape} className={`ov-pill ${x.pill[1]}`}>{x.pill[0]}</span>)}<span className="lib-bar" role="img" aria-label={`${ready} of ${item.ready.length} formats ready`}>{item.ready.map((r, i) => <span key={i} className={r ? "" : "is-missing"} title={SHORT[item.formatIds[i]]} />)}</span></span>
                  <span className="lib-num"><strong>{item.impressions > 0 ? formatCount(item.impressions) : "—"}</strong><span>impressions</span></span>
                  <span className="lib-num"><strong>{item.avg != null ? `${item.avg.toFixed(1)} s` : "—"}</strong><span>avg view</span></span>
                  <span className="cc-actions">
                    {!(hold && !hold.shape && hold.kind === "blocked") && <Link href={`/dashboard/creatives/${item.id}`} className="button button-quiet button-small">Edit</Link>}
                    {item.removable && (asking === item.id ? (
                      <span className="confirm-inline"><span className="confirm-text">Remove from this campaign?</span><button type="button" className="button button-danger button-small" disabled={busy} onClick={() => remove(item)}>{busy ? <Busy>Removing…</Busy> : "Remove"}</button><button type="button" className="button button-quiet button-small" disabled={busy} onClick={() => setAsking(null)}>Keep</button></span>
                    ) : <button type="button" className="button button-quiet button-small" onClick={() => { setProblem(""); setAsking(item.id); }}>Remove</button>)}
                  </span>
                </div>
                {open && (
                  <div className="cc-more">
                    {hold ? <div className="cc-holds">{item.holds.map((x) => <HoldNotice key={x.shape ?? "whole"} creativeId={item.id} hold={x} />)}</div> : (
                      <>
                        <div className="cc-sig-h"><b>How developers react</b><span className="ovx-muted">A signal for you, not a request to change anything.</span></div>
                        <div className="cc-sig-grid">
                          <div className="cc-fig"><strong>{signal.blocked} <small>of {signal.games}</small></strong><span>{signal.games === 1 ? "game" : "games"} blocked it</span>{signal.other && <small>your other creatives: {signal.other.blocked} of {signal.other.games} on average</small>}</div>
                          <div className="cc-fig"><strong>{signal.reports}</strong><span>{signal.reports === 1 ? "report" : "reports"} to DeusADS</span><small>{signal.reports === 0 ? "nobody reported it" : signal.clean === signal.reports ? "checked: no violation found" : signal.open > 0 ? `${signal.open} in review` : ""}</small></div>
                          <div className="cc-reasons"><span className="cc-cap">Reasons developers gave</span>{signal.reasons.map(([reason, count]) => (
                            <div key={reason} className="cc-bar"><span>{reason}</span><i><b style={{ width: `${Math.round((count / signal.blocked) * 100)}%` }} /></i><em>{count}</em></div>
                          ))}</div>
                        </div>
                        <p className="ovx-hint">Each developer decides what shows in their own game. A game that blocks this creative is reach you do not get: another version may be worth a try. What an ad must be is in the <Link href={rulesLink("adv")}>platform rules</Link>.</p>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}
      <p className="ovx-hint">Removing a creative here only takes it out of this campaign; it stays in your library.</p>
      {dlg === "library" && <Picker library={library} taken={list.map((x) => x.id)} onClose={() => setDlg(null)} onAdd={(ids) => add(ids, library.filter((c) => ids.includes(c.id)).map((c) => c.name))} />}
      {dlg === "upload" && <UploadDialog title="Upload a creative" lede="It is added to this campaign and to your library." submit="Upload and add" onClose={() => setDlg(null)} onUploaded={(creative) => add([creative.id], [creative.name])} />}
    </>
  );
}
