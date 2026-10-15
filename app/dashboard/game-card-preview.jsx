"use client";

import { useEffect, useState } from "react";
import GameIcon from "./game-icon";
import GamePreviewDetails from "./game-preview-details";
import { COVERS } from "../../lib/game-cover";

const Svg = ({ size = 16, width = 2, children }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

/**
 * The card a game has on My games, drawn live from what is being edited. Used by the Add game pop-up and by the
 * game's Settings tab, so both show the same thing. Its icon and header are changed on the card itself: the icon
 * button and the picture button on the header ask for a file (`onIcon`, `onCover`), the dots pick a colour
 * (`onColour`), and while a picture is on the header its button opens a little menu to replace or remove it
 * (`onRemoveCover`).
 *
 * `form` is { name, genres, platforms, languages, devices, playModes }. `status` is { dot, word, label, sub }.
 */
export default function GameCardPreview({
  form,
  iconUrl,
  coverCss,
  hasPicture,
  colourId,
  onColour,
  onIcon,
  onCover,
  onRemoveCover,
  status,
  placements = 0,
  campaigns = 0,
  disabled = false,
  coversReady = true,
  iconsReady = true,
}) {
  const [menu, setMenu] = useState(false);

  // The little menu on the header closes on a click anywhere else.
  useEffect(() => {
    if (!menu) return undefined;
    const away = (event) => {
      if (!event.target.closest?.("[data-cover-menu]")) setMenu(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [menu]);

  const name = form.name.trim();
  return (
    <article className="gm-card">
      <div className="gm-cover ag-cover" style={{ background: coverCss }}>
        {coversReady && !hasPicture && (
          <div className="ag-sw ag-sw-on" role="group" aria-label="Header colours">
            {COVERS.map((item) => (
              <button
                key={item.id}
                type="button"
                className="ag-swatch"
                style={{ background: item.css }}
                aria-label={item.name}
                title={item.name}
                aria-pressed={item.id === colourId}
                onClick={() => onColour(item.id)}
                disabled={disabled}
              />
            ))}
          </div>
        )}
        {coversReady && (
          <span data-cover-menu>
            <button
              type="button"
              className="ag-cover-btn"
              aria-label={hasPicture ? "Change header image" : "Upload header image"}
              title={hasPicture ? "Change header image" : "Upload header image"}
              aria-haspopup={hasPicture ? "menu" : undefined}
              aria-expanded={hasPicture ? menu : undefined}
              onClick={() => (hasPicture ? setMenu((value) => !value) : onCover())}
              disabled={disabled}
            >
              <Svg><path d="M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M9 9h.01" /></Svg>
            </button>
            {menu && (
              <div className="ag-pop" role="menu">
                <button type="button" className="it" role="menuitem" onClick={() => { setMenu(false); onCover(); }}>
                  <Svg><path d="M12 16V4M7 9l5-5 5 5M4 20h16" /></Svg>Upload another
                </button>
                <button type="button" className="it is-danger" role="menuitem" onClick={() => { setMenu(false); onRemoveCover(); }}>
                  <Svg><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></Svg>Remove picture
                </button>
              </div>
            )}
          </span>
        )}
      </div>
      <div className="gm-body">
        <div className="gm-plate">
          <span className="gm-icon">
            {iconsReady ? (
              <button type="button" className="ag-iconbtn" aria-label={iconUrl ? "Change icon" : "Add icon"} onClick={onIcon} disabled={disabled}>
                <GameIcon name={name || "?"} url={iconUrl} />
                <span className="ag-cam">
                  <Svg size={20}><path d="M4 8h3l2-3h6l2 3h3v11H4zM12 11a3.5 3.5 0 100 7 3.5 3.5 0 000-7z" /></Svg>
                </span>
              </button>
            ) : (
              <GameIcon name={name || "?"} url={iconUrl} />
            )}
            <i className="gm-status" style={{ background: status.dot }} role="img" aria-label={`SDK: ${status.label.toLowerCase()}`} />
          </span>
          <div>
            <h2 className={name ? undefined : "ag-name-empty"}>{name || "Game name"}</h2>
            <div className="gm-sub">
              <b style={{ color: status.word }}>{status.label}</b> · {status.sub}
            </div>
          </div>
        </div>
        <GamePreviewDetails form={form} />
        <div className="gm-chips">
          <span>{placements} placements</span>
          <span>{campaigns} campaigns</span>
        </div>
      </div>
    </article>
  );
}
