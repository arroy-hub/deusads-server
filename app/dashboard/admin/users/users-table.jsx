"use client";

import { useState } from "react";
import RoleSelect from "./role-select";
import SuspendButton from "./suspend-button";

const COLUMNS = [
  ["company", "Company"],
  ["email", "Email"],
  ["role", "Role"],
  ["joined", "Joined"],
  ["status", "Status"],
];

/**
 * The accounts as a table whose columns sort on a click (a second click turns the order around).
 * Status is "active" for an account that has a game or a running campaign, "inactive" otherwise; a
 * suspended account says so under it. The switch-off button sits at the right end of each row.
 */
export default function UsersTable({ rows, selfId }) {
  const [sort, setSort] = useState({ key: null, dir: "asc" });

  const value = (row, key) => (key === "status" ? (row.active ? 1 : 0) : String(row[key] ?? "").toLowerCase());
  const sorted = sort.key
    ? [...rows].sort((a, b) => {
        const left = value(a, sort.key);
        const right = value(b, sort.key);
        // accounts without a company sink to the bottom whichever way company is sorted
        if (sort.key === "company" && (!left || !right) && left !== right) return left ? -1 : 1;
        const order = typeof left === "number" ? left - right : String(left).localeCompare(String(right), "en");
        return (sort.dir === "asc" ? order : -order) || a.email.localeCompare(b.email, "en");
      })
    : rows;

  const sortBy = (key) => setSort((current) => (current.key === key ? { key, dir: current.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  return (
    <div className="panel table-scroll" style={{ padding: 0 }}>
      <table className="users-table">
        <thead>
          <tr>
            {COLUMNS.map(([key, label]) => (
              <th key={key} aria-sort={sort.key === key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
                <button type="button" className="sort-button" onClick={() => sortBy(key)}>
                  {label}
                  <span aria-hidden="true" className="sort-arrow">
                    {sort.key === key ? (sort.dir === "asc" ? "▲" : "▼") : ""}
                  </span>
                </button>
              </th>
            ))}
            <th className="actions-col">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.id}>
              <td>{row.company || "—"}</td>
              <td>{row.email}</td>
              <td>
                <RoleSelect accountId={row.id} role={row.role} isSelf={row.id === selfId} />
              </td>
              <td>{row.joined}</td>
              <td>
                <span className={`status-tag ${row.active ? "is-active" : "is-inactive"}`}>{row.active ? "active" : "inactive"}</span>
                {row.suspended && <div className="muted-line status-suspended">suspended</div>}
              </td>
              <td className="actions-col">
                <SuspendButton accountId={row.id} suspended={row.suspended} disabled={row.role === "admin"} small />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
