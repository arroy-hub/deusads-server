"use server";

import { revalidatePath } from "next/cache";
import { getAdmin } from "../../../lib/admin";
import { isSchemaOutdated } from "../../../lib/api";
import { cleanCompany, cleanNote, newUserProblem, parseDecision, roleChangeProblem } from "../../../lib/admin-rules";
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
    type: "adv_creative_reviewed",
  });

  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/creatives");
  return { ok: true, status };
}

/** Approve or reject one extra picture of a creative (migration 0017). Only approved pictures are served. */
export async function reviewAsset({ assetId, decision, note }) {
  const admin = await getAdmin();
  if (!admin) return { error: "Not allowed." };

  const status = parseDecision(decision);
  if (!status) return { error: "Unknown decision." };

  const reviewNote = status === "rejected" ? cleanNote(note) : null;
  const { data, error } = await admin.service
    .from("creative_assets")
    .update({ status, review_note: reviewNote, reviewed_at: new Date().toISOString() })
    .eq("id", String(assetId ?? ""))
    .select("id, creative_id, format_id")
    .maybeSingle();
  if (isSchemaOutdated(error) || error?.code === "42P01") return { error: "Run migration 0017 in the Supabase SQL editor first." };
  if (error || !data) return { error: "Could not save the decision." };

  const { data: creative } = await admin.service
    .from("creatives")
    .select("name, owner_id")
    .eq("id", data.creative_id)
    .maybeSingle();
  if (creative) {
    await notify(admin.service, {
      accountId: creative.owner_id,
      text:
        status === "approved"
          ? `An image for "${creative.name}" was approved.`
          : `An image for "${creative.name}" was rejected${reviewNote ? `: ${reviewNote}` : "."}`,
      link: `/dashboard/creatives/${data.creative_id}`,
      type: "adv_creative_reviewed",
    });
  }

  revalidatePath("/dashboard/admin");
  revalidatePath(`/dashboard/creatives/${data.creative_id}`);
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

  await notify(admin.service, { accountId: data.id, text: `Your account is now ${role}.`, link: "/dashboard", type: "account_security" });

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

/**
 * Creates an account from the admin screen: the person can sign in at once with the email and the
 * password the admin chose (no confirmation email). The sign-up trigger makes the accounts row (a
 * developer, or an advertiser when asked); the role and company are then set here with the service
 * role, since users cannot edit those. Admin only.
 */
export async function createUser({ email, password, company, role }) {
  const admin = await getAdmin();
  if (!admin) return { error: "Not allowed." };

  const address = String(email ?? "").trim().toLowerCase();
  const problem = newUserProblem({ email: address, password, role });
  if (problem) return { error: problem };

  const { data, error } = await admin.service.auth.admin.createUser({
    email: address,
    password: String(password),
    email_confirm: true,
    user_metadata: { account_type: role === "advertiser" ? "advertiser" : "developer" },
  });
  if (error || !data?.user) {
    if (/already|registered|exists/i.test(error?.message ?? "")) return { error: "A user with this email already exists." };
    return { error: "Could not create the user. Try again." };
  }

  const patch = { role, ...(cleanCompany(company) ? { company: cleanCompany(company) } : {}) };
  const { error: patchError } = await admin.service.from("accounts").update(patch).eq("id", data.user.id);
  if (patchError) {
    return { error: "The user was created, but their role and company could not be set. Set them in the list." };
  }

  revalidatePath("/dashboard/admin/users");
  return { ok: true };
}

/**
 * Settle a dispute (migration 0024, extended by 0045). decision: "remove" (the creative is rejected everywhere), "pause"
 * (the booking the dispute is about stops serving, 0045) or "dismiss". `note` is the admin's note, kept on the dispute.
 * The side that opened it is told the outcome; on a removal or a pause the other side is told too.
 */
export async function resolveDispute({ disputeId, decision, note }) {
  const admin = await getAdmin();
  if (!admin) return { error: "Not allowed." };
  if (!["remove", "pause", "dismiss"].includes(decision)) return { error: "Unknown decision." };

  let read = await admin.service.from("creative_disputes").select("id, developer_id, advertiser_id, initiator, booking_id, creative_id, reason, status, game_id").eq("id", String(disputeId ?? "")).maybeSingle();
  const extended = !(isSchemaOutdated(read.error) || read.error?.code === "42703");
  if (!extended) read = await admin.service.from("creative_disputes").select("id, developer_id, creative_id, reason, status, game_id").eq("id", String(disputeId ?? "")).maybeSingle();
  const { data: dispute, error } = read;
  if (isSchemaOutdated(error) || error?.code === "42P01") return { error: "Run migration 0024 in the Supabase SQL editor first." };
  if (error || !dispute) return { error: "Report not found." };
  if (dispute.status !== "open") return { error: "This report was already settled." };
  if (decision === "pause" && !extended) return { error: "Run migration 0045 in the Supabase SQL editor to pause bookings." };

  const { data: creative } = await admin.service.from("creatives").select("id, name, owner_id").eq("id", dispute.creative_id).maybeSingle();
  const outcome = decision === "remove" ? "removed" : decision === "pause" ? "paused" : "dismissed";
  const cleanedNote = cleanNote(note) || null;

  if (decision === "remove" && creative) {
    const { error: removeError } = await admin.service
      .from("creatives")
      .update({ status: "rejected", review_note: `Removed after a report: ${dispute.reason}`.slice(0, 500), reviewed_at: new Date().toISOString() })
      .eq("id", creative.id);
    if (removeError) return { error: "Could not remove the creative." };
  }

  let paused = 0;
  if (decision === "pause") {
    let ids = dispute.booking_id ? [dispute.booking_id] : [];
    if (!ids.length) {
      const { data: placements } = await admin.service.from("placements").select("id").eq("game_id", dispute.game_id);
      const { data: found } = await admin.service.from("bookings").select("id").eq("creative_id", dispute.creative_id).eq("status", "approved").in("placement_id", (placements ?? []).map((p) => p.id));
      ids = (found ?? []).map((b) => b.id);
    }
    if (!ids.length) return { error: "No running booking to pause for this dispute." };
    for (const id of ids) {
      const { error: pauseError } = await admin.service.rpc("admin_pause_booking", { p_booking: id, p_note: cleanedNote ?? `Paused after a report: ${dispute.reason}` });
      if (pauseError) return { error: "Could not pause the booking." };
      paused += 1;
    }
  }

  const patch = { status: "resolved", outcome, resolved_by: admin.user.id, resolved_at: new Date().toISOString() };
  if (extended) patch.admin_note = cleanedNote;
  const { error: saveError } = await admin.service.from("creative_disputes").update(patch).eq("id", dispute.id).eq("status", "open");
  if (saveError) return { error: "Could not save the decision." };
  if (extended) await admin.service.from("dispute_events").insert({ dispute_id: dispute.id, author_id: admin.user.id, side: "admin", kind: "decision", text: `${outcome}${cleanedNote ? `: ${cleanedNote}` : ""}`.slice(0, 1000) });

  const name = creative?.name ?? "the creative";
  const advertiserSide = extended && dispute.initiator === "advertiser";
  const reporter = advertiserSide ? dispute.advertiser_id : dispute.developer_id;
  const other = advertiserSide ? dispute.developer_id : creative?.owner_id;
  const what = decision === "remove" ? `the creative "${name}" was removed` : decision === "pause" ? `the booking of "${name}" was paused` : `your report on "${name}" was dismissed`;
  if (reporter) await notify(admin.service, { accountId: reporter, text: `DeusADS reviewed your report: ${what}.`, link: advertiserSide ? "/dashboard/advertising" : "/dashboard/games", type: advertiserSide ? "adv_report_decided" : "dev_report_decided" });
  if (decision !== "dismiss" && other) {
    await notify(admin.service, {
      accountId: other,
      text: decision === "remove" ? `Your creative "${name}" was removed after a report: ${dispute.reason}.` : `The booking of "${name}" was paused after a report: ${dispute.reason}.`,
      link: advertiserSide ? "/dashboard/games" : "/dashboard/creatives",
      type: decision === "remove" ? "adv_creative_removed" : advertiserSide ? "dev_booking_paused" : "adv_booking_paused",
    });
  }

  revalidatePath("/dashboard/admin/disputes");
  revalidatePath("/dashboard/admin/bookings");
  revalidatePath("/dashboard/creatives");
  revalidatePath("/dashboard/games");
  return { ok: true, outcome, name, paused };
}

/** An internal note on a dispute, visible to admins only (migration 0046). */
export async function addDisputeNote({ disputeId, text }) {
  const admin = await getAdmin();
  if (!admin) return { error: "Not allowed." };
  const clean = cleanNote(text);
  if (!clean) return { error: "Write the note first." };
  const { error } = await admin.service.from("dispute_events").insert({ dispute_id: String(disputeId ?? ""), author_id: admin.user.id, side: "admin", kind: "note", text: clean });
  if (error) {
    if (error.code === "23514") return { error: "Run migration 0046 in the Supabase SQL editor first." };
    if (isSchemaOutdated(error) || error.code === "42P01") return { error: "Run migration 0045 in the Supabase SQL editor first." };
    return { error: "Could not save the note." };
  }
  revalidatePath("/dashboard/admin/disputes");
  return { ok: true };
}

/** Resume a booking an admin paused (0045). */
export async function resumeBooking({ bookingId }) {
  const admin = await getAdmin();
  if (!admin) return { error: "Not allowed." };
  const { error } = await admin.service.rpc("admin_resume_booking", { p_booking: String(bookingId ?? "") });
  if (error) return { error: "Could not resume the booking." };
  revalidatePath("/dashboard/admin/bookings");
  revalidatePath("/dashboard/admin/disputes");
  return { ok: true };
}
