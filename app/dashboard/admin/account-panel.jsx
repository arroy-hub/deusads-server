"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { adminChangeEmail, adminSetPassword, adminSignOutEverywhere, deleteAccount, saveProfile, sendResetLink, setNotificationPref } from "../account/actions";
import { setAccountRole, setSuspended } from "./actions";
import { AVATAR_MAX_BYTES, ROLE_NAMES, agoLabel, checkProfile, emailChangeProblem, passwordProblem } from "../../../lib/account-rules";
import { sectionsFor } from "../../../lib/notification-prefs";
import { Icon, Pill, Tab, gradientFor, toast } from "./ui";

/* The account of one person as the mockup draws it (userModal / userA / acctBody0): a big avatar, role and status pills,
   the Profile / Sign-in / Notifications tabs in .utabs + .upanel, the "Unsaved changes" bar, and the role / switch off /
   delete controls. The real actions of the account page do the work. */

export const letterOf = (u) => (u.company || u.email || "?").trim().charAt(0).toUpperCase();

export function BigAv({ id, url, text, size = 52 }) {
  return <span className="cb-big-av" style={{ width: size, height: size, fontSize: Math.round(size * 0.4 * 10) / 10, background: url ? `center / cover no-repeat url(${url})` : gradientFor(id) }}>{url ? null : text}</span>;
}

export const RolePill = ({ role }) => <Pill tone={role === "admin" ? "info" : ""} dot={role === "admin"} style={role === "admin" ? undefined : { "--t": "#8c7f73" }}>{ROLE_NAMES[role]}</Pill>;
export const StatusPill = ({ u }) => (u.suspended ? <Pill tone="warn">Switched off</Pill> : u.active ? <Pill tone="good">Active</Pill> : <Pill dot={false} style={{ "--t": "#8c7f73" }}>Inactive</Pill>);

const TABS = [["profile", "Profile"], ["security", "Sign-in"], ["notif", "Notifications"]];
export const tabOf = (value) => (value === "notifications" ? "notif" : TABS.some(([k]) => k === value) ? value : "profile");

export function AccountTabs({ tab, setTab }) {
  return <div className="cb-utabs" role="tablist">{TABS.map(([k, l]) => <Tab key={k} current={tab === k} onClick={() => setTab(k)}>{l}</Tab>)}</div>;
}

const problem = { color: "var(--bad)", fontSize: 13 };

function Row({ label, sub, required, action, below, children }) {
  return (
    <div className="cb-fr">
      <div className="cb-lb">{label}{required && <span className="cb-dot" />}{sub && <small>{sub}</small>}</div>
      <div>{children}</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>{action}</div>
      {below && <div style={{ gridColumn: "1 / -1" }}>{below}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ Profile */

const PART = { company: "company name", contactName: "contact person", website: "website", country: "country", phone: "phone", picture: "picture" };
const list = (items) => (items.length > 1 ? `${items.slice(0, -1).join(", ")} and ${items.at(-1)}` : items[0]);

function ProfilePanel({ view, countries, onChanged }) {
  const fileInput = useRef(null);
  const [draft, setDraft] = useState({});
  const [picture, setPicture] = useState(null); // { file, preview } | { remove: true } | null
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const advertiser = view.role === "advertiser";
  const value = (key) => draft[key] ?? view[key] ?? "";
  const parts = [...Object.keys(draft), ...(picture ? ["picture"] : [])];
  const dirty = parts.length > 0;
  const shown = picture?.remove ? null : picture?.preview ?? view.avatarUrl;

  const set = (key, next) => {
    setErrors((cur) => ({ ...cur, [key]: undefined }));
    setDone("");
    setDraft((cur) => {
      const copy = { ...cur, [key]: next };
      if (next === (view[key] ?? "")) delete copy[key];
      return copy;
    });
  };
  function pick(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > AVATAR_MAX_BYTES) return toast("That image is over 2 MB");
    if (!/^image\/(png|jpeg)$/.test(file.type)) return toast("Use a PNG or JPG image");
    setDone("");
    setPicture({ file, preview: URL.createObjectURL(file) });
  }
  const discard = () => { setDraft({}); setPicture(null); setErrors({}); };

  async function save() {
    const input = { company: value("company"), contact_name: value("contactName"), website: value("website"), country: value("country"), phone: value("phone"), email: view.email };
    const checked = checkProfile(input, { role: view.role, withEmail: true });
    if (!checked.ok) {
      setErrors(checked.errors);
      return toast(checked.errors.company ? "Fill in the required fields first" : "Check the highlighted fields");
    }
    setBusy(true);
    try {
      if (picture) {
        const form = new FormData();
        form.set("accountId", view.id);
        if (picture.remove) form.set("remove", "1"); else form.set("file", picture.file);
        const response = await fetch("/dashboard/account/avatar", { method: "POST", body: form });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) { setBusy(false); return toast(body.error ?? "Could not save the picture"); }
      }
      if (Object.keys(draft).length > 0) {
        const result = await saveProfile({ accountId: view.id, fields: input });
        if (result?.errors) { setBusy(false); setErrors(result.errors); return toast("Check the highlighted fields"); }
        if (result?.error) { setBusy(false); return toast(result.error); }
      }
    } catch {
      setBusy(false);
      return toast("Connection lost. Try again.");
    }
    setBusy(false);
    discard();
    setDone("Profile saved.");
    timer.current = setTimeout(() => setDone(""), 2200);
    onChanged();
  }

  const input = (key, extra) => <input className="cb-fld" style={{ width: "100%", maxWidth: 380 }} value={value(key)} onChange={(e) => set(key, e.target.value)} aria-label={PART[key]} {...extra} />;
  return (
    <>
      <div className="cb-upanel"><div className="cb-frm">
        <Row label="Company" sub="Shown to developers and advertisers" required>
          {input("company", { maxLength: 120, "aria-invalid": !value("company").trim() || undefined })}
          {errors.company && <div style={problem}>{errors.company}</div>}
        </Row>
        <Row label="Picture">
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <BigAv id={view.id} url={shown} text={letterOf(view)} size={44} />
            <button type="button" className="cb-btn cb-q cb-s" onClick={() => fileInput.current?.click()}>Upload image</button>
            {shown && <button type="button" className="cb-btn cb-q cb-s" onClick={() => { setDone(""); setPicture({ remove: true }); }}>Remove</button>}
            <span className="cb-mute" style={{ fontSize: 12.5 }}>PNG or JPG, up to 2 MB</span>
            <input ref={fileInput} type="file" accept="image/png,image/jpeg" hidden onChange={pick} />
          </div>
        </Row>
        <Row label="Country">
          <select className="cb-fld" style={{ width: "100%", maxWidth: 380 }} value={value("country")} onChange={(e) => set("country", e.target.value)} aria-label="Country">
            <option value="">Not set</option>
            {countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
        </Row>
        <Row label="Contact person" sub="Who we write to about this account">{input("contactName", { maxLength: 80, placeholder: "Full name" })}</Row>
        <Row label="Website">{input("website", { placeholder: "https://" })}{errors.website && <div style={problem}>{errors.website}</div>}</Row>
        {advertiser && <Row label="Phone">{input("phone", { placeholder: "+" })}{errors.phone && <div style={problem}>{errors.phone}</div>}</Row>}
        <Row label="Registered email"><span>{view.email}</span></Row>
      </div></div>
      {(dirty || done) && (
        <div className="cb-st-bar" role="region" aria-label="Unsaved changes">
          <span className={`cb-st-bar-dot${dirty ? "" : " cb-is-done"}`} aria-hidden="true" />
          <span className="cb-st-bar-text" role="status" aria-live="polite">{dirty ? `Unsaved changes: ${list(parts.map((p) => PART[p]))}.` : done}</span>
          {dirty && <>
            <button type="button" className="cb-st-bar-discard" onClick={discard} disabled={busy}>Discard</button>
            <button type="button" className="cb-st-bar-save" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
          </>}
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ Sign-in */

function InlineForm({ fields, submit, note, run, close }) {
  const [values, setValues] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    setError("");
    const failure = await run(values).catch(() => "Connection lost. Try again.");
    setBusy(false);
    if (failure) setError(failure); else close();
  }
  return (
    <div className="cb-subrow" style={{ marginTop: 0 }}>
      {fields.map(([key, label, type, auto]) => (
        <input key={key} className="cb-fld" type={type} placeholder={label} aria-label={label} autoComplete={auto ?? "off"} value={values[key] ?? ""} onChange={(e) => setValues((cur) => ({ ...cur, [key]: e.target.value }))} />
      ))}
      <button type="button" className="cb-btn cb-s" disabled={busy} onClick={go}>{busy ? "Working…" : submit}</button>
      <button type="button" className="cb-btn cb-q cb-s" onClick={close}>Cancel</button>
      {(note || error) && <div style={{ flexBasis: "100%", ...(error ? problem : { fontSize: 13, color: "var(--ink-2)" }) }} role={error ? "alert" : undefined}>{error || note}</div>}
    </div>
  );
}

function SecurityPanel({ view, onChanged }) {
  const [open, setOpen] = useState(null); // "email" | "password"
  const toggle = (key) => setOpen((cur) => (cur === key ? null : key));
  const failed = (result, ok) => (result?.error ? result.error : (ok(result), null));
  return (
    <div className="cb-upanel"><div className="cb-frm">
      <Row label="Email" sub={view.email} action={<button type="button" className="cb-btn cb-q cb-s" onClick={() => toggle("email")}>Change</button>}
        below={open === "email" && (
          <InlineForm close={() => setOpen(null)} submit="Save" note="Changes at once, no confirmation needed. They get a notice about it."
            fields={[["email", "New email", "email", "off"]]}
            run={async ({ email }) => {
              const found = emailChangeProblem({ email, current: view.email });
              if (found) return found;
              return failed(await adminChangeEmail({ accountId: view.id, email }), () => { toast("Email changed. They were told."); onChanged(); });
            }} />
        )} />
      <Row label="Password" sub={view.passwordChangedAt ? `Last changed ${agoLabel(view.passwordChangedAt)}` : "Not changed here yet"}
        action={<>
          <button type="button" className="cb-btn cb-q cb-s" onClick={async () => {
            const result = await sendResetLink({ accountId: view.id }).catch(() => ({ error: "Connection lost. Try again." }));
            toast(result?.error ?? `Reset link sent to ${result.email}`);
          }}>Send reset link</button>
          <button type="button" className="cb-btn cb-q cb-s" onClick={() => toggle("password")}>Set new password</button>
        </>}
        below={open === "password" && (
          <InlineForm close={() => setOpen(null)} submit="Set password" note="At least 8 characters. They are signed out on all devices."
            fields={[["next", "New password", "password", "new-password"], ["repeat", "Repeat new password", "password", "new-password"]]}
            run={async ({ next, repeat }) => {
              const found = passwordProblem({ next, repeat }, { needCurrent: false });
              if (found) return found;
              return failed(await adminSetPassword({ accountId: view.id, next, repeat }), () => { toast("New password set. They were signed out everywhere."); onChanged(); });
            }} />
        )} />
      <Row label="Sessions" sub="Signs them out on every device" action={
        <button type="button" className="cb-btn cb-q cb-s" onClick={async () => {
          const result = await adminSignOutEverywhere({ accountId: view.id }).catch(() => ({ error: "Connection lost. Try again." }));
          toast(result?.error ?? "Signed out on all their devices");
        }}>Sign out everywhere</button>
      } />
    </div></div>
  );
}

/* ------------------------------------------------------------------ Notifications */

function NotificationsPanel({ view }) {
  const [prefs, setPrefs] = useState(view.prefs);
  const sections = sectionsFor(view.role);
  async function toggle(type, channel, next) {
    const before = prefs[type];
    setPrefs((cur) => ({ ...cur, [type]: { ...cur[type], [channel]: next } }));
    const result = await setNotificationPref({ accountId: view.id, type, channel, value: next }).catch(() => ({ error: "Connection lost. Try again." }));
    if (result?.error) { setPrefs((cur) => ({ ...cur, [type]: before })); return toast(result.error); }
    toast("Saved");
  }
  const box = (type, channel, available, label) => (available
    ? <input type="checkbox" checked={Boolean(prefs[type]?.[channel])} aria-label={label} onChange={(e) => toggle(type, channel, e.target.checked)} />
    : <span className="cb-mute">—</span>);
  return (
    <div className="cb-upanel"><div className="cb-frm">
      <table className="cb-nt-tbl">
        <tbody>
          {sections.flatMap((section, index) => [
            <tr key={`h-${section.title}`}>
              <td><b>{section.title}</b></td>
              <td className="cb-c">{index === 0 && <Icon name="bell" size={15} />}</td>
              <td className="cb-c">{index === 0 && <Icon name="mail" size={15} />}</td>
            </tr>,
            ...section.rows.map((row) => (
              <tr key={row.type}>
                <td>{row.title}<small className="cb-mute" style={{ display: "block", fontSize: 12.5 }}>{row.description}</small></td>
                <td className="cb-c">{box(row.type, "bell", row.hasBell, `${row.title}: in the bell`)}</td>
                <td className="cb-c">{box(row.type, "email", row.hasEmail, `${row.title}: by email`)}</td>
              </tr>
            )),
          ])}
        </tbody>
      </table>
      <div className="cb-mute" style={{ padding: "12px 0 6px", fontSize: 13 }}>Emails go to <b>{view.email}</b>.</div>
    </div></div>
  );
}

/** The body under the tabs. `onChanged` runs after something was saved so the page behind reads again. */
export function AccountBody({ view, countries, tab, onChanged }) {
  if (tab === "security") return <SecurityPanel view={view} onChanged={onChanged} />;
  if (tab === "notif") return <NotificationsPanel view={view} />;
  return <ProfilePanel view={view} countries={countries} onChanged={onChanged} />;
}

/* ------------------------------------------------------------------ role, switch off, delete */

export function RoleSelect({ u, onChanged }) {
  const [role, setRole] = useState(u.role);
  useEffect(() => setRole(u.role), [u.role]);
  async function change(next) {
    const before = role;
    setRole(next);
    const result = await setAccountRole({ accountId: u.id, role: next }).catch(() => ({ error: "Connection lost. Try again." }));
    if (result?.error) { setRole(before); return toast(result.error); }
    toast(`Role changed to ${ROLE_NAMES[next]}`);
    onChanged();
  }
  return (
    <select className="cb-fld" id="rolechg" style={{ minHeight: 34, width: "auto" }} aria-label="Role" value={role} disabled={u.self} onChange={(e) => change(e.target.value)}>
      {Object.entries(ROLE_NAMES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
    </select>
  );
}

/** The question under the buttons before an account is switched off, on again or deleted. */
export function ConfirmBar({ u, kind, onCancel, onDone }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const name = u.company || u.email;
  const off = kind === "suspend" && !u.suspended;
  const text = kind === "delete"
    ? `${name} and everything in it (games, campaigns, creatives) will be removed for good. This can’t be undone.`
    : u.suspended
      ? `${name} will be able to use the dashboard again, and their ads show again.`
      : `${name} will see only “Account suspended” until you switch it back on. Their games and campaigns stop showing.`;
  async function go() {
    setBusy(true);
    setError("");
    const result = await (kind === "delete" ? deleteAccount({ accountId: u.id }) : setSuspended({ accountId: u.id, suspended: !u.suspended })).catch(() => ({ error: "Connection lost. Try again." }));
    setBusy(false);
    if (result?.error) return setError(result.error);
    toast(kind === "delete" ? "Account deleted" : u.suspended ? "Account switched on" : "Account switched off");
    onDone(kind);
    router.refresh();
  }
  return (
    <div className="cb-subrow" role="alert" style={{ flex: 1, margin: 0 }}>
      <span style={{ flex: "1 1 260px", fontSize: 13.5 }}>{text}{error && <span style={{ ...problem, display: "block" }}>{error}</span>}</span>
      <button type="button" className={`cb-btn ${kind === "delete" || off ? "cb-d " : ""}cb-s`} disabled={busy} onClick={go}>{busy ? "Working…" : kind === "delete" ? "Delete account" : u.suspended ? "Switch on" : "Switch off"}</button>
      <button type="button" className="cb-btn cb-q cb-s" disabled={busy} onClick={onCancel}>Cancel</button>
    </div>
  );
}
