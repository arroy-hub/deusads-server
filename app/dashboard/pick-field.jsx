"use client";

import { useState } from "react";
import Modal from "./modal";
import MultiPick from "./multi-pick";

/**
 * One list a game fills in (genres, platforms or languages) as a field: the chosen items sit in it
 * as small tags that can be removed, an empty field says what to add, and the button beside it opens
 * a pop-up with everything that can be added. Ticking in the pop-up changes the field at once.
 */
export default function PickField({ label, noun, nounPlural, hint, options, value, onChange, searchable = false, disabled = false, compact = false }) {
  const [open, setOpen] = useState(false);
  const labelOf = new Map(options.map((option) => [option.id, option.label]));
  // keep the order of the full list, so the tags read the same as the pop-up
  const order = new Map(options.map((option, index) => [option.id, index]));
  const chosen = [...value].sort((a, b) => (order.get(a) ?? 1e9) - (order.get(b) ?? 1e9));

  const modal = (
    <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Add ${nounPlural}`}
        footer={
          <>
            <span className="muted-line">{value.length === 0 ? "None added yet" : `${value.length} added`}</span>
            <button type="button" className="button" onClick={() => setOpen(false)}>
              Done
            </button>
          </>
        }
      >
        <MultiPick label={label} options={options} value={value} onChange={onChange} searchable={searchable} />
    </Modal>
  );

  const tags = chosen.map((id) => (
    <span className="pick-tag" key={id}>
      {labelOf.get(id) ?? id}
      <button type="button" className="pick-tag-remove" aria-label={`Remove ${labelOf.get(id) ?? id}`} onClick={() => onChange(value.filter((item) => item !== id))} disabled={disabled}>
        ×
      </button>
    </span>
  ));

  // One slim row: name, what is chosen, a plus. Rows stack, so another setting is just another row.
  if (compact) {
    return (
      <div className="pick-row" data-empty={chosen.length === 0 ? "true" : undefined}>
        <div className="pick-row-label">{label}</div>
        <div className="pick-row-values" aria-live="polite">
          {chosen.length === 0 ? <span className="pick-required">Required</span> : tags}
        </div>
        <button type="button" className="pick-row-add" aria-label={`Add ${noun}`} title={`Add ${noun}`} onClick={() => setOpen(true)} disabled={disabled}>
          +
        </button>
        {modal}
      </div>
    );
  }

  return (
    <div className="pick-field">
      <div className="pick-field-label">
        {label}
        {value.length > 0 && <span className="multi-count">{value.length} added</span>}
      </div>
      {hint && <p className="settings-help">{hint}</p>}
      <div className="pick-field-row">
        <div className="pick-box" aria-live="polite">
          {chosen.length === 0 ? (
            <span className="pick-empty">Nothing here yet. Add the {nounPlural} of your game.</span>
          ) : (
            chosen.map((id) => (
              <span className="pick-tag" key={id}>
                {labelOf.get(id) ?? id}
                <button
                  type="button"
                  className="pick-tag-remove"
                  aria-label={`Remove ${labelOf.get(id) ?? id}`}
                  onClick={() => onChange(value.filter((item) => item !== id))}
                  disabled={disabled}
                >
                  ×
                </button>
              </span>
            ))
          )}
        </div>
        <button type="button" className="button button-quiet pick-add" onClick={() => setOpen(true)} disabled={disabled}>
          + Add {noun}
        </button>
      </div>

      {modal}
    </div>
  );
}
