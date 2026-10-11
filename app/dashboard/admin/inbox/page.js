import { redirect } from "next/navigation";

// The old Inbox was a shorter copy of the review page: the one page now lives at /dashboard/admin.
export default function InboxPage() {
  redirect("/dashboard/admin");
}
