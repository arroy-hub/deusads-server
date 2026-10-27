import { NextResponse } from "next/server";
import { getMember } from "../../../../lib/admin";
import { loadAdminConversation, loadConversation } from "../../../../lib/support-data";

export const dynamic = "force-dynamic";

/** One conversation for the open pop-up (and its polling): a person's own, or any of them for an admin (with internal notes). `?id=<request id>`. */
export async function GET(request) {
  const me = await getMember();
  if (!me) return NextResponse.json({ error: "Your session expired. Sign in again." }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  const conversation = me.role === "admin" ? await loadAdminConversation(me.service, id) : await loadConversation(me.service, me.user.id, id);
  if (!conversation) return NextResponse.json({ error: "Request not found." }, { status: 404 });
  return NextResponse.json(conversation, { headers: { "Cache-Control": "no-store" } });
}
