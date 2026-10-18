import { cleanLayout } from "./deck-layout.js";

/** The signed-in person's saved board layout, or null (no row yet, or migration 0042 not applied). `db` is the person's own client. */
export async function loadDeckLayout(db, kind) {
  try {
    const { data, error } = await db.from("dashboard_layouts").select("layout").eq("kind", kind).maybeSingle();
    if (error || !data) return null;
    return cleanLayout(data.layout);
  } catch {
    return null;
  }
}
