"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getMember } from "../../../../lib/admin";
import { isSchemaOutdated } from "../../../../lib/api";
import { categoryLabel, isCategory } from "../../../../lib/categories";
import { ACTIONS, SCOPES, WINDOW_MS, blockedCategories, bulkKeyOf, changeMessage, nextControl, planChange } from "../../../../lib/game-controls";
import { notify } from "../../../../lib/notify";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MISSING = "Run migration 0023 in the Supabase SQL editor first.";
const SIGNED_OUT = "Your session expired. Sign in again.";
const MAX_TARGETS = 200;

const clip = (text, max) => String(text ?? "").trim().slice(0, max);

/** The signed-in developer and the game, when the game is theirs. */
async function ownGame(gameId) {
  const me = await getMember();
  if (!me) return { error: SIGNED_OUT };
  if (!UUID.test(String(gameId ?? ""))) return { error: "Game not found." };
  const { data: game } = await me.service.from("games").select("id, name").eq("id", gameId).eq("owner_id", me.user.id).maybeSingle();
  if (!game) return { error: "Game not found." };
  return { me, game };
}

const refresh = (gameId) => {
  revalidatePath(`/dashboard/g/${gameId}`);
  revalidatePath("/dashboard/advertising");
};

/**
 * Pause, resume, block or unblock campaigns, creatives or advertisers in one game.
 *   scope  "campaign" | "creative" | "advertiser" (only campaigns can be paused)
 *   ids    what to change; more than one is a bulk change, saved as one record
 * Nothing is cancelled: the manifest simply stops serving what is paused or blocked, and the change
 * can be taken back. An item changes at most twice an hour (see lib/game-controls.js).
 */
export async function changeAds({ gameId, scope, action, ids, reason, comment }) {
  const found = await ownGame(gameId);
  if (found.error) return { error: found.error };
  const { me, game } = found;

  if (!SCOPES.includes(scope) || !ACTIONS.includes(action)) return { error: "Unknown change." };
  if ((action === "pause" || action === "resume") && scope !== "campaign") return { error: "Only campaigns can be paused." };
  const wanted = [...new Set((Array.isArray(ids) ? ids : []).map(String))].filter((id) => UUID.test(id)).slice(0, MAX_TARGETS);
  if (!wanted.length) return { error: "Nothing selected." };

  // What in this game the ids really are, with the advertiser each belongs to and a name for the message.
  const { data: placements } = await me.service.from("placements").select("id").eq("game_id", game.id);
  const placementIds = (placements ?? []).map((row) => row.id);
  const column = { campaign: "campaign_id", creative: "creative_id", advertiser: "advertiser_id" }[scope];
  const { data: bookings, error: bookingsError } = placementIds.length
    ? await me.service.from("bookings").select("campaign_id, creative_id, advertiser_id").in("placement_id", placementIds).in(column, wanted)
    : { data: [], error: null };
  if (bookingsError) return { error: "Could not read the campaigns." };
  const advertiserOf = new Map((bookings ?? []).map((row) => [row[column], row.advertiser_id]));
  const targetIds = wanted.filter((id) => advertiserOf.has(id));
  if (!targetIds.length) return { error: "Nothing to change here." };

  const nameTable = { campaign: ["campaigns", "name"], creative: ["creatives", "name"], advertiser: ["accounts", "company"] }[scope];
  const { data: named } = await me.service.from(nameTable[0]).select(`id, ${nameTable[1]}${scope === "advertiser" ? ", email" : ""}`).in("id", targetIds);
  const nameOf = new Map((named ?? []).map((row) => [row.id, row[nameTable[1]] || row.email || "Unknown"]));

  const { data: current, error: controlsError } = await me.service
    .from("game_ad_controls")
    .select("target_id, state")
    .eq("game_id", game.id)
    .eq("scope", scope)
    .in("target_id", targetIds);
  if (controlsError) return { error: isSchemaOutdated(controlsError) || controlsError.code === "42P01" ? MISSING : "Could not read the current state." };
  const stateOf = new Map((current ?? []).map((row) => [row.target_id, row.state]));
  const targets = targetIds.map((id) => ({ id, state: stateOf.get(id) === "paused" ? "paused" : stateOf.get(id) === "blocked" ? "blocked" : "free" }));

  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const bulkKey = bulkKeyOf(action, scope, targetIds);
  const [own, same] = await Promise.all([
    me.service.from("game_ad_control_log").select("target_id, batch_id, bulk_key, created_at").eq("game_id", game.id).eq("scope", scope).in("target_id", targetIds).gte("created_at", since),
    targetIds.length > 1
      ? me.service.from("game_ad_control_log").select("target_id, batch_id, bulk_key, created_at").eq("game_id", game.id).eq("bulk_key", bulkKey).gte("created_at", since)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (own.error || same.error) return { error: "Could not read the change log." };

  const plan = planChange({ action, scope, targets, recent: [...(own.data ?? []), ...(same.data ?? [])] });
  const message = (applied) =>
    changeMessage({ action, scope, applied: applied.length, duplicates: plan.duplicates.length, limited: plan.limited.length, bulkLimited: plan.bulkLimited, names: applied.map((id) => nameOf.get(id)) });

  if (!plan.apply.length) {
    return { ok: true, applied: [], duplicates: plan.duplicates, limited: plan.limited, bulkLimited: plan.bulkLimited, message: message([]) };
  }

  const cleanReason = action === "block" ? clip(reason, 300) : "";
  const cleanComment = action === "block" ? clip(comment, 500) : "";
  const control = nextControl(action);
  if (control) {
    const { error } = await me.service.from("game_ad_controls").upsert(
      plan.apply.map((id) => ({
        game_id: game.id,
        developer_id: me.user.id,
        scope,
        target_id: id,
        state: control.state,
        reason: cleanReason || null,
        comment: cleanComment || null,
        changed_at: new Date().toISOString(),
      })),
      { onConflict: "game_id,scope,target_id" }
    );
    if (error) return { error: "Could not save the change." };
  } else {
    const { error } = await me.service.from("game_ad_controls").delete().eq("game_id", game.id).eq("scope", scope).in("target_id", plan.apply);
    if (error) return { error: "Could not save the change." };
  }

  const bulk = plan.apply.length > 1 || targetIds.length > 1;
  const batch = bulk ? randomUUID() : null;
  const at = new Date().toISOString();
  await me.service.from("game_ad_control_log").insert(
    plan.apply.map((id) => ({
      game_id: game.id,
      developer_id: me.user.id,
      scope,
      target_id: id,
      action,
      reason: cleanReason || null,
      bulk_key: bulk ? bulkKey : null,
      batch_id: batch,
      created_at: at,
    }))
  );

  // Each advertiser hears once about what happened to their things in this game.
  const perAdvertiser = new Map();
  for (const id of plan.apply) {
    const advertiser = advertiserOf.get(id);
    if (!perAdvertiser.has(advertiser)) perAdvertiser.set(advertiser, []);
    perAdvertiser.get(advertiser).push(nameOf.get(id));
  }
  const verb = { pause: "paused", resume: "resumed", block: "blocked", unblock: "unblocked" }[action];
  const noun = scope === "advertiser" ? "Your account" : scope === "creative" ? "creative" : "campaign";
  for (const [advertiserId, list] of perAdvertiser) {
    const what =
      scope === "advertiser"
        ? "Your account"
        : list.length === 1
          ? `Your ${noun} "${list[0]}"`
          : `${list.length} of your ${noun === "creative" ? "creatives" : "campaigns"}`;
    await notify(me.service, {
      accountId: advertiserId,
      text: `${what} ${list.length > 1 && scope !== "advertiser" ? "were" : "was"} ${verb} in ${game.name}${cleanReason ? `. Reason: ${cleanReason}` : "."}`,
      link: "/dashboard/advertising",
    });
  }

  refresh(game.id);
  return {
    ok: true,
    action,
    scope,
    applied: plan.apply,
    duplicates: plan.duplicates,
    limited: plan.limited,
    bulkLimited: false,
    reason: cleanReason,
    comment: cleanComment,
    logged: plan.apply.map((id) => ({ scope, target_id: id, batch_id: batch, bulk_key: bulk ? bulkKey : null, created_at: at })),
    message: message(plan.apply),
  };
}

/** Block or allow an ad category in one game. A category with no setting follows its default. */
export async function setCategoryBlocked({ gameId, category, blocked }) {
  const found = await ownGame(gameId);
  if (found.error) return { error: found.error };
  const { me, game } = found;
  if (!isCategory(category)) return { error: "Unknown category." };
  const want = Boolean(blocked);

  const { data: rows, error: readError } = await me.service.from("game_category_blocks").select("category, blocked").eq("game_id", game.id);
  if (readError) return { error: isSchemaOutdated(readError) || readError.code === "42P01" ? MISSING : "Could not read the categories." };
  if (blockedCategories(rows).has(category) === want) {
    return { ok: true, changed: false, message: `${categoryLabel(category)} is already ${want ? "blocked" : "allowed"}.` };
  }

  const { error } = await me.service
    .from("game_category_blocks")
    .upsert({ game_id: game.id, category, blocked: want, changed_at: new Date().toISOString() }, { onConflict: "game_id,category" });
  if (error) return { error: "Could not save the category." };
  await me.service.from("game_ad_control_log").insert({
    game_id: game.id,
    developer_id: me.user.id,
    scope: "category",
    target_id: category,
    action: want ? "block" : "unblock",
  });
  refresh(game.id);
  return {
    ok: true,
    changed: true,
    message: `${want ? "Category blocked" : "Category allowed"}: ${categoryLabel(category)}. Players get this the next time they start the game.`,
  };
}

/** The developer opened a campaign: it and its creatives lose their "New" marks. */
export async function markSeen({ gameId, campaignId, creativeIds }) {
  const found = await ownGame(gameId);
  if (found.error) return { error: found.error };
  const { me, game } = found;
  const rows = [];
  if (UUID.test(String(campaignId ?? ""))) rows.push({ kind: "campaign", target_id: campaignId });
  for (const id of new Set(Array.isArray(creativeIds) ? creativeIds : [])) {
    if (UUID.test(String(id))) rows.push({ kind: "creative", target_id: id });
  }
  if (!rows.length) return { ok: true };
  const { error } = await me.service
    .from("game_ad_seen")
    .upsert(rows.slice(0, 300).map((row) => ({ ...row, game_id: game.id, developer_id: me.user.id })), { onConflict: "game_id,kind,target_id", ignoreDuplicates: true });
  if (error) return { error: "Could not save." };
  revalidatePath(`/dashboard/g/${game.id}`);
  return { ok: true };
}
