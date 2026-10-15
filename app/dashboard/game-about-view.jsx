import { genreTags } from "../../lib/game-about";

/**
 * The genre tags on a game's card: up to three, then "+N". Shared by the card on My games and by the live preview
 * in the Add game pop-up, so the two cannot drift apart. `genres` is a list of ids; with `placeholder` an empty
 * list still shows a dashed "Genres" tag.
 */
export default function GameGenres({ genres, placeholder = false }) {
  const { tags, more } = genreTags(genres);
  if (tags.length === 0 && !placeholder) return null;
  return (
    <div className="ag-tags">
      {tags.map((tag) => (
        <span key={tag}>{tag}</span>
      ))}
      {more > 0 && <span className="more">+{more}</span>}
      {tags.length === 0 && <span className="more">Genres</span>}
    </div>
  );
}
