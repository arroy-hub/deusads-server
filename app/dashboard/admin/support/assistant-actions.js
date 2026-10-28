"use server";

import { revalidatePath } from "next/cache";
import { getAdmin } from "../../../../lib/admin";
import * as bot from "../../../../lib/support-bot";

// Server actions are public endpoints: each one re-checks that the caller is an admin.

async function run(work) {
  const admin = await getAdmin();
  if (!admin) return { error: "Only an admin can do this." };
  const result = await work(admin.service, { id: admin.user.id, role: "admin" });
  if (result?.ok) revalidatePath("/dashboard/admin/support");
  return result;
}

export const saveBotSettings = async ({ settings }) => run((db, actor) => bot.saveSettings(db, { actor, settings }));
export const switchBot = async ({ enabled }) => run((db, actor) => bot.setEnabled(db, { actor, enabled }));
export const saveGuideArticle = async (fields) => run((db, actor) => bot.saveArticle(db, { actor, ...fields }));
export const switchGuideArticle = async ({ id, enabled }) => run((db, actor) => bot.toggleArticle(db, { actor, id, enabled }));
export const deleteGuideArticle = async ({ id }) => run((db, actor) => bot.removeArticle(db, { actor, id }));
export const tryAssistant = async ({ question, settings }) => {
  const admin = await getAdmin();
  if (!admin) return { error: "Only an admin can do this." };
  return bot.askAssistant(admin.service, { actor: { id: admin.user.id, role: "admin" }, question, preview: true, settings });
};
export const loadAssistantPanel = async ({ period }) => {
  const admin = await getAdmin();
  if (!admin) return { error: "Only an admin can do this." };
  return bot.loadBotAdmin(admin.service, { period });
};
