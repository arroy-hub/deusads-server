// Work that must not make the SDK wait: it runs once the response has been sent.
//
// In a Vercel request Next.js keeps the function alive until `after` callbacks are done, so the player's game
// gets its answer first and the bookkeeping follows. Outside a request (tests, scripts) there is no response to
// get ahead of, so the work is simply done now. A failure never reaches the caller: this is bookkeeping.

let afterOf; // undefined: not looked up yet, null: not available here

async function lookUpAfter() {
  if (afterOf !== undefined) return afterOf;
  try {
    ({ after: afterOf = null } = await import("next/server"));
  } catch {
    afterOf = null;
  }
  return afterOf;
}

export async function afterResponse(task) {
  const run = async () => {
    try {
      await task();
    } catch (error) {
      console.error("[DeusADS] work after the response failed:", error?.message ?? error);
    }
  };

  const after = await lookUpAfter();
  if (after) {
    try {
      after(run);
      return;
    } catch {
      // `after` was called outside a request scope: fall through and do the work now.
    }
  }
  await run();
}
