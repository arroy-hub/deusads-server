import assert from "node:assert/strict";
import { EXPOSURES, FATIGUE_MIN_VIEWS, FREQUENCY_BUCKETS, fatigueTable, frequencyTable, loadFatigue, loadFrequency } from "../lib/frequency.js";

// frequency: players by number of ads seen; views without a player ID are apart
{
  const t = frequencyTable([
    { bucket: "v1", players: "2", views: "2" },
    { bucket: "v2", players: 1, views: 2 },
    { bucket: "v4_5", players: 1, views: 5 },
    { bucket: "untracked", players: 0, views: 3 },
  ]);
  assert.equal(t.players, 4);
  assert.equal(t.views, 9);
  assert.equal(t.untracked, 3);
  assert.equal(t.avgFrequency, 2.25);
  assert.equal(t.repeatShare, 0.5, "players with 2 or more ads");
  assert.deepEqual(t.buckets.map((bucket) => bucket.id), FREQUENCY_BUCKETS.map((bucket) => bucket.id), "always the same buckets, in order");
  assert.equal(t.buckets[0].share, 0.5);
  assert.equal(t.buckets[2].players, 0);
  assert.equal(t.empty, false);
}

// nothing yet, or only views without a player ID: no figure per player is made up
{
  const none = frequencyTable(null);
  assert.equal(none.empty, true);
  assert.equal(none.avgFrequency, null);
  assert.equal(none.repeatShare, null);
  const blind = frequencyTable([{ bucket: "untracked", players: 0, views: 4 }]);
  assert.equal(blind.empty, false);
  assert.equal(blind.avgFrequency, null);
  assert.equal(blind.untracked, 4);
}

// fatigue: attention at each repeat of the same creative
{
  const t = fatigueTable([
    { exposure: "e1", views: 100, measured: 80, visible_seconds: 400, engaged: 40 },
    { exposure: "e2", views: 50, measured: 40, visible_seconds: 160, engaged: 12 },
    { exposure: "e3", views: 20, measured: 20, visible_seconds: 60, engaged: 4 },
    { exposure: "e4_5", views: 30, measured: 30, visible_seconds: 75, engaged: 3 },
    { exposure: "e6", views: 10, measured: 5, visible_seconds: 10, engaged: 0 },
  ]);
  assert.deepEqual(t.steps.map((step) => step.id), EXPOSURES.map((step) => step.id));
  assert.equal(t.steps[0].avgSeconds, 5);
  assert.equal(t.steps[0].engagedRate, 0.5);
  assert.equal(t.steps[1].avgSeconds, 4);
  assert.equal(t.summary.firstSeconds, 5);
  assert.equal(t.summary.laterSeconds, 145 / 55);
  assert.equal(t.summary.change, 145 / 55 / 5 - 1, "3rd time and later against the 1st");
  assert.equal(t.summary.laterEngaged, 7 / 55);
  assert.equal(t.empty, false);
}

// too little to compare: no verdict
{
  const few = fatigueTable([
    { exposure: "e1", views: 50, measured: FATIGUE_MIN_VIEWS - 1, visible_seconds: 80, engaged: 5 },
    { exposure: "e3", views: 50, measured: 50, visible_seconds: 100, engaged: 5 },
  ]);
  assert.equal(few.summary, null);
  const noLater = fatigueTable([{ exposure: "e1", views: 50, measured: 50, visible_seconds: 100, engaged: 5 }]);
  assert.equal(noLater.summary, null);
  assert.equal(noLater.steps[1].avgSeconds, null, "a step with no views has no average");
  assert.equal(fatigueTable([]).empty, true);
}

// views whose length was not measured (before SDK 0.11) count as views, never in the average
{
  const t = fatigueTable([{ exposure: "e1", views: 10, measured: 0, visible_seconds: 0, engaged: 0 }]);
  assert.equal(t.steps[0].views, 10);
  assert.equal(t.steps[0].avgSeconds, null);
  assert.equal(t.steps[0].engagedRate, null);
}

// loaders: an error means the migration is missing and the panel stays off
{
  const missing = await loadFrequency(async () => ({ data: null, error: { code: "PGRST202" } }));
  assert.equal(missing.missing, true);
  assert.equal(missing.empty, true);
  const ok = await loadFrequency(async () => ({ data: [{ bucket: "v1", players: 1, views: 1 }], error: null }));
  assert.equal(ok.missing, false);
  assert.equal(ok.players, 1);
  const fatigueMissing = await loadFatigue(async () => ({ data: null, error: { code: "42883" } }));
  assert.equal(fatigueMissing.missing, true);
  const fatigueOk = await loadFatigue(async () => ({ data: [{ exposure: "e1", views: 3, measured: 0, visible_seconds: 0, engaged: 0 }], error: null }));
  assert.equal(fatigueOk.missing, false);
  assert.equal(fatigueOk.empty, false);
}

console.log("frequency: all checks passed");
