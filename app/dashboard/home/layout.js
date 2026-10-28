import { redirect } from "next/navigation";
import { getMember } from "../../../lib/admin";
import { loadHome } from "../../../lib/home-data";
import { homeFor } from "../../../lib/nav";
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
  if (me.role === "admin") redirect(homeFor("admin"));
  const role = me.role === "advertiser" ? "adv" : "dev";
  const [data, account] = await Promise.all([
    loadHome(me),
    me.service.from("accounts").select("company").eq("id", me.user.id).maybeSingle().then((result) => result.data).catch(() => null),
  ]);
  const today = new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  const name = account?.company || me.user.email || "";
  return <HomeApp role={role} data={data} name={name} today={today} />;
}
