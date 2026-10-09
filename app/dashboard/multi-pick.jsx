"use client";

import { useState } from "react";

/**
 * Pick any number of options from a list: buttons that switch on and off, plus a search box for
 * long lists. With `name`, every pick is also sent as a hidden field of the surrounding form.
 */
export default function MultiPick({ label, hint, options, value, onChange, name, searchable = false, disabled = false }) {
  const [query, setQuery] = useState("");
  const chosen = new Set(value);
  const needle = query.trim().toLowerCase();
  const visible = needle
    ? options.filter((option) => option.label.toLowerCase().includes(needle) || option.id === needle)
    : options;

  const toggle = (id) => onChange(chosen.has(id) ? value.filter((item) => item !== id) : [...value, id]);

  return (
    <fieldset className="multi-pick" disabled={disabled}>
      <legend>
        {label}
        {value.length > 0 && <span className="multi-count">{value.length} selected</span>}
      </legend>
      {hint && <p className="settings-help">{hint}</p>}
      {searchable && (
        <input
          className="field"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.preventDefault(); // Enter must not submit the form
          }}
          placeholder="Search"
          aria-label={`Search ${label.toLowerCase()}`}
          autoComplete="off"
        />
      )}
      <div className={`multi-options${searchable ? " is-scroll" : ""}`} role="group" aria-label={label}>
        {visible.map((option) => (
          <button
            key={option.id}
            type="button"
            className="multi-option"
            aria-pressed={chosen.has(option.id)}
            onClick={() => toggle(option.id)}
          >
            {option.label}
          </button>
        ))}
        {visible.length === 0 && <span className="muted-line">Nothing found.</span>}
      </div>
      {searchable && value.length > 0 && (
        <p className="muted-line">
          Selected: {options.filter((option) => chosen.has(option.id)).map((option) => option.label).join(", ")}
        </p>
      )}
      {name && value.map((id) => <input key={id} type="hidden" name={name} value={id} />)}
    </fieldset>
  );
}
