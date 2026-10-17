import assert from "node:assert/strict";
import { RETURN_DAYS, dailyPlayers, loadRetention, retentionFigures } from "../lib/retention.js";

const cohorts = [
  { cohort: "2026-10-07", players: "2", d1: "1", d7: "1", d30: "0" },
  { cohort: "2026-10-14", players: 1, d1: 1, d7: 0, d30: 0 },
  { cohort: "2026-10-16", players: 1, d1: 0, d7: 0, d30: 0 },
];

// a cohort counts for day N only once day N has happened
{
  const f = retentionFigures(cohorts, "2026-10-17");
  assert.deepEqual(RETURN_DAYS, [1, 7, 30]);
  assert.equal(f.newPlayers, 4);
  assert.deepEqual(f.d1, { players: 4, returned: 2, rate: 0.5, cohorts: 3 }, "yesterday's cohort has had its day 1");
  assert.deepEqual(f.d7, { players: 2, returned: 1, rate: 0.5, cohorts: 1 }, "only the cohort from 10 days ago has had its day 7");
  assert.deepEqual(f.d30, { players: 0, returned: 0, rate: null, cohorts: 0 }, "nobody is 30 days old: no rate is made up");
}

// the day itself is not enough: day 1 of a cohort from today has not happened
{
  const f = retentionFigures([{ cohort: "2026-10-17", players: 5, d1: 0, d7: 0, d30: 0 }], "2026-10-17");
  assert.equal(f.d1.rate, null);
  assert.equal(f.newPlayers, 5);
  const next = retentionFigures([{ cohort: "2026-10-17", players: 5, d1: 2, d7: 0, d30: 0 }], "2026-10-18");
  assert.equal(next.d1.rate, 0.4);
}

// nothing at all
{
  const f = retentionFigures([], "2026-10-17");
  assert.equal(f.newPlayers, 0);
  assert.equal(f.d1.rate, null);
  assert.equal(retentionFigures(null, "2026-10-17").d7.players, 0);
}

// players per day: every day of the window, quiet days as zeros
{
  const daily = dailyPlayers(
    [
      { day: "2026-10-07", players: "2", sessions: "3", new_players: "2" },
      { day: "2026-10-08", players: 1, sessions: 1, new_players: 0 },
    ],
    { from: "2026-10-06", to: "2026-10-09" }
  );
  assert.deepEqual(daily.days.map((day) => [day.date, day.players]), [["2026-10-06", 0], ["2026-10-07", 2], ["2026-10-08", 1], ["2026-10-09", 0]]);
  assert.equal(daily.average, 0.75, "quiet days count in the average");
  assert.deepEqual(daily.peak, { date: "2026-10-07", players: 2 });
  assert.equal(daily.sessions, 4);
  assert.equal(daily.newPlayers, 2);
  assert.equal(daily.empty, false);
  const quiet = dailyPlayers([], { from: "2026-10-06", to: "2026-10-07" });
  assert.equal(quiet.empty, true);
  assert.equal(quiet.peak, null);
  assert.equal(quiet.average, 0);
}

// a window never grows without bound
assert.ok(dailyPlayers([], { from: "2020-01-01", to: "2026-10-01" }).days.length <= 400);

// loader: an error in either call means the migration is missing
{
  const window = { from: "2026-10-06", to: "2026-10-09" };
  const ok = await loadRetention({
    callRetention: async () => ({ data: cohorts, error: null }),
    callDaily: async () => ({ data: [], error: null }),
    window,
    today: "2026-10-17",
  });
  assert.equal(ok.missing, false);
  assert.equal(ok.retention.d1.rate, 0.5);
  assert.equal(ok.daily.days.length, 4);
  const missing = await loadRetention({
    callRetention: async () => ({ data: cohorts, error: null }),
    callDaily: async () => ({ data: null, error: { code: "PGRST202" } }),
    window,
    today: "2026-10-17",
  });
  assert.equal(missing.missing, true);
  assert.equal(missing.retention.newPlayers, 0);
}

console.log("retention: all checks passed");
