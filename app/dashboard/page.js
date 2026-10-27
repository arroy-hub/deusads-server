import Link from "next/link";
import { redirect } from "next/navigation";
import { getMember } from "../../lib/admin";
import { loadBookings } from "../../lib/bookings-data";
import { isSchemaOutdated } from "../../lib/api";
import { developerSteps } from "../../lib/home-rules";
import { loadOverview } from "../../lib/advertiser-data";
import { parseRange } from "../../lib/reports";
import AdvertiserOverview from "./advertiser-overview";
import { homeFor } from "../../lib/nav";
import { loadDeckLayout } from "../../lib/deck-layout-data";
import { userClient } from "../../lib/supabase-server";
import WindowTop, { PlateIcon } from "./window-top";

export const dynamic = "force-dynamic";
export const metadata = { title: "Home" };

export default async function HomePage({ searchParams }) {
  const me = await getMember();
  if (!me) redirect("/login");
  if (me.role === "admin") redirect(homeFor("admin"));
  if (me.role !== "advertiser") return <DeveloperHome me={me} />;
  const query = await searchParams;
  return <AdvertiserHome me={me} days={parseRange(query?.days)} />;
}

async function DeveloperHome({ me }) {
  const { service, user } = me;
  const read = (columns) =>
    service.from("games").select(`id, name, placements(${columns})`).eq("owner_id", user.id).order("created_at", { ascending: true });
  let { data: games, error } = await read("id, removed_at, open_to_advertisers");
  if (isSchemaOutdated(error)) ({ data: games } = await read("id, removed_at"));

  const rows = (games ?? []).map((game) => {
    const live = (game.placements ?? []).filter((placement) => !placement.removed_at);
    return {
      id: game.id,
      name: game.name,
      placements: live.length,
      open: live.filter((placement) => placement.open_to_advertisers).length,
    };
  });
  const { bookings } = await loadBookings(service, (query) => query.eq("developer_id", user.id));
  // Bookings approve themselves; nothing waits for the developer.
  const waiting = [];
  const approved = bookings.filter((booking) => booking.status === "approved").length;

  const steps = developerSteps({
    games: rows.length,
    placements: rows.reduce((sum, row) => sum + row.placements, 0),
    open: rows.reduce((sum, row) => sum + row.open, 0),
    approved,
  });
  const empty = rows.filter((row) => row.placements === 0);

  return (
    <div className="wt-win">
      <WindowTop
        title="Home"
        icon={<PlateIcon name="home" />}
        sub="Your starting point: the next step to get ads running in your games, what needs your attention, and a summary of each game."
        actions={<Link href="/dashboard/games" className="button">{rows.length ? "My games" : "Add a game"}</Link>}
      />

      <section className="panel" aria-labelledby="steps-title">
        <h2 id="steps-title">Get a game earning</h2>
        <ol className="steps">
          {steps.map((step, index) => (
            <li key={step.key} className={`step step-${step.state}`}>
              <span className="step-state">{step.state === "done" ? "DONE" : step.state === "next" ? "NEXT" : "LATER"}</span>
              <strong>
                {index + 1}. {step.title}
              </strong>
              <span className="step-hint">{step.hint}</span>
              {step.state === "next" && <Link href={step.href}>Go there</Link>}
            </li>
          ))}
        </ol>
      </section>

      <div className="home-grid">
        <section className="panel" aria-labelledby="attention-title">
          <h2 id="attention-title">Needs your attention</h2>
          {waiting.slice(0, 5).map((booking) => (
            <div className="todo" key={booking.id}>
              <div>
                <strong>
                  {booking.advertiser} wants {booking.game} · {booking.placement}
                </strong>
                <div className="todo-sub">
                  {booking.campaign}
                  {booking.dates ? ` · ${booking.dates}` : ""}
                </div>
              </div>
              <Link href="/dashboard/games" className="button">
                Review
              </Link>
            </div>
          ))}
          {empty.map((row) => (
            <div className="todo" key={row.id}>
              <div>
                <strong>{row.name} has no placements yet</strong>
                <div className="todo-sub">Press Send placements in Unity to report them.</div>
              </div>
              <Link href={`/dashboard/g/${row.id}`} className="button button-quiet">
                Open game
              </Link>
            </div>
          ))}
          {waiting.length === 0 && empty.length === 0 && <p className="todo-sub">All clear.</p>}
        </section>

        <section className="panel" aria-labelledby="games-title">
          <h2 id="games-title">My games</h2>
          {rows.length === 0 ? (
            <p className="todo-sub">No games yet. Add one to get a key for the Unity SDK.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Game</th>
                  <th className="num">Placements</th>
                  <th className="num">Open to advertisers</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Link href={`/dashboard/g/${row.id}`}>{row.name}</Link>
                    </td>
                    <td className="num">{row.placements}</td>
                    <td className="num">
                      {row.open} of {row.placements}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}

async function AdvertiserHome({ me, days }) {
  const data = await loadOverview(me.service, me, days);
  const deckLayout = await loadDeckLayout(await userClient(), "advertiser");
  return <AdvertiserOverview data={data} basePath="/dashboard" deckLayout={deckLayout} />;
}
