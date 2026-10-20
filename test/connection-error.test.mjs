// A dropped connection is told from a real fault. Run: node test/connection-error.test.mjs
import assert from "node:assert/strict";
import { isConnectionError } from "../lib/connection-error.js";

// what each browser says when the network goes away mid-request
assert.ok(isConnectionError(new TypeError("network error")), "Chrome: the response stream broke after the network changed");
assert.ok(isConnectionError(new TypeError("Failed to fetch")), "Chrome: the request never got through");
assert.ok(isConnectionError(new TypeError("Load failed")), "Safari");
assert.ok(isConnectionError(new TypeError("NetworkError when attempting to fetch resource.")), "Firefox");
assert.ok(isConnectionError(new Error("net::ERR_NETWORK_CHANGED")));

// real faults keep their own message
assert.ok(!isConnectionError(new TypeError("Cannot read properties of undefined (reading 'map')")));
assert.ok(!isConnectionError(new Error("An error occurred in the Server Components render.")));
assert.ok(!isConnectionError(new RangeError("Invalid array length")));

// nothing to judge
assert.ok(!isConnectionError(null) && !isConnectionError(undefined) && !isConnectionError({}));

console.log("connection-error ok");
