import { createClient } from "@supabase/supabase-js";

// The SDK authenticates as a game, not as a person, so these routes run with the
// service role and do their own ownership checks. The service key must never be
// exposed to the browser: it bypasses row-level security by design.
export function serviceClient() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
}

export function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
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
    .eq("api_key", apiKey)
    .maybeSingle();

  if (error) {
    return { error: json({ error: "Could not verify the API key." }, 503) };
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
