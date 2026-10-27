import { NextResponse } from "next/server";
import { getMember } from "../../../../lib/admin";
import { askAssistant, rateAnswer } from "../../../../lib/support-bot";

export const dynamic = "force-dynamic";

const fail = (error, status = 400) => NextResponse.json({ error }, { status, headers: { "cache-control": "no-store" } });

/**
 * The chat with the assistant.
 *   { action: "ask", question, history: [{ role, text }] }  ->  { outcome, reply, source, escalation, logId }
 *   { action: "rate", logId, rating: "up" | "down" }        ->  { ok }
 * Admins try the assistant from the admin page, not here.
 */
export async function POST(request) {
  const body = await request.json().catch(() => null);
  if (!body) return fail("Could not read the message.");
  const me = await getMember();
  if (!me) return fail("Your session expired. Sign in again.", 401);
  if (me.role === "admin") return fail("Admins try the assistant on the Support page.", 403);
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
