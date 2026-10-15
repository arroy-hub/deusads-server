"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Modal from "../modal";
import { deleteAccount } from "./actions";
import { setAccountRole, setSuspended } from "../admin/actions";

const ROLES = [["developer", "Developer"], ["advertiser", "Advertiser"], ["admin", "Admin"]];

/** The yellow strip an admin sees on someone else's account page: role, switch off, delete, back to Users. */
export default function AdminBanner({ view, say }) {
  const router = useRouter();
  const [role, setRole] = useState(view.role);
  const [modal, setModal] = useState(null); // "suspend" | "delete"
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isAdmin = view.role === "admin";
  const name = view.company || view.email;

  async function changeRole(next) {
    const before = role;
    setRole(next);
    const result = await setAccountRole({ accountId: view.id, role: next }).catch(() => ({ error: "Connection lost. Try again." }));
    if (result?.error) {
      setRole(before);
      return say(result.error);
    }
    say(`Role changed to ${next}`);
    router.refresh();
  }

  async function run(action, done) {
    setBusy(true);
    setError("");
    const result = await action().catch(() => ({ error: "Connection lost. Try again." }));
    setBusy(false);
    if (result?.error) return setError(result.error);
    setModal(null);
    done(result);
  }

  return (
    <>
      <div className="admin-banner">
        <div className="grow">
          You’re looking at <b>{name}</b>’s account as an admin. Everything you change is recorded.
        </div>
        <select className="field" aria-label="Role" value={role} onChange={(event) => changeRole(event.target.value)} style={{ minHeight: 34, width: "auto" }}>
          {ROLES.map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <button type="button" className="button button-quiet button-small" disabled={isAdmin} onClick={() => setModal("suspend")} title={isAdmin ? "Admins cannot be switched off" : undefined}>
          {view.suspended ? "Switch on account" : "Switch off account"}
        </button>
        <button type="button" className="button button-danger button-small" disabled={isAdmin} onClick={() => setModal("delete")} title={isAdmin ? "Admin accounts can’t be deleted here" : undefined}>
          Delete account
        </button>
        <Link href="/dashboard/admin/users" className="button button-quiet button-small">
          ← Users
        </Link>
      </div>

      <Modal
        open={modal === "suspend"}
        onClose={() => (setModal(null), setError(""))}
        busy={busy}
        title={view.suspended ? "Switch this account on?" : "Switch off this account?"}
        footer={
          <>
            {error && <span className="error" role="alert">{error}</span>}
            <button type="button" className="button button-quiet" onClick={() => (setModal(null), setError(""))} disabled={busy}>
              Cancel
            </button>
            <button
              type="button"
              className={`button${view.suspended ? "" : " button-danger"}`}
              disabled={busy}
              onClick={() =>
                run(() => setSuspended({ accountId: view.id, suspended: !view.suspended }), () => {
                  say(view.suspended ? "Account switched on" : "Account switched off");
                  router.refresh();
                })
              }
            >
              {view.suspended ? "Switch on" : "Switch off"}
            </button>
          </>
        }
      >
        <p>
          {view.suspended
            ? `${name} will be able to use the dashboard again, and their ads show again.`
            : `${name} will see only “Account suspended” until you switch it back on. Their games and campaigns stop showing.`}
        </p>
      </Modal>

      <Modal
        open={modal === "delete"}
        onClose={() => (setModal(null), setError(""))}
        busy={busy}
        title="Delete this account?"
        footer={
          <>
            {error && <span className="error" role="alert">{error}</span>}
            <button type="button" className="button button-quiet" onClick={() => (setModal(null), setError(""))} disabled={busy}>
              Cancel
            </button>
            <button
              type="button"
              className="button button-danger"
              disabled={busy}
              onClick={() =>
                run(() => deleteAccount({ accountId: view.id }), () => {
                  router.push("/dashboard/admin/users");
                  router.refresh();
                })
              }
            >
              {busy ? "Deleting…" : "Delete account"}
            </button>
          </>
        }
      >
        <p>{name} and everything in it (games, campaigns, creatives) will be removed for good. This can’t be undone.</p>
      </Modal>
    </>
  );
}
