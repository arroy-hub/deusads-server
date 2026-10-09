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

  // Bookings waiting for this review start (or close) now. Missing functions (no 0015) are fine.
  let started = 0;
  try {
    if (status === "approved") {
      const { data: count } = await admin.service.rpc("activate_waiting_bookings", { p_creative: data.id });
      started = Number(count) || 0;
    } else if (status === "rejected") {
      await admin.service.rpc("close_waiting_bookings", { p_creative: data.id, p_note: reviewNote });
    }
  } catch {
    // The review itself is saved; bookings are picked up by the next review or booking.
  }

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
 * Switch an account off or on. A suspended account cannot sign in to the dashboard
 * (checked in the layout) and its ads stop being served (the manifest skips its
 * creatives). Admins cannot suspend themselves or each other.
 */
export async function setSuspended({ accountId, suspended }) {
  const admin = await getAdmin();
  if (!admin) return { error: "Not allowed." };
  const id = String(accountId ?? "");
  if (id === admin.user.id) return { error: "You cannot suspend your own account." };

  const { data: target } = await admin.service.from("accounts").select("id, role").eq("id", id).maybeSingle();
  if (!target) return { error: "Unknown account." };
  if (target.role === "admin") return { error: "Admins cannot be suspended." };

  const { error } = await admin.service
    .from("accounts")
    .update({ suspended_at: suspended ? new Date().toISOString() : null })
    .eq("id", id);
  if (isSchemaOutdated(error)) return { error: "Run migration 0015 in the Supabase SQL editor first." };
  if (error) return { error: "Could not save." };

  revalidatePath("/dashboard/admin/users");
  return { ok: true, suspended: Boolean(suspended) };
}
