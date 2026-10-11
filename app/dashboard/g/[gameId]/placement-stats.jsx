"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatCount } from "../../../../lib/analytics";

const COLUMNS = [
  ["label", "Placement", false],
  ["impressions", "Impressions", true],
  ["sessions", "Sessions", true],
  ["avgVisible", "Avg. visible", true],
];

/**
 * "By placement": a table whose columns can be sorted, with a tick box per placement. The ticked
 * placements are the ones the chart above counts (kept in the address, so a reload or a shared link
 * shows the same view); nothing ticked means the whole game.
 */
export default function PlacementStats({ gameId, rows, selected }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [picked, setPicked] = useState(() => new Set(selected));
  const [sort, setSort] = useState({ key: "impressions", dir: "desc" });

  const choosable = rows.filter((row) => !row.removed);
  const sorted = [...rows].sort((a, b) => {
    if (a.removed !== b.removed) return a.removed ? 1 : -1; // the folded "removed" row stays last
    const dir = sort.dir === "asc" ? 1 : -1;
    const left = a[sort.key];
    const right = b[sort.key];
    if (sort.key === "label") return dir * String(left).localeCompare(String(right));
    // missing values (—) always sink to the bottom
    if (left == null && right == null) return 0;
    if (left == null) return 1;
    if (right == null) return -1;
    return dir * (left - right) || a.label.localeCompare(b.label);
  });

  function show(next) {
    setPicked(next);
    const ids = choosable.map((row) => row.id).filter((id) => next.has(id));
    const query = new URLSearchParams({ tab: "performance" });
    if (ids.length > 0 && ids.length < choosable.length) query.set("p", ids.join(","));
    startTransition(() => router.replace(`/dashboard/g/${gameId}?${query}`, { scroll: false }));
  }

  const toggle = (id) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    show(next);
  };

  const sortBy = (key) =>
    setSort((current) =>
      current.key === key ? { key, dir: current.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "label" ? "asc" : "desc" }
    );

  const count = choosable.filter((row) => picked.has(row.id)).length;
  const chosenTotal = choosable.filter((row) => picked.has(row.id)).reduce((sum, row) => sum + row.impressions, 0);

  return (
    <section className="panel analytics" aria-labelledby="by-placement-title" style={{ padding: 0 }} aria-busy={pending}>
      <div className="placement-head">
        <h2 id="by-placement-title">By placement</h2>
        <div className="placement-pick">
          <span className="muted-line" role="status">
            {count > 0
              ? `${count} of ${choosable.length} placements counted in the chart · ${formatCount(chosenTotal)} impressions`
              : "Tick placements to count only them in the chart"}
          </span>
          {count > 0 && (
            <button type="button" className="link-button" onClick={() => show(new Set())}>
              Show all placements
            </button>
          )}
          {count < choosable.length && choosable.length > 1 && (
            <button type="button" className="link-button" onClick={() => show(new Set(choosable.map((row) => row.id)))}>
              Tick all
            </button>
          )}
        </div>
      </div>
      <div className="table-scroll">
      <table className="placement-table">
        <thead>
          <tr>
            <th className="pick-col">
              <span className="sr-only">Count in the chart</span>
            </th>
            {COLUMNS.map(([key, label, numeric]) => (
              <th
                key={key}
                className={numeric ? "num" : undefined}
                aria-sort={sort.key === key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
              >
                <button type="button" className="sort-button" onClick={() => sortBy(key)}>
                  {label}
                  <span aria-hidden="true" className="sort-arrow">
                    {sort.key === key ? (sort.dir === "asc" ? "▲" : "▼") : ""}
                  </span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.id} className={row.removed ? "is-removed" : undefined}>
              <td className="pick-col">
                {!row.removed && (
                  <input
                    type="checkbox"
                    checked={picked.has(row.id)}
                    onChange={() => toggle(row.id)}
                    aria-label={`Count ${row.label} in the chart`}
                  />
                )}
              </td>
              <td>
                {row.label}
                {row.scene && <span className="muted">{row.scene}</span>}
              </td>
              <td className="num">{formatCount(row.impressions)}</td>
              <td className="num">{row.sessions == null ? "—" : formatCount(row.sessions)}</td>
              <td className="num">{row.avgVisible == null ? "—" : `${row.avgVisible.toFixed(1)} s`}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </section>
  );
}
