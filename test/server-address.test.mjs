import assert from "node:assert/strict";
import { DASHBOARD_URL, allowedMove, sdkServerUrl } from "../lib/server-address.js";

assert.equal(DASHBOARD_URL, "https://app.deusads.com");

// Nothing set: games stay where they are.
assert.equal(sdkServerUrl({}), null);
assert.equal(sdkServerUrl({ SDK_SERVER_URL: "  " }), null);

// An address on our own domain, tidied up.
assert.equal(sdkServerUrl({ SDK_SERVER_URL: "https://api2.deusads.com/" }), "https://api2.deusads.com");
assert.equal(allowedMove("https://API.DeusAds.com"), "https://api.deusads.com");
assert.equal(allowedMove("https://deusads.com"), "https://deusads.com");

// Everything the SDK would refuse is never sent.
for (const bad of [
  "http://api.deusads.com", // not https
  "https://api.deusads.com:8443", // a port
  "https://api.deusads.com/v2", // a path
  "https://api.deusads.com/?x=1", // a query
  "https://user:pw@api.deusads.com", // credentials
  "https://deusads.com.evil.example", // another domain that starts like ours
  "https://notdeusads.com", // another domain that ends like ours
  "https://deusads-server.vercel.app", // not our domain
  "api.deusads.com", // no scheme
  "not a url",
]) {
  assert.equal(allowedMove(bad), null, bad);
}

console.log("server-address: ok");
