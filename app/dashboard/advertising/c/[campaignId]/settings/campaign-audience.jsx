"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import MultiPick from "../../../../multi-pick";
import GameIcon from "../../../../game-icon";
import { setCampaignAudience } from "../../../actions";
import { FIELDS, countFitting, fitsGame, hasTargeting, labelOf, targetingSummary } from "../../../../../../lib/targeting";

const GROUPS = [["genres", "Genres", "on"], ["exclude_genres", "Skip genres", "off"], ["platforms", "Platforms and devices", ""], ["languages", "Languages", ""]];

/** The saved audience, split the way the editor splits it: genres, skipped genres, platforms and languages. */
function AudienceGroups({ targeting }) {
  const filled = GROUPS.filter(([key]) => (targeting?.[key] ?? []).length > 0);
  if (filled.length === 0) return <div className="cs-chips"><span className="cs-chip">Every game</span></div>;
  return (
    <dl className="aud-groups">
      {filled.map(([key, label, tone]) => (
        <div key={key}>
          <dt>{label}</dt>
          <dd>{targeting[key].map((id) => <span key={id} className={`cs-chip${tone ? ` is-${tone}` : ""}`}>{labelOf(key === "exclude_genres" ? "genres" : key, id).replace(key === "platforms" ? / \(.*\)$/ : /$^/, "")}</span>)}</dd>
        </div>
      ))}
    </dl>
  );
}

const EMPTY = { genres: [], exclude_genres: [], platforms: [], languages: [] };
const KEYS = Object.keys(EMPTY);
const toList = (targeting) => ({ ...EMPTY, ...(targeting ?? {}) });
const toTargeting = (value) => {
  const picked = Object.fromEntries(Object.entries(value).filter(([, ids]) => ids.length > 0));
  return Object.keys(picked).length ? picked : null;
};
const sameAudience = (x, y) => KEYS.every((k) => [...x[k]].sort().join() === [...y[k]].sort().join());

/** Who the campaign is shown to: the lists of genres, platforms and languages, and the games that fit. */
function AudienceEditor({ value, onChange, onSave, onClose, saved, catalog, busy, note }) {
  const targeting = toTargeting(value);
  const fits = catalog ? catalog.filter((game) => fitsGame(game, targeting)) : [];
  const changed = !sameAudience(value, saved);
  const pick = (key) => (next) => {
    if (key === "genres") onChange({ ...value, genres: next, exclude_genres: value.exclude_genres.filter((id) => !next.includes(id)) });
    else if (key === "exclude_genres") onChange({ ...value, exclude_genres: next, genres: value.genres.filter((id) => !next.includes(id)) });
    else onChange({ ...value, [key]: next });
  };
  return (
    <div className="aud-ed">
      <p className="settings-help">Pick nothing and the campaign can show in every game. Inside one list any pick is enough; across lists a game has to fit all of them. A game that has not filled in a list you use here does not show the campaign.</p>
      <div className="aud-ed-grid">
        <MultiPick label="Genres" hint="Only games with at least one of these." options={FIELDS.genres.options} value={value.genres} onChange={pick("genres")} />
        <MultiPick label="Skip genres" hint="Never in games with any of these." options={FIELDS.genres.options} value={value.exclude_genres} onChange={pick("exclude_genres")} />
        <MultiPick label={FIELDS.platforms.label} hint="Only games on at least one of these." options={FIELDS.platforms.options} value={value.platforms} onChange={pick("platforms")} />
        <MultiPick label={FIELDS.languages.label} hint="Only games available in at least one of these." options={FIELDS.languages.options} value={value.languages} onChange={pick("languages")} searchable />
      </div>
      {catalog && (
        <div className="aud-fit" role="status" aria-live="polite">
          <div className="aud-fit-head">
            <b>{hasTargeting(targeting) ? targetingSummary(targeting) : "Every game."}</b>
            <span className={`ov-pill ${fits.length > 0 ? "ov-live" : "ov-paused"}`}>{fits.length} of {catalog.length} games fit</span>
          </div>
          {fits.length > 0 ? (
            <div className="aud-fit-games">{fits.map((game) => <span key={game.id ?? game.name} className="aud-game"><GameIcon name={game.name} url={game.iconUrl ?? ""} size="sm" />{game.name}</span>)}</div>
          ) : (
            <p className="notice">No game in the catalog fits this audience yet. You can still run the campaign: it starts showing as soon as a matching game opens a placement.</p>
          )}
        </div>
      )}
      {note && <p className={note.tone === "error" ? "error" : "upload-done"} role={note.tone === "error" ? "alert" : "status"}>{note.text}</p>}
      <div className="aud-ed-actions">
        <button type="button" className="button" disabled={!changed || busy} onClick={onSave}>{busy ? "Saving…" : "Save audience"}</button>
        {hasTargeting(targeting) && <button type="button" className="button button-quiet" disabled={busy} onClick={() => onChange(EMPTY)}>Show in every game</button>}
        <button type="button" className="button button-quiet" disabled={busy} onClick={onClose}>{changed ? "Discard" : "Close"}</button>
      </div>
    </div>
  );
}

/** The audience of the whole campaign: what it is now, and an editor opened in place. It applies on top of each creative's own audience. */
export default function CampaignAudience({ campaignId, initial, catalog }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(toList(initial));
  const [value, setValue] = useState(toList(initial));
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  const savedTargeting = toTargeting(saved);
  const fitting = catalog ? countFitting(catalog, savedTargeting) : null;

  async function save() {
    setBusy(true);
    setNote(null);
    const result = await setCampaignAudience({ campaignId, targeting: toTargeting(value) }).catch(() => ({ error: "Connection lost. Try again." }));
    setBusy(false);
    if (result?.error) return setNote({ tone: "error", text: result.error });
    const stored = toList(result.targeting);
    setSaved(stored);
    setValue(stored);
    setOpen(false);
    router.refresh();
  }
  const close = () => { setValue(saved); setNote(null); setOpen(false); };

  return (
    <section className="cs-card" aria-labelledby="cs-aud-title">
      <div className="cs-aud-head">
        <div>
          <h2 id="cs-aud-title">Audience</h2>
          <p>Who this campaign is shown to.</p>
        </div>
        {fitting !== null && catalog.length > 0 && (
          <span className={`ov-pill ${fitting > 0 ? "ov-live" : "ov-paused"}`}>{fitting} of {catalog.length} games</span>
        )}
      </div>
      {!open && (
        <>
          <AudienceGroups targeting={savedTargeting} />
          <div><button type="button" className="button button-quiet" onClick={() => setOpen(true)}>Edit audience</button></div>
        </>
      )}
      {open && <AudienceEditor value={value} onChange={setValue} saved={saved} onSave={save} onClose={close} catalog={catalog} busy={busy} note={note} />}
    </section>
  );
}
