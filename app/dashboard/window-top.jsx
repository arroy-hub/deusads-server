// The header every dashboard window shares: a warm cover with a white plate on it (icon tile, title, one line under
// it), actions on the right, and the tabs underneath like browser tabs. Pass the tabs as children.
// Server-safe on purpose (no hooks), so server pages and client views can both use it.

const COVER = "linear-gradient(105deg, #5a2a1e 0%, #a2432a 38%, #d9744f 70%, #f0b293 100%)";

/** A 24px stroked icon for the plate. `d` is an SVG path. */
export function PlateIcon({ d }) {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export default function WindowTop({ title, titleExtra = null, sub = null, icon, actions = null, children = null }) {
  return (
    <div className="gp-top gp-top-card wt-top">
      <div className="gp-cover"><div className="gp-pic" style={{ background: COVER }} /></div>
      <div className="gp-plate-row">
        <div className="gm-plate gp-plate">
          <span className="gm-icon"><span className="wt-ic">{icon}</span></span>
          <div>
            <h1>{title}{titleExtra}</h1>
            {sub ? <div className="gm-sub">{sub}</div> : null}
          </div>
        </div>
        {actions ? <div className="wt-act">{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}

// Paths for the plate icons.
export const PLATE_PATHS = {
  home: "M4 11l8-7 8 7v9H4z",
  user: "M12 11a4 4 0 100-8 4 4 0 000 8zM4 21c.6-4 3.8-6 8-6s7.4 2 8 6",
  games: "M3 7h18v11H3zM8 11v3M6.5 12.5h3M15.5 11.5h.01M17.5 13.5h.01",
  chart: "M4 20V10M10 20V4M16 20v-8M22 20H2",
  flag: "M5 21V4m0 0h11l-2 4 2 4H5",
  image: "M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M9 9h.01",
  check: "M5 12.5l4.5 4.5L19 7.5",
  warn: "M12 3.5l9.5 16.5h-19zM12 10v4.5M12 17.5v.1",
  book: "M4 7h16v13H4zM4 11h16M9 3v4M15 3v4",
  users: "M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2.5 20c.5-3.6 3.2-5.5 6.5-5.5s6 1.9 6.5 5.5M16 4.7a3.5 3.5 0 010 6.6M18 14.8c2 .6 3.3 2.3 3.5 5.2",
  pulse: "M3 12h4l2.5-6 4 12 2.5-6H21",
  db: "M4.5 6c0-1.7 3.4-3 7.5-3s7.5 1.3 7.5 3-3.4 3-7.5 3-7.5-1.3-7.5-3zM4.5 6v12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3",
};
