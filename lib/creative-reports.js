// Reports about creatives, read for the people on both sides of them (the admin's side is lib/admin-cards-data.js).
import { pictureFor, pictureId, shapeAspect, shapeLabel } from "./game-pictures.js";
import { holdOf, pictureHoldOf } from "./report-rules.js";
import { loadPictureInputs } from "./picture-landing.js";
import { creativeSignal, developerStage, mayReport, reportSteps, signalIsLoud } from "./report-rules.js";
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

/**
 * The steps of these reports after their decision (lib/report-rules.js reportSteps): Map(disputeId -> [{ key, at }]).
 * Read from the dispute's own history, so every side follows one and the same report.
 */
async function stepsOf(service, disputeIds) {
  const ids = [...new Set(disputeIds)].filter(Boolean);
  const out = new Map();
  if (!ids.length) return out;
  const { data, error } = await service.from("dispute_events").select("dispute_id, text, created_at").in("dispute_id", ids).eq("kind", "decision").order("created_at", { ascending: true }).limit(3000);
  if (error) return out;
  const byDispute = new Map();
  for (const row of data ?? []) {
    if (!byDispute.has(row.dispute_id)) byDispute.set(row.dispute_id, []);
    byDispute.get(row.dispute_id).push({ text: row.text, at: row.created_at });
  }
  for (const [id, events] of byDispute) out.set(id, reportSteps(events));
  return out;
}

/** The developer who sent a report, to tell them about a step of it. Null for an advertiser's report. */
export async function reporterOf(service, disputeId) {
  if (!disputeId) return null;
  const { data } = await service.from("creative_disputes").select("*").eq("id", disputeId).maybeSingle();
  return data && (data.initiator ?? "developer") === "developer" ? data.developer_id ?? null : null;
}

/**
 * Keeps the picture a report is about (migration 0067): a copy of the file, so the dispute shows what was reported
 * even after the advertiser replaced it. Done once per dispute; does nothing before the migration.
 */
export async function keepReportedPicture(service, disputeId, path) {
  if (!disputeId || !path) return;
  const { data, error } = await service.from("creative_disputes").select("reported_path").eq("id", disputeId).maybeSingle();
  if (error || !data || data.reported_path) return;
  const ext = /\.(png|jpe?g)$/i.exec(path)?.[0].toLowerCase() ?? ".png";
  const copy = `reported/${disputeId}${ext}`;
  const { error: copyError } = await service.storage.from("creatives").copy(path, copy);
  if (copyError && !/exist/i.test(String(copyError.message ?? ""))) return;
  await service.from("creative_disputes").update({ reported_path: copy }).eq("id", disputeId);
}

/** What one report says to the developer who sent it. `steps`: what happened after the decision. */
function shapeReport(d, changes, steps = []) {
  const status = statusOf(d);
  const last = { status, resolvedAt: d.resolved_at };
  return {
    steps,
    reportedPath: d.reported_path ?? null,
    id: d.id,
    creativeId: d.creative_id,
    shape: d.shape ?? null,
    gameId: d.game_id,
    reason: d.reason,
    comment: d.comment ?? "",
    status,
    ...developerStage(status, steps),
    stage: developerStage(status, steps).key,
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
  const [changes, steps] = await Promise.all([changesOf(service, mine.map((d) => d.creative_id)).catch(() => new Map()), stepsOf(service, mine.filter((d) => d.status !== "open").map((d) => d.id)).catch(() => new Map())]);
  for (const d of mine) {
    const key = d.shape ? pictureId(d.creative_id, d.shape) : d.creative_id;
    if (!out.has(key)) out.set(key, shapeReport(d, changes, steps.get(d.id) ?? []));
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
  const [games, campaigns, inputs, changes, pictureBlocks, wholeBlocks, steps] = await Promise.all([
    service.from("games").select("id, name").in("id", [...new Set(mine.map((d) => d.game_id))]),
    service.from("campaigns").select("id, name").in("id", [...new Set(mine.map((d) => d.campaign_id).filter(Boolean))]),
    loadPictureInputs(service, { creativeIds }).catch(() => null),
    changesOf(service, creativeIds).catch(() => new Map()),
    service.from("game_picture_blocks").select("game_id, creative_id, shape").eq("developer_id", developerId),
    service.from("game_ad_controls").select("game_id, target_id").eq("developer_id", developerId).eq("scope", "creative"),
    stepsOf(service, mine.filter((d) => d.status !== "open").map((d) => d.id)).catch(() => new Map()),
  ]);
  const gameName = new Map((games.data ?? []).map((g) => [g.id, g.name]));
  const campaignName = new Map((campaigns.data ?? []).map((c) => [c.id, c.name]));
  const blocked = new Set([...(pictureBlocks.data ?? []).map((b) => `${b.game_id}|${b.creative_id}|${b.shape}`), ...(wholeBlocks.data ?? []).map((b) => `${b.game_id}|${b.target_id}|*`)]);
  const url = (path) => (path ? service.storage.from("creatives").getPublicUrl(path).data.publicUrl : "");
  return mine.map((d) => {
    const creative = inputs?.creativeOf.get(d.creative_id);
    const pick = d.shape && creative ? pictureFor({ creative, assets: inputs.assetsOf.get(d.creative_id) ?? [], aspect: shapeAspect(d.shape) }) : null;
    const label = d.shape ? shapeLabel(d.shape) : "";
    const now = url(pick?.kind === "asset" ? pick.asset?.storagePath : creative?.storagePath);
    const mySteps = steps.get(d.id) ?? [];
    return {
      ...shapeReport(d, changes, mySteps),
      // the picture as it was reported (kept since migration 0067), and the one that replaced it once that is approved
      reportedUrl: d.reported_path ? url(d.reported_path) : "",
      newUrl: d.reported_path && mySteps.some((step) => step.key === "replaced") ? now : "",
      game: gameName.get(d.game_id) ?? "Game",
      campaign: campaignName.get(d.campaign_id) ?? "",
      creative: creative?.name ?? "Creative",
      picture: `${creative?.name ?? "Creative"}${label ? ` · ${label}` : ""}`,
      url: d.reported_path ? url(d.reported_path) : now,
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

/**
 * The conversation between an advertiser and DeusADS about creatives on hold (migration 0064): Map(creativeId ->
 * [{ side: "advertiser" | "admin", text, at }]), oldest first. The decision's own message is not in it (it is the hold's note).
 */
export async function loadHoldThreads(service, creativeIds) {
  const out = new Map();
  const ids = [...new Set(creativeIds)].filter(Boolean);
  if (!ids.length) return out;
  const { data: held, error } = await service.from("creatives").select("id, hold_dispute").in("id", ids).not("hold_dispute", "is", null);
  if (error || !held?.length) return out;
  const { data: events } = await service.from("dispute_events").select("dispute_id, side, text, created_at").in("dispute_id", held.map((row) => row.hold_dispute)).eq("kind", "reply").in("side", ["advertiser", "admin"]).order("created_at", { ascending: true }).limit(2000);
  for (const row of held) out.set(row.id, (events ?? []).filter((e) => e.dispute_id === row.hold_dispute).map((e) => ({ side: e.side, text: e.text, at: e.created_at })));
  return out;
}

/** The pictures DeusADS holds (migration 0065): rows of creative_picture_holds, of these creatives or of all. Empty without the table. */
export async function loadPictureHolds(service, creativeIds = null) {
  if (creativeIds && !creativeIds.length) return [];
  let query = service.from("creative_picture_holds").select("creative_id, shape, kind, rule, note, dispute_id, held_at, sent_at").limit(5000);
  if (creativeIds) query = query.in("creative_id", [...new Set(creativeIds)]);
  const { data, error } = await query;
  return error ? [] : data ?? [];
}

/** A test for "is this picture held?": (creativeId, shape) -> the hold row or null. */
export function heldTest(holds) {
  const map = new Map((holds ?? []).map((row) => [pictureId(row.creative_id, row.shape), row]));
  return (creativeId, shape) => (shape ? map.get(pictureId(creativeId, shape)) ?? null : null);
}

/**
 * Everything DeusADS holds of these creatives, as their advertiser reads it: Map(creativeId -> [hold]), each hold with
 * its conversation (`thread`). A hold is of the whole creative (holdOf, an old report without a shape) or of one picture.
 */
export async function loadAdvertiserHolds(service, creativeRows) {
  const out = new Map();
  const rows = creativeRows ?? [];
  if (!rows.length) return out;
  const pictures = await loadPictureHolds(service, rows.map((row) => row.id));
  const list = [];
  for (const row of rows) {
    const whole = holdOf(row);
    if (whole) list.push([row.id, { ...whole, disputeId: row.hold_dispute ?? null }]);
  }
  for (const hold of pictures) list.push([hold.creative_id, pictureHoldOf(hold, shapeLabel(hold.shape))]);
  const disputeIds = [...new Set(list.map(([, hold]) => hold.disputeId).filter(Boolean))];
  const talk = new Map();
  if (disputeIds.length) {
    const { data: events } = await service.from("dispute_events").select("dispute_id, side, text, created_at").in("dispute_id", disputeIds).eq("kind", "reply").in("side", ["advertiser", "admin"]).order("created_at", { ascending: true }).limit(2000);
    for (const e of events ?? []) {
      if (!talk.has(e.dispute_id)) talk.set(e.dispute_id, []);
      talk.get(e.dispute_id).push({ side: e.side, text: e.text, at: e.created_at });
    }
  }
  // the new picture the advertiser uploaded for a held shape: theirs to look at and send (`sent` says whether it was), then shown while DeusADS checks it
  const sentFor = new Map();
  const waiting = list.filter(([, hold]) => hold.shape && hold.kind === "changes").map(([id]) => id);
  if (waiting.length) {
    const { data: assets } = await service.from("creative_assets").select("creative_id, format_id, storage_path, width_px, height_px, created_at").in("creative_id", [...new Set(waiting)]).eq("status", "pending").order("created_at", { ascending: false });
    for (const asset of assets ?? []) {
      const key = pictureId(asset.creative_id, asset.format_id);
      if (asset.format_id && !sentFor.has(key)) sentFor.set(key, { url: service.storage.from("creatives").getPublicUrl(asset.storage_path).data.publicUrl, size: `${asset.width_px} × ${asset.height_px}`, at: asset.created_at });
    }
  }
  for (const [id, hold] of list) {
    if (!out.has(id)) out.set(id, []);
    out.get(id).push({ ...hold, thread: talk.get(hold.disputeId) ?? [], sentPicture: hold.shape && hold.kind === "changes" ? sentFor.get(pictureId(id, hold.shape)) ?? null : null });
  }
  return out;
}
