import { redirect } from "next/navigation";
import { getMember } from "../../../lib/admin";
import { loadMyRequests } from "../../../lib/support-data";
import { botStatus } from "../../../lib/support-bot";
import { loadDeveloperReports } from "../../../lib/creative-reports";
import SupportPage from "./support-page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Help & feedback" };

export default async function HelpPage({ searchParams }) {
  const me = await getMember();
  if (!me) redirect("/login");
  const { tab, open, report } = await searchParams;
  // Every role sees the same Help & feedback: the Assistant tab with the detailed message, and My requests. An admin answers
  // other people's requests on the Support page; what they write here is a request of their own, like anyone's.
  // A developer's reports on creatives live under My requests too, with what DeusADS decided on each.
  const [mine, assistant, reports] = await Promise.all([loadMyRequests(me.service, me.user.id), botStatus(me.service), loadDeveloperReports(me.service, me.user.id).catch(() => [])]);
  return (
    <SupportPage
      role={me.role}
      requests={mine.requests}
      folders={mine.folders}
      outdated={mine.outdated}
      assistantOn={assistant.on}
      greeting={assistant.greeting}
      reports={reports}
      openReport={typeof report === "string" ? report : null}
      initialTab={tab === "requests" || typeof report === "string" ? "requests" : "assistant"}
      initialOpen={typeof open === "string" ? open : null}
    />
  );
}
