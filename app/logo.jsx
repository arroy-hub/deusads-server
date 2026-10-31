import { LOGO_PATHS, LOGO_VIEWBOX } from "../lib/logo";

/** The DeusADS logo; it takes the colour of the text around it (currentColor). */
export default function Logo({ label = "DeusADS" }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={LOGO_VIEWBOX} role="img" aria-label={label}>
      {LOGO_PATHS.map((d, i) => (
        <path key={i} fill="currentColor" d={d} />
      ))}
    </svg>
  );
}
