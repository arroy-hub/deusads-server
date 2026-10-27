// Checking a password must never end the person's real sessions. Run: node test/password-check.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../lib/account-server.js", import.meta.url), "utf8");
const body = source.slice(source.indexOf("export async function passwordIsRight"));
assert.match(body, /signOut\(\{ scope: "local" \}\)/, "the throwaway sign-in is ended with scope local only");
assert.doesNotMatch(body, /signOut\(\)/, "a bare signOut() is global and would sign the person out everywhere");
console.log("password-check tests passed");
