"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import BubbleButton from "./bubble";
import Modal from "../modal";
import {
  adminChangeEmail, adminSetPassword, adminSignOutEverywhere, cancelEmailChange, changePassword, deleteAccount,
  requestEmailChange, resendEmailChange, sendResetLink, signOutOthers, signOutSession,
} from "./actions";
import { agoLabel, deleteBlocker, emailChangeProblem, passwordProblem, sessionLabel } from "../../../lib/account-rules";

/** Inputs and an inline error; `run` returns an error text or null and the bubble closes on null. */
function BubbleForm({ close, note, fields, submit, submitLabel, run }) {
  const [values, setValues] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    setError("");
    const problem = await run(values).catch(() => "Connection lost. Try again.");
    setBusy(false);
    if (problem) setError(problem);
    else close();
  };
  return (
    <>
      {note && <p className="bnote">{note}</p>}
      {fields.map(([key, label, type, extra]) => (
        <div key={key} style={{ display: "contents" }}>
          <label htmlFor={`bub-${key}`}>{label}</label>
          <input id={`bub-${key}`} className="field" type={type} autoComplete={extra ?? "off"} value={values[key] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))} />
        </div>
      ))}
      {submit && <p className="bnote" style={{ margin: "2px 0 0" }}>{submit}</p>}
      {error && <div className="bub-err" role="alert">{error}</div>}
      <div className="brow">
        <button type="button" className="button button-quiet" onClick={close} disabled={busy}>
          Cancel
        </button>
        <button type="button" className="button" onClick={go} disabled={busy}>
          {busy ? "Working…" : submitLabel}
        </button>
      </div>
    </>
  );
}

export default function SecurityTab({ view, admin, say }) {
  const router = useRouter();
  const [pending, setPending] = useState(view.pendingEmail);
  const [others, startOthers] = useTransition();
  const [modal, setModal] = useState(null); // "blocked" | "delete"
  const [password, setPassword] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);

  const blocker = deleteBlocker({ role: view.role, games: view.games, runningCampaigns: view.runningCampaigns });
  const sessions = view.sessions ?? [];
  const otherSessions = sessions.filter((item) => !item.current);

  // ---- admin looking at someone else: the same rows, with the powers an admin has
  if (admin) {
    return (
      <div className="acc-form">
        <div className="panel srows">
          <div className="srow">
            <div className="grow">
              <b>Email</b>
              <span>{view.email}</span>
            </div>
            <BubbleButton label="Change" ariaLabel="Change email">
              {(close) => (
                <BubbleForm
                  close={close}
                  note="Changes at once, no confirmation needed. They get a notice about it."
                  fields={[["email", "New email", "email"]]}
                  submitLabel="Save"
                  run={async ({ email }) => {
                    const problem = emailChangeProblem({ email, current: view.email });
                    if (problem) return problem;
                    const result = await adminChangeEmail({ accountId: view.id, email });
                    if (result?.error) return result.error;
                    say("Email changed. They were told.");
                    router.refresh();
                    return null;
                  }}
                />
              )}
            </BubbleButton>
          </div>
          <div className="srow">
            <div className="grow">
              <b>Password</b>
              <span>Set a new one, or send them a reset link.</span>
            </div>
            <button
              type="button"
              className="button button-quiet button-small"
              onClick={async () => {
                const result = await sendResetLink({ accountId: view.id }).catch(() => ({ error: "Connection lost. Try again." }));
                say(result?.error ?? `Reset link sent to ${result.email}`);
              }}
            >
              Send reset link
            </button>
            <BubbleButton label="Set new password" ariaLabel="Set new password">
              {(close) => (
                <BubbleForm
                  close={close}
                  fields={[["next", "New password", "password", "new-password"], ["repeat", "Repeat new password", "password", "new-password"]]}
                  submit="At least 8 characters. They are signed out on all devices."
                  submitLabel="Set password"
                  run={async ({ next, repeat }) => {
                    const problem = passwordProblem({ next, repeat }, { needCurrent: false });
                    if (problem) return problem;
                    const result = await adminSetPassword({ accountId: view.id, next, repeat });
                    if (result?.error) return result.error;
                    say("New password set. They were signed out everywhere.");
                    router.refresh();
                    return null;
                  }}
                />
              )}
            </BubbleButton>
          </div>
          <div className="srow">
            <div className="grow">
              <b>Sessions</b>
              <span>Signs them out on every device.</span>
            </div>
            <button
              type="button"
              className="button button-quiet button-small"
              onClick={async () => {
                const result = await adminSignOutEverywhere({ accountId: view.id }).catch(() => ({ error: "Connection lost. Try again." }));
                say(result?.error ?? "Signed out on all their devices");
              }}
            >
              Sign out everywhere
            </button>
          </div>
        </div>
      </div>
    );
  }

  async function confirmDelete() {
    setDeleting(true);
    setDeleteError("");
    const result = await deleteAccount({ password }).catch(() => ({ error: "Connection lost. Try again." }));
    if (result?.error) {
      setDeleting(false);
      return setDeleteError(result.error);
    }
    window.location.assign("/login");
  }

  return (
    <div className="acc-form">
      <div className="panel srows">
        <div className="srow">
          <div className="grow">
            <b>Email</b>
            <span>
              {view.email}
              {pending ? "" : <> · <em className="ok-text">Confirmed</em></>}
            </span>
          </div>
          <BubbleButton label="Change" ariaLabel="Change email">
            {(close) => (
              <BubbleForm
                close={close}
                note="We’ll send a link to the new address. Your email changes once you open it."
                fields={[["email", "New email", "email"], ["password", "Current password", "password", "current-password"]]}
                submitLabel="Send link"
                run={async ({ email, password: current }) => {
                  const problem = emailChangeProblem({ email, current: view.email });
                  if (problem) return problem;
                  if (!current) return "Enter your password to confirm it’s you.";
                  const result = await requestEmailChange({ email, password: current });
                  if (result?.error) return result.error;
                  setPending(result.pendingEmail);
                  say(`Confirmation sent to ${result.pendingEmail}`);
                  router.refresh();
                  return null;
                }}
              />
            )}
          </BubbleButton>
        </div>
        {pending && (
          <div className="notice" style={{ margin: "4px 0 6px", padding: "8px 12px", fontSize: 13 }}>
            Waiting for you to confirm <b>{pending}</b>. Until then you keep signing in with the old address.{" "}
            <a
              href="#resend"
              onClick={async (event) => {
                event.preventDefault();
                const result = await resendEmailChange({ email: pending }).catch(() => ({ error: "Connection lost. Try again." }));
                say(result?.error ?? "Confirmation email sent again");
              }}
            >
              Resend
            </a>{" "}
            ·{" "}
            <a
              href="#cancel"
              onClick={async (event) => {
                event.preventDefault();
                const result = await cancelEmailChange().catch(() => ({ error: "Connection lost. Try again." }));
                if (result?.error) return say(result.error);
                setPending(null);
                say("Email change cancelled");
                router.refresh();
              }}
            >
              Cancel
            </a>
          </div>
        )}
        <div className="srow">
          <div className="grow">
            <b>Password</b>
            <span>{view.passwordChangedAt ? `Last changed ${agoLabel(view.passwordChangedAt)}` : "Not changed here yet"}</span>
          </div>
          <BubbleButton label="Change" ariaLabel="Change password">
            {(close) => (
              <BubbleForm
                close={close}
                fields={[["current", "Current password", "password", "current-password"], ["next", "New password", "password", "new-password"], ["repeat", "Repeat new password", "password", "new-password"]]}
                submit="At least 8 characters."
                submitLabel="Change"
                run={async ({ current, next, repeat }) => {
                  const problem = passwordProblem({ current, next, repeat });
                  if (problem) return problem;
                  const result = await changePassword({ current, next, repeat });
                  if (result?.error) return result.error;
                  say("Password changed. Other devices were signed out.");
                  router.refresh();
                  return null;
                }}
              />
            )}
          </BubbleButton>
        </div>
      </div>

      <div className="panel">
        <h2 style={{ margin: "0 0 6px" }}>Where you’re signed in</h2>
        {sessions.length === 0 ? (
          <div className="sess">
            <div className="grow">
              <b>This browser</b>
            </div>
            <span className="pill ok">This device</span>
          </div>
        ) : (
          sessions.map((item) => (
            <div className="sess" key={item.id}>
              <div className="grow">
                <b>{item.current ? "This browser" : sessionLabel(item.userAgent)}</b>
                {item.current ? ` · ${sessionLabel(item.userAgent)}` : ""}
                <small>{item.current ? "now" : agoLabel(item.lastSeen)}</small>
              </div>
              {item.current ? (
                <span className="pill ok">This device</span>
              ) : (
                <button
                  type="button"
                  className="button button-quiet button-small"
                  onClick={async () => {
                    const result = await signOutSession({ sessionId: item.id }).catch(() => ({ error: "Connection lost. Try again." }));
                    if (result?.error) return say(result.error);
                    say("Signed out on that device");
                    router.refresh();
                  }}
                >
                  Sign out
                </button>
              )}
            </div>
          ))
        )}
        {otherSessions.length > 0 && (
          <div style={{ paddingTop: 12, borderTop: "1px solid var(--line)", display: "flex", gap: 10 }}>
            <button
              type="button"
              className="button button-quiet button-small"
              disabled={others}
              onClick={() =>
                startOthers(async () => {
                  const result = await signOutOthers().catch(() => ({ error: "Connection lost. Try again." }));
                  if (result?.error) return say(result.error);
                  say(`Signed out on ${result.count} other device${result.count === 1 ? "" : "s"}`);
                  router.refresh();
                })
              }
            >
              Sign out everywhere else
            </button>
          </div>
        )}
      </div>

      <div className="panel danger-zone danger-row">
        <div className="grow">
          <b>Delete account</b>
          <span>{blocker ? blocker.message : "Permanently removes your account and what is in it."}</span>
        </div>
        <button type="button" className="button button-danger button-small" disabled={view.role === "admin"} onClick={() => setModal(blocker ? "blocked" : "delete")}>
          Delete…
        </button>
      </div>

      <Modal open={modal === "blocked"} onClose={() => setModal(null)} title="Can’t delete yet" footer={<button type="button" className="button button-quiet" onClick={() => setModal(null)}>Close</button>}>
        {blocker?.kind === "games" && (
          <>
            <p>
              You still have {view.games.length} game{view.games.length === 1 ? "" : "s"} on this account:
            </p>
            <p>{view.games.join(" · ")}</p>
            <p className="settings-help">Remove {view.games.length === 1 ? "it" : "them"} (My games → Settings) and come back.</p>
          </>
        )}
        {blocker?.kind === "campaigns" && <p>You still have {blocker.count} running campaign{blocker.count === 1 ? "" : "s"}. Stop {blocker.count === 1 ? "it" : "them"} first (campaign page → Stop), then come back.</p>}
      </Modal>

      <Modal
        open={modal === "delete"}
        onClose={() => (setModal(null), setPassword(""), setDeleteError(""))}
        busy={deleting}
        title="Delete your account?"
        footer={
          <>
            {deleteError && <span className="error" role="alert">{deleteError}</span>}
            <button type="button" className="button button-quiet" onClick={() => (setModal(null), setPassword(""), setDeleteError(""))} disabled={deleting}>
              Cancel
            </button>
            <button type="button" className="button button-danger" onClick={confirmDelete} disabled={deleting || !password}>
              {deleting ? "Deleting…" : "Delete account"}
            </button>
          </>
        }
      >
        <p>Your account, your creatives and your settings will be removed for good. This can’t be undone.</p>
        <label htmlFor="delete-password">Your password</label>
        <input id="delete-password" className="field" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
      </Modal>
    </div>
  );
}
