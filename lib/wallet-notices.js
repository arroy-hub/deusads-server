// The wallet's notifications (migration 0061): a campaign that is running out of budget or has run out, and what a
// developer's games earned. Everything here is best effort: it never throws and never holds up what caused it.

import { notify, notifyMany } from "./notify.js";
import { credits, developerPart, lastDays, walletMissing } from "./wallet.js";

export const ADVERTISER_WALLET = "/dashboard/wallet";
export const DEVELOPER_WALLET = "/dashboard/wallet/earnings";
export const campaignLink = (campaignId) => `/dashboard/advertising/c/${campaignId}`;

/** The text of a budget notice for the advertiser. */
export function budgetNoticeText(row) {
  if (row.kind === "out") return `${row.name} has stopped: the budget is used up. Add budget to start it again.`;
  const budget = Number(row.budget) || 0;
  const pct = budget > 0 ? Math.min(99, Math.floor(((Number(row.spent) || 0) / budget) * 100)) : 90;
  return `${row.name} has used ${pct}% of its budget.`;
}

/**
 * Tells advertisers whose campaign has used 90% of its budget or has run out (each once, see wallet_take_notices),
 * and for a campaign that ran out also the developers it was showing for and the admins. Returns how many were told.
 */
export async function sendBudgetNotices(service) {
  try {
    const { data, error } = await service.rpc("wallet_take_notices");
    if (error) {
      if (!walletMissing(error)) console.error("[DeusADS] wallet notices:", error.code, error.message);
      return 0;
    }
    for (const row of data ?? []) {
      await notify(service, { accountId: row.advertiser_id, text: budgetNoticeText(row), link: campaignLink(row.campaign_id), type: "adv_budget" });
      if (row.kind !== "out") continue;
      const [live, admins, advertiser] = await Promise.all([
        service.from("bookings").select("developer_id").eq("campaign_id", row.campaign_id).eq("status", "approved").limit(2000),
        service.from("accounts").select("id").eq("role", "admin"),
        service.from("accounts").select("company, email").eq("id", row.advertiser_id).maybeSingle(),
      ]);
      const developers = (live.data ?? []).map((booking) => booking.developer_id).filter((id) => id !== row.advertiser_id);
      await notifyMany(service, developers, `${row.name} is paused in your games: its budget ran out.`, DEVELOPER_WALLET, "dev_budget");
      const who = advertiser.data?.company || advertiser.data?.email || "an advertiser";
      await notifyMany(service, (admins.data ?? []).map((account) => account.id).filter((id) => id !== row.advertiser_id), `${row.name} (${who}) ran out of budget.`, "/dashboard/admin/wallet");
    }
    return (data ?? []).length;
  } catch (error) {
    console.error("[DeusADS] wallet notices failed:", error?.message ?? error);
    return 0;
  }
}

/** "+24.50 C. earned yesterday" / "+151.31 C. earned last week": the developer's daily and weekly line. */
export const earnedText = (amount, period) => `+${credits(amount)} C. earned ${period}`;

/**
 * Once a day (the cron): every developer whose games earned something yesterday is told how much, and on a Monday also
 * what the week before brought. A second run on the same day tells nobody twice. Returns how many notices were sent.
 */
export async function sendEarningNotices(service, now = Date.now()) {
  try {
    const days = lastDays(8, now); // the seven days before today, and today
    const yesterday = days[6];
    const monday = new Date(now).getUTCDay() === 1;
    const { data, error } = await service.from("wallet_earnings").select("developer_id, day, amount").gte("day", days[0]).lte("day", yesterday).limit(50000);
    if (error) {
      if (!walletMissing(error)) console.error("[DeusADS] earning notices:", error.code, error.message);
      return 0;
    }
    const sums = new Map();
    for (const row of data ?? []) {
      const entry = sums.get(row.developer_id) ?? { day: 0, week: 0 };
      const amount = Number(row.amount) || 0;
      entry.week += amount;
      if (String(row.day).slice(0, 10) === yesterday) entry.day += amount;
      sums.set(row.developer_id, entry);
    }
    const since = `${days[7]}T00:00:00Z`;
    let sent = 0;
    for (const [accountId, sum] of sums) {
      const texts = [];
      if (developerPart(sum.day) >= 0.005) texts.push(earnedText(developerPart(sum.day), "yesterday"));
      if (monday && developerPart(sum.week) >= 0.005) texts.push(earnedText(developerPart(sum.week), "last week"));
      if (!texts.length) continue;
      const { data: already } = await service.from("notifications").select("text").eq("account_id", accountId).eq("link", DEVELOPER_WALLET).gte("created_at", since);
      const told = new Set((already ?? []).map((row) => row.text));
      for (const text of texts) {
        if (told.has(text) || [...told].some((old) => old.endsWith(text.slice(text.indexOf(" C. earned"))))) continue;
        await notify(service, { accountId, text, link: DEVELOPER_WALLET, type: "dev_earned" });
        sent += 1;
      }
    }
    return sent;
  } catch (error) {
    console.error("[DeusADS] earning notices failed:", error?.message ?? error);
    return 0;
  }
}
