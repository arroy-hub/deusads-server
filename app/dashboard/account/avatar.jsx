/** The round picture, or the initials until there is one. */
export default function Avatar({ url, initials, big = false }) {
  return (
    <span className={`av${big ? " big" : ""}`} style={url ? { backgroundImage: `url(${url})` } : undefined}>
      {url ? "" : initials}
    </span>
  );
}
