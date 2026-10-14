"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import UploadDialog from "./upload-dialog";
import { MenuItem, MenuSep, Pop } from "../_cabinet/ui";
import { IcCaret, IcFolder, IcFolderPlus, IcGrip, IcMore, IcPencil, IcPlus, IcTrash, IcUpload } from "../_cabinet/icons";
import { createFolder, deleteFolder, moveCreative, renameFolder } from "./actions";
import { deleteCreative, renameCreative } from "../actions";

const STATUS = { approved: ["Approved", "ov-live"], pending: ["In review", "ov-scheduled"], rejected: ["Rejected", "ov-bad"] };
const F = ["r16x9", "r4x3", "r1x1", "r3x4", "r9x16", "r2x1", "r3x1"];
const SHORT = { r16x9: "16:9", r4x3: "4:3", r1x1: "1:1", r3x4: "3:4", r9x16: "9:16", r2x1: "2:1", r3x1: "3:1" };

function hint(item) {
  if (item.status === "rejected") return item.note ? `Reason: ${item.note}` : "Upload a corrected one.";
  if (item.status === "pending") return "Ads start once it is approved";
  const missing = item.formats.filter((f) => !f.ready);
  if (missing.length) return `${missing.length} ${missing.length === 1 ? "shape" : "shapes"} missing`;
  return "All shapes covered";
}

/** A text that turns into an input on a click: Enter saves, Escape cancels. */
function Editable({ value, onSave, className = "", autoEdit = false, label }) {
  const [editing, setEditing] = useState(autoEdit);
  const [text, setText] = useState(value);
  const done = (save) => { const y = window.scrollY; setEditing(false); requestAnimationFrame(() => { if (Math.abs(window.scrollY - y) > 2) window.scrollTo(window.scrollX, y); }); // the page must not jump when the input turns back into text
     const t = text.trim(); if (save && t && t !== value) onSave(t); else setText(value); };
  if (editing) {
    return <input className={`rd-edit ${className}`} autoFocus aria-label={label} value={text} maxLength={120} onFocus={(e) => e.target.select()} onChange={(e) => setText(e.target.value)} onBlur={() => done(true)} onKeyDown={(e) => { if (e.key === "Enter") done(true); if (e.key === "Escape") done(false); }} />;
  }
  return (
    <button type="button" className={`rd-editable ${className}`} onClick={() => { setText(value); setEditing(true); }} title="Click to rename">
      <span>{value}</span><IcPencil size={13} />
    </button>
  );
}

function CardMenu({ item, folders, onMove, onRename, onDelete }) {
  const btn = useRef(null);
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <>
      <button ref={btn} type="button" className="rd-more is-sm" aria-label={`Actions for ${item.name}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}><IcMore size={16} /></button>
      <Pop anchor={btn} open={open} onClose={close} width={220} label={`Actions for ${item.name}`}>
        <Link role="menuitem" className="rd-mi" href={`/dashboard/creatives/${item.id}`} onClick={close}><span className="rd-mi-ic"><IcPencil /></span><span className="rd-mi-text">Edit shapes and framing</span></Link>
        <MenuItem icon={<IcPencil />} onClick={() => { close(); onRename(); }}>Rename</MenuItem>
        {folders.length > 0 && (<><MenuSep /><div className="rd-mi-label">Move to</div>
          {item.folderId && <MenuItem icon={<IcFolder />} onClick={() => { close(); onMove(null); }}>Not in a folder</MenuItem>}
          {folders.filter((f) => f.id !== item.folderId).map((f) => <MenuItem key={f.id} icon={<IcFolder />} onClick={() => { close(); onMove(f.id); }}>{f.name}</MenuItem>)}</>)}
        <MenuSep />
        <MenuItem icon={<IcTrash />} danger onClick={() => { close(); onDelete(); }} disabled={item.campaigns > 0} hint={item.campaigns > 0 ? "In use: remove it from campaigns first" : undefined}>Delete</MenuItem>
      </Pop>
    </>
  );
}

/** Asks before a creative is deleted for good (its picture and the shape pictures go with it). */
function DeleteDialog({ item, onClose, onConfirm }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  useLayoutEffect(() => { if (ref.current && !ref.current.open) ref.current.showModal(); }, []);
  return (
    <dialog ref={ref} className="modal rd-dialog" aria-labelledby="rd-del-title" onClose={onClose}>
      <div className="modal-box">
        <div className="rd-dhead"><div><h2 id="rd-del-title">Delete this creative?</h2><p className="rd-dsub">{item.name}</p></div><button type="button" className="modal-close" aria-label="Close" onClick={() => ref.current?.close()}>×</button></div>
        <div className="rd-dbody"><p className="rd-dhint">The picture and the pictures made for single shapes are deleted. This cannot be undone.</p></div>
        <div className="rd-dfoot"><button type="button" className="button button-quiet" disabled={busy} onClick={() => ref.current?.close()}>Keep</button><button type="button" className="button button-danger" disabled={busy} onClick={async () => { setBusy(true); await onConfirm(); ref.current?.close(); }}>{busy ? "Deleting…" : "Delete"}</button></div>
      </div>
    </dialog>
  );
}

function Card({ item, folders, drag, setDrag, overCard, setOverCard, onDropOn, patch, remove, move }) {
  const el = useRef(null);
  const [rename, setRename] = useState(0);
  const [label, tone] = STATUS[item.status] ?? STATUS.pending;
  const ready = item.formats.filter((f) => f.ready).length;
  return (
    <article ref={el} className={`rd-card${item.status === "rejected" ? " is-rejected" : ""}${drag === item.id ? " is-dragging" : ""}${overCard === item.id && drag && drag !== item.id ? " is-over" : ""}`}
      onDragOver={(e) => { if (drag && drag !== item.id) { e.preventDefault(); e.stopPropagation(); setOverCard(item.id); } }}
      onDragLeave={() => overCard === item.id && setOverCard(null)}
      onDrop={(e) => { if (drag) { e.preventDefault(); e.stopPropagation(); onDropOn(item.folderId ?? null, item.id); } }}>
      <div className="rd-card-top">
        <span className="rd-grip" draggable aria-label={`Drag ${item.name}`} title="Drag to a folder" onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", item.id); if (el.current) e.dataTransfer.setDragImage(el.current, 24, 24); setDrag(item.id); }} onDragEnd={() => { setDrag(null); setOverCard(null); }}><IcGrip size={16} /></span>
        <Editable key={rename} value={item.name} autoEdit={rename > 0} className="rd-card-name" label="Creative name" onSave={(name) => patch(item.id, { name })} />
        <CardMenu item={item} folders={folders} onMove={(f) => move(item.id, f, null)} onRename={() => setRename((n) => n + 1)} onDelete={() => remove(item.id)} />
      </div>
      <Link href={`/dashboard/creatives/${item.id}`} className="rd-thumb" aria-label={`Edit ${item.name}`}>
        <img src={item.url} alt="" loading="lazy" draggable={false} />
        <span className={`ov-pill ${tone} rd-thumb-pill`}>{label}</span>
      </Link>
      <div className="rd-card-body">
        <span className="lib-bar" role="img" aria-label={`${ready} of ${item.formats.length} shapes ready`}>{item.formats.map((f) => <span key={f.id} className={f.ready ? "" : "is-missing"} title={SHORT[f.id]} />)}</span>
        <span className={`rd-hint${item.status === "approved" && ready < item.formats.length ? " is-warn" : ""}`}>{hint(item)}</span>
        <span className="rd-use">{item.campaigns === 0 ? "Not in use" : `In ${item.campaigns} ${item.campaigns === 1 ? "campaign" : "campaigns"}`}</span>
      </div>
    </article>
  );
}

function FolderMenu({ folder, onRename, onDelete }) {
  const btn = useRef(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button ref={btn} type="button" className="rd-more is-sm" aria-label={`Actions for ${folder.name}`} aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((v) => !v)}><IcMore size={16} /></button>
      <Pop anchor={btn} open={open} onClose={() => setOpen(false)} width={200} label="Folder actions">
        <MenuItem icon={<IcPencil />} onClick={() => { setOpen(false); onRename(); }}>Rename</MenuItem>
        <MenuItem icon={<IcTrash />} danger onClick={() => { setOpen(false); onDelete(); }} hint="Creatives stay in your library">Delete folder</MenuItem>
      </Pop>
    </>
  );
}

export default function LibraryV2({ list, folders: serverFolders = [], folderTools = true }) {
  const router = useRouter();
  const [items, setItems] = useState(list);
  const [folders, setFolders] = useState(serverFolders);
  const [closed, setClosed] = useState({}); // folder id -> collapsed
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [shapes, setShapes] = useState("all");
  const [folderFilter, setFolderFilter] = useState("all");
  const [group, setGroup] = useState("folder");
  const [sort, setSort] = useState("mine");
  const [drag, setDrag] = useState(null);
  const [overFolder, setOverFolder] = useState(null);
  const [overCard, setOverCard] = useState(null);
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [problem, setProblem] = useState("");

  // The server is the truth: whenever the page is rendered again the local copy is replaced by it.
  useEffect(() => setItems(list), [list]);
  useEffect(() => setFolders(serverFolders), [serverFolders]);

  const fail = (result, fallback = "Could not save. Try again.") => { setProblem(result?.error || fallback); router.refresh(); };
  const run = async (promise) => { const result = await promise.catch(() => ({ error: "Connection lost. Try again." })); if (result?.error) fail(result); else setProblem(""); return result; };

  const filtering = q || status !== "all" || shapes !== "all" || folderFilter !== "all";
  const visible = useMemo(() => {
    let v = items.filter((i) => (!q || i.name.toLowerCase().includes(q.toLowerCase())) && (status === "all" || i.status === status) && (shapes === "all" || (shapes === "missing" ? i.formats.some((f) => !f.ready) : i.formats.every((f) => f.ready))) && (folderFilter === "all" || (folderFilter === "none" ? !i.folderId : i.folderId === folderFilter)));
    if (sort === "name") v = [...v].sort((a, b) => a.name.localeCompare(b.name));
    if (sort === "status") v = [...v].sort((a, b) => a.status.localeCompare(b.status));
    return v;
  }, [items, q, status, shapes, folderFilter, sort]);

  const patch = (id, p) => setItems((l) => l.map((i) => (i.id === id ? { ...i, ...p } : i)));
  const rename = (id, name) => { patch(id, { name }); run(renameCreative({ creativeId: id, name })); };
  const confirmRemove = async () => {
    const id = deleting.id;
    const result = await run(deleteCreative({ creativeId: id }));
    if (!result?.error) setItems((l) => l.filter((i) => i.id !== id));
  };
  const move = (id, folderId, beforeId) => {
    setItems((l) => {
      const moving = l.find((i) => i.id === id);
      if (!moving) return l;
      const rest = l.filter((i) => i.id !== id);
      const next = { ...moving, folderId };
      const at = beforeId ? rest.findIndex((i) => i.id === beforeId) : -1;
      if (at < 0) return [...rest, next];
      return [...rest.slice(0, at), next, ...rest.slice(at)];
    });
    run(moveCreative({ creativeId: id, folderId, beforeId }));
  };
  const dropOn = (folderId, beforeId = null) => { if (drag) move(drag, folderId, beforeId); setDrag(null); setOverFolder(null); setOverCard(null); };
  const addFolder = async () => {
    const taken = new Set(folders.map((x) => x.name.toLowerCase()));
    let name = "New folder";
    for (let n = 2; taken.has(name.toLowerCase()); n += 1) name = `New folder ${n}`;
    const result = await run(createFolder({ name }));
    if (result?.folder) { setFolders((f) => [result.folder, ...f]); setRenaming(result.folder.id); }
  };
  const nameFolder = async (id, name) => {
    setFolders((f) => f.map((x) => (x.id === id ? { ...x, name } : x)));
    setRenaming(null);
    await run(renameFolder({ folderId: id, name }));
  };
  const delFolder = (id) => {
    setFolders((f) => f.filter((x) => x.id !== id));
    setItems((l) => l.map((i) => (i.folderId === id ? { ...i, folderId: null } : i)));
    run(deleteFolder({ folderId: id }));
  };
  // A new creative goes first in the library (and into the folder chosen in the pop-up).
  const uploaded = async (creative, { folderId }) => {
    await moveCreative({ creativeId: creative.id, folderId, beforeId: items[0]?.id ?? null }).catch(() => null);
    router.refresh();
  };

  const sections = group === "folder"
    ? [...folders.map((f) => ({ ...f, kind: "folder" })), { id: "none", name: "Not in a folder", kind: "none" }]
    : [{ id: "all", name: "All creatives", kind: "flat" }];
  const itemsOf = (s) => (s.kind === "folder" ? visible.filter((i) => i.folderId === s.id) : s.kind === "none" ? visible.filter((i) => !i.folderId || !folders.some((f) => f.id === i.folderId)) : visible);
  const outside = items.filter((i) => !i.folderId || !folders.some((f) => f.id === i.folderId)).length;

  return (
    <div className="pg-ic pg-creatives">
      <div className="main-head">
        <div><h1>Creatives</h1><p className="lede">Your pictures and the ad shapes each one covers.</p></div>
        <button type="button" className="button" onClick={() => setAdding(true)}><IcPlus size={16} />Add creative</button>
      </div>
      {problem && <p className="error" role="alert">{problem}</p>}

      {items.length === 0 ? (
        <div className="rd-lib-empty">
          <span className="rd-drop-ic"><IcUpload size={24} /></span>
          <h2>No creatives yet</h2>
          <p>A creative is the picture you advertise with. Add one here or while you set up a campaign; it stays in your library for every campaign after that.</p>
          <div className="rd-lib-empty-actions"><button type="button" className="button" onClick={() => setAdding(true)}>Add your first creative</button><Link href="/dashboard/advertising/new" className="button button-quiet">Start a campaign instead</Link></div>
        </div>
      ) : (
        <>
          <div className="rd-toolbar">
            <div className="rd-toolbar-row">
              <input type="search" className="field rd-search" placeholder="Search by name" aria-label="Search creatives" value={q} onChange={(e) => setQ(e.target.value)} />
              <label className="rd-sel">Group by<select className="field" value={group} onChange={(e) => setGroup(e.target.value)}><option value="folder">Folder</option><option value="none">No grouping</option></select></label>
              <label className="rd-sel">Sort<select className="field" value={sort} onChange={(e) => setSort(e.target.value)}><option value="mine">My order</option><option value="name">Name A–Z</option><option value="status">Status</option></select></label>
            </div>
            <div className="rd-toolbar-row">
              <span className="rd-filter-label">Filter</span>
              <select className="field rd-pillsel" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="all">Status</option><option value="approved">Approved</option><option value="pending">In review</option><option value="rejected">Rejected</option></select>
              <select className="field rd-pillsel" aria-label="Shapes" value={shapes} onChange={(e) => setShapes(e.target.value)}><option value="all">Shapes</option><option value="missing">Some shapes missing</option><option value="full">All shapes covered</option></select>
              <select className="field rd-pillsel" aria-label="Folder" value={folderFilter} onChange={(e) => setFolderFilter(e.target.value)}><option value="all">Folder</option><option value="none">Not in a folder</option>{folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
              {filtering && <button type="button" className="link-button" onClick={() => { setQ(""); setStatus("all"); setShapes("all"); setFolderFilter("all"); }}>Clear filters</button>}
            </div>
          </div>
          <div className="rd-summary">
            <span>{folders.length} {folders.length === 1 ? "folder" : "folders"} · {outside} {outside === 1 ? "creative" : "creatives"} outside folders{filtering ? ` · ${visible.length} shown` : ""}</span>
            <button type="button" className="button button-quiet button-small" disabled={!folderTools} title={folderTools ? undefined : "Folders need migration 0028 in the Supabase SQL editor"} onClick={addFolder}><IcFolderPlus size={16} />New folder</button>
          </div>

          <div className="rd-sections">
            {sections.map((s) => {
              const rows = itemsOf(s);
              if (s.kind === "none" && group === "folder" && folders.length === 0 && rows.length === 0) return null;
              if (filtering && rows.length === 0 && s.kind !== "flat") return null;
              const folder = s.kind === "folder" ? folders.find((f) => f.id === s.id) : null;
              const isOpen = s.kind === "flat" || s.kind === "none" ? true : !closed[s.id];
              const needs = rows.filter((i) => i.formats.some((f) => !f.ready)).length;
              return (
                <section key={s.id} className={`rd-sec${s.kind === "none" ? " is-loose" : ""}${overFolder === s.id && drag ? " is-over" : ""}`} aria-label={s.name}
                  onDragOver={(e) => { if (drag) { e.preventDefault(); setOverFolder(s.id); } }}
                  onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOverFolder(null); }}
                  onDrop={(e) => { if (drag) { e.preventDefault(); dropOn(s.kind === "folder" ? s.id : null, null); } }}>
                  {s.kind !== "flat" && (
                    <header className="rd-sec-head">
                      {s.kind === "folder" ? (
                        <button type="button" className={`rd-caret${isOpen ? " is-open" : ""}`} aria-expanded={isOpen} aria-label={`${isOpen ? "Collapse" : "Expand"} ${s.name}`} onClick={() => setClosed((c) => ({ ...c, [s.id]: isOpen }))}><IcCaret size={16} /></button>
                      ) : <span className="rd-caret is-static" />}
                      <span className="rd-sec-ic"><IcFolder size={18} /></span>
                      {s.kind === "folder" ? <Editable key={renaming === s.id ? "r" : "n"} value={s.name} autoEdit={renaming === s.id} className="rd-sec-name" label="Folder name" onSave={(name) => nameFolder(s.id, name)} /> : <strong className="rd-sec-name is-static">{s.name}</strong>}
                      <span className="rd-sec-meta">{rows.length} {rows.length === 1 ? "creative" : "creatives"}{needs ? ` · ${needs} need shapes` : ""}</span>
                      {s.kind === "folder" && <span className="rd-sec-acts"><FolderMenu folder={folder} onRename={() => setRenaming(s.id)} onDelete={() => delFolder(s.id)} /></span>}
                    </header>
                  )}
                  {isOpen && (
                    rows.length ? (
                      <div className="rd-grid-cards">
                        {rows.map((item) => <Card key={item.id} item={item} folders={folders} drag={drag} setDrag={setDrag} overCard={overCard} setOverCard={setOverCard} onDropOn={dropOn} patch={(id, p) => rename(id, p.name)} remove={() => setDeleting(item)} move={move} />)}
                      </div>
                    ) : (
                      <div className="rd-sec-empty">{filtering ? "Nothing matches the filters." : drag ? "Drop here" : "Empty. Drag creatives here."}</div>
                    )
                  )}
                </section>
              );
            })}
          </div>
          {visible.length === 0 && filtering && <div className="empty"><p style={{ margin: "0 auto" }}>No creatives match these filters.</p></div>}
        </>
      )}
      {adding && <UploadDialog folders={folderTools ? folders : null} onClose={() => setAdding(false)} onUploaded={uploaded} />}
      {deleting && <DeleteDialog item={deleting} onClose={() => setDeleting(null)} onConfirm={confirmRemove} />}
    </div>
  );
}
