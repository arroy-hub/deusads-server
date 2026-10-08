"use server";

import { revalidatePath } from "next/cache";
import { getMember } from "../../lib/admin";
import { parseDecision, cleanNote } from "../../lib/admin-rules";
import { bookingErrorMessage } from "../../lib/booking-rules";

function refresh() {
  revalidatePath("/dashboard/requests");
  revalidatePath("/dashboard/admin/bookings");
  revalidatePath("/dashboard/advertising");
}

/**
 * One side of a booking's two-way approval. `side` says which hat the caller
 * wears: "admin" needs the admin role, "developer" needs to own the game the
 * placement belongs to. The state change itself is the database function
 * decide_booking, which locks the row and activates the placement when both agree.
 */
export async function decideBooking({ bookingId, side, decision, note }) {
  const me = await getMember();
  if (!me) return { error: "Your session expired. Sign in again." };

  const verdict = parseDecision(decision);
  if (!verdict) return { error: "Unknown decision." };
  if (side !== "admin" && side !== "developer") return { error: "Unknown role in this decision." };

  const id = String(bookingId ?? "");
  if (side === "admin" && me.role !== "admin") return { error: "Not allowed." };
  if (side === "developer") {
    const { data: booking } = await me.service
      .from("bookings")
      .select("developer_id")
      .eq("id", id)
      .maybeSingle();
    if (!booking || booking.developer_id !== me.user.id) return { error: "Not allowed." };
  }

  const { data, error } = await me.service.rpc("decide_booking", {
    p_booking: id,
    p_side: side,
    p_decision: verdict,
    p_note: cleanNote(note),
  });
  if (error) return { error: bookingErrorMessage(error) };

  refresh();
  return { ok: true, status: data };
}

/** The developer takes a live booking off their own placement. */
export async function stopBooking({ bookingId, note }) {
  const me = await getMember();
  if (!me) return { error: "Your session expired. Sign in again." };

  const { error } = await me.service.rpc("stop_booking", {
    p_booking: String(bookingId ?? ""),
    p_developer: me.user.id,
    p_note: cleanNote(note),
  });
  if (error) return { error: bookingErrorMessage(error) };

  refresh();
  return { ok: true };
}
