"use client";

import { useState } from "react";
import Modal from "./modal";
import { COUNTRIES } from "../../lib/targeting";
import { TIERS, countriesByTier, countryMode, pickState, tierCounts, toggleList } from "../../lib/country-tiers";

const GROUPS = countriesByTier(COUNTRIES);
const MARK = {
  include: <path d="M5 12l5 5 9-10" />,
  exclude: <path d="M6 6l12 12M18 6L6 18" />,
  some: <path d="M6 12h12" />,
};

function Box({ state, kind }) {
  return (
    <span className={`ct-box${state === "none" ? "" : " is-on"}${kind === "exclude" ? " is-skip" : ""}`} aria-hidden="true">
      {state !== "none" && (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
          {state === "some" ? MARK.some : MARK[kind]}
        </svg>
      )}
    </span>
  );
}

/**
 * The countries in three columns, one per tier. Every country has a tick, and so does every tier: ticking a tier
 * picks all of its countries. The words of a tier appear when the pointer rests on its name.
 * `kind` "include" picks countries to aim at; "exclude" picks countries to skip (red, with a cross).
 * `locked` shows every country as picked and cannot be changed (worldwide).
 */
export function TierColumns({ value, onChange, kind = "include", locked = false, disabled = false, scroll = 400 }) {
  const picked = locked ? COUNTRIES.map((c) => c.id) : value;
  const frozen = locked || disabled;
  const change = (next) => !frozen && onChange(next);
  return (
    <div className={`ct-cols${frozen ? " is-frozen" : ""}`}>
      {GROUPS.map((group) => {
        const ids = group.countries.map((c) => c.id);
        const state = pickState(ids, picked);
        const aria = state === "all" ? "true" : state === "some" ? "mixed" : "false";
        const n = ids.filter((id) => picked.includes(id)).length;
        return (
          <section key={group.id} className={`ct-col ct-t${group.id}`} aria-label={group.label}>
            <div className="ct-bar" />
            <div className="ct-head">
              <button type="button" className="ct-all" role="checkbox" aria-checked={aria} aria-label={`All ${group.label} countries`} disabled={frozen} onClick={() => change(toggleList(ids, picked))}>
                <Box state={state} kind={kind} />
              </button>
              <span className="ct-pill" tabIndex={0}>
                {group.label}
                <span className="ct-bub" role="tooltip">{group.desc}</span>
              </span>
              <span className="ct-count">{n} of {ids.length}</span>
            </div>
            <ul className="ct-list" style={{ maxHeight: scroll }}>
              {group.countries.map((country) => {
                const on = picked.includes(country.id);
                return (
                  <li key={country.id}>
                    <button type="button" className={`ct-row${on ? " is-on" : ""}${on && kind === "exclude" ? " is-skip" : ""}`} role="checkbox" aria-checked={on} disabled={frozen} onClick={() => change(on ? picked.filter((id) => id !== country.id) : [...picked, country.id])}>
                      <Box state={on ? "all" : "none"} kind={kind} />
                      <span className="ct-code">{country.id.toUpperCase()}</span>
                      <span className="ct-name">{country.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/** "Tier 1 · 2" chips for a list of country ids. */
export function TierChips({ ids }) {
  const counts = tierCounts(ids);
  return (
    <>
      {TIERS.filter((tier) => counts[tier.id] > 0).map((tier) => (
        <span key={tier.id} className={`ct-chip ct-t${tier.id}`}>{tier.label} · {counts[tier.id]}</span>
      ))}
    </>
  );
}

/**
 * A game's countries as a field like its other lists: a title, and under it a dashed box. The box shows what is picked
 * (the tiers and how many countries in each); pressing it opens the pop-up with the three columns.
 * With `name`, every pick also goes out as a hidden field of the surrounding form.
 */
export function CountryField({ label = "Audience countries", hint, value, onChange, name, disabled = false, required = false }) {
  const [open, setOpen] = useState(false);
  return (
    <fieldset className="multi-pick" disabled={disabled}>
      <legend>
        {label}
        {required && <i className="req" title="Required" />}
        {value.length > 0 && <span className="multi-count">{value.length} selected</span>}
      </legend>
      {hint && <p className="settings-help">{hint}</p>}
      <button type="button" className={`ct-field${value.length === 0 ? " is-empty" : ""}`} aria-haspopup="dialog" onClick={() => setOpen(true)} disabled={disabled}>
        {value.length === 0 ? (
          <span className="ct-field-empty">Choose countries</span>
        ) : (
          <>
            <b>{value.length} {value.length === 1 ? "country" : "countries"}</b>
            <TierChips ids={value} />
          </>
        )}
        <span className="ct-field-act">{value.length === 0 ? "Choose" : "Edit"}</span>
      </button>
      {name && value.map((id) => <input key={id} type="hidden" name={name} value={id} />)}
      <Modal
        wide
        open={open}
        onClose={() => setOpen(false)}
        title={label}
        footer={
          <>
            <span className="muted-line">{value.length === 0 ? "None selected yet" : `${value.length} selected`}</span>
            <button type="button" className="button button-quiet" onClick={() => onChange([])} disabled={value.length === 0}>Clear all</button>
            <button type="button" className="button" onClick={() => setOpen(false)}>Done</button>
          </>
        }
      >
        <p className="settings-help">Tick the countries where your players are, or a whole tier at once. Languages are a separate setting.</p>
        <TierColumns value={value} onChange={onChange} scroll={420} />
      </Modal>
    </fieldset>
  );
}

const MODES = [
  { id: "all", label: "Worldwide", help: "Every country. The campaign can show in all games." },
  { id: "only", label: "Only these countries", help: "The campaign shows only in games with players in the countries you tick." },
  { id: "except", label: "Everywhere except", help: "Every country, minus the ones you tick." },
];

/**
 * Where a campaign (or a creative) is aimed, as a field like the game's countries: a dashed box that says what is chosen
 * (Worldwide, only some countries, or everywhere except some) and opens a pop-up with the three buttons and the three tier columns.
 * `value` is { countries, exclude_countries }; `onChange` gets the same shape. Worldwide shows every country ticked and cannot be
 * edited. Moving between "only" and "except" starts the list again, because a tick means the opposite.
 */
export function CountryAudience({ value, onChange, disabled = false }) {
  const [mode, setMode] = useState(countryMode(value));
  const [open, setOpen] = useState(false);
  const countries = value.countries ?? [];
  const skipped = value.exclude_countries ?? [];
  const ticked = mode === "except" ? skipped : countries;
  const pick = (id) => {
    if (id === mode) return;
    setMode(id);
    onChange({ countries: [], exclude_countries: [] });
  };
  const word = (n) => `${n} ${n === 1 ? "country" : "countries"}`;
  const headline = mode === "all" ? "Worldwide" : mode === "only" ? (countries.length ? `Only ${word(countries.length)}` : "Only these countries") : skipped.length ? `Everywhere except ${word(skipped.length)}` : "Everywhere except";
  const empty = mode !== "all" && ticked.length === 0;
  return (
    <div className="ct-audience">
      <button type="button" className={`ct-field${empty ? " is-empty" : ""}`} aria-haspopup="dialog" onClick={() => setOpen(true)} disabled={disabled}>
        <b>{headline}</b>
        {mode === "all" ? <span className="muted-line">All countries</span> : <TierChips ids={ticked} />}
        {empty && <span className="ct-field-empty">Nothing ticked yet</span>}
        <span className="ct-field-act">Edit</span>
      </button>
      {mode === "only" && skipped.length > 0 && (
        <p className="settings-help">
          {skipped.length === 1 ? "1 country is also skipped" : `${skipped.length} countries are also skipped`}.{" "}
          <button type="button" className="button button-quiet" disabled={disabled} onClick={() => onChange({ countries, exclude_countries: [] })}>Stop skipping them</button>
        </p>
      )}
      <Modal
        wide
        open={open}
        onClose={() => setOpen(false)}
        title="Countries"
        footer={
          <>
            <span className="muted-line">{mode === "all" ? "Worldwide: every country" : ticked.length === 0 ? "None ticked yet" : `${ticked.length} ${mode === "except" ? "skipped" : "selected"}`}</span>
            {mode !== "all" && <button type="button" className="button button-quiet" onClick={() => onChange({ countries: [], exclude_countries: [] })} disabled={ticked.length === 0 && skipped.length === 0}>Clear all</button>}
            <button type="button" className="button" onClick={() => setOpen(false)}>Done</button>
          </>
        }
      >
        <div className="ct-modes" role="radiogroup" aria-label="Where the campaign shows">
          {MODES.map((m) => (
            <button key={m.id} type="button" className="ct-mode" role="radio" aria-checked={mode === m.id} onClick={() => pick(m.id)}>{m.label}</button>
          ))}
        </div>
        <p className="settings-help">{MODES.find((m) => m.id === mode).help}</p>
        <TierColumns
          kind={mode === "except" ? "exclude" : "include"}
          locked={mode === "all"}
          value={ticked}
          scroll={420}
          onChange={(next) => (mode === "except" ? onChange({ countries: [], exclude_countries: next }) : onChange({ countries: next, exclude_countries: skipped.filter((id) => !next.includes(id)) }))}
        />
      </Modal>
    </div>
  );
}
