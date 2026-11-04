import assert from "node:assert/strict";
import { loadSeen, markSeen, unseen } from "../lib/attention-seen.js";
import { attentionItems } from "../lib/advertiser-overview.js";

// ---- signatures: stable while a number moves, new when the news changes
const gap = (labels, placements) => attentionItems({ gaps: [{ id: "c1", name: "Banner", missingLabels: labels, missingPlacements: placements }] })[0];
assert.equal(gap(["3:4", "9:16"], 40).sig, gap(["3:4", "9:16"], 41).sig, "a count that moves is not news");
assert.notEqual(gap(["3:4", "9:16"], 40).sig, gap(["3:4"], 20).sig, "another set of missing formats is");
const ending = (endsOn, today) => attentionItems({ ending: [{ id: "c2", name: "Spring", endsOn }], today })[0];
assert.equal(ending("2026-11-06", "2026-11-05").sig, ending("2026-11-06", "2026-11-06").sig, "days left ticking down is not news");
assert.notEqual(ending("2026-11-06", "2026-11-05").sig, ending("2026-11-09", "2026-11-07").sig, "a new end date is");
const all = attentionItems({
  rejected: [{ id: "r", name: "Pic", note: "blurry" }],
  disputes: [{ creativeId: "d", name: "Pic", status: "open", reason: "Misleading" }, { creativeId: "e", name: "Pic", status: "resolved", outcome: "removed", reason: "x" }],
  limited: [{ id: "l", name: "Camp", key: "limited", note: "n" }],
  gaps: [{ id: "g", name: "Gap", missingLabels: ["9:16"], missingPlacements: 3 }],
  ending: [{ id: "n", name: "End", endsOn: "2026-11-06" }],
  today: "2026-11-05",
});
assert.equal(all.length, 6);
assert.ok(all.every((item) => typeof item.sig === "string" && item.sig.startsWith(item.key) && item.sig.length <= 200), "every item has a signature that starts with its key");
assert.equal(new Set(all.map((item) => item.sig)).size, all.length, "and they are all different");

// ---- hiding what was opened
assert.equal(unseen(all, null).length, 6, "nothing remembered: all shown");
assert.equal(unseen(all, new Set()).length, 6);
const seen = new Set([all[0].sig, all[3].sig]);
assert.deepEqual(unseen(all, seen).map((item) => item.sig), [all[1].sig, all[2].sig, all[4].sig, all[5].sig]);
assert.equal(unseen([gap(["3:4"], 5)], new Set([gap(["3:4"], 9).sig])).length, 0, "same news, other number: still hidden");
assert.equal(unseen([gap(["3:4", "9:16"], 5)], new Set([gap(["3:4"], 9).sig])).length, 1, "new news: shown again");

// ---- remembering, against a small in-memory database
function memory(tables, broken = new Set()) {
  const rows = (name) => (tables[name] ??= []);
  return {
    from(name) {
      const query = (action) => {
        const filters = [];
        let limit = Infinity;
        const run = () => {
          if (broken.has(name)) return { data: null, error: { code: "42P01" } };
          const hit = rows(name).filter((item) => filters.every((test) => test(item)));
          if (action === "delete") { tables[name] = rows(name).filter((item) => !hit.includes(item)); return { data: null, error: null }; }
          return { data: hit.slice(0, limit).map((item) => ({ ...item })), error: null };
        };
        const q = {
          eq: (column, value) => (filters.push((item) => item[column] === value), q),
          lt: (column, value) => (filters.push((item) => item[column] < value), q),
          limit: (count) => ((limit = count), q),
          then: (resolve, reject) => Promise.resolve(run()).then(resolve, reject),
        };
        return q;
      };
      return {
        select: () => query("select"),
        delete: () => query("delete"),
        upsert: async (list, options) => {
          if (broken.has(name)) return { error: { code: "42P01" } };
          const keys = options.onConflict.split(",");
          for (const item of [].concat(list)) {
            const at = rows(name).findIndex((existing) => keys.every((key) => existing[key] === item[key]));
            if (at < 0) rows(name).push({ ...item }); else Object.assign(rows(name)[at], item);
          }
          return { error: null };
        },
      };
    },
  };
}

const db = memory({});
assert.deepEqual([...(await loadSeen(db, "a1"))], [], "nothing opened yet");
assert.deepEqual(await markSeen(db, "a1", [all[0].sig]), { ok: true });
assert.deepEqual(await markSeen(db, "a1", [all[0].sig]), { ok: true }, "opening it twice is fine");
await markSeen(db, "a2", [all[1].sig]);
assert.deepEqual([...(await loadSeen(db, "a1"))], [all[0].sig], "each account has its own");
assert.deepEqual(await markSeen(db, "a1", []), { error: "Nothing to mark." });
assert.deepEqual(await markSeen(db, null, ["x"]), { error: "Nothing to mark." });
await markSeen(db, "a1", ["x".repeat(500)]);
assert.ok([...(await loadSeen(db, "a1"))].every((sig) => sig.length <= 200), "a signature is cut to 200");

// rows older than 90 days are dropped when something is saved
db.from("attention_seen");
const old = memory({ attention_seen: [{ account_id: "a1", sig: "old", seen_at: new Date(Date.now() - 100 * 86400000).toISOString() }] });
await markSeen(old, "a1", ["new"]);
assert.deepEqual([...(await loadSeen(old, "a1"))], ["new"]);

// without migration 0059 nothing is remembered and nothing breaks
const missing = memory({}, new Set(["attention_seen"]));
assert.equal(await loadSeen(missing, "a1"), null);
assert.deepEqual(await markSeen(missing, "a1", ["x"]), { error: "not-migrated" });
assert.equal(unseen(all, await loadSeen(missing, "a1")).length, 6, "so the bell shows everything, as before");

console.log("attention-seen tests passed");
