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
  // Every role sees the same Help & feedback: the Assistant tab with the detailed message, and My requests. An admin answers
  // other people's requests on the Support page; what they write here is a request of their own, like anyone's.
  const [mine, assistant] = await Promise.all([loadMyRequests(me.service, me.user.id), botStatus(me.service)]);
  return (
    <SupportPage
      role={me.role}
      requests={mine.requests}
      folders={mine.folders}
      outdated={mine.outdated}
      assistantOn={assistant.on}
      greeting={assistant.greeting}
      initialTab={tab === "requests" ? "requests" : "assistant"}
      initialOpen={typeof open === "string" ? open : null}
    />
  );
}
