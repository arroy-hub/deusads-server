"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
  renameFolder,
  setFolderEnabled,
  setPlaceType,
  setPlacementsEnabled,
  setSceneEnabled,
} from "../../placement-actions";
import { OrgContext } from "./placement-card";

const FILTER_KEYS = ["format", "status", "type", "folder", "tag", "scene", "sharing"];
const CUSTOM = "__custom";
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
export default function PlacementsOrganizer({ gameId, items, folders, offScenes, focus }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState({});
  const [groupBy, setGroupBy] = useState("folder");
  const [sortBy, setSortBy] = useState("name");
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [groupOpen, setGroupOpen] = useState(() => new Map()); // key -> true | false, once the person chose
  const [shown, setShown] = useState(() => new Map()); // key -> how many cards
  const [views, setViews] = useState([]);
  const [viewsOpen, setViewsOpen] = useState(false);
  const [viewName, setViewName] = useState("");
  const [notice, setNotice] = useState(null);
  const [newFolder, setNewFolder] = useState(null); // null: closed, string: being typed
  const [editFolder, setEditFolder] = useState(null); // { id, name }
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

  function run(promise, after) {
    setNotice(null);
    startTransition(async () => {
      const result = await promise.catch(() => ({ error: "Connection lost. Try again." }));
      if (result?.error) return setNotice({ kind: "error", text: result.error });
      if (result?.warning) setNotice({ kind: "note", text: result.warning });
      after?.(result);
      router.refresh();
    });
  }

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
    if (group.kind === "scene" && group.sceneSwitch) return run(setSceneEnabled({ gameId, scene: group.scene, enabled }));
    if (group.kind === "folder") return run(setFolderEnabled({ folderId: group.folderId, enabled }));
    return run(setPlacementsEnabled({ gameId, ids: group.items.map((item) => item.id), enabled }));
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
    run(createFolder({ gameId, name }), () => setNewFolder(null));
  }

  function submitRenameFolder(event) {
    event.preventDefault();
    if (!editFolder?.name.trim()) return;
    run(renameFolder({ folderId: editFolder.id, name: editFolder.name }), () => setEditFolder(null));
  }

  const orgValue = useMemo(
    () => ({ gameId, items: itemById, ctx, editing, selected, onSelect: toggleSelected, stateOf: (item) => stateOf(item, ctx) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gameId, itemById, ctx, editing, selected]
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
          <button type="button" className="button button-quiet" onClick={() => setNewFolder(newFolder === null ? "" : null)}>
            <FolderPlusIcon />
            New folder
          </button>
          <button type="button" className="button org-edit" onClick={toggleEditing} aria-pressed={editing}>
            <PencilIcon />
            {editing ? "Done" : "Edit"}
          </button>
        </div>

        {newFolder !== null && (
          <form className="org-bar" onSubmit={submitNewFolder}>
            <input className="field" value={newFolder} maxLength={80} autoFocus placeholder="Folder name" onChange={(event) => setNewFolder(event.target.value)} aria-label="New folder name" />
            <button className="button button-small" type="submit" disabled={!newFolder.trim() || pending}>
              Create folder
            </button>
            <button className="button button-quiet button-small" type="button" onClick={() => setNewFolder(null)}>
              Cancel
            </button>
          </form>
        )}

        {editing && (
          <div className="org-selection" role="region" aria-label="Actions for the ticked placements">
            <strong>{chosen.length} selected</strong>
            <button className="button button-small" type="button" disabled={pending || chosen.length === 0} onClick={() => run(setPlacementsEnabled({ gameId, ids: chosen, enabled: true }))}>
              Switch on
            </button>
            <button className="button button-quiet button-small" type="button" disabled={pending || chosen.length === 0} onClick={() => run(setPlacementsEnabled({ gameId, ids: chosen, enabled: false }))}>
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
            />
          );

          // Placements outside any folder: no row, no frame, just the cards.
          if (loose(group)) {
            return (
              <div className="org-loose" key={key}>
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
          return (
            <div className={`org-group${on ? "" : " is-off"}${open ? " is-open" : ""}`} key={key}>
              <div className="org-group-head">
                <span className="org-caret" aria-hidden="true">{open ? "▾" : "▸"}</span>
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
                  <form className="row org-group-rename" onSubmit={submitRenameFolder}>
                    <input className="field" value={editFolder.name} maxLength={80} autoFocus onChange={(event) => setEditFolder({ id: editFolder.id, name: event.target.value })} aria-label="Folder name" />
                    <button className="button button-small" type="submit" disabled={!editFolder.name.trim() || pending}>
                      Save
                    </button>
                    <button className="button button-quiet button-small" type="button" onClick={() => setEditFolder(null)}>
                      Cancel
                    </button>
                  </form>
                ) : (
                  <button type="button" className="org-group-title" onClick={() => setGroupOpen((current) => new Map(current).set(key, !open))} aria-expanded={open}>
                    <span className="org-group-name">{group.label}</span>
                    <span className="org-group-counts">{describeCounts(ids.length, counts, !on && group.kind === "folder")}</span>
                  </button>
                )}
                <span className="org-group-actions">
                  {editing && group.kind === "folder" && !folderEditing && (
                    <>
                      <button type="button" className="button button-quiet button-small" onClick={() => setEditFolder({ id: group.folderId, name: group.label })}>
                        Rename
                      </button>
                      <button
                        type="button"
                        className="button button-quiet button-small org-danger"
                        onClick={() => {
                          const note = ids.length ? ` Its ${ids.length} placement${ids.length === 1 ? "" : "s"} stay${ids.length === 1 ? "s" : ""} in the game, just not in a folder.` : "";
                          if (window.confirm(`Delete the folder "${group.label}"?${note}`)) run(deleteFolder({ folderId: group.folderId }));
                        }}
                      >
                        Delete folder
                      </button>
                    </>
                  )}
                  {(group.kind === "folder" || (group.kind === "scene" && group.sceneSwitch) || (group.kind === "plain" && ids.length > 0)) && (
                    <span className="org-group-switch" title={group.kind === "scene" ? "Every placement standing in this scene" : group.kind === "folder" ? "Everything in this folder, now and later" : "Switch these placements on or off one by one"}>
                      <span className="org-group-switch-label">{on ? "On" : "Off"}</span>
                      <button
                        type="button"
                        className="own-switch"
                        role="switch"
                        aria-checked={on}
                        aria-label={`${on ? "Switch off" : "Switch on"} ${group.label}`}
                        disabled={pending}
                        onClick={() => groupSwitch(group, !on)}
                      >
                        <span className="own-knob" />
                      </button>
                    </span>
                  )}
                </span>
              </div>

              {open && (
                <div className="org-group-body">
                  {group.items.length === 0 ? (
                    <p className="muted-line org-empty-group">Nothing in here yet. Press Edit, tick placements and choose “Move to folder…”.</p>
                  ) : (
                    cards
                  )}
                </div>
              )}
            </div>
          );
        })}

        <p className="muted-line org-delay">Changes reach players the next time they start the game. A game that is already running keeps what it loaded.</p>
      </section>
    </OrgContext.Provider>
  );
}

/** The cards of one group; a placement shown in an earlier group is only pointed to here. */
function Cards({ group, limit, onMore, home, onJump }) {
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
            <div className="org-cell" id={`plc-${item.id}`} key={item.id}>
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

function FolderPlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
