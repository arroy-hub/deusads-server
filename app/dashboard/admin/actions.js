"use server";

import { revalidatePath } from "next/cache";
import { getAdmin } from "../../../lib/admin";
import { isSchemaOutdated } from "../../../lib/api";
import { cleanNote, parseDecision, roleChangeProblem } from "../../../lib/admin-rules";
import { notify } from "../../../lib/notify";

// Every action here re-checks that the caller is an admin: a server action is a
// public endpoint, so hiding the page is not protection.

export async function reviewCreative({ creativeId, decision, note }) {
  const admin = await getAdmin();
  if (!admin) return { error: "Not allowed." };

  const status = parseDecision(decision);
  if (!status) return { error: "Unknown decision." };

  const reviewNote = status === "rejected" ? cleanNote(note) : null;
  const { data, error } = await admin.service
    .from("creatives")
    .update({
      status,
      review_note: reviewNote,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", String(creativeId ?? ""))
    .select("id, name, owner_id")
    .maybeSingle();

  if (isSchemaOutdated(error)) return { error: "Run migration 0008 in the Supabase SQL editor first." };
  if (error || !data) return { error: "Could not save the decision." };

  await notify(admin.service, {
    accountId: data.owner_id,
    text:
      status === "approved"
        ? `Your creative "${data.name}" was approved.`
        : `Your creative "${data.name}" was rejected${reviewNote ? `: ${reviewNote}` : "."}`,
    link: "/dashboard/creatives",
  });

  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/creatives");
  return { ok: true, status };
}

export async function setAccountRole({ accountId, role }) {
  const admin = await getAdmin();
  if (!admin) return { error: "Not allowed." };

  const problem = roleChangeProblem({ actorId: admin.user.id, targetId: String(accountId ?? ""), role });
  if (problem) return { error: problem };

  const { data, error } = await admin.service
    .from("accounts")
    .update({ role })
    .eq("id", String(accountId))
    .select("id")
    .maybeSingle();
  if (error || !data) return { error: "Could not change the role." };

  await notify(admin.service, { accountId: data.id, text: `Your account is now ${role}.`, link: "/dashboard" });

  revalidatePath("/dashboard/admin/users");
  return { ok: true, role };
}

/**
 * Approve or reject an advertiser application. The database function does the
 * change in one transaction: approving sets the account's role (developers only)
 * and company, and the applicant is told either way.
 */
export async function decideApplication({ requestId, decision, note }) {
  const admin = await getAdmin();
  if (!admin) return { error: "Not allowed." };

  const verdict = parseDecision(decision);
  if (!verdict) return { error: "Unknown decision." };

  const id = String(requestId ?? "");
  const { data: request } = await admin.service
    .from("role_requests")
    .select("account_id")
    .eq("id", id)
    .maybeSingle();

  const reviewNote = verdict === "rejected" ? cleanNote(note) : null;
  const { error } = await admin.service.rpc("decide_role_request", {
    p_request: id,
    p_decision: verdict,
    p_note: reviewNote,
  });
  if (error) {
    if (String(error.message).includes("REQUEST_CLOSED")) return { error: "This application was already decided." };
    if (String(error.message).includes("REQUEST_NOT_FOUND")) return { error: "This application no longer exists." };
    return { error: "Could not save the decision." };
  }

  await notify(admin.service, {
    accountId: request?.account_id,
    text:
      verdict === "approved"
        ? "Your advertiser application was approved. You can now book placements."
        : `Your advertiser application was rejected${reviewNote ? `: ${reviewNote}` : "."}`,
    link: verdict === "approved" ? "/dashboard/advertising" : "/dashboard/become-advertiser",
  });

  revalidatePath("/dashboard/admin/applications");
  revalidatePath("/dashboard", "layout");
  return { ok: true, status: verdict };
}
