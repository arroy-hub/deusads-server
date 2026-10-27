// The cards shown on hover over a face. Run: node test/support-people.test.mjs
import assert from "node:assert/strict";
import { personCard } from "../lib/support-people.js";

const countries = [{ code: "NL", name: "Netherlands" }];
const dev = personCard({ id: "a", role: "developer", company: "Pixel Studio", contact_name: "Ann", email: "ann@x.io", country: "NL" }, { avatarUrl: "https://img/a.png", countries });
assert.deepEqual(dev, { id: "a", name: "Pixel Studio", role: "Developer", country: "Netherlands", avatarUrl: "https://img/a.png", initials: "PS" });
assert.equal(personCard({ id: "b", role: "advertiser", company: "", contact_name: "Bo", email: "bo@x.io" }).name, "Bo");
const team = personCard({ id: "c", role: "admin", company: "", email: "boss@deusads.com" });
assert.equal(team.name, "DeusADS team");
assert.equal(team.role, "DeusADS team");
assert.ok(!JSON.stringify(team).includes("boss@"), "an email never goes into a card");
assert.equal(personCard({ id: "d", role: "developer", company: "", email: "z@z.io" }).name, "");
console.log("support-people tests passed");
