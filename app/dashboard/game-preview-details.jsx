import { genreTags, previewRows } from "../../lib/game-about";

/**
 * What the preview card in the Add game pop-up lists under the name plate: up to three genre tags, then one line each
 * for platforms, devices, languages and play modes (a dash while empty). Only the pop-up shows these; the cards on
 * My games carry just the name, the connection and the counts.
 */
export default function GamePreviewDetails({ form }) {
  const { tags, more } = genreTags(form.genres);
  return (
    <>
      <div className="ag-tags">
        {tags.map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
        {more > 0 && <span className="more">+{more}</span>}
        {tags.length === 0 && <span className="more">Genres</span>}
      </div>
      <div className="ag-meta">
        {previewRows(form).map(([label, text]) => (
          <div key={label}>
            <b>{label}</b>
            {text ? <span>{text}</span> : <span className="ph">—</span>}
          </div>
        ))}
      </div>
    </>
  );
}
