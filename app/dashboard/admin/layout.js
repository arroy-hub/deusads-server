import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdmin } from "../../../lib/admin";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }) {
  // Anyone who is not an admin gets the same page as a URL that does not exist.
  if (!(await getAdmin())) notFound();

  return (
    <>
      <nav className="subnav" aria-label="Admin">
        <Link href="/dashboard/admin">Moderation</Link>
        <Link href="/dashboard/admin/bookings">Bookings</Link>
        <Link href="/dashboard/admin/applications">Applications</Link>
        <Link href="/dashboard/admin/users">Users</Link>
        <Link href="/dashboard/admin/system">System</Link>
      </nav>
      {children}
    </>
  );
}
