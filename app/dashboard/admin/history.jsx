"use client";

import { useState } from "react";
import { useCards } from "./cards";
import { Icon, Lnk } from "./ui";

/**
 * The mockup's history list (histList / histGen): a timeline of steps, the first one open; a click on a step opens its
 * details. events: [{ kind, who, text, when, bookingId?, facts: [[label, value, link?]] }]; `link` = { card, id } turns the
 * value into a link to that card. In a dispute the word "booking" in a step links to its booking.
 */
export function History({ events }) {
  const { open: openCard } = useCards();
  const [dx, setDx] = useState({});
  const isOn = (i) => (dx[i] === undefined ? i === 0 : dx[i]);
  const toggle = (i) => setDx((cur) => ({ ...cur, [i]: !isOn(i) }));

  const text = (e) => {
    if (!e.bookingId) return e.text;
    const m = /\bbooking\b/i.exec(e.text);
    if (!m) return e.text;
    return <>{e.text.slice(0, m.index)}<Lnk onClick={() => openCard("booking", e.bookingId)}>{m[0]}</Lnk>{e.text.slice(m.index + m[0].length)}</>;
  };

  return (
    <ol className="cb-hist">
      {events.map((e, i) => {
        const on = isOn(i);
        return (
          <li key={i} className={`cb-k-${e.kind}`}>
            <i />
            <div className="cb-hh" tabIndex={0} role="button" aria-expanded={on} onClick={() => toggle(i)} onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); toggle(i); } }}>
              <span><b>{e.who}</b> · {text(e)}<span className="cb-w">{e.when}</span></span>
              <span className={`cb-hc${on ? " cb-on" : ""}`}><Icon name="chev" size={14} /></span>
            </div>
            {on && (
              <dl className="cb-hx">
                {e.facts.map(([k, v, link]) => (
                  <div key={k}><dt>{k}</dt><dd>{link ? <Lnk onClick={() => openCard(link.card, link.id)}>{v}</Lnk> : v}</dd></div>
                ))}
              </dl>
            )}
          </li>
        );
      })}
    </ol>
  );
}
