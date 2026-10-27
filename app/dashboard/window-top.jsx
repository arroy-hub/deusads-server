// The header every dashboard window shares: a warm cover with a white plate on it (icon tile, title, one line under
// it), actions on the right, and the tabs underneath like browser tabs. Pass the tabs as children.
// Server-safe on purpose (no hooks), so server pages and client views can both use it.

import { NAV_ICONS } from "../../lib/nav-icons";

const COVER = "linear-gradient(105deg, #b8b8b8 0%, #cdcdcd 40%, #e4e4e4 100%)";

/** The plate icon: the menu pictogram of the same key (see lib/nav-icons.js), so header and menu always match. */
export function PlateIcon({ name }) {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={NAV_ICONS[name]} />
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
