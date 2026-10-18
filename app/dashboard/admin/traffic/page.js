import { notFound } from "next/navigation";
import Link from "next/link";
import { getAdmin } from "../../../../lib/admin";
import { formatCount } from "../../../../lib/analytics";
import { TRAFFIC_RULES, TRAFFIC_PERIODS, loadTraffic, loadTrafficSamples, periodFrom } from "../../../../lib/traffic";

export const dynamic = "force-dynamic";
export const metadata = { title: "Traffic" };

const LEVEL = { high: "Look closely", watch: "Worth a look", few: "Too few views to say", ok: "—" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const percent = (value) => (value > 0 && value < 0.1 ? `${(value * 100).toFixed(1)}%` : `${Math.round(value * 100)}%`);
const when = (iso) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";
const href = (days, game) => `/dashboard/admin/traffic?days=${days}${game ? `&game=${game}` : ""}`;

export default async function TrafficPage({ searchParams }) {
  const admin = await getAdmin();
  if (!admin) notFound();
  const params = await searchParams;
  const days = periodFrom(params?.days);
  const gameId = typeof params?.game === "string" && UUID.test(params.game) ? params.game : null;

  const [traffic, samples] = await Promise.all([
    loadTraffic(() => admin.service.rpc("traffic_by_game", { p_days: days })),
    gameId ? loadTrafficSamples(() => admin.service.rpc("traffic_samples", { p_game: gameId, p_days: days, p_limit: 50 })) : Promise.resolve(null),
  ]);
  const picked = gameId ? traffic.games.find((game) => game.id === gameId) : null;

  return (
    <>
      <div className="main-head">
        <h1>Traffic</h1>
      </div>
      <p className="lede">
        Views that look wrong, by game. These are only marks: nothing is hidden or taken off any report, and the numbers developers
        and advertisers see are the same with or without them. A mark is a reason to look, not proof; you decide what to do, if anything.
        Views of a developer&apos;s own creatives are never marked.
      </p>

      {traffic.missing ? (
        <p className="notice">
          Run <code>supabase/migrations/0040_suspicious_traffic.sql</code> in the Supabase SQL editor to turn this page on.
        </p>
      ) : (
        <>
          <div className="cp-seg" role="group" aria-label="Period" style={{ marginBottom: 12 }}>
            {TRAFFIC_PERIODS.map((option) => (
              <Link key={option} href={href(option, gameId)} className="cp-seg-link" aria-current={option === days ? "page" : undefined}>
                {option} days
              </Link>
            ))}
          </div>

          {traffic.empty ? (
            <div className="empty"><p style={{ margin: "0 auto" }}>No views in this period.</p></div>
          ) : (
            <>
              <div className="panel" style={{ marginBottom: "1.5rem" }}>
                <h2 style={{ marginBottom: "0.5rem" }}>
                  {formatCount(traffic.totals.flagged)} of {formatCount(traffic.totals.views)} views marked ({percent(traffic.totals.share)})
                </h2>
                <table>
                  <tbody>
                    {traffic.totals.rules.map((rule) => (
                      <tr key={rule.id}>
                        <td>{rule.label}<div className="muted-line">{rule.hint}</div></td>
                        <td style={{ textAlign: "right" }}>{formatCount(rule.count)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="muted-line" style={{ marginTop: 8 }}>A view that breaks two rules counts once in the total and once under each rule.</p>
              </div>

              <div className="panel" style={{ padding: 0 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Game</th>
                      <th style={{ textAlign: "right" }}>Views</th>
                      <th style={{ textAlign: "right" }}>Marked</th>
                      <th>Mostly</th>
                      <th>Verdict</th>
                    </tr>
                  </thead>
                  <tbody>
                    {traffic.games.map((game) => {
                      const top = TRAFFIC_RULES.filter((rule) => game.rules[rule.id] > 0).sort((a, b) => game.rules[b.id] - game.rules[a.id])[0];
                      return (
                        <tr key={game.id} aria-current={game.id === gameId ? "true" : undefined}>
                          <td>
                            {game.flagged > 0 ? <Link href={href(days, game.id)}>{game.name}</Link> : game.name}
                          </td>
                          <td style={{ textAlign: "right" }}>{formatCount(game.views)}</td>
                          <td style={{ textAlign: "right" }}>
                            {formatCount(game.flagged)}
                            {game.flagged > 0 && <div className="muted-line">{percent(game.share)}</div>}
                          </td>
                          <td>{top ? top.label : "—"}</td>
                          <td>{LEVEL[game.level]}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {samples && (
            <div className="panel" style={{ marginTop: "1.5rem", padding: 0 }}>
              <h2 style={{ margin: "1rem 1rem 0.5rem" }}>{picked?.name ?? "Game"}: latest marked views</h2>
              {samples.missing || samples.samples.length === 0 ? (
                <p className="muted-line" style={{ margin: "0 1rem 1rem" }}>Nothing marked in this period.</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Received</th>
                      <th>Stamped by the SDK</th>
                      <th>Placement</th>
                      <th style={{ textAlign: "right" }}>Seconds</th>
                      <th style={{ textAlign: "right" }}>Distance / angle</th>
                      <th>Session / player</th>
                      <th>Why</th>
                    </tr>
                  </thead>
                  <tbody>
                    {samples.samples.map((sample) => (
                      <tr key={sample.id}>
                        <td>{when(sample.receivedAt)}</td>
                        <td>{when(sample.occurredAt)}</td>
                        <td>{sample.placement ?? "—"}</td>
                        <td style={{ textAlign: "right" }}>{sample.seconds ?? "—"}</td>
                        <td style={{ textAlign: "right" }}>
                          {sample.distance == null ? "—" : `${sample.distance} m`} / {sample.angle == null ? "—" : `${sample.angle}°`}
                        </td>
                        <td>
                          <code>{String(sample.session).slice(0, 12)}</code>
                          <div className="muted-line">{sample.player ? String(sample.player).slice(0, 12) : "no player ID"}</div>
                        </td>
                        <td>{sample.rules.map((rule) => rule.label).join(", ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}
