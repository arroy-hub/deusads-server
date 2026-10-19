import assert from "node:assert/strict";
import { disputeRows, disputeEvents, disputeWidgets, outcomeOf } from "../lib/admin-disputes.js";

const now = Date.parse("2026-10-10T12:00:00Z");
const base = { game_id: "g", developer_id: "d", advertiser_id: "a", creative_id: "c", reason: "Misleading", status: "open", created_at: "2026-10-08T12:00:00Z", byName: "Dev", againstName: "Adv", gameName: "Game", creativeName: "Can" };
const rows = disputeRows([
  base,
  { ...base, id: "2", initiator: "advertiser", byName: "Adv", againstName: "Dev", status: "resolved", outcome: "paused", resolved_at: "2026-10-09T12:00:00Z" },
  { ...base, id: "3", status: "resolved", outcome: "dismissed", resolved_at: "2026-10-08T14:00:00Z" },
], now);
assert.equal(rows[0].status, "open");
assert.equal(rows[0].age, 2);
assert.equal(rows[1].initiator, "advertiser");
assert.equal(rows[1].byId, "a");
assert.equal(rows[1].againstId, "d");
assert.equal(rows[1].hours, 24);
assert.equal(outcomeOf({ status: "resolved", outcome: null }), "dismissed");

const ev = disputeEvents(rows[1]);
assert.equal(ev.length, 2);
assert.equal(ev.at(-1).text, "Booking paused");
assert.equal(disputeEvents(rows[0]).at(-1).text, "Waiting for an admin");

const widgets = disputeWidgets(rows);
const open = widgets.find((w) => w.k === "d_open");
assert.equal(open.data.items[0].value, "1");
assert.equal(widgets.find((w) => w.k === "d_from").data.parts[1].value, 1);
console.log("admin-disputes ok");
