// Retention and daily players (migration 0039): do players come back, and how many play each day. A player is an
// anonymous install ID; he is new on the day of his first session the SDK announced (SDK 0.10+). Developer only.
// Pure, so the rules are tested without a database (test/retention.test.mjs).

const number = (value) => Number(value ?? 0) || 0;
const DAY_MS = 86_400_000;

const dayNumber = (iso) => Math.floor(Date.parse(`${String(iso).slice(0, 10)}T00:00:00Z`) / DAY_MS);
const isoOf = (day) => new Date(day * DAY_MS).toISOString().slice(0, 10);

/** Days after the first session at which a return is counted (a session on exactly that day). */
export const RETURN_DAYS = [1, 7, 30];

/**
 * Rows of game_retention() (one per day of first sessions) -> the share of players who came back on day 1, 7 and 30.
 * A cohort counts for day N only once day N has happened (today is a UTC date, yyyy-mm-dd): a player first seen
 * yesterday cannot have returned on day 7 yet, and must not drag the figure down.
 * { newPlayers, d1, d7, d30 } where each is { players, returned, rate, cohorts }; rate is null when no cohort is old enough.
 */
export function retentionFigures(rows, today) {
  const now = dayNumber(today);
  const figures = { newPlayers: (rows ?? []).reduce((sum, row) => sum + number(row.players), 0) };
  for (const n of RETURN_DAYS) {
    const old = (rows ?? []).filter((row) => dayNumber(row.cohort) + n <= now);
    const players = old.reduce((sum, row) => sum + number(row.players), 0);
    const returned = old.reduce((sum, row) => sum + number(row[`d${n}`]), 0);
    figures[`d${n}`] = { players, returned, rate: players > 0 ? returned / players : null, cohorts: old.length };
  }
  return figures;
}

/**
 * Rows of game_dau() -> one entry per day of the window (quiet days as zeros) and the figures over them.
 * window is { from, to } as yyyy-mm-dd. average counts every day of the window, quiet ones too.
 */
export function dailyPlayers(rows, window) {
  const byDay = new Map((rows ?? []).map((row) => [String(row.day).slice(0, 10), row]));
  const start = dayNumber(window.from);
  const end = dayNumber(window.to);
  const days = [];
  for (let day = start; day <= end && days.length < 400; day++) {
    const date = isoOf(day);
    const row = byDay.get(date);
    days.push({ date, players: number(row?.players), sessions: number(row?.sessions), newPlayers: number(row?.new_players) });
  }
  const total = days.reduce((sum, day) => sum + day.players, 0);
  const peak = days.reduce((best, day) => (day.players > (best?.players ?? 0) ? day : best), null);
  return {
    days,
    average: days.length > 0 ? total / days.length : null,
    peak: peak ? { date: peak.date, players: peak.players } : null,
    sessions: days.reduce((sum, day) => sum + day.sessions, 0),
    newPlayers: days.reduce((sum, day) => sum + day.newPlayers, 0),
    empty: total === 0,
  };
}

/**
 * Developer: { missing, retention, daily }. Two calls (game_retention and game_dau); missing = migration 0039 is not
 * applied, so the panel stays off.
 */
export async function loadRetention({ callRetention, callDaily, window, today }) {
  const [retention, daily] = await Promise.all([callRetention(), callDaily()]);
  const failed = retention.error ?? daily.error;
  if (failed) return { missing: true, error: failed, retention: retentionFigures([], today), daily: dailyPlayers([], window) };
  return { missing: false, retention: retentionFigures(retention.data, today), daily: dailyPlayers(daily.data, window) };
}
