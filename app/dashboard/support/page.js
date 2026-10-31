import { redirect } from "next/navigation";
import { getMember } from "../../../lib/admin";
import { loadMyRequests } from "../../../lib/support-data";
import { botStatus } from "../../../lib/support-bot";
import SupportPage from "./support-page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Help & feedback" };

export default async function HelpPage({ searchParams }) {
  const me = await getMember();
  if (!me) redirect("/login");
  const { tab, open } = await searchParams;
  // An admin answers requests instead of sending them (that is the Support page): here they only try the assistant, so
  // there are no requests of their own to load.
  const admin = me.role === "admin";
  const [mine, assistant] = await Promise.all([admin ? { requests: [], folders: [], outdated: false } : loadMyRequests(me.service, me.user.id), botStatus(me.service)]);
  return (
    <SupportPage
      role={me.role}
      requests={mine.requests}
      folders={mine.folders}
      outdated={mine.outdated}
      assistantOn={assistant.on}
      greeting={assistant.greeting}
      initialTab={tab === "requests" && !admin ? "requests" : "assistant"}
      initialOpen={typeof open === "string" && !admin ? open : null}
    />
  );
}
