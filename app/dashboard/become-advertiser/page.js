import { redirect } from "next/navigation";
import { getMember } from "../../../lib/admin";
import { bookingsMissing } from "../../../lib/booking-rules";
import ApplicationForm from "./application-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Become an advertiser" };

export default async function BecomeAdvertiserPage() {
  const me = await getMember();
  if (!me) redirect("/login");

  const { data: latest, error } = await me.service
    .from("role_requests")
    .select("company, status, review_note, created_at")
    .eq("account_id", me.user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <>
      <div className="main-head">
        <h1>Advertise in games</h1>
      </div>

      {me.role !== "developer" ? (
        <p className="lede">Your account can already advertise. Find the tools under Advertising in the menu.</p>
      ) : (
        <>
          <p className="lede">
            Advertisers book placements in developers' games. Tell us who you are and an admin will review
            your application. Your games and their placements stay as they are.
          </p>

          {bookingsMissing(error) && (
            <p className="notice">
              Run <code>supabase/migrations/0013_process_gaps.sql</code> in the Supabase SQL editor to turn
              applications on.
            </p>
          )}

          {latest?.status === "pending" ? (
            <div className="panel">
              <div className="settings-title">Application sent</div>
              <p className="settings-help">
                {latest.company}, sent {String(latest.created_at).slice(0, 10)}. It is waiting for review;
                you will be notified here when it is decided.
              </p>
            </div>
          ) : (
            <>
              {latest?.status === "rejected" && (
                <p className="notice" style={{ marginBottom: "1.5rem" }}>
                  Your last application ({latest.company}) was rejected
                  {latest.review_note ? `: ${latest.review_note}` : "."} You can apply again.
                </p>
              )}
              <ApplicationForm />
            </>
          )}
        </>
      )}
    </>
  );
}
