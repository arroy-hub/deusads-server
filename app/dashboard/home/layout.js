import { redirect } from "next/navigation";
import { getMember } from "../../../lib/admin";
import { loadHome } from "../../../lib/home-data";
import HomeApp from "./home-app";
import "./home.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Home" };

/**
 * Home, its guides and the news list are one window: this layout loads the data once and the three pages below only
 * tell which view is open (so moving between them never reloads anything, and the slide can run).
 */
export default async function HomeLayout() {
  const me = await getMember();
  if (!me) redirect("/login");
  // An admin has no Home of their own, but can look at both: the side menu's view (Advertiser / Developer, kept in the
  // browser) picks which one is shown, so both are loaded and HomeApp chooses.
  const admin = me.role === "admin";
  const role = me.role === "advertiser" ? "adv" : "dev";
  const [data, account, choices] = await Promise.all([
    admin ? null : loadHome(me),
    me.service.from("accounts").select("company").eq("id", me.user.id).maybeSingle().then((result) => result.data).catch(() => null),
    admin ? Promise.all([loadHome({ ...me, role: "developer" }), loadHome({ ...me, role: "advertiser" })]).then(([dev, adv]) => ({ dev, adv })) : null,
  ]);
  const today = new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  const name = account?.company || me.user.email || "";
  return <HomeApp role={role} data={data ?? choices.dev} choices={choices} name={name} today={today} />;
}
