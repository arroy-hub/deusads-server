import { createClient } from "@supabase/supabase-js";

// The SDK authenticates as a game, not as a person, so these routes run with the
// service role and do their own ownership checks. The service key must never be
// exposed to the browser: it bypasses row-level security by design.
export function serviceClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Misconfiguration is the likeliest failure on a fresh deployment, and an
  // unhandled throw here surfaces as a bare 500 with nothing to act on.
  if (!url || !key) {
    throw new ConfigError(
      "Server is missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY."
    );
  }
  if (!/^https:\/\/[\w-]+\.supabase\.co\/?$/.test(url.trim())) {
    throw new ConfigError(
      "SUPABASE_URL does not look like a Supabase project URL."
    );
  }
  if (!/^[\x20-\x7E]+$/.test(key)) {
    // A pasted placeholder or a stray non-ASCII character fails deep inside the
    // HTTP layer otherwise, with a message that points nowhere useful.
    throw new ConfigError(
      "SUPABASE_SERVICE_ROLE_KEY contains characters that cannot go in a header."
    );
  }

  return createClient(url.trim(), key, { auth: { persistSession: false } });
}

export class ConfigError extends Error {}

export function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

/**
 * Wraps a route so an unexpected throw becomes a readable response instead of a
 * bare 500. Configuration problems are named explicitly; anything else is logged
 * for the Vercel log and reported generically.
 */
export function guarded(handler) {
  return async (request, context) => {
    try {
      return await handler(request, context);
    } catch (error) {
      if (error instanceof ConfigError) {
        console.error("[DeusADS] configuration:", error.message);
        return json({ error: error.message }, 500);
      }
      console.error("[DeusADS] unhandled:", error);
      return json(
        { error: "The server hit an unexpected error. Check the Vercel logs." },
        500
      );
    }
  };
}

/**
 * Resolves the X-DeusADS-Key header to a game.
 * Returns { game } on success or { error } with a ready-made response.
 */
export async function authenticateGame(request) {
  const apiKey = request.headers.get("x-deusads-key");

  if (!apiKey) {
    return { error: json({ error: "Missing X-DeusADS-Key header." }, 401) };
  }

  const db = serviceClient();
  const { data: game, error } = await db
    .from("games")
    .select("id, owner_id, name")
    .eq("api_key", apiKey.trim())
    .maybeSingle();

  if (error) {
    // A missing table means the schema was never run; say so rather than
    // reporting a generic outage.
    const message = /relation .* does not exist|schema cache/i.test(error.message ?? "")
      ? "The database has no DeusADS tables yet. Run the schema migration in Supabase."
      : "Could not verify the API key.";
    console.error("[DeusADS] auth lookup failed:", error.message);
    return { error: json({ error: message }, 503) };
  }

  if (!game) {
    // Deliberately vague: a precise message would let someone probe for valid keys.
    return { error: json({ error: "Unknown API key." }, 401) };
  }

  return { game, db };
}

/** Public URL of a creative in Supabase Storage. */
export function creativeUrl(db, storagePath) {
  const { data } = db.storage.from("creatives").getPublicUrl(storagePath);
  return data.publicUrl;
}

/**
 * True when a query failed because the database is older than the code: a column
 * or unique index from a later migration is missing. Routes then fall back to the
 * previous behaviour, so deploying the code before running the migration does not
 * take the SDK endpoints down.
 */
export function isSchemaOutdated(error) {
  if (!error) return false;
  return ["42703", "42P10", "PGRST204", "PGRST200"].includes(error.code);
}

let warnedOutdated = false;
export function warnSchemaOutdated(where) {
  if (warnedOutdated) return;
  warnedOutdated = true;
  console.warn(
    `[DeusADS] ${where}: database schema is behind the code. ` +
      "Run supabase/migrations/0002_placement_sync_and_events.sql in the Supabase SQL editor."
  );
}

/** Logs a database error with the fields Supabase returns, for the Vercel log. */
export function logDbError(where, error) {
  console.error(`[DeusADS] ${where}:`, {
    code: error?.code,
    message: error?.message,
    details: error?.details,
    hint: error?.hint,
  });
}
