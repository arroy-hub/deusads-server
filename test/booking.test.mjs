// Rules for campaigns and bookings (lib/booking-rules.js). Run: node test/booking.test.mjs
import assert from "node:assert/strict";
import {
  MAX_PLACEMENTS_PER_REQUEST,
  bookingErrorMessage,
  bookingLabel,
  bookingStatus,
  bookingsMissing,
  cleanCampaignName,
  cleanPlacementIds,
} from "../lib/booking-rules.js";

// both sides must approve; either rejecting ends it
assert.equal(bookingStatus("pending", "pending"), "pending");
assert.equal(bookingStatus("approved", "pending"), "pending");
assert.equal(bookingStatus("pending", "approved"), "pending");
assert.equal(bookingStatus("approved", "approved"), "approved");
assert.equal(bookingStatus("rejected", "approved"), "rejected");
assert.equal(bookingStatus("approved", "rejected"), "rejected");
assert.equal(bookingStatus("rejected", "pending"), "rejected");

// labels
const row = (status, admin_decision, developer_decision) => ({ status, admin_decision, developer_decision });
assert.equal(bookingLabel(row("approved", "approved", "approved")), "Live");
assert.equal(bookingLabel(row("rejected", "approved", "rejected")), "Rejected");
assert.equal(bookingLabel(row("cancelled", "pending", "pending")), "Cancelled");
assert.equal(bookingLabel(row("pending", "approved", "pending")), "Waiting for the developer");
assert.equal(bookingLabel(row("pending", "pending", "approved")), "Waiting for DeusADS review");
assert.equal(bookingLabel(row("pending", "pending", "pending")), "Waiting for DeusADS review and the developer");

// campaign names
assert.equal(cleanCampaignName("  Autumn push  "), "Autumn push");
assert.equal(cleanCampaignName("   "), null);
assert.equal(cleanCampaignName(undefined), null);
assert.equal(cleanCampaignName("x".repeat(300)).length, 120);

// placement ids: unique, trimmed, capped, arrays only
assert.deepEqual(cleanPlacementIds([" a ", "b", "a", "", null, undefined]), ["a", "b"]);
assert.deepEqual(cleanPlacementIds("a"), []);
assert.deepEqual(cleanPlacementIds(undefined), []);
assert.equal(cleanPlacementIds(Array.from({ length: 200 }, (_, i) => `p${i}`)).length, MAX_PLACEMENTS_PER_REQUEST);

// database errors become messages
assert.match(bookingErrorMessage({ message: "PLACEMENT_TAKEN" }), /already holds/);
assert.match(bookingErrorMessage({ message: "BOOKING_CLOSED" }), /closed/);
assert.match(bookingErrorMessage({ message: "BOOKING_NOT_FOUND" }), /no longer exists/);
assert.match(bookingErrorMessage({ message: "CREATIVE_NOT_APPROVED" }), /no longer approved/);
assert.match(bookingErrorMessage({ message: "boom" }), /Try again/);
assert.match(bookingErrorMessage(null), /Try again/);

// a missing table is recognised, other errors are not
assert.equal(bookingsMissing({ code: "42P01" }), true);
assert.equal(bookingsMissing({ code: "PGRST205" }), true);
assert.equal(bookingsMissing({ code: "23505" }), false);
assert.equal(bookingsMissing(null), false);

console.log("booking: all checks passed");
