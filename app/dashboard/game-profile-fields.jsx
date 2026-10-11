"use client";

import MultiPick from "./multi-pick";
import { FIELDS, PROFILE_KEYS } from "../../lib/targeting";

const HINTS = {
  genres: "Everything that describes the game.",
  platforms: "Where players can play it.",
  languages: "The languages the game is available in.",
};

/**
 * The three lists a developer fills in about a game: genres, platforms and languages.
 * `value` is { genres, platforms, languages }. With `named`, the picks also go out as form fields.
 */
export default function GameProfileFields({ value, onChange, disabled = false, named = false }) {
  return (
    <div className="profile-fields">
      {PROFILE_KEYS.map((key) => (
        <MultiPick
          key={key}
          label={FIELDS[key].label}
          hint={HINTS[key]}
          options={FIELDS[key].options}
          value={value[key]}
          onChange={(next) => onChange({ ...value, [key]: next })}
          name={named ? key : undefined}
          searchable={key === "languages"}
          disabled={disabled}
        />
      ))}
    </div>
  );
}
