import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getMember } from "../../../../lib/admin";
import { LIMITS } from "../../../../lib/support-rules";
import { OUTDATED, createRequest, postMessage } from "../../../../lib/support-server";

export const dynamic = "force-dynamic";

const fail = (error, status = 400) => NextResponse.json({ error }, { status });

/**
 * Sends a new request or a message in one, with screenshots. Screenshots go through here instead of a server
 * action so their real bytes are checked on the server (PNG, JPG or WebP, up to 5 MB, up to 5 a message).
 *   multipart/form-data:
 *     action=create  type, title, text, context (JSON: Page, Browser, Role, Game, SDK), via=form|assistant
 *     action=reply   requestId, text, note=1 (admin only: an internal note)
 *     files          the screenshots
 */
export async function POST(request) {
  const form = await request.formData().catch(() => null);
  if (!form) return fail("Could not read the message.");

  const me = await getMember();
  if (!me) return fail("Your session expired. Sign in again.", 401);
  const actor = { id: me.user.id, role: me.role };

  const picked = form.getAll("files").filter((file) => file && typeof file !== "string");
  if (picked.length > LIMITS.screenshots) return fail(`Attach up to ${LIMITS.screenshots} screenshots.`);
  const files = [];
  for (const file of picked) {
    if (file.size > LIMITS.screenshotBytes) return fail("A screenshot can be up to 5 MB.");
    files.push({ bytes: new Uint8Array(await file.arrayBuffer()) });
  }

  const action = String(form.get("action") ?? "");
  let result;
  if (action === "create") {
    let context = {};
    try {
      context = JSON.parse(String(form.get("context") ?? "{}"));
    } catch {
      context = {};
    }
    result = await createRequest(me.service, {
      actor,
      type: String(form.get("type") ?? ""),
      title: String(form.get("title") ?? ""),
      text: String(form.get("text") ?? ""),
      via: String(form.get("via") ?? "form"),
      context,
      files,
    });
  } else if (action === "reply") {
    result = await postMessage(me.service, {
      actor,
      requestId: String(form.get("requestId") ?? ""),
      body: String(form.get("text") ?? ""),
      note: Boolean(form.get("note")),
      files,
    });
  } else {
    return fail("Unknown action.");
  }

  if (result.error) return fail(result.error, result.error === OUTDATED ? 409 : 400);
  revalidatePath("/dashboard", "layout");
  revalidatePath("/dashboard/support");
  revalidatePath("/dashboard/admin/support");
  return NextResponse.json(result);
}
