"use server";

import { revalidatePath } from "next/cache";
import { getMember } from "../../../lib/admin";
import { canAdvertise } from "../../../lib/admin-rules";
import { WALLET_MIGRATION, parseAmount, walletError, walletMissing } from "../../../lib/wallet";
import { loadCampaignForDeveloper } from "../../../lib/wallet-data";

const MISSING = `Run supabase/migrations/${WALLET_MIGRATION} in the Supabase SQL editor first.`;

/**
 * Add credits to the caller's wallet. Any amount above zero: credits are demo units for the pilot, nothing is charged.
 * Returns { ok, available, amount } or { error }.
 */
export async function topUp({ amount }) {
  const me = await getMember();
  if (!me) return { error: "Your session expired. Sign in again." };
  if (!canAdvertise(me.role)) return { error: "Not allowed." };
  const value = parseAmount(amount);
  if (!(value > 0)) return { error: "Type an amount above zero." };

  const { data, error } = await me.service.rpc("wallet_topup", { p_account: me.user.id, p_amount: value });
  if (walletMissing(error)) return { error: MISSING };
  if (error) return { error: "Could not add the credits. Try again." };
  if (!data?.ok) return { error: walletError(data) || "Could not add the credits. Try again." };

  revalidatePath("/dashboard", "layout");
  return { ok: true, available: Number(data.available) || 0, amount: value };
}

/**
 * Move credits from the wallet into the budget of one of the caller's campaigns. A campaign that had stopped for lack of
 * budget starts showing again by itself (players see it the next time their game asks for its ads).
 * Returns { ok, available, budget, resumed, amount } or { error }.
 */
export async function addBudget({ campaignId, amount }) {
  const me = await getMember();
  if (!me) return { error: "Your session expired. Sign in again." };
  if (!canAdvertise(me.role)) return { error: "Not allowed." };
  const value = parseAmount(amount);
  if (!(value > 0)) return { error: "Type an amount above zero." };

  const { data, error } = await me.service.rpc("wallet_reserve", { p_account: me.user.id, p_campaign: String(campaignId ?? ""), p_amount: value });
  if (walletMissing(error)) return { error: MISSING };
  if (error) return { error: "Could not add the budget. Try again." };
  if (!data?.ok) return { error: walletError(data) || "Could not add the budget. Try again." };

  revalidatePath("/dashboard", "layout");
  return { ok: true, available: Number(data.available) || 0, budget: Number(data.budget) || 0, resumed: Boolean(data.resumed), amount: value };
}


/**
 * A campaign that paid in the caller's games, for the window that opens from "By campaign" in the developer's wallet:
 * who runs it and how each creative and picture did in their games. Only what happened in the caller's own games.
 */
export async function campaignDetails({ campaignId, days }) {
  const me = await getMember();
  if (!me) return { error: "Your session expired. Sign in again." };
  const period = [7, 30, 90].includes(Number(days)) ? Number(days) : 30;
  const details = await loadCampaignForDeveloper(me.service, me.user.id, String(campaignId ?? ""), { days: period }).catch(() => null);
  return details ? { ok: true, details } : { error: "This campaign has not paid in your games." };
}
