import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { isSchemaOutdated } from "../../../../lib/api";
import { resolveActor } from "../../../../lib/account-server";
import { avatarUrlOf, loadAccountRow } from "../../../../lib/account-data";
import { avatarPath, avatarProblem, imageKind } from "../../../../lib/account-rules";

export const dynamic = "force-dynamic";

const fail = (error, status = 400) => NextResponse.json({ error }, { status });

/**
 * Sets or removes the avatar of the caller's account (an admin may name another one). The picture goes
 * through here instead of straight to Storage so its real bytes are checked (PNG or JPG, up to 2 MB) and
 * so an admin can set someone else's. It is stored in the owner's own folder of the creatives bucket.
 *   multipart/form-data: file (the image) or remove=1; accountId (admin only).
 */
export async function POST(request) {
  const form = await request.formData().catch(() => null);
  if (!form) return fail("Could not read the upload.");

  const who = await resolveActor(String(form.get("accountId") ?? "") || null);
  if (who.error) return fail(who.error, 403);
  const { me, id } = who;

  const { row, outdated } = await loadAccountRow(me.service, id);
  if (!row) return fail("Unknown account.", 404);
  if (outdated) return fail("The database needs update 0030 first. Ask an admin to run it.", 409);

  const bucket = me.service.storage.from("creatives");
  const finish = async (path) => {
    const { error } = await me.service.from("accounts").update({ avatar_path: path }).eq("id", id);
    if (error) return { error };
    if (row.avatar_path && row.avatar_path !== path) await bucket.remove([row.avatar_path]).catch(() => null);
    revalidatePath("/dashboard", "layout");
    revalidatePath("/dashboard/account");
    revalidatePath(`/dashboard/admin/users/${id}`);
    return {};
  };

  if (form.get("remove")) {
    const { error } = await finish(null);
    if (error) return fail("Could not remove the picture.", 500);
    return NextResponse.json({ ok: true, url: null });
  }

  const file = form.get("file");
  if (!file || typeof file === "string") return fail("Choose an image.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const problem = avatarProblem({ size: bytes.length, bytes });
  if (problem) return fail(problem);

  const kind = imageKind(bytes);
  const path = avatarPath(id, kind);
  const { error: uploadError } = await bucket.upload(path, bytes, { contentType: kind === "png" ? "image/png" : "image/jpeg", upsert: false });
  if (uploadError) return fail("Could not store the picture. Try again.", 500);

  const { error } = await finish(path);
  if (error) {
    await bucket.remove([path]).catch(() => null);
    return fail(isSchemaOutdated(error) ? "The database needs update 0030 first. Ask an admin to run it." : "Could not save the picture.", 500);
  }
  return NextResponse.json({ ok: true, url: avatarUrlOf(me.service, path) });
}
