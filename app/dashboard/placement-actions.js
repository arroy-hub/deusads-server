"use server";

import { revalidatePath } from "next/cache";
import { userClient } from "../../lib/supabase-server";
import { isSchemaOutdated } from "../../lib/api";
import {
  changedTags,
  cleanFolderName,
  cleanIds,
  cleanPlaceType,
  cleanScene,
  cleanTags,
  isId,
  renamedTag,
} from "../../lib/placement-input";

// Organising placements: switches, folders, tags, place type (migration 0021).
// Every action writes through the user's own client, so row-level security is what enforces
// ownership; the owner_id and game_id filters below keep an action to the game it was asked about.

const NEEDS_MIGRATION = "Run supabase/migrations/0021_placement_organization.sql in the Supabase SQL editor first.";
const TRY_AGAIN = "Could not save. Try again.";
const EXPIRED = "Your session expired. Sign in again.";

async function session() {
  const db = await userClient();
  const { data } = await db.auth.getUser();
  return { db, user: data?.user ?? null };
}

function failed(error) {
  return { error: isSchemaOutdated(error) ? NEEDS_MIGRATION : TRY_AGAIN };
}

function refresh() {
  revalidatePath("/dashboard", "layout");
}

/** Switches placements on or off. A placement that is off shows nothing in the game, not even a fallback. */
export async function setPlacementsEnabled({ gameId, ids, enabled }) {
  const { db, user } = await session();
  if (!user) return { error: EXPIRED };
  const list = cleanIds(ids);
  if (!isId(gameId) || !list) return { error: "Choose at least one placement." };

  const { data, error } = await db
    .from("placements")
    .update({ enabled: Boolean(enabled) })
    .in("id", list)
    .eq("game_id", gameId)
    .eq("owner_id", user.id)
    .select("id");
  if (error) return failed(error);
  if (!data?.length) return { error: "Placement not found." };

  refresh();
  return { ok: true, changed: data.length };
}

/**
 * Switches a whole scene on or off. Every copy of a placement standing in that scene is covered,
 * including ones added later; the same placement in another scene is not.
 */
export async function setSceneEnabled({ gameId, scene, enabled }) {
  const { db, user } = await session();
  if (!user) return { error: EXPIRED };
  const name = cleanScene(scene);
  if (!isId(gameId) || !name) return { error: "Unknown scene." };

  if (enabled) {
    const { error } = await db.from("placement_scene_off").delete().eq("game_id", gameId).eq("scene", name).eq("owner_id", user.id);
    if (error) return failed(error);
  } else {
    const { error } = await db
      .from("placement_scene_off")
      .upsert({ game_id: gameId, scene: name, owner_id: user.id }, { onConflict: "game_id,scene", ignoreDuplicates: true });
    if (error) return failed(error);
  }

  refresh();
  return { ok: true };
}

/** A new folder. One level for now; the database already allows folders inside folders. */
export async function createFolder({ gameId, name }) {
  const { db, user } = await session();
  if (!user) return { error: EXPIRED };
  const clean = cleanFolderName(name);
  if (!isId(gameId)) return { error: "Unknown game." };
  if (!clean) return { error: "Give the folder a name." };

  const { data, error } = await db
    .from("placement_folders")
    .insert({ game_id: gameId, owner_id: user.id, name: clean })
    .select("id, name, enabled")
    .maybeSingle();
  if (error?.code === "23505") return { error: "A folder with that name already exists." };
  if (error) return failed(error);

  refresh();
  return { ok: true, folder: data };
}

export async function renameFolder({ folderId, name }) {
  const { db, user } = await session();
  if (!user) return { error: EXPIRED };
  const clean = cleanFolderName(name);
  if (!isId(folderId)) return { error: "Unknown folder." };
  if (!clean) return { error: "Give the folder a name." };

  const { data, error } = await db
    .from("placement_folders")
    .update({ name: clean })
    .eq("id", folderId)
    .eq("owner_id", user.id)
    .select("id");
  if (error?.code === "23505") return { error: "A folder with that name already exists." };
  if (error) return failed(error);
  if (!data?.length) return { error: "Folder not found." };

  refresh();
  return { ok: true, name: clean };
}

/** Deletes a folder. Its placements stay where they are, just no longer in a folder (and no longer off because of it). */
export async function deleteFolder({ folderId }) {
  const { db, user } = await session();
  if (!user) return { error: EXPIRED };
  if (!isId(folderId)) return { error: "Unknown folder." };

  const { data, error } = await db.from("placement_folders").delete().eq("id", folderId).eq("owner_id", user.id).select("id");
  if (error) return failed(error);
  if (!data?.length) return { error: "Folder not found." };

  refresh();
  return { ok: true };
}

/** Switches a folder on or off: everything in it, now and later. */
export async function setFolderEnabled({ folderId, enabled }) {
  const { db, user } = await session();
  if (!user) return { error: EXPIRED };
  if (!isId(folderId)) return { error: "Unknown folder." };

  const { data, error } = await db
    .from("placement_folders")
    .update({ enabled: Boolean(enabled) })
    .eq("id", folderId)
    .eq("owner_id", user.id)
    .select("id");
  if (error) return failed(error);
  if (!data?.length) return { error: "Folder not found." };

  refresh();
  return { ok: true };
}

/** Puts placements in a folder, or takes them out of any folder (folderId null). A placement is in one folder at most. */
export async function movePlacements({ gameId, ids, folderId }) {
  const { db, user } = await session();
  if (!user) return { error: EXPIRED };
  const list = cleanIds(ids);
  if (!isId(gameId) || !list) return { error: "Choose at least one placement." };
  if (folderId !== null && !isId(folderId)) return { error: "Unknown folder." };

  const { data, error } = await db
    .from("placements")
    .update({ folder_id: folderId })
    .in("id", list)
    .eq("game_id", gameId)
    .eq("owner_id", user.id)
    .select("id");
  if (error) return failed(error);
  if (!data?.length) return { error: "Placement not found." };

  refresh();
  return { ok: true, changed: data.length };
}

/** Adds and removes tags on the chosen placements. Tags only label: they switch nothing. */
export async function changeTags({ gameId, ids, add = [], remove = [] }) {
  const { db, user } = await session();
  if (!user) return { error: EXPIRED };
  const list = cleanIds(ids);
  if (!isId(gameId) || !list) return { error: "Choose at least one placement." };
  if (cleanTags(add).length === 0 && cleanTags(remove).length === 0) return { error: "Type a tag." };

  const { data: rows, error } = await db
    .from("placements")
    .select("id, tags")
    .in("id", list)
    .eq("game_id", gameId)
    .eq("owner_id", user.id);
  if (error) return failed(error);
  if (!rows?.length) return { error: "Placement not found." };

  const updates = [];
  let tooMany = 0;
  for (const row of rows) {
    const tags = changedTags(row.tags ?? [], add, remove);
    if (tags === null) tooMany += 1;
    else updates.push({ id: row.id, tags });
  }
  const failure = await writeEach(db, updates, user.id);
  if (failure) return failed(failure);

  refresh();
  return {
    ok: true,
    changed: updates.length,
    ...(tooMany ? { warning: `${tooMany} placement${tooMany === 1 ? " is" : "s are"} already at the limit of 20 tags and was left as it was.` } : {}),
  };
}

/** Renames a tag across the whole game (to "" deletes it). Placements that already have the new name just merge. */
export async function renameTag({ gameId, from, to }) {
  const { db, user } = await session();
  if (!user) return { error: EXPIRED };
  if (!isId(gameId)) return { error: "Unknown game." };
  const source = cleanTags([from])[0];
  if (!source) return { error: "Unknown tag." };

  const { data: rows, error } = await db.from("placements").select("id, tags").eq("game_id", gameId).eq("owner_id", user.id);
  if (error) return failed(error);

  const updates = [];
  for (const row of rows ?? []) {
    const has = (row.tags ?? []).some((tag) => tag.toLowerCase() === source.toLowerCase());
    if (has) updates.push({ id: row.id, tags: renamedTag(row.tags, source, to) });
  }
  const failure = await writeEach(db, updates, user.id);
  if (failure) return failed(failure);

  refresh();
  return { ok: true, changed: updates.length };
}

/** The kind of spot: free text up to 40 characters. null puts the automatic suggestion back. */
export async function setPlaceType({ gameId, ids, type }) {
  const { db, user } = await session();
  if (!user) return { error: EXPIRED };
  const list = cleanIds(ids);
  if (!isId(gameId) || !list) return { error: "Choose at least one placement." };
  const cleaned = cleanPlaceType(type);
  if (cleaned.error) return { error: cleaned.error };

  const { data, error } = await db
    .from("placements")
    .update({ place_type: cleaned.value })
    .in("id", list)
    .eq("game_id", gameId)
    .eq("owner_id", user.id)
    .select("id");
  if (error) return failed(error);
  if (!data?.length) return { error: "Placement not found." };

  refresh();
  return { ok: true, changed: data.length };
}

/** Saves a new name on a placement (the label shown in the dashboard). */
export async function renamePlacement({ placementId, label }) {
  const { db, user } = await session();
  if (!user) return { error: EXPIRED };
  if (!isId(placementId)) return { error: "Unknown placement." };
  const clean = String(label ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
  if (!clean) return { error: "Give the placement a name." };

  const { data, error } = await db
    .from("placements")
    .update({ label: clean })
    .eq("id", placementId)
    .eq("owner_id", user.id)
    .select("id");
  if (error) return failed(error);
  if (!data?.length) return { error: "Placement not found." };

  refresh();
  return { ok: true, label: clean };
}

/** Writes each tag list in turn, in small batches. Returns the first error, or null. */
async function writeEach(db, updates, ownerId) {
  for (let start = 0; start < updates.length; start += 20) {
    const results = await Promise.all(
      updates
        .slice(start, start + 20)
        .map((entry) => db.from("placements").update({ tags: entry.tags }).eq("id", entry.id).eq("owner_id", ownerId))
    );
    const bad = results.find((result) => result.error);
    if (bad) return bad.error;
  }
  return null;
}
