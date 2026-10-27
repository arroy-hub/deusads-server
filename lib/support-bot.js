// The assistant on the server: asks the model, judges the answer, writes the log. Every function takes the
// service-role client `db`. The assistant is off until three things are true: the migration is there, an admin switched
// it on, and ANTHROPIC_API_KEY is set. It answers only from support_articles and sees nothing of the person's account.

import { isSchemaOutdated } from "./api.js";
import { LIMITS, assistantRateProblem } from "./support-rules.js";
import {
  DEFAULT_SETTINGS, REASON, buildMessages, buildSystemPrompt, cleanArticle, cleanSettings, dayStart, decide, finishAnswer,
  gapList, mustGoToPerson, overBudget, parseAnswer, percent, sourceLine,
} from "./support-bot-rules.js";

const API = "https://api.anthropic.com/v1/messages";
const MODEL = () => process.env.ASSISTANT_MODEL || "claude-haiku-5-5";
const KEY = () => process.env.ANTHROPIC_API_KEY || "";
const GONE = "Something went wrong. Try again.";
const OUTDATED = "The database needs update 0052 first. Ask an admin to run it.";

export const hasKey = () => Boolean(KEY());

/** Settings, the switch and the enabled guide articles. `outdated` when migration 0052 is missing. */
export async function loadBot(db, { withDisabled = false } = {}) {
  const [row, articles] = await Promise.all([
    db.from("support_bot_settings").select("settings, enabled, updated_at").eq("id", true).maybeSingle(),
    db.from("support_articles").select("id, title, keywords, answer, more, enabled, uses, updated_at").order("updated_at", { ascending: false }).limit(300),
  ]);
  if (isSchemaOutdated(row.error) || isSchemaOutdated(articles.error)) return { outdated: true, enabled: false, settings: cleanSettings({}), articles: [] };
  const list = (articles.data ?? []).filter((a) => withDisabled || a.enabled);
  return { outdated: false, enabled: Boolean(row.data?.enabled), settings: cleanSettings(row.data?.settings), articles: list, updatedAt: row.data?.updated_at ?? null };
}

/** What the page needs to know: whether the chat answers, and its greeting. Never throws. */
export async function botStatus(db) {
  try {
    const bot = await loadBot(db);
    return { on: !bot.outdated && bot.enabled && hasKey() && bot.articles.length > 0, greeting: bot.settings.greet };
  } catch {
    return { on: false, greeting: DEFAULT_SETTINGS.greet };
  }
}

async function callModel({ system, messages }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch(API, {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json", "x-api-key": KEY(), "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODEL(),
        max_tokens: 600,
        temperature: 0,
        // The guide is the same on every call, so it is cached.
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages,
      }),
    });
    if (!response.ok) return { error: `model ${response.status}` };
    const data = await response.json();
    const out = (data.content ?? []).filter((c) => c.type === "text").map((c) => c.text).join("");
    const used = data.usage ?? {};
    return { text: out, tokensIn: (used.input_tokens ?? 0) + (used.cache_read_input_tokens ?? 0) + (used.cache_creation_input_tokens ?? 0), tokensOut: used.output_tokens ?? 0 };
  } catch {
    return { error: "model unreachable" };
  } finally {
    clearTimeout(timer);
  }
}

async function tokensToday(db) {
  const { data } = await db.from("support_bot_log").select("tokens_in, tokens_out").gte("created_at", dayStart()).limit(20000);
  return (data ?? []).reduce((sum, r) => sum + (r.tokens_in ?? 0) + (r.tokens_out ?? 0), 0);
}

async function log(db, row) {
  const made = await db.from("support_bot_log").insert({
    owner_id: row.ownerId,
    question: String(row.question).slice(0, 1000),
    outcome: row.outcome,
    article_id: row.articleId ?? null,
    confidence: row.confidence ?? null,
    reason: row.reason ? String(row.reason).slice(0, 120) : null,
    tokens_in: row.tokensIn ?? 0,
    tokens_out: row.tokensOut ?? 0,
  }).select("id").single();
  return made.data?.id ?? null;
}

/**
 * One question to the assistant. `preview` is the admin trying settings out: nothing is logged or counted and the
 * unsaved `settings` are used. Returns { reply, outcome: "answered"|"escalated"|"off"|"limit", source, escalation, logId, chips }.
 */
export async function askAssistant(db, { actor, question, history = [], preview = false, settings: draft = null }) {
  const q = String(question ?? "").trim().slice(0, 1000);
  if (!q) return { error: "Write a question." };

  const bot = await loadBot(db);
  if (bot.outdated) return { error: OUTDATED };
  const settings = preview && draft ? cleanSettings(draft) : bot.settings;
  if ((!bot.enabled && !preview) || !hasKey() || !bot.articles.length) return { outcome: "off" };

  if (!preview) {
    const today = await db.from("support_bot_log").select("id", { count: "exact", head: true }).eq("owner_id", actor.id).gte("created_at", dayStart());
    const limit = assistantRateProblem(today.count ?? 0, Math.min(settings.maxday, LIMITS.assistantPerDay * 10));
    if (limit) return { outcome: "limit", reply: limit };
    if (overBudget(await tokensToday(db))) return { outcome: "off" };
  }

  const person = mustGoToPerson(q, settings);
  if (person) {
    const logId = preview ? null : await log(db, { ownerId: actor.id, question: q, outcome: "escalated", reason: person });
    return { outcome: "escalated", reply: settings.hand, escalation: person, logId };
  }

  const made = await callModel({ system: buildSystemPrompt(bot.articles, settings), messages: buildMessages(history, q) });
  if (made.error) {
    const logId = preview ? null : await log(db, { ownerId: actor.id, question: q, outcome: "escalated", reason: REASON.down });
    return { outcome: "escalated", reply: settings.hand, escalation: REASON.down, logId };
  }

  const parsed = parseAnswer(made.text, bot.articles);
  const verdict = decide(parsed, settings);
  const article = bot.articles.find((a) => a.id === parsed.articleId) ?? null;
  const logId = preview ? null : await log(db, {
    ownerId: actor.id, question: q, outcome: verdict.outcome, articleId: article?.id, confidence: parsed.confidence,
    reason: verdict.reason, tokensIn: made.tokensIn, tokensOut: made.tokensOut,
  });

  if (verdict.outcome === "escalated") return { outcome: "escalated", reply: settings.hand, escalation: verdict.reason, logId };

  if (!preview && article) await db.from("support_articles").update({ uses: (article.uses ?? 0) + 1 }).eq("id", article.id);
  return {
    outcome: "answered",
    reply: finishAnswer(parsed.answer, settings),
    source: sourceLine(article?.title, parsed.confidence, settings),
    logId,
  };
}

/** "That helped" / "Not solved": the person's rating of an answer, on their own log row only. */
export async function rateAnswer(db, { actor, logId, rating }) {
  if (rating !== "up" && rating !== "down") return { error: GONE };
  const { error } = await db.from("support_bot_log").update({ rating }).eq("id", String(logId ?? "")).eq("owner_id", actor.id);
  return error ? { error: GONE } : { ok: true };
}

/** A request created from an assistant answer remembers which answer it came from (the person's own row only). */
export async function linkLog(db, { logId, ownerId, requestId }) {
  await db.from("support_bot_log").update({ request_id: requestId }).eq("id", logId).eq("owner_id", ownerId).then(() => null, () => null);
}

// ---------------------------------------------------------------- the admin's side

const need = (actor) => (actor?.role === "admin" ? null : "Only an admin can do this.");

export async function saveSettings(db, { actor, settings }) {
  const no = need(actor);
  if (no) return { error: no };
  const clean = cleanSettings(settings);
  const { error } = await db.from("support_bot_settings").update({ settings: clean, updated_at: new Date().toISOString() }).eq("id", true);
  return error ? { error: GONE } : { ok: true, settings: clean };
}

export async function setEnabled(db, { actor, enabled }) {
  const no = need(actor);
  if (no) return { error: no };
  const { error } = await db.from("support_bot_settings").update({ enabled: Boolean(enabled), updated_at: new Date().toISOString() }).eq("id", true);
  return error ? { error: GONE } : { ok: true };
}

export async function saveArticle(db, { actor, id = null, title, keywords, answer, more, enabled = true }) {
  const no = need(actor);
  if (no) return { error: no };
  const clean = cleanArticle({ title, keywords, answer, more });
  if (clean.error) return { error: clean.error };
  const row = { ...clean.article, enabled: Boolean(enabled), updated_at: new Date().toISOString() };
  const done = id ? await db.from("support_articles").update(row).eq("id", String(id)).select("id").single() : await db.from("support_articles").insert(row).select("id").single();
  return done.error || !done.data ? { error: GONE } : { ok: true, id: done.data.id };
}

export async function toggleArticle(db, { actor, id, enabled }) {
  const no = need(actor);
  if (no) return { error: no };
  const { error } = await db.from("support_articles").update({ enabled: Boolean(enabled), updated_at: new Date().toISOString() }).eq("id", String(id));
  return error ? { error: GONE } : { ok: true };
}

export async function removeArticle(db, { actor, id }) {
  const no = need(actor);
  if (no) return { error: no };
  const { error } = await db.from("support_articles").delete().eq("id", String(id));
  return error ? { error: GONE } : { ok: true };
}

const PERIOD_DAYS = { today: 1, week: 7, month: 30 };

/** Everything the Assistant tab shows: switch, settings, guide, numbers for a period, the recent log and the gaps. */
export async function loadBotAdmin(db, { period = "week" } = {}) {
  const bot = await loadBot(db, { withDisabled: true });
  if (bot.outdated) return { outdated: true };
  const days = PERIOD_DAYS[period] ?? 7;
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const [rows, owners] = await Promise.all([
    db.from("support_bot_log").select("id, owner_id, question, outcome, article_id, confidence, reason, rating, tokens_in, tokens_out, created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(2000),
    Promise.resolve(null),
  ]);
  void owners;
  const log = rows.data ?? [];
  const ids = [...new Set(log.map((r) => r.owner_id).filter(Boolean))];
  const people = ids.length ? ((await db.from("accounts").select("id, company, email, role").in("id", ids)).data ?? []) : [];
  const nameOf = new Map(people.map((p) => [p.id, { name: p.company || p.email || "Unknown", role: p.role === "advertiser" ? "Advertiser" : "Developer" }]));
  const titleOf = new Map(bot.articles.map((a) => [a.id, a.title]));

  const answered = log.filter((r) => r.outcome === "answered");
  const passed = log.filter((r) => r.outcome === "escalated");
  const rated = answered.filter((r) => r.rating);
  const reasons = {};
  for (const r of passed) reasons[r.reason ?? REASON.guide] = (reasons[r.reason ?? REASON.guide] ?? 0) + 1;
  const tokens = log.reduce((s, r) => s + (r.tokens_in ?? 0) + (r.tokens_out ?? 0), 0);

  return {
    outdated: false,
    enabled: bot.enabled,
    hasKey: hasKey(),
    model: MODEL(),
    settings: bot.settings,
    articles: bot.articles.map((a) => ({ id: a.id, title: a.title, keywords: a.keywords, answer: a.answer, more: a.more, enabled: a.enabled, uses: a.uses, updatedAt: a.updated_at })),
    stats: {
      total: log.length,
      answered: answered.length,
      passed: passed.length,
      solvedPct: percent(answered.length, log.length),
      helpfulPct: percent(rated.filter((r) => r.rating === "up").length, rated.length),
      rated: rated.length,
      tokens,
    },
    reasons: Object.entries(reasons).sort((a, b) => b[1] - a[1]).map(([reason, count]) => ({ reason, count })),
    gaps: gapList(passed.filter((r) => r.reason !== REASON.human && r.reason !== REASON.angry).map((r) => ({ question: r.question }))),
    recent: log.slice(0, 40).map((r) => ({
      id: r.id, at: r.created_at, question: r.question, outcome: r.outcome, confidence: r.confidence, reason: r.reason, rating: r.rating,
      source: titleOf.get(r.article_id) ?? "", who: nameOf.get(r.owner_id)?.name ?? "Unknown", role: nameOf.get(r.owner_id)?.role ?? "",
    })),
  };
}
