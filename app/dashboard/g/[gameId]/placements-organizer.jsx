"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { PLACE_TYPES } from "../../../../lib/placement-organization";
import {
  GROUP_BY,
  SORT_BY,
  STATUS_LABELS,
  cleanView,
  facets,
  filterItems,
  groupItems,
  sortItems,
  stateOf,
  typeLabel,
  withView,
} from "../../../../lib/placement-view";
import {
  changeTags,
  createFolder,
  deleteFolder,
  movePlacements,
  renamePlacement,
  reorderPlacements,
  renameFolder,
  setFolderEnabled,
  setPlaceType,
  setPlacementsEnabled,
  setSceneEnabled,
} from "../../placement-actions";
import { CardPopups, OrgContext } from "./placement-card";

const FILTER_KEYS = ["format", "status", "type", "folder", "tag", "scene", "sharing"];
const CUSTOM = "__custom";
const DRAG_FROM = 6; // pixels the pointer must travel before a press on a card becomes a drag
const SPRING_MS = 600; // a card held over a closed folder opens it
const PAGE = 24; // cards shown per group until "Show more"
const FEW = 12; // with this many placements or fewer, every group starts open

/**
 * The Placements tab: folders (or scenes, tags, …) as rows, placements as the cards they always were, with
 * the on/off switch, chips, Details, Where it stands and Tags inside each card. Placements that are in no
 * folder lie loose below the folders. Ticking, folder editing and the actions on what is ticked appear only
 * after "Edit".
 *
 * items: [{ id, externalId, label, shared, enabled, folderId, tags, placeType, suggestedType, format,
 *           firstSeenAt, places, hasAds, views, card }]   (card: the picture editor, rendered on the server)
 */
export default function PlacementsOrganizer({ gameId, items: serverItems, folders: serverFolders, offScenes: serverOffScenes, focus }) {
  const [pending, startTransition] = useTransition();
  // What the person just did, shown at once while the server catches up. Dropped when fresh data arrives or an action fails.
  const [shownNow, setShownNow] = useState(emptyShownNow);
  // Names just typed: shown (dimmed) until the server's own list carries them, so the old name never flashes back.
  const [renames, setRenames] = useState(() => new Map());
  const serverLabels = useRef(new Map());
  serverLabels.current = new Map(serverItems.map((item) => [item.id, item.label]));
  useEffect(() => {
    setShownNow(emptyShownNow());
  }, [serverItems, serverFolders, serverOffScenes]);
  useEffect(() => {
    setRenames((current) => {
      const left = [...current].filter(([id, label]) => serverLabels.current.get(id) !== label);
      return left.length === current.size ? current : new Map(left);
    });
  }, [serverItems]);
  const items = useMemo(() => {
    if (!shownNow.enabled.size && !shownNow.folderOf.size && !shownNow.order.size && !renames.size) return serverItems;
    return serverItems.map((item) => {
      let next = item;
      if (renames.has(item.id)) next = { ...next, label: renames.get(item.id), labelPending: true };
      if (shownNow.order.has(item.id)) next = { ...next, sortIndex: shownNow.order.get(item.id) };
      if (shownNow.enabled.has(item.id)) next = { ...next, enabled: shownNow.enabled.get(item.id) };
      if (shownNow.folderOf.has(item.id)) next = { ...next, folderId: shownNow.folderOf.get(item.id) };
      return next;
    });
  }, [serverItems, shownNow.enabled, shownNow.folderOf, shownNow.order, renames]);
  const folders = useMemo(() => {
    const base = shownNow.folderEnabled.size ? serverFolders.map((folder) => (shownNow.folderEnabled.has(folder.id) ? { ...folder, enabled: shownNow.folderEnabled.get(folder.id) } : folder)) : serverFolders;
    return shownNow.folders.length ? [...base, ...shownNow.folders.filter((added) => !base.some((folder) => folder.name === added.name))].sort((a, b) => a.name.localeCompare(b.name)) : base;
  }, [serverFolders, shownNow.folderEnabled, shownNow.folders]);
  const offScenes = useMemo(() => {
    if (!shownNow.scenes.size) return serverOffScenes;
    const next = new Set(serverOffScenes);
    for (const [scene, off] of shownNow.scenes) {
      if (off) next.add(scene);
      else next.delete(scene);
    }
    return [...next];
  }, [serverOffScenes, shownNow.scenes]);
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState({});
  const [groupBy, setGroupBy] = useState("folder");
  const [sortBy, setSortBy] = useState("manual");
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [groupOpen, setGroupOpen] = useState(() => new Map()); // key -> true | false, once the person chose
  const [shown, setShown] = useState(() => new Map()); // key -> how many cards
  const [views, setViews] = useState([]);
  const [viewsOpen, setViewsOpen] = useState(false);
  const [viewName, setViewName] = useState("");
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(() => new Set()); // switches waiting for the server: p:<placement>, f:<folder>, s:<scene>
  const [newFolder, setNewFolder] = useState(null); // null: closed, string: being typed
  const [editFolder, setEditFolder] = useState(null); // { id, name }
  const [confirmFolder, setConfirmFolder] = useState(null); // folder whose trash was pressed once
  const [pop, setPop] = useState(null); // the open menu or panel: { id, kind, anchor, cell }
  const [drag, setDrag] = useState(null); // while a card is carried: { ids, label, x, y, over }
  const renameDone = useRef(false);
  const [bulkTag, setBulkTag] = useState("");
  const [bulkType, setBulkType] = useState("");
  const [bulkCustom, setBulkCustom] = useState("");
  const focusDone = useRef(false);

  const storageKey = `deusads.placement-views.${gameId}`;
  const ctx = useMemo(() => ({ folders, offScenes: new Set(offScenes) }), [folders, offScenes]);
  const options = useMemo(() => facets(items, ctx), [items, ctx]);
  const activeFilters = useMemo(() => ({ ...filters, q }), [filters, q]);

  const visible = useMemo(() => sortItems(filterItems(items, activeFilters, ctx), sortBy), [items, activeFilters, ctx, sortBy]);
  const groups = useMemo(() => groupItems(visible, groupBy, ctx), [visible, groupBy, ctx]);
  const filterCount = FILTER_KEYS.filter((key) => filters[key]).length;
  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const hasFilters = filterCount > 0 || q.trim() !== "";

  // A placement's card exists once: in the first group it appears in. Elsewhere it is a pointer to that card.
  const home = useMemo(() => {
    const map = new Map();
    for (const group of groups) for (const item of group.items) if (!map.has(item.id)) map.set(item.id, group);
    return map;
  }, [groups]);

  const loose = (group) => groupBy === "folder" && group.key === "none";
  const keyOf = (group) => `${groupBy}:${group.key}`;
  const isOpen = (group, index) => {
    const key = keyOf(group);
    if (groupOpen.has(key)) return groupOpen.get(key);
    return items.length <= FEW || index === 0;
  };

  // Collapse all / Expand all: every folder-like group (not the loose cards) opens or closes together.
  const framed = groups.filter((group) => !loose(group));
  const allOpen = framed.length > 0 && framed.every((group) => isOpen(group, groups.indexOf(group)));
  const setAllOpen = (open) => setGroupOpen((current) => {
    const next = new Map(current);
    for (const group of framed) next.set(keyOf(group), open);
    return next;
  });

  // Saved views live in this browser: a convenience, not shared with other devices.
  useEffect(() => {
    try {
      const raw = JSON.parse(window.localStorage.getItem(storageKey) ?? "[]");
      setViews(Array.isArray(raw) ? raw.map(cleanView).filter(Boolean) : []);
    } catch {
      setViews([]);
    }
  }, [storageKey]);

  // Coming from Unity ("Open in dashboard"): show that placement and scroll to it.
  useEffect(() => {
    if (!focus || focusDone.current) return;
    const target = items.find((item) => item.externalId === focus);
    const group = target && home.get(target.id);
    if (!target || !group) return;
    focusDone.current = true;
    setGroupOpen((current) => new Map(current).set(keyOf(group), true));
    setShown((current) => new Map(current).set(keyOf(group), Infinity));
    setTimeout(() => document.getElementById(`plc-${target.id}`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 120);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, items, home]);

  // Ticks for placements that no longer exist (removed in Unity, filtered by a refresh) are dropped.
  useEffect(() => {
    setSelected((current) => {
      const kept = new Set([...current].filter((id) => itemById.has(id)));
      return kept.size === current.size ? current : kept;
    });
  }, [itemById]);

  // The action revalidates the page on the server, so the fresh data comes back with its answer.
  function run(promise, after, undo, keys = []) {
    setNotice(null);
    if (keys.length) setBusy((current) => new Set([...current, ...keys]));
    startTransition(async () => {
      const result = await promise.catch(() => ({ error: "Connection lost. Try again." }));
      if (keys.length) setBusy((current) => new Set([...current].filter((key) => !keys.includes(key))));
      if (result?.error) {
        undo?.();
        return setNotice({ kind: "error", text: result.error });
      }
      if (result?.warning) setNotice({ kind: "note", text: result.warning });
      after?.(result);
    });
  }
  const forget = () => setShownNow(emptyShownNow());
  function switchPlacements(ids, enabled) {
    setShownNow((current) => ({ ...current, enabled: new Map([...current.enabled, ...ids.map((id) => [id, enabled])]) }));
    run(setPlacementsEnabled({ gameId, ids, enabled }), undefined, forget, ids.map((id) => `p:${id}`));
  }

  // ---- menus and panels that float over the page (drawn by CardPopups)
  function togglePop(event, id, kind) {
    if (pop && pop.id === id && pop.kind === kind) return setPop(null);
    const button = event.currentTarget;
    const cell = button.closest("[data-card]");
    if (!cell) return;
    setPop({ id, kind, anchor: rectOf(button), cell: rectOf(cell) });
  }
  const say = (next) => setNotice(next);

  // ---- moving placements between folders (the menu's "Move to folder" and dragging a card)
  function moveItems(ids, folderId) {
    const moving = ids.map((id) => itemById.get(id)).filter((item) => item && (item.folderId ?? null) !== folderId);
    if (moving.length === 0) return;
    const before = moving.map((item) => [item.id, item.folderId ?? null]);
    const place = folderId ? folders.find((folder) => folder.id === folderId) : null;
    const what = moving.length === 1 ? `“${moving[0].label}”` : `${moving.length} placements`;
    const text = place ? `${what} moved to “${place.name}”${place.enabled === false ? " (that folder is switched off)" : ""}` : `${what} taken out of the folder`;
    setShownNow((current) => ({ ...current, folderOf: new Map([...current.folderOf, ...moving.map((item) => [item.id, folderId])]) }));
    run(movePlacements({ gameId, ids: moving.map((item) => item.id), folderId }), () => setNotice({ kind: "note", text, undo: () => undoMove(before) }), forget);
  }
  function undoMove(before) {
    const byFolder = new Map();
    for (const [id, folderId] of before) byFolder.set(folderId, [...(byFolder.get(folderId) ?? []), id]);
    setShownNow((current) => ({ ...current, folderOf: new Map([...current.folderOf, ...before]) }));
    setNotice(null);
    for (const [folderId, ids] of byFolder) run(movePlacements({ gameId, ids, folderId }), undefined, forget);
  }

  // A new placement name: shown at once but dimmed, until the server's list really carries it.
  function renameItem(id, label) {
    setRenames((current) => new Map(current).set(id, label));
    const drop = () => setRenames((current) => (current.has(id) ? new Map([...current].filter(([key]) => key !== id)) : current));
    run(renamePlacement({ placementId: id, label }), () => {
      // the fresh list normally arrives with the answer; if it did not carry the name, say so instead of showing it for ever
      setTimeout(() => {
        if (serverLabels.current.get(id) !== label) {
          drop();
          setNotice({ kind: "error", text: "The new name was not applied. Try again." });
        }
      }, 4000);
    }, drop);
  }

  // Dropping on a card puts the dragged ones before or after it; the whole list of that folder is saved in that order.
  function dropItems(ids, folderId, slot) {
    const group = groups.find((entry) => (folderId === null ? entry.key === "none" : entry.folderId === folderId));
    if (!slot || !group || ids.includes(slot.cardId)) return moveItems(ids, folderId);
    const current = group.items.map((item) => item.id);
    const rest = current.filter((id) => !ids.includes(id));
    const at = rest.indexOf(slot.cardId);
    if (at < 0) return moveItems(ids, folderId);
    const list = [...rest.slice(0, at + (slot.before ? 0 : 1)), ...ids, ...rest.slice(at + (slot.before ? 0 : 1))];
    const changedFolder = ids.map((id) => itemById.get(id)).filter((item) => item && (item.folderId ?? null) !== folderId);
    if (changedFolder.length === 0 && list.every((id, index) => id === current[index])) return;
    const before = changedFolder.map((item) => [item.id, item.folderId ?? null]);
    setSortBy("manual");
    setShownNow((now) => ({
      ...now,
      folderOf: new Map([...now.folderOf, ...changedFolder.map((item) => [item.id, folderId])]),
      order: new Map([...now.order, ...list.map((id, index) => [id, index])]),
    }));
    const place = folderId ? folders.find((folder) => folder.id === folderId) : null;
    const what = changedFolder.length === 1 ? `“${changedFolder[0].label}”` : `${changedFolder.length} placements`;
    const text = place ? `${what} moved to “${place.name}”` : `${what} taken out of the folder`;
    run(reorderPlacements({ gameId, folderId, ids: list }), () => changedFolder.length > 0 && setNotice({ kind: "note", text, undo: () => undoMove(before) }), forget);
  }

  // ---- dragging a card by its top row, the way Explorer drags files: onto a folder, or out of all folders
  const latest = useRef(null);
  latest.current = { groupBy, editing, selected, itemById, groups, moveItems, dropItems, isOpen, setGroupOpen, keyOf };
  useEffect(() => {
    let candidate = null;
    let springKey = null;
    let springTimer = 0;
    const groupAt = (x, y) => document.elementFromPoint(x, y)?.closest?.("[data-group]")?.getAttribute("data-group") ?? null;
    // the card under the pointer, and whether the pointer is in its left half (drop before it) or right half (after it)
    const slotAt = (x, y, ids) => {
      const cell = document.elementFromPoint(x, y)?.closest?.("[data-card]");
      const cardId = cell?.getAttribute("data-card");
      if (!cell || ids.includes(cardId)) return null;
      const box = cell.getBoundingClientRect();
      return { cardId, before: x < box.left + box.width / 2 };
    };
    function spring(group) {
      const live = latest.current;
      const target = group && group !== "none" ? live.groups.find((entry) => entry.kind === "folder" && entry.folderId === group) : null;
      const closed = target && !live.isOpen(target, live.groups.indexOf(target));
      const key = closed ? group : null;
      if (key === springKey) return;
      clearTimeout(springTimer);
      springKey = key;
      if (key) springTimer = setTimeout(() => live.setGroupOpen((current) => new Map(current).set(live.keyOf(target), true)), SPRING_MS);
    }
    function move(event) {
      if (!candidate) return;
      const live = latest.current;
      if (!candidate.started) {
        if (Math.hypot(event.clientX - candidate.x0, event.clientY - candidate.y0) < DRAG_FROM) return;
        candidate.started = true;
        candidate.ids = live.editing && live.selected.has(candidate.id) ? [...live.selected] : [candidate.id];
        candidate.label = candidate.ids.length > 1 ? `${candidate.ids.length} placements` : live.itemById.get(candidate.id)?.label ?? "";
        document.body.classList.add("is-dragging-cards");
        setPop(null);
      }
      const over = groupAt(event.clientX, event.clientY);
      spring(over);
      candidate.slot = slotAt(event.clientX, event.clientY, candidate.ids);
      if (event.clientY < 90) window.scrollBy(0, -16);
      else if (event.clientY > window.innerHeight - 90) window.scrollBy(0, 16);
      setDrag({ ids: candidate.ids, label: candidate.label, x: event.clientX, y: event.clientY, over, slot: candidate.slot });
    }
    function finish(event, drop) {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      clearTimeout(springTimer);
      springKey = null;
      const done = candidate;
      candidate = null;
      if (!done?.started) return;
      document.body.classList.remove("is-dragging-cards");
      setDrag(null);
      // the click that ends a drag must not also press a button under the pointer
      const swallow = (clickEvent) => clickEvent.stopPropagation();
      window.addEventListener("click", swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener("click", swallow, true), 0);
      if (!drop) return;
      const target = groupAt(event.clientX, event.clientY);
      if (target === null) return;
      latest.current.dropItems(done.ids, target === "none" ? null : target, done.slot ?? null);
    }
    const up = (event) => finish(event, true);
    const cancel = (event) => finish(event, false);
    function down(event) {
      const live = latest.current;
      if (live.groupBy !== "folder") return;
      if (event.button !== undefined && event.button !== 0) return;
      const head = event.target.closest?.(".org-namerow");
      const cell = head?.closest("[data-card]");
      if (!cell || event.target.closest("[data-nodrag]")) return;
      if (event.pointerType === "touch" && !event.target.closest("[data-grip]")) return;
      candidate = { id: cell.getAttribute("data-card"), x0: event.clientX, y0: event.clientY, started: false, ids: [], label: "" };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", cancel);
    }
    document.addEventListener("pointerdown", down);
    return () => {
      document.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      clearTimeout(springTimer);
      document.body.classList.remove("is-dragging-cards");
    };
  }, []);
  const dragIds = useMemo(() => new Set(drag?.ids ?? []), [drag]);

  // A press anywhere outside the new-folder panel closes it (not while the folder is being saved).
  const newFolderOpen = newFolder !== null;
  useEffect(() => {
    if (!newFolderOpen || pending) return undefined;
    function outside(event) {
      if (event.target.closest?.(".org-newfolder")) return;
      setNewFolder(null);
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [newFolderOpen, pending]);

  const chosen = [...selected];
  const toggleSelected = (id) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  function selectGroup(group) {
    const ids = group.items.map((item) => item.id);
    const all = ids.length > 0 && ids.every((id) => selected.has(id));
    setSelected((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (all) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }
  const selectVisible = () => setSelected(new Set(visible.map((item) => item.id)));

  function toggleEditing() {
    if (editing) {
      setSelected(new Set());
      setEditFolder(null);
    }
    setEditing(!editing);
  }

  function jumpHome(id) {
    const group = home.get(id);
    if (group) {
      setGroupOpen((current) => new Map(current).set(keyOf(group), true));
      setShown((current) => new Map(current).set(keyOf(group), Infinity));
    }
    setTimeout(() => document.getElementById(`plc-${id}`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 60);
  }

  function setFilter(key, value) {
    setFilters((current) => {
      const next = { ...current };
      if (value) next[key] = value;
      else delete next[key];
      return next;
    });
  }
  function clearFilters() {
    setFilters({});
    setQ("");
  }

  // ---- saved views
  function applyView(view) {
    setGroupBy(view.groupBy);
    setSortBy(view.sortBy);
    setQ(view.filters.q ?? "");
    const { q: _q, ...rest } = view.filters;
    setFilters(rest);
    setViewsOpen(false);
  }
  function persistViews(next) {
    setViews(next);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      setNotice({ kind: "note", text: "This browser would not keep the saved view, so it lasts until you leave the page." });
    }
  }
  function saveView(event) {
    event.preventDefault();
    persistViews(withView(views, { name: viewName, groupBy, sortBy, filters: activeFilters }));
    setViewName("");
  }

  // ---- actions on what is ticked
  function bulkSetType(event) {
    event.preventDefault();
    if (!bulkType || (bulkType === CUSTOM && !bulkCustom.trim())) return;
    const type = bulkType === CUSTOM ? bulkCustom : bulkType === "__auto" ? null : bulkType;
    run(setPlaceType({ gameId, ids: chosen, type }), () => {
      setBulkType("");
      setBulkCustom("");
    });
  }

  function groupSwitch(group, enabled) {
    if (group.kind === "scene" && group.sceneSwitch) {
      setShownNow((current) => ({ ...current, scenes: new Map([...current.scenes, [group.scene, !enabled]]) }));
      return run(setSceneEnabled({ gameId, scene: group.scene, enabled }), undefined, forget, [`s:${group.scene}`]);
    }
    if (group.kind === "folder") {
      setShownNow((current) => ({ ...current, folderEnabled: new Map([...current.folderEnabled, [group.folderId, enabled]]) }));
      return run(setFolderEnabled({ folderId: group.folderId, enabled }), undefined, forget, [`f:${group.folderId}`]);
    }
    return switchPlacements(group.items.map((item) => item.id), enabled);
  }

  const groupIsOn = (group) => {
    if (group.kind === "scene" && group.sceneSwitch) return !ctx.offScenes.has(group.scene);
    if (group.kind === "folder") return group.enabled !== false;
    return group.items.some((item) => item.enabled !== false);
  };

  function submitNewFolder(event) {
    event.preventDefault();
    const name = (newFolder ?? "").trim();
    if (!name) return;
    setShownNow((current) => ({ ...current, folders: [...current.folders, { id: `new-${name}`, name, enabled: true, parentId: null }] }));
    run(createFolder({ gameId, name }), () => setNewFolder(null), forget);
  }

  // The folder's name is renamed where it stands: Enter or a click elsewhere saves, Escape cancels.
  function startRenameFolder(group) {
    renameDone.current = false;
    setEditFolder({ id: group.folderId, name: group.label, original: group.label });
  }
  function commitRenameFolder() {
    if (renameDone.current || !editFolder) return;
    renameDone.current = true;
    const name = editFolder.name.trim();
    if (!name || name === editFolder.original) return setEditFolder(null);
    run(renameFolder({ folderId: editFolder.id, name }), () => setEditFolder(null), () => {
      renameDone.current = false;
    });
  }

  const orgValue = useMemo(
    () => ({ gameId, items: itemById, ctx, editing, selected, onSelect: toggleSelected, stateOf: (item) => stateOf(item, ctx), switchPlacements, busy, pop, setPop, togglePop, say, moveItems, renameItem, dragIds }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gameId, itemById, ctx, editing, selected, busy, pop, dragIds]
  );

  const folderGroups = groups.filter((group) => group.kind === "folder").length;
  const looseCount = groupBy === "folder" ? groups.find((group) => group.key === "none")?.items.length ?? 0 : 0;

  return (
    <OrgContext.Provider value={orgValue}>
      <section className="org" aria-label="Placements" aria-busy={pending}>
        <div className="org-toolbar">
          <div className="org-bar">
            <input
              className="field org-search"
              type="search"
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="Search name, ID, scene, path or tag"
              aria-label="Search placements"
            />
            <label className="org-inline">
              <span>Group by</span>
              <select className="field" value={groupBy} onChange={(event) => setGroupBy(event.target.value)}>
                {GROUP_BY.map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="org-inline">
              <span>Sort</span>
              <select className="field" value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                {SORT_BY.map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <div className="org-popover-wrap">
              <button type="button" className="button button-quiet" onClick={() => setViewsOpen((value) => !value)} aria-expanded={viewsOpen}>
                Saved views
              </button>
              {viewsOpen && (
                <div className="org-popover" role="dialog" aria-label="Saved views">
                  {views.length === 0 && <p className="muted-line">No saved views yet. A view remembers the grouping, sorting, search and filters.</p>}
                  <ul className="org-view-list">
                    {views.map((view) => (
                      <li key={view.name}>
                        <button type="button" className="link-button" onClick={() => applyView(view)}>
                          {view.name}
                        </button>
                        <button type="button" className="org-x" aria-label={`Delete view ${view.name}`} onClick={() => persistViews(views.filter((entry) => entry.name !== view.name))}>
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                  <form className="row" onSubmit={saveView}>
                    <input className="field" value={viewName} maxLength={40} placeholder="Name this view" onChange={(event) => setViewName(event.target.value)} aria-label="View name" />
                    <button className="button button-small" type="submit" disabled={!viewName.trim()}>
                      Save
                    </button>
                  </form>
                  <p className="muted-line">Saved in this browser only.</p>
                </div>
              )}
            </div>
          </div>

          <div className="org-pills">
            <span className="org-pills-label">Filter</span>
            <Pill label="Format" value={filters.format} onChange={(value) => setFilter("format", value)} options={options.formats.map((value) => [value, value])} />
            <Pill
              label="Place type"
              value={filters.type}
              onChange={(value) => setFilter("type", value)}
              options={[...options.types.map((value) => [value, typeLabel(value)]), ...(options.hasUndetermined ? [["none", "Not determined"]] : [])]}
            />
            <Pill
              label="Status"
              value={filters.status}
              onChange={(value) => setFilter("status", value)}
              options={[["showing", STATUS_LABELS.showing], ["empty", STATUS_LABELS.empty], ["off", "Switched off (fully or partly)"]]}
            />
            <Pill label="ID" value={filters.sharing} onChange={(value) => setFilter("sharing", value)} options={[["shared", "Shared"], ["unique", "Unique"]]} />
            <Pill label="Scene" value={filters.scene} onChange={(value) => setFilter("scene", value)} options={options.scenes.map((value) => [value, value])} />
            <Pill label="Tag" value={filters.tag} onChange={(value) => setFilter("tag", value)} options={options.tags.map((value) => [value, value])} />
            <Pill
              label="Folder"
              value={filters.folder}
              onChange={(value) => setFilter("folder", value)}
              options={[["none", "No folder"], ...options.folders.map((folder) => [folder.id, folder.name])]}
            />
            {hasFilters && (
              <button type="button" className="link-button" onClick={clearFilters}>
                Clear
              </button>
            )}
          </div>
        </div>

        <div className="org-listbar">
          <span className="org-listbar-text">
            {groupBy === "folder"
              ? `${folderGroups} folder${folderGroups === 1 ? "" : "s"} · ${looseCount} placement${looseCount === 1 ? "" : "s"} outside folders`
              : `${groups.length} group${groups.length === 1 ? "" : "s"}`}
            {visible.length !== items.length ? ` · ${visible.length} of ${items.length} match` : ""}
          </span>
          {framed.length > 0 && (
            <button type="button" className="org-iconbtn" title={allOpen ? "Collapse all" : "Expand all"} aria-label={allOpen ? "Collapse all" : "Expand all"} onClick={() => setAllOpen(!allOpen)}>
              <CollapseIcon open={allOpen} />
            </button>
          )}
          {/* like the API key button in Settings: the button keeps its place, the field floats over what is below */}
          <div className="key-corner org-newfolder">
            <button
              type="button"
              className="org-iconbtn key-corner-button"
              title="New folder"
              aria-label="New folder"
              onClick={() => setNewFolder("")}
              aria-expanded={newFolder !== null}
              tabIndex={newFolder !== null ? -1 : 0}
              style={newFolder !== null ? { visibility: "hidden" } : undefined}
            >
              <FolderPlusIcon big />
            </button>
            {newFolder !== null && (
              <form
                className="key-field"
                aria-label="New folder"
                onSubmit={submitNewFolder}
                onKeyDown={(event) => {
                  if (event.key === "Escape" && !pending) setNewFolder(null);
                }}
              >
                <div className="key-field-head">
                  <span className="key-field-title">
                    <FolderPlusIcon /> New folder
                  </span>
                  <button type="button" className="button button-quiet key-toggle" onClick={() => setNewFolder(null)} disabled={pending}>
                    Hide
                  </button>
                </div>
                <input className="field" value={newFolder} maxLength={80} autoFocus placeholder="Folder name" disabled={pending} onChange={(event) => setNewFolder(event.target.value)} aria-label="New folder name" />
                <div className="row">
                  <button className="button" type="submit" disabled={!newFolder.trim() || pending}>
                    {pending ? "Creating…" : "Create folder"}
                  </button>
                </div>
                <span role="status" aria-live="polite" className="settings-help">
                  {pending ? "Saving the folder…" : ""}
                </span>
              </form>
            )}
          </div>
          <button type="button" className="org-iconbtn org-edit" onClick={toggleEditing} aria-pressed={editing}>
            <PencilIcon />
            {editing ? "Done" : "Edit"}
          </button>
        </div>


        {editing && (
          <div className="org-selection" role="region" aria-label="Actions for the ticked placements">
            <strong>{chosen.length} selected</strong>
            <button className="button button-small" type="button" disabled={pending || chosen.length === 0} onClick={() => switchPlacements(chosen, true)}>
              Switch on
            </button>
            <button className="button button-quiet button-small" type="button" disabled={pending || chosen.length === 0} onClick={() => switchPlacements(chosen, false)}>
              Switch off
            </button>
            <select
              className="field"
              value=""
              disabled={chosen.length === 0}
              aria-label="Move the ticked placements to a folder"
              onChange={(event) => {
                const value = event.target.value;
                if (value) run(movePlacements({ gameId, ids: chosen, folderId: value === "__none" ? null : value }));
              }}
            >
              <option value="">Move to folder…</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.name}
                </option>
              ))}
              <option value="__none">Take out of any folder</option>
            </select>
            <form
              className="row"
              onSubmit={(event) => {
                event.preventDefault();
                if (bulkTag.trim()) run(changeTags({ gameId, ids: chosen, add: [bulkTag] }), () => setBulkTag(""));
              }}
            >
              <input className="field" value={bulkTag} maxLength={30} placeholder="Tag" disabled={chosen.length === 0} onChange={(event) => setBulkTag(event.target.value)} aria-label="Tag for the ticked placements" />
              <button className="button button-quiet button-small" type="submit" disabled={!bulkTag.trim() || pending || chosen.length === 0}>
                Add tag
              </button>
              <button
                className="button button-quiet button-small"
                type="button"
                disabled={!bulkTag.trim() || pending || chosen.length === 0}
                onClick={() => run(changeTags({ gameId, ids: chosen, remove: [bulkTag] }), () => setBulkTag(""))}
              >
                Remove tag
              </button>
            </form>
            <form className="row" onSubmit={bulkSetType}>
              <select className="field" value={bulkType} disabled={chosen.length === 0} onChange={(event) => setBulkType(event.target.value)} aria-label="Place type for the ticked placements">
                <option value="">Place type…</option>
                {PLACE_TYPES.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.label}
                  </option>
                ))}
                <option value={CUSTOM}>Other…</option>
                <option value="__auto">Back to automatic</option>
              </select>
              {bulkType === CUSTOM && (
                <input className="field" value={bulkCustom} maxLength={40} placeholder="e.g. Boss arena" onChange={(event) => setBulkCustom(event.target.value)} aria-label="Custom place type" />
              )}
              <button className="button button-quiet button-small" type="submit" disabled={!bulkType || pending || chosen.length === 0}>
                Apply
              </button>
            </form>
            <span className="org-selection-end">
              <button type="button" className="link-button" onClick={selectVisible}>
                Tick all {visible.length} shown
              </button>
              <button type="button" className="link-button" onClick={() => setSelected(new Set())}>
                Clear
              </button>
            </span>
          </div>
        )}

        {notice && (
          <div className={notice.kind === "error" ? "error" : "notice"} role={notice.kind === "error" ? "alert" : "status"}>
            {notice.text}
            {notice.undo && (
              <button type="button" className="link-button org-undo" onClick={notice.undo}>
                Undo
              </button>
            )}
          </div>
        )}

        {groups.length === 0 && (
          <div className="empty">
            <p style={{ margin: "0 auto 0.5rem" }}>No placements match.</p>
            {hasFilters && (
              <button type="button" className="link-button" onClick={clearFilters}>
                Clear filters
              </button>
            )}
          </div>
        )}

        {groups.map((group, index) => {
          const key = keyOf(group);
          const cards = (
            <Cards
              group={group}
              limit={shown.get(key) ?? PAGE}
              onMore={() => setShown((current) => new Map(current).set(key, (current.get(key) ?? PAGE) + PAGE))}
              gameId={gameId}
              home={home}
              ctx={ctx}
              onJump={jumpHome}
              dragIds={dragIds}
              slot={drag?.slot ?? null}
            />
          );

          // Placements outside any folder: no row, no frame, just the cards.
          if (loose(group)) {
            return (
              <div className={`org-loose${drag ? " is-zone" : ""}${drag?.over === "none" ? " is-drop" : ""}`} key={key} data-group="none">
                {cards}
              </div>
            );
          }

          const ids = group.items.map((item) => item.id);
          const ticked = ids.filter((id) => selected.has(id)).length;
          const open = isOpen(group, index);
          const on = groupIsOn(group);
          const folderEditing = editFolder && editFolder.id === group.folderId;
          const counts = countStates(group.items, ctx);
          const switching = group.kind === "folder" ? busy.has(`f:${group.folderId}`) : group.kind === "scene" ? busy.has(`s:${group.scene}`) : ids.some((id) => busy.has(`p:${id}`));
          return (
            <div
              className={`org-group${on ? "" : " is-off"}${open ? " is-open" : ""}${drag && group.kind === "folder" && drag.over === group.folderId ? " is-drop" : ""}`}
              key={key}
              data-group={groupBy === "folder" && group.kind === "folder" ? group.folderId : undefined}
            >
              <div className="org-group-head">
                <button
                  type="button"
                  className="org-caret org-caret-button"
                  aria-label={open ? `Collapse ${group.label}` : `Expand ${group.label}`}
                  aria-expanded={open}
                  onClick={() => setGroupOpen((current) => new Map(current).set(key, !open))}
                >
                  {open ? "▾" : "▸"}
                </button>
                {editing && (
                  <label className="org-check">
                    <input
                      type="checkbox"
                      checked={ids.length > 0 && ticked === ids.length}
                      ref={(node) => {
                        if (node) node.indeterminate = ticked > 0 && ticked < ids.length;
                      }}
                      disabled={ids.length === 0}
                      onChange={() => selectGroup(group)}
                    />
                    <span className="sr-only">Tick everything in {group.label}</span>
                  </label>
                )}
                <FolderIcon open={open} off={!on} />
                {folderEditing ? (
                  <input
                    className="field org-group-rename-input"
                    value={editFolder.name}
                    maxLength={80}
                    autoFocus
                    aria-label="Folder name"
                    onFocus={(event) => event.target.select()}
                    onChange={(event) => setEditFolder({ ...editFolder, name: event.target.value })}
                    onBlur={commitRenameFolder}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        commitRenameFolder();
                      } else if (event.key === "Escape") {
                        renameDone.current = true;
                        setEditFolder(null);
                      }
                    }}
                  />
                ) : (
                  <div className="org-group-title">
                    {group.kind === "folder" ? (
                      <button type="button" className="org-group-name org-name-btn" title="Click to rename" onClick={() => startRenameFolder(group)}>
                        {group.label}
                      </button>
                    ) : (
                      <button type="button" className="org-group-name org-name-btn is-plain" onClick={() => setGroupOpen((current) => new Map(current).set(key, !open))} aria-expanded={open}>
                        {group.label}
                      </button>
                    )}
                    <button type="button" className="org-group-counts org-counts-btn" onClick={() => setGroupOpen((current) => new Map(current).set(key, !open))} aria-expanded={open} tabIndex={-1}>
                      {describeCounts(ids.length, counts, !on && group.kind === "folder")}
                    </button>
                  </div>
                )}
                <span className="org-group-actions">
                  {editing && group.kind === "folder" && !folderEditing && (
                    <button
                      type="button"
                      className={`org-trash-btn${confirmFolder === group.folderId ? " is-confirm" : ""}`}
                      aria-label={confirmFolder === group.folderId ? `Click again to delete the folder ${group.label}` : `Delete the folder ${group.label}`}
                      title={confirmFolder === group.folderId ? (ids.length ? `Click again to delete. Its ${ids.length} placement${ids.length === 1 ? "" : "s"} stay${ids.length === 1 ? "s" : ""} in the game, just not in a folder.` : "Click again to delete") : "Delete folder"}
                      onBlur={() => setConfirmFolder(null)}
                      onClick={() => {
                        if (confirmFolder !== group.folderId) return setConfirmFolder(group.folderId);
                        setConfirmFolder(null);
                        run(deleteFolder({ folderId: group.folderId }));
                      }}
                    >
                      <TrashIcon />
                      {confirmFolder === group.folderId && <span>Delete?</span>}
                    </button>
                  )}
                  {(group.kind === "folder" || (group.kind === "scene" && group.sceneSwitch) || (group.kind === "plain" && ids.length > 0)) && (
                    <span className="org-group-switch" title={group.kind === "scene" ? "Every placement standing in this scene" : group.kind === "folder" ? "Everything in this folder, now and later" : "Switch these placements on or off one by one"}>
                      <span className="org-group-switch-label">{on ? "On" : "Off"}</span>
                      <button
                        type="button"
                        className={`own-switch${switching ? " is-busy" : ""}`}
                        role="switch"
                        aria-checked={on}
                        aria-busy={switching}
                        aria-label={`${on ? "Switch off" : "Switch on"} ${group.label}`}
                        disabled={switching}
                        onClick={() => groupSwitch(group, !on)}
                      >
                        <span className="own-knob" />
                        {switching && <span className="own-spin" aria-hidden="true" />}
                      </button>
                    </span>
                  )}
                </span>
              </div>

              {open && (
                <div className="org-group-body">
                  {group.items.length === 0 ? (
                    <p className="muted-line org-empty-group">Nothing in here yet. Drag a placement here, or press Edit, tick placements and choose “Move to folder…”.</p>
                  ) : (
                    cards
                  )}
                </div>
              )}
            </div>
          );
        })}

        {drag && groupBy === "folder" && looseCount === 0 && (
          <div className={`org-loose is-zone is-empty${drag.over === "none" ? " is-drop" : ""}`} data-group="none">
            <p className="muted-line">Drop here to take it out of its folder.</p>
          </div>
        )}

        <p className="muted-line org-delay">Changes reach players the next time they start the game. A game that is already running keeps what it loaded.</p>
      </section>
      {drag && (
        <div className="org-drag-ghost" style={{ left: drag.x + 14, top: drag.y + 14 }} aria-hidden="true">
          <span>{drag.label}</span>
          {drag.ids.length > 1 && <span className="org-drag-badge">{drag.ids.length}</span>}
        </div>
      )}
      <CardPopups />
    </OrgContext.Provider>
  );
}

/** The cards of one group; a placement shown in an earlier group is only pointed to here. */
function Cards({ group, limit, onMore, home, onJump, dragIds, slot }) {
  const list = group.items.slice(0, limit);
  const rest = group.items.length - list.length;
  return (
    <>
      <div className="org-cards">
        {list.map((item) => {
          const homeGroup = home.get(item.id);
          if (homeGroup && homeGroup.key !== group.key) {
            return (
              <div className="org-pointer" key={item.id}>
                <strong>{item.label}</strong>
                <span className="muted-line">Its card is in “{homeGroup.label}”.</span>
                <button type="button" className="link-button" onClick={() => onJump(item.id)}>
                  Go to it
                </button>
              </div>
            );
          }
          return (
            <div className={`org-cell${dragIds.has(item.id) ? " is-dragging" : ""}${slot?.cardId === item.id ? (slot.before ? " is-drop-before" : " is-drop-after") : ""}`} id={`plc-${item.id}`} data-card={item.id} key={item.id}>
              {item.card}
            </div>
          );
        })}
      </div>
      {rest > 0 && (
        <div className="org-more">
          <button type="button" className="button button-quiet" onClick={onMore}>
            Show more
          </button>
          <span className="muted-line">
            {list.length} of {group.items.length}
          </span>
        </div>
      )}
    </>
  );
}

function emptyShownNow() {
  return { enabled: new Map(), folderEnabled: new Map(), scenes: new Map(), folders: [], folderOf: new Map(), order: new Map() };
}

function rectOf(node) {
  const { left, top, right, bottom, width, height } = node.getBoundingClientRect();
  return { left, top, right, bottom, width, height };
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
    </svg>
  );
}

function countStates(list, ctx) {
  const counts = { showing: 0, empty: 0, off: 0 };
  for (const item of list) {
    const state = stateOf(item, ctx);
    if (state === "showing" || state === "partly") counts.showing += 1;
    else counts[state] += 1;
  }
  return counts;
}

function describeCounts(total, counts, folderOff) {
  const noun = `${total} placement${total === 1 ? "" : "s"}`;
  if (folderOff) return `${noun} · switched off, so all are off`;
  const parts = [noun];
  if (counts.showing) parts.push(`${counts.showing} showing`);
  if (counts.empty) parts.push(`${counts.empty} empty`);
  if (counts.off) parts.push(`${counts.off} off`);
  return parts.join(" · ");
}

function Pill({ label, value, onChange, options }) {
  return (
    <select className={`org-pill${value ? " is-set" : ""}`} value={value ?? ""} aria-label={label} onChange={(event) => onChange(event.target.value)}>
      <option value="">{label}</option>
      {options.map(([optionValue, optionLabel]) => (
        <option key={optionValue} value={optionValue}>
          {optionLabel}
        </option>
      ))}
    </select>
  );
}

function FolderIcon({ open, off }) {
  return (
    <svg className={`org-folder-icon${open ? " is-open" : ""}${off ? " is-off" : ""}`} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}

function CollapseIcon({ open }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={open ? "M8 4l4 4 4-4M8 20l4-4 4 4M4 12h16" : "M8 8l4-4 4 4M8 16l4 4 4-4M4 12h16"} />
    </svg>
  );
}

function FolderPlusIcon({ big }) {
  return (
    <svg width={big ? 20 : 16} height={big ? 20 : 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={big ? 2.3 : 2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M12 11v5M9.5 13.5h5" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  );
}
