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
  summarize,
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
import PlacementRow from "./placement-row";

const FILTER_KEYS = ["format", "status", "type", "folder", "tag", "scene", "sharing"];
const CUSTOM = "__custom";

/**
 * The Placements tab for a game with many placements: grouped by scene (or folder, tag, format, type,
 * status), searchable and filterable, with switches for single placements, scenes and folders, and
 * actions on whatever is ticked. Each placement opens to the picture editor it always had.
 *
 * items: [{ id, externalId, label, shared, enabled, folderId, tags, placeType, suggestedType, format,
 *           firstSeenAt, places, hasAds, views, card }]   (card: the picture editor, rendered on the server)
 */
export default function PlacementsOrganizer({ gameId, items, folders, offScenes, focus }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState({});
  const [groupBy, setGroupBy] = useState("scene");
  const [sortBy, setSortBy] = useState("name");
  const [showFilters, setShowFilters] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [expanded, setExpanded] = useState(() => new Set());
  const [closedGroups, setClosedGroups] = useState(() => new Set());
  const [views, setViews] = useState([]);
  const [viewName, setViewName] = useState("");
  const [savingView, setSavingView] = useState(false);
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
  const summary = useMemo(() => summarize(items, ctx), [items, ctx]);
  const filterCount = FILTER_KEYS.filter((key) => filters[key]).length;
  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  // The first group each placement appears in is where it opens for editing (the editor exists once).
  const home = useMemo(() => {
    const map = new Map();
    for (const group of groups) for (const item of group.items) if (!map.has(item.id)) map.set(item.id, group.key);
    return map;
  }, [groups]);

  // Saved views live in this browser: a convenience, not shared with other devices.
  useEffect(() => {
    try {
      const raw = JSON.parse(window.localStorage.getItem(storageKey) ?? "[]");
      setViews(Array.isArray(raw) ? raw.map(cleanView).filter(Boolean) : []);
    } catch {
      setViews([]);
    }
  }, [storageKey]);

  // Coming from Unity ("Open in dashboard"): open that placement and scroll to it.
  useEffect(() => {
    if (!focus || focusDone.current) return;
    const target = items.find((item) => item.externalId === focus);
    if (!target) return;
    focusDone.current = true;
    setExpanded((current) => new Set(current).add(target.id));
    setTimeout(() => document.getElementById(`plc-${target.id}`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 80);
  }, [focus, items]);

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

  const toggleSet = (setter) => (id) =>
    setter((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleSelected = toggleSet(setSelected);
  const toggleExpanded = toggleSet(setExpanded);
  const toggleGroup = toggleSet(setClosedGroups);

  const chosen = [...selected];
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

  function jumpHome(id) {
    setExpanded((current) => new Set(current).add(id));
    document.getElementById(`plc-${id}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
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
  function applyView(name) {
    const view = views.find((entry) => entry.name === name);
    if (!view) return;
    setGroupBy(view.groupBy);
    setSortBy(view.sortBy);
    setQ(view.filters.q ?? "");
    const { q: _q, ...rest } = view.filters;
    setFilters(rest);
    if (Object.keys(rest).length > 0) setShowFilters(true);
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
    setSavingView(false);
  }

  // ---- bulk actions on what is ticked
  const bulk = (promise, after) => run(promise, after);
  function bulkSetType(event) {
    event.preventDefault();
    if (!bulkType || (bulkType === CUSTOM && !bulkCustom.trim())) return;
    const type = bulkType === CUSTOM ? bulkCustom : bulkType === "__auto" ? null : bulkType;
    bulk(setPlaceType({ gameId, ids: chosen, type }), () => {
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

  const hasFilters = filterCount > 0 || q.trim() !== "";

  return (
    <section className="org" aria-label="Placements" aria-busy={pending}>
      <div className="org-bar">
        <input
          className="field org-search"
          type="search"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Search by name, ID, scene, tag…"
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
        <button type="button" className="button button-quiet button-small" onClick={() => setShowFilters((value) => !value)} aria-expanded={showFilters}>
          Filters{filterCount ? ` (${filterCount})` : ""}
        </button>
        <button type="button" className="button button-quiet button-small" onClick={() => setNewFolder(newFolder === null ? "" : null)}>
          New folder
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

      {showFilters && (
        <div className="org-filters">
          <Select label="Format" value={filters.format} onChange={(value) => setFilter("format", value)} options={options.formats.map((value) => [value, value])} />
          <Select
            label="Status"
            value={filters.status}
            onChange={(value) => setFilter("status", value)}
            options={[["showing", STATUS_LABELS.showing], ["empty", STATUS_LABELS.empty], ["off", "Switched off (fully or partly)"]]}
          />
          <Select
            label="Place type"
            value={filters.type}
            onChange={(value) => setFilter("type", value)}
            options={[...options.types.map((value) => [value, typeLabel(value)]), ...(options.hasUndetermined ? [["none", "Not determined"]] : [])]}
          />
          <Select
            label="Folder"
            value={filters.folder}
            onChange={(value) => setFilter("folder", value)}
            options={[["none", "Not in a folder"], ...options.folders.map((folder) => [folder.id, folder.name])]}
          />
          <Select label="Tag" value={filters.tag} onChange={(value) => setFilter("tag", value)} options={options.tags.map((value) => [value, value])} />
          <Select label="Scene" value={filters.scene} onChange={(value) => setFilter("scene", value)} options={options.scenes.map((value) => [value, value])} />
          <Select label="ID" value={filters.sharing} onChange={(value) => setFilter("sharing", value)} options={[["shared", "Shared (copies of a prefab)"], ["unique", "Unique"]]} />
          {hasFilters && (
            <button type="button" className="link-button" onClick={clearFilters}>
              Clear filters
            </button>
          )}
        </div>
      )}

      <div className="org-views-bar">
        <span className="muted-line">
          {summary.total} placement{summary.total === 1 ? "" : "s"} · {summary.showing + summary.partly} showing ads · {summary.empty} empty · {summary.off} off
          {summary.places !== summary.total ? ` · ${summary.places} places in the game` : ""}
          {visible.length !== items.length ? ` · ${visible.length} match` : ""}
        </span>
        <span className="org-views-actions">
          {views.length > 0 && (
            <>
              <select className="field org-view-select" value="" onChange={(event) => applyView(event.target.value)} aria-label="Saved views">
                <option value="">Saved views…</option>
                {views.map((view) => (
                  <option key={view.name} value={view.name}>
                    {view.name}
                  </option>
                ))}
              </select>
              <select
                className="field org-view-select"
                value=""
                onChange={(event) => event.target.value && persistViews(views.filter((view) => view.name !== event.target.value))}
                aria-label="Delete a saved view"
              >
                <option value="">Delete a view…</option>
                {views.map((view) => (
                  <option key={view.name} value={view.name}>
                    {view.name}
                  </option>
                ))}
              </select>
            </>
          )}
          {savingView ? (
            <form className="row" onSubmit={saveView}>
              <input className="field" value={viewName} maxLength={40} autoFocus placeholder="Name this view" onChange={(event) => setViewName(event.target.value)} aria-label="View name" />
              <button className="button button-small" type="submit" disabled={!viewName.trim()}>
                Save
              </button>
              <button className="button button-quiet button-small" type="button" onClick={() => setSavingView(false)}>
                Cancel
              </button>
            </form>
          ) : (
            <button type="button" className="button button-quiet button-small" onClick={() => setSavingView(true)}>
              Save this view
            </button>
          )}
        </span>
      </div>

      {chosen.length > 0 && (
        <div className="org-selection" role="region" aria-label="Actions for the ticked placements">
          <strong>{chosen.length} selected</strong>
          <button className="button button-small" type="button" disabled={pending} onClick={() => bulk(setPlacementsEnabled({ gameId, ids: chosen, enabled: true }))}>
            Switch on
          </button>
          <button className="button button-quiet button-small" type="button" disabled={pending} onClick={() => bulk(setPlacementsEnabled({ gameId, ids: chosen, enabled: false }))}>
            Switch off
          </button>
          <select
            className="field"
            value=""
            aria-label="Move the ticked placements to a folder"
            onChange={(event) => {
              const value = event.target.value;
              if (value) bulk(movePlacements({ gameId, ids: chosen, folderId: value === "__none" ? null : value }));
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
          <form className="row" onSubmit={(event) => { event.preventDefault(); if (bulkTag.trim()) bulk(changeTags({ gameId, ids: chosen, add: [bulkTag] }), () => setBulkTag("")); }}>
            <input className="field" value={bulkTag} maxLength={30} placeholder="Tag" onChange={(event) => setBulkTag(event.target.value)} aria-label="Tag for the ticked placements" />
            <button className="button button-quiet button-small" type="submit" disabled={!bulkTag.trim() || pending}>
              Add tag
            </button>
            <button
              className="button button-quiet button-small"
              type="button"
              disabled={!bulkTag.trim() || pending}
              onClick={() => bulk(changeTags({ gameId, ids: chosen, remove: [bulkTag] }), () => setBulkTag(""))}
            >
              Remove tag
            </button>
          </form>
          <form className="row" onSubmit={bulkSetType}>
            <select className="field" value={bulkType} onChange={(event) => setBulkType(event.target.value)} aria-label="Place type for the ticked placements">
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
            <button className="button button-quiet button-small" type="submit" disabled={!bulkType || pending}>
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

      <p className="muted-line org-delay">
        Switching something off or on reaches players the next time they start the game. A game that is already running keeps what it loaded.
      </p>

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

      {groups.map((group) => {
        const ids = group.items.map((item) => item.id);
        const ticked = ids.filter((id) => selected.has(id)).length;
        const closed = closedGroups.has(`${groupBy}:${group.key}`);
        const on = groupIsOn(group);
        const folderEditing = editFolder && editFolder.id === group.folderId;
        return (
          <div className={`org-group${on ? "" : " is-off"}`} key={`${groupBy}:${group.key}`}>
            <div className="org-group-head">
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
              {folderEditing ? (
                <form className="row" onSubmit={submitRenameFolder}>
                  <input className="field" value={editFolder.name} maxLength={80} autoFocus onChange={(event) => setEditFolder({ id: editFolder.id, name: event.target.value })} aria-label="Folder name" />
                  <button className="button button-small" type="submit" disabled={!editFolder.name.trim() || pending}>
                    Save
                  </button>
                  <button className="button button-quiet button-small" type="button" onClick={() => setEditFolder(null)}>
                    Cancel
                  </button>
                </form>
              ) : (
                <button type="button" className="org-group-title" onClick={() => toggleGroup(`${groupBy}:${group.key}`)} aria-expanded={!closed}>
                  <span className="org-caret" aria-hidden="true">{closed ? "▸" : "▾"}</span>
                  <span>{group.label}</span>
                  <span className="muted-line">{ids.length}</span>
                </button>
              )}
              <span className="org-group-actions">
                {group.kind === "folder" && !folderEditing && (
                  <>
                    <button type="button" className="link-button" onClick={() => setEditFolder({ id: group.folderId, name: group.label })}>
                      Rename
                    </button>
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => {
                        const note = ids.length ? ` Its ${ids.length} placement${ids.length === 1 ? "" : "s"} stay${ids.length === 1 ? "s" : ""} in the game, just not in a folder.` : "";
                        if (window.confirm(`Delete the folder "${group.label}"?${note}`)) run(deleteFolder({ folderId: group.folderId }));
                      }}
                    >
                      Delete
                    </button>
                  </>
                )}
                {(group.kind === "folder" || (group.kind === "scene" && group.sceneSwitch) || (group.kind === "plain" && ids.length > 0)) && (
                  <label className="org-switch" title={group.kind === "scene" ? "Every placement standing in this scene" : group.kind === "folder" ? "Everything in this folder, now and later" : "Switch these placements on or off one by one"}>
                    <input type="checkbox" checked={on} disabled={pending} onChange={(event) => groupSwitch(group, event.target.checked)} />
                    <span className="sr-only">
                      {on ? "Switch off" : "Switch on"} {group.label}
                    </span>
                  </label>
                )}
              </span>
            </div>

            {!closed && (
              <ul className="org-rows">
                {group.items.length === 0 && <li className="muted-line org-empty-group">Nothing in here yet. Tick placements and use “Move to folder…”.</li>}
                {group.items.map((item) => (
                  <PlacementRow
                    key={`${group.key}:${item.id}`}
                    gameId={gameId}
                    item={item}
                    state={stateOf(item, ctx)}
                    ctx={ctx}
                    selected={selected.has(item.id)}
                    onSelect={toggleSelected}
                    expanded={expanded.has(item.id)}
                    onToggle={toggleExpanded}
                    isHome={home.get(item.id) === group.key}
                    onJumpHome={jumpHome}
                  >
                    {item.card}
                  </PlacementRow>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </section>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <label className="org-inline org-filter">
      <span>{label}</span>
      <select className="field" value={value ?? ""} onChange={(event) => onChange(event.target.value)}>
        <option value="">Any</option>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}
