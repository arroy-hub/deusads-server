import assert from "node:assert/strict";
import { CONTEXT_MIN_MEASURED, CONTEXT_MIN_VIEWS, MINUTES, loadMinutes, loadScenes, minuteTable, sceneTable } from "../lib/context.js";

// minutes: always the six buckets in order, with the share of all views
{
  const t = minuteTable([
    { bucket: "m0", views: "40", measured: "30", visible_seconds: "150", engaged: "15" },
    { bucket: "m1", views: 20, measured: 20, visible_seconds: 80, engaged: 5 },
    { bucket: "m10_19", views: 30, measured: 25, visible_seconds: 50, engaged: 2 },
    { bucket: "m20", views: 10, measured: 5, visible_seconds: 10, engaged: 0 },
  ]);
  assert.deepEqual(t.rows.map((row) => row.id), MINUTES.map((minute) => minute.id), "no unknown row when every view has a session start");
  assert.equal(t.views, 100);
  assert.equal(t.rows[0].share, 0.4);
  assert.equal(t.rows[0].avgSeconds, 5);
  assert.equal(t.rows[0].engagedRate, 0.5);
  assert.equal(t.rows[2].views, 0, "a minute without views is still a row");
  assert.equal(t.rows[2].avgSeconds, null);
  assert.equal(t.rows[2].engagedRate, null);
  assert.equal(t.rows[5].thin, true, "5 measured views are too few to trust");
  assert.equal(t.rows[4].thin, false);
  assert.ok(CONTEXT_MIN_MEASURED > 5);
  assert.equal(t.empty, false);
  // early = 1st and 2nd minute: 50 measured, 230 s -> 4.6; late = after the 10th: 30 measured, 60 s -> 2
  assert.equal(t.summary.early, 230 / 50);
  assert.equal(t.summary.late, 2);
  assert.equal(t.summary.change, 2 / (230 / 50) - 1, "negative = people look less later in the session");
}

// views without a session start are shown apart, never inside a minute
{
  const t = minuteTable([
    { bucket: "m0", views: 10, measured: 10, visible_seconds: 30, engaged: 3 },
    { bucket: "unknown", views: 30, measured: 0, visible_seconds: 0, engaged: 0 },
  ]);
  assert.equal(t.rows.length, MINUTES.length + 1);
  assert.equal(t.rows.at(-1).id, "unknown");
  assert.equal(t.rows.at(-1).label, "Unknown");
  assert.equal(t.rows.at(-1).share, 0.75);
  assert.equal(t.rows[0].share, 0.25);
  assert.equal(t.summary, null, "too few measured views to compare the start with the end");
  assert.ok(CONTEXT_MIN_VIEWS >= 20);
}

// nothing yet
{
  const none = minuteTable(null);
  assert.equal(none.empty, true);
  assert.equal(none.summary, null);
  assert.equal(none.rows.length, MINUTES.length);
  assert.equal(sceneTable(undefined).empty, true);
}

// scenes: most viewed first, the unknown scene last
{
  const t = sceneTable([
    { bucket: null, views: 500, measured: 0, visible_seconds: 0, engaged: 0 },
    { bucket: "Arena", views: 100, measured: 80, visible_seconds: 400, engaged: 40 },
    { bucket: "Lobby", views: "300", measured: "200", visible_seconds: "600", engaged: "20" },
    { bucket: "", views: 5, measured: 0, visible_seconds: 0, engaged: 0 },
  ]);
  assert.deepEqual(t.rows.map((row) => row.label), ["Lobby", "Arena", "Unknown scene", "Unknown scene"], "named scenes first, by views");
  assert.equal(t.rows[0].avgSeconds, 3);
  assert.equal(t.rows[0].engagedRate, 0.1);
  assert.equal(t.rows[1].avgSeconds, 5);
  assert.equal(t.rows[2].views, 500, "the bigger unknown first");
  assert.equal(t.rows[2].known, false);
  assert.equal(t.views, 905);
  assert.equal(t.rows[0].share, 300 / 905);
}

// loaders: a database without migration 0041 switches the panels off
{
  const ok = await loadMinutes(async () => ({ data: [{ bucket: "m0", views: 3, measured: 3, visible_seconds: 9, engaged: 1 }] }));
  assert.equal(ok.missing, false);
  assert.equal(ok.views, 3);
  const missing = await loadMinutes(async () => ({ error: { code: "PGRST202" } }));
  assert.equal(missing.missing, true);
  assert.equal(missing.empty, true);
  const scenes = await loadScenes(async () => ({ data: [{ bucket: "Arena", views: 2 }] }));
  assert.equal(scenes.missing, false);
  assert.equal(scenes.rows[0].label, "Arena");
  assert.equal((await loadScenes(async () => ({ error: { code: "42883" } }))).missing, true);
}

console.log("context tests passed");
