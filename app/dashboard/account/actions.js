"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { userClient } from "../../../lib/supabase-server";
import { isSchemaOutdated } from "../../../lib/api";
import { notify } from "../../../lib/notify";
import { SITE, anonClient, passwordIsRight, resolveActor } from "../../../lib/account-server";
import { currentSessionId, loadAccountRow, loadOwned } from "../../../lib/account-data";
import { checkProfile, deleteBlocker, emailChangeProblem, isEmail, passwordProblem } from "../../../lib/account-rules";
import { channelsOf, prefProblem } from "../../../lib/notification-prefs";

// Every action re-checks who is calling: a server action is a public endpoint. With no `accountId` the
// action is about the caller's own account; an admin may pass another one.

const OUTDATED = "The database needs update 0030 first. Ask an admin to run it.";
const GONE = "Connection lost. Try again.";

const refresh = (id) => {
  revalidatePath("/dashboard", "layout");
  revalidatePath("/dashboard/account");
  if (id) revalidatePath(`/dashboard/admin/users/${id}`);
  revalidatePath("/dashboard/admin/users");
};

/** Leaves the dashboard. */
export async function signOut() {
  const db = await userClient();
  await db.auth.signOut().catch(() => null);
  redirect("/login");
}

/** The Profile tab: company, contact person, website, country, phone (and, for an admin, the email). */
export async function saveProfile({ accountId, fields }) {
  const who = await resolveActor(accountId);
  if (who.error) return { error: who.error };
  const { me, id, self } = who;

  const { row } = await loadAccountRow(me.service, id);
  if (!row) return { error: "Unknown account." };

  const checked = checkProfile(fields ?? {}, { role: row.role, withEmail: !self });
  if (!checked.ok) return { errors: checked.errors };
  const { email, ...values } = checked.values;

  // An admin changing the address: it takes effect at once, the owner is told.
  let emailChanged = false;
  if (!self && email && email !== String(row.email ?? "").toLowerCase()) {
    const failure = await applyEmail(me, id, email);
    if (failure) return failure;
    emailChanged = true;
  }

  // The owner writes through their own session (row-level security and column grants); an admin through the service role.
  const db = self ? await userClient() : me.service;
  const { error } = await db.from("accounts").update(values).eq("id", id);
  if (isSchemaOutdated(error) || error?.code === "42501") return { error: OUTDATED };
  if (error) return { error: "Could not save. Try again." };

  refresh(id);
  return { ok: true, emailChanged };
}

/** An admin changes someone's sign-in email: no confirmation, the owner is told. Returns an error result or null. */
async function applyEmail(me, id, email) {
  const { error } = await me.service.auth.admin.updateUserById(id, { email, email_confirm: true });
  if (error) {
    if (/already|registered|exists/i.test(error.message ?? "")) return { errors: { email: "Another account already uses this email." } };
    return { error: "Could not change the email. Try again." };
  }
  await me.service.from("accounts").update({ email }).eq("id", id);
  await notify(me.service, { accountId: id, text: `DeusADS changed your sign-in email to ${email}.`, link: "/dashboard/account", type: "account_security" });
  return null;
}

/** The email bubble on an admin's view of someone else: the new address applies at once. */
export async function adminChangeEmail({ accountId, email }) {
  const who = await resolveActor(accountId);
  if (who.error) return { error: who.error };
  if (who.self) return { error: "Change your own email in Sign-in & security." };
  const next = String(email ?? "").trim().toLowerCase();
  if (!isEmail(next)) return { error: "Enter a valid email address." };
  const failure = await applyEmail(who.me, who.id, next);
  if (failure) return { error: failure.error ?? failure.errors.email };
  refresh(who.id);
  return { ok: true, email: next };
}

/** The owner asks for a new email: a link goes to the new address, the old one stays until it is opened. */
export async function requestEmailChange({ email, password }) {
  const who = await resolveActor(null);
  if (who.error) return { error: who.error };
  const { me } = who;

  const problem = emailChangeProblem({ email, current: me.user.email });
  if (problem) return { error: problem };
  if (!(await passwordIsRight(me.user.email, password))) return { error: "That password is not right." };

  const db = await userClient();
  const next = String(email).trim().toLowerCase();
  const { error } = await db.auth.updateUser({ email: next }, { emailRedirectTo: `${SITE()}/auth/callback?next=/dashboard/account?tab=security` });
  if (error) {
    if (/already|registered|exists/i.test(error.message ?? "")) return { error: "Another account already uses this email." };
    return { error: "Could not send the link. Try again in a minute." };
  }
  refresh();
  return { ok: true, pendingEmail: next };
}

/** Sends the confirmation link again. */
export async function resendEmailChange({ email }) {
  const who = await resolveActor(null);
  if (who.error) return { error: who.error };
  const db = await userClient();
  const { error } = await db.auth.resend({ type: "email_change", email: String(email ?? "").trim().toLowerCase() });
  if (error) return { error: "Could not send it again. Try in a minute." };
  return { ok: true };
}

/** Withdraws an email change nobody opened; the old address stays. */
export async function cancelEmailChange() {
  const who = await resolveActor(null);
  if (who.error) return { error: who.error };
  const db = await userClient();
  const { error } = await db.rpc("cancel_my_email_change");
  if (error) return { error: isSchemaOutdated(error) || error.code === "PGRST202" ? OUTDATED : "Could not cancel. Try again." };
  refresh();
  return { ok: true };
}

/** The owner changes the password: the current one is checked, other devices are signed out. */
export async function changePassword({ current, next, repeat }) {
  const who = await resolveActor(null);
  if (who.error) return { error: who.error };
  const { me } = who;

  const problem = passwordProblem({ current, next, repeat });
  if (problem) return { error: problem };
  if (!(await passwordIsRight(me.user.email, current))) return { error: "Your current password is not right." };

  const db = await userClient();
  const { error } = await db.auth.updateUser({ password: String(next) });
  if (error) return { error: /weak|short|least/i.test(error.message ?? "") ? error.message : "Could not change the password. Try again." };

  await me.service.from("accounts").update({ password_changed_at: new Date().toISOString() }).eq("id", me.user.id);
  await db.rpc("revoke_other_sessions", { p_keep: await currentSessionId(db) });
  await notify(me.service, { accountId: me.user.id, text: "Your password was changed.", link: "/dashboard/account?tab=security", type: "account_security" });
  refresh();
  return { ok: true };
}

/** An admin sets a new password for someone: they are signed out everywhere. */
export async function adminSetPassword({ accountId, next, repeat }) {
  const who = await resolveActor(accountId);
  if (who.error) return { error: who.error };
  if (who.self) return { error: "Change your own password in Sign-in & security." };
  const { me, id } = who;

  const problem = passwordProblem({ next, repeat }, { needCurrent: false });
  if (problem) return { error: problem };

  const { error } = await me.service.auth.admin.updateUserById(id, { password: String(next) });
  if (error) return { error: "Could not set the password. Try again." };
  await me.service.from("accounts").update({ password_changed_at: new Date().toISOString() }).eq("id", id);
  await me.service.rpc("admin_revoke_sessions", { p_user: id });
  await notify(me.service, { accountId: id, text: "DeusADS set a new password for your account. Sign in again.", link: "/dashboard/account?tab=security", type: "account_security" });
  refresh(id);
  return { ok: true };
}

/** An admin sends someone the password-reset email. */
export async function sendResetLink({ accountId }) {
  const who = await resolveActor(accountId);
  if (who.error) return { error: who.error };
  const { me, id } = who;
  const { row } = await loadAccountRow(me.service, id);
  if (!row?.email) return { error: "Unknown account." };
  const { error } = await anonClient().auth.resetPasswordForEmail(row.email, { redirectTo: `${SITE()}/auth/callback?next=/dashboard/account?tab=security` });
  if (error) return { error: "Could not send the link. Try again in a minute." };
  return { ok: true, email: row.email };
}

/** Signs one other device out: every sign-in it made (a device may hold several sessions). */
export async function signOutSession({ sessionIds }) {
  const who = await resolveActor(null);
  if (who.error) return { error: who.error };
  const db = await userClient();
  const current = await currentSessionId(db);
  let failure = null;
  for (const id of (sessionIds ?? []).map(String).filter((id) => id !== current)) {
    const { error } = await db.rpc("revoke_my_session", { p_id: id });
    if (error) failure = error;
  }
  const error = failure;
  if (error) return { error: isSchemaOutdated(error) || error.code === "PGRST202" ? OUTDATED : "Could not sign that device out." };
  revalidatePath("/dashboard/account");
  return { ok: true };
}

/** Signs out every device except this one. */
export async function signOutOthers() {
  const who = await resolveActor(null);
  if (who.error) return { error: who.error };
  const db = await userClient();
  const { data, error } = await db.rpc("revoke_other_sessions", { p_keep: await currentSessionId(db) });
  if (error) return { error: isSchemaOutdated(error) || error.code === "PGRST202" ? OUTDATED : "Could not sign the others out." };
  revalidatePath("/dashboard/account");
  return { ok: true, count: Number(data) || 0 };
}

/** An admin signs someone out on every device. */
export async function adminSignOutEverywhere({ accountId }) {
  const who = await resolveActor(accountId);
  if (who.error) return { error: who.error };
  if (who.self) return { error: "Use Sign out for your own account." };
  const { error } = await who.me.service.rpc("admin_revoke_sessions", { p_user: who.id });
  if (error) return { error: isSchemaOutdated(error) || error.code === "PGRST202" ? OUTDATED : "Could not sign them out." };
  return { ok: true };
}

/** One checkbox on the Notifications tab. */
export async function setNotificationPref({ accountId, type, channel, value }) {
  const problem = prefProblem({ type, channel, value });
  if (problem) return { error: problem };
  const who = await resolveActor(accountId);
  if (who.error) return { error: who.error };
  const { me, id } = who;

  const { data: current, error: readError } = await me.service.from("notification_prefs").select("bell, email").eq("account_id", id).eq("type", type).maybeSingle();
  if (isSchemaOutdated(readError)) return { error: OUTDATED };
  const next = { ...channelsOf(current), [channel]: value };
  const { error } = await me.service
    .from("notification_prefs")
    .upsert({ account_id: id, type, bell: next.bell, email: next.email, updated_at: new Date().toISOString() }, { onConflict: "account_id,type" });
  if (error) return { error: isSchemaOutdated(error) ? OUTDATED : "Could not save. Try again." };
  return { ok: true };
}

/**
 * Deletes an account for good. The owner confirms with their password and cannot delete while they still have
 * games (developer) or running campaigns (advertiser); an admin account is never deleted from here. An admin may
 * delete another person's account (not another admin's).
 */
export async function deleteAccount({ accountId, password }) {
  const who = await resolveActor(accountId);
  if (who.error) return { error: who.error };
  const { me, id, self } = who;

  const { row } = await loadAccountRow(me.service, id);
  if (!row) return { error: "Unknown account." };
  if (row.role === "admin") return { error: "Admin accounts can't be deleted here." };

  if (self) {
    const owned = await loadOwned(me.service, id);
    const blocker = deleteBlocker({ role: row.role, games: owned.games, runningCampaigns: owned.runningCampaigns });
    if (blocker) return { error: blocker.message, blocker };
    if (!(await passwordIsRight(row.email, password))) return { error: "That password is not right." };
  }

  if (row.avatar_path) await me.service.storage.from("creatives").remove([row.avatar_path]).catch(() => null);
  const { error } = await me.service.auth.admin.deleteUser(id);
  if (error) return { error: "Could not delete the account. Something is still attached to it." };

  if (self) {
    const db = await userClient();
    await db.auth.signOut().catch(() => null);
  }
  refresh();
  return { ok: true, self };
}
