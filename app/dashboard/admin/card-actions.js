"use server";

import { getAdmin } from "../../../lib/admin";
import { loadUserCard, loadCreativeCard, loadBookingCard, loadGameCard, loadDisputeCard } from "../../../lib/admin-cards-data";

/** The data of one admin card, loaded when the card opens so any screen can open any card. Admin only. */
export async function loadCard({ kind, id }) {
  const admin = await getAdmin();
  if (!admin) return { error: "Not allowed." };
  const key = String(id ?? "");
  try {
    let data = null;
    if (kind === "user") data = await loadUserCard(admin.service, key, admin.user.id);
    else if (kind === "creative") data = await loadCreativeCard(admin.service, key);
    else if (kind === "booking") data = await loadBookingCard(admin.service, key);
    else if (kind === "dispute") data = await loadDisputeCard(admin.service, key);
    else if (kind === "game") data = await loadGameCard(admin.service, key);
    else return { error: "Unknown card." };
    return data ? { kind, data } : { error: "This item no longer exists." };
  } catch {
    return { error: "The card could not be loaded. Try again." };
  }
}
