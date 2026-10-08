import Link from "next/link";
import { redirect } from "next/navigation";
import { getMember } from "../../lib/admin";
import { loadBookings } from "../../lib/bookings-data";
import { isSchemaOutdated } from "../../lib/api";
import { developerSteps, advertiserPipeline } from "../../lib/home-rules";
import { homeFor } from "../../lib/nav";

export const dynamic = "force-dynamic";
export const metadata = { title: "Home" };

export default async function HomePage() {
  const me = await getMember();
  if (!me) redirect("/login");
  if (me.role === "admin") redirect(homeFor("admin"));
  return me.role === "advertiser" ? <AdvertiserHome me={me} /> : <DeveloperHome me={me} />;
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
  const waiting = bookings.filter((booking) => booking.status === "pending" && booking.developer === "pending");
  const approved = bookings.filter((booking) => booking.status === "approved").length;

  const steps = developerSteps({
    games: rows.length,
    placements: rows.reduce((sum, row) => sum + row.placements, 0),
    open: rows.reduce((sum, row) => sum + row.open, 0),
    approved,
  });
  const empty = rows.filter((row) => row.placements === 0);

  return (
    <>
      <div className="main-head">
        <h1>Home</h1>
        <Link href="/dashboard/games" className="button">
          {rows.length ? "My games" : "Add a game"}
        </Link>
      </div>
      <p className="lede">Your path from a new game to ads running in it.</p>

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
              <Link href="/dashboard/requests" className="button">
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
    </>
  );
}

async function AdvertiserHome({ me }) {
  const { service, user } = me;
  const [{ data: creatives }, { data: campaigns }, { bookings }] = await Promise.all([
    service.from("creatives").select("id, status, review_note, name").eq("owner_id", user.id),
    service.from("campaigns").select("id, name").eq("advertiser_id", user.id).order("created_at", { ascending: false }),
    loadBookings(service, (query) => query.eq("advertiser_id", user.id)),
  ]);
  const pipeline = advertiserPipeline({ creatives: creatives ?? [], campaigns: campaigns ?? [], bookings });
  const rejected = (creatives ?? []).filter((item) => item.status === "rejected");
  const drafts = (campaigns ?? []).filter((campaign) => !bookings.some((booking) => booking.campaignId === campaign.id));

  const stages = [
    ["1 · Creatives", pipeline.creatives, `${pipeline.waitingCreatives} waiting for review`],
    ["2 · Draft campaigns", pipeline.drafts, "No placements chosen"],
    ["3 · Waiting", pipeline.waiting, "For approval or start date"],
    ["4 · Live", pipeline.live, "Showing in games now"],
    ["5 · Finished", pipeline.finished, "See Reports"],
  ];

  return (
    <>
      <div className="main-head">
        <h1>Home</h1>
        <Link href="/dashboard/advertising/new" className="button">
          Find placements
        </Link>
      </div>
      <p className="lede">From a creative to an ad running in a game.</p>

      <section className="panel" aria-labelledby="pipeline-title">
        <h2 id="pipeline-title">Where your ads are</h2>
        <div className="stage-grid">
          {stages.map(([label, count, sub]) => (
            <div className="stage" key={label}>
              <div className="stage-label">{label.toUpperCase()}</div>
              <div className="stage-n">{count}</div>
              <div className="todo-sub">{sub}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="home-grid">
        <section className="panel" aria-labelledby="next-title">
          <h2 id="next-title">What to do next</h2>
          {(creatives ?? []).length === 0 && (
            <div className="todo">
              <div>
                <strong>Upload your first creative</strong>
                <div className="todo-sub">DeusADS reviews it before it can be booked.</div>
              </div>
              <Link href="/dashboard/creatives" className="button">
                Upload
              </Link>
            </div>
          )}
          {rejected.map((item) => (
            <div className="todo" key={item.id}>
              <div>
                <strong>{item.name} was rejected</strong>
                {item.review_note && <div className="todo-sub">Reason: {item.review_note}</div>}
              </div>
              <Link href="/dashboard/creatives" className="button button-quiet">
                Upload a new one
              </Link>
            </div>
          ))}
          {pipeline.approvedCreatives > 0 && drafts.map((campaign) => (
            <div className="todo" key={campaign.id}>
              <div>
                <strong>{campaign.name} has no placements</strong>
                <div className="todo-sub">Pick where it should run.</div>
              </div>
              <Link href="/dashboard/advertising/new" className="button">
                Find placements
              </Link>
            </div>
          ))}
          {pipeline.approvedCreatives > 0 && (campaigns ?? []).length === 0 && (
            <div className="todo">
              <div>
                <strong>Your creative is approved</strong>
                <div className="todo-sub">Choose placements to start a campaign.</div>
              </div>
              <Link href="/dashboard/advertising/new" className="button">
                Find placements
              </Link>
            </div>
          )}
          {(creatives ?? []).length > 0 && rejected.length === 0 && pipeline.approvedCreatives === 0 && (
            <p className="todo-sub">Your creatives are waiting for review. We will notify you.</p>
          )}
        </section>

        <section className="panel" aria-labelledby="campaigns-title">
          <h2 id="campaigns-title">Campaigns</h2>
          {(campaigns ?? []).length === 0 ? (
            <p className="todo-sub">No campaigns yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th>Status</th>
                  <th className="num">Placements</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.slice(0, 6).map((campaign) => {
                  const mine = bookings.filter((booking) => booking.campaignId === campaign.id);
                  const status = mine.some((booking) => booking.status === "approved" && String(booking.label).startsWith("Live"))
                    ? "Live"
                    : mine.some((booking) => booking.status === "pending")
                      ? "Waiting for approval"
                      : mine.length
                        ? "Finished"
                        : "Draft";
                  return (
                    <tr key={campaign.id}>
                      <td>
                        <Link href="/dashboard/advertising">{campaign.name}</Link>
                      </td>
                      <td>{status}</td>
                      <td className="num">{mine.length}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </>
  );
}
