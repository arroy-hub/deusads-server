"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createGame, setGameCover, setGameIcon } from "./actions";
import GameCardPreview from "./game-card-preview";
import MultiPick from "./multi-pick";
import { CountryField } from "./country-tiers";
import { browserClient } from "../../lib/supabase-browser";
import { MAX_ICON_INPUT_BYTES, squareIcon } from "../../lib/icon-image";
import { cropToStrip } from "../../lib/cover-image";
import { COVERS, COVER_MAX_BYTES, defaultCoverId } from "../../lib/game-cover";
import { ABOUT_LISTS } from "../../lib/game-about";
import { FIELDS, GENRES_HINT, MAX_GAME_GENRES, PROFILE_KEYS } from "../../lib/targeting";

const EMPTY = {
  name: "",
  storeUrl: "",
  genres: [],
  platforms: [],
  languages: [],
  countries: [],
  devices: [],
  playModes: [],
};
const NO_PICTURE = { blob: null, preview: "" };
const PART_LABELS = { genres: "a genre", platforms: "a platform", languages: "a language", countries: "a country" };

const Svg = ({ size = 16, width = 2, children }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

/** Puts the picture in the user's own folder of the `creatives` bucket. Returns { path } or { error }. */
async function upload(blob, kind, type, extension) {
  const db = browserClient();
  const { data } = await db.auth.getSession();
  const userId = data?.session?.user?.id;
  if (!userId) return { error: "Your session expired. Sign in again." };
  const path = `${userId}/game-${kind}-new-${Date.now()}.${extension}`;
  const { error } = await db.storage.from("creatives").upload(path, blob, { contentType: type, cacheControl: "31536000", upsert: false });
  return error ? { error: "The upload failed. Try again." } : { path };
}

/**
 * The "Add game" button and its pop-up. Left, the card the game will have on My games, built live from what is
 * typed; its icon and header are changed on the card itself (the picture button on the header uploads one, the
 * dots pick a colour). Right, the questionnaire: the name, the store link, and what it is
 * (genres, platforms, languages and countries are required; devices and play modes are not). Advertisers aim ads at genres,
 * platforms, languages and countries; a game that has not filled those in shows no targeted ads.
 *
 * Closing the pop-up (Cancel, the cross, Escape, a click outside) throws the draft away. It stays open while the
 * game is being saved and when saving fails, so nothing typed is lost. `gamesCount` is how many games there are
 * now: the new card's default colour follows its place in the list.
 */
export default function AddGameDialog({ gamesCount = 0 }) {
  const router = useRouter();
  const dialogRef = useRef(null);
  const nameRef = useRef(null);
  const iconFile = useRef(null);
  const coverFile = useRef(null);
  const created = useRef(null); // the game once it exists, so a retry only redoes the pictures
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [icon, setIcon] = useState(NO_PICTURE);
  const [coverPick, setCoverPick] = useState(null); // a colour id, or null for the default
  const [cover, setCover] = useState(NO_PICTURE); // an uploaded picture
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fileError, setFileError] = useState("");

  const set = (patch) => setForm((current) => ({ ...current, ...patch }));
  const complete = form.name.trim() !== "" && PROFILE_KEYS.every((key) => form[key].length > 0);
  const missing = [
    ...(form.name.trim() ? [] : ["a name"]),
    ...PROFILE_KEYS.filter((key) => form[key].length === 0).map((key) => PART_LABELS[key]),
  ];

  // The browser's own modal: it traps focus, dims the page and closes on Escape. A layout effect, so the box never
  // shows up empty for a frame while it closes.
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      nameRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Previews made with createObjectURL are let go when replaced and when the pop-up closes.
  useEffect(() => () => icon.preview && URL.revokeObjectURL(icon.preview), [icon.preview]);
  useEffect(() => () => cover.preview && URL.revokeObjectURL(cover.preview), [cover.preview]);

  function openDialog() {
    setError("");
    setOpen(true);
  }

  // Runs however the pop-up closed (button, cross, Escape, after saving): forget the draft.
  function closed() {
    const hadGame = created.current !== null;
    created.current = null;
    setOpen(false);
    setForm(EMPTY);
    setIcon(NO_PICTURE);
    setCover(NO_PICTURE);
    setCoverPick(null);
    setError("");
    setFileError("");
    if (hadGame) router.refresh();
  }

  async function chooseIcon(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setFileError("");
    if (!file.type.startsWith("image/")) return setFileError("Choose a picture (PNG, JPG or WebP) for the icon.");
    if (file.size > MAX_ICON_INPUT_BYTES) return setFileError("The icon picture is over 10 MB.");
    try {
      const blob = await squareIcon(file);
      setIcon({ blob, preview: URL.createObjectURL(blob) });
    } catch {
      setFileError("Could not read that picture.");
    }
  }

  async function chooseCover(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setFileError("");
    if (!["image/png", "image/jpeg"].includes(file.type)) return setFileError("Use a PNG or a JPG picture for the header.");
    if (file.size > COVER_MAX_BYTES) return setFileError("That picture is over 8 MB.");
    try {
      const blob = await cropToStrip(file);
      setCover({ blob, preview: URL.createObjectURL(blob) });
      } catch {
      setFileError("Could not read that picture.");
    }
  }

  // The icon and the header go up after the game exists, because their files and rows belong to its id.
  async function savePictures(gameId) {
    if (icon.blob) {
      const put = await upload(icon.blob, "icon", "image/png", "png");
      if (put.error) return put.error;
      const result = await setGameIcon({ gameId, path: put.path }).catch(() => ({ error: "Connection lost. Try again." }));
      if (result?.error) return result.error;
      setIcon(NO_PICTURE);
    }
    if (cover.blob || coverPick) {
      let result;
      if (cover.blob) {
        const put = await upload(cover.blob, "cover", "image/jpeg", "jpg");
        if (put.error) return put.error;
        result = await setGameCover({ gameId, path: put.path }).catch(() => ({ error: "Connection lost. Try again." }));
      } else {
        result = await setGameCover({ gameId, preset: coverPick }).catch(() => ({ error: "Connection lost. Try again." }));
      }
      if (result?.error) return result.error;
      setCover(NO_PICTURE);
      setCoverPick(null);
    }
    return "";
  }

  async function submit(event) {
    event.preventDefault();
    if (busy || !complete) return;
    setBusy(true);
    setError("");
    if (!created.current) {
      const result = await createGame(new FormData(event.currentTarget)).catch(() => ({ error: "Connection lost. Try again." }));
      if (result?.error || !result?.id) {
        setBusy(false);
        return setError(result?.error ?? "Could not create the game.");
      }
      created.current = result.id;
    }
    const failed = await savePictures(created.current);
    setBusy(false);
    if (failed) return setError(`The game is added, but a picture was not saved: ${failed}`);
    created.current = null;
    setOpen(false);
    router.refresh(); // the new game appears in the list behind
  }

  const defaultId = defaultCoverId(gamesCount);
  const shownColour = COVERS.find((item) => item.id === (coverPick ?? defaultId)) ?? COVERS[0];
  const coverCss = cover.preview ? `center / cover no-repeat url("${cover.preview}")` : shownColour.css;

  return (
    <>
      <button className="button mg-add" type="button" onClick={openDialog} aria-haspopup="dialog">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        Add game
      </button>
      <dialog
        ref={dialogRef}
        className="ag"
        aria-labelledby="add-game-title"
        onClose={closed}
        onCancel={(event) => {
          if (busy) event.preventDefault(); // do not drop a game that is being saved
        }}
        onClick={(event) => {
          if (event.target === dialogRef.current && !busy) dialogRef.current.close();
        }}
      >
        {open && (
          <form className="ag-form" onSubmit={submit} autoComplete="off">
            <div className="ag-head">
              <div>
                <h2 id="add-game-title">Add a game</h2>
                <p>The card on the left is how the game will look on My games. Click the icon or the picture button on the header to upload your own.</p>
              </div>
              <button className="ag-x" type="button" aria-label="Close" onClick={() => dialogRef.current?.close()} disabled={busy}>
                <Svg size={18} width={2.2}><path d="M6 6l12 12M18 6L6 18" /></Svg>
              </button>
            </div>

            <div className="ag-grid">
              <div className="ag-left">
                <div className="ag-cap">Preview</div>
                <GameCardPreview
                  form={form}
                  iconUrl={icon.preview}
                  coverCss={coverCss}
                  hasPicture={Boolean(cover.preview)}
                  colourId={coverPick ?? defaultId}
                  onColour={setCoverPick}
                  onIcon={() => iconFile.current?.click()}
                  onCover={() => coverFile.current?.click()}
                  onRemoveCover={() => setCover(NO_PICTURE)}
                  status={{ dot: "#9aa0a6", word: "#5b524a", label: "Not connected", sub: "waiting for the SDK" }}
                  disabled={busy}
                />
                {fileError && <p className="ag-err" role="alert">{fileError}</p>}
                <input ref={iconFile} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={chooseIcon} />
                <input ref={coverFile} type="file" accept="image/png,image/jpeg" hidden onChange={chooseCover} />
              </div>

              <div className="ag-right">
                <section className="ag-sec">
                  <h3>About the game</h3>
                  <div className="ag-f">
                    <label htmlFor="new-game-name">
                      Game name<i className="req" title="Required" />
                    </label>
                    <input
                      ref={nameRef}
                      id="new-game-name"
                      className="field"
                      name="name"
                      placeholder="Game name"
                      value={form.name}
                      onChange={(event) => set({ name: event.target.value })}
                      maxLength={120}
                      disabled={busy}
                      autoComplete="off"
                      required
                    />
                  </div>
                  <div className="ag-f">
                    <label htmlFor="new-game-store">Store link</label>
                    <input
                      id="new-game-store"
                      className="field"
                      name="storeUrl"
                      type="url"
                      inputMode="url"
                      placeholder="https://www.meta.com/experiences/…"
                      value={form.storeUrl}
                      onChange={(event) => set({ storeUrl: event.target.value })}
                      maxLength={300}
                      disabled={busy}
                    />
                  </div>
                </section>

                <section className="ag-sec">
                  <h3>Tell us more</h3>
                  <p className="ag-hint">
                    Advertisers aim an ad at a genre, a device, a language or a country. An ad that asks for something you have not filled in will not show in your game.
                  </p>
                  {PROFILE_KEYS.map((key) => key === "countries" ? (
                    <CountryField
                      key={key}
                      hint="Where your players live. Not the same as languages."
                      value={form.countries}
                      onChange={(next) => set({ countries: next })}
                      name="countries"
                      disabled={busy}
                      required
                    />
                  ) : (
                    <MultiPick
                      key={key}
                      label={key === "platforms" ? "Platforms" : FIELDS[key].label}
                      hint={key === "genres" ? GENRES_HINT : undefined}
                      max={key === "genres" ? MAX_GAME_GENRES : undefined}
                      options={FIELDS[key].options}
                      value={form[key]}
                      onChange={(next) => set({ [key]: next })}
                      name={key}
                      searchable={key === "languages" || key === "countries"}
                      disabled={busy}
                      required
                    />
                  ))}
                  <MultiPick
                    label={ABOUT_LISTS.devices.label}
                    options={ABOUT_LISTS.devices.options}
                    value={form.devices}
                    onChange={(next) => set({ devices: next })}
                    name="devices"
                    disabled={busy}
                  />
                  <MultiPick
                    label={ABOUT_LISTS.play_modes.label}
                    options={ABOUT_LISTS.play_modes.options}
                    value={form.playModes}
                    onChange={(next) => set({ playModes: next })}
                    name="playModes"
                    disabled={busy}
                  />
                </section>
              </div>
            </div>

            <div className="ag-foot">
              {/* here, not under the questionnaire: the buttons are always in view, the end of a long list is not */}
              {error ? (
                <p className="error" role="alert">{error}</p>
              ) : (
                !busy && <span className={`muted-line${complete ? " ok" : ""}`}>{complete ? "Ready to add." : `Still needed: ${missing.join(", ")}.`}</span>
              )}
              <button className="ag-cancel" type="button" onClick={() => dialogRef.current?.close()} disabled={busy}>
                {created.current ? "Close" : "Cancel"}
              </button>
              <button className="ag-save" type="submit" disabled={busy || !complete} aria-busy={busy}>
                {busy ? "Adding…" : created.current ? "Save pictures" : "Add game"}
              </button>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}
