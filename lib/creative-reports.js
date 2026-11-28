// Reports about creatives, read for the people on both sides of them (the admin's side is lib/admin-cards-data.js).
import { pictureFor, pictureId, shapeAspect, shapeLabel } from "./game-pictures.js";
import { loadPictureInputs } from "./picture-landing.js";
import { creativeSignal, developerOutcome, mayReport, signalIsLoud } from "./report-rules.js";
import { notify } from "./notify.js";

const statusOf = (d) => (d.status === "open" ? "open" : d.outcome ?? "dismissed");
const newest = (a, b) => String(b.created_at).localeCompare(String(a.created_at));

/** When the pictures of these creatives last changed: Map(creativeId -> { creative: iso, shapes: Map(formatId -> iso) }). */
async function changesOf(service, creativeIds) {
  const ids = [...new Set(creativeIds)].filter(Boolean);
  const out = new Map();
  if (!ids.length) return out;
  const [creatives, assets] = await Promise.all([
    service.from("creatives").select("*").in("id", ids),
    service.from("creative_assets").select("creative_id, format_id, created_at").in("creative_id", ids),
  ]);
  for (const c of creatives.data ?? []) out.set(c.id, { creative: [c.reviewed_at, c.picture_at].filter(Boolean).sort().pop() ?? null, shapes: new Map() });
  for (const a of assets.data ?? []) {
    const entry = out.get(a.creative_id);
    if (entry && a.format_id && String(a.created_at) > String(entry.shapes.get(a.format_id) ?? "")) entry.shapes.set(a.format_id, a.created_at);
  }
  return out;
}
const changedAt = (changes, creativeId, shape) => {
  const entry = changes.get(creativeId);
  if (!entry) return null;
  return [entry.creative, shape ? entry.shapes.get(shape) : null].filter(Boolean).sort().pop() ?? null;
};

/** What one report says to the developer who sent it. */
function shapeReport(d, changes) {
  const status = statusOf(d);
  const last = { status, resolvedAt: d.resolved_at };
  return {
    id: d.id,
    creativeId: d.creative_id,
    shape: d.shape ?? null,
    gameId: d.game_id,
    reason: d.reason,
    comment: d.comment ?? "",
    status,
    ...developerOutcome(status),
    sentAt: d.created_at,
    decidedAt: d.resolved_at ?? null,
    note: d.dev_note ?? "", // the message from DeusADS (migration 0064)
    again: status !== "open" && status !== "removed" && mayReport(last, changedAt(changes, d.creative_id, d.shape)),
  };
}

/**
 * The developer's own reports in one game, the latest per picture: Map(key -> report), where the key is the picture
 * (creative id, a colon, the shape) or the creative id for a report about a whole creative.
 */
export async function loadGameReports(service, gameId, developerId) {
  const { data, error } = await service.from("creative_disputes").select("*").eq("game_id", gameId).eq("developer_id", developerId).order("created_at", { ascending: false }).limit(500);
  const out = new Map();
  if (error) return out;
  const mine = (data ?? []).filter((d) => (d.initiator ?? "developer") === "developer");
  const changes = await changesOf(service, mine.map((d) => d.creative_id)).catch(() => new Map());
  for (const d of mine) {
    const key = d.shape ? pictureId(d.creative_id, d.shape) : d.creative_id;
    if (!out.has(key)) out.set(key, shapeReport(d, changes));
  }
  return out;
}

/** Every report a developer sent, newest first, with the names and the reported picture: for My requests. */
export async function loadDeveloperReports(service, developerId, { limit = 200 } = {}) {
  const { data, error } = await service.from("creative_disputes").select("*").eq("developer_id", developerId).order("created_at", { ascending: false }).limit(limit);
  if (error) return [];
  const mine = (data ?? []).filter((d) => (d.initiator ?? "developer") === "developer");
  if (!mine.length) return [];
  const creativeIds = [...new Set(mine.map((d) => d.creative_id))];
  const [games, campaigns, inputs, changes, pictureBlocks, wholeBlocks] = await Promise.all([
    service.from("games").select("id, name").in("id", [...new Set(mine.map((d) => d.game_id))]),
    service.from("campaigns").select("id, name").in("id", [...new Set(mine.map((d) => d.campaign_id).filter(Boolean))]),
    loadPictureInputs(service, { creativeIds }).catch(() => null),
    changesOf(service, creativeIds).catch(() => new Map()),
    service.from("game_picture_blocks").select("game_id, creative_id, shape").eq("developer_id", developerId),
    service.from("game_ad_controls").select("game_id, target_id").eq("developer_id", developerId).eq("scope", "creative"),
  ]);
  const gameName = new Map((games.data ?? []).map((g) => [g.id, g.name]));
  const campaignName = new Map((campaigns.data ?? []).map((c) => [c.id, c.name]));
  const blocked = new Set([...(pictureBlocks.data ?? []).map((b) => `${b.game_id}|${b.creative_id}|${b.shape}`), ...(wholeBlocks.data ?? []).map((b) => `${b.game_id}|${b.target_id}|*`)]);
  const url = (path) => (path ? service.storage.from("creatives").getPublicUrl(path).data.publicUrl : "");
  return mine.map((d) => {
    const creative = inputs?.creativeOf.get(d.creative_id);
    const pick = d.shape && creative ? pictureFor({ creative, assets: inputs.assetsOf.get(d.creative_id) ?? [], aspect: shapeAspect(d.shape) }) : null;
    const label = d.shape ? shapeLabel(d.shape) : "";
    return {
      ...shapeReport(d, changes),
      game: gameName.get(d.game_id) ?? "Game",
      campaign: campaignName.get(d.campaign_id) ?? "",
      creative: creative?.name ?? "Creative",
      picture: `${creative?.name ?? "Creative"}${label ? ` · ${label}` : ""}`,
      url: url(pick?.kind === "asset" ? pick.asset?.storagePath : creative?.storagePath),
      blockedWhole: blocked.has(`${d.game_id}|${d.creative_id}|*`),
      blocked: blocked.has(`${d.game_id}|${d.creative_id}|*`) || (d.shape ? blocked.has(`${d.game_id}|${d.creative_id}|${d.shape}`) : false),
    };
  });
}

/**
 * How developers react to these creatives, for their advertiser: Map(creativeId -> signal of lib/report-rules.js).
 * `gamesOf` is Map(creativeId -> [gameId]) of where each is booked. Who blocked or reported is never part of it.
 */
export async function loadCreativeSignals(service, creativeIds, gamesOf = new Map()) {
  const ids = [...new Set(creativeIds)].filter(Boolean);
  const out = new Map();
  if (!ids.length) return out;
  const [pictures, whole, reports] = await Promise.all([
    service.from("game_picture_blocks").select("game_id, creative_id, reason").in("creative_id", ids),
    service.from("game_ad_controls").select("game_id, target_id, reason").eq("scope", "creative").in("target_id", ids),
    service.from("creative_disputes").select("*").in("creative_id", ids),
  ]);
  for (const id of ids) {
    out.set(id, creativeSignal({
      games: gamesOf.get(id) ?? [],
      blocks: [...(whole.data ?? []).filter((b) => b.target_id === id), ...(pictures.data ?? []).filter((b) => b.creative_id === id)].map((b) => ({ gameId: b.game_id, reason: b.reason })),
      reports: (reports.data ?? []).filter((d) => d.creative_id === id && (d.initiator ?? "developer") === "developer").sort(newest).map((d) => ({ status: statusOf(d) })),
    }));
  }
  return out;
}

/**
 * After a block: a creative that is now blocked in several of the games it runs in gets its advertiser one piece of
 * advice (lib/report-rules.js signalIsLoud). Told once per creative; a new version starts the count of tellings again.
 */
export async function adviseOnSignal(service, creativeIds) {
  const ids = [...new Set(creativeIds)].filter(Boolean);
  if (!ids.length) return;
  const { data: creatives, error } = await service.from("creatives").select("id, name, owner_id, signal_notified_at").in("id", ids).is("signal_notified_at", null);
  if (error || !creatives?.length) return;
  const open = creatives.map((c) => c.id);
  const { data: bookings } = await service.from("bookings").select("creative_id, placement_id").in("creative_id", open).in("status", ["approved", "pending"]).limit(5000);
  const placementIds = [...new Set((bookings ?? []).map((b) => b.placement_id).filter(Boolean))];
  const { data: placements } = placementIds.length ? await service.from("placements").select("id, game_id").in("id", placementIds) : { data: [] };
  const gameOf = new Map((placements ?? []).map((p) => [p.id, p.game_id]));
  const gamesOf = new Map();
  for (const b of bookings ?? []) {
    const game = gameOf.get(b.placement_id);
    if (!game) continue;
    if (!gamesOf.has(b.creative_id)) gamesOf.set(b.creative_id, []);
    gamesOf.get(b.creative_id).push(game);
  }
  const signals = await loadCreativeSignals(service, open, gamesOf);
  for (const creative of creatives) {
    const signal = signals.get(creative.id);
    if (!signal || !signalIsLoud(signal)) continue;
    const { data: marked } = await service.from("creatives").update({ signal_notified_at: new Date().toISOString() }).eq("id", creative.id).is("signal_notified_at", null).select("id");
    if (!marked?.length) continue;
    await notify(service, { accountId: creative.owner_id, text: `${signal.blocked} of the ${signal.games} games your creative "${creative.name}" runs in have blocked it. Nothing is required of you: it is a signal that another version may reach more players.`, link: `/dashboard/creatives/${creative.id}`, type: "adv_creative_signal" });
  }
}
