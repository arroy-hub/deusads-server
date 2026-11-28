"use server";
import { DECISIONS, NEUTRAL_BLOCK_REASON, OUTCOME_OF, PENDING_BLOCK_REASON, needsRule } from "../../../lib/report-rules";
import { isAdvertiserRule } from "../../../lib/platform-rules";
import { shapeAspect, shapeKey, shapeLabel } from "../../../lib/game-pictures";
import { aspectClose } from "../../../lib/formats";

import { revalidatePath } from "next/cache";
import { getAdmin } from "../../../lib/admin";
import { isSchemaOutdated } from "../../../lib/api";
import { cleanCompany, cleanNote, newUserProblem, parseDecision, roleChangeProblem } from "../../../lib/admin-rules";
import { notify } from "../../../lib/notify";
import { reporterOf } from "../../../lib/creative-reports";

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

  // A creative DeusADS held for changes (migration 0064): an approved new version runs again and the hold is over;
  // a rejected one keeps waiting, with the new note as the message. Missing columns (no 0064) are fine.
  let wasHeld = false;
  try {
    const { data: held } = await admin.service.from("creatives").select("hold").eq("id", data.id).maybeSingle();
    wasHeld = held?.hold === "changes";
    if (wasHeld && status === "approved") await admin.service.from("creatives").update({ hold: null, hold_rule: null, hold_note: null, hold_at: null, hold_dispute: null, hold_sent_at: null, signal_notified_at: null }).eq("id", data.id);
    if (wasHeld && status === "rejected") await admin.service.from("creatives").update({ hold_sent_at: null, hold_at: new Date().toISOString(), ...(reviewNote ? { hold_note: reviewNote } : {}) }).eq("id", data.id);
  } catch {
    // the review itself is saved
  }

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
        ? wasHeld ? `"${data.name}": new version approved. It runs again.` : `"${data.name}" approved.`
        : wasHeld ? `"${data.name}": new version not approved${reviewNote ? `: ${reviewNote}` : "."}` : `"${data.name}" rejected${reviewNote ? `: ${reviewNote}` : "."}`,
    link: wasHeld ? `/dashboard/creatives/${data.id}` : "/dashboard/creatives",
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
    .select("id, creative_id, format_id, aspect")
    .maybeSingle();
  if (isSchemaOutdated(error) || error?.code === "42P01") return { error: "Run migration 0017 in the Supabase SQL editor first." };
  if (error || !data) return { error: "Could not save the decision." };

  // A new picture for a shape DeusADS asked to change (migration 0065): approved, the shape runs again; rejected, it keeps waiting.
  let shape = data.format_id ?? shapeKey(Number(data.aspect));
  let wasHeld = false;
  let heldDispute = null;
  try {
    // the held shape this picture was sent for: its own shape, or (a shape that is no standard format) the one it is close to
    const { data: holds } = await admin.service.from("creative_picture_holds").select("shape, kind, sent_at, dispute_id").eq("creative_id", data.creative_id).eq("kind", "changes");
    const hold = (holds ?? []).find((row) => row.shape === shape) ?? (data.format_id ? null : (holds ?? []).find((row) => row.sent_at && shapeAspect(row.shape) && aspectClose(Number(data.aspect), shapeAspect(row.shape))));
    if (hold) shape = hold.shape;
    wasHeld = Boolean(hold);
    heldDispute = hold?.dispute_id ?? null;
    if (wasHeld && status === "approved") await admin.service.from("creative_picture_holds").delete().eq("creative_id", data.creative_id).eq("shape", shape);
    // not approved: the shape keeps waiting, and the advertiser reads why in the conversation under the decision
    if (wasHeld && status === "rejected") await admin.service.from("creative_picture_holds").update({ sent_at: null }).eq("creative_id", data.creative_id).eq("shape", shape);
    if (wasHeld && hold.dispute_id) {
      await admin.service.from("dispute_events").insert({ dispute_id: hold.dispute_id, author_id: admin.user.id, side: "admin", kind: "decision", text: `picture: ${status}${reviewNote ? `: ${reviewNote}` : ""}`.slice(0, 1000) });
      if (status === "rejected") await admin.service.from("dispute_events").insert({ dispute_id: hold.dispute_id, author_id: admin.user.id, side: "admin", kind: "reply", text: `The new picture was not approved${reviewNote ? `: ${reviewNote}` : "."}`.slice(0, 1000) });
    }
  } catch {
    // the review itself is saved
  }

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
          ? wasHeld ? `"${creative.name}": new ${shapeLabel(shape)} picture approved. It runs again.` : `"${creative.name}": ${shapeLabel(shape)} picture approved.`
          : wasHeld ? `"${creative.name}": new ${shapeLabel(shape)} picture not approved${reviewNote ? `: ${reviewNote}` : "."} Upload another.` : `"${creative.name}": ${shapeLabel(shape)} picture rejected${reviewNote ? `: ${reviewNote}` : "."}`,
      link: `/dashboard/creatives/${data.creative_id}`,
      type: "adv_creative_reviewed",
    });
  }

  // The developer whose report started it follows every step: the new picture is in, or the advertiser has to try again.
  if (heldDispute && creative) {
    const reporter = await reporterOf(admin.service, heldDispute).catch(() => null);
    if (reporter) {
      await notify(admin.service, {
        accountId: reporter,
        text: status === "approved"
          ? `Your report on "${creative.name}": the picture was replaced. Showing the new one in your game is up to you.`
          : `Your report on "${creative.name}": the new picture was not approved. The advertiser must send another.`,
        link: `/dashboard/support?tab=requests&report=${heldDispute}`,
        type: "dev_report_decided",
      });
    }
  }

  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/admin/disputes");
  revalidatePath("/dashboard/advertising");
  revalidatePath("/dashboard/support");
  revalidatePath("/dashboard/games");
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

  await notify(admin.service, { accountId: data.id, text: `Your role is now ${role}.`, link: "/dashboard", type: "account_security" });

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
export async function resolveDispute({ disputeId, decision, note, rule, advNote, devNote }) {
  const admin = await getAdmin();
  if (!admin) return { error: "Not allowed." };
  if (!DECISIONS.includes(decision)) return { error: "Unknown decision." };

  let read = await admin.service.from("creative_disputes").select("*").eq("id", String(disputeId ?? "")).maybeSingle();
  const extended = !(isSchemaOutdated(read.error) || read.error?.code === "42703");
  if (!extended) read = await admin.service.from("creative_disputes").select("id, developer_id, creative_id, reason, status, game_id").eq("id", String(disputeId ?? "")).maybeSingle();
  const { data: dispute, error } = read;
  if (isSchemaOutdated(error) || error?.code === "42P01") return { error: "Run migration 0024 in the Supabase SQL editor first." };
  if (error || !dispute) return { error: "Report not found." };
  if (dispute.status !== "open") return { error: "This report was already settled." };
  if (decision === "pause" && !extended) return { error: "Run migration 0045 in the Supabase SQL editor to pause bookings." };
  const advertiserSide = extended && dispute.initiator === "advertiser";
  if (advertiserSide ? !["pause", "dismiss"].includes(decision) : decision === "pause") return { error: "This decision does not fit this report." };

  // A request to change a creative and a block point at a rule and say what is wrong: the advertiser reads both.
  const cleanRule = isAdvertiserRule(rule) ? rule : null;
  const toAdvertiser = needsRule(decision) ? cleanNote(advNote) || null : null;
  const toDeveloper = cleanNote(devNote) || null;
  if (needsRule(decision) && !cleanRule) return { error: "Choose the rule this is about." };
  if (needsRule(decision) && !toAdvertiser) return { error: "Write to the advertiser what is wrong: they see the rule and this message." };

  const { data: creative } = await admin.service.from("creatives").select("id, name, owner_id").eq("id", dispute.creative_id).maybeSingle();
  const outcome = OUTCOME_OF[decision];
  const cleanedNote = cleanNote(note) || null;
  const now = new Date().toISOString();

  if (needsRule(decision) && creative && dispute.shape) {
    // The report is about one picture (a creative in one shape): that picture is shown nowhere from now on, the
    // creative's other shapes keep running (migration 0065).
    const { error: holdError } = await admin.service.from("creative_picture_holds").upsert({ creative_id: creative.id, shape: dispute.shape, kind: decision === "remove" ? "blocked" : "changes", rule: cleanRule, note: toAdvertiser, dispute_id: dispute.id, held_at: now, sent_at: null }, { onConflict: "creative_id,shape" });
    if (holdError && (isSchemaOutdated(holdError) || holdError.code === "42P01")) return { error: "Run migration 0065 in the Supabase SQL editor first." };
    if (holdError) return { error: "Could not save the decision on the picture." };
  } else if (needsRule(decision) && creative) {
    // A report about the whole creative: not shown anywhere, a rejected creative never reaches a game.
    const hold = { hold: decision === "remove" ? "blocked" : "changes", hold_rule: cleanRule, hold_note: toAdvertiser, hold_at: now, hold_dispute: dispute.id, hold_sent_at: null };
    const base = { status: "rejected", review_note: `${decision === "remove" ? "Blocked" : "Change requested"} after a report: ${cleanRule}`.slice(0, 500), reviewed_at: now };
    const { error: holdError } = await admin.service.from("creatives").update({ ...base, ...hold }).eq("id", creative.id);
    if (holdError && ["42703", "PGRST204"].includes(holdError.code)) return { error: "Run migration 0064 in the Supabase SQL editor first." };
    if (holdError) return { error: "Could not save the decision on the creative." };
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

  const patch = { status: "resolved", outcome, resolved_by: admin.user.id, resolved_at: now };
  if (extended) patch.admin_note = cleanedNote;
  let { error: saveError } = await admin.service.from("creative_disputes").update({ ...patch, rule: needsRule(decision) ? cleanRule : null, adv_note: toAdvertiser, dev_note: toDeveloper }).eq("id", dispute.id).eq("status", "open");
  // before migration 0064 a dismissal can still be saved, without the messages
  if (saveError && ["42703", "PGRST204"].includes(saveError.code) && !needsRule(decision)) ({ error: saveError } = await admin.service.from("creative_disputes").update(patch).eq("id", dispute.id).eq("status", "open"));
  if (saveError) return { error: "Could not save the decision." };
  if (extended) await admin.service.from("dispute_events").insert({ dispute_id: dispute.id, author_id: admin.user.id, side: "admin", kind: "decision", text: `${outcome}${cleanRule && needsRule(decision) ? `: ${cleanRule}` : cleanedNote ? `: ${cleanedNote}` : ""}`.slice(0, 1000) });

  // The block a developer made together with the report is from now on simply their choice.
  if (!advertiserSide) {
    await admin.service.from("game_picture_blocks").update({ reason: NEUTRAL_BLOCK_REASON }).eq("game_id", dispute.game_id).eq("creative_id", dispute.creative_id).eq("reason", PENDING_BLOCK_REASON).then(() => null, () => null);
    await admin.service.from("game_ad_controls").update({ reason: NEUTRAL_BLOCK_REASON }).eq("game_id", dispute.game_id).eq("scope", "creative").eq("target_id", dispute.creative_id).eq("reason", PENDING_BLOCK_REASON).then(() => null, () => null);
  }

  const name = creative?.name ?? "the creative";
  const reporter = advertiserSide ? dispute.advertiser_id : dispute.developer_id;
  const other = advertiserSide ? dispute.developer_id : creative?.owner_id;
  const what = decision === "remove" ? "picture removed" : decision === "change" ? "the advertiser must change the picture" : decision === "pause" ? "booking paused" : advertiserSide ? "dismissed" : "no violation found";
  if (reporter) await notify(admin.service, { accountId: reporter, text: `Your report on "${name}": ${what}.${toDeveloper ? ` ${toDeveloper}` : ""}`, link: advertiserSide ? "/dashboard/advertising" : `/dashboard/support?tab=requests&report=${dispute.id}`, type: advertiserSide ? "adv_report_decided" : "dev_report_decided" });
  // No violation: the advertiser is not told, the report only counts on the creative.
  if (decision !== "dismiss" && other) {
    await notify(admin.service, {
      accountId: other,
      text: decision === "remove" ? `"${name}"${dispute.shape ? `: ${shapeLabel(dispute.shape)} picture` : ""} blocked. Rule: ${cleanRule}. ${toAdvertiser}`
        : decision === "change" ? `Change ${dispute.shape ? `the ${shapeLabel(dispute.shape)} picture of ` : ""}"${name}". Rule: ${cleanRule}. ${toAdvertiser}`
        : `"${name}": booking paused after a report (${dispute.reason}).`,
      link: advertiserSide ? "/dashboard/games" : `/dashboard/creatives/${dispute.creative_id}`,
      type: decision === "pause" ? (advertiserSide ? "dev_booking_paused" : "adv_booking_paused") : "adv_creative_removed",
    });
  }

  revalidatePath("/dashboard/admin/disputes");
  revalidatePath("/dashboard/admin/bookings");
  revalidatePath("/dashboard/creatives");
  revalidatePath("/dashboard/advertising");
  revalidatePath("/dashboard/games");
  return { ok: true, outcome, name, paused };
}

/** What a decision on a report holds now: { creative, picture } (picture: the held shape's row, or null when the whole creative is held), or null. */
async function heldBy(service, disputeId) {
  const id = String(disputeId ?? "");
  const { data: picture } = await service.from("creative_picture_holds").select("creative_id, shape, kind").eq("dispute_id", id).maybeSingle();
  if (picture) {
    const { data: creative } = await service.from("creatives").select("id, name, owner_id").eq("id", picture.creative_id).maybeSingle();
    return creative ? { creative, picture } : null;
  }
  const { data: creative } = await service.from("creatives").select("id, name, owner_id, hold").eq("hold_dispute", id).maybeSingle();
  return creative?.hold ? { creative, picture: null } : null;
}

/**
 * DeusADS answers the advertiser about a creative it holds after a report (asked to change, or blocked): the advertiser
 * reads it under the decision, on the creative's page and in the campaign's Creatives tab, and can write back.
 */
export async function replyToAdvertiser({ disputeId, text }) {
  const admin = await getAdmin();
  if (!admin) return { error: "Not allowed." };
  const clean = String(text ?? "").trim().slice(0, 1000);
  if (!clean) return { error: "Write the reply first." };
  const held = await heldBy(admin.service, disputeId);
  if (!held) return { error: "Nothing is on hold by this decision any more, so there is nothing to answer." };
  const creative = held.creative;
  const { error: saveError } = await admin.service.from("dispute_events").insert({ dispute_id: String(disputeId), author_id: admin.user.id, side: "admin", kind: "reply", text: clean });
  if (saveError) return { error: "Could not send the reply." };
  await notify(admin.service, { accountId: creative.owner_id, text: `DeusADS replied about "${creative.name}": ${clean}`, link: `/dashboard/creatives/${creative.id}`, type: "adv_creative_removed" });
  revalidatePath("/dashboard/admin/disputes");
  revalidatePath(`/dashboard/creatives/${creative.id}`);
  revalidatePath("/dashboard/advertising");
  return { ok: true };
}

/**
 * DeusADS takes its decision on a creative back (it asked for a change or blocked it, and that was a mistake): the
 * creative is approved again and runs where it ran, the report reads "no violation", and both sides are told.
 */
export async function withdrawDecision({ disputeId, note }) {
  const admin = await getAdmin();
  if (!admin) return { error: "Not allowed." };
  const { data: dispute } = await admin.service.from("creative_disputes").select("id, developer_id, creative_id, status, outcome, rule").eq("id", String(disputeId ?? "")).maybeSingle();
  if (!dispute || dispute.status !== "resolved" || !["changes", "removed"].includes(dispute.outcome)) return { error: "There is no decision to take back here." };
  const held = await heldBy(admin.service, dispute.id);
  if (!held) return { error: "Nothing is held by this decision any more." };
  const creative = held.creative;
  const now = new Date().toISOString();
  const said = cleanNote(note) || null;
  const { error } = held.picture
    ? await admin.service.from("creative_picture_holds").delete().eq("creative_id", creative.id).eq("shape", held.picture.shape)
    : await admin.service.from("creatives").update({ status: "approved", review_note: null, reviewed_at: now, hold: null, hold_rule: null, hold_note: null, hold_at: null, hold_dispute: null, hold_sent_at: null }).eq("id", creative.id);
  if (error) return { error: "Could not put it back." };
  // the trace of what was decided first stays in the history of the dispute
  await admin.service.from("dispute_events").insert({ dispute_id: dispute.id, author_id: admin.user.id, side: "admin", kind: "decision", text: `withdrawn: ${dispute.outcome === "removed" ? "Blocked" : "Change requested"}${dispute.rule ? ` · ${dispute.rule}` : ""}${said ? ` · ${said}` : ""}`.slice(0, 1000) });
  await admin.service.from("creative_disputes").update({ outcome: "dismissed", resolved_at: now, resolved_by: admin.user.id }).eq("id", dispute.id);
  try {
    await admin.service.rpc("activate_waiting_bookings", { p_creative: creative.id });
  } catch {
    // bookings are picked up by the next review or booking
  }
  await notify(admin.service, { accountId: creative.owner_id, text: `"${creative.name}" runs again: DeusADS took its decision back.${said ? ` ${said}` : ""}`, link: `/dashboard/creatives/${creative.id}`, type: "adv_creative_removed" });
  if (dispute.developer_id) await notify(admin.service, { accountId: dispute.developer_id, text: `Your report on "${creative.name}": after a second look, no violation found. It runs again.`, link: `/dashboard/support?tab=requests&report=${dispute.id}`, type: "dev_report_decided" });
  revalidatePath("/dashboard/admin/disputes");
  revalidatePath("/dashboard/creatives");
  revalidatePath("/dashboard/advertising");
  revalidatePath("/dashboard/games");
  return { ok: true };
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
