import { redirect } from "next/navigation";

// Notifications live behind the bell in the top corner now; this keeps old links working.
export default function NotificationsPage() {
  redirect("/dashboard");
}
