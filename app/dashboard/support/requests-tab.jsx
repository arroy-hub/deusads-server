"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Opt, PopBtn } from "../_cabinet/filters";
import { IcMore, IcPlus } from "../_cabinet/icons";
import { CaretIcon, FolderIcon, FolderPlusIcon, StripFace, TrashIcon, toneStyle, useNow } from "./support-ui";
import { STATUSES, STATUS_LABEL, TYPES, TYPE_LABEL } from "../../../lib/support-rules";
import { newFolder, placeInFolder, removeFolder, renameFolder } from "./actions";

const plural = (n) => `${n} ${n === 1 ? "request" : "requests"}`;
const byPosition = (a, b) => a.position - b.position; // stable: ties keep the server's order

/**
 * My requests: the person's requests as strips (the look of the Campaigns list), in their own folders. A request is moved
 * by dragging it (between two strips, into a folder, out of one) or with ⋯ → Move to. Clicking a strip opens it.
 */
export default function RequestsTab({ requests, folders: initialFolders, outdated, onOpen, onNew }) {
  const router = useRouter();
  const now = useNow();
  const [items, setItems] = useState(requests);
  const [folders, setFolders] = useState(initialFolders.map((f) => ({ ...f, open: true })));
  const [status, setStatus] = useState("all");
  const [type, setType] = useState("all");
  const [menu, setMenu] = useState(null); // { id, moving }
  const [renaming, setRenaming] = useState(null);
  const [note, setNote] = useState("");
  const drag = useRef(null);
  const [over, setOver] = useState(null); // { key: "before:<id>" | "after:<id>" | "in:<folderId>" | "out" }

  // The server list is the truth: take it again whenever the page is refreshed.
  useEffect(() => setItems(requests), [requests]);
  useEffect(() => setFolders((current) => initialFolders.map((f) => ({ ...f, open: current.find((c) => c.id === f.id)?.open ?? true }))), [initialFolders]);

  useEffect(() => {
    if (!menu) return;
    const away = (e) => { if (!e.target.closest?.(".sp-menu-zone")) setMenu(null); };
    const key = (e) => e.key === "Escape" && setMenu(null);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", key); };
  }, [menu]);

  const filtering = status !== "all" || type !== "all";
  const shown = useMemo(() => items.filter((r) => (status === "all" || r.status === status) && (type === "all" || r.type === type)), [items, status, type]);
  const inFolder = (id) => shown.filter((r) => r.folderId === id).sort(byPosition);
  const loose = shown.filter((r) => !folders.some((f) => f.id === r.folderId)).sort(byPosition);
  const count = (key, value) => items.filter((r) => value === "all" || r[key] === value).length;

  const say = (text) => { setNote(text); setTimeout(() => setNote(""), 4000); };
  async function save(call, revert) {
    const result = await call().catch(() => ({ error: "Connection lost. Try again." }));
    if (result?.error) { revert?.(); say(result.error); return null; }
    router.refresh();
    return result;
  }

  // ------------------------------------------------ placing requests
  /** Puts request `id` into a container ("out" or a folder id), before/after a strip or at the end, then saves that container's order. */
  function place(id, { folderId, before, after }) {
    const moving = items.find((r) => r.id === id);
    if (!moving) return;
    const before0 = items;
    const target = (folderId ?? null);
    const others = items.filter((r) => r.id !== id && (r.folderId ?? null) === target).sort(byPosition);
    let at = others.length;
    const ref = before ?? after;
    if (ref) { const k = others.findIndex((r) => r.id === ref); if (k >= 0) at = k + (after ? 1 : 0); }
    const ordered = [...others.slice(0, at), { ...moving, folderId: target }, ...others.slice(at)];
    const positions = new Map(ordered.map((r, i) => [r.id, i]));
    setItems(items.map((r) => (positions.has(r.id) ? { ...r, folderId: target, position: positions.get(r.id) } : r)));
    if (target) setFolders((list) => list.map((f) => (f.id === target ? { ...f, open: true } : f)));
    return save(() => placeInFolder({ folderId: target, orderedIds: ordered.map((r) => r.id) }), () => setItems(before0));
  }

  function onDrop(e) {
    if (!drag.current) return;
    const spot = over;
    const id = drag.current;
    drag.current = null;
    setOver(null);
    if (!spot) return;
    e.preventDefault();
    const [kind, ref] = spot.split(":");
    if (kind === "before") { const r = items.find((x) => x.id === ref); place(id, { folderId: r?.folderId ?? null, before: ref }); }
    else if (kind === "after") { const r = items.find((x) => x.id === ref); place(id, { folderId: r?.folderId ?? null, after: ref }); }
    else if (kind === "in") place(id, { folderId: ref });
    else place(id, { folderId: null });
  }

  function spotFor(e, id) {
    const strip = e.target.closest?.(".cx-strip[data-sid]");
    if (strip) {
      if (strip.dataset.sid === drag.current) return null;
      const box = strip.getBoundingClientRect();
      return `${e.clientY < box.top + box.height / 2 ? "before" : "after"}:${strip.dataset.sid}`;
    }
    if (e.target.closest?.("[data-dropout]")) return "out";
    const folder = e.target.closest?.(".sp-fd[data-fid]");
    return folder ? `in:${folder.dataset.fid}` : null;
  }

  // ------------------------------------------------ folders
  async function addFolder(then) {
    const made = await save(() => newFolder({ name: "New folder" }));
    if (!made) return;
    setFolders((list) => [{ id: made.id, name: made.name, open: true }, ...list]);
    setRenaming(made.id);
    then?.(made.id);
  }
  async function commitName(id, value) {
    setRenaming(null);
    const name = value.trim();
    const current = folders.find((f) => f.id === id);
    if (!name || !current || name === current.name) return;
    setFolders((list) => list.map((f) => (f.id === id ? { ...f, name } : f)));
    save(() => renameFolder({ folderId: id, name }), () => setFolders((list) => list.map((f) => (f.id === id ? current : f))));
  }
  async function dropFolder(id) {
    const keep = { folders, items };
    setFolders((list) => list.filter((f) => f.id !== id));
    setItems((list) => list.map((r) => (r.folderId === id ? { ...r, folderId: null } : r)));
    save(() => removeFolder({ folderId: id }), () => { setFolders(keep.folders); setItems(keep.items); });
  }

  // ------------------------------------------------ rendering
  function renderStrip(r) {
    const open = menu?.id === r.id;
    const moving = open && menu.moving;
    return (
      <article
        key={r.id}
        className={`cx-strip sp-strip${open ? " menu-open" : ""}${over === `before:${r.id}` ? " drop-before" : ""}${over === `after:${r.id}` ? " drop-after" : ""}`}
        style={toneStyle(r)}
        tabIndex={0}
        aria-label={r.title}
        data-sid={r.id}
        draggable
        onClick={(e) => { if (!e.target.closest(".sp-menu-zone")) onOpen(r.id); }}
        onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) { e.preventDefault(); onOpen(r.id); } }}
        onDragStart={(e) => { drag.current = r.id; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", r.id); setMenu(null); setTimeout(() => e.target.classList?.add("dragging"), 0); }}
        onDragEnd={(e) => { drag.current = null; setOver(null); e.target.classList?.remove("dragging"); }}
      >
        <StripFace request={r} now={now} />
        <div className="cx-right">
          {r.unread && <span className="sp-pill">New reply</span>}
          <div className="cx-dots-in sp-menu-zone">
            <button type="button" className="rd-more" aria-label={`Actions for ${r.title}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setMenu(open ? null : { id: r.id, moving: false })}><IcMore /></button>
            {open && (
              <div className="sp-menu" role="menu">
                <button type="button" role="menuitem" className="fl-opt" onClick={() => { setMenu(null); onOpen(r.id); }}>Open conversation</button>
                <button type="button" role="menuitem" className={`fl-opt${moving ? " on" : ""}`} aria-haspopup="menu" aria-expanded={moving} onClick={() => setMenu({ id: r.id, moving: !moving })}>Move to<span className="sp-chev" aria-hidden="true">›</span></button>
              </div>
            )}
            {moving && (
              <div className="sp-menu sp-sub" role="menu" aria-label="Move to">
                <div className="sp-cap">Move to</div>
                {folders.map((f) => (
                  <button key={f.id} type="button" role="menuitemradio" aria-checked={r.folderId === f.id} className="fl-opt" onClick={() => { setMenu(null); place(r.id, { folderId: f.id }); }}>
                    {f.name}{r.folderId === f.id && <span className="sp-tick">✓</span>}
                  </button>
                ))}
                <button type="button" role="menuitemradio" aria-checked={!r.folderId} className="fl-opt" onClick={() => { setMenu(null); place(r.id, { folderId: null }); }}>
                  No folder{!r.folderId && <span className="sp-tick">✓</span>}
                </button>
                <div className="sp-sep" />
                <button type="button" role="menuitem" className="fl-opt" onClick={() => { setMenu(null); addFolder((folderId) => place(r.id, { folderId })); }}>+ New folder…</button>
              </div>
            )}
          </div>
        </div>
      </article>
    );
  }

  function renderFolder(f) {
    const list = inFolder(f.id);
    if (filtering && !list.length) return null;
    const editing = renaming === f.id;
    return (
      <section key={f.id} className={`sp-fd${f.open ? "" : " shut"}${over === `in:${f.id}` ? " drop-in" : ""}`} data-fid={f.id}>
        <div className="sp-fd-h" onClick={(e) => { if (!e.target.closest("input,button.sp-fd-del,.sp-fd-name")) setFolders((l) => l.map((x) => (x.id === f.id ? { ...x, open: !x.open } : x))); }}>
          <button type="button" className="sp-fd-car" aria-label={f.open ? "Fold folder" : "Open folder"} aria-expanded={f.open} onClick={() => setFolders((l) => l.map((x) => (x.id === f.id ? { ...x, open: !x.open } : x)))}><CaretIcon /></button>
          <FolderIcon />
          {editing ? (
            <input
              className="sp-fd-in"
              autoFocus
              defaultValue={f.name}
              maxLength={40}
              aria-label="Folder name"
              onFocus={(e) => e.target.select()}
              onBlur={(e) => commitName(f.id, e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); if (e.key === "Escape") { setRenaming(null); } }}
            />
          ) : (
            <button type="button" className="sp-fd-name" title="Click to rename" onClick={() => setRenaming(f.id)}>{f.name}</button>
          )}
          <span className="sp-fd-n">{list.length}</span>
          <button type="button" className="sp-fd-del" title="Delete folder — its requests stay in the list" aria-label={`Delete folder ${f.name}`} onClick={() => dropFolder(f.id)}><TrashIcon /></button>
        </div>
        <div className="sp-fd-body">
          {list.length ? list.map(renderStrip) : <div className="sp-fd-empty">Empty — use ⋯ → Move to on any request to put it here</div>}
        </div>
      </section>
    );
  }

  const empty = items.length === 0;
  return (
    <div className="cx-body sp-body">
      {outdated && <p className="notice" role="status">The database needs update <code>0052_support.sql</code> before requests can be sent. Ask an admin to run it.</p>}
      <div className="cx-plate">
        <PopBtn label="Status" value={status === "all" ? "" : STATUS_LABEL[status]} width={220}>
          {(close) => [["all", "All"], ...STATUSES.map((s) => [s, STATUS_LABEL[s]])].map(([key, label]) => <Opt key={key} on={status === key} count={count("status", key)} onClick={() => { setStatus(key); close(); }}>{label}</Opt>)}
        </PopBtn>
        <PopBtn label="Type" value={type === "all" ? "" : TYPE_LABEL[type]} width={220}>
          {(close) => [["all", "All"], ...TYPES.map((t) => [t, TYPE_LABEL[t]])].map(([key, label]) => <Opt key={key} on={type === key} count={count("type", key)} onClick={() => { setType(key); close(); }}>{label}</Opt>)}
        </PopBtn>
        {filtering && <button type="button" className="link-button" onClick={() => { setStatus("all"); setType("all"); }}>Clear</button>}
        <span className="cx-spacer" />
        <span className="fl-shown" aria-live="polite">{plural(shown.length)}</span>
        <button type="button" className="button button-quiet button-with-icon" onClick={() => addFolder()}><FolderPlusIcon />New folder</button>
        <button type="button" className="button button-with-icon" onClick={onNew}><IcPlus size={16} />New request</button>
      </div>

      {note && <p className="sp-problem" role="alert">{note}</p>}

      {empty ? (
        <div className="cx-empty">No requests yet — ask the assistant or write to the developer.</div>
      ) : (
        <div
          className="cx-strips sp-strips"
          onDragOver={(e) => { if (!drag.current) return; const spot = spotFor(e); setOver(spot); if (spot) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; } }}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(null); }}
          onDrop={onDrop}
        >
          {folders.map(renderFolder)}
          {folders.length > 0 && <div className={`sp-fd-sep${over === "out" ? " drop-in" : ""}`} data-dropout>Outside folders</div>}
          {loose.map(renderStrip)}
          {folders.length > 0 && !loose.length && !filtering && <div className={`sp-fd-empty${over === "out" ? " drop-in" : ""}`} data-dropout>Drop a request here to take it out of its folder</div>}
          {shown.length === 0 && <div className="cx-empty">No requests match the filters.</div>}
        </div>
      )}
    </div>
  );
}
