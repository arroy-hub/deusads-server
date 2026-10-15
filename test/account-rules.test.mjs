// The account page's rules. Run: node test/account-rules.test.mjs
import assert from "node:assert/strict";
import {
  groupSessions, agoLabel, avatarPath, avatarProblem, checkProfile, cleanPhone, cleanWebsite, countryOptions, deleteBlocker,
  emailChangeProblem, imageKind, initials, isEmail, needsAttention, passwordProblem, runningCampaignIds, sessionLabel,
} from "../lib/account-rules.js";

// ---- profile: company is required for everyone, the rest is optional
let r = checkProfile({ company: "  Northlight   Games " }, { role: "developer" });
assert.equal(r.ok, true);
assert.equal(r.values.company, "Northlight Games");
assert.equal(r.values.contact_name, null);
assert.equal(r.values.website, null);
assert.equal(r.values.country, null);
assert.ok(!("phone" in r.values), "only an advertiser has a phone");
assert.ok(!("email" in r.values), "the owner does not edit the email here");

r = checkProfile({ company: "  " }, { role: "advertiser" });
assert.equal(r.ok, false);
assert.match(r.errors.company, /start a campaign/);
assert.match(checkProfile({ company: "" }, { role: "developer" }).errors.company, /add a game/);
assert.equal(checkProfile({ company: "" }, { role: "admin" }).errors.company, "Required.");

// an admin editing someone else: company and email are both required
r = checkProfile({ company: "X Ltd", email: "" }, { role: "developer", withEmail: true });
assert.equal(r.errors.email, "An email is required.");
r = checkProfile({ company: "X Ltd", email: "Not-An-Email" }, { role: "developer", withEmail: true });
assert.equal(r.errors.email, "Enter a valid email address.");
r = checkProfile({ company: "X Ltd", email: " Boss@Example.COM " }, { role: "developer", withEmail: true });
assert.equal(r.values.email, "boss@example.com");

// website, country, phone
assert.equal(cleanWebsite(""), "");
assert.equal(cleanWebsite("northlight.games"), "https://northlight.games");
assert.equal(cleanWebsite("http://a.io/x"), "http://a.io/x");
assert.equal(cleanWebsite("not a site"), null);
assert.equal(cleanWebsite("localhost"), null);
assert.equal(cleanWebsite("ftp://a.io"), null);
assert.equal(cleanPhone("+49 30 5555 0142"), "+49 30 5555 0142");
assert.equal(cleanPhone("12"), null);
assert.equal(cleanPhone("call me"), null);
assert.equal(cleanPhone(""), "");
assert.equal(checkProfile({ company: "A Co", country: "zz" }, { role: "developer" }).errors.country, "Choose a country from the list.");
assert.equal(checkProfile({ company: "A Co", country: "se" }, { role: "developer" }).values.country, "SE");
assert.match(checkProfile({ company: "A Co", phone: "abc" }, { role: "advertiser" }).errors.phone, /phone number/);
assert.equal(checkProfile({ company: "A Co", phone: "abc" }, { role: "developer" }).ok, true, "a developer's phone is ignored");

const countries = countryOptions();
assert.ok(countries.length > 100);
assert.ok(countries.some((c) => c.code === "SE" && c.name === "Sweden"));
assert.deepEqual(countries.map((c) => c.name), [...countries.map((c) => c.name)].sort((a, b) => a.localeCompare(b, "en")));

// ---- email and password
assert.ok(isEmail("a@b.co"));
assert.ok(!isEmail("a@b"));
assert.equal(emailChangeProblem({ email: "x", current: "a@b.co" }), "Enter a valid email address.");
assert.equal(emailChangeProblem({ email: "A@B.co", current: "a@b.co" }), "That is already your email.");
assert.equal(emailChangeProblem({ email: "new@b.co", current: "a@b.co" }), null);
assert.equal(passwordProblem({ current: "", next: "longenough", repeat: "longenough" }), "Enter your current password.");
assert.match(passwordProblem({ current: "old", next: "short", repeat: "short" }), /at least 8/);
assert.match(passwordProblem({ current: "old", next: "longenough", repeat: "different1" }), /don't match/);
assert.match(passwordProblem({ current: "samepass1", next: "samepass1", repeat: "samepass1" }), /haven't used/);
assert.equal(passwordProblem({ current: "old", next: "longenough", repeat: "longenough" }), null);
assert.equal(passwordProblem({ next: "longenough", repeat: "longenough" }, { needCurrent: false }), null, "an admin does not need the current password");

// ---- avatar
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
assert.equal(imageKind(png), "png");
assert.equal(imageKind(jpg), "jpg");
assert.equal(imageKind(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9])), null);
assert.equal(avatarProblem({ size: 0, bytes: png }), "Choose an image.");
assert.equal(avatarProblem({ size: 3 * 1024 * 1024, bytes: png }), "That image is over 2 MB.");
assert.equal(avatarProblem({ size: 100, bytes: new Uint8Array([71, 73, 70, 56, 57, 97]) }), "Use a PNG or JPG image.");
assert.equal(avatarProblem({ size: 100, bytes: jpg }), null);
assert.equal(avatarPath("abc", "png", 5), "abc/avatar-5.png");

// ---- the dot in the side menu
assert.equal(needsAttention({ company: "", pendingEmail: null }), true);
assert.equal(needsAttention({ company: "  ", pendingEmail: null }), true);
assert.equal(needsAttention({ company: "A", pendingEmail: "x@y.co" }), true);
assert.equal(needsAttention({ company: "A", pendingEmail: null }), false);

// ---- initials
assert.equal(initials({ company: "Northlight Games" }), "NG");
assert.equal(initials({ company: "", contact_name: "maria lindqvist" }), "ML");
assert.equal(initials({ email: "tom@example.com" }), "TE");
assert.equal(initials({}), "?");

// ---- deleting an account
assert.equal(deleteBlocker({ role: "developer", games: [] }), null);
assert.equal(deleteBlocker({ role: "developer", games: ["A", "B", "C"] }).message, "You still have 3 games. Remove them first.");
assert.equal(deleteBlocker({ role: "developer", games: ["A"] }).message, "You still have 1 game. Remove it first.");
assert.equal(deleteBlocker({ role: "advertiser", runningCampaigns: 2 }).message, "You still have 2 running campaigns. Stop them first.");
assert.equal(deleteBlocker({ role: "advertiser", runningCampaigns: 0 }), null);
assert.equal(deleteBlocker({ role: "admin" }).kind, "admin");
const today = "2026-10-15";
assert.deepEqual(
  [...runningCampaignIds([
    { id: "b1", campaign_id: "c1", status: "approved", starts_on: null, ends_on: null },
    { id: "b2", campaign_id: "c1", status: "approved", starts_on: "2026-10-01", ends_on: "2026-10-31" },
    { id: "b3", campaign_id: "c2", status: "approved", starts_on: "2026-10-20", ends_on: null },
    { id: "b4", campaign_id: "c3", status: "approved", starts_on: null, ends_on: "2026-10-10" },
    { id: "b5", campaign_id: "c4", status: "cancelled", starts_on: null, ends_on: null },
  ], today)],
  ["c1"]
);

// ---- sessions
assert.equal(sessionLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36"), "Chrome on Windows");
assert.equal(sessionLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1"), "Safari on iPhone");
assert.equal(sessionLabel(""), "Unknown device");
const now = Date.parse("2026-10-15T12:00:00Z");
assert.equal(agoLabel("2026-10-15T11:59:00Z", now), "now");
assert.equal(agoLabel("2026-10-15T11:30:00Z", now), "30 min ago");
assert.equal(agoLabel("2026-10-15T07:00:00Z", now), "5 h ago");
assert.equal(agoLabel("2026-10-13T12:00:00Z", now), "2 days ago");
assert.equal(agoLabel("2026-09-24T12:00:00Z", now), "3 weeks ago");
assert.equal(agoLabel("2026-07-15T12:00:00Z", now), "3 months ago");

const chrome = "Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537";
const phone = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Version/17 Safari/604";
const grouped = groupSessions([
  { id: "1", userAgent: phone, lastSeen: "2026-10-10T10:00:00Z", current: false },
  { id: "2", userAgent: chrome, lastSeen: "2026-10-14T10:00:00Z", current: false },
  { id: "3", userAgent: chrome, lastSeen: "2026-10-15T10:00:00Z", current: true },
  { id: "4", userAgent: phone, lastSeen: "2026-10-12T10:00:00Z", current: false },
]);
assert.equal(grouped.length, 2, "the same browser on the same system is one entry");
assert.deepEqual(grouped[0], { label: "Chrome on Windows", ids: ["2", "3"], lastSeen: "2026-10-15T10:00:00Z", current: true });
assert.deepEqual(grouped[1].ids, ["1", "4"]);
assert.equal(grouped[1].lastSeen, "2026-10-12T10:00:00Z");
assert.deepEqual(groupSessions(null), []);

console.log("account-rules: all checks passed");
