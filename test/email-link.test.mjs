import assert from "node:assert/strict";
import { allowsReset, landingPath, readEmailLink } from "../lib/email-link.js";

const q = (text) => new URL(`https://app.deusads.com/auth/callback?${text}`).searchParams;

// Our own templates: a token and its type, checked by the dashboard itself.
let p = q("token_hash=abc123&type=recovery&next=/dashboard/account?tab=security");
assert.deepEqual(readEmailLink(p), { kind: "token", type: "recovery", tokenHash: "abc123" });
assert.equal(p.get("next"), "/dashboard/account?tab=security", "the tab survives beside the token");
assert.equal(allowsReset(readEmailLink(p), p), true, "a recovery token lets the password be set anew");

p = q("token_hash=abc123&type=email_change&next=/dashboard/account?tab=security");
assert.equal(readEmailLink(p).type, "email_change");
assert.equal(allowsReset(readEmailLink(p), p), false, "an email-change link never opens the password");
p = q("token_hash=abc123&type=email_change&reset=1");
assert.equal(allowsReset(readEmailLink(p), p), false, "reset=1 added by hand to a token link changes nothing");

// An unknown type is not passed on to Supabase.
assert.equal(readEmailLink(q("token_hash=abc123&type=whatever")), null);
assert.equal(readEmailLink(q("token_hash=&type=recovery")), null);

// Supabase's default templates: a code, as before.
p = q("code=xyz&reset=1&next=/dashboard/account?tab=security");
assert.deepEqual(readEmailLink(p), { kind: "code", code: "xyz" });
assert.equal(allowsReset(readEmailLink(p), p), true);
p = q("code=xyz");
assert.equal(allowsReset(readEmailLink(p), p), false);

// Nothing usable.
assert.equal(readEmailLink(q("next=/dashboard")), null);
assert.equal(allowsReset(null, q("reset=1")), false);

// Only paths inside the dashboard are followed.
assert.equal(landingPath("/dashboard/account?tab=security"), "/dashboard/account?tab=security");
assert.equal(landingPath("/dashboard"), "/dashboard");
assert.equal(landingPath("https://evil.example/dashboard"), "/");
assert.equal(landingPath("//evil.example"), "/");
assert.equal(landingPath("/dashboardx"), "/");
assert.equal(landingPath(null), "/");

console.log("email-link: ok");
