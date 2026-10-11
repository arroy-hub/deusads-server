"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import MultiPick from "../../multi-pick";
import { saveTargeting } from "../actions";
import { FIELDS, countFitting, hasTargeting, targetingSummary } from "../../../../lib/targeting";

const EMPTY = { genres: [], exclude_genres: [], platforms: [], languages: [] };

/** The non-empty lists of the form as an audience, or null for every game. */
function toTargeting(audience) {
  const picked = Object.fromEntries(Object.entries(audience).filter(([, ids]) => ids.length > 0));
  return Object.keys(picked).length ? picked : null;
}

const sameAudience = (a, b) => Object.keys(EMPTY).every((key) => [...a[key]].sort().join() === [...b[key]].sort().join());

/**
 * Which games may show this creative: genres, platforms, languages, and genres to avoid. Nothing
 * picked means every game. `catalog` is the profiles of the games that have opened placements to
 * advertisers (null when that is not known), so the advertiser sees at once how many games fit.
 * A booking is accepted whatever the audience is; this only decides where the ad appears.
 */
export default function Audience({ creativeId, initial, catalog }) {
  const router = useRouter();
  const start = { ...EMPTY, ...(initial ?? {}) };
  const [audience, setAudience] = useState(start);
  const [saved, setSaved] = useState(start);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null); // { tone, text }

  const targeting = toTargeting(audience);
  const changed = !sameAudience(audience, saved);
  const fitting = catalog ? countFitting(catalog, targeting) : null;

  const pick = (key) => (next) => {
    setNote(null);
    // A genre cannot be wanted and avoided at once: picking it on one side takes it off the other.
    if (key === "genres") setAudience({ ...audience, genres: next, exclude_genres: audience.exclude_genres.filter((id) => !next.includes(id)) });
    else if (key === "exclude_genres") setAudience({ ...audience, exclude_genres: next, genres: audience.genres.filter((id) => !next.includes(id)) });
    else setAudience({ ...audience, [key]: next });
  };

  async function save(next) {
    if (busy) return;
    setBusy(true);
    setNote(null);
    const result = await saveTargeting({ creativeId, targeting: toTargeting(next) }).catch(() => ({ error: "Connection lost. Try again." }));
    setBusy(false);
    if (result?.error) return setNote({ tone: "error", text: result.error });
    const stored = { ...EMPTY, ...(result.targeting ?? {}) };
    setSaved(stored);
    setAudience(stored);
    setNote({ tone: "done", text: "Saved. Players get it the next time they start a game." });
    router.refresh();
  }

  return (
    <section className="panel settings" aria-labelledby="audience-title">
      <h2 id="audience-title">Audience</h2>
      <p className="settings-help">
        Choose which games may show this creative. Pick nothing and it can show in every game. Inside one
        list any pick is enough; across lists a game has to fit all of them. A game that has not filled in
        a list you use here does not show the creative. Bookings are accepted either way.
      </p>

      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          if (changed) save(audience);
        }}
      >
        <MultiPick label="Genres" hint="Only games with at least one of these." options={FIELDS.genres.options} value={audience.genres} onChange={pick("genres")} disabled={busy} />
        <MultiPick label="Skip genres" hint="Never in games with any of these." options={FIELDS.genres.options} value={audience.exclude_genres} onChange={pick("exclude_genres")} disabled={busy} />
        <MultiPick label={FIELDS.platforms.label} hint="Only games on at least one of these." options={FIELDS.platforms.options} value={audience.platforms} onChange={pick("platforms")} disabled={busy} />
        <MultiPick label={FIELDS.languages.label} hint="Only games available in at least one of these." options={FIELDS.languages.options} value={audience.languages} onChange={pick("languages")} searchable disabled={busy} />

        <p className="audience-line" role="status" aria-live="polite">
          {hasTargeting(targeting) ? targetingSummary(targeting) : "Every game."}
          {fitting !== null && (
            <span className="muted-line">
              {catalog.length === 0
                ? " No game has opened placements to advertisers yet."
                : ` ${fitting} of ${catalog.length} ${catalog.length === 1 ? "game" : "games"} in the catalog fit${fitting === 1 ? "s" : ""}.`}
            </span>
          )}
        </p>
        {fitting === 0 && catalog.length > 0 && (
          <p className="notice">
            No game in the catalog fits this audience yet. You can still book: the booking is accepted and
            the creative starts showing as soon as a matching game opens a placement.
          </p>
        )}

        <div className="row">
          <button className="button" type="submit" disabled={busy || !changed}>
            {busy ? "Saving…" : "Save audience"}
          </button>
          {hasTargeting(targeting) && (
            <button className="button button-quiet" type="button" disabled={busy} onClick={() => save(EMPTY)}>
              Show in every game
            </button>
          )}
          <span role="status" aria-live="polite" className={note?.tone === "error" ? "error" : "upload-done"}>
            {note?.text ?? ""}
          </span>
        </div>
      </form>
    </section>
  );
}
