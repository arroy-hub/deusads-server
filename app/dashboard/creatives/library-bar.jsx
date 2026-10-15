"use client";

import { Chip, Group, Opt, PopBtn } from "../_cabinet/filters";
import { IcFolderPlus, IcGear } from "../_cabinet/icons";

const STATUSES = [["approved", "Approved"], ["pending", "In review"], ["rejected", "Rejected"], ["all", "Any status"]];
const SHAPES = [["all", "Any"], ["missing", "Some shapes missing"], ["full", "All shapes covered"]];
const GROUPS = [["folder", "Folders"], ["none", "No grouping"]];
const SORTS = [["mine", "My order"], ["name", "Name A–Z"], ["status", "Status"]];
const nameOf = (list, key) => list.find(([k]) => k === key)?.[1];

/**
 * The row above the creatives library: search, a Filters panel (status, shapes, folder), a View panel (grouping, sort)
 * and New folder. Chosen filters show as chips under the row, only while any is on.
 */
export default function LibraryBar({ query, setQuery, status, setStatus, shapes, setShapes, folderFilter, setFolderFilter, group, setGroup, sort, setSort, folders, filtering, clear, shown, folderTools, addFolder }) {
  const folderOptions = [["all", "All folders"], ["none", "Not in a folder"], ...folders.map((f) => [f.id, f.name])];
  const active = [status !== "all", shapes !== "all", folderFilter !== "all"].filter(Boolean).length;
  return (
    <>
      <div className="fl-bar">
        <input type="search" className="field fl-search" placeholder="Search by name" aria-label="Search creatives" value={query} onChange={(e) => setQuery(e.target.value)} />
        <PopBtn label="Filters" count={active} width={270}>
          <Group title="Status">{STATUSES.map(([key, text]) => <Opt key={key} on={status === key} onClick={() => setStatus(key)}>{text}</Opt>)}</Group>
          <Group title="Shapes">{SHAPES.map(([key, text]) => <Opt key={key} on={shapes === key} onClick={() => setShapes(key)}>{text}</Opt>)}</Group>
          <Group title="Folder">{folderOptions.map(([key, text]) => <Opt key={key} on={folderFilter === key} onClick={() => setFolderFilter(key)}>{text}</Opt>)}</Group>
        </PopBtn>
        <PopBtn label="View" icon={<IcGear size={14} />} width={230}>
          <Group title="Group by">{GROUPS.map(([key, text]) => <Opt key={key} on={group === key} onClick={() => setGroup(key)}>{text}</Opt>)}</Group>
          <Group title="Sort">{SORTS.map(([key, text]) => <Opt key={key} on={sort === key} onClick={() => setSort(key)}>{text}</Opt>)}</Group>
        </PopBtn>
        <span className="fl-spacer" />
        <button type="button" className="button button-quiet button-small" disabled={!folderTools} title={folderTools ? undefined : "Folders need migration 0028 in the Supabase SQL editor"} onClick={addFolder}><IcFolderPlus size={16} />New folder</button>
      </div>
      {filtering && (
        <div className="fl-chips">
          {status !== "all" && <Chip onRemove={() => setStatus("all")}>Status: {nameOf(STATUSES, status)}</Chip>}
          {shapes !== "all" && <Chip onRemove={() => setShapes("all")}>Shapes: {nameOf(SHAPES, shapes)}</Chip>}
          {folderFilter !== "all" && <Chip onRemove={() => setFolderFilter("all")}>Folder: {nameOf(folderOptions, folderFilter)}</Chip>}
          <button type="button" className="link-button" onClick={clear}>Clear all</button>
          <span className="fl-shown">{shown} shown</span>
        </div>
      )}
    </>
  );
}
