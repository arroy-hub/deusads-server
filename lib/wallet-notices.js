// The wallet's notifications (migration 0061): a campaign that is running out of budget or has run out, and what a
// developer's games earned. Everything here is best effort: it never throws and never holds up what caused it.

import { notify, notifyMany } from "./notify.js";
import { LOW_BUDGET, credits, developerPart, lastDays, payoutAmount, payoutDue, walletMissing } from "./wallet.js";

export const ADVERTISER_WALLET = "/dashboard/wallet";
export const DEVELOPER_WALLET = "/dashboard/wallet/earnings";
export const campaignLink = (campaignId) => `/dashboard/advertising/c/${campaignId}`;

/** The text of a budget notice for the advertiser. */
export function budgetNoticeText(row) {
  if (row.kind === "out") return `"${row.name}" stopped: out of budget. Add budget to restart it.`;
  const budget = Number(row.budget) || 0;
  const pct = budget > 0 ? Math.min(99, Math.floor(((Number(row.spent) || 0) / budget) * 100)) : LOW_BUDGET;
  return `"${row.name}" has used ${pct}% of its budget.`;
}

/**
 * Tells advertisers whose campaign has used 85% of its budget or has run out (each once, see wallet_take_notices),
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
      await notifyMany(service, developers, `"${row.name}" paused in your games: out of budget.`, DEVELOPER_WALLET, "dev_budget");
      const who = advertiser.data?.company || advertiser.data?.email || "an advertiser";
      await notifyMany(service, (admins.data ?? []).map((account) => account.id).filter((id) => id !== row.advertiser_id), `"${row.name}" (${who}) is out of budget.`, "/dashboard/admin/wallet");
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


/**
 * The monthly payout (migration 0068). On the 1st of a month (and the two days after, to catch up a missed run) every
 * developer whose balance has reached the minimum is paid the whole of it: the payout is written down and the balance
 * starts again from zero. During the pilot it is a demo: no money is sent, and the notice says so.
 * The balance counts what was earned before the payout day. A second run pays nobody twice. Returns how many were paid.
 */
export async function runPayouts(service, now = Date.now()) {
  try {
    const day = payoutDue(now);
    if (!day) return 0;
    const [earned, paid] = await Promise.all([
      service.from("wallet_earnings").select("developer_id, amount").lt("day", day).limit(100000),
      service.from("wallet_payouts").select("developer_id, day, amount").limit(50000),
    ]);
    if (earned.error || paid.error) {
      const failed = earned.error ?? paid.error;
      if (!walletMissing(failed) && failed.code !== "42P01" && failed.code !== "PGRST205") console.error("[DeusADS] payouts:", failed.code, failed.message);
      return 0;
    }
    const balance = new Map();
    for (const row of earned.data ?? []) balance.set(row.developer_id, (balance.get(row.developer_id) ?? 0) + developerPart(Number(row.amount) || 0));
    const done = new Set();
    for (const row of paid.data ?? []) {
      balance.set(row.developer_id, (balance.get(row.developer_id) ?? 0) - (Number(row.amount) || 0));
      if (String(row.day).slice(0, 10) === day) done.add(row.developer_id);
    }
    let sent = 0;
    for (const [developerId, sum] of balance) {
      const amount = payoutAmount(sum);
      if (!amount || done.has(developerId)) continue;
      const { error } = await service.from("wallet_payouts").insert({ developer_id: developerId, day, amount, demo: true });
      if (error) continue; // somebody else just wrote it (the pair developer + day is unique)
      await notify(service, { accountId: developerId, text: payoutText(amount), link: `${DEVELOPER_WALLET}?tab=history`, type: "dev_payout" });
      sent += 1;
    }
    return sent;
  } catch (error) {
    console.error("[DeusADS] payouts failed:", error?.message ?? error);
    return 0;
  }
}

/** What a developer reads about a demo payout. */
export const payoutText = (amount) => `Demo payout: ${credits(amount)} C. Pilot: no money was sent. Your balance starts again from zero.`;
