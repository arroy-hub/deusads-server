import assert from "node:assert/strict";
import { PROBLEMS, figuresOf, groupTable, loadSdkPerformance, performanceFrom } from "../lib/sdk-performance.js";

// the report from the SDK is made safe: whole numbers, limits, parts never bigger than their whole
{
  const report = performanceFrom({ frames: 120.9, seconds: 2.346, slowFrames: 500, hitches: 9, worstMs: 12.34, adFrames: 60, adSeconds: 1, adSlowFrames: 5, loads: 1, loadMs: 250.57, loadMsMax: 250.57, creativeFailed: 1.5 });
  assert.equal(report.frames, 120);
  assert.equal(report.seconds, 2.35);
  assert.equal(report.slow_frames, 120, "slow frames cannot pass frames");
  assert.equal(report.hitches, 9);
  assert.equal(report.worst_ms, 12.3);
  assert.equal(report.ad_slow_frames, 5);
  assert.equal(report.load_ms, 250.6);
  assert.equal(report.creative_failed, 1);
}
assert.equal(performanceFrom(null), null);
assert.equal(performanceFrom("x"), null);
assert.equal(performanceFrom({}), null);
assert.equal(performanceFrom({ frames: 0, seconds: 0, loadMs: 500 }), null, "time of loads that did not happen is no data");
assert.deepEqual(performanceFrom({ upload_failed: 3, uploadFailed: 3 }).upload_failed, 3);
assert.equal(performanceFrom({ frames: 1, seconds: Infinity }).seconds, 0);
assert.equal(performanceFrom({ frames: 1e12 }).frames, 500000);

// every problem names a column and a field of the SDK report
assert.deepEqual(PROBLEMS.map((problem) => problem.key), ["manifest_failed", "manifest_cached", "creative_failed", "creative_invalid", "upload_failed"]);
assert.deepEqual(PROBLEMS.map((problem) => problem.field), ["manifestFailed", "manifestCached", "creativeFailed", "creativeInvalid", "uploadFailed"]);

// figures from the sums of a group of sessions
{
  const f = figuresOf({
    sessions: "4", frames: "12000", seconds: "200", slow_frames: "600", hitches: "20", worst_ms: "450",
    ad_frames: "3000", ad_seconds: "50", ad_slow_frames: "300",
    loads: "4", load_ms: "2000", load_ms_max: "900", cached_loads: "5", cached_ms: "100", manifest_loads: "2", manifest_ms: "700",
    manifest_failed: "1", creative_failed: "3", upload_failed: "0",
  });
  assert.equal(f.sessions, 4);
  assert.equal(f.fps, 60);
  assert.equal(f.slowShare, 0.05);
  assert.equal(f.hitchesPerHour, 360);
  assert.equal(f.worstMs, 450);
  assert.equal(f.withAd.fps, 60);
  assert.equal(f.withAd.slowShare, 0.1);
  assert.equal(f.withoutAd.seconds, 150);
  assert.equal(f.withoutAd.fps, 60);
  assert.equal(f.withoutAd.slowShare, 300 / 9000);
  assert.equal(f.loadAvgMs, 500);
  assert.equal(f.loadMaxMs, 900);
  assert.equal(f.cachedAvgMs, 20);
  assert.equal(f.manifestAvgMs, 350);
  assert.equal(f.problemCount, 4);
  assert.equal(f.problems.find((problem) => problem.key === "creative_failed").per100, 75);
  assert.equal(f.problems.find((problem) => problem.key === "upload_failed").count, 0);
}

// nothing yet: no figure is made up
{
  const f = figuresOf(null);
  assert.equal(f.sessions, 0);
  assert.equal(f.fps, null);
  assert.equal(f.slowShare, null);
  assert.equal(f.hitchesPerHour, null);
  assert.equal(f.loadAvgMs, null);
  assert.equal(f.withAd.fps, null);
  assert.equal(f.problemCount, 0);
  assert.equal(f.problems[0].per100, null);
}

// groups keep the order of the rows, label the platform and call a missing value Unknown
{
  const rows = [
    { value: "quest", sessions: 3, frames: 900, seconds: 10 },
    { value: null, sessions: 1, frames: 30, seconds: 1 },
  ];
  const table = groupTable(rows, "platform");
  assert.deepEqual(table.map((row) => row.label), ["Meta Quest", "Unknown"]);
  assert.equal(table[0].fps, 90);
  assert.equal(groupTable(rows, "platform", { top: 1 }).length, 1);
  assert.deepEqual(groupTable(rows, "device").map((row) => row.label), ["quest", "Unknown"]);
  assert.deepEqual(groupTable(null, "device"), []);
}

// the loader asks three times; one error means the migration is missing and the panel stays off
{
  const asked = [];
  const ok = await loadSdkPerformance(async (dimension) => {
    asked.push(dimension);
    return { data: [{ value: dimension === "all" ? "all" : "quest", sessions: 2, frames: 600, seconds: 10 }], error: null };
  });
  assert.deepEqual(asked.sort(), ["all", "device", "platform"]);
  assert.equal(ok.missing, false);
  assert.equal(ok.total.fps, 60);
  assert.equal(ok.platforms.length, 1);
  const missing = await loadSdkPerformance(async (dimension) => (dimension === "device" ? { data: null, error: { code: "PGRST202" } } : { data: [], error: null }));
  assert.equal(missing.missing, true);
  assert.equal(missing.total.sessions, 0);
}

console.log("sdk performance: all checks passed");
