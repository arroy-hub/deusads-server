import { cardSummary } from "../../lib/game-about";

/**
 * The part of a game's card between its name plate and its counts: the description, up to three genre tags and
 * one line each for platforms, devices, languages and play modes. Shared by the card on My games and by the live
 * preview in the Add game pop-up, so the two cannot drift apart. `game` uses the database column names.
 */
export default function GameAboutView({ game, placeholder = false }) {
  const { tags, more, rows } = cardSummary(game);
  const description = game.description?.trim();
  return (
    <>
      {(description || placeholder) && (
        <p className={`ag-desc${description ? "" : " ph"}`}>{description || "A short line about the game shows up here."}</p>
      )}
      {(tags.length > 0 || placeholder) && (
        <div className="ag-tags">
          {tags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
          {more > 0 && <span className="more">+{more}</span>}
          {tags.length === 0 && <span className="more">Genres</span>}
        </div>
      )}
      {(placeholder || rows.some(([, text]) => text)) && (
        <div className="ag-meta">
          {rows.map(([label, text]) => (
            <div key={label}>
              <b>{label}</b>
              {text ? <span>{text}</span> : <span className="ph">—</span>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
