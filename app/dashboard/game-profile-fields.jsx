"use client";

import MultiPick from "./multi-pick";
import { FIELDS, GENRES_HINT, MAX_GAME_GENRES, PROFILE_KEYS } from "../../lib/targeting";

const HINTS = {
  genres: GENRES_HINT,
  platforms: "Where players can play it.",
  languages: "The languages the game is available in.",
  countries: "The countries where most of its players are.",
};

/**
 * The lists a developer fills in about a game: genres, platforms, languages and countries.
 * `value` is { genres, platforms, languages, countries }. With `named`, the picks also go out as form fields.
 */
export default function GameProfileFields({ value, onChange, disabled = false, named = false }) {
  return (
    <div className="profile-fields">
      {PROFILE_KEYS.map((key) => (
        <MultiPick
          key={key}
          label={FIELDS[key].label}
          hint={HINTS[key]}
          max={key === "genres" ? MAX_GAME_GENRES : undefined}
          options={FIELDS[key].options}
          value={value[key]}
          onChange={(next) => onChange({ ...value, [key]: next })}
          name={named ? key : undefined}
          searchable={key === "languages" || key === "countries"}
          disabled={disabled}
        />
      ))}
    </div>
  );
}
