import assert from "node:assert/strict";
import { reachFigures } from "../lib/reach.js";

// players, and the views that came with an install ID
assert.deepEqual(reachFigures({ impressions: "120", sessions: 40, players: 12, player_views: 96 }), {
  players: 12, sessions: 40, impressions: 120, perSession: 3, perPlayer: 8,
});

// SDKs before 0.9 send no install ID: sessions are known, players are not
const old = reachFigures({ impressions: 50, sessions: 10, players: 0, player_views: 0 });
assert.equal(old.perSession, 5);
assert.equal(old.perPlayer, null);

// nothing yet
assert.deepEqual(reachFigures(undefined), { players: 0, sessions: 0, impressions: 0, perSession: null, perPlayer: null });
assert.deepEqual(reachFigures({ impressions: null, sessions: null }).perSession, null);

// a mix of old and new rows: per player uses only what can be tied to a player
const mixed = reachFigures({ impressions: 100, sessions: 20, players: 5, player_views: 25 });
assert.equal(mixed.perPlayer, 5);
assert.equal(mixed.perSession, 5);

console.log("reach: all checks passed");
