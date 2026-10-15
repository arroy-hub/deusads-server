// Which notifications exist per role and how a stored choice becomes a delivery. Run: node test/notification-prefs.test.mjs
import assert from "node:assert/strict";
import { ALL_TYPES, channelsOf, deliveryFor, hasChannel, isKnownType, prefProblem, resolvePrefs, sectionsFor } from "../lib/notification-prefs.js";

const titles = (role) => sectionsFor(role).map((s) => s.title);
assert.deepEqual(titles("developer"), ["Campaigns in your games", "Your reports", "Your games", "Account"]);
assert.deepEqual(titles("advertiser"), ["Your creatives", "Your campaigns", "Account"]);
assert.deepEqual(titles("admin"), ["To review", "Account"]);
assert.deepEqual(titles("nobody"), titles("developer"), "an unknown role is treated as a developer");

const rows = (role) => sectionsFor(role).flatMap((s) => s.rows.map((r) => r.type));
assert.deepEqual(rows("developer"), ["dev_campaign", "dev_withdrew", "dev_report_decided", "dev_new_placements", "dev_game_silent", "account_security", "product_news"]);
assert.deepEqual(rows("admin"), ["admin_review", "admin_reports", "account_security", "product_news"]);
assert.equal(new Set(ALL_TYPES).size, ALL_TYPES.length, "types are unique");
for (const role of ["developer", "advertiser", "admin"]) for (const type of rows(role)) assert.ok(isKnownType(type), type);

// Account and security is an ordinary row (both channels), Product news has no bell
const account = sectionsFor("advertiser").at(-1).rows;
assert.deepEqual(account.map((r) => [r.type, r.hasBell, r.hasEmail]), [["account_security", true, true], ["product_news", false, true]]);

// defaults: bell on, email off
assert.deepEqual(channelsOf(undefined), { bell: true, email: false });
assert.deepEqual(channelsOf({ email: true }), { bell: true, email: true });
assert.deepEqual(channelsOf({ bell: false }), { bell: false, email: false });
assert.deepEqual(deliveryFor("dev_campaign", undefined), { bell: true, email: false });
assert.deepEqual(deliveryFor("dev_campaign", { bell: false, email: true }), { bell: false, email: true }, "the two are independent");
assert.deepEqual(deliveryFor("product_news", { bell: true, email: true }), { bell: false, email: true }, "product news never uses the bell");
assert.deepEqual(deliveryFor(undefined, undefined), { bell: false, email: false }, "no type: nothing to deliver by choice");

const resolved = resolvePrefs("admin", [{ type: "admin_reports", bell: false, email: true }, { type: "other", bell: false, email: false }]);
assert.deepEqual(Object.keys(resolved), ["admin_review", "admin_reports", "account_security", "product_news"]);
assert.deepEqual(resolved.admin_reports, { bell: false, email: true });
assert.deepEqual(resolved.admin_review, { bell: true, email: false });

// checking a choice before storing it
assert.equal(prefProblem({ type: "dev_campaign", channel: "bell", value: true }), null);
assert.equal(prefProblem({ type: "nope", channel: "bell", value: true }), "Unknown kind of notification.");
assert.equal(prefProblem({ type: "dev_campaign", channel: "sms", value: true }), "Unknown channel.");
assert.equal(prefProblem({ type: "dev_campaign", channel: "bell", value: "yes" }), "Choose on or off.");
assert.equal(prefProblem({ type: "product_news", channel: "bell", value: true }), "That kind of notification has no such channel.");
assert.ok(hasChannel("product_news", "email"));

console.log("notification-prefs: all checks passed");
