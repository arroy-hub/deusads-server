"use client";

import { useState } from "react";
import { setNotificationPref } from "./actions";
import { sectionsFor } from "../../../lib/notification-prefs";

const Bell = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M6 17V11a6 6 0 1112 0v6l2 2H4zM10 21h4" />
  </svg>
);
const Mail = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M3 6h18v12H3zM3 7l9 7 9-7" />
  </svg>
);

/**
 * What appears under the bell, and what is also sent by email. A checkbox saves as soon as it is clicked.
 * The bell and envelope pictograms sit once, in the first section's heading row, above the two columns.
 */
export default function NotificationsTab({ view, admin, say, goSecurity }) {
  const [prefs, setPrefs] = useState(view.prefs);
  const sections = sectionsFor(view.role);

  async function toggle(type, channel, next) {
    const before = prefs[type];
    setPrefs((current) => ({ ...current, [type]: { ...current[type], [channel]: next } }));
    const result = await setNotificationPref({ accountId: admin ? view.id : undefined, type, channel, value: next }).catch(() => ({ error: "Connection lost. Try again." }));
    if (result?.error) {
      setPrefs((current) => ({ ...current, [type]: before }));
      return say(result.error);
    }
    say("Saved");
  }

  const box = (type, channel, available, label) =>
    available ? (
      <input type="checkbox" className="cb" aria-label={label} checked={Boolean(prefs[type]?.[channel])} onChange={(event) => toggle(type, channel, event.target.checked)} />
    ) : (
      <span className="na">—</span>
    );

  return (
    <div className="panel">
      <p className="settings-help" style={{ margin: "0 0 14px" }}>
        Choose what appears under the bell in the menu, and what is also sent to your email.
      </p>
      <table className="ntable">
        <colgroup>
          <col />
          <col style={{ width: 84 }} />
          <col style={{ width: 84 }} />
        </colgroup>
        <tbody>
          {sections.flatMap((section, index) => [
            <tr className="grp" key={`h-${section.title}`}>
              <td>{section.title}</td>
              <td className="c">
                {index === 0 && (
                  <span className="ic" title="In the bell">
                    <Bell />
                    <span className="sr-only">In the bell</span>
                  </span>
                )}
              </td>
              <td className="c">
                {index === 0 && (
                  <span className="ic" title="By email">
                    <Mail />
                    <span className="sr-only">By email</span>
                  </span>
                )}
              </td>
            </tr>,
            ...section.rows.map((row) => (
              <tr key={row.type}>
                <td className="what">
                  <b>{row.title}</b>
                  <span>{row.description}</span>
                </td>
                <td className="c">{box(row.type, "bell", row.hasBell, `${row.title}: in the bell`)}</td>
                <td className="c">{box(row.type, "email", row.hasEmail, `${row.title}: by email`)}</td>
              </tr>
            )),
          ])}
        </tbody>
      </table>
      <div className="nfoot">
        Emails go to <b>{view.email}</b>.
        {!admin && (
          <>
            {" "}
            To use another address, change it in{" "}
            <a href="#security" onClick={(event) => (event.preventDefault(), goSecurity())}>
              Sign-in &amp; security
            </a>
            .
          </>
        )}
      </div>
    </div>
  );
}
