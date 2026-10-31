import { NextResponse } from "next/server";
import { getMember } from "../../../../lib/admin";
import { askAssistant, rateAnswer } from "../../../../lib/support-bot";

export const dynamic = "force-dynamic";

const fail = (error, status = 400) => NextResponse.json({ error }, { status, headers: { "cache-control": "no-store" } });

/**
 * The chat with the assistant.
 *   { action: "ask", question, history: [{ role, text }] }  ->  { outcome, reply, source, escalation, logId }
 *   { action: "rate", logId, rating: "up" | "down" }        ->  { ok }
 * Everyone signed in may ask, an admin included (the admin's chat is the same one, without the hand-over to the developer).
 * Trying unsaved settings stays on the admin's Support page.
 */
export async function POST(request) {
  const body = await request.json().catch(() => null);
  if (!body) return fail("Could not read the message.");
  const me = await getMember();
  if (!me) return fail("Your session expired. Sign in again.", 401);
  const actor = { id: me.user.id, role: me.role };

  if (body.action === "rate") {
    const result = await rateAnswer(me.service, { actor, logId: body.logId, rating: body.rating });
    return result.error ? fail(result.error) : NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  }
  if (body.action === "ask") {
    const result = await askAssistant(me.service, { actor, question: body.question, history: body.history });
    if (result.error) return fail(result.error, result.error.includes("0052") ? 409 : 400);
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  }
  return fail("Unknown action.");
}
