// The assistant end to end against an in-memory database and a pretend model. Run: node test/support-bot-server.test.mjs
import assert from "node:assert/strict";
import { fake } from "./fake-db.mjs";
import { askAssistant, botStatus, loadBot, rateAnswer, saveArticle, saveSettings, setEnabled } from "../lib/support-bot.js";

const admin = { id: "admin-1", role: "admin" };
const person = { id: "dev-1", role: "developer" };
let reply = null;
let calls = 0;
globalThis.fetch = async (_url, init) => {
  calls += 1;
  const body = JSON.parse(init.body);
  assert.ok(body.system[0].text.includes("<guide>"));
  assert.ok(body.messages.at(-1).content.startsWith("<user_question>"));
  return { ok: reply !== "down", status: 500, json: async () => ({ content: [{ type: "text", text: JSON.stringify(reply) }], usage: { input_tokens: 800, output_tokens: 60 } }) };
};

function world({ enabled = true, articles = true } = {}) {
  const db = fake();
  db.tables.support_bot_settings.push({ id: true, settings: {}, enabled, updated_at: new Date().toISOString() });
  if (articles) db.tables.support_articles.push({ id: "a1", title: "Where is my API key?", keywords: "api key", answer: "Open your game → Settings.", more: "", enabled: true, uses: 0, updated_at: new Date().toISOString() });
  return db;
}

// off: no key
delete process.env.ANTHROPIC_API_KEY;
let db = world();
assert.deepEqual(await askAssistant(db, { actor: person, question: "api key?" }), { outcome: "off" });
assert.equal((await botStatus(db)).on, false);

process.env.ANTHROPIC_API_KEY = "test-key";
assert.equal((await botStatus(db)).on, true);

// off: switched off, or an empty guide
assert.equal((await askAssistant(world({ enabled: false }), { actor: person, question: "api key?" })).outcome, "off");
assert.equal((await askAssistant(world({ articles: false }), { actor: person, question: "api key?" })).outcome, "off");

// answered from the guide
reply = { answer: "Open your game → Settings.", article: "a1", confidence: 92, pass: false, reason: "" };
let got = await askAssistant(db, { actor: person, question: "Where is my API key?" });
assert.equal(got.outcome, "answered");
assert.equal(got.reply, "Open your game → Settings.");
assert.equal(got.source, "Source: Where is my API key? · confidence 92%");
assert.ok(got.logId);
assert.equal(db.tables.support_bot_log[0].outcome, "answered");
assert.equal(db.tables.support_bot_log[0].tokens_in, 800);
assert.equal(db.tables.support_articles[0].uses, 1);

// rating: only on the person's own row
assert.deepEqual(await rateAnswer(db, { actor: person, logId: got.logId, rating: "up" }), { ok: true });
assert.equal(db.tables.support_bot_log[0].rating, "up");
await rateAnswer(db, { actor: { id: "someone-else", role: "developer" }, logId: got.logId, rating: "down" });
assert.equal(db.tables.support_bot_log[0].rating, "up");
assert.ok((await rateAnswer(db, { actor: person, logId: got.logId, rating: "meh" })).error);

// not confident enough: passed, with the reason
reply = { answer: "Maybe Settings.", article: "a1", confidence: 55, pass: false, reason: "" };
got = await askAssistant(db, { actor: person, question: "keys somewhere" });
assert.equal(got.outcome, "escalated");
assert.equal(got.escalation, "Assistant not confident (55%)");
assert.ok(got.reply.length > 10);

// the guide does not cover it
reply = { answer: "", article: null, confidence: 0, pass: true, reason: "not in guide" };
got = await askAssistant(db, { actor: person, question: "does it support URP" });
assert.equal(got.escalation, "Not in the guide");

// questions that never reach the model
const before = calls;
got = await askAssistant(db, { actor: person, question: "I want a refund" });
assert.equal(got.escalation, "Money question");
assert.equal(calls, before);

// the model is down: passed on, nothing lost
reply = "down";
got = await askAssistant(db, { actor: person, question: "api key please" });
assert.equal(got.escalation, "Assistant unavailable");

// the daily limit
reply = { answer: "Open your game → Settings.", article: "a1", confidence: 92, pass: false, reason: "" };
const busy = world();
await saveSettings(busy, { actor: admin, settings: { maxday: 5 } });
for (let i = 0; i < 5; i += 1) assert.equal((await askAssistant(busy, { actor: person, question: `api key ${i}` })).outcome, "answered");
assert.equal((await askAssistant(busy, { actor: person, question: "api key again" })).outcome, "limit");
assert.equal((await askAssistant(busy, { actor: { id: "dev-2", role: "developer" }, question: "api key" })).outcome, "answered");

// the admin's preview: unsaved settings, nothing logged, works while switched off
const quiet = world({ enabled: false });
got = await askAssistant(quiet, { actor: admin, question: "api key", preview: true, settings: { sig: true } });
assert.equal(got.outcome, "answered");
assert.ok(got.reply.endsWith("— Deus Assistant"));
assert.equal(quiet.tables.support_bot_log.length, 0);

// only an admin changes the assistant
assert.ok((await saveSettings(db, { actor: person, settings: {} })).error);
assert.ok((await setEnabled(db, { actor: person, enabled: false })).error);
assert.ok((await saveArticle(db, { actor: person, title: "x", answer: "y" })).error);
assert.deepEqual(await setEnabled(db, { actor: admin, enabled: false }), { ok: true });
assert.equal((await loadBot(db)).enabled, false);
assert.ok((await saveArticle(db, { actor: admin, title: "", answer: "y" })).error);
assert.equal((await saveArticle(db, { actor: admin, title: "New", answer: "Yes" })).ok, true);

// the migration is missing
const old = fake({ missing: ["support_bot_settings", "support_articles"] });
assert.equal((await loadBot(old)).outdated, true);
assert.equal((await botStatus(old)).on, false);

console.log("support-bot-server tests passed");
