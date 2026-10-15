"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Avatar from "./avatar";
import BillingStub from "./billing-stub";
import { saveProfile } from "./actions";
import { AVATAR_MAX_BYTES, ROLE_NAMES, checkProfile, initials } from "../../../lib/account-rules";

const FIELDS = ["company", "contactName", "website", "country", "phone", "email"];

/**
 * The Profile tab. Edits stay in `draft` until Save; the save bar shows while there are any. Company
 * (and, for an admin editing someone else, the email) must be filled in before saving.
 */
export default function ProfileTab({ view, admin, countries, say, goSecurity }) {
  const router = useRouter();
  const fileInput = useRef(null);
  const [draft, setDraft] = useState({});
  const [picture, setPicture] = useState(null); // { file, preview } | { remove: true } | null
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const advertiser = view.role === "advertiser";
  const developer = view.role === "developer";
  const value = (key) => draft[key] ?? view[key] ?? "";
  const dirty = Object.keys(draft).length > 0 || picture !== null;
  const shownAvatar = picture?.remove ? null : picture?.preview ?? view.avatarUrl;

  const set = (key, next) => {
    setErrors((current) => ({ ...current, [key]: undefined }));
    setDraft((current) => {
      const copy = { ...current, [key]: next };
      if (next === (view[key] ?? "")) delete copy[key];
      return copy;
    });
  };

  const companyLabel = advertiser
    ? ["Company name", "Your company or brand. Shown to developers inside your campaigns."]
    : developer
      ? ["Studio name", "Shown to advertisers who see your games."]
      : ["Company name", "Internal."];
  const watchers = advertiser ? ", and to developers next to your company name" : developer ? ", and to advertisers next to your studio name" : "";

  function pick(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > AVATAR_MAX_BYTES) return say("That image is over 2 MB");
    if (!/^image\/(png|jpeg)$/.test(file.type)) return say("Use a PNG or JPG image");
    setPicture({ file, preview: URL.createObjectURL(file) });
  }

  function discard() {
    setDraft({});
    setPicture(null);
    setErrors({});
  }

  async function save() {
    const input = { company: value("company"), contact_name: value("contactName"), website: value("website"), country: value("country"), phone: value("phone"), email: value("email") };
    const checked = checkProfile(input, { role: view.role, withEmail: admin });
    if (!checked.ok) {
      setErrors(checked.errors);
      return say(checked.errors.company || checked.errors.email ? "Fill in the required fields first" : "Check the highlighted fields");
    }
    setBusy(true);
    try {
      if (picture) {
        const form = new FormData();
        if (admin) form.set("accountId", view.id);
        if (picture.remove) form.set("remove", "1");
        else form.set("file", picture.file);
        const response = await fetch("/dashboard/account/avatar", { method: "POST", body: form });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          setBusy(false);
          return say(body.error ?? "Could not save the picture");
        }
      }
      if (Object.keys(draft).length > 0) {
        const result = await saveProfile({
          accountId: admin ? view.id : undefined,
          fields: { company: input.company, contact_name: input.contact_name, website: input.website, country: input.country, phone: input.phone, email: input.email },
        });
        if (result?.errors) {
          setBusy(false);
          setErrors(result.errors);
          return say("Check the highlighted fields");
        }
        if (result?.error) {
          setBusy(false);
          return say(result.error);
        }
      }
    } catch {
      setBusy(false);
      return say("Connection lost. Try again.");
    }
    setBusy(false);
    setDraft({});
    setPicture(null);
    setErrors({});
    say("Saved");
    router.refresh();
  }

  const missingCompany = !value("company").trim();
  const previewName = value("company").trim() || value("contactName").trim();
  const country = countries.find((item) => item.code === value("country"));
  const since = String(view.createdAt ?? "").slice(0, 10);
  const label = { initials: initials({ company: value("company"), contact_name: value("contactName"), email: view.email }) };

  return (
    <div className="acc-grid">
      <div className="acc-form">
        <div className="panel">
          <div className="acc-row">
            <div className="lab">
              <b>Avatar</b>
              <span>Your photo or company logo. Shown in the side menu{watchers}.</span>
            </div>
            <div className="avatar-line">
              <Avatar url={shownAvatar} initials={label.initials} big />
              <div className="btns">
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" className="button button-quiet button-small" onClick={() => fileInput.current?.click()}>
                    Upload image
                  </button>
                  {shownAvatar && (
                    <button type="button" className="button button-quiet button-small" onClick={() => setPicture({ remove: true })}>
                      Remove
                    </button>
                  )}
                </div>
                <div className="hint" style={{ margin: 0 }}>
                  PNG or JPG, up to 2 MB. We crop it to a circle.
                </div>
                <input ref={fileInput} type="file" accept="image/png,image/jpeg" hidden onChange={pick} />
              </div>
            </div>
          </div>

          <div className="acc-row">
            <div className="lab">
              <b>
                {companyLabel[0]}
                <i className="rdot" title="Required" />
              </b>
              <span>{companyLabel[1]}</span>
            </div>
            <div>
              <input className="field" maxLength={120} value={value("company")} placeholder="e.g. Northlight Games" onChange={(event) => set("company", event.target.value)} aria-invalid={missingCompany || undefined} />
              {(missingCompany || errors.company) && <div className="err-line">{errors.company ?? `Required before you can ${advertiser ? "start a campaign" : developer ? "add a game" : "continue"}.`}</div>}
            </div>
          </div>

          <div className="acc-row">
            <div className="lab">
              <b>
                Email
                <i className="rdot" title="Required" />
              </b>
              <span>{admin ? "As an admin you can change it directly. They are told." : "The address you sign in with."}</span>
            </div>
            <div>
              {admin ? (
                <>
                  <input className="field" type="email" value={value("email")} onChange={(event) => set("email", event.target.value)} />
                  {(!value("email").trim() || errors.email) && <div className="err-line">{errors.email ?? "An email is required."}</div>}
                </>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 14, minHeight: 44, flexWrap: "wrap" }}>
                  <span>{view.email}</span>
                  <a href="#security" onClick={(event) => (event.preventDefault(), goSecurity())} style={{ fontSize: 13 }}>
                    Change in Sign-in &amp; security
                  </a>
                </div>
              )}
            </div>
          </div>

          <div className="acc-row">
            <div className="lab">
              <b>Contact person</b>
              <span>Who we write to about this account.</span>
            </div>
            <div>
              <input className="field" maxLength={80} value={value("contactName")} placeholder="Full name" onChange={(event) => set("contactName", event.target.value)} />
            </div>
          </div>

          <div className="acc-row">
            <div className="lab">
              <b>Website</b>
              <span>Your site or store page.</span>
            </div>
            <div>
              <input className="field" value={value("website")} placeholder="https://" onChange={(event) => set("website", event.target.value)} />
              {errors.website && <div className="err-line">{errors.website}</div>}
            </div>
          </div>

          <div className="acc-row">
            <div className="lab">
              <b>Country</b>
              <span>{advertiser ? "Where your company is registered." : "Where you are based."}</span>
            </div>
            <div>
              <select className="field" value={value("country")} onChange={(event) => set("country", event.target.value)}>
                <option value="">Not set</option>
                {countries.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {advertiser && (
            <div className="acc-row">
              <div className="lab">
                <b>Phone</b>
                <span>For urgent questions about a campaign.</span>
              </div>
              <div>
                <input className="field" value={value("phone")} placeholder="+" onChange={(event) => set("phone", event.target.value)} />
                {errors.phone && <div className="err-line">{errors.phone}</div>}
              </div>
            </div>
          )}

          <div className="acc-row">
            <div className="lab">
              <b>Account type</b>
              <span>Chosen at sign-up. Can’t be changed here.</span>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <span className="pill brand">{ROLE_NAMES[view.role]}</span>
              {!admin && (
                <span className="hint" style={{ margin: 0 }}>
                  {view.role === "admin" ? "Granted by hand in the database." : "Need the other kind? Use a separate account with another email."}
                </span>
              )}
            </div>
          </div>
        </div>

        {(advertiser || developer) && <BillingStub advertiser={advertiser} />}

        {dirty && (
          <div className="savebar">
            <span>You have unsaved changes.</span>
            <button type="button" className="button button-quiet" onClick={discard} disabled={busy}>
              Discard
            </button>
            <button type="button" className="button" onClick={save} disabled={busy}>
              {busy ? "Saving…" : "Save changes"}
            </button>
          </div>
        )}
      </div>

      <aside>
        <div className="preview-card">
          <h3>{advertiser ? "How developers see you" : developer ? "How advertisers see you" : "How others see you"}</h3>
          <div className="p-line">
            <Avatar url={shownAvatar} initials={label.initials} />
            <div>
              <b>{previewName || "—"}</b>
              <span>
                {advertiser ? "Advertiser" : developer ? "Developer" : "DeusADS team"}
                {country ? ` · ${country.name}` : ""}
              </span>
            </div>
          </div>
        </div>
        <div className="preview-card">
          <h3>Account</h3>
          <div className="p-line p-split">
            <span>Status</span>
            <span className={`pill ${view.suspended ? "warn" : "ok"}`}>
              {view.suspended ? "Switched off" : "Active"}
            </span>
          </div>
          <div className="p-line p-split">
            <span>Member since</span>
            <b>{since || "—"}</b>
          </div>
          {developer && (
            <div className="p-line p-split">
              <span>Games</span>
              <b>{view.games.length}</b>
            </div>
          )}
          {advertiser && (
            <div className="p-line p-split">
              <span>Running campaigns</span>
              <b>{view.runningCampaigns}</b>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
