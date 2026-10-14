// Visits, the SDK connection and the "since your last visit" summary. Run: node test/visits-digest.test.mjs
import assert from "node:assert/strict";
import { nextVisit, digestWanted } from "../lib/visits.js";
import { agoText, connection } from "../lib/connection.js";
import { buildDigest } from "../lib/digest.js";

const T = Date.parse("2026-10-12T12:00:00Z");
const iso = (minutesAgo) => new Date(T - minutesAgo * 60000).toISOString();

// visits
const first = nextVisit({}, T);
assert.equal(first.changed, true);
assert.equal(first.since_at, null, "nothing to compare with on a first visit");
const same = nextVisit({ visit_at: iso(20), visit_active_at: iso(2), since_at: iso(900) }, T);
assert.equal(same.changed, false);
assert.equal(same.since_at, iso(900));
const touched = nextVisit({ visit_at: iso(20), visit_active_at: iso(10), since_at: null }, T);
assert.equal(touched.changed, true);
assert.equal(touched.visit_at, iso(20), "a longer visit keeps its start");
const back = nextVisit({ visit_at: iso(600), visit_active_at: iso(500), since_at: iso(2000) }, T);
assert.equal(back.changed, true);
assert.equal(back.since_at, iso(500), "the new visit counts from the end of the previous one");
assert.equal(back.visit_at, new Date(T).toISOString());

assert.equal(digestWanted({ visit_at: iso(5), since_at: null }), false);
assert.equal(digestWanted({ visit_at: iso(5), since_at: iso(500) }), true);
assert.equal(digestWanted({ visit_at: iso(5), since_at: iso(500), digest_dismissed_at: iso(3) }), false);
assert.equal(digestWanted({ visit_at: iso(5), since_at: iso(500), digest_dismissed_at: iso(60) }), true, "dismissed in an earlier visit");

// connection
assert.equal(connection(null, T).chip, "Waiting for the SDK");
assert.equal(connection(iso(120), T).chip, "Connected · 2 h ago");
assert.equal(connection(iso(60 * 24 * 7), T).mode, "ok");
assert.equal(connection(iso(60 * 24 * 8), T).chip, "No signal for 8 days");
assert.equal(connection(iso(60 * 24 * 8), T).mode, "silent");
assert.equal(agoText(iso(0), T), "just now");
assert.equal(agoText(iso(5), T), "5 min ago");
assert.equal(agoText(iso(60 * 24), T), "1 day ago");

// digest
const since = iso(60 * 24 * 3);
const games = [{ id: "g1", name: "CASTLE" }, { id: "g2", name: "Hoops", mode: "silent", days: 9 }];
const bookings = [
  { game_id: "g1", campaign_id: "old", creative_id: "o1", created_at: iso(60 * 24 * 20) },
  { game_id: "g1", campaign_id: "old", creative_id: "o2", created_at: iso(60 * 24) },
  { game_id: "g1", campaign_id: "n1", creative_id: "x1", created_at: iso(60 * 5) },
  { game_id: "g1", campaign_id: "n2", creative_id: "x2", created_at: iso(60 * 4) },
  { game_id: "g2", campaign_id: "other", creative_id: "z", created_at: iso(60 * 24 * 40) },
];
const lines = buildDigest({
  games,
  bookings,
  placements: [{ game_id: "g1", first_seen_at: iso(60) }, { game_id: "g1", first_seen_at: iso(60 * 24 * 30) }],
  disputes: [{ creative: "Jackpot", outcome: "removed", resolved_at: iso(30) }, { creative: "Old", outcome: "dismissed", resolved_at: iso(60 * 24 * 9) }],
  since,
});
assert.equal(lines[0].text, "2 new campaigns and 1 new creative in CASTLE");
assert.equal(lines[0].href, "/dashboard/g/g1?tab=campaigns");
assert.equal(lines[1].text, "1 new placement found after Send placements in CASTLE");
assert.equal(lines[2].text, "DeusADS reviewed your report on “Jackpot”: creative removed");
assert.equal(lines.length, 3); // a quiet game is no longer announced here
assert.deepEqual(buildDigest({ games: [{ id: "g1", name: "A" }], since }), []);

console.log("visits-digest tests passed");
