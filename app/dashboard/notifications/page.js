import Link from "next/link";
import { userClient } from "../../../lib/supabase-server";
import { bookingsMissing } from "../../../lib/booking-rules";
import MarkRead from "./mark-read";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const db = await userClient();
  const { data, error } = await db
    .from("notifications")
    .select("id, text, link, created_at, read_at")
    .order("created_at", { ascending: false })
    .limit(100);
  const unread = (data ?? []).filter((item) => !item.read_at).length;

  return (
    <>
      <div className="main-head">
        <h1>Notifications</h1>
        {unread > 0 && <MarkRead />}
      </div>

      {bookingsMissing(error) && (
        <p className="notice">
          Run <code>supabase/migrations/0013_process_gaps.sql</code> in the Supabase SQL editor to turn
          notifications on.
        </p>
      )}

      {data?.length ? (
        <div className="panel" style={{ padding: 0 }}>
          <table>
            <tbody>
              {data.map((item) => (
                <tr key={item.id}>
                  <td>
                    {item.link ? (
                      <Link href={item.link} style={{ fontWeight: item.read_at ? 400 : 600 }}>
                        {item.text}
                      </Link>
                    ) : (
                      <span style={{ fontWeight: item.read_at ? 400 : 600 }}>{item.text}</span>
                    )}
                  </td>
                  <td className="num">{String(item.created_at).slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">
          <p style={{ margin: "0 auto" }}>Nothing yet. Decisions on your creatives, bookings and applications show up here.</p>
        </div>
      )}
    </>
  );
}
