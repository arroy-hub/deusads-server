// Reads what the Performance tab needs from the database and hands lib/performance-view.js its answers.
// The rules (what to count, how to group) are in performance-view.js; this file only talks to Supabase.

import { isSchemaOutdated } from "./api.js";
import { loadAudience } from "./audience.js";
import { formatLabel, formatOf } from "./formats.js";
import {
  assembleFocus,
  assembleList,
  buildPlan,
  cellFrom,
  chunkScopes,
  defaultBreakdown,
  parseParams,
  windowOf,
} from "./performance-view.js";

const PAGE = 1000; // the most rows PostgREST returns at once

/** Every row of a query, page by page (a game can have more than PAGE places). */
async function readAll(makeQuery) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await makeQuery().range(from, from + PAGE - 1);
    if (error) return { data: null, error };
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE) return { data: rows, error: null };
  }
}

const missingFunction = (error) => Boolean(error) && (error.code === "PGRST202" || error.code === "42883" || isSchemaOutdated(error));

/**
 * The placements of a game as the Performance tab sees them: the live ones as items (folder, tags, type,
 * places, switches), the ids of the removed ones, and the game's folders and scenes switched off.
 * Without migration 0021 a placement is just a name and a scene.
 */
export async function loadPlacementItems(db, gameId) {
  const full =
    "id, external_id, label, scene, aspect_ratio, shared, enabled, folder_id, tags, place_type, place_type_suggested, removed_at";
  const plain = "id, external_id, label, scene, aspect_ratio, removed_at";
  const read = (columns) => readAll(() => db.from("placements").select(columns).eq("game_id", gameId).order("id"));

  let organized = true;
  let placements = await read(full);
  if (placements.error && isSchemaOutdated(placements.error)) {
    organized = false;
    placements = await read(plain);
  }
  if (placements.error) return { error: placements.error };

  const [folders, places, off] = organized
    ? await Promise.all([
        db.from("placement_folders").select("id, name, enabled, parent_id").eq("game_id", gameId).order("name"),
        readAll(() => db.from("placement_places").select("id, placement_id, scene, path, removed_at").eq("game_id", gameId).order("id")),
        db.from("placement_scene_off").select("scene").eq("game_id", gameId),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];

  const placesOf = new Map();
  for (const row of places.error ? [] : places.data ?? []) {
    if (row.removed_at) continue;
    if (!placesOf.has(row.placement_id)) placesOf.set(row.placement_id, []);
    placesOf.get(row.placement_id).push({ id: row.id, scene: row.scene ?? "", path: row.path ?? "" });
  }

  const items = [];
  const removedIds = [];
  for (const row of placements.data ?? []) {
    if (row.removed_at) {
      removedIds.push(row.id);
      continue;
    }
    const aspect = Number(row.aspect_ratio) || 0;
    const known = formatOf(aspect);
    // A placement reported before places existed has none: its single scene stands in for one.
    const where = placesOf.get(row.id) ?? (row.scene ? [{ id: null, scene: row.scene, path: "" }] : []);
    items.push({
      id: row.id,
      externalId: row.external_id,
      label: row.label || row.external_id,
      shared: row.shared !== false,
      enabled: row.enabled !== false,
      folderId: row.folder_id ?? null,
      tags: row.tags ?? [],
      placeType: row.place_type ?? null,
      suggestedType: row.place_type_suggested ?? null,
      format: known ? formatLabel(known) : null,
      places: where.sort((a, b) => `${a.scene}/${a.path}`.localeCompare(`${b.scene}/${b.path}`)),
    });
  }
  items.sort((a, b) => String(a.label).localeCompare(String(b.label), undefined, { numeric: true, sensitivity: "base" }));

  return {
    items,
    removedIds,
    folders: (folders.error ? [] : folders.data ?? []).map((folder) => ({ id: folder.id, name: folder.name, enabled: folder.enabled !== false, parentId: folder.parent_id ?? null })),
    offScenes: new Set((off.error ? [] : off.data ?? []).map((entry) => entry.scene)),
  };
}

/** Name, advertiser and a picture for each creative shown on a placement. Read with the service client, only for the ids given. */
async function loadCreativeInfo(service, ids) {
  const info = new Map();
  if (!service || ids.length === 0) return info;
  const { data: creatives } = await service.from("creatives").select("id, name, storage_path, kind, owner_id").in("id", ids);
  const ownerIds = [...new Set((creatives ?? []).filter((row) => row.kind !== "own").map((row) => row.owner_id).filter(Boolean))];
  const { data: accounts } = ownerIds.length > 0 ? await service.from("accounts").select("id, company").in("id", ownerIds) : { data: [] };
  const company = new Map((accounts ?? []).map((row) => [row.id, row.company]));
  for (const row of creatives ?? []) {
    info.set(row.id, {
      name: row.name,
      company: row.kind === "own" ? "" : company.get(row.owner_id) || "Advertiser",
      url: row.storage_path ? service.storage.from("creatives").getPublicUrl(row.storage_path).data.publicUrl : "",
    });
  }
  return info;
}

/**
 * Everything the Performance tab shows, for the address it was opened with.
 * Returns { model, defaultBy } or { error: "migration" | "failed" }. "migration": 0022 is not applied yet.
 */
export async function loadPerformance({ db, service, gameId, searchParams, now = new Date() }) {
  const loaded = await loadPlacementItems(db, gameId);
  if (loaded.error) {
    console.error("[DeusADS] performance: placements query failed:", loaded.error.code, loaded.error.message);
    return { error: "failed" };
  }
  const { items, removedIds, folders, offScenes } = loaded;
  const ctx = { folders, offScenes };

  const parsed = parseParams(searchParams);
  const defaultBy = defaultBreakdown(items, folders);
  const state = { ...parsed, by: parsed.by ?? defaultBy };
  const win = windowOf(state.days, now);
  const plan = buildPlan({ items, removedIds, state, ctx });

  const base = { p_game_id: gameId, p_from: win.from, p_to: win.to };
  const parts = chunkScopes(plan.scopes);
  const chartScope = plan.scopes.filter((scope) => scope.key === plan.chartScope);
  const [totals, days, creatives, audience] = await Promise.all([
    Promise.all(parts.map((part) => db.rpc("game_performance", { ...base, p_scopes: part, p_by_day: false }))),
    db.rpc("game_performance", { ...base, p_scopes: chartScope, p_by_day: true }),
    plan.mode === "focus" ? db.rpc("game_performance_creatives", { ...base, p_members: plan.creativeMembers }) : Promise.resolve({ data: [] }),
    // who the players are; a database without migration 0034 just leaves the panel out
    loadAudience((dimension) => db.rpc("game_audience", { ...base, p_dimension: dimension })),
  ]);

  const failure = totals.map((result) => result.error).find(Boolean) ?? days.error ?? creatives.error;
  if (failure) {
    if (missingFunction(failure)) return { error: "migration" };
    console.error("[DeusADS] performance: query failed:", failure.code, failure.message);
    return { error: "failed" };
  }

  const cellOf = new Map();
  for (const result of totals) for (const row of result.data ?? []) if (!row.day) cellOf.set(row.scope_key, cellFrom(row));
  const dayRows = (days.data ?? []).filter((row) => row.day);

  if (plan.mode === "focus") {
    const creativeRows = creatives.data ?? [];
    const creativeInfo = await loadCreativeInfo(service, [...new Set(creativeRows.map((row) => row.creative_id).filter(Boolean))]);
    const folderName = folders.find((folder) => folder.id === plan.item.folderId)?.name ?? "";
    return { model: { ...assembleFocus({ plan, state, ctx, win, cellOf, dayRows, creativeRows, creativeInfo, folderName }), audience }, defaultBy };
  }
  return { model: { ...assembleList({ plan, items, state, ctx, win, cellOf, dayRows }), audience }, defaultBy };
}
