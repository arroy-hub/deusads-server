// The creatives of a campaign started by audience (plan.creativeId, then plan.moreCreativeIds), kept apart from the
// database so they can be tested alone (test/campaign-plan.test.mjs). A campaign has one main creative from the wizard;
// the advertiser can add more later and the campaign rotates them all.

const text = (value) => (typeof value === "string" && value ? value : "");

/** Every creative id of the plan, main one first, without repeats. */
export function planCreativeIds(plan) {
  const ids = [text(plan?.creativeId), ...(Array.isArray(plan?.moreCreativeIds) ? plan.moreCreativeIds.map(text) : [])].filter(Boolean);
  return [...new Set(ids)];
}

/** The plan with more creatives in it. The first one becomes the main creative when there is none. */
export function addToPlan(plan, ids) {
  const all = [...planCreativeIds(plan), ...ids.map(text).filter(Boolean)];
  const unique = [...new Set(all)];
  const [main = "", ...more] = unique;
  return { ...(plan ?? {}), creativeId: main, moreCreativeIds: more };
}

/** The plan without one creative; the next one takes over as the main creative. */
export function removeFromPlan(plan, id) {
  const left = planCreativeIds(plan).filter((item) => item !== id);
  const [main = "", ...more] = left;
  return { ...(plan ?? {}), creativeId: main, moreCreativeIds: more };
}
