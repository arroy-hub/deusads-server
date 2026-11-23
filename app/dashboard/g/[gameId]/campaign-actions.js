"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getMember } from "../../../../lib/admin";
import { isSchemaOutdated } from "../../../../lib/api";
import { categoryLabel, isCategory } from "../../../../lib/categories";
import { ACTIONS, SCOPES, WINDOW_MS, blockedCategories, bulkKeyOf, changeMessage, nextControl, planChange } from "../../../../lib/game-controls";
import { parsePictureId, pictureId, shapeKey, shapeLabel } from "../../../../lib/game-pictures";
import { notify, notifyMany } from "../../../../lib/notify";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MISSING = "Run migration 0023 in the Supabase SQL editor first.";
const MISSING_PICTURES = "Run migration 0062 in the Supabase SQL editor first.";
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
 *   scope  "campaign" | "creative" | "advertiser" | "picture" (only campaigns can be paused)
 *   ids    what to change; more than one is a bulk change, saved as one record
 * A "picture" is a creative in one shape (migration 0062): its id is pictureId(creativeId, shape) and blocking it
 * leaves the other shapes of the creative running.
 * Nothing is cancelled: the manifest simply stops serving what is paused or blocked, and the change
 * can be taken back. An item changes at most twice an hour (see lib/game-controls.js).
 */
export async function changeAds({ gameId, scope, action, ids, reason, comment }) {
  const found = await ownGame(gameId);
  if (found.error) return { error: found.error };
  const { me, game } = found;

  if (!SCOPES.includes(scope) || !ACTIONS.includes(action)) return { error: "Unknown change." };
  if ((action === "pause" || action === "resume") && scope !== "campaign") return { error: "Only campaigns can be paused." };
  const isPicture = scope === "picture";
  // A picture's id is a creative's id and a shape; everything else is a plain id.
  const pictureOf = new Map();
  const wanted = [...new Set((Array.isArray(ids) ? ids : []).map(String))]
    .filter((id) => {
      if (!isPicture) return UUID.test(id);
      const picture = parsePictureId(id);
      if (!picture || !UUID.test(picture.creativeId)) return false;
      pictureOf.set(id, picture);
      return true;
    })
    .slice(0, MAX_TARGETS);
  if (!wanted.length) return { error: "Nothing selected." };

  // What in this game the ids really are, with the advertiser each belongs to and a name for the message.
  const { data: placements } = await me.service.from("placements").select("id, aspect_ratio").eq("game_id", game.id);
  const placementIds = (placements ?? []).map((row) => row.id);
  const column = { campaign: "campaign_id", creative: "creative_id", advertiser: "advertiser_id", picture: "creative_id" }[scope];
  const lookFor = isPicture ? [...new Set(wanted.map((id) => pictureOf.get(id).creativeId))] : wanted;
  const { data: bookings, error: bookingsError } = placementIds.length
    ? await me.service.from("bookings").select("campaign_id, creative_id, advertiser_id").in("placement_id", placementIds).in(column, lookFor)
    : { data: [], error: null };
  if (bookingsError) return { error: "Could not read the campaigns." };
  const ownerOf = new Map((bookings ?? []).map((row) => [row[column], row.advertiser_id]));
  // A picture is real when its creative is booked here and the game has a placement of that shape.
  const shapes = new Set((placements ?? []).map((row) => shapeKey(row.aspect_ratio)));
  const advertiserOf = isPicture ? new Map(wanted.filter((id) => ownerOf.has(pictureOf.get(id).creativeId) && shapes.has(pictureOf.get(id).shape)).map((id) => [id, ownerOf.get(pictureOf.get(id).creativeId)])) : ownerOf;
  const targetIds = wanted.filter((id) => advertiserOf.has(id));
  if (!targetIds.length) return { error: "Nothing to change here." };

  const nameTable = { campaign: ["campaigns", "name"], creative: ["creatives", "name"], advertiser: ["accounts", "company"], picture: ["creatives", "name"] }[scope];
  const { data: named } = await me.service.from(nameTable[0]).select(`id, ${nameTable[1]}${scope === "advertiser" ? ", email" : ""}`).in("id", isPicture ? lookFor : targetIds);
  const plainName = new Map((named ?? []).map((row) => [row.id, row[nameTable[1]] || row.email || "Unknown"]));
  const nameOf = isPicture ? new Map(targetIds.map((id) => [id, `${plainName.get(pictureOf.get(id).creativeId) ?? "Creative"} · ${shapeLabel(pictureOf.get(id).shape)}`])) : plainName;

  let stateOf;
  if (isPicture) {
    const { data: blocks, error: blocksError } = await me.service.from("game_picture_blocks").select("creative_id, shape").eq("game_id", game.id).in("creative_id", lookFor);
    if (blocksError) return { error: isSchemaOutdated(blocksError) ? MISSING_PICTURES : "Could not read the current state." };
    stateOf = new Map((blocks ?? []).map((row) => [pictureId(row.creative_id, row.shape), "blocked"]));
  } else {
    const { data: current, error: controlsError } = await me.service
      .from("game_ad_controls")
      .select("target_id, state")
      .eq("game_id", game.id)
      .eq("scope", scope)
      .in("target_id", targetIds);
    if (controlsError) return { error: isSchemaOutdated(controlsError) || controlsError.code === "42P01" ? MISSING : "Could not read the current state." };
    stateOf = new Map((current ?? []).map((row) => [row.target_id, row.state]));
  }
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
  if (isPicture) {
    // Its own table: one row per creative and shape that is blocked; unblocking removes the row.
    if (control) {
      const { error } = await me.service.from("game_picture_blocks").upsert(
        plan.apply.map((id) => ({
          game_id: game.id,
          developer_id: me.user.id,
          creative_id: pictureOf.get(id).creativeId,
          shape: pictureOf.get(id).shape,
          reason: cleanReason || null,
          comment: cleanComment || null,
          changed_at: new Date().toISOString(),
        })),
        { onConflict: "game_id,creative_id,shape" }
      );
      if (error) return { error: isSchemaOutdated(error) ? MISSING_PICTURES : "Could not save the change." };
    } else {
      for (const id of plan.apply) {
        const { error } = await me.service.from("game_picture_blocks").delete().eq("game_id", game.id).eq("creative_id", pictureOf.get(id).creativeId).eq("shape", pictureOf.get(id).shape);
        if (error) return { error: "Could not save the change." };
      }
    }
  } else if (control) {
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
  const noun = scope === "advertiser" ? "Your account" : scope === "creative" || isPicture ? "creative" : "campaign";
  for (const [advertiserId, list] of perAdvertiser) {
    const what =
      scope === "advertiser"
        ? "Your account"
        : list.length === 1
          ? `Your ${noun} "${list[0]}"`
          : `${list.length} of your ${noun === "creative" ? "creatives" : "campaigns"}`;
    await notify(me.service, {
      accountId: advertiserId,
      text: `${what} ${list.length > 1 && scope !== "advertiser" ? "were" : "was"} ${verb} in ${game.name}${isPicture && action === "block" ? " in this shape only" : ""}${cleanReason ? `. Reason: ${cleanReason}` : "."}`,
      link: "/dashboard/advertising",
      type: "adv_blocked",
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

const REPORT_REASONS = ["Misleading or deceptive", "Inappropriate content", "Wrong category", "Suspicious link or malware", "Other"];

/**
 * The developer reports a creative that runs in their game. DeusADS reviews it (Disputes in the admin area).
 * With `alsoBlock` the creative is blocked in this game at once, the same way as the Block button: in the one shape the
 * report was sent from (`shape`, migration 0062), or as a whole when no shape is given.
 */
export async function reportCreative({ gameId, creativeId, reason, comment, alsoBlock, shape = null }) {
  const found = await ownGame(gameId);
  if (found.error) return { error: found.error };
  const { me, game } = found;
  if (!UUID.test(String(creativeId ?? ""))) return { error: "Creative not found." };
  const cleanReason = REPORT_REASONS.includes(reason) ? reason : null;
  if (!cleanReason) return { error: "Choose a reason." };

  const { data: placements } = await me.service.from("placements").select("id").eq("game_id", game.id);
  const placementIds = (placements ?? []).map((row) => row.id);
  const { data: booked } = placementIds.length
    ? await me.service.from("bookings").select("campaign_id").in("placement_id", placementIds).eq("creative_id", creativeId).limit(1)
    : { data: [] };
  if (!booked?.length) return { error: "This creative is not booked in your game." };

  const { error } = await me.service.from("creative_disputes").insert({
    game_id: game.id,
    developer_id: me.user.id,
    creative_id: creativeId,
    campaign_id: booked[0].campaign_id,
    reason: cleanReason,
    comment: clip(comment, 1000) || null,
  });
  if (error) {
    if (error.code === "23505") return { ok: true, duplicate: true, message: "You already reported this creative. DeusADS is reviewing it." };
    if (isSchemaOutdated(error) || error.code === "42P01") return { error: "Run migration 0024 in the Supabase SQL editor first." };
    return { error: "Could not send the report." };
  }

  const { data: admins } = await me.service.from("accounts").select("id").eq("role", "admin");
  await notifyMany(me.service, (admins ?? []).map((row) => row.id), `New report about a creative in ${game.name}: ${cleanReason}`, "/dashboard/admin/disputes", "admin_reports");

  let block = null;
  if (alsoBlock) {
    block = shape
      ? await changeAds({ gameId, scope: "picture", action: "block", ids: [pictureId(creativeId, shape)], reason: "Blocked pending a DeusADS review", comment: "" })
      : await changeAds({ gameId, scope: "creative", action: "block", ids: [creativeId], reason: "Blocked pending a DeusADS review", comment: "" });
  }
  revalidatePath("/dashboard/admin/disputes");
  return {
    ok: true,
    block: block && !block.error ? block : null,
    message: `Report sent to DeusADS.${block?.applied?.length ? " The creative is blocked in your game." : ""} You will get a notification with the outcome.`,
  };
}
