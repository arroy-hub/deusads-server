import { redirect } from "next/navigation";
import { getMember } from "../../../lib/admin";
import { loadMyRequests } from "../../../lib/support-data";
import SupportPage from "./support-page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Help & feedback" };

export default async function HelpPage({ searchParams }) {
  const me = await getMember();
  if (!me) redirect("/login");
  // An admin answers requests instead of sending them: their page is Support (admin side).
  if (me.role === "admin") redirect("/dashboard/admin/support");
  const { tab, open } = await searchParams;
  const mine = await loadMyRequests(me.service, me.user.id);
  return (
    <SupportPage
      role={me.role}
      requests={mine.requests}
      folders={mine.folders}
      outdated={mine.outdated}
      initialTab={tab === "requests" ? "requests" : "assistant"}
      initialOpen={typeof open === "string" ? open : null}
    />
  );
}
