// Keeps supabase/migrations/ and lib/migrations.js in step, and checks the status
// helpers. Run: node test/migrations.test.mjs
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { MIGRATIONS, migrationStatus, schemaVerdict, unknownVersions } from "../lib/migrations.js";

const dir = new URL("../supabase/migrations/", import.meta.url);
const files = readdirSync(dir).filter((name) => name.endsWith(".sql")).sort();

// the list is the folder, in order, with consecutive numbers
assert.deepEqual(MIGRATIONS.map((m) => m.file), files, "lib/migrations.js must list every file in supabase/migrations/");
MIGRATIONS.forEach((m, index) => {
  assert.equal(m.version, String(index + 1).padStart(4, "0"), `${m.file}: versions are consecutive`);
  assert.ok(m.file.startsWith(`${m.version}_`), `${m.file}: file name starts with its version`);
  assert.ok(m.summary.length > 0, `${m.file}: has a summary`);
});

// from 0012 on every migration records itself; 0012 backfills everything before it
for (const m of MIGRATIONS.filter((item) => item.version > "0012")) {
  const sql = readFileSync(new URL(m.file, dir), "utf8");
  assert.match(sql, /insert into public\.schema_versions/i, `${m.file} must end by recording itself in schema_versions`);
  assert.ok(sql.includes(`'${m.version}'`), `${m.file} must record its own version`);
}
const backfill = readFileSync(new URL("0012_schema_versions.sql", dir), "utf8");
for (const m of MIGRATIONS.filter((item) => item.version <= "0012")) {
  assert.ok(backfill.includes(`'${m.version}', '${m.file.replace(/\.sql$/, "")}'`), `0012 backfills ${m.version}`);
}

// status helpers
const all = MIGRATIONS.map((m) => ({ version: m.version, applied_at: "2026-10-09T00:00:00Z" }));
assert.ok(migrationStatus(all).every((item) => item.state === "applied"));
assert.deepEqual(schemaVerdict(all), { ok: true, text: "Database matches the code" });

const behind = all.filter((row) => row.version !== "0010" && row.version !== "0011");
assert.deepEqual(migrationStatus(behind).filter((item) => item.state === "missing").map((item) => item.version), ["0010", "0011"]);
assert.match(schemaVerdict(behind).text, /2 migrations not applied: 0010, 0011/);
const last = MIGRATIONS.at(-1).version;
assert.match(schemaVerdict(all.slice(0, -1)).text, new RegExp(`1 migration not applied: ${last}`));

assert.ok(migrationStatus(null).every((item) => item.state === "unknown"));
assert.equal(schemaVerdict(null).ok, false);
assert.match(schemaVerdict(null).text, /0012/);

assert.deepEqual(unknownVersions([...all, { version: "0099" }]), ["0099"]);
assert.deepEqual(unknownVersions(all), []);
assert.deepEqual(unknownVersions(null), []);

console.log("migrations: all checks passed");
