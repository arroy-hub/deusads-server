"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import UploadDialog from "../../../../creatives/upload-dialog";
import { formatCount } from "../../../../../../lib/analytics";
import { MenuItem, Pop } from "../../../../_cabinet/ui";
import { IcChevron, IcLibrary, IcPlus, IcUpload } from "../../../../_cabinet/icons";
import { addCreativesToCampaign, removeCreativeFromCampaign } from "../../../actions";

const STATUS = { approved: ["Approved", "ov-live"], pending: ["In review", "ov-scheduled"], rejected: ["Rejected", "ov-bad"] };
const SHORT = { r16x9: "16:9", r4x3: "4:3", r1x1: "1:1", r3x4: "3:4", r9x16: "9:16", r2x1: "2:1", r3x1: "3:1" };

/** Choose creatives from the library, in a pop-up. */
function Picker({ library, taken, onClose, onAdd }) {
  const ref = useRef(null);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState([]);
  const [busy, setBusy] = useState(false);
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
        <div className="rd-dfoot"><button type="button" className="button button-quiet" disabled={busy} onClick={() => ref.current?.close()}>Cancel</button><button type="button" className="button" disabled={!picked.length || busy} onClick={async () => { setBusy(true); await onAdd(picked); ref.current?.close(); }}>{busy ? "Adding…" : picked.length ? `Add ${picked.length} ${picked.length === 1 ? "creative" : "creatives"}` : "Add"}</button></div>
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
  const [problem, setProblem] = useState("");
  const btn = useRef(null);
  const [menu, setMenu] = useState(false);

  async function add(ids, names) {
    const result = await addCreativesToCampaign({ campaignId: id, creativeIds: ids }).catch(() => ({ error: "Connection lost. Try again." }));
    if (result?.error) return setFlash({ tone: "error", text: result.error });
    setFresh(ids);
    setFlash({ tone: "ok", text: result.added === 0 ? "Already in this campaign." : names.length === 1 ? `“${names[0]}” added to this campaign.` : `${names.length} creatives added to this campaign.` });
    router.refresh();
  }
  async function remove(item) {
    setBusy(true);
    setProblem("");
    const result = await removeCreativeFromCampaign({ campaignId: id, creativeId: item.id }).catch(() => ({ error: "Connection lost. Try again." }));
    setBusy(false);
    if (result?.error) return setProblem(result.error);
    setAsking(null);
    router.refresh();
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
            const [label, tone] = STATUS[item.status] ?? STATUS.pending;
            const ready = item.ready.filter(Boolean).length;
            const blocked = item.blocked ?? [];
            const note = blocked.length > 0 ? `Blocked in ${blocked.length} ${blocked.length === 1 ? "game" : "games"}: ${blocked.join(", ")}` : item.status === "pending" ? "Ads start once it is approved" : item.status === "rejected" ? item.note || "Rejected" : "";
            return (
              <div key={item.id} className={`cc-row${fresh.includes(item.id) ? " is-fresh" : ""}`}>
                {item.url ? <img className="cc-thumb" src={item.url} alt="" loading="lazy" /> : <span className="cc-thumb" />}
                <span className="cc-main"><span className="cc-name"><Link href={`/dashboard/creatives/${item.id}`}>{item.name}</Link>{item.longer && <span className="ov-pill ov-live">Longer views</span>}</span>{note && <span className="ovx-muted">{note}</span>}</span>
                <span className="cc-state"><span className={`ov-pill ${tone}`}>{label}</span><span className="lib-bar" role="img" aria-label={`${ready} of ${item.ready.length} formats ready`}>{item.ready.map((r, i) => <span key={i} className={r ? "" : "is-missing"} title={SHORT[item.formatIds[i]]} />)}</span></span>
                <span className="lib-num"><strong>{item.impressions > 0 ? formatCount(item.impressions) : "—"}</strong><span>impressions</span></span>
                <span className="lib-num"><strong>{item.avg != null ? `${item.avg.toFixed(1)} s` : "—"}</strong><span>avg view</span></span>
                <span className="cc-actions">
                  <Link href={`/dashboard/creatives/${item.id}`} className="button button-quiet button-small">Edit</Link>
                  {item.removable && (asking === item.id ? (
                    <span className="confirm-inline"><span className="confirm-text">Remove from this campaign?</span><button type="button" className="button button-danger button-small" disabled={busy} onClick={() => remove(item)}>{busy ? "Removing…" : "Remove"}</button><button type="button" className="button button-quiet button-small" disabled={busy} onClick={() => setAsking(null)}>Keep</button></span>
                  ) : <button type="button" className="button button-quiet button-small" onClick={() => { setProblem(""); setAsking(item.id); }}>Remove</button>)}
                </span>
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
