const CLASS = { live: "p-active", limited: "p-paused", paused: "p-paused", stopped: "p-blocked", waiting: "p-off", scheduled: "p-off", draft: "p-off", ended: "p-ended" };

/** A campaign's status as the same tag the developer's Campaigns tab uses. */
export default function StatusPill({ status }) {
  return <span className={`cp-pill ${CLASS[status.key] ?? "p-off"}`}>{status.label}</span>;
}
