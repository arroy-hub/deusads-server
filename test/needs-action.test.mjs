import test from "node:test";
import assert from "node:assert/strict";
import { campaignNeeds, creativeNeeds, needsCount } from "../lib/needs-action.js";

test("a creative needs action for a change that was asked, a block and a rejection", () => {
  assert.equal(creativeNeeds({ status: "approved", holds: [] }), null);
  assert.equal(creativeNeeds({ status: "pending" }), null);
  assert.equal(creativeNeeds({ status: "approved", holds: [{ kind: "changes", sent: false, shapeLabel: "16:9" }] }).key, "changes");
  assert.match(creativeNeeds({ status: "approved", holds: [{ kind: "changes", sent: false, shapeLabel: "16:9" }] }).text, /16:9/);
  // a new picture was sent: it waits for DeusADS, not for the advertiser
  assert.equal(creativeNeeds({ status: "approved", holds: [{ kind: "changes", sent: true, shapeLabel: "16:9" }] }), null);
  assert.equal(creativeNeeds({ status: "approved", holds: [{ kind: "blocked", shapeLabel: "1:1" }] }).key, "blocked");
  assert.equal(creativeNeeds({ status: "rejected", holds: [] }).key, "rejected");
  // the one that asks for a change comes before a block
  assert.equal(creativeNeeds({ status: "approved", holds: [{ kind: "blocked" }, { kind: "changes", sent: false }] }).key, "changes");
  assert.equal(creativeNeeds({ status: "approved", hold: { kind: "changes", sent: false } }).key, "changes");
});

test("a campaign needs action for its held pictures and an empty budget", () => {
  assert.equal(campaignNeeds({ statusKey: "live", holds: [] }), null);
  assert.equal(campaignNeeds({ statusKey: "limited", holds: [] }), null);
  assert.equal(campaignNeeds({ statusKey: "stopped", holds: [] }), null);
  assert.equal(campaignNeeds({ statusKey: "budget", holds: [] }).key, "budget");
  assert.equal(campaignNeeds({ statusKey: "live", holds: [{ kind: "changes", sent: false }] }).key, "changes");
  assert.match(campaignNeeds({ statusKey: "live", holds: [{ kind: "changes", sent: false }, { kind: "changes", sent: false }] }).text, /2 pictures/);
  assert.equal(campaignNeeds({ statusKey: "live", holds: [{ kind: "changes", sent: true }] }), null);
  assert.equal(campaignNeeds({ statusKey: "live", holds: [{ kind: "blocked" }] }).key, "blocked");
  assert.equal(campaignNeeds({ statusKey: "ended", holds: [{ kind: "blocked" }] }), null);
  assert.equal(campaignNeeds({ statusKey: "draft", holds: [] }), null);
});

test("the count is the rows that carry a need", () => {
  assert.equal(needsCount([{ needs: null }, { needs: { key: "budget" } }, {}]), 1);
  assert.equal(needsCount(null), 0);
});
