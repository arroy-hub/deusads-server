"use client";

import { Chip, Group, Opt, PopBtn } from "../_cabinet/filters";
import { IcFolderPlus, IcGear, IcPlus } from "../_cabinet/icons";
import { plural } from "../../../lib/campaign-cards";

const STATUSES = [["all", "Any status"], ["approved", "Approved"], ["pending", "In review"], ["rejected", "Rejected"]];
const SHAPES = [["all", "Any"], ["missing", "Some shapes missing"], ["full", "All shapes covered"]];
const GROUPS = [["folder", "Folders"], ["none", "No grouping"]];
const SORTS = [["mine", "My order"], ["name", "Name A–Z"], ["status", "Status"]];
const nameOf = (list, key) => list.find(([k]) => k === key)?.[1];

const CollapseIcon = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 9l5 5 5-5M7 4h10" /></svg>;

/**
 * The one block above the creatives library: search, a Filters panel (status, shapes, folder), a View panel (grouping, sort),
 * how many creatives and folders there are, Collapse all, New folder and Add creative. Chosen filters show as chips under
 * the row, only while any is on.
 */
export default function LibraryBar({ query, setQuery, status, setStatus, shapes, setShapes, folderFilter, setFolderFilter, group, setGroup, sort, setSort, folders, total, filtering, clear, shown, folderTools, addFolder, addCreative, anyOpen, toggleAll }) {
  const folderOptions = [["all", "All folders"], ["none", "Not in a folder"], ...folders.map((f) => [f.id, f.name])];
  const active = [status !== "all", shapes !== "all", folderFilter !== "all"].filter(Boolean).length;
  return (
    <div className="cx-blk">
      <div className="fl-bar" role="toolbar" aria-label="Creatives controls">
        <input type="search" className="field fl-search" placeholder="Search by name" aria-label="Search creatives" value={query} onChange={(e) => setQuery(e.target.value)} />
        <PopBtn label="Filters" count={active} width={270}>
          {(close) => (
            <>
              <Group title="Status">{STATUSES.map(([key, text]) => <Opt key={key} on={status === key} onClick={() => { setStatus(key); close(); }}>{text}</Opt>)}</Group>
              <Group title="Shapes">{SHAPES.map(([key, text]) => <Opt key={key} on={shapes === key} onClick={() => { setShapes(key); close(); }}>{text}</Opt>)}</Group>
              <Group title="Folder">{folderOptions.map(([key, text]) => <Opt key={key} on={folderFilter === key} onClick={() => { setFolderFilter(key); close(); }}>{text}</Opt>)}</Group>
            </>
          )}
        </PopBtn>
        <PopBtn label="View" icon={<IcGear size={14} />} width={230}>
          {(close) => (
            <>
              <Group title="Group by">{GROUPS.map(([key, text]) => <Opt key={key} on={group === key} onClick={() => { setGroup(key); close(); }}>{text}</Opt>)}</Group>
              <Group title="Sort">{SORTS.map(([key, text]) => <Opt key={key} on={sort === key} onClick={() => { setSort(key); close(); }}>{text}</Opt>)}</Group>
            </>
          )}
        </PopBtn>
        <span className="fl-spacer" />
        <span className="fl-sum">{plural(total, "creative", "creatives")} · {plural(folders.length, "folder", "folders")}</span>
        {group === "folder" && folders.length > 0 && (
          <button type="button" className="button button-quiet button-small button-with-icon" onClick={toggleAll}><CollapseIcon />{anyOpen ? "Collapse all" : "Expand all"}</button>
        )}
        <button type="button" className="button button-quiet button-small button-with-icon" disabled={!folderTools} title={folderTools ? undefined : "Folders need migration 0028 in the Supabase SQL editor"} onClick={addFolder}><IcFolderPlus size={16} />New folder</button>
        <button type="button" className="button button-with-icon" onClick={addCreative}><IcPlus size={16} />Add creative</button>
      </div>
      {filtering && (
        <div className="fl-chips">
          {status !== "all" && <Chip onRemove={() => setStatus("all")}>Status: {nameOf(STATUSES, status)}</Chip>}
          {shapes !== "all" && <Chip onRemove={() => setShapes("all")}>Shapes: {nameOf(SHAPES, shapes)}</Chip>}
          {folderFilter !== "all" && <Chip onRemove={() => setFolderFilter("all")}>Folder: {nameOf(folderOptions, folderFilter)}</Chip>}
          {query && <Chip onRemove={() => setQuery("")}>Name: “{query}”</Chip>}
          <button type="button" className="link-button" onClick={clear}>Clear all</button>
          <span className="fl-shown">{shown} shown</span>
        </div>
      )}
    </div>
  );
}
