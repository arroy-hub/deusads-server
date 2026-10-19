"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "../../modal";
import { createUser } from "../actions";
import { Icon } from "../ui";
import { MIN_PASSWORD, ROLES } from "../../../../lib/admin-rules";

const ROLE_HELP = {
  developer: "Adds games and sells placements.",
  advertiser: "Uploads creatives and books placements.",
  admin: "Runs the platform: reviews creatives, manages users.",
};

const EMPTY = { company: "", email: "", password: "", role: "developer" };

/** A random password without look-alike characters, to hand to the new user. */
function generate() {
  const letters = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(14));
  return [...bytes].map((byte) => letters[byte % letters.length]).join("");
}

/**
 * The "Add user" button and its pop-up: company, email, role and a first password. The person can sign
 * in at once; the admin passes the password on (it is shown in the field for that).
 */
export default function AddUserDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const set = (key) => (event) => {
    setForm({ ...form, [key]: event.target.value });
    setError("");
  };
  const complete = form.email.trim() !== "" && form.password.length >= MIN_PASSWORD;

  function close() {
    setOpen(false);
    setForm(EMPTY);
    setError("");
  }

  async function submit(event) {
    event.preventDefault();
    if (busy || !complete) return;
    setBusy(true);
    setError("");
    const result = await createUser(form).catch(() => ({ error: "Connection lost. Try again." }));
    setBusy(false);
    if (result?.error) return setError(result.error);
    close();
    router.refresh();
  }

  return (
    <>
      <button type="button" className="cb-btn" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <Icon name="plus" size={15} /> Add user
      </button>
      <Modal
        open={open}
        onClose={close}
        busy={busy}
        title="Add a user"
        footer={
          <>
            {error ? (
              <p className="error" role="alert">
                {error}
              </p>
            ) : (
              !complete && <span className="muted-line">Enter an email and a password of at least {MIN_PASSWORD} characters.</span>
            )}
            <button type="button" className="button button-quiet" onClick={close} disabled={busy}>
              Cancel
            </button>
            <button type="submit" form="add-user-form" className="button" disabled={busy || !complete} aria-busy={busy}>
              {busy ? "Adding…" : "Add user"}
            </button>
          </>
        }
      >
        <form id="add-user-form" className="stack" onSubmit={submit}>
          <p className="settings-help">
            Creates an account that can sign in right away, with no confirmation email. Give the person the email and
            the password you set here.
          </p>
          <label htmlFor="new-user-company">Company (optional)</label>
          <input id="new-user-company" className="field" value={form.company} onChange={set("company")} maxLength={120} disabled={busy} autoComplete="off" />
          <label htmlFor="new-user-email">Email</label>
          <input id="new-user-email" className="field" type="email" value={form.email} onChange={set("email")} disabled={busy} autoComplete="off" required />
          <label htmlFor="new-user-role">Role</label>
          <select id="new-user-role" className="field" value={form.role} onChange={set("role")} disabled={busy}>
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
          <p className="settings-help">{ROLE_HELP[form.role]}</p>
          <label htmlFor="new-user-password">Password</label>
          <div className="row">
            <input
              id="new-user-password"
              className="field"
              value={form.password}
              onChange={set("password")}
              disabled={busy}
              autoComplete="off"
              spellCheck={false}
              required
            />
            <button type="button" className="button button-quiet" onClick={() => { setForm({ ...form, password: generate() }); setError(""); }} disabled={busy}>
              Generate
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
