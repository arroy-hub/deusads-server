"use server";

import { revalidatePath } from "next/cache";
import { getMember } from "../../../lib/admin";
import { cleanCompany, cleanNote } from "../../../lib/admin-rules";
import { bookingsMissing } from "../../../lib/booking-rules";

/**
 * A developer asks to become an advertiser. An admin decides on the Applications
 * screen; approving sets the account's role and company. One open application per
 * account (a unique index), and only developers can apply: admins and advertisers
 * already have what it gives.
 */
export async function applyAsAdvertiser({ company, message }) {
  const me = await getMember();
  if (!me) return { error: "Your session expired. Sign in again." };
  if (me.role !== "developer") return { error: "Your account can already advertise." };

  const name = cleanCompany(company);
  if (!name) return { error: "Enter your company or brand name (at least 2 characters)." };

  const { error } = await me.service
    .from("role_requests")
    .insert({ account_id: me.user.id, company: name, message: cleanNote(message) });

  if (error?.code === "23505") return { error: "You already have an application waiting for review." };
  if (bookingsMissing(error)) return { error: "Applications are not switched on yet. Run migration 0013." };
  if (error) return { error: "Could not send the application. Try again." };

  revalidatePath("/dashboard/become-advertiser");
  revalidatePath("/dashboard/admin/applications");
  return { ok: true };
}
