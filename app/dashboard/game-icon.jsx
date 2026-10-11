/**
 * A game's icon: its picture, or until it has one the first letter of its name. Only shows it;
 * changing it is done on the game's Settings tab.
 */
export default function GameIcon({ name, url, size = "md" }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img className={`game-icon is-${size}`} src={url} alt="" width="56" height="56" />
  ) : (
    <span className={`game-icon is-${size} is-empty`} aria-hidden="true">
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}
